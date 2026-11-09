import type { SalesOrderPaymentPlan, SalesOrderPaymentSource } from "../types/salesOrderPayment";

export const requiresSalesOrderPaymentConfirmation = (snapshot: unknown): boolean => {
    if (!snapshot || typeof snapshot !== "object") return true;
    const source = snapshot as { hasReceivable?: boolean; receivableOrder?: unknown };
    const hasReceivableOrder = typeof source.receivableOrder === "string" && source.receivableOrder.trim() !== "";
    return source.hasReceivable !== true && !hasReceivableOrder;
};

export const getSalesOrderPaymentPlans = (source: SalesOrderPaymentSource): SalesOrderPaymentPlan[] => {
    if (source.hasReceivable === false && !source.receivableOrder) return [];
    const currency = String(source.currency || "").trim().toUpperCase();
    if (Array.isArray(source.plannedPayments) && source.plannedPayments.length > 0) {
        return source.plannedPayments.map((payment) => ({
            date: payment.date,
            amount: payment.amount,
            currency: payment.currency === undefined ? currency : String(payment.currency ?? "").trim().toUpperCase(),
        }));
    }
    if (source.plannedPaymentDate || source.plannedPaymentAmount != null) {
        return [{
            date: source.plannedPaymentDate || null,
            amount: Number(source.plannedPaymentAmount ?? 0),
            currency,
        }];
    }
    return [];
};

export const getSalesOrderPaymentTotals = (
    source: SalesOrderPaymentSource,
): Array<{ currency: string; amount: number }> => {
    const amounts = new Map<string, number>();
    for (const payment of getSalesOrderPaymentPlans(source)) {
        const currency = payment.currency || "";
        const amount = (amounts.get(currency) || 0) + Number(payment.amount);
        if (!Number.isFinite(amount)) throw new Error("计划回款金额合计超出范围");
        amounts.set(currency, amount);
    }
    const totals: Array<{ currency: string; amount: number }> = [];
    for (const [currency, amount] of amounts) totals.push({ currency, amount });
    return totals;
};
