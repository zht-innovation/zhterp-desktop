import mongoose from "mongoose";
import { CODE } from "~~/server/utils/code";
import {
    escapeRegExp,
    getPageParams,
    isValidObjectId,
    throwInventoryError,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { buildPurchaseRequirementDraftsFromMongoSalesOrder } from "~~/server/services/purchaseMaterialRequirementAnalysis";
import { ensureSalesOrderCompletionState, hasSalesOrderCompletionRelease, lockSalesOrderForProduction } from "~~/server/services/salesOrderCompletionState";

const { Schema } = mongoose;

const runRequirementTransaction = async <T>(
    session: mongoose.ClientSession | undefined,
    action: (currentSession: mongoose.ClientSession) => Promise<T>,
): Promise<T> => {
    if (session) return await action(session);
    const currentSession = await mongoose.startSession();
    try {
        let result: T;
        await currentSession.withTransaction(async () => { result = await action(currentSession); });
        return result!;
    } finally {
        await currentSession.endSession();
    }
};

export interface PurchaseMaterialRequirementReq {
    salesOrderId?: string | mongoose.Types.ObjectId;
    salesOrderNo?: string;
    salesOrderStatusSnapshot?: string;
    salesperson?: string;
    orderType?: string;
    dispatchDate?: string | Date | null;
    contractDeliveryDate?: string | Date | null;
    durationText?: string;
    productId?: string | mongoose.Types.ObjectId;
    demandProductId?: string | mongoose.Types.ObjectId;
    productCode?: string;
    productModel?: string;
    unitId?: string | mongoose.Types.ObjectId | null;
    unitName?: string;
    requiredQuantity?: number | string;
    availableQuantityAtAnalysis?: number | string;
    shortageQuantity?: number | string;
    demandType?: string;
    suggestion?: string;
    analysisVersion?: string;
    source?: "sales-order-shortage" | "purchase-request-added";
}

type PurchaseRequestAddedItem = {
    productId?: string;
    quantity?: number;
};

type CreatePurchaseRequestAddedOptions = {
    salesOrder: any;
    purchaseRequestId: string;
    items: PurchaseRequestAddedItem[];
    actor: string;
    session: mongoose.ClientSession;
};

export interface PurchaseMaterialRequirementRefreshReq {
    salesOrderId?: string | mongoose.Types.ObjectId;
    analysisVersion?: string;
    requirements?: PurchaseMaterialRequirementReq[];
    items?: PurchaseMaterialRequirementReq[];
}

type RequirementListOptions = {
    keyword?: string;
    productId?: string;
    salesOrderId?: string;
    salesOrderNo?: string;
    demandType?: string;
    status?: string;
    source?: string;
    page?: number;
    limit?: number;
};

type SalesCandidateOptions = {
    productId?: string;
    keyword?: string;
    orderType?: string;
    page?: number;
    limit?: number;
};

type RefreshOptions = {
    allowPendingApproval?: boolean;
    session?: mongoose.ClientSession;
};

const purchaseMaterialRequirementSchema = new Schema(
    {
        salesOrderId: {
            type: Schema.Types.ObjectId,
            ref: "SalesOrder",
            required: true,
            index: true,
        },
        salesOrderNo: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        salesOrderStatusSnapshot: {
            type: String,
            default: "",
        },
        salesperson: {
            type: String,
            default: "",
        },
        orderType: {
            type: String,
            default: "",
            index: true,
        },
        dispatchDate: {
            type: Date,
            default: null,
        },
        contractDeliveryDate: {
            type: Date,
            default: null,
        },
        durationText: {
            type: String,
            default: "",
        },
        productId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryProduct",
            required: true,
            index: true,
        },
        demandProductId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryProduct",
            default: null,
            index: true,
        },
        bomSourceRequirementId: { type: String, trim: true, default: "" },
        bomLineKey: { type: String, trim: true, default: "" },
        bomGroup: { type: Schema.Types.Mixed, default: undefined },
        productCode: {
            type: String,
            default: "",
        },
        productModel: {
            type: String,
            default: "",
        },
        unitId: {
            type: Schema.Types.ObjectId,
            default: null,
        },
        unitName: {
            type: String,
            default: "",
        },
        requiredQuantity: {
            type: Number,
            default: 0,
            min: 0,
        },
        availableQuantityAtAnalysis: {
            type: Number,
            default: 0,
            min: 0,
        },
        shortageQuantity: {
            type: Number,
            default: 0,
            min: 0,
        },
        demandType: {
            type: String,
            enum: ["purchase", "assembly"],
            default: "purchase",
            index: true,
        },
        suggestion: {
            type: String,
            default: "",
        },
        analysisVersion: {
            type: String,
            default: "",
            index: true,
        },
        source: {
            type: String,
            enum: ["sales-order-shortage", "purchase-request-added"],
            default: "sales-order-shortage",
            index: true,
        },
        allocatedQuantity: {
            type: Number,
            default: 0,
            min: 0,
        },
        fulfilledQuantity: {
            type: Number,
            default: 0,
            min: 0,
        },
        remainingPurchaseQuantity: {
            type: Number,
            default: 0,
            min: 0,
        },
        remainingFulfillmentQuantity: {
            type: Number,
            default: 0,
            min: 0,
        },
        purchaseRequestId: {
            type: Schema.Types.ObjectId,
            ref: "PurchaseRequest",
            default: null,
            index: true,
        },
        poolReady: {
            type: Boolean,
            default: false,
            index: true,
        },
        status: {
            type: String,
            enum: ["未完成", "已完成"],
            default: "未完成",
            index: true,
        },
        completedAt: {
            type: Date,
            default: null,
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

purchaseMaterialRequirementSchema.index({ productId: 1, status: 1, demandType: 1 });
purchaseMaterialRequirementSchema.index({ salesOrderId: 1, productId: 1, status: 1 });
purchaseMaterialRequirementSchema.index({ salesOrderNo: 1, status: 1 });
purchaseMaterialRequirementSchema.index({ purchaseRequestId: 1, source: 1 });

const PurchaseMaterialRequirement =
    mongoose.models.PurchaseMaterialRequirement
    || mongoose.model("PurchaseMaterialRequirement", purchaseMaterialRequirementSchema);

const normalizeQuantity = (value: unknown) => {
    const num = Number(value ?? 0);
    return Number.isFinite(num) ? Number(num.toFixed(3)) : 0;
};

const parseDate = (value: unknown) => {
    if (!value) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
};

export const PURCHASE_MATERIAL_REQUIREMENT_STATUS = {
    PENDING: "未完成",
    COMPLETED: "已完成",
} as const;

class PurchaseMaterialRequirementModel {
    requirement: typeof PurchaseMaterialRequirement;

    constructor(requirement: typeof PurchaseMaterialRequirement) {
        this.requirement = requirement;
    }

    async retrieve(options: RequirementListOptions = {}) {
        const pageOptions = getPageParams({ page: options.page, limit: options.limit });
        const filter = this.buildFilter(options);

        const [list, total] = await Promise.all([
            this.requirement
                .find(filter)
                .sort({ updateTime: -1, createTime: -1 })
                .skip(pageOptions.skip)
                .limit(pageOptions.limit)
                .lean(),
            this.requirement.countDocuments(filter),
        ]);

        return {
            list: list.map((item: any) => this.appendDerivedQuantities(item)),
            pagination: {
                page: pageOptions.page,
                limit: pageOptions.limit,
                total,
                hasMore: pageOptions.skip + list.length < total,
            },
        };
    }

    async create(payload: PurchaseMaterialRequirementReq, actor = "", session?: mongoose.ClientSession) {
        const data = this.normalizePayload(payload);
        return await runRequirementTransaction(session, async (currentSession) => {
            await lockSalesOrderForProduction(toText(data.salesOrderId), actor, currentSession);
            const [created] = await this.requirement.create([{
                ...data, createdBy: actor, updatedBy: actor,
            }], { session: currentSession });
            return created;
        });
    }

    async createPurchaseRequestAddedRequirements(options: CreatePurchaseRequestAddedOptions) {
        if (!isValidObjectId(options.purchaseRequestId) || !options.items.length) return [];
        const salesOrderId = options.salesOrder?._id?.toString?.() || "";
        await lockSalesOrderForProduction(salesOrderId, options.actor, options.session);
        const salesOrderNo = toText(options.salesOrder?.orderNo);
        const docs: Record<string, any>[] = [];

        for (const item of options.items) {
            const productSnapshot = await this.resolveProductSnapshot(
                { productId: item.productId },
                options.session,
            );
            docs.push({
                ...this.normalizePayload({
                    ...productSnapshot,
                    salesOrderId,
                    salesOrderNo,
                    salesOrderStatusSnapshot: options.salesOrder?.status || "",
                    salesperson: options.salesOrder?.salespersonName || options.salesOrder?.creator || "",
                    orderType: options.salesOrder?.orderType || "",
                    dispatchDate: options.salesOrder?.orderDate || null,
                    contractDeliveryDate: options.salesOrder?.contractDeliveryDate || null,
                    durationText: options.salesOrder?.durationText || "",
                    requiredQuantity: item.quantity,
                    availableQuantityAtAnalysis: 0,
                    shortageQuantity: item.quantity,
                    demandType: "purchase",
                    suggestion: "采购申请手工新增",
                    analysisVersion: `purchase-request:${options.purchaseRequestId}`,
                    source: "purchase-request-added",
                }),
                purchaseRequestId: toObjectId(options.purchaseRequestId),
                source: "purchase-request-added",
                createdBy: options.actor,
                updatedBy: options.actor,
            });
        }

        return await this.requirement.insertMany(docs, {
            session: options.session,
            ordered: true,
        });
    }

    async deletePurchaseRequestAddedRequirements(
        purchaseRequestId: string,
        session?: mongoose.ClientSession,
    ) {
        if (!isValidObjectId(purchaseRequestId)) return { deletedCount: 0 };
        return await runRequirementTransaction(session, async (currentSession) => {
            const filter = {
                purchaseRequestId: toObjectId(purchaseRequestId),
                source: "purchase-request-added",
                poolReady: { $ne: true },
            };
            await this.lockRequirementSalesOrders(filter, "", currentSession);
            return await this.requirement.deleteMany(filter, { session: currentSession });
        });
    }

    async linkToPurchaseRequest(
        requirementIds: string[],
        purchaseRequestId: string,
        session?: mongoose.ClientSession,
    ) {
        const ids = requirementIds
            .filter((id) => isValidObjectId(id))
            .map((id) => toObjectId(id));
        if (!ids.length || !isValidObjectId(purchaseRequestId)) return { matchedCount: 0 };
        return await runRequirementTransaction(session, async (currentSession) => {
            const filter = {
                _id: { $in: ids },
                _isDeleted: { $ne: true },
                demandType: "purchase",
                source: { $ne: "purchase-request-added" },
                status: PURCHASE_MATERIAL_REQUIREMENT_STATUS.PENDING,
                $or: [{ poolReady: false }, { poolReady: { $exists: false } }],
            };
            await this.lockRequirementSalesOrders(filter, "", currentSession);
            return await this.requirement.updateMany(filter,
                { $set: { purchaseRequestId: toObjectId(purchaseRequestId) } }, { session: currentSession });
        });
    }

    async releaseToPoolByRequest(
        purchaseRequestId: string,
        actor = "",
        session?: mongoose.ClientSession,
    ) {
        if (!isValidObjectId(purchaseRequestId)) return { matchedCount: 0, modifiedCount: 0 };
        return await runRequirementTransaction(session, async (currentSession) => {
            const filter = {
                purchaseRequestId: toObjectId(purchaseRequestId),
                _isDeleted: { $ne: true },
                demandType: "purchase",
                status: PURCHASE_MATERIAL_REQUIREMENT_STATUS.PENDING,
            };
            await this.lockRequirementSalesOrders(filter, actor, currentSession);
            return await this.requirement.updateMany(filter,
                { $set: { poolReady: true, updatedBy: actor } }, { session: currentSession });
        });
    }

    async refreshForSalesOrder(
        payload: PurchaseMaterialRequirementRefreshReq = {},
        actor = "",
        options: RefreshOptions = {},
    ): Promise<{ analysisVersion: string; count: number; list: any[] }> {
        if (!options.session) {
            return await runRequirementTransaction(undefined, (session) => this.refreshForSalesOrder(payload, actor, { ...options, session }));
        }
        const salesOrderId = toText(payload.salesOrderId);
        if (!isValidObjectId(salesOrderId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "salesOrderId 格式错误");
        }

        const salesOrder = await lockSalesOrderForProduction(salesOrderId, actor, options.session, {
            allowPendingApproval: options.allowPendingApproval,
        });

        await this.assertNoAllocatedRequirements(salesOrderId, options.session);

        let rawRequirements = Array.isArray(payload.requirements)
            ? payload.requirements
            : Array.isArray(payload.items)
                ? payload.items
                : [];

        const hasExplicitRequirements = Object.prototype.hasOwnProperty.call(payload, "requirements")
            || Object.prototype.hasOwnProperty.call(payload, "items");
        const shouldAutoAnalyze = rawRequirements.length === 0 && !hasExplicitRequirements;
        const canAutoAnalyze = ["待采购", "待生产", "生产中"].includes(salesOrder.status) || (
            options.allowPendingApproval && salesOrder.status === "待审核"
        );
        if (shouldAutoAnalyze && !canAutoAnalyze) {
            await this.requirement.deleteMany(
                {
                    salesOrderId: toObjectId(salesOrderId),
                    source: { $ne: "purchase-request-added" },
                },
                options.session ? { session: options.session } : {},
            );
            return {
                analysisVersion: toText(payload.analysisVersion) || `analysis-${Date.now()}`,
                count: 0,
                list: [],
            };
        }
        if (shouldAutoAnalyze) {
            rawRequirements = await buildPurchaseRequirementDraftsFromMongoSalesOrder(
                salesOrder,
                options.session,
            );
        }
        if (!rawRequirements.length) {
            await this.requirement.deleteMany(
                {
                    salesOrderId: toObjectId(salesOrderId),
                    source: { $ne: "purchase-request-added" },
                },
                options.session ? { session: options.session } : {},
            );
            return {
                analysisVersion: toText(payload.analysisVersion) || `analysis-${Date.now()}`,
                count: 0,
                list: [],
            };
        }

        const analysisVersion = toText(payload.analysisVersion) || `analysis-${Date.now()}`;
        const docs: Array<Record<string, any>> = [];
        for (const requirement of rawRequirements) {
            const productSnapshot = await this.resolveProductSnapshot(
                requirement,
                options.session,
            );
            docs.push(this.normalizePayload({
                ...requirement,
                ...productSnapshot,
                salesOrderId,
                salesOrderNo: salesOrder.orderNo || requirement.salesOrderNo || "",
                salesOrderStatusSnapshot: salesOrder.status || "",
                salesperson: requirement.salesperson || salesOrder.salespersonName || salesOrder.creator || "",
                orderType: requirement.orderType || salesOrder.orderType || "",
                dispatchDate: requirement.dispatchDate || salesOrder.orderDate || null,
                durationText: requirement.durationText || salesOrder.durationText || "",
                analysisVersion,
            }));
        }

        await this.requirement.deleteMany(
            {
                salesOrderId: toObjectId(salesOrderId),
                source: { $ne: "purchase-request-added" },
            },
            options.session ? { session: options.session } : {},
        );

        const created = await this.requirement.insertMany(
            docs.map((doc) => ({
                ...doc,
                createdBy: actor,
                updatedBy: actor,
            })),
            options.session ? { session: options.session } : {},
        );

        return {
            analysisVersion,
            count: created.length,
            list: created,
        };
    }

    async salesCandidates(options: SalesCandidateOptions = {}) {
        const productId = toText(options.productId);
        if (!isValidObjectId(productId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
        }

        const pageOptions = getPageParams({ page: options.page, limit: options.limit });
        const baseFilter: Record<string, any> = {
            productId: toObjectId(productId),
            status: PURCHASE_MATERIAL_REQUIREMENT_STATUS.PENDING,
            demandType: "purchase",
            remainingPurchaseQuantity: { $gt: 0 },
        };
        if (options.orderType) {
            baseFilter.orderType = toText(options.orderType);
        }
        if (options.keyword) {
            const regex = new RegExp(escapeRegExp(options.keyword), "i");
            baseFilter.$or = [
                { salesOrderNo: regex },
                { salesperson: regex },
                { orderType: regex },
                { productCode: regex },
                { productModel: regex },
            ];
        }

        const requirements = await this.requirement
            .find(baseFilter)
            .sort({ dispatchDate: 1, updateTime: -1 })
            .lean();
        const filtered = await this.filterByCurrentSalesOrderStatus(requirements as any[]);
        const candidates = filtered
            .map((item: any) => this.appendDerivedQuantities(item))
            .filter((item: any) => item.remainingPurchaseQuantity > 0);

        const pageList = candidates.slice(pageOptions.skip, pageOptions.skip + pageOptions.limit);

        return {
            list: pageList.map((item: any) => ({
                id: item._id?.toString?.() || "",
                requirementId: item._id?.toString?.() || "",
                salesOrderId: item.salesOrderId?.toString?.() || "",
                orderNo: item.salesOrderNo || "",
                salesOrderNo: item.salesOrderNo || "",
                salesperson: item.salesperson || "",
                orderType: item.orderType || "",
                dispatchDate: item.dispatchDate || null,
                duration: item.durationText || "",
                durationText: item.durationText || "",
                requiredQuantity: item.requiredQuantity || 0,
                shortageQuantity: item.shortageQuantity || 0,
                allocatedQuantity: item.allocatedQuantity || 0,
                fulfilledQuantity: item.fulfilledQuantity || 0,
                remainingPurchaseQuantity: item.remainingPurchaseQuantity || 0,
                remainingFulfillmentQuantity: item.remainingFulfillmentQuantity || 0,
                remainingQuantity: item.remainingPurchaseQuantity || 0,
                status: item.status || PURCHASE_MATERIAL_REQUIREMENT_STATUS.PENDING,
            })),
            pagination: {
                page: pageOptions.page,
                limit: pageOptions.limit,
                total: candidates.length,
                hasMore: pageOptions.skip + pageList.length < candidates.length,
            },
        };
    }

    async refreshProgress(
        requirementIds: any[] = [],
        actor = "",
        session?: mongoose.ClientSession,
    ) {
        const ids = [
            ...new Set(
                requirementIds
                    .map((id) => id?.toString?.() || "")
                    .filter((id) => isValidObjectId(id)),
            ),
        ];
        if (!ids.length) return [];

        const objectIds = ids.map((id) => toObjectId(id));
        const requirementsQuery = this.requirement
            .find({ _id: { $in: objectIds } })
            .select("_id shortageQuantity status completedAt")
            .lean();
        if (session) requirementsQuery.session(session);
        const requirements = await requirementsQuery;
        if (!(requirements as any[]).length) return [];

        const progressMap = await this.getAllocationProgressMap(objectIds, session);
        const now = new Date();

        for (const requirement of requirements as any[]) {
            const requirementId = requirement._id?.toString?.() || "";
            const progress = progressMap.get(requirementId) || {
                allocatedQuantity: 0,
                fulfilledQuantity: 0,
            };
            const shortageQuantity = normalizeQuantity(requirement.shortageQuantity);
            const allocatedQuantity = normalizeQuantity(progress.allocatedQuantity);
            const fulfilledQuantity = normalizeQuantity(progress.fulfilledQuantity);
            const remainingPurchaseQuantity = Math.max(
                normalizeQuantity(shortageQuantity - allocatedQuantity),
                0,
            );
            const remainingFulfillmentQuantity = Math.max(
                normalizeQuantity(shortageQuantity - fulfilledQuantity),
                0,
            );
            const isCompleted = shortageQuantity > 0 && fulfilledQuantity >= shortageQuantity;
            const status = isCompleted
                ? PURCHASE_MATERIAL_REQUIREMENT_STATUS.COMPLETED
                : PURCHASE_MATERIAL_REQUIREMENT_STATUS.PENDING;

            await this.requirement.updateOne(   
                { _id: requirement._id },
                {
                    $set: {
                        allocatedQuantity,
                        fulfilledQuantity,
                        remainingPurchaseQuantity,
                        remainingFulfillmentQuantity,
                        status,
                        completedAt: isCompleted
                            ? requirement.completedAt || now
                            : null,
                        updatedBy: actor,
                    },
                },
                session ? { session } : undefined,
            );
        }

        return ids;
    }

    private buildFilter(options: RequirementListOptions) {
        const filter: Record<string, any> = { _isDeleted: { $ne: true } };

        if (options.productId) {
            if (!isValidObjectId(options.productId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
            }
            filter.productId = toObjectId(options.productId);
        }
        if (options.salesOrderId) {
            if (!isValidObjectId(options.salesOrderId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "salesOrderId 格式错误");
            }
            filter.salesOrderId = toObjectId(options.salesOrderId);
        }
        if (options.salesOrderNo) {
            filter.salesOrderNo = new RegExp(escapeRegExp(options.salesOrderNo), "i");
        }
        if (options.demandType) {
            filter.demandType = toText(options.demandType);
        }
        if (options.status) {
            filter.status = toText(options.status);
        }
        if (options.source === "purchase-request-added") {
            filter.source = "purchase-request-added";
        } else if (options.source === "sales-order-shortage") {
            filter.$and = [
                ...(filter.$and || []),
                {
                    $or: [
                        { source: "sales-order-shortage" },
                        { source: { $exists: false } },
                    ],
                },
            ];
        }
        if (options.keyword) {
            const regex = new RegExp(escapeRegExp(options.keyword), "i");
            filter.$or = [
                { salesOrderNo: regex },
                { salesperson: regex },
                { orderType: regex },
                { productCode: regex },
                { productModel: regex },
                { suggestion: regex },
            ];
        }

        return filter;
    }

    private normalizePayload(payload: PurchaseMaterialRequirementReq = {}) {
        const salesOrderId = toText(payload.salesOrderId);
        const productId = toText(payload.productId);
        if (!isValidObjectId(salesOrderId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "salesOrderId 格式错误");
        }
        if (!isValidObjectId(productId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
        }
        if (!toText(payload.salesOrderNo)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "销售订单号不能为空");
        }

        const shortageQuantity = normalizeQuantity(payload.shortageQuantity);
        if (shortageQuantity <= 0) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "缺口数量必须大于0");
        }

        const demandType = toText(payload.demandType) || "purchase";
        if (!["purchase", "assembly"].includes(demandType)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "需求类型不合法");
        }

        return {
            salesOrderId: toObjectId(salesOrderId),
            salesOrderNo: toText(payload.salesOrderNo),
            salesOrderStatusSnapshot: toText(payload.salesOrderStatusSnapshot),
            salesperson: toText(payload.salesperson),
            orderType: toText(payload.orderType),
            dispatchDate: parseDate(payload.dispatchDate),
            contractDeliveryDate: parseDate(payload.contractDeliveryDate),
            durationText: toText(payload.durationText),
            productId: toObjectId(productId),
            demandProductId: toObjectId(toText(payload.demandProductId)),
            productCode: toText(payload.productCode),
            productModel: toText(payload.productModel),
            unitId: toObjectId(toText(payload.unitId)),
            unitName: toText(payload.unitName),
            requiredQuantity: normalizeQuantity(payload.requiredQuantity),
            availableQuantityAtAnalysis: normalizeQuantity(payload.availableQuantityAtAnalysis),
            shortageQuantity,
            demandType,
            suggestion: toText(payload.suggestion),
            analysisVersion: toText(payload.analysisVersion),
            source: payload.source === "purchase-request-added"
                ? "purchase-request-added"
                : "sales-order-shortage",
            allocatedQuantity: 0,
            fulfilledQuantity: 0,
            remainingPurchaseQuantity: shortageQuantity,
            remainingFulfillmentQuantity: shortageQuantity,
            poolReady: false,
            status: PURCHASE_MATERIAL_REQUIREMENT_STATUS.PENDING,
            completedAt: null,
        };
    }

    private async lockRequirementSalesOrders(filter: Record<string, any>, actor: string, session: mongoose.ClientSession) {
        const requirements = await this.requirement.find(filter).select("salesOrderId").session(session).lean() as any[];
        const salesOrderIds = [...new Set(requirements.map((row) => toText(row.salesOrderId)))].sort();
        for (const salesOrderId of salesOrderIds) {
            await lockSalesOrderForProduction(salesOrderId, actor, session);
        }
    }

    private async filterByCurrentSalesOrderStatus(requirements: any[]) {
        const salesOrderIds = [...new Set(
            requirements
                .map((item) => item.salesOrderId?.toString?.() || "")
                .filter(Boolean),
        )];
        if (!salesOrderIds.length) return [];

        const orders = await useSalesOrderModel().order
            .find({
                _id: { $in: salesOrderIds.map((id) => toObjectId(id)) },
                _isDeleted: { $ne: true },
                status: { $in: ["待采购", "待生产", "生产中"] },
            })
            .select("_id status")
            .lean();
        const validOrderIds = new Set<string>();
        for (const order of orders as any[]) {
            const current = await ensureSalesOrderCompletionState(order);
            if (!hasSalesOrderCompletionRelease(current)) validOrderIds.add(toText(current._id));
        }

        return requirements.filter((item) => validOrderIds.has(item.salesOrderId?.toString?.() || ""));
    }

    private async getAllocationProgressMap(requirementIds: any[], session?: mongoose.ClientSession) {
        const ids = requirementIds.filter(Boolean);
        const result = new Map<string, { allocatedQuantity: number; fulfilledQuantity: number }>();
        if (!ids.length) return result;

        const aggregate = mongoose.connection
            .collection("purchaseorderallocations")
            .aggregate([
                {
                    $match: {
                        requirementId: { $in: ids },
                    },
                },
                {
                    $group: {
                        _id: "$requirementId",
                        allocatedQuantity: { $sum: "$allocatedQuantity" },
                        fulfilledQuantity: { $sum: "$lockedAfterInboundQuantity" },
                    },
                },
            ], session ? { session } : undefined);
        const allocations = await aggregate.toArray();

        allocations.forEach((item: any) => {
            result.set(item._id?.toString?.() || "", {
                allocatedQuantity: normalizeQuantity(item.allocatedQuantity),
                fulfilledQuantity: normalizeQuantity(item.fulfilledQuantity),
            });
        });

        return result;
    }

    private async assertNoAllocatedRequirements(
        salesOrderId: string,
        session?: mongoose.ClientSession,
    ) {
        const requirementQuery = this.requirement
            .find({
                salesOrderId: toObjectId(salesOrderId),
                source: { $ne: "purchase-request-added" },
            })
            .select("_id bomGroup")
            .lean();
        if (session) requirementQuery.session(session);
        const requirements = await requirementQuery;
        if ((requirements as any[]).some((item) => item.bomGroup)) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "该销售订单已有 BOM 拆分及库存预占，不能整单覆盖物料需求");
        }
        const requirementIds = (requirements as any[])
            .map((item) => item._id?.toString?.() || "")
            .filter((id) => isValidObjectId(id))
            .map((id) => toObjectId(id));
        if (!requirementIds.length) return;

        const allocated = await mongoose.connection
            .collection("purchaseorderallocations")
            .findOne({
                requirementId: { $in: requirementIds },
            }, session ? { session } : {});
        if (allocated) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "该销售订单已有采购分配，不能覆盖齐套分析结果");
        }
    }

    private async resolveProductSnapshot(
        requirement: PurchaseMaterialRequirementReq,
        session?: mongoose.ClientSession,
    ) {
        const productId = toText(requirement.productId);
        if (!isValidObjectId(productId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
        }

        const productQuery = InventoryProduct
            .findOne({
                _id: toObjectId(productId),
                _isDeleted: { $ne: true },
            })
            .select("_id code model modelCode unitId unitName")
            .lean();
        if (session) productQuery.session(session);
        const product = await productQuery as any;
        if (!product) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "产品不存在");
        }

        return {
            productId,
            productCode: requirement.productCode || product.code || "",
            productModel: requirement.productModel || product.model || product.modelCode || "",
            unitId: requirement.unitId || product.unitId || null,
            unitName: requirement.unitName || product.unitName || "",
        };
    }

    private appendDerivedQuantities(item: any) {
        const allocatedQuantity = normalizeQuantity(item.allocatedQuantity);
        const fulfilledQuantity = normalizeQuantity(item.fulfilledQuantity);
        const remainingPurchaseQuantity = Math.max(
            normalizeQuantity(item.remainingPurchaseQuantity),
            0,
        );
        const remainingFulfillmentQuantity = Math.max(
            normalizeQuantity(item.remainingFulfillmentQuantity),
            0,
        );

        return {
            ...item,
            allocatedQuantity,
            fulfilledQuantity,
            remainingPurchaseQuantity,
            remainingFulfillmentQuantity,
            remainingQuantity: remainingPurchaseQuantity,
            status: item.status || PURCHASE_MATERIAL_REQUIREMENT_STATUS.PENDING,
        };
    }
}

export const usePurchaseMaterialRequirementModel = () =>
    new PurchaseMaterialRequirementModel(PurchaseMaterialRequirement);

export { PurchaseMaterialRequirement, normalizeQuantity as normalizePurchaseQuantity };
