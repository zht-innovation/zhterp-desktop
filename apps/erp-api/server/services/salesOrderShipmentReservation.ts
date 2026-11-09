import mongoose from "mongoose";
import { InventoryStock, useInventoryStockModel } from "~~/server/models/inventoryStock.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { buildSalesOrderProductDemandMap } from "./salesOrderFulfillment";
import { groupSalesOrderShipmentItems } from "./salesOrderShipmentMath";
import { normalizeStockQuantity } from "./inventoryStockMath";
import { throwInventoryError, toObjectId, toText } from "./inventory";
import { CODE } from "~~/server/utils/code";

const positionKey = (item: any) =>
    `${toText(item.productId || item.stockProductId)}:${toText(item.warehouseId)}:${toText(item.locationId)}`;

// 调用前由出库流程锁定并校验销售订单；补锁、预占和实际出库必须共用事务。
export async function ensureSalesOrderShipmentReservations(
    salesOrder: any,
    items: any[],
    actor: string,
    session: mongoose.ClientSession,
) {
    if (!session?.inTransaction()) {
        throwInventoryError(409, CODE.INVENTORY_REFERENCED, "订单出库补预占必须在事务中执行");
    }
    const salesOrderId = toObjectId(toText(salesOrder._id));
    const salesOrderNo = toText(salesOrder.orderNo);
    const demand = buildSalesOrderProductDemandMap(salesOrder.products);
    const groupedItems = groupSalesOrderShipmentItems(items);
    const reservations = await SalesOrderStockReservation.find({
        salesOrderId,
        reservationType: "finished-product",
    }).select("stockProductId warehouseId locationId reservedQuantity consumedQuantity releasedQuantity status")
        .session(session).lean() as any[];
    const consumed = new Map<string, number>();
    const coverage = new Map<string, number>();
    const positionBalances = new Map<string, number>();
    for (const row of reservations) {
        const productId = toText(row.stockProductId);
        const reservedQuantity = Number(row.reservedQuantity || 0);
        const consumedQuantity = Number(row.consumedQuantity || 0);
        const releasedQuantity = Number(row.releasedQuantity || 0);
        consumed.set(productId, normalizeStockQuantity((consumed.get(productId) || 0) + consumedQuantity));
        // 总覆盖包括已出库量，防止历史已交付或其他库位的预占再次占用公共库存。
        coverage.set(productId, normalizeStockQuantity((coverage.get(productId) || 0)
            + Math.max(reservedQuantity - releasedQuantity, 0)));
        if (row.status === "active") {
            const key = positionKey(row);
            const balance = Math.max(reservedQuantity - consumedQuantity - releasedQuantity, 0);
            positionBalances.set(key, normalizeStockQuantity((positionBalances.get(key) || 0) + balance));
        }
    }

    // 旧出库可能没有消费预占，不能仅凭预占余额判断订单尚未发货。
    const outbounds = await mongoose.connection.collection("inventoryoutbounds").find({
        type: "订单",
        stockApplied: true,
        _isDeleted: { $ne: true },
        $or: [
            { salesOrderId },
            { salesOrderId: null, contractOrderNo: salesOrderNo },
        ],
    }, { session }).project({ items: 1 }).toArray();
    const shipped = new Map<string, number>();
    for (const outbound of outbounds) {
        for (const item of outbound.items || []) {
            const productId = toText(item.productId);
            shipped.set(productId, normalizeStockQuantity((shipped.get(productId) || 0) + Number(item.quantity || 0)));
        }
    }
    for (const productId of new Set([...consumed.keys(), ...shipped.keys()])) {
        if ((consumed.get(productId) || 0) !== (shipped.get(productId) || 0)) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "历史订单出库数量与预占消费记录不一致，请先核对历史出库单");
        }
    }

    const requested = new Map<string, number>();
    for (const item of groupedItems) {
        const productId = toText(item.productId);
        requested.set(productId, normalizeStockQuantity((requested.get(productId) || 0) + item.quantity));
    }
    for (const [productId, quantity] of requested) {
        const remainingDemand = normalizeStockQuantity((demand.get(productId) || 0) - (shipped.get(productId) || 0));
        if (!demand.has(productId) || quantity > remainingDemand) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "出库产品不属于销售订单或数量超过剩余交付需求");
        }
    }

    const stockModel = useInventoryStockModel();
    for (const item of groupedItems) {
        const productId = toText(item.productId);
        const shortage = normalizeStockQuantity(Math.max(item.quantity - (positionBalances.get(positionKey(item)) || 0), 0));
        if (shortage <= 0) continue;
        const uncovered = normalizeStockQuantity(Math.max((demand.get(productId) || 0) - (coverage.get(productId) || 0), 0));
        if (shortage > uncovered) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "当前订单在其他仓位已有成品预占，请选择对应仓位出库");
        }

        const snapshot = await stockModel.buildInboundItemSnapshot({
            productId,
            quantity: shortage,
            warehouseId: toText(item.warehouseId),
            locationId: toText(item.locationId),
        }, session, { preservePosition: true });
        if (!snapshot.warehouseId || !snapshot.includeInAvailable) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "所选仓库无有效公共可用库存，无法补齐订单成品预占");
        }
        const stockFilter = {
            productId: snapshot.productId,
            warehouseId: snapshot.warehouseId,
            locationId: snapshot.locationId || null,
            _isDeleted: { $ne: true },
        };
        const stock = await InventoryStock.findOne(stockFilter).session(session).lean() as any;
        const quantity = Number(stock?.quantity || 0);
        const lockedQuantity = Number(stock?.lockedQuantity || 0);
        if (!stock || !Number.isFinite(quantity) || !Number.isFinite(lockedQuantity) || lockedQuantity < 0
            || normalizeStockQuantity(quantity - lockedQuantity) < shortage) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "所选仓位公共可用库存不足，无法补齐订单成品预占");
        }
        const changed = await InventoryStock.updateOne({
            ...stockFilter,
            _id: stock._id,
            quantity: stock.quantity,
            lockedQuantity: stock.lockedQuantity === undefined ? { $exists: false } : stock.lockedQuantity,
        }, { $set: {
            lockedQuantity: normalizeStockQuantity(lockedQuantity + shortage),
            updatedBy: actor,
        } }, { session });
        if (changed.modifiedCount !== 1) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "所选仓位库存已变化，请刷新后重新出库");
        }
        await SalesOrderStockReservation.create([{
            salesOrderId,
            salesOrderNo,
            demandProductId: snapshot.productId,
            stockProductId: snapshot.productId,
            warehouseId: snapshot.warehouseId,
            locationId: snapshot.locationId || null,
            reservationType: "finished-product",
            requiredQuantity: demand.get(productId),
            reservedQuantity: shortage,
            consumedQuantity: 0,
            releasedQuantity: 0,
            status: "active",
            createdBy: actor,
            updatedBy: actor,
        }], { session });
        coverage.set(productId, normalizeStockQuantity((coverage.get(productId) || 0) + shortage));
    }
}
