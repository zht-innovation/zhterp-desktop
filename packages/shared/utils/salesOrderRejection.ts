export const SALES_ORDER_REJECTION_LIMIT = 2;
export const SALES_ORDER_REJECTION_LOCK_MESSAGE = "订单累计驳回已满2次，原订单不可修改";

export const isSalesOrderEditLocked = (order: { rejectionCount?: number | null }): boolean =>
    Number(order.rejectionCount || 0) >= SALES_ORDER_REJECTION_LIMIT;
