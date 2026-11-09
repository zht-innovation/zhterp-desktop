export const MAX_SALES_ORDER_PAYMENT_PLANS = 4;

export interface SalesOrderPaymentPlan {
    date: string | Date | null;
    amount: number;
    currency?: string;
}

export interface SalesOrderPaymentPlanInput {
    date?: string | Date | null;
    amount?: number | string | null;
    currency?: string;
}

export interface SalesOrderPaymentSource {
    currency?: string;
    hasReceivable?: boolean;
    receivableOrder?: string;
    plannedPayments?: readonly SalesOrderPaymentPlan[] | null;
    plannedPaymentDate?: string | Date | null;
    plannedPaymentAmount?: number | string | null;
}
