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
import { syncTransferWaybill } from "~~/server/services/inventoryWaybillSync";

const { Schema } = mongoose;

export interface InventoryTransferReq {
    transferNo?: string;
    transferDate: string | Date;
    borrower?: string;
    expectedReturnDate?: string | Date;
    actualReturnTime?: string | Date;
    handler?: string;
    status?: string;
    courierCompany?: string;
    trackingNo?: string;
    remark?: string;
    items: InventoryStockApplyItem[];
    reserved1?: string;
    reserved2?: string;
    reserved3?: string;
    reserved4?: string;
    reserved5?: string;
}

type TransferListOptions = {
    keyword?: string;
    transferDate?: string;
    startDate?: string;
    endDate?: string;
    includeDeleted?: boolean;
    ids?: string[] | string;
    page?: number;
    limit?: number;
};

const transferItemSchema = new Schema(
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

const inventoryTransferSchema = new Schema(
    {
        transferNo: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
        },
        transferDate: {
            type: Date,
            required: true,
            index: true,
        },
        borrower: {
            type: String,
            default: "",
            trim: true,
            index: true,
        },
        expectedReturnDate: {
            type: Date,
            default: null,
            index: true,
        },
        actualReturnTime: {
            type: Date,
            default: null,
            index: true,
        },
        returned: {
            type: Boolean,
            default: false,
            index: true,
        },
        handler: {
            type: String,
            default: "",
            trim: true,
        },
        courierCompany: {
            type: String,
            default: "",
            trim: true,
        },
        trackingNo: {
            type: String,
            default: "",
            trim: true,
        },
        totalQuantity: {
            type: Number,
            default: 0,
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
        remark: {
            type: String,
            default: "",
        },
        items: {
            type: [transferItemSchema],
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

inventoryTransferSchema.index({ _isDeleted: 1, transferDate: -1, updateTime: -1 });

const InventoryTransfer =
    mongoose.models.InventoryTransfer || mongoose.model("InventoryTransfer", inventoryTransferSchema);

const appliedStatuses = new Set<string>([
    INVENTORY_ORDER_STATUS.APPROVED,
    INVENTORY_ORDER_STATUS.COMPLETED,
]);

const textFields = [
    "courierCompany",
    "trackingNo",
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

class InventoryTransferModel {
    transfer: typeof InventoryTransfer;

    constructor(transfer: typeof InventoryTransfer) {
        this.transfer = transfer;
    }

    async retrieve(options: TransferListOptions = {}) {
        const pageOptions = getPageParams({ page: options.page, limit: options.limit });
        const filter = this.buildFilter(options);

        const [list, total] = await Promise.all([
            this.transfer
                .find(filter)
                .sort({ transferDate: -1, updateTime: -1, createTime: -1 })
                .skip(pageOptions.skip)
                .limit(pageOptions.limit)
                .lean(),
            this.transfer.countDocuments(filter),
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

        return await this.transfer.findOne({ _id: id, _isDeleted: { $ne: true } }).lean();
    }

    async create(payload: InventoryTransferReq, actor = "") {
        const data = await this.normalizePayload(payload, false, actor);
        if (!data.transferNo) {
            data.transferNo = await this.generateTransferNo(data.transferDate);
        }
        await this.assertUniqueTransferNo(data.transferNo);

        const created = await this.transfer.create({
            ...data,
            handler: data.handler || actor,
            createdBy: actor,
            updatedBy: actor,
        });

        if (appliedStatuses.has(created.status)) {
            try {
                await this.applyStock(created, actor);
            } catch (err) {
                await this.transfer.deleteOne({ _id: created._id });
                throw err;
            }
        }

        const order = await this.transfer.findById(created._id);
        await syncTransferWaybill(order, actor);

        return order;
    }

    async update(id: string, payload: Partial<InventoryTransferReq>, actor = "") {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const current = await this.transfer.findOne({ _id: id, _isDeleted: { $ne: true } });
        if (!current) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
        }

        const data = await this.normalizePayload(payload, true, actor, current);
        if (data.transferNo !== undefined) {
            if (!data.transferNo) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "调拨编号不能为空");
            }
            await this.assertUniqueTransferNo(data.transferNo, id);
        }
        this.assertStockAppliedMutation(current, data);

        data.updatedBy = actor;
        const updated = await this.transfer.findByIdAndUpdate(
            id,
            { $set: data },
            { new: true, runValidators: true },
        );

        if (updated && !updated.stockApplied && appliedStatuses.has(updated.status)) {
            await this.applyStock(updated, actor);
            const order = await this.transfer.findById(updated._id);
            await syncTransferWaybill(order, actor);

            return order;
        }

        await syncTransferWaybill(updated, actor);

        return updated;
    }

    async delete(ids: string[], actor = "") {
        if (!ids.length || ids.some((id) => !isValidObjectId(id))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "ids 格式错误");
        }

        const objectIds = ids.map((id) => toObjectId(id));
        const orders = await this.transfer
            .find({ _id: { $in: objectIds }, _isDeleted: { $ne: true } })
            .lean();

        // 回滚库存
        for (const order of orders) {
            if (order.stockApplied) {
                if (!order.returned) {
                    await useInventoryStockModel().reverseOutbound(
                        (order.items || []).map((item: any) => ({
                            productId: item.productId?.toString?.() || "",
                            quantity: item.quantity,
                            lockedQuantity: 0,
                            unitId: item.unitId?.toString?.() || "",
                            warehouseId: item.warehouseId?.toString?.() || "",
                            locationId: item.locationId?.toString?.() || "",
                        })),
                        order._id?.toString?.() || "",
                        actor,
                    );
                }
                await useInventoryStockModel().deleteTransferLedgers(order._id?.toString?.() || "");
            }
        }

        return await this.transfer.updateMany(
            { _id: { $in: objectIds }, _isDeleted: { $ne: true } },
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
    }

    private buildFilter(options: TransferListOptions) {
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
                { transferNo: regex },
                { handler: regex },
                { borrower: regex },
                { courierCompany: regex },
                { trackingNo: regex },
                { remark: regex },
                { "items.warehouseName": regex },
                { "items.productCode": regex },
                { "items.productName": regex },
                { "items.model": regex },
            ];
        }

        const dateFilter: Record<string, Date> = {};
        if (options.transferDate) {
            const start = parseDate(options.transferDate, "调拨日期");
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
            filter.transferDate = dateFilter;
        }

        return filter;
    }

    private async normalizePayload(payload: Record<string, any>, partial: boolean, actor = "", current?: any) {
        const data: Record<string, any> = {};
        const hasOwn = (field: string) => Object.prototype.hasOwnProperty.call(payload, field);

        if (hasOwn("transferNo")) {
            data.transferNo = toText(payload.transferNo).toUpperCase();
        }
        if (hasOwn("transferDate") || !partial) {
            data.transferDate = parseDate(payload.transferDate ?? current?.transferDate, "调拨日期");
        }
        if (hasOwn("borrower") || !partial) {
            data.borrower = toText(payload.borrower);
        }
        if (hasOwn("expectedReturnDate") || !partial) {
            data.expectedReturnDate = parseDate(
                payload.expectedReturnDate ?? current?.expectedReturnDate,
                "预计归还日期",
            );
        }
        if (hasOwn("actualReturnTime")) {
            data.actualReturnTime = payload.actualReturnTime
                ? parseDate(payload.actualReturnTime, "实际归库时间")
                : null;
            data.returned = Boolean(data.actualReturnTime);
        }
        if (hasOwn("handler") || !partial) {
            data.handler = toText(payload.handler) || actor;
        }
        if (hasOwn("status") || !partial) {
            data.status = toText(payload.status) || INVENTORY_ORDER_STATUS.COMPLETED;
            if (!Object.values(INVENTORY_ORDER_STATUS).includes(data.status)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "调拨单状态不合法");
            }
        }

        for (const field of textFields) {
            if (hasOwn(field)) {
                data[field] = toText(payload[field]);
            } else if (!partial) {
                data[field] = "";
            }
        }

        if (hasOwn("items") || !partial) {
            const rawItems = Array.isArray(payload.items) ? payload.items : [];
            if (!rawItems.length) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "调拨明细不能为空");
            }
            data.items = [];
            for (const item of rawItems) {
                const quantity = toNumber(item.quantity, 0);
                if (quantity <= 0) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "调拨数量必须大于0");
                }
                if (!toText(item.warehouseId)) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "转出仓库不能为空");
                }
                data.items.push(await useInventoryStockModel().buildTransferItemSnapshot({
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
                transferDate: data.transferDate ?? current.transferDate,
                borrower: data.borrower ?? current.borrower,
                expectedReturnDate: data.expectedReturnDate ?? current.expectedReturnDate,
                items: data.items ?? current.items,
            });
        }

        data.totalQuantity = data.items
            ? data.items.reduce((total: number, item: any) => total + Number(item.quantity || 0), 0)
            : current.totalQuantity;

        return data;
    }

    private assertStockAppliedMutation(current: any, data: Record<string, any>) {
        if (!current.stockApplied) return;

        const logisticsFields = new Set([
            "courierCompany",
            "trackingNo",
            "totalQuantity",
        ]);
        const changedProtectedFields = Object.keys(data).filter((field) =>
            !logisticsFields.has(field) && !this.isSameValue(current[field], data[field]),
        );

        if (!changedProtectedFields.length) return;

        throwInventoryError(400, CODE.INVALID_PARAMS, "已完成调拨单仅可修改快递公司和快递单号");
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

    private assertRequired(data: Record<string, any>) {
        if (!data.transferDate) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "调拨日期不能为空");
        }
        if (!data.borrower) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "借用人不能为空");
        }
        if (!data.expectedReturnDate) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "预计归还日期不能为空");
        }
        if (!Array.isArray(data.items) || !data.items.length) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "调拨产品明细不能为空");
        }
    }

    private async applyStock(order: any, actor = "") {
        await useInventoryStockModel().applyOutbound(
            order.items.map((item: any) => ({
                productId: item.productId?.toString?.() || "",
                quantity: item.quantity,
                lockedQuantity: 0,
                unitId: item.unitId?.toString?.() || "",
                warehouseId: item.warehouseId?.toString?.() || "",
                locationId: item.locationId?.toString?.() || "",
            })),
            {
                sourceType: "transfer",
                sourceId: order._id.toString(),
                sourceNo: order.transferNo,
                businessType: "调拨出库",
                changedAt: order.transferDate,
                operator: order.handler || actor,
                remark: order.remark || "",
            },
            actor,
        );
        await this.transfer.updateOne(
            { _id: order._id },
            { $set: { stockApplied: true, updatedBy: actor } },
        );
    }

    async returnBorrowed(id: string, actualReturnTime: string | Date, actor = "") {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const order = await this.transfer.findOne({ _id: id, _isDeleted: { $ne: true } });
        if (!order) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
        }
        if (!order.stockApplied) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "调拨单未出库，无法归还");
        }
        if (order.returned || order.actualReturnTime) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "调拨单已归还");
        }

        const returnDate = parseDate(actualReturnTime, "实际归库时间");
        await useInventoryStockModel().applyInbound(
            (order.items || []).map((item: any) => ({
                productId: item.productId?.toString?.() || "",
                quantity: item.quantity,
                lockedQuantity: 0,
                unitId: item.unitId?.toString?.() || "",
                warehouseId: item.warehouseId?.toString?.() || "",
                locationId: item.locationId?.toString?.() || "",
            })),
            {
                sourceType: "transfer",
                sourceId: order._id.toString(),
                sourceNo: order.transferNo,
                businessType: "调拨归还",
                changedAt: returnDate,
                operator: order.handler || actor,
                remark: order.remark || "",
            },
            actor,
        );

        return await this.transfer.findByIdAndUpdate(
            id,
            {
                $set: {
                    actualReturnTime: returnDate,
                    returned: true,
                    updatedBy: actor,
                },
            },
            { new: true, runValidators: true },
        );
    }

    private async generateTransferNo(transferDate: Date) {
        const year = transferDate.getFullYear();
        const month = String(transferDate.getMonth() + 1).padStart(2, "0");
        const day = String(transferDate.getDate()).padStart(2, "0");
        const dateKey = `${year}${month}${day}`;
        const serial = await useInventoryCounterModel().nextNumber(`inventory:transfer:${dateKey}`);

        return `DB-${dateKey}-${String(serial).padStart(3, "0")}`;
    }

    private async assertUniqueTransferNo(transferNo: string, excludeId?: string) {
        const filter: Record<string, any> = { transferNo };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }

        const exists = await this.transfer.findOne(filter).select("_id").lean();
        if (exists) {
            throwInventoryError(409, CODE.INVENTORY_DUPLICATE_CODE, "调拨编号已存在");
        }
    }
}

export const useInventoryTransferModel = () => new InventoryTransferModel(InventoryTransfer);
export { InventoryTransfer };
