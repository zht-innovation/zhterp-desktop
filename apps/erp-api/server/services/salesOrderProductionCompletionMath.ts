import { normalizeStockQuantity as qty } from "./inventoryStockMath";

const text = (value: unknown) => String(value ?? "").trim();
const validQuantity = (value: unknown) => Number.isFinite(Number(value)) && Number(value) >= 0;

export const buildCompletionDemand = (products: any[]) => {
    const demand = new Map<string, { productId: string; name: string; quantity: number }>();
    const reasons: string[] = [];
    if (!Array.isArray(products) || !products.length) reasons.push("订单没有有效的销售产品，请先核对订单。");
    for (const [index, product] of (Array.isArray(products) ? products : []).entries()) {
        const productId = text(product?.productId).toLowerCase();
        const name = text(product?.model || product?.productName || product?.productCode) || `第 ${index + 1} 项产品`;
        if (!/^[a-f\d]{24}$/i.test(productId) || !validQuantity(product?.quantity) || qty(product.quantity) <= 0) {
            reasons.push(`${name}的产品档案或需求数量无效，请先核对订单。`);
            continue;
        }
        const previous = demand.get(productId);
        demand.set(productId, { productId, name, quantity: qty((previous?.quantity || 0) + Number(product.quantity)) });
    }
    return { demand, reasons };
};

export const completionReservationBalance = (reservation: any) => {
    const reserved = Number(reservation.reservedQuantity);
    const consumed = Number(reservation.consumedQuantity ?? 0);
    const released = Number(reservation.releasedQuantity ?? 0);
    const allocated = Number(reservation.productionAllocatedQuantity ?? 0);
    const valid = [reserved, consumed, released, allocated].every(validQuantity)
        && qty(consumed + released) <= qty(reserved)
        && qty(allocated) <= qty(reserved - consumed - released);
    return { valid, reserved: qty(reserved), consumed: qty(consumed), released: qty(released),
        allocated: qty(allocated), remaining: valid ? qty(reserved - consumed - released) : 0 };
};

export const completionAllocationBalance = (allocation: any) => {
    const quantity = Number(allocation.quantity);
    const issued = Number(allocation.issued ?? 0);
    const cancelled = Number(allocation.cancelled ?? 0);
    const returned = Number(allocation.returned ?? 0);
    const pendingReturn = Number(allocation.pendingReturn ?? 0);
    const valid = [quantity, issued, cancelled, returned, pendingReturn].every(validQuantity)
        && qty(issued + cancelled) <= qty(quantity) && qty(returned + pendingReturn) <= qty(issued);
    return { valid, issued: qty(issued), returned: qty(returned), pendingReturn: qty(pendingReturn),
        pending: valid ? qty(quantity - issued - cancelled) : 0, netIssued: qty(issued - returned) };
};

export const completionMaterialRemainder = (material: any, completedQty: number) => qty(
    Number(material.issuedQty) - qty(Number(material.per) * completedQty) - Number(material.lossQty || 0),
);

export const completionReservationExecutionMatches = (reservation: any, netIssued: number, pending: number) => {
    const balance = completionReservationBalance(reservation);
    return balance.valid && validQuantity(netIssued) && validQuantity(pending)
        && balance.consumed === qty(netIssued) && balance.allocated === qty(pending);
};

// 实际采购入库先满足旧需求分配，余额再按所有无需求ID的直连分配 FIFO 核算；不保存第二份到货数量。
export const getDirectPurchaseAllocationReceipts = (
    directAllocations: any[],
    receipts: Array<{ purchaseOrderId: any; productId: any; quantity: number }>,
    legacyAllocations: any[],
) => {
    const id = (value: any) => text(value?.toString?.() || value).toLowerCase();
    const keyOf = (row: any) => `${id(row.purchaseOrderId)}:${id(row.productId)}`;
    const available = new Map<string, number>();
    for (const receipt of receipts) {
        const quantity = validQuantity(receipt.quantity) ? qty(receipt.quantity) : 0;
        const key = keyOf(receipt);
        available.set(key, qty((available.get(key) || 0) + quantity));
    }
    const reserved = new Map<string, number>();
    for (const allocation of legacyAllocations) {
        const quantity = validQuantity(allocation.lockedAfterInboundQuantity) ? qty(allocation.lockedAfterInboundQuantity) : 0;
        const key = keyOf(allocation);
        reserved.set(key, qty((reserved.get(key) || 0) + quantity));
    }
    for (const [key, quantity] of available) available.set(key, qty(Math.max(0, quantity - (reserved.get(key) || 0))));
    const sorted: any[] = [];
    for (const allocation of directAllocations) {
        if (!text(allocation.requirementId)) sorted.push(allocation);
    }
    const time = (row: any) => {
        const value = row.createTime ? new Date(row.createTime).getTime() : 0;
        return Number.isFinite(value) ? value : 0;
    };
    sorted.sort((left, right) => {
        const difference = time(left) - time(right);
        if (difference) return difference;
        const leftId = id(left._id || left.id);
        const rightId = id(right._id || right.id);
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    });
    const received = new Map<string, number>();
    for (const allocation of sorted) {
        const key = keyOf(allocation);
        const allocated = validQuantity(allocation.allocatedQuantity) ? qty(allocation.allocatedQuantity) : 0;
        const quantity = qty(Math.min(allocated, available.get(key) || 0));
        received.set(id(allocation._id || allocation.id), quantity);
        available.set(key, qty((available.get(key) || 0) - quantity));
    }
    return received;
};
