import type mongoose from "mongoose";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { InventoryBom } from "~~/server/models/inventoryBom.model";
import { overviewProductQuantities, productionComponentDemand, productionPlanningQuantities } from "./productionOverviewMath";
import { resolveProductionReservationOrigins } from "./productionMaterialPool";
import { normalizeStockQuantity } from "./inventoryStockMath";

const id = (value: any) => String(value?.toString?.() || value || "");

export const hasUnfulfilledProductionDemand = async (salesOrder: any, session?: mongoose.ClientSession) => {
    const demandByProduct = new Map<string, number>();
    for (const line of Array.isArray(salesOrder.products) ? salesOrder.products : []) {
        const productId = id(line.productId);
        const quantity = Math.max(0, Number(line.quantity) || 0);
        demandByProduct.set(productId, (demandByProduct.get(productId) || 0) + quantity);
    }
    if (!demandByProduct.size) return false;

    const query = SalesOrderStockReservation.find({ salesOrderId: salesOrder._id, reservationType: "finished-product" })
        .select("stockProductId sourceInboundId reservedQuantity consumedQuantity releasedQuantity").lean();
    if (session) query.session(session);
    const reservations = await query as any[];
    for (const [productId, demand] of demandByProduct) {
        const rows = reservations.filter((row) => id(row.stockProductId) === productId);
        const amounts = overviewProductQuantities(demand, rows, 0, 0);
        if (normalizeStockQuantity(amounts.locked + amounts.received) < demand) return true;
    }
    return false;
};

export const buildProductionPlanning = (
    salesOrder: any,
    rootProductId: string,
    productId: string,
    productionOrders: any[],
    reservations: any[],
    rootBom?: any,
) => {
    const rootDemand = (Array.isArray(salesOrder.products) ? salesOrder.products : [])
        .filter((line: any) => id(line.productId) === rootProductId)
        .reduce((sum: number, line: any) => sum + Math.max(0, Number(line.quantity) || 0), 0);
    const rootOrders = productionOrders.filter((order) => id(order.productId) === rootProductId
        && id(order.rootProductId || order.productId) === rootProductId);
    const rootReservations = reservations.filter((reservation) => reservation.reservationType === "finished-product"
        && id(reservation.stockProductId) === rootProductId);
    const rootPlanning = productionPlanningQuantities(rootDemand, rootReservations, rootOrders);
    if (productId === rootProductId) return rootPlanning;

    const unitQty = (Array.isArray(rootBom?.items) ? rootBom.items : [])
        .filter((item: any) => id(item.productId) === productId)
        .reduce((sum: number, item: any) => sum + Math.max(0, Number(item.quantity) || 0), 0);
    const requiredQty = productionComponentDemand(rootDemand, rootPlanning.externalCoverage, unitQty);
    const componentOrders = productionOrders.filter((order) => id(order.rootProductId) === rootProductId && id(order.productId) === productId);
    const componentReservations = reservations.filter((reservation) => reservation.reservationType === "production-material"
        && id(reservation.demandProductId) === rootProductId && id(reservation.stockProductId) === productId);
    const planning = productionPlanningQuantities(requiredQty, componentReservations, componentOrders);
    return { ...planning, legacyReviewRequired: rootPlanning.legacyReviewRequired || planning.legacyReviewRequired };
};

export const getProductionPlanning = async (
    salesOrder: any,
    rootProductId: string,
    productId: string,
    session?: mongoose.ClientSession,
) => {
    const ordersQuery = ProductionOrder.find({ salesOrderId: salesOrder._id, status: { $nin: ["草稿", "已取消"] } })
        .select("rootProductId productId planQty receivedQty status").lean();
    const reservationsQuery = SalesOrderStockReservation.find({ salesOrderId: salesOrder._id })
        .select("salesOrderId demandProductId stockProductId reservationType sourceAllocationId sourceProductionOrderId reservedQuantity releasedQuantity").lean();
    const bomQuery = InventoryBom.findOne({ productId: rootProductId, isEnabled: true, _isDeleted: { $ne: true } })
        .select("items").lean();
    if (session) {
        ordersQuery.session(session);
        reservationsQuery.session(session);
        bomQuery.session(session);
    }
    // Mongoose 不支持在同一事务中并行查询，事务内保持顺序读取。
    const orders = await ordersQuery as any[];
    const reservations = await resolveProductionReservationOrigins(await reservationsQuery as any[], session);
    const bom = productId === rootProductId ? undefined : await bomQuery;
    return buildProductionPlanning(salesOrder, rootProductId, productId, orders, reservations, bom);
};
