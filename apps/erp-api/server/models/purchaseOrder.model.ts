import mongoose from "mongoose";
import { omitLegacyPurchaseWaybillQuantity } from "~~/server/utils/purchaseWaybillGoods";
import { CODE } from "~~/server/utils/code";
import {
    escapeRegExp,
    getPageParams,
    isValidObjectId,
    throwInventoryError,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryInbound, useInventoryInboundModel } from "~~/server/models/inventoryInbound.model";
import { PurchaseSupplier } from "~~/server/models/purchaseSupplier.model";
import { runPurchaseAllocationTransaction, usePurchaseOrderAllocationModel } from "~~/server/models/purchaseOrderAllocation.model";
import {
    type PurchaseRequestOrderAllocationReq,
    usePurchaseRequestOrderAllocationModel,
} from "~~/server/models/purchaseRequestOrderAllocation.model";
import { normalizePurchaseQuantity, usePurchaseMaterialRequirementModel } from "~~/server/models/purchaseMaterialRequirement.model";
import { PurchaseRequest } from "~~/server/models/purchaseRequest.model";
import { applyPurchaseChannel } from "~~/server/services/purchaseTaobao";
import {
    ensurePurchaseAverageCostReady,
    registerPurchaseAverageCost,
    removePurchaseAverageCost,
    syncPurchaseAverageCost,
} from "~~/server/services/purchaseAverageCost";
import {
    calculatePurchaseItemAmount,
    getPurchaseUnitPriceError,
    sumPurchaseItemAmounts,
} from "~~/shared/utils/purchaseOrderAmount";
import {
    getVisiblePurchaseOrderIds,
    scopePurchaseOrder,
    scopePurchaseOrders,
    type PurchaseVisibilityScope,
} from "~~/server/services/purchaseVisibility";

const { Schema } = mongoose;

export const PURCHASE_ORDER_STATUS = {
    PURCHASING: "采购中",
    PARTIAL_INBOUND: "部分入库",
    COMPLETED: "已完成",
} as const;

export const PURCHASE_TRANSPORT_STATUS = ["待发货", "已揽收", "运输中", "待取货", "已签收"] as const;
export const PURCHASE_ACCEPTANCE_STATUS = ["待验收", "验收正常", "验收异常"] as const;

const normalizeItemPlatformOrderNos = (value: unknown): string[] => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "淘宝订单号必须是字符串数组");
    }
    const result = [...new Set(value.map((item) => item.trim()).filter(Boolean))];
    if (result.some((orderNo) => !/^\d{12,24}$/.test(orderNo))) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "淘宝订单号必须是12～24位数字");
    }
    return result;
};

const normalizeItemSupplierIds = (value: unknown): string[] => {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "supplierIds 必须是字符串数组");
    }
    const result = [...new Set(value.map((item) => item.trim().toLowerCase()))];
    if (result.some((supplierId) => !isValidObjectId(supplierId))) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "supplierIds 格式错误");
    }
    return result;
};

export interface PurchaseOrderReq {
    purchaseChannel?: "taobao" | "other";
    platformOrderNos?: string[];
    creationSource?: string;
    supplierId?: string;
    buyer?: string;
    purchaseDate?: string | Date;
    status?: string;
    totalPrice?: number | string;
    totalAmount?: number | string;
    remark?: string;
    operator?: string;
    attachments?: Array<Record<string, any>>;
    items?: Array<{
        productId?: string;
        quantity?: number | string;
        unitPrice?: number | string;
        unitId?: string | null;
        remark?: string;
        supplierId?: string;
        supplierIds?: string[];
        totalAmount?: number | string;
        platformOrderNos?: string[];
    }>;
    allocations?: Array<{
        requirementId?: string;
        purchaseRequestId?: string;
        purchaseRequestNo?: string;
        purchaseRequestItemIndex?: number;
        productId?: string;
        allocatedQuantity?: number | string;
    }>;
    waybills?: Array<{
        source?: "manual" | "taobao";
        trackingNo?: string;
        courierCompany?: string;
        remark?: string;
        productIds?: string[];
    }>;
}

type PurchaseOrderListOptions = {
    scope?: PurchaseVisibilityScope;
    orderNo?: string;
    keyword?: string;
    supplierId?: string;
    supplierName?: string;
    productId?: string;
    status?: string;
    trackingNo?: string;
    startDate?: string;
    endDate?: string;
    includeDeleted?: boolean;
    page?: number;
    limit?: number;
};

type PurchaseOrderInboundSummary = {
    inboundReceived: number;
    receivedByProduct: Map<string, number>;
};

const attachmentSchema = new Schema(
    {
        url: {
            type: String,
            default: "",
        },
        name: {
            type: String,
            default: "",
        },
        size: {
            type: Number,
            default: 0,
        },
        type: {
            type: String,
            default: "",
        },
    },
    { _id: false },
);

const purchaseOrderSupplierSchema = new Schema(
    {
        supplierId: { type: Schema.Types.ObjectId, ref: "PurchaseSupplier", required: true },
        supplierCode: { type: String, default: "" },
        supplierName: { type: String, default: "" },
    },
    { _id: false },
);

const purchaseOrderItemSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryProduct",
            required: true,
        },
        productCode: {
            type: String,
            default: "",
        },
        productName: {
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
        quantity: {
            type: Number,
            required: true,
            min: 0,
        },
        unitPrice: { type: Number, min: 0.001 },
        remark: {
            type: String,
            default: "",
        },
        supplierId: {
            type: Schema.Types.ObjectId,
            ref: "PurchaseSupplier",
            default: null,
        },
        supplierCode: { type: String, default: "" },
        supplierName: { type: String, default: "" },
        suppliers: { type: [purchaseOrderSupplierSchema], default: [] },
        totalAmount: { type: Number, default: 0, min: 0 },
        platformOrderNos: { type: [String], default: [] },
    },
    { versionKey: false },
);

const purchaseAcceptanceItemSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryProduct",
            required: true,
        },
        productCode: { type: String, default: "" },
        productName: { type: String, default: "" },
        productModel: { type: String, default: "" },
        unitId: { type: Schema.Types.ObjectId, default: null },
        unitName: { type: String, default: "" },
        expectedQuantity: { type: Number, required: true, min: 0 },
        receivedQuantity: { type: Number, required: true, min: 0 },
        damagedQuantity: { type: Number, required: true, min: 0 },
        inboundQuantity: { type: Number, required: true, min: 0 },
        warehouseId: { type: Schema.Types.ObjectId, default: null },
        warehouseName: { type: String, default: "" },
        locationId: { type: Schema.Types.ObjectId, default: null },
        locationName: { type: String, default: "" },
    },
    { _id: false, versionKey: false },
);

const purchaseAcceptanceAttachmentSchema = new Schema(
    {
        name: { type: String, required: true },
        url: { type: String, required: true },
        size: { type: Number, default: 0 },
        type: { type: String, default: "" },
    },
    { _id: false, versionKey: false },
);

const purchaseOrderWaybillSchema = new Schema(
    {
        source: { type: String, enum: ["manual", "taobao"], default: "manual" },
        accountKey: { type: String, default: "" },
        platformOrderNos: { type: [String], default: [] },
        trackingNo: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        courierCompany: {
            type: String,
            default: "",
        },
        remark: {
            type: String,
            default: "",
        },
        productIds: {
            type: [Schema.Types.ObjectId],
            default: [],
        },
        transportInfo: {
            type: String,
            default: "",
        },
        transportTraces: {
            type: [{
                action: { type: String, default: "" },
                acceptStation: { type: String, default: "" },
                acceptTime: { type: Date, default: null },
                location: { type: String, default: "" },
            }],
            default: [],
        },
        transportStatus: {
            type: String,
            enum: PURCHASE_TRANSPORT_STATUS,
            default: "待发货",
        },
        transportUpdatedAt: {
            type: Date,
            default: null,
        },
        transportUpdatedBy: {
            type: String,
            default: "",
        },
        acceptanceStatus: {
            type: String,
            enum: PURCHASE_ACCEPTANCE_STATUS,
            default: "待验收",
        },
        acceptanceItems: {
            type: [purchaseAcceptanceItemSchema],
            default: [],
        },
        acceptedAt: {
            type: Date,
            default: null,
        },
        acceptedBy: {
            type: String,
            default: "",
        },
        acceptanceRemark: {
            type: String,
            default: "",
        },
        acceptanceAttachments: {
            type: [purchaseAcceptanceAttachmentSchema],
            default: [],
        },
        acceptanceImages: {
            type: [purchaseAcceptanceAttachmentSchema],
            default: [],
        },
        inboundOrderId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryInbound",
            default: null,
        },
        inboundOrderNo: {
            type: String,
            default: "",
        },
        syncedWaybillId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryWaybill",
            default: null,
        },
        syncedAt: {
            type: Date,
            default: null,
        },
    },
    { versionKey: false },
);

const purchaseOrderSchema = new Schema(
    {
        purchaseChannel: { type: String, enum: ["taobao", "other"] },
        platformOrderNos: { type: [String], default: [] },
        taobaoSyncStatus: { type: String, enum: ["pending", "partial", "matched", "error", "not_applicable"] },
        taobaoSyncMessage: { type: String, default: "" },
        taobaoSyncedAt: { type: Date, default: null },
        taobaoUnmatchedOrderNos: { type: [String], default: [] },
        orderNo: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
        },
        creationSource: {
            type: String,
            enum: ["purchase-request"],
            default: undefined,
            index: true,
        },
        supplierId: {
            type: Schema.Types.ObjectId,
            ref: "PurchaseSupplier",
            required: true,
            index: true,
        },
        supplierCode: {
            type: String,
            default: "",
        },
        supplierName: {
            type: String,
            default: "",
            index: true,
        },
        buyer: {
            type: String,
            default: "",
        },
        purchaseDate: {
            type: Date,
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: Object.values(PURCHASE_ORDER_STATUS),
            default: PURCHASE_ORDER_STATUS.PURCHASING,
            index: true,
        },
        totalPrice: {
            type: Number,
            default: 0,
            min: 0,
        },
        totalQuantity: {
            type: Number,
            default: 0,
            min: 0,
        },
        remark: {
            type: String,
            default: "",
        },
        attachments: {
            type: [attachmentSchema],
            default: [],
        },
        items: {
            type: [purchaseOrderItemSchema],
            default: [],
        },
        waybills: {
            type: [purchaseOrderWaybillSchema],
            default: [],
        },
        operator: {
            type: String,
            default: "",
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

purchaseOrderSchema.index({ _isDeleted: 1, purchaseDate: -1, updateTime: -1 });
purchaseOrderSchema.index({ _isDeleted: 1, supplierId: 1, purchaseDate: -1 });
purchaseOrderSchema.index({ _isDeleted: 1, status: 1, purchaseDate: -1 });
purchaseOrderSchema.index({ "items.productId": 1, _isDeleted: 1 });
purchaseOrderSchema.index({ "waybills.trackingNo": 1, _isDeleted: 1 });

const PurchaseOrder =
    mongoose.models.PurchaseOrder || mongoose.model("PurchaseOrder", purchaseOrderSchema);

const SHANGHAI_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const parseDate = (value: unknown, label: string, fallback?: Date) => {
    if (!value && fallback) return fallback;
    const text = toText(value);
    if (!text) {
        throwInventoryError(400, CODE.INVALID_PARAMS, `${label}不能为空`);
    }

    const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let date: Date;
    if (dateOnlyMatch) {
        const year = Number(dateOnlyMatch[1]);
        const month = Number(dateOnlyMatch[2]) - 1;
        const day = Number(dateOnlyMatch[3]);
        const utcDate = new Date(Date.UTC(year, month, day));
        const isValidDate = utcDate.getUTCFullYear() === year
            && utcDate.getUTCMonth() === month
            && utcDate.getUTCDate() === day;

        if (!isValidDate) {
            throwInventoryError(400, CODE.INVALID_PARAMS, `${label}格式错误`);
        }

        date = new Date(utcDate.getTime() - SHANGHAI_TIMEZONE_OFFSET_MS);
    } else {
        date = new Date(text);
    }
    if (Number.isNaN(date.getTime())) {
        throwInventoryError(400, CODE.INVALID_PARAMS, `${label}格式错误`);
    }

    return date;
};

const formatPurchaseDate = (value: unknown) => {
    const date = value instanceof Date ? value : new Date(toText(value));
    if (Number.isNaN(date.getTime())) return "";

    const shanghaiDate = new Date(date.getTime() + SHANGHAI_TIMEZONE_OFFSET_MS);
    const year = shanghaiDate.getUTCFullYear();
    const month = String(shanghaiDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(shanghaiDate.getUTCDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
};

const formatDateCode = (date = new Date()) => {
    return formatPurchaseDate(date).replaceAll("-", "");
};

const toPurchaseOrderResponse = (order: any) => {
    if (!order) return order;

    const data = typeof order.toObject === "function" ? order.toObject() : order;
    return {
        ...data,
        waybills: (data.waybills || []).map(omitLegacyPurchaseWaybillQuantity),
        purchaseDate: formatPurchaseDate(data.purchaseDate),
    };
};

class PurchaseOrderModel {
    order: typeof PurchaseOrder;

    constructor(order: typeof PurchaseOrder) {
        this.order = order;
    }

    async retrieve(options: PurchaseOrderListOptions = {}) {
        const pageOptions = getPageParams({ page: options.page, limit: options.limit });
        const filter = this.buildFilter(options);
        const scope = options.scope || {};
        const visibleOrderIds = await getVisiblePurchaseOrderIds(scope);

        if (scope.applicantId) {
            const scopedFilter = this.buildFilter({
                ...options,
                keyword: undefined,
                supplierId: undefined,
                supplierName: undefined,
                productId: undefined,
                trackingNo: undefined,
            });
            scopedFilter._id = { $in: visibleOrderIds || [] };
            const orders = await this.order
                .find(scopedFilter)
                .sort({ purchaseDate: -1, updateTime: -1, createTime: -1 })
                .lean();
            const scopedOrders = await scopePurchaseOrders(
                orders.map((item: any) => this.appendListFields(item)),
                scope,
            );
            const matchingOrders = scopedOrders.filter((order) => this.matchesScopedFilter(order, options));
            const list = matchingOrders.slice(pageOptions.skip, pageOptions.skip + pageOptions.limit);

            return {
                list,
                pagination: {
                    page: pageOptions.page,
                    limit: pageOptions.limit,
                    total: matchingOrders.length,
                    hasMore: pageOptions.skip + list.length < matchingOrders.length,
                },
            };
        }

        if (visibleOrderIds !== undefined) {
            filter._id = { $in: visibleOrderIds };
        }

        const [list, total] = await Promise.all([
            this.order
                .find(filter)
                .sort({ purchaseDate: -1, updateTime: -1, createTime: -1 })
                .skip(pageOptions.skip)
                .limit(pageOptions.limit)
                .lean(),
            this.order.countDocuments(filter),
        ]);
        const progressMap = await this.getInboundProgressMap(list.map((item: any) => item.orderNo));
        const scopedList = await scopePurchaseOrders(
            list.map((item: any) => this.appendListFields(item, progressMap.get(item.orderNo))),
            scope,
        );

        return {
            list: scopedList,
            pagination: {
                page: pageOptions.page,
                limit: pageOptions.limit,
                total,
                hasMore: pageOptions.skip + list.length < total,
            },
        };
    }

    async retrieveInboundCandidates(
        options: Pick<PurchaseOrderListOptions, "keyword" | "page" | "limit"> = {},
    ) {
        const pageOptions = getPageParams({ page: options.page, limit: options.limit });
        const filter: Record<string, any> = {
            _isDeleted: { $ne: true },
            status: {
                $in: [
                    PURCHASE_ORDER_STATUS.PURCHASING,
                    PURCHASE_ORDER_STATUS.PARTIAL_INBOUND,
                ],
            },
        };
        const keyword = toText(options.keyword);

        if (keyword) {
            filter.orderNo = new RegExp(escapeRegExp(keyword), "i");
        }

        const [list, total] = await Promise.all([
            this.order
                .find(filter)
                .select("_id orderNo status items.productId items.productCode items.productModel")
                .sort({ purchaseDate: -1, updateTime: -1, createTime: -1 })
                .skip(pageOptions.skip)
                .limit(pageOptions.limit)
                .lean(),
            this.order.countDocuments(filter),
        ]);
        const productIds = [...new Set(
            list
                .flatMap((order: any) => order.items || [])
                .map((item: any) => item.productId?.toString?.() || "")
                .filter((id: string) => isValidObjectId(id)),
        )];
        const products = productIds.length
            ? await InventoryProduct
                .find({
                    _id: { $in: productIds.map((id) => toObjectId(id)) },
                    _isDeleted: { $ne: true },
                })
                .select("_id code name model image")
                .lean()
            : [];
        const productMap = new Map(
            products.map((product: any) => [product._id?.toString?.() || "", product]),
        );

        return {
            list: list.map((item: any) => ({
                id: item._id?.toString?.() || "",
                orderNo: item.orderNo || "",
                status: item.status || "",
                products: (item.items || []).map((purchaseItem: any) => {
                    const productId = purchaseItem.productId?.toString?.() || "";
                    const product = productMap.get(productId);

                    return {
                        productId,
                        productName: product?.name || purchaseItem.productModel || purchaseItem.productCode || "未命名产品",
                        productCode: product?.code || purchaseItem.productCode || "",
                        productModel: product?.model || purchaseItem.productModel || "",
                        image: product?.image || "",
                    };
                }),
            })),
            pagination: {
                page: pageOptions.page,
                limit: pageOptions.limit,
                total,
                hasMore: pageOptions.skip + list.length < total,
            },
        };
    }

    async detail(query: { id?: string; orderNo?: string }, scope: PurchaseVisibilityScope = {}) {
        const detail = await this.order.findOne(this.buildDetailFilter(query)).lean();
        if (!detail) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "采购单不存在");
        }

        const [allocations, requestAllocations, progress] = await Promise.all([
            usePurchaseOrderAllocationModel().getByPurchaseOrder((detail as any)._id?.toString?.() || ""),
            usePurchaseRequestOrderAllocationModel().getByPurchaseOrder((detail as any)._id?.toString?.() || ""),
            this.inboundProgressByOrder(detail as any),
        ]);

        return await scopePurchaseOrder({
            ...toPurchaseOrderResponse(detail),
            allocations: (detail as any).creationSource === "purchase-request"
                ? requestAllocations
                : allocations,
            inboundProgress: progress,
        }, scope);
    }

    async inboundDetail(query: { id?: string; orderNo?: string }) {
        const detail = await this.order
            .findOne(this.buildDetailFilter(query))
            .select("orderNo status totalQuantity items waybills")
            .lean();
        if (!detail) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "采购单不存在");
        }
        if ((detail as any).status === PURCHASE_ORDER_STATUS.COMPLETED) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "采购单已完成，不能继续入库");
        }

        const [progressMap, progressItems] = await Promise.all([
            this.getInboundProgressMap([(detail as any).orderNo]),
            this.inboundProgressItems(detail),
        ]);
        const inboundReceived = progressMap.get((detail as any).orderNo)?.inboundReceived || 0;
        const inboundTotal = normalizePurchaseQuantity((detail as any).totalQuantity || 0);

        return {
            orderNo: (detail as any).orderNo || "",
            status: (detail as any).status || "",
            items: ((detail as any).items || []).map((item: any) => {
                const inboundItem = { ...item };
                delete inboundItem.unitPrice;
                return inboundItem;
            }),
            waybills: ((detail as any).waybills || []).map(omitLegacyPurchaseWaybillQuantity),
            inboundProgress: {
                orderNo: (detail as any).orderNo || "",
                inboundReceived,
                inboundTotal,
                inboundPercent: inboundTotal > 0
                    ? Math.min(100, Math.round((inboundReceived / inboundTotal) * 100))
                    : 0,
                items: progressItems,
            },
        };
    }

    async quickInboundCandidates(query: { orderNo?: string }) {
        const orderNo = toText(query.orderNo);
        if (!orderNo) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "缺少采购单号");
        }

        const order = await this.order
            .findOne({ orderNo, _isDeleted: { $ne: true } })
            .select("orderNo items")
            .lean();
        if (!order) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "采购单不存在");
        }

        const items = (order as any).items || [];
        const orderId = (order as any)._id?.toString?.() || "";

        const [progressMap, allocations] = await Promise.all([
            this.getInboundProgressMap([orderNo]),
            usePurchaseOrderAllocationModel().getByPurchaseOrder(orderId),
        ]);

        const progressItems = progressMap.get(orderNo)?.items || [];
        const receivedMap = new Map(
            progressItems.map((p: any) => [String(p.productId), Number(p.receivedQuantity || 0)]),
        );

        const salesOrderNos = [
            ...new Set(
                allocations
                    .map((a: any) => a.salesOrderNo)
                    .filter((no: string) => Boolean(no)),
            ),
        ];

        const requirementModel = usePurchaseMaterialRequirementModel();

        const productIds = items
            .map((item: any) => String(item.productId || ""))
            .filter(Boolean);
        const productDetails = productIds.length
            ? await InventoryProduct.find({
                _id: { $in: productIds.map(toObjectId) },
                _isDeleted: { $ne: true },
            })
                .select("warehouseId locationId warehouseName locationName")
                .lean()
            : [];
        const productMap = new Map(
            (productDetails as any[]).map((p) => [p._id?.toString?.() || "", p]),
        );

        const products: Array<{
            productId: string;
            productCode: string;
            model: string;
            unitName: string;
            quantity: number;
            receivedQuantity: number;
            remainingQuantity: number;
            warehouseId: string;
            locationId: string;
            warehouseName: string;
            locationName: string;
            candidates: Array<{
                requirementId: string;
                purchaseRequestNo: string;
                salesOrderNo: string;
                dispatchDate: string | null;
                remainingGap: number;
            }>;
        }> = [];

        for (const item of items) {
            const productId = String(item.productId || "");
            if (!productId) continue;

            const quantity = Number(item.quantity || 0);
            const receivedQuantity = receivedMap.get(productId) || 0;
            const remainingQuantity = Math.max(quantity - receivedQuantity, 0);
            if (remainingQuantity <= 0) continue;

            const candidatesResult = await requirementModel.salesCandidates({
                productId,
                page: 1,
                limit: 100,
            });

            const requirementIds = (candidatesResult.list || [])
                .map((c: any) => c.requirementId)
                .filter(Boolean);
            const requirements = requirementIds.length
                ? await requirementModel.requirement
                    .find({ _id: { $in: requirementIds.map(toObjectId) } })
                    .select("purchaseRequestId")
                    .lean()
                : [];
            const requirementMap = new Map(
                requirements.map((r: any) => [r._id?.toString?.() || "", r]),
            );

            const purchaseRequestIds = [
                ...new Set(
                    requirements
                        .map((r: any) => r.purchaseRequestId?.toString?.() || "")
                        .filter(Boolean),
                ),
            ];
            const purchaseRequests = purchaseRequestIds.length
                ? await PurchaseRequest.find({
                    _id: { $in: purchaseRequestIds.map(toObjectId) },
                })
                    .select("requestNo")
                    .lean()
                : [];
            const requestMap = new Map(
                purchaseRequests.map((r: any) => [r._id?.toString?.() || "", r.requestNo || ""]),
            );

            const candidates = (candidatesResult.list || []).map((c: any) => {
                const req = requirementMap.get(c.requirementId || "");
                const purchaseRequestId = req?.purchaseRequestId?.toString?.() || "";
                return {
                    requirementId: c.requirementId || "",
                    purchaseRequestNo: requestMap.get(purchaseRequestId) || "",
                    salesOrderNo: c.salesOrderNo || "",
                    dispatchDate: c.dispatchDate || null,
                    remainingGap: Number(c.remainingPurchaseQuantity || 0),
                };
            });

            const productDetail = productMap.get(productId) as any;
            products.push({
                productId,
                productCode: item.productCode || "",
                model: item.productModel || "",
                unitName: item.unitName || "",
                quantity,
                receivedQuantity,
                remainingQuantity,
                warehouseId: productDetail?.warehouseId?.toString?.() || "",
                locationId: productDetail?.locationId?.toString?.() || "",
                warehouseName: productDetail?.warehouseName || "",
                locationName: productDetail?.locationName || "",
                candidates,
            });
        }

        return { orderNo, salesOrderNos, products };
    }

    async create(payload: PurchaseOrderReq, actor = "") {
        if (!Array.isArray(payload?.allocations) || payload.allocations.length === 0) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "采购需求审核通过后才能生成采购单");
        }
        await ensurePurchaseAverageCostReady();
        const allocationModel = usePurchaseOrderAllocationModel();
        return await runPurchaseAllocationTransaction(undefined, async (session) => {
            const data = await this.normalizePayload(payload, false, actor);
            data.orderNo = await this.generateOrderNo(data.purchaseDate, session);
            await this.assertUniqueOrderNo(data.orderNo, session);
            const [created] = await this.order.create([{
                ...data,
                operator: data.operator || actor,
                createdBy: actor,
                updatedBy: actor,
            }], { session });
            await allocationModel.replaceForPurchaseOrder(
                {
                    purchaseOrderId: created._id.toString(),
                    purchaseOrderNo: created.orderNo,
                    items: created.items,
                },
                payload.allocations || [],
                actor,
                "",
                session,
            );
            await registerPurchaseAverageCost(created, actor, session);
            return await this.order.findById(created._id).session(session);
        });
    }

    async createFromPurchaseRequest(payload: PurchaseOrderReq, actor = "") {
        const allocations = Array.isArray(payload?.allocations) ? payload.allocations : [];
        if (!allocations.length) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "至少需要分配一条已审批采购申请");
        }
        const items = payload.items || [];
        this.assertRequestOrderItems(items);
        this.assertRequestAllocationTotals(items, allocations);
        this.assertRequestWaybillProducts(items, payload.waybills || []);

        await ensurePurchaseAverageCostReady();
        const legacyAllocationModel = usePurchaseOrderAllocationModel();
        const requestAllocationModel = usePurchaseRequestOrderAllocationModel();
        return await runPurchaseAllocationTransaction(undefined, async (session) => {
            const data = await this.normalizePayload({
                ...payload,
                creationSource: "purchase-request",
            }, false, actor);
            data.orderNo = await this.generateOrderNo(data.purchaseDate, session);
            await this.assertUniqueOrderNo(data.orderNo, session);
            const [created] = await this.order.create([{
                ...data, operator: data.operator || actor, createdBy: actor, updatedBy: actor,
            }], { session });
            const legacyAllocations = allocations.filter((item) => toText(item.requirementId));
            if (legacyAllocations.length) {
                await legacyAllocationModel.replaceForPurchaseOrder(
                    {
                        purchaseOrderId: created._id.toString(),
                        purchaseOrderNo: created.orderNo,
                        items: created.items,
                    },
                    legacyAllocations,
                    actor,
                    "",
                    session,
                );
            }
            const requestDocs = await requestAllocationModel.buildDocs(
                { purchaseOrderId: created._id.toString(), purchaseOrderNo: created.orderNo },
                allocations as PurchaseRequestOrderAllocationReq[],
                actor,
                "",
                session,
            );
            await requestAllocationModel.replaceWithDocs(created._id.toString(), requestDocs, actor, session);
            await registerPurchaseAverageCost(created, actor, session);
            return await this.order.findById(created._id).session(session);
        });
    }

    async update(id: string, payload: Partial<PurchaseOrderReq>, actor = "", session?: mongoose.ClientSession): Promise<any> {
        const hasItems = Object.prototype.hasOwnProperty.call(payload, "items");
        if (!session && (hasItems || Object.prototype.hasOwnProperty.call(payload, "allocations"))) {
            if (hasItems) await ensurePurchaseAverageCostReady();
            return await runPurchaseAllocationTransaction(undefined, (currentSession) => this.update(id, payload, actor, currentSession));
        }
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const currentQuery = this.order.findOne({ _id: id, _isDeleted: { $ne: true } });
        if (session) currentQuery.session(session);
        const current = await currentQuery;
        if (!current) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "采购单不存在");
        }
        if (current.creationSource === "purchase-request" && payload.creationSource !== "purchase-request") {
            throwInventoryError(400, CODE.INVALID_PARAMS, "采购申请生成的采购单必须使用独立编辑流程");
        }

        const hasInbound = await this.hasAppliedInbound(current.orderNo, session);
        const data = await this.normalizePayload(payload, true, actor, current);
        if (Object.keys(data).length === 0 && !Object.prototype.hasOwnProperty.call(payload, "allocations")) {
            return current;
        }

        if (hasInbound) {
            this.assertInboundSafeUpdate(payload);
        }
        if ((current.waybills || []).some((waybill: any) =>
            ["验收正常", "验收异常"].includes(waybill.acceptanceStatus))) {
            const acceptedImmutableFields = ["items", "waybills", "supplierId", "purchaseDate"];
            if (acceptedImmutableFields.some((field) => Object.prototype.hasOwnProperty.call(payload, field))) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "采购运单验收后不可修改采购货品、供应商、日期或运单");
            }
        }

        data.updatedBy = actor;
        if (!data.operator) {
            data.operator = actor;
        }

        const nextOrder = {
            ...current.toObject(),
            ...data,
            items: data.items || current.items,
        };

        const allocationModel = usePurchaseOrderAllocationModel();
        const nextAllocationDocs = !hasInbound && Object.prototype.hasOwnProperty.call(payload, "allocations")
            ? await allocationModel.buildAllocationDocs(
                {
                    purchaseOrderId: current._id.toString(),
                    purchaseOrderNo: current.orderNo,
                    items: nextOrder.items,
                },
                payload.allocations || [],
                actor,
                current._id.toString(),
                session,
            )
            : null;

        const updated = await this.order.findOneAndUpdate(
            { _id: id, _isDeleted: { $ne: true }, updateTime: current.updateTime },
            { $set: data },
            { new: true, runValidators: true, ...(session ? { session } : {}) },
        );
        if (!updated) throwInventoryError(409, CODE.INVALID_PARAMS, "采购单已被修改，请刷新后重试");

        if (nextAllocationDocs) {
            await allocationModel.replaceWithDocsForPurchaseOrder(
                current._id.toString(),
                nextAllocationDocs,
                actor,
                session,
            );
        }
        if (hasItems && session) {
            await syncPurchaseAverageCost(updated, actor, session);
        }

        return updated;
    }

    async updateFromPurchaseRequest(id: string, payload: Partial<PurchaseOrderReq>, actor = "", session?: mongoose.ClientSession): Promise<any> {
        if (!session) {
            if (Object.prototype.hasOwnProperty.call(payload, "items")) await ensurePurchaseAverageCostReady();
            return await runPurchaseAllocationTransaction(undefined, (currentSession) => this.updateFromPurchaseRequest(id, payload, actor, currentSession));
        }
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }
        const current = await this.order.findOne({
            _id: id,
            _isDeleted: { $ne: true },
            creationSource: "purchase-request",
        }).session(session).lean() as any;
        if (!current) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "采购申请生成的采购单不存在");
        }

        const items = payload.items || current.items || [];
        const allocations = Array.isArray(payload.allocations) ? payload.allocations : [];
        this.assertRequestOrderItems(items);
        this.assertRequestAllocationTotals(items, allocations);
        this.assertRequestWaybillProducts(items, payload.waybills || current.waybills || []);
        const requestAllocationModel = usePurchaseRequestOrderAllocationModel();
        const requestDocs = await requestAllocationModel.buildDocs(
            { purchaseOrderId: id, purchaseOrderNo: current.orderNo },
            allocations as PurchaseRequestOrderAllocationReq[],
            actor,
            id,
            session,
        );
        const legacyAllocations = allocations.filter((item) => toText(item.requirementId));
        const updated = await this.update(id, {
            ...payload,
            creationSource: "purchase-request",
            allocations: legacyAllocations,
        }, actor, session);
        await requestAllocationModel.replaceWithDocs(id, requestDocs, actor, session);
        return updated;
    }

    async syncTaobaoWaybills(id: string, actor = "") {
        if (!isValidObjectId(id)) throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        const current = await this.order.findOne({ _id: id, _isDeleted: { $ne: true } });
        if (!current) throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "采购单不存在");
        if (current.purchaseChannel !== "taobao") {
            throwInventoryError(400, CODE.INVALID_PARAMS, "仅淘宝采购单支持同步运单");
        }
        const data: Record<string, any> = { updatedBy: actor };
        await applyPurchaseChannel(data, {
            purchaseChannel: "taobao",
            platformOrderNos: current.platformOrderNos,
        }, current, true);
        // 已验收子文档的 ID、验收字段和人工信息均由合并逻辑保留。
        const updated = await this.order.findOneAndUpdate(
            { _id: id, _isDeleted: { $ne: true }, updateTime: current.updateTime },
            { $set: data },
            { new: true, runValidators: true },
        );
        if (!updated) throwInventoryError(409, CODE.INVALID_PARAMS, "采购单已被修改，请刷新后重试");
        return updated;
    }

    async delete(ids: string[], actor = "") {
        if (!ids.length || ids.some((id) => !isValidObjectId(id))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "ids 格式错误");
        }

        await ensurePurchaseAverageCostReady();
        return await runPurchaseAllocationTransaction(undefined, async (session) => {
            const orders = await this.order
                .find({
                    _id: { $in: ids.map((id) => toObjectId(id)) },
                    _isDeleted: { $ne: true },
                })
                .select("_id orderNo")
                .session(session)
                .lean();

            const orderIds = (orders as any[]).map((order) => order._id.toString());
            const orderNos = (orders as any[]).map((order) => order.orderNo).filter(Boolean);
            if (orderNos.length) {
                const inboundOrders = await InventoryInbound
                    .find({
                        purchaseOrderNo: { $in: orderNos },
                        type: "采购",
                        _isDeleted: { $ne: true },
                    })
                    .select("_id")
                    .session(session)
                    .lean();
                const inboundIds = (inboundOrders as any[])
                    .map((order) => order._id?.toString?.() || "")
                    .filter(Boolean);
                if (inboundIds.length) {
                    await useInventoryInboundModel().delete(inboundIds, actor, session);
                }
            }

            for (const id of orderIds) {
                await usePurchaseOrderAllocationModel().deleteByPurchaseOrder(id, actor, session);
                await usePurchaseRequestOrderAllocationModel().deleteByPurchaseOrder(id, actor, session);
            }
            await removePurchaseAverageCost(orderIds, actor, session);
            const now = new Date();
            return await this.order.updateMany(
                { _id: { $in: orderIds.map((id) => toObjectId(id)) }, _isDeleted: { $ne: true } },
                { $set: { _isDeleted: true, deletedAt: now, deletedBy: actor, updatedBy: actor } },
                { session },
            );
        });
    }

    async findByTrackingNo(trackingNo: string) {
        const value = toText(trackingNo);
        if (!value) return null;

        return await this.order.findOne({
            _isDeleted: { $ne: true },
            "waybills.trackingNo": new RegExp(`^${escapeRegExp(value)}$`, "i"),
        }).lean();
    }

    async inboundProgress(query: { id?: string; orderNo?: string }) {
        const detail = await this.detail(query);
        return (detail as any).inboundProgress;
    }

    async refreshStatusByOrderNo(orderNo: string, actor = "", session?: mongoose.ClientSession) {
        const query = this.order.findOne({ orderNo: toText(orderNo), _isDeleted: { $ne: true } });
        if (session) query.session(session);
        const order = await query;
        if (!order) return order;

        const progressMap = await this.getInboundProgressMap([order.orderNo], session);
        const received = progressMap.get(order.orderNo)?.inboundReceived || 0;
        const nextStatus = received <= 0
            ? PURCHASE_ORDER_STATUS.PURCHASING
            : received < normalizePurchaseQuantity(order.totalQuantity || 0)
                ? PURCHASE_ORDER_STATUS.PARTIAL_INBOUND
                : PURCHASE_ORDER_STATUS.COMPLETED;

        if (order.status !== nextStatus) {
            order.status = nextStatus;
            order.updatedBy = actor;
            await order.save(session ? { session } : undefined);
        }

        return order;
    }

    private matchesScopedFilter(order: any, options: PurchaseOrderListOptions) {
        if (options.supplierId || options.supplierName) return false;

        const items: any[] = order.items || [];
        const waybills: any[] = order.waybills || [];
        if (options.productId) {
            const productId = toText(options.productId).toLowerCase();
            if (!items.some((item) => toText(item.productId).toLowerCase() === productId)) return false;
        }
        if (options.trackingNo) {
            const regex = new RegExp(escapeRegExp(options.trackingNo), "i");
            if (!waybills.some((waybill) => regex.test(toText(waybill.trackingNo)))) return false;
        }
        if (options.keyword) {
            const regex = new RegExp(escapeRegExp(options.keyword), "i");
            const values = [order.orderNo, order.buyer, order.remark, order.operator];
            for (const item of items) {
                values.push(item.productCode, item.productModel);
            }
            for (const waybill of waybills) {
                values.push(waybill.trackingNo, waybill.courierCompany);
            }
            if (!values.some((value) => regex.test(toText(value)))) return false;
        }
        return true;
    }

    private buildFilter(options: PurchaseOrderListOptions) {
        const filter: Record<string, any> = {};
        if (!options.includeDeleted) {
            filter._isDeleted = { $ne: true };
        }

        if (options.orderNo) {
            filter.orderNo = toText(options.orderNo).toUpperCase();
        }

        if (options.keyword) {
            const regex = new RegExp(escapeRegExp(options.keyword), "i");
            filter.$or = [
                { orderNo: regex },
                { supplierName: regex },
                { "items.supplierName": regex },
                { "items.suppliers.supplierName": regex },
                { buyer: regex },
                { remark: regex },
                { operator: regex },
                { "items.productCode": regex },
                { "items.productModel": regex },
                { "waybills.trackingNo": regex },
                { "waybills.courierCompany": regex },
            ];
        }
        if (options.supplierName) {
            const regex = new RegExp(escapeRegExp(options.supplierName), "i");
            filter.$and = [{ $or: [
                { supplierName: regex },
                { "items.supplierName": regex },
                { "items.suppliers.supplierName": regex },
            ] }];
        }
        if (options.supplierId) {
            if (!isValidObjectId(options.supplierId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "supplierId 格式错误");
            }
            const supplierId = toObjectId(options.supplierId);
            filter.$and = filter.$and || [];
            filter.$and.push({ $or: [
                { supplierId },
                { "items.supplierId": supplierId },
                { "items.suppliers.supplierId": supplierId },
            ] });
        }
        if (options.productId) {
            if (!isValidObjectId(options.productId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
            }
            filter["items.productId"] = toObjectId(options.productId);
        }
        if (options.status) {
            filter.status = toText(options.status);
        }
        if (options.trackingNo) {
            filter["waybills.trackingNo"] = new RegExp(escapeRegExp(options.trackingNo), "i");
        }

        const dateFilter: Record<string, Date> = {};
        if (options.startDate) {
            dateFilter.$gte = parseDate(options.startDate, "开始日期");
        }
        if (options.endDate) {
            const endDate = parseDate(options.endDate, "结束日期");
            dateFilter.$lte = new Date(endDate.getTime() + ONE_DAY_MS - 1);
        }
        if (Object.keys(dateFilter).length) {
            filter.purchaseDate = dateFilter;
        }

        return filter;
    }

    private buildDetailFilter(query: { id?: string; orderNo?: string }) {
        const filter: Record<string, any> = { _isDeleted: { $ne: true } };
        if (query.id) {
            if (!isValidObjectId(query.id)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
            }
            filter._id = toObjectId(query.id);
        } else if (query.orderNo) {
            filter.orderNo = toText(query.orderNo).toUpperCase();
        } else {
            throwInventoryError(400, CODE.INVALID_PARAMS, "缺少 id 或 orderNo");
        }

        return filter;
    }

    private async normalizePayload(
        payload: Partial<PurchaseOrderReq> = {},
        partial: boolean,
        actor = "",
        current?: any,
    ) {
        const data: Record<string, any> = {};
        const hasOwn = (field: string) => Object.prototype.hasOwnProperty.call(payload, field);

        if (payload.creationSource === "purchase-request") {
            data.creationSource = "purchase-request";
        }

        if (hasOwn("supplierId") || !partial) {
            data.supplierId = await this.resolveSupplierSnapshot(toText(payload.supplierId));
            data.supplierCode = data.supplierId.supplierCode;
            data.supplierName = data.supplierId.supplierName;
            data.supplierId = data.supplierId.supplierId;
        }
        if (hasOwn("buyer") || !partial) {
            data.buyer = toText(payload.buyer) || actor;
        }
        if (hasOwn("purchaseDate") || !partial) {
            data.purchaseDate = parseDate(payload.purchaseDate, "采购日期", current?.purchaseDate || new Date());
        }
        if (hasOwn("status") && payload.status) {
            const status = toText(payload.status);
            if (!Object.values(PURCHASE_ORDER_STATUS).includes(status as any)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "采购单状态不合法");
            }
            data.status = status;
        } else if (!partial) {
            data.status = PURCHASE_ORDER_STATUS.PURCHASING;
        }
        if (hasOwn("remark") || !partial) {
            data.remark = toText(payload.remark);
        }
        if (hasOwn("operator") || !partial) {
            data.operator = toText(payload.operator) || actor;
        }
        if (hasOwn("attachments") || !partial) {
            data.attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
        }
        if (hasOwn("items") || !partial) {
            data.items = await this.normalizeItems(payload.items || [], partial ? current?.items || [] : []);
            const totalPrice = sumPurchaseItemAmounts(data.items.map((item: any) => item.totalAmount));
            if (totalPrice === null) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "采购单总金额超出允许范围");
            }
            data.totalPrice = totalPrice;
            data.totalQuantity = data.items.reduce(
                (total: number, item: any) => normalizePurchaseQuantity(total + Number(item.quantity || 0)),
                0,
            );
        }
        if (hasOwn("waybills") || !partial) {
            data.waybills = this.normalizeWaybills(payload.waybills || [], current?.waybills || []);
        }

        await applyPurchaseChannel(data, payload, current, partial);

        return data;
    }

    private async resolveSupplierSnapshot(supplierId: string) {
        if (!isValidObjectId(supplierId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "supplierId 格式错误");
        }
        const supplier = await PurchaseSupplier
            .findOne({
                _id: toObjectId(supplierId),
                _isDeleted: { $ne: true },
                isEnabled: true,
            })
            .lean() as any;
        if (!supplier) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "供应商不存在或已禁用");
        }

        return {
            supplierId: supplier._id,
            supplierCode: supplier.code || "",
            supplierName: supplier.name || "",
        };
    }

    private async normalizeItems(items: PurchaseOrderReq["items"] = [], currentItems: any[] = []) {
        if (!Array.isArray(items) || !items.length) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "采购产品明细不能为空");
        }

        const currentByProductId = new Map(
            currentItems.map((item: any) => [String(item.productId || ""), item]),
        );
        const productIds = new Set<string>();
        const normalized: any[] = [];
        for (const item of items) {
            const productId = toText(item.productId);
            if (!isValidObjectId(productId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
            }
            if (productIds.has(productId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "同一采购单内产品不能重复");
            }
            productIds.add(productId);

            const product = await InventoryProduct
                .findOne({ _id: toObjectId(productId), _isDeleted: { $ne: true } })
                .lean() as any;
            if (!product) {
                throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "产品不存在");
            }

            const quantity = normalizePurchaseQuantity(item.quantity);
            if (quantity <= 0) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "采购数量必须大于0");
            }
            const productLabel = product.code || product.model || product.modelCode || product.name || productId;
            const unitPriceError = getPurchaseUnitPriceError(item.unitPrice);
            if (unitPriceError) {
                throwInventoryError(400, CODE.INVALID_PARAMS, `产品「${productLabel}」：${unitPriceError}`);
            }
            const unitPrice = Number(item.unitPrice);
            const totalAmount = calculatePurchaseItemAmount(quantity, unitPrice);
            if (totalAmount === null) {
                throwInventoryError(400, CODE.INVALID_PARAMS, `产品「${productLabel}」总金额超出允许范围`);
            }

            const currentItem = currentByProductId.get(productId);
            const supplierId = toText(item.supplierId).toLowerCase();
            let supplierIds: string[];
            if (Object.prototype.hasOwnProperty.call(item, "supplierIds")) {
                supplierIds = normalizeItemSupplierIds(item.supplierIds);
            } else if (
                currentItem?.suppliers?.length
                && (!Object.prototype.hasOwnProperty.call(item, "supplierId")
                    || supplierId === toText(currentItem.supplierId).toLowerCase())
            ) {
                // 旧弹窗未携带多选字段且主供应商未变时，保留完整选择。
                supplierIds = normalizeItemSupplierIds(currentItem.suppliers.map((supplier: any) => toText(supplier.supplierId)));
            } else {
                supplierIds = supplierId ? [supplierId] : [];
            }
            const suppliers: any[] = [];
            for (const selectedSupplierId of supplierIds) {
                suppliers.push(await this.resolveSupplierSnapshot(selectedSupplierId));
            }
            const supplier = suppliers[0];

            // 行级淘宝订单号：显式携带则校验归一化；未携带的局部更新继承旧值，避免其他弹窗清空。
            let platformOrderNos: string[] = [];
            if (Object.prototype.hasOwnProperty.call(item, "platformOrderNos")) {
                platformOrderNos = normalizeItemPlatformOrderNos(item.platformOrderNos);
            } else {
                platformOrderNos = [...(currentByProductId.get(productId)?.platformOrderNos || [])];
            }

            normalized.push({
                productId: product._id,
                productCode: product.code || "",
                productName: product.name || product.model || product.code || "",
                productModel: product.model || product.modelCode || "",
                unitId: toObjectId(toText(item.unitId)) || product.unitId || null,
                unitName: product.unitName || "",
                quantity,
                unitPrice,
                remark: toText(item.remark),
                supplierId: supplier?.supplierId || null,
                supplierCode: supplier?.supplierCode || "",
                supplierName: supplier?.supplierName || "",
                suppliers,
                totalAmount,
                platformOrderNos,
            });
        }

        return normalized;
    }

    private normalizeWaybills(
        waybills: PurchaseOrderReq["waybills"] = [],
        currentWaybills: any[] = [],
    ) {
        if (!Array.isArray(waybills)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "waybills 必须是数组");
        }

        const trackingNos = new Set<string>();
        const currentByTrackingNo = new Map(
            currentWaybills.map((waybill: any) => [toText(waybill.trackingNo).toLowerCase(), waybill]),
        );
        const normalized = waybills
            .map((waybill) => {
                const trackingNo = toText(waybill.trackingNo);
                const current = currentByTrackingNo.get(trackingNo.toLowerCase());
                let productIds = current?.productIds || [];
                if (Array.isArray(waybill.productIds)) {
                    productIds = [...new Set(
                        waybill.productIds.map((id) => toText(id)).filter((id) => isValidObjectId(id)),
                    )].map((id) => toObjectId(id));
                }

                return {
                    ...omitLegacyPurchaseWaybillQuantity(current),
                    trackingNo,
                    courierCompany: toText(waybill.courierCompany),
                    remark: toText(waybill.remark),
                    productIds,
                    transportStatus: current?.transportStatus || "待发货",
                    acceptanceStatus: current?.acceptanceStatus || "待验收",
                };
            })
            .filter((waybill) => waybill.trackingNo)
            .map((waybill) => {
                if (trackingNos.has(waybill.trackingNo)) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "运单号不能重复");
                }
                trackingNos.add(waybill.trackingNo);
                return waybill;
            });

        const acceptedTrackingNos = currentWaybills
            .filter((waybill: any) => ["验收正常", "验收异常"].includes(waybill.acceptanceStatus))
            .map((waybill: any) => toText(waybill.trackingNo));
        const nextTrackingNos = new Set(normalized.map((waybill) => waybill.trackingNo));
        const normalizedTrackingNos = new Set([...nextTrackingNos].map((trackingNo) => trackingNo.toLowerCase()));
        if (acceptedTrackingNos.some((trackingNo) => !normalizedTrackingNos.has(trackingNo.toLowerCase()))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "已验收运单不可删除或修改运单号");
        }

        return normalized;
    }

    private assertRequestAllocationTotals(
        items: PurchaseOrderReq["items"] = [],
        allocations: PurchaseOrderReq["allocations"] = [],
    ) {
        const itemQuantityMap = new Map<string, number>();
        items.forEach((item) => {
            const productId = toText(item.productId);
            if (productId) itemQuantityMap.set(productId, normalizePurchaseQuantity(item.quantity));
        });
        const allocationQuantityMap = new Map<string, number>();
        const requestItemKeys = new Set<string>();
        allocations.forEach((allocation) => {
            const productId = toText(allocation.productId);
            const purchaseRequestId = toText(allocation.purchaseRequestId);
            const purchaseRequestItemIndex = Number(allocation.purchaseRequestItemIndex);
            const requestItemKey = `${purchaseRequestId}:${purchaseRequestItemIndex}`;
            const allocatedQuantity = normalizePurchaseQuantity(allocation.allocatedQuantity);
            if (
                !productId
                || !isValidObjectId(purchaseRequestId)
                || !Number.isInteger(purchaseRequestItemIndex)
                || purchaseRequestItemIndex < 0
                || !itemQuantityMap.has(productId)
                || allocatedQuantity <= 0
                || requestItemKeys.has(requestItemKey)
            ) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "采购申请分配与产品明细不匹配");
            }
            requestItemKeys.add(requestItemKey);
            allocationQuantityMap.set(
                productId,
                normalizePurchaseQuantity((allocationQuantityMap.get(productId) || 0) + allocatedQuantity),
            );
        });
        for (const [productId, allocatedQuantity] of allocationQuantityMap.entries()) {
            if (allocatedQuantity > (itemQuantityMap.get(productId) || 0)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "产品分配数量不能超过采购数量");
            }
        }
        for (const productId of itemQuantityMap.keys()) {
            if ((allocationQuantityMap.get(productId) || 0) <= 0) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "每个产品至少需要分配一条采购申请");
            }
        }
    }

    private assertRequestOrderItems(items: PurchaseOrderReq["items"] = []) {
        if (!Array.isArray(items) || !items.length) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "采购产品明细不能为空");
        }
        for (const item of items) {
            const supplierIds = Object.prototype.hasOwnProperty.call(item, "supplierIds")
                ? normalizeItemSupplierIds(item.supplierIds)
                : [toText(item.supplierId)];
            if (!supplierIds.length || supplierIds.some((supplierId) => !isValidObjectId(supplierId))) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "每个产品都必须选择供应商");
            }
        }
    }

    private assertRequestWaybillProducts(
        items: PurchaseOrderReq["items"] = [],
        waybills: PurchaseOrderReq["waybills"] = [],
    ) {
        const productIds = new Set(items.map((item) => toText(item.productId)).filter(Boolean));
        for (const waybill of waybills) {
            const linkedProductIds = Array.isArray(waybill.productIds) ? waybill.productIds : [];
            if (
                !linkedProductIds.length
                || linkedProductIds.some((productId) => !productIds.has(toText(productId)))
            ) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "运单必须关联采购单内的产品");
            }
        }
    }

    private assertInboundSafeUpdate(payload: Partial<PurchaseOrderReq>) {
        const forbiddenFields = ["supplierId", "items", "allocations", "status", "purchaseDate"];
        if (forbiddenFields.some((field) => Object.prototype.hasOwnProperty.call(payload, field))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "已入库采购单不可修改供应商、产品、分配、状态或采购日期");
        }
    }

    private async generateOrderNo(purchaseDate: Date, session?: mongoose.ClientSession) {
        const dateKey = formatDateCode(purchaseDate);
        const serial = await useInventoryCounterModel().nextNumber(`purchase:order:${dateKey}`, session);

        return `CGD-${dateKey}-${String(serial).padStart(3, "0")}`;
    }

    private async assertUniqueOrderNo(orderNo: string, session?: mongoose.ClientSession) {
        const query = this.order.findOne({ orderNo }).select("_id").lean();
        if (session) query.session(session);
        const exists = await query;
        if (exists) {
            throwInventoryError(409, CODE.INVENTORY_DUPLICATE_CODE, "采购单号已存在");
        }
    }

    private async hasAppliedInbound(orderNo: string, session?: mongoose.ClientSession) {
        const query = InventoryInbound
            .findOne({
                purchaseOrderNo: orderNo,
                type: "采购",
                stockApplied: true,
                _isDeleted: { $ne: true },
            })
            .select("_id")
            .lean();
        if (session) query.session(session);
        const inbound = await query;

        return Boolean(inbound);
    }

    private async getInboundProgressMap(orderNos: string[], session?: mongoose.ClientSession) {
        const uniqueNos = [...new Set(orderNos.filter(Boolean))];
        const result = new Map<string, PurchaseOrderInboundSummary>();
        if (!uniqueNos.length) return result;

        const aggregate = InventoryInbound.aggregate([
            {
                $match: {
                    purchaseOrderNo: { $in: uniqueNos },
                    type: "采购",
                    stockApplied: true,
                    _isDeleted: { $ne: true },
                },
            },
            { $unwind: "$items" },
            {
                $group: {
                    _id: {
                        orderNo: "$purchaseOrderNo",
                        productId: "$items.productId",
                    },
                    receivedQuantity: { $sum: "$items.quantity" },
                },
            },
            {
                $group: {
                    _id: "$_id.orderNo",
                    inboundReceived: { $sum: "$receivedQuantity" },
                    products: {
                        $push: {
                            productId: "$_id.productId",
                            receivedQuantity: "$receivedQuantity",
                        },
                    },
                },
            },
        ]);
        if (session) aggregate.session(session);
        const rows = await aggregate;

        rows.forEach((row: any) => {
            const receivedByProduct = new Map<string, number>();
            for (const product of row.products || []) {
                const productId = product.productId?.toString?.() || "";
                receivedByProduct.set(productId, normalizePurchaseQuantity(product.receivedQuantity));
            }
            result.set(row._id, {
                inboundReceived: normalizePurchaseQuantity(row.inboundReceived),
                receivedByProduct,
            });
        });

        return result;
    }

    private async inboundProgressByOrder(order: any) {
        const [progressMap, inboundList] = await Promise.all([
            this.getInboundProgressMap([order.orderNo]),
            InventoryInbound
                .find({
                    purchaseOrderNo: order.orderNo,
                    type: "采购",
                    _isDeleted: { $ne: true },
                })
                .sort({ inboundDate: -1, updateTime: -1 })
                .lean(),
        ]);
        const inboundReceived = progressMap.get(order.orderNo)?.inboundReceived || 0;
        const inboundTotal = normalizePurchaseQuantity(order.totalQuantity || 0);

        return {
            orderNo: order.orderNo,
            inboundReceived,
            inboundTotal,
            inboundPercent: inboundTotal > 0
                ? Math.min(100, Math.round((inboundReceived / inboundTotal) * 100))
                : 0,
            items: await this.inboundProgressItems(order),
            records: inboundList,
        };
    }

    private async inboundProgressItems(order: any) {
        const rows = await this.aggregateInboundByProduct(
            [order.orderNo],
            (order.items || []).map((item: any) => item.productId?.toString?.() || "").filter(Boolean),
        );
        const receivedMap = new Map<string, number>(
            rows.map((row: any) => [row._id?.toString?.() || "", normalizePurchaseQuantity(row.quantity)]),
        );

        return (order.items || []).map((item: any) => {
            const productId = item.productId?.toString?.() || "";
            const receivedQuantity = receivedMap.get(productId) || 0;
            const totalQuantity = normalizePurchaseQuantity(item.quantity || 0);

            return {
                productId,
                productCode: item.productCode || "",
                productModel: item.productModel || "",
                unitId: item.unitId || null,
                unitName: item.unitName || "",
                totalQuantity,
                receivedQuantity,
                inboundPercent: totalQuantity > 0
                    ? Math.min(100, Math.round((receivedQuantity / totalQuantity) * 100))
                    : 0,
            };
        });
    }

    private async aggregateInboundByProduct(orderNos: string[], productIds: string[] = []) {
        if (!orderNos.length) return [];

        return await InventoryInbound.aggregate([
            {
                $match: {
                    purchaseOrderNo: { $in: orderNos },
                    type: "采购",
                    stockApplied: true,
                    _isDeleted: { $ne: true },
                },
            },
            { $unwind: "$items" },
            ...(productIds.length
                ? [{ $match: { "items.productId": { $in: productIds.map((id) => toObjectId(id)) } } }]
                : []),
            {
                $group: {
                    _id: "$items.productId",
                    quantity: { $sum: "$items.quantity" },
                },
            },
        ]);
    }

    private appendListFields(item: any, progress?: PurchaseOrderInboundSummary) {
        const inboundReceived = progress?.inboundReceived || 0;
        const inboundTotal = normalizePurchaseQuantity(item.totalQuantity || 0);
        const inboundPercent = inboundTotal > 0
            ? Math.min(100, Math.round((inboundReceived / inboundTotal) * 100))
            : 0;
        const progressItems = (item.items || []).map((product: any) => {
            const productId = product.productId?.toString?.() || "";
            const receivedQuantity = progress?.receivedByProduct.get(productId) || 0;
            const totalQuantity = normalizePurchaseQuantity(product.quantity || 0);

            return {
                productId,
                productCode: product.productCode || "",
                productModel: product.productModel || "",
                unitId: product.unitId || null,
                unitName: product.unitName || "",
                totalQuantity,
                receivedQuantity,
                inboundPercent: totalQuantity > 0
                    ? Math.min(100, Math.round((receivedQuantity / totalQuantity) * 100))
                    : 0,
            };
        });

        return {
            ...toPurchaseOrderResponse(item),
            id: item._id?.toString?.() || "",
            purchaseDate: formatPurchaseDate(item.purchaseDate),
            totalAmount: Number(item.totalPrice || 0).toFixed(2),
            inboundReceived,
            inboundTotal,
            inboundPercent,
            inboundProgress: {
                orderNo: item.orderNo || "",
                inboundReceived,
                inboundTotal,
                inboundPercent,
                items: progressItems,
            },
            operator: item.updatedBy || item.operator || item.createdBy || "",
            updatedAt: item.updateTime || item.createTime || null,
        };
    }
}

export const usePurchaseOrderModel = () => new PurchaseOrderModel(PurchaseOrder);
export { PurchaseOrder, toPurchaseOrderResponse };
