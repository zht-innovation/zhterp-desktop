type InventoryReviewState = {
    inventoryReviewRequiredAt?: unknown;
    inventoryReviewCompletedAt?: unknown;
};

export const isSalesOrderWaitingInventoryReview = (order: InventoryReviewState) =>
    Boolean(order.inventoryReviewRequiredAt) && !order.inventoryReviewCompletedAt;

// 缺失标记的历史订单继续沿用旧流程；新订单须完成复核后才可参与生产/采购。
export const SALES_ORDER_INVENTORY_REVIEW_READY_FILTER = {
    $or: [
        { inventoryReviewRequiredAt: null },
        { inventoryReviewCompletedAt: { $type: "date" } },
    ],
};
