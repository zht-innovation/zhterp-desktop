import mongoose from "mongoose";
import { useSalesOrderModel } from "./salesOrder.model";
import { APPROVED_SALES_ORDER_STATUSES } from "~~/server/services/salesOrderApproval";

const { Schema } = mongoose;

export interface SalesOrderReceiptReq {
    salesOrderId?: string | mongoose.Types.ObjectId;
    orderId?: string | mongoose.Types.ObjectId;
    amount?: number | string;
    paymentDate?: string | Date;
    currency?: string;
    remark?: string;
    attachments?: Array<string | Record<string, any>>;
}

type SalesOrderReceiptAccess = {
    role?: number;
    salespersonId?: string | null;
};

type SalesOrderReceiptListOptions = {
    keyword?: string;
    status?: string;
    page?: number;
    limit?: number;
};

export const SALES_ORDER_RECEIPT_STATUSES = [
    "待审核",
    "已通过",
    "已驳回",
    "已撤销",
] as const;

export type SalesOrderReceiptStatus = typeof SALES_ORDER_RECEIPT_STATUSES[number];

const salesOrderReceiptSchema = new Schema(
    {
        receiptNo: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true,
        },
        salesOrderId: {
            type: Schema.Types.ObjectId,
            ref: "SalesOrder",
            required: true,
            index: true,
        },
        orderNo: {
            type: String,
            default: "",
            trim: true,
            index: true,
        },
        customerId: {
            type: Schema.Types.ObjectId,
            ref: "Customer",
            default: null,
            index: true,
        },
        customerName: {
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
        receivableOrder: {
            type: String,
            default: "",
            trim: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        paymentDate: {
            type: Date,
            required: true,
            index: true,
        },
        currency: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
        remark: {
            type: String,
            default: "",
        },
        attachments: {
            type: [Schema.Types.Mixed],
            default: [],
        },
        status: {
            type: String,
            enum: SALES_ORDER_RECEIPT_STATUSES,
            default: "待审核",
            trim: true,
            index: true,
        },
        auditedBy: {
            type: String,
            trim: true,
        },
        auditedAt: {
            type: Date,
        },
        creator: {
            type: String,
            default: "",
            trim: true,
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

salesOrderReceiptSchema.index({ _isDeleted: 1, salesOrderId: 1, paymentDate: -1 });
salesOrderReceiptSchema.index({ _isDeleted: 1, customerId: 1, paymentDate: -1 });
salesOrderReceiptSchema.index({ _isDeleted: 1, status: 1, createTime: -1 });

const SalesOrderReceipt =
    mongoose.models.SalesOrderReceipt ||
    mongoose.model("SalesOrderReceipt", salesOrderReceiptSchema);

const toText = (value: unknown) => {
    if (value == null) return "";
    return String(value).trim();
};

const toObjectId = (value: unknown) => {
    const text = toText(value);
    if (!text || !mongoose.Types.ObjectId.isValid(text)) return null;
    return new mongoose.Types.ObjectId(text);
};

const toAmount = (value: unknown) => {
    const num = Number(value ?? 0);
    if (!Number.isFinite(num) || num <= 0) {
        throw new Error("回款金额必须为大于0的数字");
    }
    return num;
};

const toDate = (value: unknown, label = "回款日期") => {
    if (!value) throw new Error(`请选择${label}`);
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
        throw new Error(`${label}不合法`);
    }
    return date;
};

const formatDateCode = (date = new Date()) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
};

class SalesOrderReceiptModel {
    private normalizePayload(payload: SalesOrderReceiptReq = {}) {
        const salesOrderId = toObjectId(payload.salesOrderId || payload.orderId);
        if (!salesOrderId) throw new Error("缺少有效订单ID");

        const currency = toText(payload.currency).toUpperCase();
        if (!currency) throw new Error("请选择币种");

        return {
            salesOrderId,
            amount: toAmount(payload.amount),
            paymentDate: toDate(payload.paymentDate),
            currency,
            remark: toText(payload.remark),
            attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
        };
    }

    private async generateNo(session: mongoose.ClientSession) {
        const code = formatDateCode();
        const regex = new RegExp(`^SKD-${code}-`);
        const count = await SalesOrderReceipt
            .countDocuments({ receiptNo: regex })
            .session(session);
        return `SKD-${code}-${String(count + 1).padStart(2, "0")}`;
    }

    private assertCanCreate(order: any, access: SalesOrderReceiptAccess) {
        if (Number(access.role) === 0) return;

        const salespersonId = toText(access.salespersonId);
        const orderSalespersonId = order?.salespersonId?.toString?.() || "";
        if (!salespersonId || !orderSalespersonId || salespersonId !== orderSalespersonId) {
            throw new Error("无权为该订单新建回款单");
        }
    }

    private async sumApprovedAmount(
        orderId: mongoose.Types.ObjectId,
        session: mongoose.ClientSession,
    ) {
        const rows = await SalesOrderReceipt.aggregate([
            {
                $match: {
                    salesOrderId: orderId,
                    status: "已通过",
                    _isDeleted: { $ne: true },
                },
            },
            {
                $group: {
                    _id: "$salesOrderId",
                    receivedAmount: { $sum: { $ifNull: ["$amount", 0] } },
                },
            },
        ]).session(session);

        return Number(rows?.[0]?.receivedAmount || 0);
    }

    async recalculatePaymentProgress(
        orderId: mongoose.Types.ObjectId,
        actor: string,
        session: mongoose.ClientSession,
        options: { baseReceivedAmount?: number } = {},
    ) {
        const orderModel = useSalesOrderModel().order;
        const order = await orderModel
            .findOne({ _id: orderId, _isDeleted: { $ne: true } })
            .session(session)
            .lean() as any;
        if (!order) throw new Error("订单不存在");

        const approvedReceiptAmount = await this.sumApprovedAmount(orderId, session);
        const baseReceivedAmount = options.baseReceivedAmount === undefined
            ? Number(order.baseReceivedAmount || 0)
            : Number(options.baseReceivedAmount);
        if (!Number.isFinite(baseReceivedAmount) || baseReceivedAmount < 0) {
            throw new Error("基础已收金额不合法");
        }
        const receivedAmount = baseReceivedAmount + approvedReceiptAmount;
        const storedReceivableAmount = Number(order.actualReceivableAmount || 0);
        const actualReceivableAmount = storedReceivableAmount > 0
            ? storedReceivableAmount
            : Number(order.amount || 0);
        const paymentProgress = actualReceivableAmount > 0
            ? Math.min(
                100,
                Number(((receivedAmount / actualReceivableAmount) * 100).toFixed(2)),
            )
            : 0;

        const updatedOrder = await orderModel
            .findOneAndUpdate(
                { _id: orderId, _isDeleted: { $ne: true } },
                {
                    actualReceivableAmount,
                    baseReceivedAmount,
                    receivedAmount,
                    paymentProgress,
                    updatedBy: actor,
                },
                { new: true, runValidators: true, session },
            )
            .lean();
        if (!updatedOrder) throw new Error("订单状态已变化，请刷新后重试");

        return {
            order: updatedOrder,
            receivedAmount,
            receivableAmount: actualReceivableAmount,
            paymentProgress,
        };
    }

    async approveAndIncrement(
        id: string,
        actor: string,
        session: mongoose.ClientSession,
    ) {
        if (!session?.inTransaction()) {
            throw new Error("回款审批必须在 MongoDB transaction 中执行");
        }
        const objectId = toObjectId(id);
        if (!objectId) throw new Error("缺少有效回款单ID");

        const updatedAt = new Date();
        const receipt = await SalesOrderReceipt.findOneAndUpdate(
            {
                _id: objectId,
                status: "待审核",
                _isDeleted: { $ne: true },
            },
            {
                $set: {
                    status: "已通过",
                    updatedBy: actor,
                },
            },
            { new: true, runValidators: true, session },
        );
        if (!receipt) throw new Error("回款状态已变化，请刷新后重试");

        const receiptAmount = Number(receipt.amount || 0);
        if (!Number.isFinite(receiptAmount) || receiptAmount <= 0) {
            throw new Error("回款金额不合法");
        }
        const actualReceivableAmountExpression = {
            $cond: [
                { $gt: [{ $ifNull: ["$actualReceivableAmount", 0] }, 0] },
                "$actualReceivableAmount",
                { $ifNull: ["$amount", 0] },
            ],
        };
        const receivedAmountExpression = {
            $add: [
                { $ifNull: ["$receivedAmount", 0] },
                receiptAmount,
            ],
        };
        const paymentProgressExpression = {
            $cond: [
                { $gt: [actualReceivableAmountExpression, 0] },
                {
                    $min: [
                        100,
                        {
                            $round: [{
                                $multiply: [
                                    {
                                        $divide: [
                                            receivedAmountExpression,
                                            actualReceivableAmountExpression,
                                        ],
                                    },
                                    100,
                                ],
                            }, 2],
                        },
                    ],
                },
                0,
            ],
        };
        const updatedOrder = await useSalesOrderModel().order.findOneAndUpdate(
            {
                _id: receipt.salesOrderId,
                _isDeleted: { $ne: true },
            },
            [{
                $set: {
                    actualReceivableAmount: actualReceivableAmountExpression,
                    receivedAmount: receivedAmountExpression,
                    paymentProgress: paymentProgressExpression,
                    updatedBy: actor,
                    updateTime: updatedAt,
                },
            }],
            { new: true, session },
        ).lean() as any;
        if (!updatedOrder) throw new Error("回款关联订单不存在");

        return {
            receipt,
            order: updatedOrder,
            receivedAmount: Number(updatedOrder.receivedAmount || 0),
            receivableAmount: Number(updatedOrder.actualReceivableAmount || 0),
            paymentProgress: Number(updatedOrder.paymentProgress || 0),
        };
    }

    private buildFilter(options: SalesOrderReceiptListOptions = {}) {
        const filter: Record<string, any> = { _isDeleted: { $ne: true } };
        const status = toText(options.status);
        if (status) {
            filter.status = status;
        }

        const keyword = toText(options.keyword);
        if (keyword) {
            const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            filter.$or = [
                { receiptNo: regex },
                { orderNo: regex },
                { currency: regex },
                { remark: regex },
                { customerName: regex },
                { salespersonName: regex },
                { receivableOrder: regex },
                { creator: regex },
                { status: regex },
            ];
        }

        return filter;
    }

    async retrieve(options: SalesOrderReceiptListOptions = {}) {
        const page = Math.max(1, Number(options.page || 1));
        const limit = Math.min(100, Math.max(1, Number(options.limit || 20)));
        const skip = (page - 1) * limit;
        const filter = this.buildFilter(options);

        const [rows, total] = await Promise.all([
            SalesOrderReceipt
                .find(filter)
                .sort({ createTime: -1, paymentDate: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            SalesOrderReceipt.countDocuments(filter),
        ]);

        const orderIds = Array.from(
            new Set(
                rows
                    .map((row: any) => row.salesOrderId?.toString?.() || "")
                    .filter((id: string) => mongoose.Types.ObjectId.isValid(id)),
            ),
        ).map((id) => new mongoose.Types.ObjectId(id));

        const orders = orderIds.length
            ? await useSalesOrderModel().order
                .find({ _id: { $in: orderIds } })
                .select("_id paymentProgress receivableOrder hasReceivable")
                .lean()
            : [];
        const orderMap = new Map(
            orders.map((order: any) => [order._id?.toString?.() || "", order]),
        );

        const list = rows.map((row: any) => {
            const order = orderMap.get(row.salesOrderId?.toString?.() || "");
            return {
                ...row,
                status: row.status || "待审核",
                paymentProgress: Number(order?.paymentProgress ?? 0),
                orderReceivableOrder: order?.receivableOrder || row.receivableOrder || "",
                hasReceivableOrder: Boolean(order?.hasReceivable || order?.receivableOrder || row.receivableOrder),
            };
        });

        return {
            list,
            pagination: {
                page,
                limit,
                total,
                hasMore: skip + rows.length < total,
            },
        };
    }

    async findByIds(
        ids: mongoose.Types.ObjectId[],
        mode: "summary" | "detail",
    ) {
        if (ids.length === 0) return [];
        const fields = mode === "summary"
            ? ["receiptNo", "orderNo", "amount", "currency"]
            : [
                "receiptNo",
                "salesOrderId",
                "orderNo",
                "customerId",
                "customerName",
                "salespersonId",
                "salespersonName",
                "receivableOrder",
                "amount",
                "paymentDate",
                "currency",
                "remark",
                "attachments",
                "status",
                "createTime",
            ];
        return await SalesOrderReceipt.find({ _id: { $in: ids } })
            .select(fields)
            .lean();
    }

    async approve(id: string, actor = "") {
        const objectId = toObjectId(id);
        if (!objectId) throw new Error("缺少有效回款单ID");

        const existing = await SalesOrderReceipt.findOne({
            _id: objectId,
            _isDeleted: { $ne: true },
        });
        if (!existing) throw new Error("回款单不存在");

        if (toText(existing.status) === "已通过") {
            return existing;
        }

        existing.status = "已通过";
        existing.auditedBy = actor;
        existing.auditedAt = new Date();
        existing.updatedBy = actor;
        await existing.save();

        return existing;
    }

    async updateStatus(
        id: string,
        status: SalesOrderReceiptStatus,
        actor: string,
        session: mongoose.ClientSession,
    ) {
        const objectId = toObjectId(id);
        if (!objectId) throw new Error("缺少有效回款单ID");

        const updated = await SalesOrderReceipt.findOneAndUpdate(
            {
                _id: objectId,
                _isDeleted: { $ne: true },
            },
            {
                $set: {
                    status,
                    updatedBy: actor,
                },
            },
            { new: true, runValidators: true, session },
        );
        if (!updated) {
            throw new Error("回款单不存在");
        }
        return updated;
    }

    async create(
        payload: SalesOrderReceiptReq,
        access: SalesOrderReceiptAccess,
        actor: string,
        session: mongoose.ClientSession,
    ) {
        const data = this.normalizePayload(payload);
        const orderModel = useSalesOrderModel().order;
        const order = await orderModel
            .findOne({ _id: data.salesOrderId, _isDeleted: { $ne: true } })
            .session(session)
            .lean() as any;
        if (!order) throw new Error("订单不存在");
        if (!order.hasReceivable && !toText(order.receivableOrder)) {
            throw new Error("当前订单没有应收单");
        }
        if (!APPROVED_SALES_ORDER_STATUSES.includes(toText(order.status) as any)) {
            throw new Error("销售订单审核通过后才能新建回款单");
        }
        this.assertCanCreate(order, access);

        const receivedAmountBefore = Number(order.receivedAmount || 0);
        const receipt = new SalesOrderReceipt({
            ...data,
            receiptNo: await this.generateNo(session),
            orderNo: order.orderNo || "",
            customerId: order.customerId || null,
            customerName: order.customerName || "",
            salespersonId: order.salespersonId || null,
            salespersonName: order.salespersonName || "",
            receivableOrder: order.receivableOrder || "",
            creator: actor,
            createdBy: actor,
            updatedBy: actor,
            status: "待审核",
        });
        await receipt.save({ session });

        return {
            receipt,
            order,
            receivedAmountBefore,
            receivedAmount: Number(order.receivedAmount || 0),
            receivableAmount: Number(order.actualReceivableAmount || 0),
            paymentProgress: Number(order.paymentProgress || 0),
        };
    }
}

export const useSalesOrderReceiptModel = () => new SalesOrderReceiptModel();
