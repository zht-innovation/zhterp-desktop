import type { PurchaseMaterialPoolItem, PurchaseOrder } from "~~/shared/types/purchase";

export const omitPurchaseOrderPrices = (
    order: Pick<PurchaseOrder, "totalPrice" | "totalAmount" | "items">,
) => {
    delete order.totalPrice;
    delete order.totalAmount;
    for (const item of order.items || []) {
        delete item.unitPrice;
        delete item.totalAmount;
    }
};

export const omitPurchaseMaterialPoolPrices = (
    material: Pick<PurchaseMaterialPoolItem, "estimatedUnitPrice" | "purchaseHistory">,
) => {
    delete material.estimatedUnitPrice;
    for (const history of material.purchaseHistory || []) {
        delete history.unitPrice;
    }
};
