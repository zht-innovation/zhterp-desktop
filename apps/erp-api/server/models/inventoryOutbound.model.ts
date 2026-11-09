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
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";
import type { InventoryStockApplyItem } from "~~/server/models/inventoryStock.model";
import { useInventoryStockModel } from "~~/server/models/inventoryStock.model";
import type { InventorySavedFile } from "~~/server/services/inventoryFile";
import { useSalesOrderStockReservationModel } from "~~/server/models/salesOrderStockReservation.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { ensureSalesOrderCompletionState, hasSalesOrderCompletionRelease } from "~~/server/services/salesOrderCompletionState";
import { buildSalesOrderProductDemandMap, getSalesOrderShippedQuantities,
    refreshSalesOrderFulfillmentStatus, refreshSalesOrderShipmentStatus } from "~~/server/services/salesOrderFulfillment";
import { normalizeStockQuantity } from "~~/server/services/inventoryStockMath";
import { ensureSalesOrderShipmentReservations } from "~~/server/services/salesOrderShipmentReservation";

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

const assertGenericOutboundPayload = (payload: any) => {
    if (hasProductionExecutionReference(payload) || payload?.type === "生产领料") {
        throwInventoryError(409, CODE.INVENTORY_REFERENCED, "生产领料请通过生产发料流程操作");
    }
};

export interface InventoryOutboundReq {
    outboundNo?: string;
    type: string;
    outboundDate: string | Date;
    handler?: string;
    status?: string;
    remark?: string;
    contractOrderNo?: string;
    salesOrderId?: string;
    expressCompany?: string;
    waybillNo?: string;
    borrower?: string;
    borrowingParty?: string;
    deposit?: string;
    returnDate?: string | Date;
    project?: string;
    images?: InventorySavedFile[];
    items: InventoryStockApplyItem[];
    reserved1?: string;
    reserved2?: string;
    reserved3?: string;
    reserved4?: string;
    reserved5?: string;
}

type OutboundUpdateOptions = {
    allowAppliedRemark?: boolean;
};

type OutboundListOptions = {
    keyword?: string;
    type?: string;
    outboundDate?: string;
    startDate?: string;
    endDate?: string;
    includeDeleted?: boolean;
    ids?: string[] | string;
    salesOrderIds?: string[];
    page?: number;
    limit?: number;
};

const outboundItemSchema = new Schema(
    {
        ...productionReferenceFields,
        lockedQuantity: { type: Number, default: 0, min: 0 },
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

const outboundImageSchema = new Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        url: {
            type: String,
            required: true,
            trim: true,
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
    {
        _id: false,
        versionKey: false,
    },
);

const inventoryOutboundSchema = new Schema(
    {
        ...productionReferenceFields,
        sourceType: { type: String, default: "", index: true },
        sourceKey: { type: String, default: undefined },
        outboundNo: {
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
        outboundDate: {
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
        contractOrderNo: {
            type: String,
            default: "",
        },
        salesOrderId: {
            type: Schema.Types.ObjectId,
            ref: "SalesOrder",
            default: null,
            index: true,
        },
        expressCompany: {
            type: String,
            default: "",
        },
        waybillNo: {
            type: String,
            default: "",
        },
        borrower: {
            type: String,
            default: "",
        },
        borrowingParty: {
            type: String,
            default: "",
        },
        deposit: {
            type: String,
            default: "",
        },
        returnDate: {
            type: Date,
            default: null,
        },
        project: {
            type: String,
            default: "",
        },
        images: {
            type: [outboundImageSchema],
            default: [],
        },
        remark: {
            type: String,
            default: "",
        },
        items: {
            type: [outboundItemSchema],
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

inventoryOutboundSchema.index({ _isDeleted: 1, outboundDate: -1, updateTime: -1 });
inventoryOutboundSchema.index({ _isDeleted: 1, type: 1, outboundDate: -1 });
inventoryOutboundSchema.index({ sourceKey: 1 }, { unique: true, sparse: true });

const InventoryOutbound =
    mongoose.models.InventoryOutbound || mongoose.model("InventoryOutbound", inventoryOutboundSchema);

const appliedStatuses = new Set<string>([
    INVENTORY_ORDER_STATUS.APPROVED,
    INVENTORY_ORDER_STATUS.COMPLETED,
]);

const textFields = [
    "contractOrderNo",
    "expressCompany",
    "waybillNo",
    "borrower",
    "borrowingParty",
    "deposit",
    "project",
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

const parseOptionalDate = (value: unknown, label: string) => {
    const text = toText(value);
    if (!text) return null;

    const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const date = dateOnlyMatch
        ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
        : new Date(text);
    if (Number.isNaN(date.getTime())) {
        throwInventoryError(400, CODE.INVALID_PARAMS, `${label}格式错误`);
    }

    return date;
};

class InventoryOutboundModel {
    outbound: typeof InventoryOutbound;

    constructor(outbound: typeof InventoryOutbound) {
        this.outbound = outbound;
    }

    async retrieve(options: OutboundListOptions = {}) {
        const pageOptions = getPageParams({ page: options.page, limit: options.limit });
        const filter = this.buildFilter(options);

        const [list, total] = await Promise.all([
            this.outbound
                .find(filter)
                .sort({ outboundDate: -1, updateTime: -1, createTime: -1 })
                .skip(pageOptions.skip)
                .limit(pageOptions.limit)
                .lean(),
            this.outbound.countDocuments(filter),
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

    async detail(id: string, scope: Pick<OutboundListOptions, "salesOrderIds"> = {}) {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const filter = this.buildFilter(scope);
        return await this.outbound.findOne({ ...filter, _id: id }).lean();
    }

    async create(payload: InventoryOutboundReq, actor = "") {
        assertGenericOutboundPayload(payload);
        const data = await this.normalizePayload(payload, false, actor);
        if (!data.outboundNo) {
            data.outboundNo = await this.generateOutboundNo(data.outboundDate);
        }
        await this.assertUniqueOutboundNo(data.outboundNo);

        if (data.type === "订单") return await this.createOrderOutbound(data, actor);

        const created = await this.outbound.create({
            ...data,
            handler: data.handler || actor,
            createdBy: actor,
            updatedBy: actor,
        });

        if (appliedStatuses.has(created.status)) {
            try {
                await this.applyStock(created, actor);
            } catch (err) {
                await this.outbound.deleteOne({ _id: created._id });
                throw err;
            }
        }

        const order = await this.outbound.findById(created._id);

        return order;
    }

    async update(id: string, payload: Partial<InventoryOutboundReq>, actor = "", options: OutboundUpdateOptions = {}) {
        assertGenericOutboundPayload(payload);
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const current = await this.outbound.findOne({ _id: id, _isDeleted: { $ne: true } });
        if (!current) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
        }
        if (hasProductionExecutionReference(current)) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "生产执行关联出库单不可直接修改");
        }

        const data: Record<string, any> = options.allowAppliedRemark
            ? { remark: toText(payload.remark) }
            : await this.normalizePayload(payload, true, actor, current);
        if (data.outboundNo !== undefined) {
            if (!data.outboundNo) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "出库编号不能为空");
            }
            await this.assertUniqueOutboundNo(data.outboundNo, id);
        }
        this.assertStockAppliedMutation(current, data, options.allowAppliedRemark === true);

        if (current.type === "订单" || data.type === "订单") {
            return await this.updateOrderOutbound(id, data, actor, options.allowAppliedRemark === true);
        }

        data.updatedBy = actor;
        const updated = await this.outbound.findByIdAndUpdate(
            id,
            { $set: data },
            { new: true, runValidators: true },
        );

        if (!options.allowAppliedRemark && updated && !updated.stockApplied && appliedStatuses.has(updated.status)) {
            await this.applyStock(updated, actor);
            const order = await this.outbound.findById(updated._id);

            return order;
        }

        return updated;
    }

    async delete(ids: string[], actor = "") {
        if (!ids.length || ids.some((id) => !isValidObjectId(id))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "ids 格式错误");
        }

        const objectIds = ids.map((id) => toObjectId(id));
        const orders = await this.outbound
            .find({ _id: { $in: objectIds }, _isDeleted: { $ne: true } })
            .lean();
        if (orders.some(hasProductionExecutionReference)) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "生产执行关联出库单不可直接删除");
        }
        let modifiedCount = 0;

        for (const order of orders) {
            if (order.type === "订单") {
                modifiedCount += await this.deleteOrderOutbound(toText(order._id), actor);
                continue;
            }
            if (order.stockApplied) {
                await this.reverseStock(order, actor);
            }

            const result = await this.outbound.updateOne(
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

    private async createOrderOutbound(data: Record<string, any>, actor: string) {
        const session = await mongoose.startSession();
        let result: any;
        try {
            await session.withTransaction(async () => {
                const [created] = await this.outbound.create([{
                    ...data, handler: data.handler || actor, createdBy: actor, updatedBy: actor,
                }], { session });
                if (appliedStatuses.has(created.status)) await this.applyStock(created, actor, session);
                result = await this.outbound.findById(created._id).session(session);
            });
        } finally { await session.endSession(); }
        return result;
    }

    private async updateOrderOutbound(id: string, data: Record<string, any>, actor: string, allowAppliedRemark: boolean) {
        const session = await mongoose.startSession();
        let result: any;
        try {
            await session.withTransaction(async () => {
                const current = await this.outbound.findOne({ _id: id, _isDeleted: { $ne: true } }).session(session);
                if (!current) throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
                if (hasProductionExecutionReference(current)) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "生产执行关联出库单不可直接修改");
                this.assertStockAppliedMutation(current, data, allowAppliedRemark);
                result = await this.outbound.findOneAndUpdate({ _id: id, _isDeleted: { $ne: true } }, {
                    $set: { ...data, updatedBy: actor },
                }, { new: true, runValidators: true, session });
                if (!allowAppliedRemark && result && !result.stockApplied && appliedStatuses.has(result.status)) {
                    await this.applyStock(result, actor, session);
                    result = await this.outbound.findById(id).session(session);
                }
            });
        } finally { await session.endSession(); }
        return result;
    }

    private async deleteOrderOutbound(id: string, actor: string) {
        const session = await mongoose.startSession();
        let modifiedCount = 0;
        try {
            await session.withTransaction(async () => {
                modifiedCount = 0;
                const order = await this.outbound.findOne({ _id: id, _isDeleted: { $ne: true } }).session(session).lean() as any;
                if (!order) return;
                if (hasProductionExecutionReference(order)) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "生产执行关联出库单不可直接删除");
                if (order.stockApplied) await this.reverseStock(order, actor, session);
                const changed = await this.outbound.updateOne({ _id: id, _isDeleted: { $ne: true } }, {
                    $set: { stockApplied: false, _isDeleted: true, deletedAt: new Date(), deletedBy: actor, updatedBy: actor },
                }, { session });
                modifiedCount = changed.modifiedCount || 0;
            });
        } finally { await session.endSession(); }
        return modifiedCount;
    }

    private buildFilter(options: OutboundListOptions) {
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
                { outboundNo: regex },
                { type: regex },
                { relatedNo: regex },
                { handler: regex },
                { remark: regex },
                { contractOrderNo: regex },
                { borrower: regex },
                { borrowingParty: regex },
                { project: regex },
                { "items.productCode": regex },
                { "items.productName": regex },
                { "items.model": regex },
            ];
        }

        if (options.type) {
            filter.type = options.type;
        }

        const dateFilter: Record<string, Date> = {};
        if (options.outboundDate) {
            const start = parseDate(options.outboundDate, "出库日期");
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
            filter.outboundDate = dateFilter;
        }

        // 本人订单范围由服务端身份确定，不能被查询类型或已删除选项覆盖。
        if (options.salesOrderIds !== undefined) {
            filter.type = "订单";
            filter._isDeleted = { $ne: true };
            filter.salesOrderId = {
                $in: options.salesOrderIds.filter(isValidObjectId).map(toObjectId).filter(Boolean),
            };
        }

        return filter;
    }

    private async normalizePayload(payload: Record<string, any>, partial: boolean, actor = "", current?: any) {
        const data: Record<string, any> = {};
        const hasOwn = (field: string) => Object.prototype.hasOwnProperty.call(payload, field);

        if (hasOwn("outboundNo")) {
            data.outboundNo = toText(payload.outboundNo).toUpperCase();
        }
        if (hasOwn("type") || !partial) {
            data.type = toText(payload.type);
        }
        if (hasOwn("outboundDate") || !partial) {
            data.outboundDate = parseDate(payload.outboundDate ?? current?.outboundDate, "出库日期");
        }
        if (hasOwn("handler") || !partial) {
            data.handler = toText(payload.handler) || actor;
        }
        if (hasOwn("status") || !partial) {
            data.status = toText(payload.status) || INVENTORY_ORDER_STATUS.COMPLETED;
            if (!Object.values(INVENTORY_ORDER_STATUS).includes(data.status)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "出库单状态不合法");
            }
        }

        for (const field of textFields) {
            if (hasOwn(field)) {
                data[field] = toText(payload[field]);
            } else if (!partial) {
                data[field] = "";
            }
        }
        if (hasOwn("salesOrderId")) {
            data.salesOrderId = toObjectId(toText(payload.salesOrderId));
        } else if (!partial) {
            data.salesOrderId = null;
        }

        if (hasOwn("returnDate")) {
            data.returnDate = parseOptionalDate(payload.returnDate, "归还日期");
        } else if (!partial) {
            data.returnDate = null;
        }

        if (hasOwn("images") || !partial) {
            const images = Array.isArray(payload.images) ? payload.images : [];
            data.images = images.map((image: any) => ({
                name: toText(image.name),
                url: toText(image.url),
                size: Number.isFinite(Number(image.size)) ? Number(image.size) : 0,
                type: toText(image.type),
            })).filter((image: InventorySavedFile) => image.name && image.url);
        }

        if (hasOwn("items") || !partial) {
            const rawItems = Array.isArray(payload.items) ? payload.items : [];
            if (!rawItems.length) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "出库明细不能为空");
            }
            data.items = [];
            for (const item of rawItems) {
                const quantity = toNumber(item.quantity, 0);
                if (quantity <= 0) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "出库数量必须大于0");
                }
                data.items.push(await useInventoryStockModel().buildOutboundItemSnapshot({
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
                outboundDate: data.outboundDate ?? current.outboundDate,
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

    private assertStockAppliedMutation(current: any, data: Record<string, any>, allowAppliedRemark = false) {
        if (!current.stockApplied) return;

        const logisticsFields = new Set([
            "expressCompany",
            "waybillNo",
            "relatedNo",
            "totalQuantity",
            "images",
        ]);
        if (allowAppliedRemark) {
            logisticsFields.add("remark");
        }
        const changedProtectedFields = Object.keys(data).filter((field) =>
            !logisticsFields.has(field) && !this.isSameValue(current[field], data[field]),
        );

        if (!changedProtectedFields.length) return;

        const message = allowAppliedRemark
            ? "库管仅可修改出库单备注"
            : "已完成出库单仅可修改快递公司、运单号和照片";
        throwInventoryError(400, CODE.INVALID_PARAMS, message);
    }

    private isSameValue(left: any, right: any) {
        return JSON.stringify(this.normalizeComparableValue(left)) === JSON.stringify(this.normalizeComparableValue(right));
    }

    private normalizeComparableValue(value: any): any {
        if (value === null || value === undefined) return "";
        if (value instanceof Date) return value.toISOString();
        if (Array.isArray(value)) return value.map((item) => this.normalizeComparableValue(item));
        if (typeof value === "object") {
            const plain = typeof value.toObject === "function" ? value.toObject() : value;
            const normalized: Record<string, any> = {};
            for (const key of Object.keys(plain).sort()) {
                if (key === "_id") continue;
                const item = plain[key];
                if (item && typeof item.toString === "function" && item.constructor?.name === "ObjectId") {
                    normalized[key] = item.toString();
                    continue;
                }
                normalized[key] = this.normalizeComparableValue(item);
            }
            return normalized;
        }

        return value;
    }

    private static readonly VALID_TYPES = ["订单", "借给客户", "备货", "维修", "外包", "其他", "盘亏出库"];

    private assertRequired(data: Record<string, any>) {
        if (!data.type) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "出库类型不能为空");
        }
        if (!InventoryOutboundModel.VALID_TYPES.includes(data.type)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, `出库类型不合法：${data.type}`);
        }
        if (!data.outboundDate) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "出库日期不能为空");
        }
        if (!Array.isArray(data.items) || !data.items.length) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "出库产品明细不能为空");
        }
    }

    private getRelatedNo(data: Record<string, any>) {
        if (data.type === "订单") return data.contractOrderNo || data.waybillNo || "--";
        if (data.type === "借给客户") return data.borrowingParty || data.borrower || "--";
        return data.outboundNo || "--";
    }

    private async lockSalesOrderForShipment(order: any, actor: string, session: mongoose.ClientSession, reversing = false) {
        const filter: Record<string, any> = { _isDeleted: { $ne: true } };
        if (order.salesOrderId) filter._id = order.salesOrderId;
        else if (order.contractOrderNo) filter.orderNo = order.contractOrderNo;
        else throwInventoryError(400, CODE.INVALID_PARAMS, "订单出库必须关联有效的销售订单");
        const existing = await useSalesOrderModel().order.findOne(filter).session(session).lean() as any;
        if (!existing) throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "关联销售订单不存在");
        const salesOrder = await ensureSalesOrderCompletionState(existing, session);
        if (!reversing) {
            if (salesOrder.productionCompletionReviewReason) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, salesOrder.productionCompletionReviewReason);
            }
            if (toText(salesOrder.status) !== "待出库") {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, salesOrder.status === "已出库"
                    ? "销售订单已全部出库，不能重复出库" : "销售订单尚未放行，不能出库");
            }
            if (salesOrder.productionCompletionRequired && !hasSalesOrderCompletionRelease(salesOrder)) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "销售订单尚未确认完工，不能出库");
            }
            const demand = buildSalesOrderProductDemandMap(salesOrder.products);
            const shipped = await getSalesOrderShippedQuantities(toText(salesOrder._id), session);
            const requested = new Map<string, number>();
            for (const item of order.items || []) {
                const productId = toText(item.productId);
                requested.set(productId, normalizeStockQuantity((requested.get(productId) || 0) + Number(item.quantity || 0)));
            }
            for (const [productId, quantity] of requested) {
                if (!demand.has(productId) || normalizeStockQuantity((shipped.get(productId) || 0) + quantity) > demand.get(productId)!) {
                    throwInventoryError(409, CODE.INVENTORY_REFERENCED, "出库产品不属于销售订单或数量超过剩余交付需求");
                }
            }
        }
        const updated = await useSalesOrderModel().order.findOneAndUpdate({
            _id: salesOrder._id, _isDeleted: { $ne: true },
            productionPlanVersion: salesOrder.productionPlanVersion === undefined ? { $exists: false } : salesOrder.productionPlanVersion,
        }, { $inc: { productionPlanVersion: 1 }, $set: { updatedBy: actor } }, { new: true, session }).lean() as any;
        if (!updated) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "销售订单已变化，请刷新后重试");
        order.salesOrderId = updated._id;
        return updated;
    }

    private async applyStock(order: any, actor = "", session?: mongoose.ClientSession) {
        let salesOrder: any;
        if (order.type === "订单") {
            if (!session) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "订单出库必须在事务中执行");
            salesOrder = await this.lockSalesOrderForShipment(order, actor, session);
            await ensureSalesOrderShipmentReservations(salesOrder, order.items, actor, session);
            await useSalesOrderStockReservationModel().assertCanConsume(
                order.salesOrderId.toString(),
                order.items,
                session,
            );
        }
        await useInventoryStockModel().applyOutbound(
            order.items.map((item: any) => ({
                productId: item.productId?.toString?.() || "",
                quantity: item.quantity,
                lockedQuantity: order.type === "订单" ? item.quantity : 0,
                unitId: item.unitId?.toString?.() || "",
                warehouseId: item.warehouseId?.toString?.() || "",
                locationId: item.locationId?.toString?.() || "",
            })),
            {
                sourceType: "outbound",
                sourceId: order._id.toString(),
                sourceNo: order.outboundNo,
                businessType: `${order.type}出库`,
                changedAt: order.outboundDate,
                operator: order.handler || actor,
                remark: order.remark || "",
            },
            actor,
            session,
            { preservePosition: order.type === "订单" },
        );
        await this.outbound.updateOne(
            { _id: order._id },
            { $set: { salesOrderId: order.salesOrderId || null, stockApplied: true, updatedBy: actor } },
            session ? { session } : {},
        );
        if (order.type === "订单") {
            await useSalesOrderStockReservationModel().consume(
                order.salesOrderId.toString(),
                order.items,
                actor,
                session,
            );
            await refreshSalesOrderShipmentStatus(salesOrder, actor, session!);
        }
    }

    private async reverseStock(order: any, actor = "", session?: mongoose.ClientSession) {
        let salesOrder: any;
        if (order.type === "订单") {
            if (!session) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "撤销订单出库必须在事务中执行");
            salesOrder = await this.lockSalesOrderForShipment(order, actor, session, true);
        }
        await useInventoryStockModel().reverseOutbound(
            order.items.map((item: any) => ({
                productId: item.productId?.toString?.() || "",
                quantity: item.quantity,
                lockedQuantity: order.type === "订单" ? item.quantity : 0,
                unitId: item.unitId?.toString?.() || "",
                warehouseId: item.warehouseId?.toString?.() || "",
                locationId: item.locationId?.toString?.() || "",
            })),
            order._id.toString(),
            actor,
            session,
        );
        if (order.type === "订单" && order.salesOrderId) {
            await useSalesOrderStockReservationModel().reverseConsumption(
                order.salesOrderId.toString(),
                order.items,
                actor,
                session,
            );
            if (salesOrder.productionCompletionRequired && !hasSalesOrderCompletionRelease(salesOrder)) {
                await refreshSalesOrderFulfillmentStatus(toText(salesOrder._id), actor, { session });
            } else {
                await refreshSalesOrderShipmentStatus(salesOrder, actor, session!);
            }
        }
    }

    private async generateOutboundNo(outboundDate: Date) {
        const year = outboundDate.getFullYear();
        const month = String(outboundDate.getMonth() + 1).padStart(2, "0");
        const day = String(outboundDate.getDate()).padStart(2, "0");
        const dateKey = `${year}${month}${day}`;
        const serial = await useInventoryCounterModel().nextNumber(`inventory:outbound:${dateKey}`);

        return `CK-${dateKey}-${String(serial).padStart(2, "0")}`;
    }

    private async assertUniqueOutboundNo(outboundNo: string, excludeId?: string) {
        const filter: Record<string, any> = { outboundNo };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }

        const exists = await this.outbound.findOne(filter).select("_id").lean();
        if (exists) {
            throwInventoryError(409, CODE.INVENTORY_DUPLICATE_CODE, "出库编号已存在");
        }
    }
}

export const useInventoryOutboundModel = () => new InventoryOutboundModel(InventoryOutbound);
export { InventoryOutbound };
