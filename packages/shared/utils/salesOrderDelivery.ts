type SalesOrderDate = string | Date | null | undefined;

type SalesOrderDeliverySource = {
    orderDate?: SalesOrderDate;
    durationDays?: number | string | null;
    durationText?: string | null;
};

export const formatSalesOrderDate = (value: SalesOrderDate): string => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    const formatted = date.toISOString().slice(0, 10);
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value !== formatted) {
        return "";
    }
    return formatted;
};

export const getSalesOrderDurationDays = (
    orderDate: SalesOrderDate,
    deliveryDate: SalesOrderDate,
): number | null => {
    const start = formatSalesOrderDate(orderDate);
    const end = formatSalesOrderDate(deliveryDate);
    if (!start || !end) return null;
    return (Date.parse(end) - Date.parse(start)) / 86400000;
};

export const getSalesOrderDeliveryDate = (source: SalesOrderDeliverySource): string => {
    const orderDate = formatSalesOrderDate(source.orderDate);
    if (!orderDate || source.durationDays == null || source.durationDays === "") return "";
    const days = Number(source.durationDays);
    if (!Number.isFinite(days) || days < 0) return "";
    // 空草稿保存为 0 和空文本；明确的当天交期保存为“0天”。旧审批快照没有文本。
    if (days === 0 && source.durationText !== undefined && source.durationText?.trim() !== "0天") return "";
    const date = new Date(orderDate);
    date.setUTCDate(date.getUTCDate() + Math.floor(days));
    return formatSalesOrderDate(date);
};
