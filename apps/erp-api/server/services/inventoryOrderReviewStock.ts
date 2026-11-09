import type { ClientSession } from "mongoose";
import type {
    InventoryReviewMaterial,
    InventoryReviewOrder,
    InventoryReviewProduct,
    InventoryReviewStockPosition,
} from "~~/shared/types/inventoryReview";
import { InventoryWarehouse, InventoryLocation } from "~~/server/models/inventoryBase.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryStock, InventoryStockLedger, useInventoryStockModel } from "~~/server/models/inventoryStock.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { ProductionRequisition } from "~~/server/models/productionExecution.model";
import { InventoryHttpError, isValidObjectId, toObjectId, toText } from "./inventory";
import { normalizeStockQuantity } from "./inventoryStockMath";

type ReviewStockItem = InventoryReviewProduct | InventoryReviewMaterial;

function fail(message: string, status = 409): never {
    throw new InventoryHttpError(status, status, message);
}

function stockKey(warehouseId: unknown, locationId: unknown) {
    return `${toText(warehouseId)}/${toText(locationId)}`;
}

async function loadPositions(productIds: string[], session?: ClientSession) {
    const ids = [...new Set(productIds.filter((id) => isValidObjectId(id)))];
    const result = new Map<string, InventoryReviewStockPosition[]>(ids.map((id) => [id, []]));
    if (!ids.length) return result;
    const stockQuery = InventoryStock.find({ productId: { $in: ids.map(toObjectId) }, _isDeleted: { $ne: true } })
        .select("_id productId warehouseId locationId quantity lockedQuantity").sort({ _id: 1 }).lean();
    const productQuery = InventoryProduct.find({ _id: { $in: ids.map(toObjectId) }, _isDeleted: { $ne: true } })
        .select("_id warehouseId locationId").lean();
    if (session) {
        stockQuery.session(session);
        productQuery.session(session);
    }
    // MongoDB 同一事务 session 中的查询顺序执行。
    const stocks = await stockQuery as any[];
    const products = await productQuery as any[];
    const warehouseIds = [...new Set([...stocks, ...products].map((row) => toText(row.warehouseId)).filter(Boolean))];
    const locationIds = [...new Set([...stocks, ...products].map((row) => toText(row.locationId)).filter(Boolean))];
    const warehouseQuery = InventoryWarehouse.find({ _id: { $in: warehouseIds.map(toObjectId) }, _isDeleted: { $ne: true } })
        .select("_id name code includeInAvailable enableLocation").lean();
    const locationQuery = InventoryLocation.find({ _id: { $in: locationIds.map(toObjectId) }, _isDeleted: { $ne: true } })
        .select("_id warehouseId name code").lean();
    if (session) {
        warehouseQuery.session(session);
        locationQuery.session(session);
    }
    const warehouses = await warehouseQuery as any[];
    const locations = await locationQuery as any[];
    const warehouseMap = new Map(warehouses.map((row) => [String(row._id), row]));
    const locationMap = new Map(locations.map((row) => [String(row._id), row]));
    for (const row of stocks) {
        const warehouseId = toText(row.warehouseId);
        const locationId = toText(row.locationId);
        const warehouse = warehouseMap.get(warehouseId);
        const location = locationMap.get(locationId);
        result.get(String(row.productId))?.push({
            id: String(row._id), warehouseId, locationId,
            warehouseName: warehouse?.name || warehouse?.code || (warehouseId ? "仓库已删除" : "未设置仓库"),
            locationName: location?.name || location?.code || (locationId ? "库位已删除" : "未设置库位"),
            quantity: normalizeStockQuantity(row.quantity),
            lockedQuantity: normalizeStockQuantity(row.lockedQuantity),
            checkedQuantity: null,
            includeInAvailable: warehouseId ? Boolean(warehouse && warehouse.includeInAvailable !== false) : true,
        });
    }
    // 零库存仅提供产品资料中已配置且有效的位置，不能凭空选择仓库或库位。
    for (const product of products) {
        const productId = String(product._id);
        if (result.get(productId)?.length) continue;
        const warehouseId = toText(product.warehouseId);
        const locationId = toText(product.locationId);
        const warehouse = warehouseMap.get(warehouseId);
        const location = locationMap.get(locationId);
        if (!warehouse || (warehouse.enableLocation === true && !locationId)) continue;
        if (locationId && (!location || toText(location.warehouseId) !== warehouseId)) continue;
        result.set(productId, [{
            id: `default:${productId}:${warehouseId}:${locationId}`, warehouseId, locationId,
            warehouseName: warehouse.name || warehouse.code || "",
            locationName: location?.name || location?.code || "未设置库位",
            quantity: 0, lockedQuantity: 0, checkedQuantity: null,
            includeInAvailable: warehouse.includeInAvailable !== false,
        }]);
    }
    return result;
}

export const loadInventoryReviewPositions = (productIds: string[], session?: ClientSession) => loadPositions(productIds, session);

function collectItems(snapshot: InventoryReviewOrder) {
    const items = new Map<string, ReviewStockItem>();
    function add(item: ReviewStockItem) {
        const productId = toText(item.productId);
        if (!isValidObjectId(productId)) fail(`${item.productCode}产品标识无效`, 400);
        if (!Array.isArray(item.positions)) fail(`${item.productCode}缺少库位核对明细，请重新打开复核`);
        const positions = [...item.positions].sort((a, b) => a.id.localeCompare(b.id));
        const seen = new Set<string>();
        let checkedTotal = 0;
        for (const position of positions) {
            if (!position.id || seen.has(position.id)) fail(`${item.productCode}库位重复或无效`, 400);
            seen.add(position.id);
            if (typeof position.checkedQuantity !== "number" || !Number.isFinite(position.checkedQuantity) || position.checkedQuantity < 0) {
                fail(`${item.productCode}请填写各库位有效实盘数量`, 400);
            }
            checkedTotal = normalizeStockQuantity(checkedTotal + normalizeStockQuantity(position.checkedQuantity));
        }
        if (typeof item.checkedQuantity !== "number" || !Number.isFinite(item.checkedQuantity)
            || item.checkedQuantity < 0 || normalizeStockQuantity(item.checkedQuantity) !== checkedTotal) {
            fail(`${item.productCode}复核总量与逐库位合计不一致`, 400);
        }
        const previous = items.get(productId);
        if (previous) {
            const previousPositions = [...(previous.positions || [])].sort((a, b) => a.id.localeCompare(b.id));
            const edits = (rows: InventoryReviewStockPosition[]) => rows.map((row) => ({
                id: row.id, warehouseId: row.warehouseId, locationId: row.locationId,
                quantity: row.quantity, lockedQuantity: row.lockedQuantity,
                checkedQuantity: normalizeStockQuantity(row.checkedQuantity), includeInAvailable: row.includeInAvailable,
            }));
            if (JSON.stringify(edits(previousPositions)) !== JSON.stringify(edits(positions))) {
                fail(`${item.productCode}在不同产品或 BOM 中的库位核对不一致`, 400);
            }
        } else {
            items.set(productId, item);
        }
    }
    function materials(rows: InventoryReviewMaterial[]) {
        for (const material of rows) {
            add(material);
            materials(material.children || []);
        }
    }
    for (const product of snapshot.products) {
        add(product);
        const bom = product.boms.find((row) => row.id === product.activeBomId);
        if (bom) materials(bom.materials);
    }
    return items;
}

async function releaseReviewReservations(salesOrderId: string, actor: string, session: ClientSession) {
    const orderId = toObjectId(salesOrderId);
    const production = await ProductionOrder.exists({ salesOrderId: orderId, status: { $nin: ["草稿", "已取消"] } }).session(session);
    const requisition = await ProductionRequisition.exists({ salesOrderId: orderId, status: { $ne: "已取消" } }).session(session);
    if (production || requisition) fail("订单已经进入生产或领料，不能通过复核重新分配库存");
    const reservations = await SalesOrderStockReservation.find({ salesOrderId: orderId }).session(session).lean() as any[];
    for (const reservation of reservations) {
        if (Number(reservation.consumedQuantity || 0) > 0 || Number(reservation.productionAllocatedQuantity || 0) > 0) {
            fail("订单预占已用于出库或生产领料，不能重新复核占用");
        }
    }
    for (const reservation of reservations) {
        if (reservation.status !== "active") continue;
        const remaining = normalizeStockQuantity(Math.max(Number(reservation.reservedQuantity || 0)
            - Number(reservation.consumedQuantity || 0) - Number(reservation.releasedQuantity || 0), 0));
        if (remaining > 0) {
            const result = await InventoryStock.updateOne({
                productId: reservation.stockProductId,
                warehouseId: reservation.warehouseId || null,
                locationId: reservation.locationId || null,
                _isDeleted: { $ne: true },
                $expr: { $gte: ["$lockedQuantity", remaining] },
            }, { $inc: { lockedQuantity: -remaining }, $set: { updatedBy: actor } }, { session });
            if (result.modifiedCount !== 1) fail("本订单锁定库存已变化，复核占用重建已回滚");
        }
        const changed = await SalesOrderStockReservation.updateOne({
            _id: reservation._id, status: "active", reservedQuantity: reservation.reservedQuantity,
            consumedQuantity: reservation.consumedQuantity, releasedQuantity: reservation.releasedQuantity,
        }, { $set: {
            status: "released", releasedQuantity: normalizeStockQuantity(reservation.reservedQuantity), updatedBy: actor,
        } }, { session });
        if (changed.matchedCount !== 1) fail("订单预占记录已变化，请重新打开复核");
    }
}

function assertPositionsMatch(item: ReviewStockItem, actual: InventoryReviewStockPosition[]) {
    const expected = item.positions || [];
    if (expected.length !== actual.length) fail(`${item.productCode}库存库位已变化，请重新打开复核`);
    const byId = new Map(actual.map((row) => [row.id, row]));
    for (const position of expected) {
        const current = byId.get(position.id);
        if (!current || current.warehouseId !== position.warehouseId || current.locationId !== position.locationId
            || current.quantity !== position.quantity || current.lockedQuantity !== position.lockedQuantity
            || current.includeInAvailable !== position.includeInAvailable) {
            fail(`${item.productCode}库位库存或锁定量已变化，请重新打开复核`);
        }
    }
}

export async function reconcileInventoryReviewStock(snapshot: InventoryReviewOrder, actor: string, session: ClientSession): Promise<void> {
    if (!session?.inTransaction()) fail("仓库复核库存同步必须在事务中执行", 500);
    const items = collectItems(snapshot);
    const before = await loadPositions([...items.keys()], session);
    for (const [productId, item] of items) assertPositionsMatch(item, before.get(productId) || []);
    await releaseReviewReservations(snapshot.id, actor, session);
    const afterRelease = await loadPositions([...items.keys()], session);
    const stockModel = useInventoryStockModel();
    const changedAt = new Date();
    // 原基线保留在复核快照内；库存调整和台账由调用方的同一事务保护。
    for (const [productId, item] of items) {
        const actual = afterRelease.get(productId) || [];
        const actualMap = new Map(actual.map((row) => [row.id, row]));
        for (const position of item.positions || []) {
            const current = actualMap.get(position.id);
            if (!current) fail(`${item.productCode}库存库位已变化，请重新打开复核`);
            const checked = normalizeStockQuantity(position.checkedQuantity);
            if (checked < current.lockedQuantity) fail(`${item.productCode}实盘数量少于其他订单已锁定数量，请先处理库存占用`);
            const delta = normalizeStockQuantity(checked - current.quantity);
            // 无差异也要校验正库存位置，否则会把无法参与占用的孤立库存误报为可用。
            if (checked === 0 && current.quantity === 0) continue;
            if (!isValidObjectId(current.warehouseId)) fail(`${item.productCode}正库存未配置有效仓库，请先维护库存位置`);
            const warehouse = await InventoryWarehouse.findOne({
                _id: toObjectId(current.warehouseId), _isDeleted: { $ne: true },
            }).select("_id enableLocation").session(session).lean() as any;
            if (!warehouse) fail(`${item.productCode}库存仓库已失效，请先维护库存位置`);
            if (warehouse.enableLocation === true && !current.locationId) {
                fail(`${item.productCode}库存仓库启用库位，请先维护有效库位`);
            }
            if (current.locationId) {
                const location = await InventoryLocation.findOne({
                    _id: toObjectId(current.locationId), warehouseId: warehouse._id, _isDeleted: { $ne: true },
                }).select("_id").session(session).lean();
                if (!location) fail(`${item.productCode}库存库位已失效或不属于当前仓库，请先维护库存位置`);
            }
            const input = {
                productId, warehouseId: current.warehouseId, locationId: current.locationId,
                quantity: Math.abs(delta),
            };
            const metadata = await stockModel.buildInboundItemSnapshot(input, session, { preservePosition: true });
            if (toText(metadata.warehouseId) !== current.warehouseId || toText(metadata.locationId) !== current.locationId) {
                fail(`${item.productCode}实际库位与产品配置不一致，不能自动改写其他位置`);
            }
            if (delta === 0) continue;
            if (current.id.startsWith("default:")) {
                if (current.quantity !== 0 || current.lockedQuantity !== 0) fail("零库存位置已变化，请重新打开复核");
                try {
                    await InventoryStock.create([{
                        productId: toObjectId(productId), warehouseId: toObjectId(current.warehouseId),
                        locationId: toObjectId(current.locationId), quantity: checked, lockedQuantity: 0,
                        createdBy: actor, updatedBy: actor,
                    }], { session });
                } catch (error: any) {
                    if (error?.code === 11000) fail(`${item.productCode}库位库存已新增，请重新打开复核`);
                    throw error;
                }
            } else {
                const changed = await InventoryStock.updateOne({
                    _id: toObjectId(current.id), productId: toObjectId(productId),
                    warehouseId: toObjectId(current.warehouseId), locationId: toObjectId(current.locationId),
                    _isDeleted: { $ne: true }, quantity: current.quantity,
                    $expr: { $eq: [{ $ifNull: ["$lockedQuantity", 0] }, current.lockedQuantity] },
                }, { $set: { quantity: checked, updatedBy: actor } }, { session });
                if (changed.modifiedCount !== 1) fail(`${item.productCode}库位库存或占用已变化，库存同步已回滚`);
            }
            const incoming = delta > 0;
            const warehouseName = [current.warehouseId ? metadata.warehouseName : "", current.locationId ? metadata.locationName : ""].filter(Boolean).join(" / ");
            await InventoryStockLedger.create([{
                productId: toObjectId(productId), productCode: metadata.productCode,
                productName: metadata.productName, model: metadata.model,
                unitId: metadata.unitId, unitCode: metadata.unitCode, unitName: metadata.unitName,
                changedAt, relatedOrderNo: snapshot.code,
                businessType: incoming ? "仓库复核盘盈" : "仓库复核盘亏",
                direction: incoming ? "inbound" : "outbound", quantity: Math.abs(delta),
                [incoming ? "inboundWarehouseId" : "outboundWarehouseId"]: toObjectId(current.warehouseId),
                [incoming ? "inboundWarehouseName" : "outboundWarehouseName"]: warehouseName,
                [incoming ? "inboundLocationId" : "outboundLocationId"]: toObjectId(current.locationId),
                [incoming ? "inboundLocationName" : "outboundLocationName"]: metadata.locationName || "",
                sourceType: "warehouse-review", sourceId: toObjectId(snapshot.id), sourceNo: snapshot.code,
                operator: actor, remark: `库存总量 ${current.quantity} → ${checked}；${item.differenceReason || snapshot.remark || "仓库逐库位复核"}`,
                createdBy: actor, updatedBy: actor,
            }], { session });
        }
    }
}
