const toProductId = (value: unknown) => String(value || "").trim();

export const omitLegacyPurchaseWaybillQuantity = (waybill: any) => {
    const data = typeof waybill?.toObject === "function" ? waybill.toObject() : waybill;
    const result = { ...data };
    delete result.productQuantities;
    return result;
};

export const getPurchaseWaybillItems = (order: any, waybill: any): any[] => {
    const productIds = new Set(
        (waybill.productIds || []).map((value: unknown) => toProductId(value)).filter(Boolean),
    );
    const items: any[] = Array.isArray(order.items) ? order.items : [];
    return productIds.size
        ? items.filter((item) => productIds.has(toProductId(item.productId)))
        : items;
};

export const formatPurchaseWaybillGoods = (
    order: any,
    waybill: any,
    productNames: Map<string, string> = new Map(),
): string => {
    const items = getPurchaseWaybillItems(order, waybill);
    const getName = (item: any) => String(item.productName || "").trim()
        || productNames.get(toProductId(item.productId))
        || String(item.productModel || item.productCode || "未命名货品");
    if (waybill.acceptanceStatus && waybill.acceptanceStatus !== "待验收"
        && Array.isArray(waybill.acceptanceItems) && waybill.acceptanceItems.length) {
        return waybill.acceptanceItems.map((item: any) => getName(item)).join("、");
    }

    return items.map((item) => getName(item)).join("、") || "采购货物";
};
