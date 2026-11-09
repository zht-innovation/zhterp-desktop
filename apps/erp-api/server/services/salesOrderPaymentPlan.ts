import {
    MAX_SALES_ORDER_PAYMENT_PLANS,
    type SalesOrderPaymentPlan,
    type SalesOrderPaymentSource,
} from "~~/shared/types/salesOrderPayment";
import { getSalesOrderPaymentPlans, getSalesOrderPaymentTotals } from "~~/shared/utils/salesOrderPayment";

type StoredPaymentPlan = { date: Date | null; amount: number; currency: string };
export type SalesOrderPaymentState = SalesOrderPaymentSource & { status?: string };
type PaymentUpdate = {
    plannedPayments: StoredPaymentPlan[];
    plannedPaymentDate: Date | null;
    plannedPaymentAmount: number;
};

const hasOwn = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);

const normalizePaymentDate = (value: unknown, index: number): Date | null => {
    if (value == null || value === "") return null;
    if (!(value instanceof Date) && typeof value !== "string") {
        throw new Error(`第${index + 1}组计划回款日期不合法`);
    }
    const dateValue = typeof value === "string" ? value.trim() : value;
    if (dateValue === "") return null;
    const date = dateValue instanceof Date ? new Date(dateValue.getTime()) : new Date(dateValue);
    if (Number.isNaN(date.getTime())) throw new Error(`第${index + 1}组计划回款日期不合法`);
    // Date 会将 2 月 30 日等输入自动滚到下个月，日期输入不能接受这种修正。
    const parts = typeof dateValue === "string" ? /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/i.exec(dateValue) : null;
    if (parts) {
        const calendarDate = new Date(`${parts[1]}-${parts[2]}-${parts[3]}T00:00:00Z`);
        if (
            calendarDate.getUTCFullYear() !== Number(parts[1]) ||
            calendarDate.getUTCMonth() + 1 !== Number(parts[2]) ||
            calendarDate.getUTCDate() !== Number(parts[3])
        ) throw new Error(`第${index + 1}组计划回款日期不合法`);
    }
    return date;
};

export const normalizeSalesOrderPaymentPlans = (
    value: unknown,
    strict = false,
    fallbackCurrency = "",
    previousPayments: readonly SalesOrderPaymentPlan[] = [],
): StoredPaymentPlan[] => {
    let payments = value;
    if (typeof payments === "string") {
        try {
            payments = JSON.parse(payments);
        } catch {
            throw new Error("回款计划 JSON 格式不正确");
        }
    }
    if (!Array.isArray(payments)) throw new Error("回款计划必须为数组");
    if (payments.length > MAX_SALES_ORDER_PAYMENT_PLANS) throw new Error("计划回款最多添加4组");
    if (strict && payments.length === 0) throw new Error("请至少添加1组计划回款");

    const result: StoredPaymentPlan[] = [];
    for (let index = 0; index < payments.length; index += 1) {
        const payment = payments[index];
        if (!payment || typeof payment !== "object" || Array.isArray(payment)) {
            throw new Error(`第${index + 1}组回款计划格式不正确`);
        }
        const date = normalizePaymentDate(payment.date, index);
        const rawAmount = payment.amount;
        if (rawAmount != null && typeof rawAmount !== "number" && typeof rawAmount !== "string") {
            throw new Error(`第${index + 1}组计划回款金额必须为有效数字`);
        }
        const amount = Number(rawAmount ?? 0);
        if (!Number.isFinite(amount) || amount < 0 || (strict && amount <= 0)) {
            throw new Error(`第${index + 1}组计划回款金额必须为${strict ? "正数" : "非负数字"}`);
        }
        if (strict && !date) throw new Error(`请选择第${index + 1}组计划回款日期`);
        if (payment.currency != null && typeof payment.currency !== "string") {
            throw new Error(`第${index + 1}组计划回款币种不合法`);
        }
        const previousCurrency = previousPayments[index]?.currency;
        const currency = String(hasOwn(payment, "currency")
            ? payment.currency ?? ""
            : previousCurrency || fallbackCurrency).trim().toUpperCase();
        if (strict && !currency) throw new Error(`请选择第${index + 1}组计划回款币种`);
        result.push({ date, amount, currency });
    }
    return result;
};

export const buildSalesOrderPaymentUpdate = (
    payload: Record<string, unknown>,
    existing?: SalesOrderPaymentState,
): Partial<PaymentUpdate> => {
    const hasPayments = hasOwn(payload, "plannedPayments");
    const hasLegacyFields = hasOwn(payload, "plannedPaymentDate") || hasOwn(payload, "plannedPaymentAmount");
    const hasReceivableField = hasOwn(payload, "hasReceivable");
    const hasCurrency = hasOwn(payload, "currency");
    const currency = String(payload.currency ?? existing?.currency ?? "").trim().toUpperCase();
    const previousPayments = existing ? getSalesOrderPaymentPlans(existing) : [];
    const hasReceivable = hasReceivableField
        ? ["true", "1", "yes", "y"].includes(String(payload.hasReceivable).trim().toLowerCase())
        : Boolean(existing?.hasReceivable || payload.receivableOrder || existing?.receivableOrder);
    // 新建只有草稿可以暂存未填完整的计划；更新同时兼容驳回订单的保存修改。
    const requestedStatus = String(payload.status ?? "").trim();
    const status = existing
        ? (requestedStatus || existing.status || "待审核")
        : (requestedStatus === "草稿" ? "草稿" : "待审核");
    const submitting = Boolean(existing && ["草稿", "已驳回"].includes(existing.status || "") && status === "待审核");
    if (existing && !hasPayments && !hasLegacyFields && !hasReceivableField && !hasCurrency && !submitting) return {};
    if (!hasReceivable) {
        // 即使移除应收单，显式传入的新字段也必须符合格式及条数约束。
        if (hasPayments) normalizeSalesOrderPaymentPlans(payload.plannedPayments);
        return { plannedPayments: [], plannedPaymentDate: null, plannedPaymentAmount: 0 };
    }

    let source: unknown;
    if (hasPayments) {
        source = payload.plannedPayments;
    } else if (existing?.plannedPayments && existing.plannedPayments.length > 1) {
        // 旧客户端只能提交单值，不允许覆盖已经保存的多组计划。
        source = previousPayments;
    } else if (hasLegacyFields) {
        const previous = previousPayments[0];
        source = [{
            date: hasOwn(payload, "plannedPaymentDate") ? payload.plannedPaymentDate : previous?.date,
            amount: hasOwn(payload, "plannedPaymentAmount") ? payload.plannedPaymentAmount : previous?.amount,
            currency: previous?.currency ?? currency,
        }];
    } else {
        source = previousPayments;
    }
    const isDraft = ["草稿", "已驳回"].includes(status);
    const enablingReceivable = hasReceivableField && !existing?.hasReceivable && !existing?.receivableOrder;
    const strict = !isDraft && (hasPayments || hasLegacyFields || submitting || !existing || enablingReceivable);
    const plannedPayments = normalizeSalesOrderPaymentPlans(source, strict, currency, previousPayments);
    let total = 0;
    for (const summary of getSalesOrderPaymentTotals({ plannedPayments })) {
        if (summary.currency === currency) total = summary.amount;
    }
    return {
        plannedPayments,
        plannedPaymentDate: plannedPayments[0]?.date || null,
        plannedPaymentAmount: total,
    };
};
