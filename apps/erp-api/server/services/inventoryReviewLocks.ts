import type { ClientSession } from "mongoose";
import type { InventoryReviewDemandLine } from "~~/shared/types/inventoryReview";
import { InventoryLocation, InventoryWarehouse } from "~~/server/models/inventoryBase.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { toObjectId, toText } from "./inventory";
import { normalizeStockQuantity } from "./inventoryStockMath";

export interface InventoryReviewProductLockSnapshot {
    productId: string;
    positions: Array<{
        stockId: string;
        warehouseId: string;
        locationId: string;
        warehouseDisplayName: string;
        lockedQuantity: number;
    }>;
    reservations: Array<{
        salesOrderId: string;
        salesOrderNo: string;
        warehouseId: string;
        locationId: string;
        reservationType: "finished-product" | "production-material";
        quantity: number;
    }>;
}

// 私有原始明细仅存入采购申请，不放入公共复核结果或审批业务快照。
export interface InventoryReviewLockSnapshot {
    capturedAt: string;
    products: InventoryReviewProductLockSnapshot[];
}

interface ReviewLockStock {
    _id: unknown;
    productId: unknown;
    warehouseId?: unknown;
    locationId?: unknown;
    lockedQuantity?: number;
}

export async function captureInventoryReviewLocks(
    lines: InventoryReviewDemandLine[],
    stocks: ReviewLockStock[],
    session: ClientSession,
    capturedAt: string,
): Promise<InventoryReviewLockSnapshot> {
    const products = lines.map((line): InventoryReviewProductLockSnapshot => ({
        productId: line.productId,
        positions: [],
        reservations: [],
    }));
    const productMap = new Map(products.map((product) => [product.productId, product]));
    const lockedStocks = stocks.filter((stock) => Number(stock.lockedQuantity || 0) > 0);
    const warehouseIds = [...new Set(lockedStocks.map((stock) => toText(stock.warehouseId)).filter(Boolean))];
    const locationIds = [...new Set(lockedStocks.map((stock) => toText(stock.locationId)).filter(Boolean))];
    const warehouses: any[] = warehouseIds.length
        ? await InventoryWarehouse.find({ _id: { $in: warehouseIds.map(toObjectId) } })
            .select("_id name code").session(session).lean()
        : [];
    const warehouseMap = new Map(warehouses.map((warehouse) => [toText(warehouse._id), warehouse]));
    const locationMap = new Map<string, any>();
    let pendingLocationIds = locationIds;
    while (pendingLocationIds.length) {
        const locations: any[] = await InventoryLocation.find({ _id: { $in: pendingLocationIds.map(toObjectId) } })
            .select("_id name code parentId").session(session).lean();
        // 记录查不到的节点，防止失效父级造成重复查询。
        for (const id of pendingLocationIds) locationMap.set(id, null);
        for (const location of locations) locationMap.set(toText(location._id), location);
        pendingLocationIds = [...new Set(locations.map((location) => toText(location.parentId)))]
            .filter((id) => id && !locationMap.has(id));
    }

    for (const stock of lockedStocks) {
        const product = productMap.get(toText(stock.productId));
        if (!product) continue;
        const warehouseId = toText(stock.warehouseId);
        const locationId = toText(stock.locationId);
        const warehouse = warehouseMap.get(warehouseId);
        const locationNames: string[] = [];
        const visited = new Set<string>();
        let cursor = locationId;
        while (cursor && !visited.has(cursor)) {
            visited.add(cursor);
            const location = locationMap.get(cursor);
            if (!location) break;
            locationNames.unshift(toText(location.name || location.code));
            cursor = toText(location.parentId);
        }
        const warehouseName = toText(warehouse?.name || warehouse?.code) || (warehouseId ? "仓库已删除" : "");
        const locationName = locationNames.filter(Boolean).join(" / ") || (locationId ? "库位已删除" : "");
        product.positions.push({
            stockId: toText(stock._id),
            warehouseId,
            locationId,
            warehouseDisplayName: [warehouseName, locationName].filter(Boolean).join("/") || "--",
            lockedQuantity: normalizeStockQuantity(stock.lockedQuantity),
        });
    }

    // 原锁定合计先求和再保留三位；分配历史高精度数据的尾差，避免明细合计偏离原值。
    for (const line of lines) {
        const product = productMap.get(line.productId);
        if (!product) continue;
        let total = 0;
        for (const position of product.positions) total += position.lockedQuantity;
        let difference = normalizeStockQuantity(line.lockedQuantity - total);
        for (let index = product.positions.length - 1; index >= 0 && difference !== 0; index -= 1) {
            const position = product.positions[index]!;
            const adjusted = normalizeStockQuantity(Math.max(position.lockedQuantity + difference, 0));
            difference = normalizeStockQuantity(difference - (adjusted - position.lockedQuantity));
            position.lockedQuantity = adjusted;
        }
    }

    const productIds = products.filter((product) => product.positions.length).map((product) => product.productId);
    const reservations: any[] = productIds.length
        ? await SalesOrderStockReservation.find({ stockProductId: { $in: productIds.map(toObjectId) }, status: "active" })
            .select("stockProductId salesOrderId salesOrderNo warehouseId locationId reservationType reservedQuantity consumedQuantity releasedQuantity")
            .sort({ _id: 1 }).session(session).lean()
        : [];
    const orderIds = [...new Set(reservations.map((reservation) => toText(reservation.salesOrderId)).filter(Boolean))];
    const orders: any[] = orderIds.length
        ? await useSalesOrderModel().order.find({ _id: { $in: orderIds.map(toObjectId) } })
            .select("_id orderNo").session(session).lean()
        : [];
    const orderNumbers = new Map(orders.map((order) => [toText(order._id), toText(order.orderNo)]));
    for (const reservation of reservations) {
        const product = productMap.get(toText(reservation.stockProductId));
        if (!product) continue;
        const quantity = normalizeStockQuantity(Math.max(
            Number(reservation.reservedQuantity || 0)
                - Number(reservation.consumedQuantity || 0)
                - Number(reservation.releasedQuantity || 0),
            0,
        ));
        if (quantity <= 0) continue;
        const warehouseId = toText(reservation.warehouseId);
        const locationId = toText(reservation.locationId);
        if (!product.positions.some((position) => position.warehouseId === warehouseId && position.locationId === locationId)) continue;
        const salesOrderId = toText(reservation.salesOrderId);
        product.reservations.push({
            salesOrderId,
            salesOrderNo: orderNumbers.get(salesOrderId) || toText(reservation.salesOrderNo),
            warehouseId,
            locationId,
            reservationType: reservation.reservationType,
            quantity,
        });
    }
    return { capturedAt, products };
}
