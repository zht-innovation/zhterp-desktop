import mongoose from "mongoose";
import type { ExecutionOrder, ExecutionSnapshot, ExecutionRequisition, ExecutionMaterial, ExecutionMaterialLoss, ExecutionReceipt } from "~~/shared/types/production-execution";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { ProductionRequisition, ProductionCompletion, ProductionMaterialLoss } from "~~/server/models/productionExecution.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import { InventoryWarehouse, InventoryLocation } from "~~/server/models/inventoryBase.model";
import { InventoryInbound } from "~~/server/models/inventoryInbound.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { PurchaseOrder } from "~~/server/models/purchaseOrder.model";
import { PurchaseOrderAllocation } from "~~/server/models/purchaseOrderAllocation.model";
import { PurchaseMaterialRequirement } from "~~/server/models/purchaseMaterialRequirement.model";
import { normalizeStockQuantity as qty } from "./inventoryStockMath";
import { allocationPending, getProductionMaterialState, materialLossLimit, supportedCompletionQuantity, unconsumedReturnLimit } from "./productionExecutionMath";
import { InventoryHttpError, toText as text, toObjectId, throwInventoryError } from "./inventory";
import { CODE } from "~~/server/utils/code";
import { resolveProductionReservationOrigins } from "./productionMaterialPool";
import { ensureSalesOrderCompletionState, hasSalesOrderCompletionRelease } from "./salesOrderCompletionState";
import { buildProductionPurchaseReceiptMap } from "./productionPurchaseReceipt";

export const executionId = (value: any) => text(value?.toString?.() || value);
export const executionSourceKey = (order: any) => order.sourceType === "stock" ? `stock:${executionId(order._id || order.id)}` : `order:${executionId(order.salesOrderId)}`;
const dateText = (value: any) => value ? new Date(value).toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" }) : "";
const withSession = (query: any, session?: mongoose.ClientSession) => session ? query.session(session) : query;

export const executionMaterials = (order: any) => {
    const materials = new Map<string, any>();
    for (const row of order.bomMaterials || []) {
        const key = executionId(row.productId);
        if (!materials.has(key)) materials.set(key, { ...row, productId: key, unitQty: 0 });
        materials.get(key).unitQty = qty(materials.get(key).unitQty + Number(row.unitQty || 0));
    }
    return [...materials.values()];
};

interface ExecutionMaterialSourceData {
    stocksByProduct: Map<string, any[]>;
    reservationsByPool: Map<string, any[]>;
}

const loadExecutionMaterialSourceData = async (orders: any[], productIds: string[], session?: mongoose.ClientSession): Promise<ExecutionMaterialSourceData> => {
    const data: ExecutionMaterialSourceData = { stocksByProduct: new Map(), reservationsByPool: new Map() };
    if (!productIds.length) return data;
    const materialIds = [...new Set(productIds)].map(toObjectId);
    const warehouses = await withSession(InventoryWarehouse.find({ _isDeleted: { $ne: true }, includeInAvailable: true }).select("_id").lean(), session) as any[];
    const stocks = await withSession(InventoryStock.find({ productId: { $in: materialIds }, warehouseId: { $in: warehouses.map((row) => row._id) }, locationId: { $ne: null }, _isDeleted: { $ne: true } }).sort({ createTime: 1, _id: 1 }).lean(), session) as any[];
    for (const stock of stocks) {
        const key = executionId(stock.productId);
        if (!data.stocksByProduct.has(key)) data.stocksByProduct.set(key, []);
        data.stocksByProduct.get(key)!.push(stock);
    }
    const salesOrderIds = new Set<string>();
    for (const order of orders) {
        if (order.sourceType !== "stock") salesOrderIds.add(executionId(order.salesOrderId));
    }
    if (!salesOrderIds.size) return data;
    const rawReservations = await withSession(SalesOrderStockReservation.find({
        salesOrderId: { $in: [...salesOrderIds].map(toObjectId) }, stockProductId: { $in: materialIds }, reservationType: "production-material", status: "active",
    }).sort({ createTime: 1, _id: 1 }).lean(), session) as any[];
    const reservations = await resolveProductionReservationOrigins(rawReservations, session);
    for (const reservation of reservations) {
        const key = `${executionId(reservation.salesOrderId)}:${executionId(reservation.demandProductId)}:${executionId(reservation.stockProductId)}`;
        if (!data.reservationsByPool.has(key)) data.reservationsByPool.set(key, []);
        data.reservationsByPool.get(key)!.push(reservation);
    }
    return data;
};

const materialSourcesFromData = (order: any, productId: string, data: ExecutionMaterialSourceData) => {
    const materialId = executionId(toObjectId(productId));
    const stocks = data.stocksByProduct.get(materialId) || [];
    const result: Array<{ stockId: any; reservationId: any; warehouseId: any; locationId: any; available: number }> = [];
    if (order.sourceType === "stock") {
        for (const stock of stocks) {
            const available = qty(Math.max(0, stock.quantity - stock.lockedQuantity));
            if (available > 0) result.push({ stockId: stock._id, reservationId: null, warehouseId: stock.warehouseId, locationId: stock.locationId, available });
        }
        return result;
    }
    const key = `${executionId(toObjectId(executionId(order.salesOrderId)))}:${executionId(order.rootProductId)}:${materialId}`;
    const reservations = data.reservationsByPool.get(key) || [];
    for (const reservation of reservations) {
        const stock = stocks.find((row) => executionId(row.warehouseId) === executionId(reservation.warehouseId) && executionId(row.locationId) === executionId(reservation.locationId));
        if (!stock) continue;
        const available = qty(Math.max(0, reservation.reservedQuantity - reservation.consumedQuantity - reservation.releasedQuantity - (reservation.productionAllocatedQuantity || 0)));
        if (available > 0) result.push({ stockId: stock._id, reservationId: reservation._id, warehouseId: stock.warehouseId, locationId: stock.locationId, available });
    }
    return result;
};

export const findExecutionMaterialSources = async (order: any, productId: string, session?: mongoose.ClientSession) => {
    const data = await loadExecutionMaterialSourceData([order], [productId], session);
    return materialSourcesFromData(order, productId, data);
};

const buildAllocatedInTransitMap = async (rows: any[], session?: mongoose.ClientSession) => {
    const result = new Map<string, number>();
    const salesOrderIds = new Set<string>();
    const rootProductIds = new Set<string>();
    const materialIds = new Set<string>();
    for (const row of rows) {
        if (row.sourceType !== "order" || !mongoose.isValidObjectId(row.salesOrderId)
            || !mongoose.isValidObjectId(row.rootProductId)) continue;
        salesOrderIds.add(executionId(row.salesOrderId));
        rootProductIds.add(executionId(row.rootProductId));
        for (const material of row.bomMaterials || []) {
            if (mongoose.isValidObjectId(material.productId)) materialIds.add(executionId(material.productId));
        }
    }
    if (!materialIds.size) return result;
    const requirements = await withSession(PurchaseMaterialRequirement.find({
        salesOrderId: { $in: [...salesOrderIds].map(toObjectId) },
        demandProductId: { $in: [...rootProductIds].map(toObjectId) }, productId: { $in: [...materialIds].map(toObjectId) },
    }).select("salesOrderId demandProductId productId").lean(), session) as any[];
    if (!requirements.length) return result;
    const allocations = await withSession(PurchaseOrderAllocation.find({
        requirementId: { $in: requirements.map((row) => row._id) },
        salesOrderId: { $in: [...salesOrderIds].map(toObjectId) }, productId: { $in: [...materialIds].map(toObjectId) },
    }).select("requirementId purchaseOrderId salesOrderId productId allocatedQuantity lockedAfterInboundQuantity").lean(), session) as any[];
    if (!allocations.length) return result;
    const purchaseOrders = await withSession(PurchaseOrder.find({
        _id: { $in: allocations.map((row) => row.purchaseOrderId) },
        _isDeleted: { $ne: true }, status: { $ne: "已完成" },
    }).select("_id").lean(), session) as any[];
    const purchaseOrderIds = new Set(purchaseOrders.map((row) => executionId(row._id)));
    const requirementMap = new Map(requirements.map((row) => [executionId(row._id), row]));
    for (const allocation of allocations) {
        if (!purchaseOrderIds.has(executionId(allocation.purchaseOrderId))) continue;
        const requirement = requirementMap.get(executionId(allocation.requirementId));
        if (!requirement || executionId(requirement.salesOrderId) !== executionId(allocation.salesOrderId)
            || executionId(requirement.productId) !== executionId(allocation.productId)) continue;
        const remaining = qty(Math.max(0, qty(allocation.allocatedQuantity) - qty(allocation.lockedAfterInboundQuantity)));
        if (remaining <= 0) continue;
        const key = `${executionId(allocation.salesOrderId)}:${executionId(requirement.demandProductId)}:${executionId(allocation.productId)}`;
        result.set(key, qty((result.get(key) || 0) + remaining));
    }
    return result;
};

export const buildExecutionOrders = async (
    rows: any[],
    session?: mongoose.ClientSession,
    options: { readOnly?: boolean } = {},
): Promise<ExecutionOrder[]> => {
    if (!rows.length) return [];
    const ids = rows.map((row) => row._id);
    const requests = await withSession(ProductionRequisition.find({ productionOrderId: { $in: ids } }).lean(), session) as any[];
    const completions = await withSession(ProductionCompletion.find({ productionOrderId: { $in: ids } }).lean(), session) as any[];
    const losses = await withSession(ProductionMaterialLoss.find({ productionOrderId: { $in: ids } }).lean(), session) as any[];
    const lossesByMaterial = new Map<string, number>();
    for (const loss of losses) {
        const key = `${executionId(loss.productionOrderId)}:${executionId(loss.productId)}`;
        lossesByMaterial.set(key, qty((lossesByMaterial.get(key) || 0) + loss.quantity));
    }
    const productIds = rows.flatMap((row) => [row.productId, ...(row.bomMaterials || []).map((material: any) => material.productId)]);
    const products = await withSession(InventoryProduct.find({ _id: { $in: productIds } }).select("image material categoryName").lean(), session) as any[];
    const allocatedInTransitMap = await buildAllocatedInTransitMap(rows, session);
    const materialIds = rows.flatMap((row) => (row.bomMaterials || []).map((material: any) => executionId(material.productId)));
    const materialSourceData = await loadExecutionMaterialSourceData(rows, materialIds, session);
    const purchaseReceiptMap = options.readOnly ? null : await buildProductionPurchaseReceiptMap(rows, session);
    const salesOrders = new Map<string, any>();
    for (const row of rows) {
        const salesOrderId = executionId(row.salesOrderId);
        if (row.sourceType === "stock" || !salesOrderId || salesOrders.has(salesOrderId)) continue;
        try {
            const order = await ensureSalesOrderCompletionState({ _id: salesOrderId }, session, { readOnly: options.readOnly });
            salesOrders.set(salesOrderId, order);
        } catch (error) {
            if (!(error instanceof InventoryHttpError) || error.status !== 404) throw error;
            salesOrders.set(salesOrderId, null);
        }
    }
    const result: ExecutionOrder[] = [];
    for (const row of rows) {
        const orderId = executionId(row._id);
        const orderRequests = requests.filter((request) => executionId(request.productionOrderId) === orderId);
        const orderCompletions = completions.filter((completion) => executionId(completion.productionOrderId) === orderId);
        const completed = orderCompletions.reduce((sum, completion) => sum + completion.quantity, 0);
        const received = orderCompletions.reduce((sum, completion) => sum + completion.receivedQty, 0);
        let incompleteReason = "";
        if (!row.bomMaterials?.length) incompleteReason = "历史生产单缺少 BOM 快照，请先核对历史资料。";
        if (qty(row.completedQty || 0) !== qty(completed) || qty(row.receivedQty || 0) !== qty(received)) incompleteReason = "历史完工或入库数量缺少对应批次，需先核对来源记录。";
        let blockReason = incompleteReason;
        if (["草稿", "已取消"].includes(row.status)) blockReason = "生产单尚未下达或已取消。";
        const salesOrder = salesOrders.get(executionId(row.salesOrderId));
        if (row.sourceType !== "stock" && !salesOrder) blockReason = "来源销售订单不存在或已删除，不能继续生产操作。";
        if (salesOrder && hasSalesOrderCompletionRelease(salesOrder)) blockReason = "销售订单已确认完工或历史放行，不能继续生产操作。";
        const mayCleanup = row.status === "已完成" && !blockReason;
        const materials: ExecutionMaterial[] = [];
        for (const material of executionMaterials(row)) {
            let issuedQty = 0;
            let pendingQty = 0;
            let pendingReturnQty = 0;
            for (const request of orderRequests) {
                for (const line of request.lines) {
                    if (executionId(line.productId) !== material.productId) continue;
                    for (const allocation of line.allocations) {
                        issuedQty += allocation.issued - allocation.returned;
                        pendingQty += allocationPending(allocation);
                        pendingReturnQty += allocation.pendingReturn;
                    }
                }
            }
            const sources = materialSourcesFromData(row, material.productId, materialSourceData);
            const availableQty = qty(sources.reduce((sum, source) => sum + source.available, 0));
            const poolKey = `${executionId(row.salesOrderId)}:${executionId(row.rootProductId)}:${material.productId}`;
            const allocatedInTransitQty = row.sourceType === "order" ? allocatedInTransitMap.get(poolKey) || 0 : 0;
            const product = products.find((item) => executionId(item._id) === material.productId);
            const lossQty = lossesByMaterial.get(`${orderId}:${material.productId}`) || 0;
            const requiredQty = qty(qty(row.planQty * material.unitQty) + lossQty);
            materials.push({
                productId: material.productId, code: text(material.code), name: text(material.name), unit: text(material.unit) || "个", per: material.unitQty,
                source: text(material.source), image: text(material.image || product?.image), material: text(product?.material), category: text(product?.categoryName),
                requiredQty, lossQty, issuedQty: qty(issuedQty), pendingQty: qty(pendingQty), pendingReturnQty: qty(pendingReturnQty), availableQty,
                lossLimit: blockReason ? 0 : materialLossLimit({ per: material.unitQty, issuedQty: qty(issuedQty), pendingReturnQty: qty(pendingReturnQty), lossQty }, completed),
                allocatedInTransitQty, availableWithTransitQty: qty(availableQty + allocatedInTransitQty),
                requestLimit: blockReason || row.status === "已完成" ? 0 : qty(Math.max(0, Math.min(requiredQty - issuedQty - pendingQty, availableQty))),
                supportedQty: material.unitQty > 0 ? Math.max(0, Math.floor((qty(issuedQty - pendingReturnQty - lossQty) + 0.0000001) / material.unitQty)) : 0,
            });
        }
        if (!incompleteReason && completed > supportedCompletionQuantity(row.planQty, 0, materials)) {
            incompleteReason = "领料记录不足以支持已登记完工数量，请先核对来源记录。";
        }
        if (!blockReason && incompleteReason) blockReason = incompleteReason;
        if (blockReason) {
            for (const material of materials) {
                material.lossLimit = 0;
                material.requestLimit = 0;
            }
        }
        const materialState = getProductionMaterialState(row.planQty, materials, incompleteReason);
        const product = products.find((item) => executionId(item._id) === executionId(row.productId));
        const purchaseReceipt = options.readOnly
            ? { purchaseReceiptReady: false, purchaseReceiptBlockReason: "", purchaseSourceValid: false,
                purchaseSourceBlockReason: "", relatedPurchaseOrders: [] }
            : purchaseReceiptMap!.get(orderId)!;
        result.push({
            ...materialState,
            ...purchaseReceipt,
            id: orderId, documentNo: row.documentNo, version: row.version, status: row.status,
            sourceType: row.sourceType, salesOrderId: executionId(row.salesOrderId), salesOrderNo: text(row.salesOrderNo), rootProductId: executionId(row.rootProductId),
            productId: executionId(row.productId), productCode: row.productCode, productName: row.productName,
            kind: executionId(row.rootProductId) === executionId(row.productId) ? "finished" : "component",
            image: text(product?.image), material: text(product?.material), category: text(product?.categoryName), unit: text(row.unitName) || "个",
            planQty: row.planQty, completedQty: row.completedQty || 0, receivedQty: row.receivedQty || 0,
            completionLimit: blockReason || row.status === "已完成" ? 0 : supportedCompletionQuantity(row.planQty, completed, materials),
            executable: !blockReason && row.status !== "已完成", cleanupAllowed: mayCleanup && !blockReason,
            hasMaterialLoss: materials.some((material) => material.lossQty > 0),
            blockReason, owner: row.owner, workshop: row.workshop, bomVersion: row.bomVersion,
            planStart: dateText(row.planStart), planFinish: dateText(row.planFinish), machineNumbers: row.machineNumbers || [], remark: text(row.remark), materials,
        });
    }
    return result;
};

const serializeRequest = (request: any, order: ExecutionOrder): ExecutionRequisition => ({
    id: executionId(request._id), documentNo: request.documentNo, version: request.version, orderId: order.id,
    salesOrderId: order.salesOrderId, applicant: request.applicant, remark: text(request.remark), date: dateText(request.createTime),
    status: request.status, hasPendingReturn: Boolean(request.hasPendingReturn),
    lines: request.lines.map((line: any) => {
        const material = order.materials.find((item) => item.productId === executionId(line.productId));
        const allocations = line.allocations.map((allocation: any) => ({
            id: executionId(allocation._id), stockId: executionId(allocation.stockId), reservationId: executionId(allocation.reservationId),
            warehouseId: executionId(allocation.warehouseId), locationId: executionId(allocation.locationId),
            quantity: allocation.quantity, issued: allocation.issued, cancelled: allocation.cancelled, returned: allocation.returned, pendingReturn: allocation.pendingReturn,
            pendingQty: allocationPending(allocation), returnLimit: material ? unconsumedReturnLimit(allocation, material, order.completedQty) : 0,
        }));
        const sum = (key: string) => qty(allocations.reduce((total: number, allocation: any) => total + allocation[key], 0));
        return { productId: executionId(line.productId), materialCode: line.materialCode, name: line.name, unit: line.unit, per: line.per, quantity: line.quantity,
            issued: sum("issued"), cancelled: sum("cancelled"), returned: sum("returned"), pendingReturn: sum("pendingReturn"), pendingQty: sum("pendingQty"),
            returnLimit: material ? qty(Math.min(sum("returnLimit"), materialLossLimit(material, order.completedQty))) : 0, allocations };
    }),
    records: (request.records || []).map((record: any) => ({ date: dateText(record.date), action: record.action, materialCode: record.materialCode, quantity: record.quantity, unit: record.unit, documentNo: record.documentNo, remark: text(record.remark), warehouseId: executionId(record.warehouseId), locationId: executionId(record.locationId) })),
});

export const retrieveProductionExecution = async (
    params: Record<string, any> = {},
    options: { readOnly?: boolean; includeWarehouseMetadata?: boolean } = {},
): Promise<ExecutionSnapshot> => {
    const orderFilter: Record<string, any> = { status: { $ne: "已取消" } };
    if (params.resource === "candidates") {
        orderFilter.status = { $in: ["待发料", "待生产", "生产中"] };
        const keyword = text(params.keyword).slice(0, 80);
        if (keyword) {
            const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            orderFilter.$or = [{ documentNo: regex }, { productName: regex }, { productCode: regex }, { salesOrderNo: regex }];
        }
    }
    for (const [param, field] of [["productionOrderId", "_id"], ["salesOrderId", "salesOrderId"]]) {
        if (!params[param]) continue;
        if (!mongoose.isValidObjectId(params[param])) throwInventoryError(400, CODE.INVALID_PARAMS, "关联单据 ID 不合法");
        orderFilter[field] = toObjectId(params[param]);
    }
    const detailResource = text(params.detailResource);
    if (params.id && detailResource) {
        if (!mongoose.isValidObjectId(params.id)) throwInventoryError(400, CODE.INVALID_PARAMS, "单据 ID 不合法");
        let ids: any[] = [];
        if (detailResource === "requisition") {
            const request = await ProductionRequisition.findById(params.id).lean() as any;
            if (request) ids = [request.productionOrderId];
        } else if (detailResource === "completion") {
            const completion = await ProductionCompletion.findById(params.id).lean() as any;
            if (completion) ids = [completion.productionOrderId];
        } else if (detailResource === "receipt") {
            const receipt = await InventoryInbound.findOne({ _id: params.id, sourceType: "production-execution", type: "生产", _isDeleted: { $ne: true } }).lean() as any;
            if (receipt) ids = receipt.items.map((line: any) => line.productionOrderId);
        }
        if (!ids.length) throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "生产执行单据不存在");
        orderFilter._id = { $in: ids };
    }
    const page = Math.max(1, Math.trunc(Number(params.page)) || 1);
    const limit = Math.min(100, Math.max(1, Math.trunc(Number(params.limit)) || 15));
    const scopeRows = await ProductionOrder.find(orderFilter).sort({ createTime: -1, _id: -1 }).lean() as any[];
    const scopeIds = scopeRows.map((row) => row._id);
    const allRequests = await ProductionRequisition.find({ productionOrderId: { $in: scopeIds } }).sort({ createTime: -1, _id: -1 }).lean() as any[];
    const allCompletions = await ProductionCompletion.find({ productionOrderId: { $in: scopeIds } }).sort({ date: -1, _id: -1 }).lean() as any[];
    const keyword = text(params.keyword).slice(0, 80).toLowerCase();
    const status = text(params.status || "全部");
    const pendingOnly = params.pendingOnly === "true" || params.pendingOnly === true;
    let selectedRows = scopeRows;
    let requests = allRequests;
    let completions = allCompletions;
    const counts: Record<string, number> = {};
    let total = 0;
    const completionStatus = (row: any) => row.receivedQty >= row.quantity ? "已入库" : row.receivedQty > 0 ? "部分入库" : "待入库";
    const serializeCompletion = (row: any) => ({ id: executionId(row._id), documentNo: row.documentNo, version: row.version, orderId: executionId(row.productionOrderId), quantity: row.quantity, receivedQty: row.receivedQty, pendingQty: row.quantity - row.receivedQty, status: completionStatus(row), date: dateText(row.date), person: row.person, remark: text(row.remark) });
    if (params.view === "requisitions" || params.view === "completions") {
        const isRequest = params.view === "requisitions";
        const source = isRequest ? allRequests : allCompletions;
        const filtered: any[] = [];
        counts["全部"] = source.length;
        for (const row of source) {
            const rowStatus = isRequest ? row.status : completionStatus(row);
            counts[rowStatus] = (counts[rowStatus] || 0) + 1;
            if (isRequest && row.hasPendingReturn) counts["待退料入库"] = (counts["待退料入库"] || 0) + 1;
            const matchesStatus = status === "全部" || (status === "待退料入库" ? row.hasPendingReturn : status === rowStatus);
            const searchable = [row.documentNo, row.productionOrderNo, row.salesOrderNo, row.productName, row.productCode, ...(row.lines || []).map((line: any) => `${line.materialCode} ${line.name}`)].join(" ").toLowerCase();
            const matchesPending = !pendingOnly || (!isRequest && row.receivedQty < row.quantity);
            if (matchesStatus && matchesPending && (!keyword || searchable.includes(keyword))) filtered.push(row);
        }
        total = filtered.length;
        const pageRows = filtered.slice((page - 1) * limit, page * limit);
        const related = new Set(pageRows.map((row) => executionId(row.productionOrderId)));
        selectedRows = scopeRows.filter((row) => related.has(executionId(row._id)));
        requests = isRequest ? pageRows : allRequests.filter((row) => related.has(executionId(row.productionOrderId)));
        completions = isRequest ? allCompletions.filter((row) => related.has(executionId(row.productionOrderId))) : pageRows;
    }
    let orders = await buildExecutionOrders(selectedRows, undefined, { readOnly: options.readOnly });
    if (params.resource === "candidates") {
        orders = orders.filter((order) => order.executable && (params.candidateFor === "completion" ? order.completionLimit > 0 : order.materials.some((material) => material.requestLimit > 0))
            && (!keyword || [order.documentNo, order.productName, order.productCode, order.salesOrderNo].join(" ").toLowerCase().includes(keyword)));
        total = orders.length;
        orders = orders.slice((page - 1) * limit, page * limit);
        requests = [];
        completions = [];
    }
    const orderMap = new Map(orders.map((order) => [order.id, order]));
    const materialLosses = await ProductionMaterialLoss.find({ productionOrderId: { $in: orders.map((order) => toObjectId(order.id)) } })
        .sort({ createTime: -1, _id: -1 }).lean() as any[];
    const receipts = await InventoryInbound.find({ sourceType: "production-execution", type: "生产", _isDeleted: { $ne: true }, "items.productionOrderId": { $in: orders.map((order) => toObjectId(order.id)) } }).sort({ createTime: -1 }).lean() as any[];
    const includeWarehouseMetadata = options.includeWarehouseMetadata ?? !options.readOnly;
    const locations = !includeWarehouseMetadata ? []
        : await InventoryLocation.find({ _isDeleted: { $ne: true } }).select("name code parentId warehouseId").lean() as any[];
    const parentIds = new Set(locations.map((location) => executionId(location.parentId)));
    const warehouses = !includeWarehouseMetadata ? []
        : await InventoryWarehouse.find({ _isDeleted: { $ne: true }, includeInAvailable: true }).select("name").lean() as any[];
    const serializedReceipts: ExecutionReceipt[] = [];
    for (const receipt of receipts) {
        const lines = receipt.items.filter((line: any) => line.completionId
            && (!options.readOnly || orderMap.has(executionId(line.productionOrderId))));
        if (options.readOnly && !lines.length) continue;
        serializedReceipts.push({
            id: executionId(receipt._id), documentNo: receipt.inboundNo,
            sourceKey: text(receipt.sourceKey).split("|operation:")[0], date: dateText(receipt.inboundDate),
            person: receipt.handler, remark: text(receipt.remark),
            lines: lines.map((line: any) => ({ completionId: executionId(line.completionId), orderId: executionId(line.productionOrderId),
                quantity: line.quantity, warehouseId: executionId(line.warehouseId), locationId: executionId(line.locationId) })),
        });
    }
    return {
        orders, requisitions: requests.filter((request) => orderMap.has(executionId(request.productionOrderId))).map((request) => serializeRequest(request, orderMap.get(executionId(request.productionOrderId))!)),
        completions: completions.map(serializeCompletion),
        relatedCompletions: allCompletions.filter((row) => orderMap.has(executionId(row.productionOrderId))).map(serializeCompletion),
        materialLosses: materialLosses.map((loss): ExecutionMaterialLoss => ({
            id: executionId(loss._id), orderId: executionId(loss.productionOrderId), productId: executionId(loss.productId),
            materialCode: text(loss.materialCode), materialName: text(loss.materialName), quantity: loss.quantity,
            unit: text(loss.unit) || "个", remark: text(loss.remark), person: text(loss.createdBy), date: dateText(loss.createTime),
        })),
        receipts: serializedReceipts,
        warehouses: warehouses.map((warehouse) => ({ id: executionId(warehouse._id), name: warehouse.name, locations: locations.filter((location) => executionId(location.warehouseId) === executionId(warehouse._id) && !parentIds.has(executionId(location._id))).map((location) => ({ id: executionId(location._id), name: `${location.code} · ${location.name}` })) })),
        pagination: { page, limit, total: params.view || params.resource === "candidates" ? total : orders.length }, counts,
    };
};
