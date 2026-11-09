import mongoose from "mongoose";
import type {
    AttachmentRef,
    PurchaseRequestCategory,
    PurchaseRequestDepartment,
    PurchaseRequestItem,
    InventoryReviewPurchaseContext,
} from "~~/shared/types/approval";
import { PURCHASE_REQUEST_CATEGORIES, PURCHASE_REQUEST_DEPARTMENTS } from "~~/shared/types/approval";
import type { InventoryReviewLockSnapshot } from "~~/server/services/inventoryReviewLocks";
import type { PurchaseBomGroup } from "~~/shared/types/purchaseBom";

const { Schema } = mongoose;

export const PURCHASE_REQUEST_STATUSES = [
    "draft",
    "pending",
    "approved",
    "rejected",
    "cancelled",
] as const;

export type PurchaseRequestStatus = typeof PURCHASE_REQUEST_STATUSES[number];

export const PURCHASE_REQUEST_EDITABLE_STATUSES = ["draft", "cancelled", "rejected"] as const;

export interface PurchaseRequestData {
    _id: mongoose.Types.ObjectId;
    requestNo: string;
    applicantId: mongoose.Types.ObjectId;
    applicantUsername: string;
    applicantName: string;
    applicantRole: number;
    category: PurchaseRequestCategory | "";
    department?: PurchaseRequestDepartment | "";
    items: PurchaseRequestItem[];
    totalQuantity: number;
    images: AttachmentRef[];
    attachments: AttachmentRef[];
    attachmentText?: string;
    remark: string;
    salesOrderId?: mongoose.Types.ObjectId;
    salesOrderNo?: string;
    productionOrderId?: mongoose.Types.ObjectId;
    productionOrderNo?: string;
    inventoryReview?: InventoryReviewPurchaseContext;
    inventoryReviewLockSnapshot?: InventoryReviewLockSnapshot;
    bomGroups?: PurchaseBomGroup[];
    status: PurchaseRequestStatus;
    processedBy?: string;
    processedAt?: Date;
    createTime: Date;
    updateTime: Date;
}

const purchaseRequestItemSchema = new Schema<PurchaseRequestItem>(
    {
        name: { type: String, trim: true, maxlength: 100, default: "" },
        model: { type: String, trim: true, maxlength: 200, default: "" },
        quantity: { type: Number, min: 0, default: 0 },
        unit: { type: String, trim: true, maxlength: 20, default: "" },
        productId: { type: String, trim: true, default: "" },
        requirementId: { type: String, trim: true, default: "" },
        bomLineKey: { type: String, trim: true, default: "" },
        shortageQuantity: { type: Number, min: 0, default: 0 },
    },
    { _id: false },
);

const purchaseRequestSchema = new Schema<PurchaseRequestData>(
    {
        requestNo: { type: String, required: true, unique: true, trim: true },
        applicantId: { type: Schema.Types.ObjectId, ref: "Admin", required: true, index: true },
        applicantUsername: { type: String, required: true, trim: true },
        applicantName: { type: String, required: true, trim: true },
        applicantRole: { type: Number, required: true },
        category: {
            type: String,
            enum: ["", ...PURCHASE_REQUEST_CATEGORIES],
            default: "",
        },
        department: {
            type: String,
            enum: ["", ...PURCHASE_REQUEST_DEPARTMENTS],
            default: "",
        },
        items: { type: [purchaseRequestItemSchema], default: [] },
        totalQuantity: { type: Number, min: 0, default: 0 },
        images: { type: [Schema.Types.Mixed], default: [] },
        attachments: { type: [Schema.Types.Mixed], default: [] },
        attachmentText: { type: String, maxlength: 500, default: "" },
        remark: { type: String, trim: true, maxlength: 500, default: "" },
        salesOrderId: { type: Schema.Types.ObjectId, ref: "SalesOrder", default: null, index: true },
        salesOrderNo: { type: String, trim: true, default: "", index: true },
        productionOrderId: { type: Schema.Types.ObjectId, ref: "ProductionOrder", default: null, index: true },
        productionOrderNo: { type: String, trim: true, default: "", index: true },
        // 仅仓库复核自动采购写入，保留当时实际库存、订单需求及差异依据。
        inventoryReview: { type: Schema.Types.Mixed, default: undefined },
        bomGroups: { type: [Schema.Types.Mixed], default: undefined },
        // 原始订单锁定明细由专用接口按当前查看者权限脱敏后返回。
        inventoryReviewLockSnapshot: { type: Schema.Types.Mixed, default: undefined, select: false },
        status: {
            type: String,
            enum: PURCHASE_REQUEST_STATUSES,
            required: true,
            default: "pending",
            index: true,
        },
        processedBy: { type: String, trim: true, default: undefined },
        processedAt: { type: Date, default: undefined },
    },
    {
        versionKey: false,
        timestamps: {
            createdAt: "createTime",
            updatedAt: "updateTime",
        },
    },
);

purchaseRequestSchema.index({ createTime: -1 });
purchaseRequestSchema.index({ applicantId: 1, status: 1, updateTime: -1 });

export const PurchaseRequest =
    mongoose.models.PurchaseRequest
    || mongoose.model<PurchaseRequestData>("PurchaseRequest", purchaseRequestSchema);

class PurchaseRequestModel {
    async create(
        data: Omit<PurchaseRequestData, "_id" | "createTime" | "updateTime">,
        session: mongoose.ClientSession,
    ) {
        const [request] = await PurchaseRequest.create([data], { session });
        return request!;
    }

    async findByIds(ids: mongoose.Types.ObjectId[]) {
        if (ids.length === 0) return [];
        return await PurchaseRequest.find({ _id: { $in: ids } }).lean<PurchaseRequestData[]>();
    }

    async findOwnedDraftById(
        id: string | mongoose.Types.ObjectId,
        applicantId: string | mongoose.Types.ObjectId,
        session?: mongoose.ClientSession,
    ) {
        const query = PurchaseRequest.findOne({
            _id: id,
            applicantId,
            status: { $in: PURCHASE_REQUEST_EDITABLE_STATUSES },
        });
        if (session) query.session(session);
        return await query.lean<PurchaseRequestData>();
    }

    async updateOwnedDraft(
        id: string | mongoose.Types.ObjectId,
        applicantId: string | mongoose.Types.ObjectId,
        expectedUpdateTime: Date,
        data: Pick<
            PurchaseRequestData,
            "category" | "department" | "items" | "totalQuantity" | "images" | "attachments" | "remark"
                | "attachmentText" | "salesOrderId" | "salesOrderNo"
                | "productionOrderId" | "productionOrderNo" | "bomGroups"
        >,
        session: mongoose.ClientSession,
    ) {
        return await PurchaseRequest.findOneAndUpdate(
            {
                _id: id,
                applicantId,
                status: { $in: PURCHASE_REQUEST_EDITABLE_STATUSES },
                updateTime: expectedUpdateTime,
            },
            {
                $set: { ...data, status: "draft" },
                $unset: { processedBy: 1, processedAt: 1 },
            },
            { new: true, session, runValidators: true },
        ).lean<PurchaseRequestData>();
    }

    async submitOwnedDraft(
        id: string | mongoose.Types.ObjectId,
        applicantId: string | mongoose.Types.ObjectId,
        expectedUpdateTime: Date,
        data: Pick<
            PurchaseRequestData,
            "category" | "department" | "items" | "totalQuantity" | "images" | "attachments" | "remark"
                | "attachmentText" | "salesOrderId" | "salesOrderNo"
                | "productionOrderId" | "productionOrderNo" | "bomGroups"
        >,
        session: mongoose.ClientSession,
    ) {
        return await PurchaseRequest.findOneAndUpdate(
            {
                _id: id,
                applicantId,
                status: { $in: PURCHASE_REQUEST_EDITABLE_STATUSES },
                updateTime: expectedUpdateTime,
            },
            {
                $set: { ...data, status: "pending" },
                $unset: { processedBy: 1, processedAt: 1 },
            },
            { new: true, session, runValidators: true },
        ).lean<PurchaseRequestData>();
    }

    async deleteOwnedDraft(
        id: string | mongoose.Types.ObjectId,
        applicantId: string | mongoose.Types.ObjectId,
        session: mongoose.ClientSession,
    ) {
        return await PurchaseRequest.findOneAndDelete(
            { _id: id, applicantId, status: { $in: ["draft", "cancelled"] } },
            { session },
        ).lean<PurchaseRequestData>();
    }

    async updateStatus(
        id: string | mongoose.Types.ObjectId,
        status: PurchaseRequestStatus,
        actor: string,
        session: mongoose.ClientSession,
    ) {
        const update = status === "draft"
            ? {
                $set: { status: "draft" },
                $unset: { processedBy: 1, processedAt: 1 },
            }
            : {
                $set: {
                    status,
                    processedBy: actor,
                    processedAt: new Date(),
                },
            };
        return await PurchaseRequest.findOneAndUpdate(
            { _id: id, status: "pending" },
            update,
            { new: true, session, runValidators: true },
        ).lean<PurchaseRequestData>();
    }

    async deleteById(
        id: string | mongoose.Types.ObjectId,
        session: mongoose.ClientSession,
    ) {
        return await PurchaseRequest.deleteOne({ _id: id }, { session });
    }
}

export const usePurchaseRequestModel = () => new PurchaseRequestModel();
