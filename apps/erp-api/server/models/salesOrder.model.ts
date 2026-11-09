import mongoose from "mongoose";
import { ADMIN_ROLE } from "~~/shared/enums";
import { MAX_SALES_ORDER_PAYMENT_PLANS, type SalesOrderPaymentPlanInput } from "~~/shared/types/salesOrderPayment";
import { buildSalesOrderPaymentUpdate, type SalesOrderPaymentState } from "~~/server/services/salesOrderPaymentPlan";
import { getSalesOrderRejectionCounts } from "~~/server/services/salesOrderRejection";
import { isSalesOrderEditLocked, SALES_ORDER_REJECTION_LIMIT, SALES_ORDER_REJECTION_LOCK_MESSAGE } from "~~/shared/utils/salesOrderRejection";
import {
    APPROVED_SALES_ORDER_STATUSES,
    buildSalesOrderApprovalFilter,
    markSalesOrderAuditRecordRejected,
    type SalesOrderApprovalResult,
} from "~~/server/services/salesOrderApproval";

const { Schema } = mongoose;

export const SALES_ORDER_STATUSES = [
    "草稿",
    "待审核",
    "已驳回",
    "待仓库复核",
    "待采购",
    "待生产",
    "生产中",
    "待出库",
    "已出库",
];

export const SALES_ORDER_EDITABLE_STATUSES = [
    "草稿",
    "已驳回",
];

export const SALES_ORDER_DEAL_STATUSES = [
    "已出库",
];

export const SALES_ORDER_CREATED_COUNT_STATUSES = SALES_ORDER_STATUSES.filter(
    (status) => status !== "草稿",
);

export interface SalesOrderReq {
    orderNo?: string;
    orderName?: string;
    customerId?: string | mongoose.Types.ObjectId;
    customerName?: string;
    customerCompany?: string;
    customerRegion?: string;
    salespersonId?: string | mongoose.Types.ObjectId | null;
    salespersonName?: string;
    orderType?: string;
    amount?: number | string;
    totalAmount?: number | string;
    dealAmount?: number | string;
    orderAmount?: number | string;
    currency?: string;
    status?: string;
    approvalTargetStatus?: string;
    orderDate?: string | Date;
    durationDays?: number | string;
    durationText?: string;
    orderImages?: Array<string | Record<string, any>>;
    attachments?: Array<string | Record<string, any>>;
    machineNo?: string;
    invoiceStatus?: string;
    contractNo?: string;
    sampleRequirement?: string;
    installationRequirement?: string;
    testingRequirement?: string;
    orderRemark?: string;
    hasShootingTask?: boolean | string;
    shootingRequirement?: string;
    paymentProgress?: number | string;
    receivableOrder?: string;
    hasReceivable?: boolean | string;
    receivableDate?: string | Date;
    incomeCategory?: string;
    plannedPayments?: SalesOrderPaymentPlanInput[] | string;
    plannedPaymentDate?: string | Date;
    plannedPaymentAmount?: number | string;
    actualReceivableAmount?: number | string;
    baseReceivedAmount?: number | string;
    receivedAmount?: number | string;
    receivableRemark?: string;
    receivableAttachments?: Array<string | Record<string, any>>;
    products?: Array<Record<string, any>> | string;
    creator?: string;
    remark?: string;
}

type SalesOrderAuditorSnapshot = {
    adminId: string;
    username: string;
    nickname: string;
    role?: number;
    auditOrder?: number;
    isFinalAuditor?: boolean;
};

const buildAuditRecords = (
    auditors: SalesOrderAuditorSnapshot[] = [],
    existingRecords: any[] = [],
) => {
    const existingMap = new Map(
        existingRecords.map((record) => [toText(record.adminId), record]),
    );

    return auditors.map((auditor) => {
        const existing = existingMap.get(auditor.adminId);
        return {
            adminId: new mongoose.Types.ObjectId(auditor.adminId),
            username: auditor.username,
            nickname: auditor.nickname,
            role: Number.isFinite(Number(auditor.role))
                ? Number(auditor.role)
                : Number(existing?.role ?? 999),
            auditOrder: Number(auditor.auditOrder || existing?.auditOrder || 0),
            isFinalAuditor: Boolean(auditor.isFinalAuditor ?? existing?.isFinalAuditor),
            approved: Boolean(existing?.approved),
            approvedAt: existing?.approvedAt || null,
            rejected: Boolean(existing?.rejected),
            rejectedById: existing?.rejectedById || null,
            rejectedByName: toText(existing?.rejectedByName),
            rejectedAt: existing?.rejectedAt || null,
            rejectReason: toText(existing?.rejectReason),
        };
    });
};

const hasFinalAuditRecord = (records: any[] = []) =>
    records.some((record) => Boolean(record?.isFinalAuditor));

export const isSalesOrderFullyApproved = (order: any) => {
    const records = Array.isArray(order?.auditRecords) ? order.auditRecords : [];
    return (
        records.length > 0 &&
        hasFinalAuditRecord(records) &&
        records.every((record) => Boolean(record?.approved))
    );
};

const getPendingNonFinalAuditRecords = (records: any[] = []) =>
    records.filter((record) =>
        !Boolean(record?.isFinalAuditor) &&
        !Boolean(record?.approved) &&
        !Boolean(record?.rejected),
    );

const canAuditRecordNow = (record: any, records: any[] = []) => {
    if (!record || Boolean(record.approved) || Boolean(record.rejected)) return false;
    if (!Boolean(record.isFinalAuditor)) return true;
    return getPendingNonFinalAuditRecords(records).length === 0;
};

const isOrderUnlockedStatus = (status: unknown) =>
    ["草稿", "已驳回"].includes(toText(status));

type SalesOrderListOptions = {
    keyword?: string;
    orderNo?: string;
    customerId?: string;
    salespersonId?: string;
    approvalAuditorId?: string;
    approvalResult?: SalesOrderApprovalResult;
    status?: string;
    orderType?: string;
    startDate?: string;
    endDate?: string;
    includeDeleted?: boolean;
    deletedOnly?: boolean;
    includePendingForAudit?: boolean;
    includeDrafts?: boolean;
    draftOnly?: boolean;
    draftOwner?: string;
    page?: number;
    limit?: number;
};

type SalesOrderAccessOptions = {
    role?: number;
    salespersonId?: string | null;
};

const salesOrderAuditRecordSchema = new Schema({
    adminId: {
        type: Schema.Types.ObjectId,
        ref: "Admin",
        required: true,
    },
    username: {
        type: String,
        default: "",
        trim: true,
    },
    nickname: {
        type: String,
        default: "",
        trim: true,
    },
    role: {
        type: Number,
        default: 999,
    },
    auditOrder: {
        type: Number,
        default: 0,
    },
    isFinalAuditor: {
        type: Boolean,
        default: false,
    },
    approved: {
        type: Boolean,
        default: false,
    },
    approvedAt: {
        type: Date,
        default: null,
    },
    rejected: {
        type: Boolean,
        default: false,
    },
    rejectedById: {
        type: Schema.Types.ObjectId,
        ref: "Admin",
        default: null,
    },
    rejectedByName: {
        type: String,
        default: "",
        trim: true,
    },
    rejectedAt: {
        type: Date,
        default: null,
    },
    rejectReason: {
        type: String,
        default: "",
        trim: true,
    },
});

const salesOrderAuditHistoryRoundSchema = new Schema(
    {
        roundNo: {
            type: Number,
            required: true,
            min: 1,
        },
        records: {
            type: [salesOrderAuditRecordSchema],
            default: [],
        },
    },
    { _id: false },
);

const salesOrderSchema = new Schema(
    {
        orderNo: {
            type: String,
            default: "",
            trim: true,
            index: true,
        },
        orderName: {
            type: String,
            default: "",
            trim: true,
        },
        customerId: {
            type: Schema.Types.ObjectId,
            ref: "Customer",
            required: true,
            index: true,
        },
        customerName: {
            type: String,
            default: "",
            trim: true,
        },
        customerCompany: {
            type: String,
            default: "",
            trim: true,
        },
        customerRegion: {
            type: String,
            default: "",
            trim: true,
        },
        salespersonId: {
            type: Schema.Types.ObjectId,
            ref: "Salesperson",
            default: null,
            index: true,
        },
        salespersonName: {
            type: String,
            default: "",
            trim: true,
        },
        orderType: {
            type: String,
            default: "",
            trim: true,
            index: true,
        },
        amount: {
            type: Number,
            default: 0,
            min: 0,
        },
        currency: {
            type: String,
            default: "CNY",
            trim: true,
        },
        status: {
            type: String,
            enum: SALES_ORDER_STATUSES,
            default: "待审核",
            trim: true,
            index: true,
        },
        approvalTargetStatus: {
            type: String,
            enum: ["待采购", "待生产", "待出库"],
            default: "待生产",
            trim: true,
        },
        auditRecords: {
            type: [salesOrderAuditRecordSchema],
            default: [],
        },
        auditHistory: {
            type: [salesOrderAuditHistoryRoundSchema],
            default: [],
        },
        rejectionCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        orderDate: {
            type: Date,
            default: Date.now,
            index: true,
        },
        durationDays: {
            type: Number,
            default: 0,
        },
        durationText: {
            type: String,
            default: "",
            trim: true,
        },
        orderImages: {
            type: [Schema.Types.Mixed],
            default: [],
        },
        attachments: {
            type: [Schema.Types.Mixed],
            default: [],
        },
        machineNo: {
            type: String,
            default: "",
            trim: true,
        },
        invoiceStatus: {
            type: String,
            default: "无需发票",
            trim: true,
        },
        contractNo: {
            type: String,
            default: "",
            trim: true,
            index: true,
        },
        sampleRequirement: {
            type: String,
            default: "",
        },
        installationRequirement: {
            type: String,
            default: "",
        },
        testingRequirement: {
            type: String,
            default: "",
        },
        orderRemark: {
            type: String,
            default: "",
        },
        hasShootingTask: {
            type: Boolean,
            default: false,
        },
        shootingRequirement: {
            type: String,
            default: "",
            trim: true,
        },
        paymentProgress: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        receivableOrder: {
            type: String,
            default: "",
            trim: true,
        },
        hasReceivable: {
            type: Boolean,
            default: false,
        },
        receivableDate: {
            type: Date,
            default: null,
        },
        incomeCategory: {
            type: String,
            default: "",
            trim: true,
        },
        plannedPayments: {
            type: [new Schema({
                date: { type: Date, default: null },
                amount: { type: Number, default: 0, min: 0 },
                currency: { type: String, trim: true, default: undefined },
            }, { _id: false })],
            default: [],
            validate: {
                validator: (payments: unknown[]) => payments.length <= MAX_SALES_ORDER_PAYMENT_PLANS,
                message: "计划回款最多添加4组",
            },
        },
        plannedPaymentDate: {
            type: Date,
            default: null,
        },
        plannedPaymentAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        actualReceivableAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        baseReceivedAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        receivedAmount: {
            type: Number,
            default: 0,
            min: 0,
        },
        receivableRemark: {
            type: String,
            default: "",
        },
        receivableAttachments: {
            type: [Schema.Types.Mixed],
            default: [],
        },
        products: {
            type: [Schema.Types.Mixed],
            default: [],
        },
        productionPlanVersion: { type: Number, default: 0 },
        // 仓库复核保存时的事务写锁，避免与删除订单并发提交。
        inventoryReviewVersion: { type: Number, default: 0 },
        // 仅新终审的订单写入；历史订单不回填，不进入仓库复核。
        inventoryReviewRequiredAt: { type: Date, default: null },
        inventoryReviewCompletedAt: { type: Date, default: null },
        inventoryReviewResult: { type: Schema.Types.Mixed, default: null },
        productionCompletionInitialized: { type: Boolean, default: true },
        productionCompletionRequired: { type: Boolean, default: false },
        productionCompletionReviewReason: { type: String, default: "" },
        productionCompletion: {
            type: new Schema({
                source: { type: String, enum: ["manual", "legacy"], required: true },
                confirmedAt: { type: Date, default: null },
                confirmedBy: { type: String, default: "" },
                operationId: { type: String, default: "" },
            }, { _id: false }),
            default: null,
        },
        creator: {
            type: String,
            default: "",
            trim: true,
        },
        remark: {
            type: String,
            default: "",
        },
        rejectionReason: {
            type: String,
            default: "",
            trim: true,
        },
        rejectedBy: {
            type: String,
            default: "",
            trim: true,
        },
        rejectedAt: {
            type: Date,
            default: null,
        },
        returnToAuditorId: {
            type: Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
        },
        returnToAuditorName: {
            type: String,
            default: "",
            trim: true,
        },
        returnToAuditOrder: {
            type: Number,
            default: 0,
        },
        returnApprovedBeforeAuditorIds: {
            type: [Schema.Types.ObjectId],
            default: [],
        },
        createdBy: {
            type: String,
            default: "",
        },
        updatedBy: {
            type: String,
            default: "",
        },
        _isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
        deletedBy: {
            type: String,
            default: "",
        },
    },
    {
        versionKey: false,
        timestamps: {
            createdAt: "createTime",
            updatedAt: "updateTime",
        },
    },
);

salesOrderSchema.index({ _isDeleted: 1, customerId: 1, status: 1, orderDate: -1 });
salesOrderSchema.index({ _isDeleted: 1, salespersonId: 1, status: 1, orderDate: -1 });
salesOrderSchema.index({ _isDeleted: 1, status: 1, orderType: 1, orderDate: -1 });
salesOrderSchema.index({ _isDeleted: 1, orderDate: -1, updateTime: -1 });
salesOrderSchema.index({ "auditRecords.adminId": 1, status: 1, _isDeleted: 1 });
salesOrderSchema.index({ "auditHistory.records.adminId": 1, status: 1, _isDeleted: 1 });

const SalesOrder =
    mongoose.models.SalesOrder || mongoose.model("SalesOrder", salesOrderSchema);

const toText = (value: unknown) => {
    if (value == null) return "";
    return String(value).trim();
};

const toObjectId = (value: unknown) => {
    const text = toText(value);
    if (!text || !mongoose.Types.ObjectId.isValid(text)) return null;
    return new mongoose.Types.ObjectId(text);
};

const isSalesOrderOwner = (order: any, access: SalesOrderAccessOptions, _actor = "") => {
    if (Number(access.role) === ADMIN_ROLE.SUPER) {
        const actor = toText(_actor);
        const creator = toText(order?.createdBy) || toText(order?.creator);
        return Boolean(actor && creator && actor === creator);
    }

    if (Number(access.role) !== ADMIN_ROLE.SELLER) return false;

    const salespersonId = toText(access.salespersonId);
    const orderSalespersonId = order?.salespersonId?.toString?.() || "";
    return Boolean(salespersonId && orderSalespersonId && orderSalespersonId === salespersonId);
};

const toAmount = (value: unknown) => {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num) || num < 0) {
        throw new Error("订单金额必须为非负数字");
    }
    return num;
};

const toPercent = (value: unknown) => {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(100, num));
};

const toBoolean = (value: unknown) => {
    if (typeof value === "boolean") return value;
    const text = toText(value).toLowerCase();
    return ["true", "1", "yes", "y"].includes(text);
};

const toArray = (value: unknown) => {
    if (Array.isArray(value)) return value;
    if (value == null || value === "") return [];
    return [value];
};

const toMixedArray = (value: unknown) => {
    if (Array.isArray(value)) return value;
    if (value == null || value === "") return [];
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
            return [value];
        }
    }
    return [value];
};

const toDate = (value: unknown, fallback: Date | null = new Date(), label = "订单日期") => {
    if (!value) return fallback;
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
        throw new Error(`${label}不合法`);
    }
    return date;
};

const hasOwn = (payload: Record<string, any>, field: string) =>
    Object.prototype.hasOwnProperty.call(payload, field);

const resolveApprovalTargetStatus = (products: any[]) => {
    const hasShortage = products.some((product) => {
        const quantity = Number(product?.quantity || 0);
        const availableQuantity = Number(product?.availableQuantity || 0);
        return quantity > availableQuantity;
    });

    return hasShortage ? "待采购" : "待出库";
};

const formatDateCode = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
};

class SalesOrderModel {
    order: typeof SalesOrder;

    constructor(order: typeof SalesOrder) {
        this.order = order;
    }

    private normalizePayload(payload: SalesOrderReq = {}, partial = false, existing?: SalesOrderPaymentState) {
        const data: Record<string, any> = {};
        const rawPayload = payload as Record<string, any>;
        // 整单机器号由生产单下达时回填，不接受客户端写入。

        if (hasOwn(rawPayload, "orderNo") || !partial) data.orderNo = toText(payload.orderNo);
        if (hasOwn(rawPayload, "orderName") || !partial) data.orderName = toText(payload.orderName);
        if (hasOwn(rawPayload, "customerName") || !partial) data.customerName = toText(payload.customerName);
        if (hasOwn(rawPayload, "customerCompany") || !partial) data.customerCompany = toText(payload.customerCompany);
        if (hasOwn(rawPayload, "customerRegion") || !partial) data.customerRegion = toText(payload.customerRegion);
        if (hasOwn(rawPayload, "salespersonName") || !partial) data.salespersonName = toText(payload.salespersonName);
        if (hasOwn(rawPayload, "orderType") || !partial) data.orderType = toText(payload.orderType);
        if (hasOwn(rawPayload, "currency") || !partial) data.currency = toText(payload.currency) || "CNY";
        if (hasOwn(rawPayload, "status") || !partial) {
            const status = partial
                ? toText(payload.status)
                : toText(payload.status) || "待审核";
            if (status) {
                if (!SALES_ORDER_STATUSES.includes(status)) {
                    throw new Error("订单状态无效");
                }
                data.status = status;
            }
        }
        if (hasOwn(rawPayload, "approvalTargetStatus") || !partial) {
            const approvalTargetStatus = toText(payload.approvalTargetStatus);
            if (approvalTargetStatus) {
                if (!["待采购", "待生产", "待出库"].includes(approvalTargetStatus)) {
                    throw new Error("审核通过后的订单状态无效");
                }
                data.approvalTargetStatus = approvalTargetStatus;
            }
        }
        if (hasOwn(rawPayload, "remark") || !partial) data.remark = toText(payload.remark);
        if (hasOwn(rawPayload, "durationText") || !partial) data.durationText = toText(payload.durationText);
        if (hasOwn(rawPayload, "invoiceStatus") || !partial) data.invoiceStatus = toText(payload.invoiceStatus) || "无需发票";
        if (hasOwn(rawPayload, "contractNo") || !partial) data.contractNo = toText(payload.contractNo);
        if (hasOwn(rawPayload, "sampleRequirement") || !partial) data.sampleRequirement = toText(payload.sampleRequirement);
        if (hasOwn(rawPayload, "installationRequirement") || !partial) data.installationRequirement = toText(payload.installationRequirement);
        if (hasOwn(rawPayload, "testingRequirement") || !partial) data.testingRequirement = toText(payload.testingRequirement);
        if (hasOwn(rawPayload, "orderRemark") || !partial) data.orderRemark = toText(payload.orderRemark);
        if (hasOwn(rawPayload, "shootingRequirement") || !partial) data.shootingRequirement = toText(payload.shootingRequirement);
        if (hasOwn(rawPayload, "receivableOrder") || !partial) data.receivableOrder = toText(payload.receivableOrder);
        if (hasOwn(rawPayload, "incomeCategory") || !partial) data.incomeCategory = toText(payload.incomeCategory);
        if (hasOwn(rawPayload, "receivableRemark") || !partial) data.receivableRemark = toText(payload.receivableRemark);
        if (hasOwn(rawPayload, "creator") || !partial) data.creator = toText(payload.creator);
        if (hasOwn(rawPayload, "attachments") || !partial) {
            data.attachments = toMixedArray(payload.attachments);
        }

        if (hasOwn(rawPayload, "orderImages") || !partial) {
            data.orderImages = toMixedArray(payload.orderImages);
        }

        if (hasOwn(rawPayload, "receivableAttachments") || !partial) {
            data.receivableAttachments = toMixedArray(payload.receivableAttachments);
        }

        if (hasOwn(rawPayload, "products") || !partial) {
            data.products = toMixedArray(payload.products);
        }

        if (hasOwn(rawPayload, "hasReceivable") || !partial) {
            data.hasReceivable = hasOwn(rawPayload, "hasReceivable")
                ? toBoolean(payload.hasReceivable)
                : Boolean(toText(payload.receivableOrder));
        }

        if (hasOwn(rawPayload, "hasShootingTask") || !partial) {
            data.hasShootingTask = toBoolean(payload.hasShootingTask);
        }

        if (hasOwn(rawPayload, "durationDays") || !partial) {
            const durationDays = Number(payload.durationDays ?? 0);
            data.durationDays = Number.isFinite(durationDays) && durationDays > 0 ? durationDays : 0;
        }

        if (hasOwn(rawPayload, "paymentProgress") || !partial) {
            data.paymentProgress = toPercent(payload.paymentProgress);
        }

        if (hasOwn(rawPayload, "actualReceivableAmount") || !partial) {
            data.actualReceivableAmount = toAmount(payload.actualReceivableAmount ?? 0);
        }

        if (hasOwn(rawPayload, "baseReceivedAmount") || !partial) {
            data.baseReceivedAmount = toAmount(
                payload.baseReceivedAmount ?? payload.receivedAmount ?? 0,
            );
        }

        if (hasOwn(rawPayload, "receivedAmount") || !partial) {
            data.receivedAmount = toAmount(payload.receivedAmount ?? 0);
        }

        if (hasOwn(rawPayload, "baseReceivedAmount") || !partial) {
            data.receivedAmount = Number(data.baseReceivedAmount || 0);
        }

        if (hasOwn(rawPayload, "customerId") || !partial) {
            const customerId = toObjectId(payload.customerId);
            if (!customerId) throw new Error("缺少有效客户ID");
            data.customerId = customerId;
        }

        if (hasOwn(rawPayload, "salespersonId") || !partial) {
            data.salespersonId = payload.salespersonId ? toObjectId(payload.salespersonId) : null;
        }

        if (
            hasOwn(rawPayload, "amount") ||
            hasOwn(rawPayload, "totalAmount") ||
            hasOwn(rawPayload, "dealAmount") ||
            hasOwn(rawPayload, "orderAmount") ||
            !partial
        ) {
            data.amount = toAmount(
                payload.amount ??
                payload.totalAmount ??
                payload.dealAmount ??
                payload.orderAmount ??
                0,
            );
        }

        if (hasOwn(rawPayload, "orderDate") || !partial) {
            data.orderDate = toDate(payload.orderDate, new Date(), "派单日期");
        }

        if (hasOwn(rawPayload, "receivableDate") || !partial) {
            data.receivableDate = toDate(payload.receivableDate, null, "应收日期");
        }

        if (
            hasOwn(rawPayload, "actualReceivableAmount")
            || hasOwn(rawPayload, "baseReceivedAmount")
            || hasOwn(rawPayload, "receivedAmount")
        ) {
            const actualReceivableAmount = Number(data.actualReceivableAmount ?? payload.actualReceivableAmount ?? 0);
            const receivedAmount = Number(data.receivedAmount ?? payload.receivedAmount ?? 0);
            data.paymentProgress = actualReceivableAmount > 0
                ? toPercent((receivedAmount / actualReceivableAmount) * 100)
                : 0;
        }

        const paymentPayload = hasOwn(data, "currency") ? { ...rawPayload, currency: data.currency } : rawPayload;
        Object.assign(data, buildSalesOrderPaymentUpdate(paymentPayload, existing));
        return data;
    }

    private async generateNo(
        prefix: "DD" | "YS",
        session?: mongoose.ClientSession,
    ) {
        const today = new Date();
        const code = formatDateCode(today);
        const field = prefix === "DD" ? "orderNo" : "receivableOrder";
        const regex = new RegExp(`^${prefix}-${code}-`);
        const query = this.order.countDocuments({ [field]: regex });
        if (session) query.session(session);
        const count = await query;
        return `${prefix}-${code}-${String(count + 1).padStart(3, "0")}`;
    }

    async create(
        payload: SalesOrderReq,
        actor = "",
        session?: mongoose.ClientSession,
    ) {
        const data = this.normalizePayload(payload);
        const isDraft = toText(data.status) === "草稿";
        if (!data.hasShootingTask) {
            data.shootingRequirement = "";
        }
        if (!isDraft && data.hasShootingTask && !toText(data.shootingRequirement)) {
            throw new Error("请填写拍摄要求");
        }
        if (!isDraft && !data.orderNo) {
            data.orderNo = await this.generateNo("DD", session);
        }
        if (!isDraft && data.hasReceivable && !data.receivableOrder) {
            data.receivableOrder = await this.generateNo("YS", session);
        }
        data.status = isDraft ? "草稿" : "待审核";
        data.approvalTargetStatus =
            data.approvalTargetStatus || resolveApprovalTargetStatus(data.products || []);
        data.createdBy = actor;
        data.updatedBy = actor;
        const order = new this.order(data);
        return await order.save(session ? { session } : {});
    }

    async findActiveById(id: string, session?: mongoose.ClientSession) {
        const objectId = toObjectId(id);
        if (!objectId) throw new Error("缺少有效订单ID");

        const query = this.order.findOne({
            _id: objectId,
            _isDeleted: { $ne: true },
        });
        if (session) query.session(session);
        return await query;
    }

    async findProductSnExportOrder(
        id: mongoose.Types.ObjectId,
        session?: mongoose.ClientSession,
    ) {
        const query = this.order.findOne({ _id: id, _isDeleted: { $ne: true } }).select("createTime");
        if (session) query.session(session);
        return await query.lean();
    }

    async findPurchaseRequestOrderDetail(id: mongoose.Types.ObjectId) {
        return await this.order.findById(id).select([
            "_isDeleted",
            "orderNo",
            "salespersonName",
            "orderType",
            "products.productId",
            "products.quantity",
            "products.productCode",
            "products.model",
            "products.image",
            "products.availableQuantity",
            "products.unitName",
            "products.source",
            "products.remark",
        ]).lean();
    }

    async findByIds(
        ids: mongoose.Types.ObjectId[],
        mode: "summary" | "detail",
    ) {
        if (ids.length === 0) return [];
        const fields = mode === "summary"
            ? ["orderNo"]
            : [
                "orderNo",
                "orderName",
                "customerId",
                "customerName",
                "customerCompany",
                "customerRegion",
                "salespersonId",
                "salespersonName",
                "orderType",
                "amount",
                "currency",
                "orderDate",
                "durationDays",
                "machineNo",
                "receivableOrder",
                "receivableDate",
                "incomeCategory",
                "plannedPayments",
                "plannedPaymentDate",
                "plannedPaymentAmount",
                "actualReceivableAmount",
                "receivableRemark",
                "receivableAttachments",
                "createTime",
            ];
        return await this.order.find({ _id: { $in: ids } }).select(fields).lean();
    }

    async update(id: string, payload: SalesOrderReq, actor = "") {
        const objectId = toObjectId(id);
        if (!objectId) throw new Error("缺少有效订单ID");

        const existing = await this.order.findOne({ _id: objectId, _isDeleted: { $ne: true } }).lean();
        if (!existing) throw new Error("订单不存在");
        const rejectionCount = await this.getEditableRejectionCount(existing);
        const data = this.normalizePayload(payload, true, existing);
        if (Object.keys(data).length === 0) return await this.order.findById(objectId);
        data.rejectionCount = rejectionCount;
        data.updatedBy = actor;

        const updated = await this.order.findOneAndUpdate(
            {
                _id: objectId,
                _isDeleted: { $ne: true },
                status: existing.status,
                $or: [{ rejectionCount: { $lt: SALES_ORDER_REJECTION_LIMIT } }, { rejectionCount: { $exists: false } }],
            },
            data,
            { new: true, runValidators: true },
        );
        if (!updated) throw new Error("订单状态或驳回次数已变化，请刷新后重试");
        return updated;
    }

    private async getEditableRejectionCount(order: any, session?: mongoose.ClientSession) {
        const counts = await getSalesOrderRejectionCounts([order], session);
        const rejectionCount = counts.get(order._id.toString()) || 0;
        if (isSalesOrderEditLocked({ rejectionCount })) throw new Error(SALES_ORDER_REJECTION_LOCK_MESSAGE);
        return rejectionCount;
    }

    async preserveRejectionCount(id: string, session?: mongoose.ClientSession) {
        const objectId = toObjectId(id);
        if (!objectId) return;
        const query = this.order.findById(objectId).lean();
        if (session) query.session(session);
        const order = await query;
        if (!order) return;
        const counts = await getSalesOrderRejectionCounts([order], session);
        await this.order.updateOne(
            { _id: objectId },
            { $max: { rejectionCount: counts.get(objectId.toString()) || 0 } },
            session ? { session } : {},
        );
    }

    async syncPendingAuditRecordsForList(
        orders: any[] = [],
        auditors: SalesOrderAuditorSnapshot[] = [],
    ) {
        if (!Array.isArray(orders) || orders.length === 0) return [];

        const pendingOrders = orders.filter((order) => toText(order?.status) === "待审核");
        if (pendingOrders.length === 0) return [];

        const approvedOrders = await Promise.all(
            pendingOrders.map(async (order) => {
                const syncedRecords = buildAuditRecords(
                    auditors,
                    Array.isArray(order.auditRecords) ? order.auditRecords : [],
                );
                const hasChanged =
                    syncedRecords.length !== (Array.isArray(order.auditRecords) ? order.auditRecords.length : 0) ||
                    syncedRecords.some((record, index) => {
                        const oldRecord = order.auditRecords?.[index] || {};
                        return (
                            toText(record.adminId) !== toText(oldRecord.adminId) ||
                            record.username !== oldRecord.username ||
                            record.nickname !== oldRecord.nickname ||
                            Number(record.role) !== Number(oldRecord.role ?? 999) ||
                            Number(record.auditOrder || 0) !== Number(oldRecord.auditOrder || 0) ||
                            Boolean(record.isFinalAuditor) !== Boolean(oldRecord.isFinalAuditor) ||
                            Boolean(record.approved) !== Boolean(oldRecord.approved) ||
                            toText(record.approvedAt) !== toText(oldRecord.approvedAt)
                        );
                    });

                if (!hasChanged) return;

                order.auditRecords = syncedRecords;
                const result = await this.order.updateOne(
                    { _id: order._id, status: "待审核", _isDeleted: { $ne: true } },
                    { $set: { auditRecords: syncedRecords } },
                );
                if (result.matchedCount === 0) return null;

                return isSalesOrderFullyApproved(order) ? order : null;
            }),
        );

        return approvedOrders.filter(Boolean);
    }

    async syncPendingAuditRecords(auditors: SalesOrderAuditorSnapshot[] = []) {
        const pendingOrders = await this.order
            .find({ status: "待审核", _isDeleted: { $ne: true } })
            .lean();
        return await this.syncPendingAuditRecordsForList(pendingOrders, auditors);
    }

    async updateWithAccess(
        id: string,
        payload: SalesOrderReq,
        access: SalesOrderAccessOptions,
        actor = "",
        session?: mongoose.ClientSession,
    ) {
        const objectId = toObjectId(id);
        if (!objectId) throw new Error("缺少有效订单ID");

        const existingQuery = this.order
            .findOne({ _id: objectId, _isDeleted: { $ne: true } })
            .lean();
        if (session) existingQuery.session(session);
        const existing = await existingQuery as any;
        if (!existing) throw new Error("订单不存在");
        this.assertCanMutate(existing, access, "修改", actor);
        const rejectionCount = await this.getEditableRejectionCount(existing, session);

        const data = this.normalizePayload(payload, true, existing);
        const { ensureSalesOrderCompletionState, hasSalesOrderCompletionRelease } = await import("~~/server/services/salesOrderCompletionState");
        const completionState = await ensureSalesOrderCompletionState(existing, session);
        const hasCompletionRelease = hasSalesOrderCompletionRelease(completionState);
        if (
            completionState.productionCompletionRequired === true && !hasCompletionRelease &&
            hasOwn(payload as Record<string, any>, "status") && ["待出库", "已出库"].includes(toText(data.status))
        ) {
            throw new Error("生产订单必须通过订单完工确认后才能放行出库");
        }
        if (hasCompletionRelease) {
            if (hasOwn(payload as Record<string, any>, "status") && toText(data.status) !== toText(completionState.status)) {
                throw new Error("订单已放行，状态只能随实际销售出库或撤销出库更新");
            }
            if (hasOwn(payload as Record<string, any>, "products") && JSON.stringify(data.products) !== JSON.stringify(completionState.products)) {
                throw new Error("订单已放行，不能修改销售产品及数量");
            }
        }
        const isSubmittingForAudit =
            isOrderUnlockedStatus(existing.status) &&
            hasOwn(payload as Record<string, any>, "status") &&
            toText(data.status) === "待审核";
        const hasShootingTask = hasOwn(payload as Record<string, any>, "hasShootingTask")
            ? Boolean(data.hasShootingTask)
            : Boolean(existing.hasShootingTask);
        const shootingRequirement = hasOwn(payload as Record<string, any>, "shootingRequirement")
            ? toText(data.shootingRequirement)
            : toText(existing.shootingRequirement);
        if (isSubmittingForAudit && hasShootingTask && !shootingRequirement) {
            throw new Error("请填写拍摄要求");
        }
        if (hasOwn(payload as Record<string, any>, "hasShootingTask") && !hasShootingTask) {
            data.shootingRequirement = "";
        }
        if (
            (isSubmittingForAudit || !isOrderUnlockedStatus(data.status)) &&
            data.hasReceivable &&
            !data.receivableOrder &&
            !existing.receivableOrder
        ) {
            data.receivableOrder = await this.generateNo("YS", session);
        }
        if (isSubmittingForAudit && !toText(existing.orderNo) && !toText(data.orderNo)) {
            data.orderNo = await this.generateNo("DD", session);
        }
        if (hasOwn(payload as Record<string, any>, "hasReceivable") && !data.hasReceivable) {
            data.receivableOrder = "";
            data.receivableDate = null;
            data.incomeCategory = "";
            data.plannedPayments = [];
            data.plannedPaymentDate = null;
            data.plannedPaymentAmount = 0;
            data.actualReceivableAmount = 0;
            data.baseReceivedAmount = 0;
            data.receivedAmount = 0;
            data.paymentProgress = 0;
            data.receivableRemark = "";
            data.receivableAttachments = [];
        }
        if (
            Number(access.role) !== 0 &&
            hasOwn(payload as Record<string, any>, "status") &&
            toText(data.status) !== toText(existing.status) &&
            !isSubmittingForAudit
        ) {
            throw new Error("无权变更订单状态");
        }
        if (
            Number(access.role) !== 0 &&
            hasOwn(payload as Record<string, any>, "salespersonId") &&
            toText(data.salespersonId) !== toText(existing.salespersonId)
        ) {
            throw new Error("无权变更订单归属");
        }
        if (Object.keys(data).length === 0) return existing;
        if (hasOwn(payload as Record<string, any>, "products")) {
            data.approvalTargetStatus = resolveApprovalTargetStatus(data.products || []);
        }
        data.updatedBy = actor;
        data.rejectionCount = rejectionCount;

        const updateFilter: Record<string, any> = {
            _id: objectId,
            _isDeleted: { $ne: true },
            status: existing.status,
            $or: [{ rejectionCount: { $lt: SALES_ORDER_REJECTION_LIMIT } }, { rejectionCount: { $exists: false } }],
        };
        const updated = await this.order.findOneAndUpdate(
            updateFilter,
            data,
            {
                new: true,
                runValidators: true,
                ...(session ? { session } : {}),
            },
        );
        if (!updated) {
            throw new Error("订单状态或驳回次数已变化，请刷新后重试");
        }
        return updated;
    }

    async updateStatus(
        id: string,
        status: string,
        actor: string,
        session: mongoose.ClientSession,
        details: {
            expectedStatus?: string;
            rejectionReason?: string;
            rejectedBy?: string;
            rejectedAt?: Date;
            rejectionInstanceId?: mongoose.Types.ObjectId;
        } = {},
    ) {
        const objectId = toObjectId(id);
        if (!objectId) throw new Error("缺少有效订单ID");

        let rejectionCount: number | undefined;
        if (details.rejectionInstanceId) {
            const order = await this.order.findById(objectId).session(session).lean();
            if (!order) throw new Error("订单不存在");
            // 本轮实例已经变为 rejected，先排除它再累计，避免首次驳回被算作两次。
            const counts = await getSalesOrderRejectionCounts([order], session, details.rejectionInstanceId);
            rejectionCount = (counts.get(objectId.toString()) || 0) + 1;
        }
        const updated = await this.order.findOneAndUpdate(
            {
                _id: objectId,
                _isDeleted: { $ne: true },
                ...(details.expectedStatus ? { status: details.expectedStatus } : {}),
            },
            {
                $set: {
                    status,
                    ...(rejectionCount !== undefined ? { rejectionCount } : {}),
                    ...(details.rejectionReason !== undefined
                        ? { rejectionReason: details.rejectionReason }
                        : {}),
                    ...(details.rejectedBy !== undefined
                        ? { rejectedBy: details.rejectedBy }
                        : {}),
                    ...(details.rejectedAt !== undefined
                        ? { rejectedAt: details.rejectedAt }
                        : {}),
                    updatedBy: actor,
                },
            },
            { new: true, runValidators: true, session },
        );
        if (!updated) {
            throw new Error(
                details.expectedStatus
                    ? "订单状态已变化，请刷新后重试"
                    : "订单不存在",
            );
        }
        return updated;
    }

    async approve(
        id: string,
        auditor: SalesOrderAuditorSnapshot,
        actor = "",
        auditors: SalesOrderAuditorSnapshot[] = [],
    ) {
        const objectId = toObjectId(id);
        if (!objectId) throw new Error("缺少有效订单ID");

        const existing = await this.order.findOne({ _id: objectId, _isDeleted: { $ne: true } }) as any;
        if (!existing) throw new Error("订单不存在");
        if (toText(existing.status) !== "待审核") {
            throw new Error("当前订单不处于待审核状态");
        }

        const auditorId = toObjectId(auditor.adminId);
        if (!auditorId) throw new Error("缺少审核人ID");

        if (auditors.length > 0) {
            existing.auditRecords = buildAuditRecords(
                auditors,
                Array.isArray(existing.auditRecords) ? existing.auditRecords : [],
            );
        }

        const records = Array.isArray(existing.auditRecords) ? existing.auditRecords : [];
        if (records.length === 0) {
            throw new Error("当前订单没有配置审核人");
        }

        const targetRecord = records.find((record: any) => toText(record.adminId) === toText(auditorId));
        if (!targetRecord) {
            throw new Error("你不是该订单的审核人");
        }
        if (targetRecord.approved) {
            if (isSalesOrderFullyApproved(existing)) {
                return existing;
            }
            throw new Error("你已审核通过该订单");
        }

        if (!canAuditRecordNow(targetRecord, records)) {
            const pendingNames = getPendingNonFinalAuditRecords(records)
                .map((record: any) => record.nickname || record.username)
                .filter(Boolean)
                .join("、");
            throw new Error(`请等待${pendingNames || "前序审核人"}先审核通过`);
        }

        targetRecord.approved = true;
        targetRecord.approvedAt = new Date();
        targetRecord.username = targetRecord.username || auditor.username;
        targetRecord.nickname = targetRecord.nickname || auditor.nickname;
        targetRecord.role = Number.isFinite(Number(auditor.role)) ? Number(auditor.role) : targetRecord.role;
        targetRecord.isFinalAuditor = Boolean(auditor.isFinalAuditor ?? targetRecord.isFinalAuditor);

        existing.updatedBy = actor;
        await existing.save();
        return existing;
    }

    async reject(
        id: string,
        auditor: SalesOrderAuditorSnapshot,
        reason: string,
        returnToAuditorId: unknown = "",
        actor = "",
        auditors: SalesOrderAuditorSnapshot[] = [],
    ) {
        const objectId = toObjectId(id);
        if (!objectId) throw new Error("缺少有效订单ID");

        const rejectionReason = toText(reason);
        if (!rejectionReason) throw new Error("请填写驳回原因");

        const existing = await this.order.findOne({ _id: objectId, _isDeleted: { $ne: true } }) as any;
        if (!existing) throw new Error("订单不存在");
        if (toText(existing.status) !== "待审核") {
            throw new Error("当前订单不处于待审核状态");
        }

        const auditorId = toObjectId(auditor.adminId);
        if (!auditorId) throw new Error("缺少审核人ID");

        if (auditors.length > 0) {
            existing.auditRecords = buildAuditRecords(
                auditors,
                Array.isArray(existing.auditRecords) ? existing.auditRecords : [],
            );
        }

        const records = Array.isArray(existing.auditRecords) ? existing.auditRecords : [];
        if (records.length === 0) {
            throw new Error("当前订单没有配置审核人");
        }

        const targetRecord = records.find((record: any) => toText(record.adminId) === toText(auditorId));
        if (!targetRecord) {
            throw new Error("你不是该订单的审核人");
        }
        if (targetRecord.approved) {
            throw new Error("你已审核通过该订单");
        }
        if (!canAuditRecordNow(targetRecord, records)) {
            const pendingNames = getPendingNonFinalAuditRecords(records)
                .map((record: any) => record.nickname || record.username)
                .filter(Boolean)
                .join("、");
            throw new Error(`请等待${pendingNames || "前序审核人"}先审核通过`);
        }
        const approvedRecords = records
            .filter((record: any) => Boolean(record.approved))
            .sort((a: any, b: any) => {
                const timeA = a.approvedAt ? new Date(a.approvedAt).getTime() : 0;
                const timeB = b.approvedAt ? new Date(b.approvedAt).getTime() : 0;
                return timeA - timeB;
            });
        const returnTargetId = toText(returnToAuditorId) || (
            approvedRecords.length === 0 ? toText(targetRecord.adminId) : ""
        );
        const returnTargetRecord = records.find((record: any) => toText(record.adminId) === returnTargetId);
        if (!returnTargetRecord) {
            throw new Error("请选择有效的退回审批人");
        }
        const approvedTargetIndex = approvedRecords.findIndex(
            (record: any) => toText(record.adminId) === returnTargetId,
        );
        if (approvedRecords.length > 0 && approvedTargetIndex < 0) {
            throw new Error("只能退回到已经审核通过的人");
        }
        const approvedBeforeAuditorIds = approvedTargetIndex > 0
            ? approvedRecords.slice(0, approvedTargetIndex).map((record: any) => record.adminId)
            : [];
        const rejectedAt = new Date();
        const rejectedByName = actor || auditor.nickname || auditor.username || "";
        const rejectionCounts = await getSalesOrderRejectionCounts([existing.toObject()]);
        existing.rejectionCount = (rejectionCounts.get(objectId.toString()) || 0) + 1;
        markSalesOrderAuditRecordRejected(records, auditorId, {
            rejectedById: auditorId,
            rejectedByName,
            rejectedAt,
            rejectReason: rejectionReason,
        });

        existing.status = "已驳回";
        existing.rejectionReason = rejectionReason;
        existing.rejectedBy = rejectedByName;
        existing.rejectedAt = rejectedAt;
        existing.returnToAuditorId = returnTargetRecord.adminId;
        existing.returnToAuditorName = returnTargetRecord.nickname || returnTargetRecord.username || "";
        existing.returnToAuditOrder = Number(returnTargetRecord.auditOrder || 0);
        existing.returnApprovedBeforeAuditorIds = approvedBeforeAuditorIds;
        existing.updatedBy = actor;
        await existing.save();
        return existing;
    }

    async revokeAuditWithAccess(id: string, access: SalesOrderAccessOptions, actor = "") {
        const objectId = toObjectId(id);
        if (!objectId) throw new Error("缺少有效订单ID");

        const existing = await this.order.findOne({ _id: objectId, _isDeleted: { $ne: true } }) as any;
        if (!existing) throw new Error("订单不存在");
        if (toText(existing.status) !== "待审核") {
            throw new Error("仅待审核订单可以撤销");
        }

        if (!isSalesOrderOwner(existing, access, actor)) {
            throw new Error("仅发起该订单的销售可以撤销审核");
        }

        existing.status = "草稿";
        existing.auditRecords = [];
        existing.updatedBy = actor;
        await existing.save();
        return existing;
    }

    async softDelete(ids: string[], actor = "") {
        const objectIds = ids
            .map((id) => toObjectId(id))
            .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
        if (objectIds.length === 0) throw new Error("缺少有效订单ID");

        await this.order.updateMany(
            { _id: { $in: objectIds }, _isDeleted: { $ne: true } },
            {
                _isDeleted: true,
                deletedAt: new Date(),
                deletedBy: actor,
                updatedBy: actor,
            },
        );
    }

    async softDeleteWithAccess(ids: string[], access: SalesOrderAccessOptions, actor = "", session?: mongoose.ClientSession) {
        const objectIds = ids
            .map((id) => toObjectId(id))
            .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
        if (objectIds.length === 0) throw new Error("缺少有效订单ID");

        const query = this.order.find({ _id: { $in: objectIds }, _isDeleted: { $ne: true } });
        if (session) query.session(session);
        const orders = await query.lean() as any[];
        if (orders.length !== objectIds.length) throw new Error("订单不存在或已删除");
        const deletableStatuses = new Set(["草稿", "已驳回"]);
        const canDeleteOwnOrders = Number(access.role) === ADMIN_ROLE.SUPER || orders.every((order: any) =>
            deletableStatuses.has(toText(order.status)) && isSalesOrderOwner(order, access, actor),
        );
        if (!canDeleteOwnOrders) {
            throw new Error("仅订单创建人或发起销售可以删除草稿或已驳回订单");
        }

        await this.order.updateMany(
            { _id: { $in: objectIds }, _isDeleted: { $ne: true } },
            {
                _isDeleted: true,
                deletedAt: new Date(),
                deletedBy: actor,
                updatedBy: actor,
            },
            { session },
        );
    }

    async restoreWithAccess(ids: string[], access: SalesOrderAccessOptions, actor = "", session?: mongoose.ClientSession) {
        if (Number(access.role) !== ADMIN_ROLE.SUPER) throw new Error("仅超级管理员可以恢复订单");
        const objectIds = ids.map((id) => toObjectId(id)).filter((id): id is mongoose.Types.ObjectId => Boolean(id));
        if (!objectIds.length) throw new Error("缺少有效订单ID");
        const query = this.order.countDocuments({ _id: { $in: objectIds }, _isDeleted: true });
        if (session) query.session(session);
        const matchedCount = await query;
        if (matchedCount !== objectIds.length) throw new Error("订单不存在或未删除");
        const result = await this.order.updateMany(
            { _id: { $in: objectIds }, _isDeleted: true },
            { $set: { _isDeleted: false, updatedBy: actor }, $unset: { deletedAt: 1, deletedBy: 1 } },
            { session },
        );
        if (result.matchedCount !== objectIds.length) throw new Error("订单不存在或未删除");
        return { restoredCount: result.modifiedCount || 0, warning: "订单已恢复，请重新执行库存/采购分析" };
    }

    async retrieve(options: SalesOrderListOptions = {}) {
        const page = Math.max(1, Number(options.page || 1));
        const limit = Math.min(100, Math.max(1, Number(options.limit || 20)));
        const skip = (page - 1) * limit;
        const approvalAuditorId = toObjectId(options.approvalAuditorId);
        const isApprovalQuery = Boolean(approvalAuditorId);
        const filter: Record<string, any> = options.deletedOnly
            ? { _isDeleted: true }
            : isApprovalQuery || options.includeDeleted
                ? {}
                : { _isDeleted: { $ne: true } };

        if (isApprovalQuery && approvalAuditorId) {
            filter.$and = [
                buildSalesOrderApprovalFilter(
                    approvalAuditorId,
                    options.approvalResult || "pending",
                ),
            ];
        } else if (options.draftOnly) {
            filter.status = "草稿";
            const draftOwner = toText(options.draftOwner);
            filter.createdBy = draftOwner || "__NO_DRAFT_OWNER__";
        } else if (!options.includeDrafts) {
            filter.status = { $ne: "草稿" };
        }

        const customerId = toObjectId(options.customerId);
        if (customerId) filter.customerId = customerId;
        const salespersonId = toObjectId(options.salespersonId);
        if (salespersonId && options.includePendingForAudit) {
            filter.$and = [
                ...(Array.isArray(filter.$and) ? filter.$and : []),
                {
                    $or: [
                        { salespersonId },
                        { status: "待审核" },
                    ],
                },
            ];
        } else if (salespersonId) {
            filter.salespersonId = salespersonId;
        }
        if (options.orderNo) filter.orderNo = new RegExp(options.orderNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        if (!isApprovalQuery && options.status) {
            const status = toText(options.status);
            if (status.includes(",")) {
                const statuses = [...new Set(status.split(",").map(toText).filter(Boolean))];
                if (!statuses.length || statuses.some((item) => !SALES_ORDER_STATUSES.includes(item))) {
                    throw new Error("订单状态筛选不合法");
                }
                filter.status = { $in: statuses.filter((item) => item !== "草稿" || options.draftOnly || options.includeDrafts) };
            } else if (status !== "草稿" || options.draftOnly || options.includeDrafts) {
                filter.status = status;
            }
        }
        if (options.orderType) filter.orderType = toText(options.orderType);

        const startDate = options.startDate ? toDate(options.startDate) : null;
        const endDate = options.endDate ? toDate(options.endDate) : null;
        if (startDate || endDate) {
            filter.orderDate = {};
            if (startDate) filter.orderDate.$gte = startDate;
            if (endDate) {
                endDate.setHours(23, 59, 59, 999);
                filter.orderDate.$lte = endDate;
            }
        }

        const keyword = toText(options.keyword);
        if (keyword) {
            const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            filter.$or = [
                { orderNo: regex },
                { orderName: regex },
                { customerName: regex },
                { salespersonName: regex },
                { status: regex },
                { orderType: regex },
                { sampleRequirement: regex },
                { installationRequirement: regex },
                { testingRequirement: regex },
                { orderRemark: regex },
                { receivableOrder: regex },
                { creator: regex },
                { remark: regex },
            ];
        }

        const [list, total] = await Promise.all([
            this.order
                .find(filter)
                .sort({ orderDate: -1, updateTime: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            this.order.countDocuments(filter),
        ]);
        const rejectionCounts = await getSalesOrderRejectionCounts(list);

        return {
            list: list.map((order: any) => ({
                ...order,
                rejectionCount: rejectionCounts.get(order._id.toString()) || 0,
            })),
            pagination: {
                page,
                limit,
                total,
                hasMore: skip + list.length < total,
            },
        };
    }

    async countPendingApprovalForAuditor(adminId: string) {
        const auditorId = toObjectId(adminId);
        if (!auditorId) return 0;

        const rows = await this.order.aggregate([
            {
                $match: {
                    status: "待审核",
                    _isDeleted: { $ne: true },
                },
            },
            {
                $project: {
                    targetRecord: {
                        $first: {
                            $filter: {
                                input: "$auditRecords",
                                as: "record",
                                cond: { $eq: ["$$record.adminId", auditorId] },
                            },
                        },
                    },
                    pendingNonFinalRecords: {
                        $filter: {
                            input: "$auditRecords",
                            as: "record",
                            cond: {
                                $and: [
                                    { $ne: ["$$record.isFinalAuditor", true] },
                                    { $ne: ["$$record.approved", true] },
                                ],
                            },
                        },
                    },
                },
            },
            {
                $match: {
                    "targetRecord.adminId": auditorId,
                    "targetRecord.approved": { $ne: true },
                    $expr: {
                        $or: [
                            { $ne: ["$targetRecord.isFinalAuditor", true] },
                            { $eq: [{ $size: "$pendingNonFinalRecords" }, 0] },
                        ],
                    },
                },
            },
            {
                $count: "total",
            },
        ]);

        return Number(rows?.[0]?.total || 0);
    }

    async getCustomerDealStats(customerIds: unknown[]) {
        const ids = Array.from(
            new Set(
                customerIds
                    .map((id) => toText(id))
                    .filter((id) => mongoose.Types.ObjectId.isValid(id)),
            ),
        ).map((id) => new mongoose.Types.ObjectId(id));

        if (ids.length === 0) {
            return new Map<string, { dealOrderCount: number; dealTotalAmount: number }>();
        }

        const rows = await this.order.aggregate([
            {
                $match: {
                    _isDeleted: { $ne: true },
                    customerId: { $in: ids },
                    status: { $in: SALES_ORDER_CREATED_COUNT_STATUSES },
                },
            },
            {
                $group: {
                    _id: "$customerId",
                    dealOrderCount: { $sum: 1 },
                    dealTotalAmount: {
                        $sum: {
                            $cond: [
                                { $in: ["$status", SALES_ORDER_DEAL_STATUSES] },
                                { $ifNull: ["$amount", 0] },
                                0,
                            ],
                        },
                    },
                },
            },
        ]);

        return new Map(
            rows.map((row: any) => [
                row._id?.toString?.() || "",
                {
                    dealOrderCount: Number(row.dealOrderCount || 0),
                    dealTotalAmount: Number(row.dealTotalAmount || 0),
                },
            ]),
        );
    }

    private assertCanMutate(order: any, access: SalesOrderAccessOptions, action: string, actor = "") {
        const status = toText(order?.status);

        if (Number(access.role) !== 0) {
            if (!isSalesOrderOwner(order, access, actor)) {
                throw new Error(`无权${action}该订单`);
            }
        }

        if (!SALES_ORDER_EDITABLE_STATUSES.includes(status)) {
            if (status === "待审核") {
                throw new Error(`订单已提交审核，不能${action}，请先撤销审核`);
            }
            throw new Error(`订单已审核通过，不能${action}`);
        }
    }
}

export const useSalesOrderModel = () => new SalesOrderModel(SalesOrder);
