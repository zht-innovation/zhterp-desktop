import { normalizeStockQuantity } from "./inventoryStockMath";

const quantity = (value: unknown) => Math.max(0, Number(value) || 0);
const id = (value: any) => String(value?.toString?.() || value || "");

export const salesOrderDisplayStatus = (status: string) => status === "待出库" ? "待发货" : status;

export const productionDueDate = (order: { orderDate?: unknown; durationDays?: unknown }) => {
    const date = new Date(String(order.orderDate || ""));
    if (Number.isNaN(date.getTime())) return "";
    date.setUTCDate(date.getUTCDate() + quantity(order.durationDays));
    return date.toISOString().slice(0, 10);
};

export const reservationRemaining = (row: any) => Math.max(0,
    quantity(row.reservedQuantity) - quantity(row.consumedQuantity) - quantity(row.releasedQuantity));

export const productionPlanningQuantities = (requiredQty: number, reservations: any[], productionOrders: any[]) => {
    const committed = productionOrders.filter((order) => !["草稿", "已取消"].includes(order.status));
    const committedIds = new Set(committed.map((order) => id(order._id || order.id)));
    let externalCoverage = 0;
    for (const reservation of reservations) {
        if (committedIds.has(id(reservation.sourceProductionOrderId))) continue;
        // 规划覆盖包含已领用/已发货部分；只扣真正释放的数量。
        externalCoverage += Math.max(0, quantity(reservation.reservedQuantity) - quantity(reservation.releasedQuantity));
    }
    const released = normalizeStockQuantity(committed.reduce((sum, order) => sum + quantity(order.planQty), 0));
    let legacyReviewRequired = false;
    for (const order of committed) {
        const received = quantity(order.receivedQty);
        if (received <= 0) continue;
        const linked = reservations.filter((reservation) => id(reservation.sourceProductionOrderId) === id(order._id || order.id))
            .reduce((sum, reservation) => sum + quantity(reservation.reservedQuantity), 0);
        if (normalizeStockQuantity(linked) < normalizeStockQuantity(received)) legacyReviewRequired = true;
    }
    externalCoverage = normalizeStockQuantity(externalCoverage);
    return {
        requiredQty: normalizeStockQuantity(requiredQty), externalCoverage, released,
        remaining: normalizeStockQuantity(Math.max(0, requiredQty - externalCoverage - released)),
        legacyReviewRequired,
    };
};

export const productionComponentDemand = (rootDemand: number, externalRootCoverage: number, unitQty: number) =>
    normalizeStockQuantity(Math.max(0, rootDemand - externalRootCoverage) * quantity(unitQty));

export const productionFulfillmentStatus = (
    finishedProductsReady: boolean,
    hasStartedProduction: boolean,
    pendingRequirement: boolean,
    requiresCompletion = false,
    completionConfirmed = false,
) => {
    if (completionConfirmed || (finishedProductsReady && !requiresCompletion)) return "待出库";
    if (finishedProductsReady && requiresCompletion) return "生产中";
    if (hasStartedProduction) return "生产中";
    return pendingRequirement ? "待采购" : "待生产";
};

type ProductionCandidateProduct = {
    quantity: number;
    locked: number;
    received: number;
    remaining: number;
    bomVersion?: string;
    legacyReviewRequired?: boolean;
};

export const hasProductionCandidateDemand = (order: { products: ProductionCandidateProduct[]; components: ProductionCandidateProduct[] }) => {
    if (!order.products.length || order.products.every((product) => normalizeStockQuantity(product.locked + product.received) >= product.quantity)) return false;
    for (const product of [...order.products, ...order.components]) {
        if (product.bomVersion && !product.legacyReviewRequired && Math.floor(product.remaining) >= 1) return true;
    }
    return false;
};

export const overviewProductQuantities = (demand: number, reservations: any[], released: number, remaining: number) => {
    const locked = reservations.filter((row) => !row.sourceInboundId).reduce((sum, row) => sum + reservationRemaining(row), 0);
    const received = reservations.filter((row) => row.sourceInboundId).reduce((sum, row) => sum + reservationRemaining(row), 0);
    return { locked: normalizeStockQuantity(locked), received: normalizeStockQuantity(received), released,
        remaining, ready: normalizeStockQuantity(Math.min(demand, locked + received)) };
};
