import mongoose from "mongoose";
import { INVENTORY_ORDER_STATUS } from "~~/shared/enums";
import { CODE } from "~~/server/utils/code";
import {
    escapeRegExp,
    getPageParams,
    isValidObjectId,
    throwInventoryError,
    toNumber,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import { getInboundLockedQuantity, normalizeStockQuantity } from "~~/server/services/inventoryStockMath";
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";
import type { InventoryStockApplyItem } from "~~/server/models/inventoryStock.model";
import { useInventoryStockModel } from "~~/server/models/inventoryStock.model";
import { PurchaseOrderAllocation, usePurchaseOrderAllocationModel } from "~~/server/models/purchaseOrderAllocation.model";
import { PurchaseRequestOrderAllocation } from "~~/server/models/purchaseRequestOrderAllocation.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { useSalesOrderStockReservationModel } from "~~/server/models/salesOrderStockReservation.model";
import {
    buildProductionInboundLockPlan,
    refreshSalesOrderFulfillmentStatus,
} from "~~/server/services/salesOrderFulfillment";
import { syncInboundWaybill } from "~~/server/services/inventoryWaybillSync";
import { assertSalesOrderProductionReversalAllowed, lockSalesOrderForProduction } from "~~/server/services/salesOrderCompletionState";
import { lockSalesOrdersForDirectPurchaseReceipt } from "~~/server/services/salesOrderPurchaseReceipt";

const { Schema } = mongoose;

const productionReferenceFields = {
    productionOrderId: { type: Schema.Types.ObjectId, ref: "ProductionOrder", default: null, index: true },
    requisitionId: { type: Schema.Types.ObjectId, ref: "ProductionRequisition", default: null },
    completionId: { type: Schema.Types.ObjectId, ref: "ProductionCompletion", default: null },
    rootProductId: { type: Schema.Types.ObjectId, ref: "InventoryProduct", default: null },
};

const hasProductionExecutionReference = (value: any) => Boolean(
    value?.sourceType === "production-execution"
    || value?.productionOrderId || value?.requisitionId || value?.completionId
    || (Array.isArray(value?.items) && value.items.some((item: any) => item.productionOrderId || item.requisitionId || item.completionId)),
);

const assertGenericInboundPayload = (payload: any) => {
    if (hasProductionExecutionReference(payload)) {
        throwInventoryError(409, CODE.INVENTORY_REFERENCED, "生产执行入库请通过生产发料或完工入库流程操作");
    }
};

export interface InventoryInboundReq {
    inboundNo?: string;
    type: string;
    inboundDate: string | Date;
    handler?: string;
    status?: string;
    remark?: string;
    courierCompany?: string;
    trackingNo?: string;
    purchaseOrderNo?: string;
    processingOrderNo?: string;
    productionOwner?: string;
    salesOrderId?: string;
    orderNo?: string;
    returnReason?: string;
    sourceType?: string;
    sourceKey?: string;
    items: InventoryStockApplyItem[];
    reserved1?: string;
    reserved2?: string;
    reserved3?: string;
    reserved4?: string;
    reserved5?: string;
}

type InboundListOptions = {
    keyword?: string;
    type?: string;
    inboundDate?: string;
    startDate?: string;
    endDate?: string;
    includeDeleted?: boolean;
    ids?: string[] | string;
    page?: number;
    limit?: number;
};

type InboundUpdateOptions = {
    allowAppliedMutation?: boolean;
};

const inboundItemSchema = new Schema(
    {
        ...productionReferenceFields,
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
        model: {
            type: String,
            default: "",
        },
        material: {
            type: String,
            default: "",
        },
        categoryId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryCategory",
            default: null,
        },
        categoryName: {
            type: String,
            default: "",
        },
        categoryPath: {
            type: String,
            default: "",
        },
        image: {
            type: String,
            default: "",
        },
        quantity: {
            type: Number,
            required: true,
            min: 0,
        },
        lockedQuantity: {
            type: Number,
            default: 0,
            min: 0,
        },
        unitId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryUnit",
            default: null,
        },
        unitCode: {
            type: String,
            default: "",
        },
        unitName: {
            type: String,
            default: "",
        },
        warehouseId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryWarehouse",
            default: null,
        },
        warehouseCode: {
            type: String,
            default: "",
        },
        warehouseName: {
            type: String,
            default: "",
        },
        locationId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryLocation",
            default: null,
        },
        locationCode: {
            type: String,
            default: "",
        },
        locationName: {
            type: String,
            default: "",
        },
        includeInAvailable: {
            type: Boolean,
            default: true,
        },
    },
    {
        _id: false,
        versionKey: false,
    },
);

const inventoryInboundSchema = new Schema(
    {
        ...productionReferenceFields,
        inboundNo: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
        },
        type: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        relatedNo: {
            type: String,
            default: "",
            trim: true,
        },
        totalQuantity: {
            type: Number,
            default: 0,
        },
        inboundDate: {
            type: Date,
            required: true,
            index: true,
        },
        handler: {
            type: String,
            default: "",
            trim: true,
        },
        status: {
            type: String,
            enum: Object.values(INVENTORY_ORDER_STATUS),
            default: INVENTORY_ORDER_STATUS.COMPLETED,
            index: true,
        },
        stockApplied: {
            type: Boolean,
            default: false,
            index: true,
        },
        courierCompany: {
            type: String,
            default: "",
        },
        trackingNo: {
            type: String,
            default: "",
        },
        purchaseOrderNo: {
            type: String,
            default: "",
        },
        processingOrderNo: {
            type: String,
            default: "",
        },
        productionOwner: {
            type: String,
            default: "",
        },
        salesOrderId: {
            type: Schema.Types.ObjectId,
            ref: "SalesOrder",
            default: null,
            index: true,
        },
        salesOrderNo: {
            type: String,
            default: "",
            trim: true,
        },
        orderNo: {
            type: String,
            default: "",
        },
        returnReason: {
            type: String,
            default: "",
        },
        sourceType: {
            type: String,
            default: "",
            index: true,
        },
        sourceKey: {
            type: String,
            default: undefined,
            sparse: true,
        },
        remark: {
            type: String,
            default: "",
        },
        items: {
            type: [inboundItemSchema],
            default: [],
        },
        reserved1: {
            type: String,
            default: "",
        },
        reserved2: {
            type: String,
            default: "",
        },
        reserved3: {
            type: String,
            default: "",
        },
        reserved4: {
            type: String,
            default: "",
        },
        reserved5: {
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

inventoryInboundSchema.index({ _isDeleted: 1, inboundDate: -1, updateTime: -1 });
inventoryInboundSchema.index({ _isDeleted: 1, type: 1, inboundDate: -1 });
inventoryInboundSchema.index({ salesOrderId: 1, type: 1, stockApplied: 1, _isDeleted: 1 });
inventoryInboundSchema.index({ sourceKey: 1 }, { unique: true, sparse: true });

const InventoryInbound =
    mongoose.models.InventoryInbound || mongoose.model("InventoryInbound", inventoryInboundSchema);

const appliedStatuses = new Set<string>([
    INVENTORY_ORDER_STATUS.APPROVED,
    INVENTORY_ORDER_STATUS.COMPLETED,
]);

const textFields = [
    "courierCompany",
    "trackingNo",
    "purchaseOrderNo",
    "processingOrderNo",
    "productionOwner",
    "orderNo",
    "returnReason",
    "remark",
    "reserved1",
    "reserved2",
    "reserved3",
    "reserved4",
    "reserved5",
];

const parseDate = (value: unknown, label: string) => {
    const text = toText(value);
    if (!text) {
        throwInventoryError(400, CODE.INVALID_PARAMS, `${label}不能为空`);
    }

    const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = dateOnlyMatch
        ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
        : new Date(text);
    if (Number.isNaN(date.getTime())) {
        throwInventoryError(400, CODE.INVALID_PARAMS, `${label}格式错误`);
    }

    return date;
};

class InventoryInboundModel {
    inbound: typeof InventoryInbound;

    constructor(inbound: typeof InventoryInbound) {
        this.inbound = inbound;
    }

    async retrieve(options: InboundListOptions = {}) {
        const pageOptions = getPageParams({ page: options.page, limit: options.limit });
        const filter = this.buildFilter(options);

        const [list, total] = await Promise.all([
            this.inbound
                .find(filter)
                .sort({ inboundDate: -1, updateTime: -1, createTime: -1 })
                .skip(pageOptions.skip)
                .limit(pageOptions.limit)
                .lean(),
            this.inbound.countDocuments(filter),
        ]);

        return {
            list,
            pagination: {
                page: pageOptions.page,
                limit: pageOptions.limit,
                total,
                hasMore: pageOptions.skip + list.length < total,
            },
        };
    }

    async detail(id: string) {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        return await this.inbound.findOne({ _id: id, _isDeleted: { $ne: true } }).lean();
    }

    async create(payload: InventoryInboundReq, actor = "") {
        assertGenericInboundPayload(payload);
        const data = await this.normalizePayload(payload, false, actor);
        if (!data.inboundNo) {
            data.inboundNo = await this.generateInboundNo(data.inboundDate);
        }
        await this.assertUniqueInboundNo(data.inboundNo);

        let created: any;
        const isLinkedProduction = data.type === "生产" && Boolean(data.salesOrderId);
        const isLinkedPurchase = await this.hasPurchaseAllocations(data);
        if ((isLinkedProduction || isLinkedPurchase) && appliedStatuses.has(data.status)) {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    const docs = await this.inbound.create([{
                        ...data,
                        handler: data.handler || actor,
                        createdBy: actor,
                        updatedBy: actor,
                    }], { session });
                    created = docs[0];
                    await this.applyStock(created, actor, session);
                });
            } finally {
                await session.endSession();
            }
        } else {
            created = await this.inbound.create({
                ...data,
                handler: data.handler || actor,
                createdBy: actor,
                updatedBy: actor,
            });

            if (appliedStatuses.has(created.status)) {
                try {
                    await this.applyStock(created, actor);
                } catch (err) {
                    await this.inbound.deleteOne({ _id: created._id });
                    throw err;
                }
            }
        }

        const order = await this.inbound.findById(created._id);
        await syncInboundWaybill(order, actor);

        return order;
    }

    async update(id: string, payload: Partial<InventoryInboundReq>, actor = "", options: InboundUpdateOptions = {}) {
        assertGenericInboundPayload(payload);
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const current = await this.inbound.findOne({ _id: id, _isDeleted: { $ne: true } });
        if (!current) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
        }
        if (hasProductionExecutionReference(current)) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "生产执行关联入库单不可直接修改");
        }

        const data = await this.normalizePayload(payload, true, actor, current);
        if (data.inboundNo !== undefined) {
            if (!data.inboundNo) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "入库编号不能为空");
            }
            await this.assertUniqueInboundNo(data.inboundNo, id);
        }
        if (!options.allowAppliedMutation) {
            this.assertStockAppliedMutation(current, data);
        }

        data.updatedBy = actor;
        const nextType = data.type ?? current.type;
        const nextStatus = data.status ?? current.status;
        const nextSalesOrderId = data.salesOrderId !== undefined
            ? data.salesOrderId
            : current.salesOrderId;
        const hasCurrentProductionLink = current.type === "生产" && Boolean(current.salesOrderId);
        const hasNextProductionLink = nextType === "生产" && Boolean(nextSalesOrderId);
        if (
            current.stockApplied
            && current.type !== nextType
            && (hasCurrentProductionLink || hasNextProductionLink)
        ) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "已完成的关联生产入库不能变更入库类型");
        }
        const hasPurchaseLink = await this.hasPurchaseAllocations(current) || await this.hasPurchaseAllocations({ ...current.toObject(), ...data });
        const needsLinkedTransaction = hasCurrentProductionLink
            || (hasNextProductionLink && (current.stockApplied || appliedStatuses.has(nextStatus)))
            || (hasPurchaseLink && ((current.stockApplied && options.allowAppliedMutation) || (!current.stockApplied && appliedStatuses.has(nextStatus))));

        if (needsLinkedTransaction) {
            const session = await mongoose.startSession();
            let result: any;
            try {
                await session.withTransaction(async () => {
                    const transactionCurrent = await this.inbound.findOne({
                        _id: id,
                        _isDeleted: { $ne: true },
                    }).session(session) as any;
                    if (!transactionCurrent) {
                        throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
                    }

                    const affectedSalesOrderIds = transactionCurrent.stockApplied
                        ? await this.reverseStock(transactionCurrent, actor, session)
                        : [];
                    for (const salesOrderId of affectedSalesOrderIds) {
                        await refreshSalesOrderFulfillmentStatus(salesOrderId, actor, { session });
                    }
                    const updated = await this.inbound.findByIdAndUpdate(
                        id,
                        { $set: { ...data, stockApplied: false } },
                        { new: true, runValidators: true, session },
                    );
                    if (!updated) {
                        throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
                    }

                    if (appliedStatuses.has(updated.status)) {
                        await this.applyStock(updated, actor, session);
                    }

                    result = await this.inbound.findById(updated._id).session(session);
                });
            } finally {
                await session.endSession();
            }

            await syncInboundWaybill(result, actor);
            return result;
        }

        if (current.stockApplied && options.allowAppliedMutation) {
            await this.reverseStock(current, actor);
            const updated = await this.inbound.findByIdAndUpdate(
                id,
                { $set: { ...data, stockApplied: false } },
                { new: true, runValidators: true },
            );

            if (updated && appliedStatuses.has(updated.status)) {
                await this.applyStock(updated, actor);
                const order = await this.inbound.findById(updated._id);
                await syncInboundWaybill(order, actor);

                return order;
            }

            await syncInboundWaybill(updated, actor);

            return updated;
        }

        const updated = await this.inbound.findByIdAndUpdate(
            id,
            { $set: data },
            { new: true, runValidators: true },
        );

        if (updated && !updated.stockApplied && appliedStatuses.has(updated.status)) {
            await this.applyStock(updated, actor);
            const order = await this.inbound.findById(updated._id);
            await syncInboundWaybill(order, actor);

            return order;
        }

        await syncInboundWaybill(updated, actor);

        return updated;
    }

    async delete(ids: string[], actor = "", session?: mongoose.ClientSession) {
        if (!ids.length || ids.some((id) => !isValidObjectId(id))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "ids 格式错误");
        }

        const objectIds = ids.map((id) => toObjectId(id));
        const query = this.inbound
            .find({ _id: { $in: objectIds }, _isDeleted: { $ne: true } })
            .lean();
        if (session) query.session(session);
        const orders = await query;
        if (orders.some(hasProductionExecutionReference)) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "生产执行关联入库单不可直接删除");
        }
        let modifiedCount = 0;

        for (const order of orders) {
            if (session) {
                modifiedCount += await this.deleteInTransaction(order._id.toString(), actor, session);
                continue;
            }
            const needsLinkedTransaction = order.stockApplied && ((order.type === "生产" && order.salesOrderId) || await this.hasPurchaseAllocations(order));
            if (needsLinkedTransaction) {
                const currentSession = await mongoose.startSession();
                let transactionModifiedCount = 0;
                try {
                    await currentSession.withTransaction(async () => {
                        transactionModifiedCount = await this.deleteInTransaction(order._id.toString(), actor, currentSession);
                    });
                } finally {
                    await currentSession.endSession();
                }
                modifiedCount += transactionModifiedCount;
                continue;
            }

            if (order.stockApplied) {
                await this.reverseStock(order, actor);
            }

            const result = await this.inbound.updateOne(
                { _id: order._id, _isDeleted: { $ne: true } },
                {
                    $set: {
                        stockApplied: false,
                        _isDeleted: true,
                        deletedAt: new Date(),
                        deletedBy: actor,
                        updatedBy: actor,
                    },
                },
            );
            modifiedCount += result.modifiedCount || 0;
        }

        return {
            matchedCount: orders.length,
            modifiedCount,
        };
    }

    private async deleteInTransaction(id: string, actor: string, session: mongoose.ClientSession) {
        const order = await this.inbound.findOne({
            _id: id,
            _isDeleted: { $ne: true },
        }).session(session) as any;
        if (!order) return 0;
        if (hasProductionExecutionReference(order)) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "生产执行关联入库单不可直接删除");
        }

        const affectedSalesOrderIds = order.stockApplied
            ? await this.reverseStock(order, actor, session)
            : [];
        const result = await this.inbound.updateOne(
            { _id: order._id, _isDeleted: { $ne: true } },
            {
                $set: {
                    stockApplied: false,
                    _isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: actor,
                    updatedBy: actor,
                },
            },
            { session },
        );
        for (const salesOrderId of affectedSalesOrderIds) {
            await refreshSalesOrderFulfillmentStatus(salesOrderId, actor, { session });
        }
        return result.modifiedCount || 0;
    }

    private buildFilter(options: InboundListOptions) {
        const filter: Record<string, any> = {};
        if (!options.includeDeleted) {
            filter._isDeleted = { $ne: true };
        }

        const ids = Array.isArray(options.ids)
            ? options.ids
            : toText(options.ids).split(",").map((id) => id.trim()).filter(Boolean);
        if (ids.length) {
            const validIds = ids.filter(isValidObjectId).map(toObjectId).filter(Boolean);
            filter._id = { $in: validIds };
        }

        if (options.keyword) {
            const regex = new RegExp(escapeRegExp(options.keyword), "i");
            filter.$or = [
                { inboundNo: regex },
                { type: regex },
                { relatedNo: regex },
                { handler: regex },
                { remark: regex },
                { "items.productCode": regex },
                { "items.productName": regex },
                { "items.model": regex },
            ];
        }

        if (options.type) {
            filter.type = options.type;
        }

        const dateFilter: Record<string, Date> = {};
        if (options.inboundDate) {
            const start = parseDate(options.inboundDate, "入库日期");
            const end = new Date(start);
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);
            dateFilter.$gte = start;
            dateFilter.$lte = end;
        } else {
            if (options.startDate) {
                dateFilter.$gte = parseDate(options.startDate, "开始日期");
                dateFilter.$gte.setHours(0, 0, 0, 0);
            }
            if (options.endDate) {
                dateFilter.$lte = parseDate(options.endDate, "结束日期");
                dateFilter.$lte.setHours(23, 59, 59, 999);
            }
        }
        if (Object.keys(dateFilter).length) {
            filter.inboundDate = dateFilter;
        }

        return filter;
    }

    private async normalizePayload(payload: Record<string, any>, partial: boolean, actor = "", current?: any) {
        const data: Record<string, any> = {};
        const hasOwn = (field: string) => Object.prototype.hasOwnProperty.call(payload, field);

        if (hasOwn("inboundNo")) {
            data.inboundNo = toText(payload.inboundNo).toUpperCase();
        }
        if (hasOwn("type") || !partial) {
            data.type = toText(payload.type);
        }
        if (hasOwn("inboundDate") || !partial) {
            data.inboundDate = parseDate(payload.inboundDate ?? current?.inboundDate, "入库日期");
        }
        if (hasOwn("handler") || !partial) {
            data.handler = toText(payload.handler) || actor;
        }
        if (hasOwn("status") || !partial) {
            data.status = toText(payload.status) || INVENTORY_ORDER_STATUS.COMPLETED;
            if (!Object.values(INVENTORY_ORDER_STATUS).includes(data.status)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "入库单状态不合法");
            }
        }

        for (const field of textFields) {
            if (hasOwn(field)) {
                data[field] = toText(payload[field]);
            } else if (!partial) {
                data[field] = "";
            }
        }

        const effectiveType = data.type ?? current?.type;
        if (effectiveType === "生产") {
            if (hasOwn("salesOrderId")) {
                const salesOrderId = toText(payload.salesOrderId);
                if (salesOrderId && !isValidObjectId(salesOrderId)) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "销售订单ID格式错误");
                }
                data.salesOrderId = salesOrderId ? toObjectId(salesOrderId) : null;
                data.salesOrderNo = "";
            } else if (!partial) {
                data.salesOrderId = null;
                data.salesOrderNo = "";
            }
        } else {
            data.salesOrderId = null;
            data.salesOrderNo = "";
        }

        if (hasOwn("items") || !partial) {
            const rawItems = Array.isArray(payload.items) ? payload.items : [];
            if (!rawItems.length) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "入库明细不能为空");
            }
            data.items = [];
            for (const item of rawItems) {
                const quantity = toNumber(item.quantity, 0);
                if (quantity <= 0) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "入库数量必须大于0");
                }
                data.items.push(await useInventoryStockModel().buildInboundItemSnapshot({
                    productId: toText(item.productId),
                    quantity,
                    unitId: toText(item.unitId),
                    warehouseId: toText(item.warehouseId),
                    locationId: toText(item.locationId),
                }));
            }
        }

        if (!partial) {
            this.assertRequired(data);
        } else {
            this.assertRequired({
                type: data.type ?? current.type,
                inboundDate: data.inboundDate ?? current.inboundDate,
                items: data.items ?? current.items,
            });
        }

        data.relatedNo = this.getRelatedNo({
            ...current?.toObject?.(),
            ...data,
        });
        data.totalQuantity = data.items
            ? data.items.reduce((total: number, item: any) => total + Number(item.quantity || 0), 0)
            : current.totalQuantity;

        return data;
    }

    private assertStockAppliedMutation(current: any, data: Record<string, any>) {
        if (!current.stockApplied) return;

        throwInventoryError(400, CODE.INVALID_PARAMS, "已完成入库单不可修改");
    }

    private static readonly VALID_TYPES = ["期初建账", "采购", "生产", "售出退货", "外包", "盘盈入库", "退料"];

    private assertRequired(data: Record<string, any>) {
        if (!data.type) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "入库类型不能为空");
        }
        if (!InventoryInboundModel.VALID_TYPES.includes(data.type)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, `入库类型不合法：${data.type}`);
        }
        if (!data.inboundDate) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "入库日期不能为空");
        }
        if (!Array.isArray(data.items) || !data.items.length) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "入库产品明细不能为空");
        }
    }

    private getRelatedNo(data: Record<string, any>) {
        if (data.type === "采购") return data.purchaseOrderNo || data.trackingNo || "--";
        if (data.type === "生产") return data.processingOrderNo || "--";
        if (data.type === "售出退货") return data.orderNo || "--";
        return data.inboundNo || "--";
    }

    private async hasPurchaseAllocations(order: any) {
        if (order.type !== "采购" || !order.purchaseOrderNo) return false;
        if (await PurchaseOrderAllocation.exists({ purchaseOrderNo: order.purchaseOrderNo })) return true;
        return Boolean(await PurchaseRequestOrderAllocation.exists({ purchaseOrderNo: order.purchaseOrderNo, requirementId: null }));
    }

    private async applyStock(
        order: any,
        actor = "",
        session?: mongoose.ClientSession,
    ) {
        const purchaseAllocationModel = usePurchaseOrderAllocationModel();
        const purchaseLockMap = order.type === "采购" && order.purchaseOrderNo
            ? await purchaseAllocationModel.calculateInboundLocks(order.purchaseOrderNo, order.items, session)
            : new Map<string, number>();
        const remainingLockMap = new Map(purchaseLockMap);
        let productionPlan: Awaited<ReturnType<typeof buildProductionInboundLockPlan>> | null = null;
        if (order.type === "生产" && order.salesOrderId) {
            if (!session) throw new Error("关联销售订单的生产入库必须在 transaction 中执行");
            productionPlan = await buildProductionInboundLockPlan(
                order.salesOrderId.toString(),
                order.items,
                session,
                actor,
            );
        }

        const itemsWithLocks = productionPlan?.items || order.items.map((item: any) => {
            const productId = item.productId?.toString?.() || "";
            const quantity = normalizeStockQuantity(item.quantity);
            let lockedQuantity = 0;

            if (order.type === "采购" && order.purchaseOrderNo) {
                const remainingLockedQuantity = normalizeStockQuantity(remainingLockMap.get(productId) || 0);
                lockedQuantity = normalizeStockQuantity(Math.min(quantity, remainingLockedQuantity));
                remainingLockMap.set(productId, normalizeStockQuantity(remainingLockedQuantity - lockedQuantity));
            } else {
                lockedQuantity = getInboundLockedQuantity({
                    inboundType: order.type,
                    purchaseOrderNo: order.purchaseOrderNo,
                    quantity,
                });
            }

            return {
                ...(item.toObject?.() || item),
                quantity,
                lockedQuantity,
            };
        });

        if (order.type === "采购" && order.purchaseOrderNo) {
            await lockSalesOrdersForDirectPurchaseReceipt(order.purchaseOrderNo, itemsWithLocks, "apply", actor, session);
        }
        await useInventoryStockModel().applyInbound(
            itemsWithLocks.map((item: any) => ({
                productId: item.productId?.toString?.() || "",
                quantity: item.quantity,
                lockedQuantity: item.lockedQuantity,
                unitId: item.unitId?.toString?.() || "",
                warehouseId: item.warehouseId?.toString?.() || "",
                locationId: item.locationId?.toString?.() || "",
            })),
            {
                sourceType: "inbound",
                sourceId: order._id.toString(),
                sourceNo: order.inboundNo,
                businessType: `${order.type}入库`,
                changedAt: order.inboundDate,
                operator: order.handler || actor,
                remark: order.remark || "",
            },
            actor,
            session,
        );
        if (productionPlan && session) {
            await useSalesOrderStockReservationModel().createProductionInboundReservations(
                order._id.toString(),
                productionPlan.reservations,
                actor,
                session,
            );
        }
        await this.inbound.updateOne(
            { _id: order._id },
            {
                $set: {
                    items: itemsWithLocks,
                    salesOrderNo: productionPlan ? toText(productionPlan.order.orderNo) : toText(order.salesOrderNo),
                    stockApplied: true,
                    updatedBy: actor,
                },
            },
            session ? { session } : {},
        );
        if (order.type === "采购" && order.purchaseOrderNo) {
            await purchaseAllocationModel.markInboundLocked(order.purchaseOrderNo, itemsWithLocks, actor, session);
            const { usePurchaseOrderModel } = await import("~~/server/models/purchaseOrder.model");
            await usePurchaseOrderModel().refreshStatusByOrderNo(order.purchaseOrderNo, actor, session);
        }
        if (productionPlan) {
            await refreshSalesOrderFulfillmentStatus(
                productionPlan.order._id.toString(),
                actor,
                { session },
            );
        }
    }

    private async reverseStock(
        order: any,
        actor = "",
        session?: mongoose.ClientSession,
    ) {
        if (order.type === "生产" && order.salesOrderId) {
            await assertSalesOrderProductionReversalAllowed(order.salesOrderId.toString(), session);
            if (!session) throw new Error("关联销售订单的生产入库撤销必须在 transaction 中执行");
            await lockSalesOrderForProduction(order.salesOrderId.toString(), actor, session, { requireCompletion: true });
        }
        const reservationSources: Record<string, any>[] = [{ sourceInboundId: order._id }];
        if (order.type === "采购" && order.purchaseOrderNo) {
            const allocationQuery = PurchaseOrderAllocation.find({ purchaseOrderNo: order.purchaseOrderNo }).select("_id").lean();
            if (session) allocationQuery.session(session);
            const allocations = await allocationQuery as any[];
            if (allocations.length) reservationSources.push({ sourceAllocationId: { $in: allocations.map((item) => item._id) } });
        }
        const allocatedQuery = SalesOrderStockReservation.exists({
            $and: [
                { $or: reservationSources },
                { $or: [{ productionAllocatedQuantity: { $gt: 0 } }, { reservationType: "production-material", consumedQuantity: { $gt: 0 } }] },
            ],
        });
        if (session) allocatedQuery.session(session);
        if (await allocatedQuery) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "该入库物料已分配或出库用于生产，请先处理关联生产发料记录");
        }
        const affectedSalesOrderIds: string[] = [];
        if (order.type === "采购" && order.purchaseOrderNo) {
            affectedSalesOrderIds.push(...await lockSalesOrdersForDirectPurchaseReceipt(
                order.purchaseOrderNo, order.items, "reverse", actor, session,
            ));
            await usePurchaseOrderAllocationModel().assertInboundCanBeReversed(
                order.purchaseOrderNo,
                order.items,
                session,
                actor,
            );
        }
        if (order.type === "生产" && order.salesOrderId) {
            if (!session) throw new Error("关联销售订单的生产入库撤销必须在 transaction 中执行");
            await useSalesOrderStockReservationModel().assertProductionInboundCanBeReversed(
                order._id.toString(),
                session,
            );
        }
        await useInventoryStockModel().reverseInbound(
            order.items.map((item: any) => ({
                productId: item.productId?.toString?.() || "",
                quantity: item.quantity,
                lockedQuantity: item.lockedQuantity || 0,
                unitId: item.unitId?.toString?.() || "",
                warehouseId: item.warehouseId?.toString?.() || "",
                locationId: item.locationId?.toString?.() || "",
            })),
            order._id.toString(),
            actor,
            session,
        );
        if (order.type === "采购" && order.purchaseOrderNo) {
            if (session) {
                await this.inbound.updateOne({ _id: order._id }, { $set: { stockApplied: false, updatedBy: actor } }, { session });
            }
            const purchaseAllocationModel = usePurchaseOrderAllocationModel();
            await purchaseAllocationModel.unmarkInboundLocked(order.purchaseOrderNo, order.items, actor, session);
            const { usePurchaseOrderModel } = await import("~~/server/models/purchaseOrder.model");
            await usePurchaseOrderModel().refreshStatusByOrderNo(order.purchaseOrderNo, actor, session);
        }
        if (order.type === "生产" && order.salesOrderId && session) {
            affectedSalesOrderIds.push(
                ...await useSalesOrderStockReservationModel().releaseProductionInboundReservations(
                    order._id.toString(),
                    actor,
                    session,
                ),
            );
        }
        return affectedSalesOrderIds;
    }

    private async generateInboundNo(inboundDate: Date) {
        const year = inboundDate.getFullYear();
        const month = String(inboundDate.getMonth() + 1).padStart(2, "0");
        const day = String(inboundDate.getDate()).padStart(2, "0");
        const dateKey = `${year}${month}${day}`;
        const serial = await useInventoryCounterModel().nextNumber(`inventory:inbound:${dateKey}`);

        return `RK-${dateKey}-${String(serial).padStart(2, "0")}`;
    }

    private async assertUniqueInboundNo(inboundNo: string, excludeId?: string) {
        const filter: Record<string, any> = { inboundNo };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }

        const exists = await this.inbound.findOne(filter).select("_id").lean();
        if (exists) {
            throwInventoryError(409, CODE.INVENTORY_DUPLICATE_CODE, "入库编号已存在");
        }
    }
}

export const useInventoryInboundModel = () => new InventoryInboundModel(InventoryInbound);
export { InventoryInbound };
