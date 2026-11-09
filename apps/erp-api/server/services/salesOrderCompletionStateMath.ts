export const hasSalesOrderCompletionRelease = (order: any): boolean =>
    ["manual", "legacy"].includes(String(order?.productionCompletion?.source || ""));

export const salesOrderCompletionInitialization = (order: any, hasProduction: boolean, hasEarlyShipment: boolean) => {
    const released = hasSalesOrderCompletionRelease(order);
    const legacy = !released && ["待出库", "已出库"].includes(String(order.status));
    return {
        productionCompletionInitialized: true,
        productionCompletionRequired: Boolean(order.productionCompletionRequired || hasProduction || order.status === "生产中"
            || (!legacy && !released && hasEarlyShipment)),
        productionCompletion: released ? order.productionCompletion : legacy
            ? { source: "legacy", confirmedAt: null, confirmedBy: "" }
            : null,
        productionCompletionReviewReason: String(order.productionCompletionReviewReason || "")
            || (!legacy && !released && hasEarlyShipment ? "历史订单未放行但存在销售出库记录，请先核对历史单据。" : ""),
    };
};
