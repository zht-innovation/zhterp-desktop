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
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";
import type { InventorySavedFile } from "~~/server/services/inventoryFile";
import type { InventoryWaybillReadScope } from "~~/server/services/inventoryWaybillAccess";

const { Schema } = mongoose;

export interface InventoryWaybillReq {
    direction?: "send" | "receive" | string;
    sourceType?: "purchase-logistics" | string;
    sourceOrderId?: string;
    sourceWaybillId?: string;
    waybillNo?: string;
    company?: string;
    trackingNo?: string;
    relatedOrderNo?: string;
    salesperson?: string;
    goods?: string;
    businessType?: string;
    sentAt?: string | Date;
    senderAddress?: string;
    receiverAddress?: string;
    receiverName?: string;
    transportInfo?: string;
    transportTraces?: Array<{
        action?: string;
        acceptStation?: string;
        acceptTime?: string | Date | null;
        location?: string;
    }>;
    transportStatus?: "待发货" | "已揽收" | "运输中" | "待取货" | "已签收";
    transportUpdatedAt?: string | Date | null;
    transportUpdatedBy?: string;
    needsSupplement?: boolean;
    image?: string;
    imageName?: string;
    images?: InventorySavedFile[];
    attachments?: InventorySavedFile[];
    remark?: string;
    reserved1?: string;
    reserved2?: string;
    reserved3?: string;
    reserved4?: string;
    reserved5?: string;
}

const waybillAttachmentSchema = new Schema(
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

const inventoryWaybillSchema = new Schema(
    {
        direction: {
            type: String,
            enum: ["send", "receive"],
            default: "send",
            index: true,
        },
        sourceType: {
            type: String,
            default: "",
            trim: true,
            index: true,
        },
        sourceOrderId: {
            type: String,
            default: "",
            trim: true,
            index: true,
        },
        sourceWaybillId: {
            type: String,
            default: "",
            trim: true,
            index: true,
        },
        waybillNo: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
        },
        company: {
            type: String,
            required: true,
            trim: true,
        },
        trackingNo: {
            type: String,
            required: true,
            trim: true,
        },
        relatedOrderNo: {
            type: String,
            default: "",
            trim: true,
        },
        salesperson: {
            type: String,
            default: "",
            trim: true,
        },
        goods: {
            type: String,
            required: true,
            trim: true,
        },
        businessType: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        sentAt: {
            type: Date,
            required: true,
            index: true,
        },
        senderAddress: {
            type: String,
            default: "",
            trim: true,
        },
        receiverAddress: {
            type: String,
            required: true,
            trim: true,
        },
        receiverName: {
            type: String,
            default: "",
            trim: true,
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
            enum: ["待发货", "已揽收", "运输中", "待取货", "已签收"],
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
        needsSupplement: {
            type: Boolean,
            default: false,
            index: true,
        },
        image: {
            type: String,
            default: "",
        },
        imageName: {
            type: String,
            default: "",
        },
        images: {
            type: [waybillAttachmentSchema],
            default: [],
        },
        attachmentNames: {
            type: [String],
            default: [],
        },
        attachments: {
            type: [waybillAttachmentSchema],
            default: [],
        },
        remark: {
            type: String,
            default: "",
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

inventoryWaybillSchema.index({ _isDeleted: 1, sentAt: -1, updateTime: -1 });
inventoryWaybillSchema.index({ direction: 1, _isDeleted: 1, sentAt: -1 });
inventoryWaybillSchema.index({ _isDeleted: 1, businessType: 1, sentAt: -1 });
inventoryWaybillSchema.index({ trackingNo: 1, _isDeleted: 1 });
inventoryWaybillSchema.index({ sourceType: 1, sourceOrderId: 1, sourceWaybillId: 1, _isDeleted: 1 });

const InventoryWaybill =
    mongoose.models.InventoryWaybill || mongoose.model("InventoryWaybill", inventoryWaybillSchema);

type WaybillListOptions = {
    direction?: "send" | "receive" | string;
    relatedOrderNo?: string;
    trackingNo?: string;
    salesperson?: string;
    sortOrder?: "asc" | "desc" | string;
    keyword?: string;
    company?: string;
    businessType?: string;
    startDate?: string;
    endDate?: string;
    includeDeleted?: boolean;
    ids?: string[] | string;
    page?: number;
    limit?: number;
};

const textFields = [
    "relatedOrderNo",
    "salesperson",
    "receiverName",
    "image",
    "imageName",
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
        ? new Date(
            Number(dateOnlyMatch[1]),
            Number(dateOnlyMatch[2]) - 1,
            Number(dateOnlyMatch[3]),
        )
        : new Date(text);
    if (Number.isNaN(date.getTime())) {
        throwInventoryError(400, CODE.INVALID_PARAMS, `${label}格式错误`);
    }

    return date;
};

class InventoryWaybillModel {
    waybill: typeof InventoryWaybill;

    constructor(waybill: typeof InventoryWaybill) {
        this.waybill = waybill;
    }

    async retrieve(options: WaybillListOptions = {}, scope: InventoryWaybillReadScope = {}) {
        const pageOptions = getPageParams({ page: options.page, limit: options.limit });
        const filter = this.buildFilter(options, scope);

        const [list, total] = await Promise.all([
            this.waybill
                .find(filter)
                .sort({
                    sentAt: options.sortOrder === "asc" ? 1 : -1,
                    updateTime: options.sortOrder === "asc" ? 1 : -1,
                    createTime: options.sortOrder === "asc" ? 1 : -1,
                })
                .skip(pageOptions.skip)
                .limit(pageOptions.limit)
                .lean(),
            this.waybill.countDocuments(filter),
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

    async detail(id: string, scope: InventoryWaybillReadScope = {}) {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const filter = this.applyReadScope({ _id: id, _isDeleted: { $ne: true } }, scope);
        return await this.waybill.findOne(filter).lean();
    }

    async create(payload: InventoryWaybillReq, actor = "") {
        const data = await this.normalizePayload(payload, false);

        if (!data.waybillNo) {
            data.waybillNo = await this.generateWaybillNo(data.sentAt);
        }

        await this.assertUniqueWaybillNo(data.waybillNo);

        return await this.waybill.create({
            ...data,
            salesperson: data.salesperson || actor,
            createdBy: actor,
            updatedBy: actor,
        });
    }

    async upsertByTrackingNo(payload: InventoryWaybillReq, actor = "") {
        const trackingNo = toText(payload.trackingNo);
        if (!trackingNo) return null;

        const sourceOrderId = toText(payload.sourceOrderId);
        const sourceWaybillId = toText(payload.sourceWaybillId);
        let current = sourceOrderId && sourceWaybillId
            ? await this.waybill.findOne({
                sourceType: "purchase-logistics",
                sourceOrderId,
                sourceWaybillId,
                _isDeleted: { $ne: true },
            })
            : null;
        if (!current && sourceOrderId && sourceWaybillId) {
            // 可复用同号的手工收件记录；不占用寄件记录或其他采购单的运单。
            current = await this.waybill.findOne({
                trackingNo: new RegExp(`^${escapeRegExp(trackingNo)}$`, "i"),
                direction: "receive",
                sourceType: { $ne: "purchase-logistics" },
                _isDeleted: { $ne: true },
            });
        }
        if (!current && !(sourceOrderId && sourceWaybillId)) {
            current = await this.waybill.findOne({
                trackingNo: new RegExp(`^${escapeRegExp(trackingNo)}$`, "i"),
                _isDeleted: { $ne: true },
            });
        }

        if (!current) {
            return await this.create({
                company: toText(payload.company) || "其他",
                direction: payload.direction,
                sourceType: payload.sourceType,
                sourceOrderId,
                sourceWaybillId,
                trackingNo,
                relatedOrderNo: toText(payload.relatedOrderNo),
                salesperson: toText(payload.salesperson) || actor,
                goods: toText(payload.goods) || "待补充",
                businessType: toText(payload.businessType) || "其他",
                sentAt: payload.sentAt || new Date(),
                senderAddress: toText(payload.senderAddress),
                receiverAddress: toText(payload.receiverAddress) || "未填写",
                receiverName: toText(payload.receiverName),
                needsSupplement: Boolean(payload.needsSupplement),
                images: Array.isArray(payload.images) ? payload.images : [],
                remark: toText(payload.remark),
            }, actor);
        }

        const nextPayload: Partial<InventoryWaybillReq> = {
            sourceType: current.sourceType === "purchase-logistics"
                ? current.sourceType
                : toText(payload.sourceType) || current.sourceType || "",
            sourceOrderId: sourceOrderId || current.sourceOrderId || "",
            sourceWaybillId: sourceWaybillId || current.sourceWaybillId || "",
            company: toText(payload.company) || current.company || "其他",
            relatedOrderNo: toText(payload.relatedOrderNo) || current.relatedOrderNo || "",
            salesperson: toText(payload.salesperson) || current.salesperson || actor,
            goods: toText(payload.goods) || current.goods || "待补充",
            businessType: toText(payload.businessType) || current.businessType || "其他",
            sentAt: payload.sentAt || current.sentAt || new Date(),
            senderAddress: toText(payload.senderAddress) || current.senderAddress || "",
            receiverAddress: toText(payload.receiverAddress) || current.receiverAddress || "未填写",
            receiverName: toText(payload.receiverName) || current.receiverName || "",
            needsSupplement: Boolean(payload.needsSupplement) || Boolean(current.needsSupplement),
            images: Array.isArray(payload.images) ? payload.images : current.images || [],
            remark: toText(payload.remark) || current.remark || "",
        };

        if (payload.direction === "receive" || payload.direction === "send") {
            nextPayload.direction = payload.direction;
        }

        if (sourceOrderId && sourceWaybillId) {
            // 自动关联不覆盖运单记录中已经人工补充的内容。
            for (const field of ["company", "relatedOrderNo", "salesperson", "goods", "businessType", "senderAddress", "receiverAddress", "receiverName", "remark"] as const) {
                const existing = toText(current[field]);
                if (existing && existing !== "未填写" && existing !== "待补充") nextPayload[field] = existing;
            }
            if (current.sentAt) nextPayload.sentAt = current.sentAt;
            if (current.images?.length) nextPayload.images = current.images;
        }

        return await this.update(current._id.toString(), nextPayload, actor);
    }

    async softDeleteMissingPurchaseWaybills(
        sourceOrderId: string,
        activeSourceWaybillIds: string[],
        actor = "",
    ) {
        const filter: Record<string, any> = {
            sourceType: "purchase-logistics",
            sourceOrderId,
            _isDeleted: { $ne: true },
        };
        if (activeSourceWaybillIds.length) {
            filter.sourceWaybillId = { $nin: activeSourceWaybillIds };
        }

        return await this.waybill.updateMany(
            filter,
            {
                $set: {
                    _isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: actor,
                    updatedBy: actor,
                },
            },
        );
    }

    async update(id: string, payload: Partial<InventoryWaybillReq>, actor = "") {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const current = await this.waybill.findOne({ _id: id, _isDeleted: { $ne: true } });
        if (!current) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
        }

        const data = await this.normalizePayload(payload, true, current);
        if (data.waybillNo !== undefined) {
            if (!data.waybillNo) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "物流单号不能为空");
            }
            await this.assertUniqueWaybillNo(data.waybillNo, id);
        }

        if (Object.keys(data).length === 0) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "更新时至少传一个字段");
        }

        data.updatedBy = actor;
        if (!data.salesperson) {
            data.salesperson = actor;
        }

        return await this.waybill.findByIdAndUpdate(
            id,
            { $set: data },
            { new: true, runValidators: true },
        );
    }

    async delete(ids: string[], actor = "") {
        if (!ids.length || ids.some((id) => !isValidObjectId(id))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "ids 格式错误");
        }

        return await this.waybill.updateMany(
            { _id: { $in: ids.map((id) => toObjectId(id)) }, _isDeleted: { $ne: true } },
            {
                $set: {
                    _isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: actor,
                    updatedBy: actor,
                },
            },
        );
    }

    private applyReadScope(filter: Record<string, any>, scope: InventoryWaybillReadScope) {
        if (scope.relatedOrderNos === undefined) return filter;

        return {
            $and: [filter, {
                relatedOrderNo: { $in: scope.relatedOrderNos },
                direction: { $in: ["send", null] },
                businessType: "订单交付",
                sourceType: { $ne: "purchase-logistics" },
                _isDeleted: { $ne: true },
            }],
        };
    }

    private buildFilter(options: WaybillListOptions, scope: InventoryWaybillReadScope) {
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
                { waybillNo: regex },
                { company: regex },
                { trackingNo: regex },
                { relatedOrderNo: regex },
                { salesperson: regex },
                { goods: regex },
                { businessType: regex },
            ];
            if (scope.relatedOrderNos === undefined) {
                filter.$or.push(
                    { senderAddress: regex },
                    { receiverAddress: regex },
                    { receiverName: regex },
                    { remark: regex },
                );
            }
        }

        if (options.businessType) {
            filter.businessType = options.businessType;
        }
        if (options.direction === "receive" || options.direction === "send") {
            filter.direction = options.direction === "send"
                ? { $in: ["send", null] }
                : "receive";
        }
        if (options.company) {
            filter.company = options.company;
        }
        if (options.relatedOrderNo) {
            filter.relatedOrderNo = new RegExp(escapeRegExp(options.relatedOrderNo), "i");
        }
        if (options.trackingNo) {
            filter.trackingNo = new RegExp(escapeRegExp(options.trackingNo), "i");
        }
        if (options.salesperson) {
            filter.salesperson = new RegExp(escapeRegExp(options.salesperson), "i");
        }

        const sentAtFilter: Record<string, Date> = {};
        if (options.startDate) {
            sentAtFilter.$gte = parseDate(options.startDate, "开始日期");
            sentAtFilter.$gte.setHours(0, 0, 0, 0);
        }
        if (options.endDate) {
            sentAtFilter.$lte = parseDate(options.endDate, "结束日期");
            sentAtFilter.$lte.setHours(23, 59, 59, 999);
        }
        if (Object.keys(sentAtFilter).length) {
            filter.sentAt = sentAtFilter;
        }

        return this.applyReadScope(filter, scope);
    }

    private async normalizePayload(payload: Record<string, any>, partial: boolean, current?: any) {
        const data: Record<string, any> = {};
        const hasOwn = (field: string) => Object.prototype.hasOwnProperty.call(payload, field);
        if (hasOwn("direction") || !partial) {
            data.direction = payload.direction === "receive" ? "receive" : "send";
        }
        for (const field of ["sourceType", "sourceOrderId", "sourceWaybillId"]) {
            if (hasOwn(field)) data[field] = toText(payload[field]);
        }

        for (const field of ["transportInfo", "transportUpdatedBy"]) {
            if (hasOwn(field)) data[field] = toText(payload[field]);
        }
        if (hasOwn("transportStatus")) {
            const status = toText(payload.transportStatus);
            if (["待发货", "已揽收", "运输中", "待取货", "已签收"].includes(status)) {
                data.transportStatus = status;
            }
        }
        if (hasOwn("transportUpdatedAt")) {
            data.transportUpdatedAt = payload.transportUpdatedAt ? new Date(payload.transportUpdatedAt) : null;
        }
        if (hasOwn("transportTraces")) {
            data.transportTraces = Array.isArray(payload.transportTraces)
                ? payload.transportTraces.map((trace: any) => ({
                    action: toText(trace.action),
                    acceptStation: toText(trace.acceptStation),
                    acceptTime: trace.acceptTime ? new Date(trace.acceptTime) : null,
                    location: toText(trace.location),
                })).filter((trace: any) => trace.acceptStation)
                : [];
        }

        if (hasOwn("waybillNo")) {
            data.waybillNo = toText(payload.waybillNo).toUpperCase();
        }
        if (hasOwn("company") || !partial) {
            data.company = toText(payload.company);
        }
        if (hasOwn("trackingNo") || !partial) {
            data.trackingNo = toText(payload.trackingNo);
        }
        if (hasOwn("goods") || !partial) {
            data.goods = toText(payload.goods);
            if (partial && !toText(current?.sourceType) && !data.sourceType
                && data.goods !== toText(current?.goods)) {
                const sourceLabel = /^自动同步：(采购单|采购验收|入库单|出库单|调拨单)(?:\s|；|$)/
                    .exec(toText(current?.remark))?.[1];
                if (sourceLabel) {
                    // 旧自动记录保存为名称格式后，避免再次截断名称末尾的 x数字。
                    const sourceTypes: Record<string, string> = {
                        采购单: "inventory-inbound",
                        采购验收: "inventory-inbound",
                        入库单: "inventory-inbound",
                        出库单: "inventory-outbound",
                        调拨单: "inventory-transfer",
                    };
                    data.sourceType = sourceTypes[sourceLabel];
                }
            }
        }
        if (hasOwn("businessType") || !partial) {
            data.businessType = toText(payload.businessType);
        }
        if (hasOwn("sentAt") || !partial) {
            data.sentAt = parseDate(payload.sentAt ?? current?.sentAt, "寄件时间");
        }
        if (hasOwn("senderAddress") || !partial) {
            data.senderAddress = toText(payload.senderAddress);
        }
        if (hasOwn("receiverAddress") || !partial) {
            data.receiverAddress = toText(payload.receiverAddress);
        }

        for (const field of textFields) {
            if (hasOwn(field)) {
                data[field] = toText(payload[field]);
            } else if (!partial) {
                data[field] = "";
            }
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

        if (hasOwn("attachments") || !partial) {
            const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
            data.attachments = attachments.map((attachment: any) => ({
                name: toText(attachment.name),
                url: toText(attachment.url),
                size: Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : 0,
                type: toText(attachment.type),
            })).filter((attachment: InventorySavedFile) => attachment.name && attachment.url);
            data.attachmentNames = data.attachments.map((attachment: InventorySavedFile) => attachment.name);
        }

        let resolvedData = data;
        if (!partial) {
            this.assertRequired(data);
        } else {
            resolvedData = {
                company: data.company ?? current.company,
                trackingNo: data.trackingNo ?? current.trackingNo,
                goods: data.goods ?? current.goods,
                businessType: data.businessType ?? current.businessType,
                sentAt: data.sentAt ?? current.sentAt,
                senderAddress: data.senderAddress ?? current.senderAddress,
                receiverAddress: data.receiverAddress ?? current.receiverAddress,
                receiverName: data.receiverName ?? current.receiverName,
                image: data.image ?? current.image,
                images: data.images ?? current.images,
                relatedOrderNo: data.relatedOrderNo ?? current.relatedOrderNo,
                remark: data.remark ?? current.remark,
            };
            this.assertRequired(resolvedData);
        }

        if (Boolean(payload.needsSupplement) || current?.needsSupplement) {
            data.needsSupplement = this.hasPendingSupplement(resolvedData);
        }

        return data;
    }

    private hasPendingSupplement(data: Record<string, any>) {
        const isPendingText = (value: unknown) => {
            const text = toText(value);
            return !text || text === "待补录";
        };
        const requiredTextFields = [
            "company",
            "trackingNo",
            "goods",
            "businessType",
            "receiverAddress",
            "receiverName",
            "remark",
        ];

        if (requiredTextFields.some((field) => isPendingText(data[field]))) {
            return true;
        }
        if (data.businessType === "订单交付" && isPendingText(data.relatedOrderNo)) {
            return true;
        }
        if (!data.sentAt || !Array.isArray(data.images) || data.images.length === 0) {
            return true;
        }

        return false;
    }

    private assertRequired(data: Record<string, any>) {
        const requiredFields = [
            ["company", "快递公司"],
            ["trackingNo", "运单号"],
            ["goods", "托寄物"],
            ["businessType", "业务类型"],
            ["sentAt", "寄件时间"],
            ["receiverAddress", "收货地"],
            ["receiverName", "收件人"],
        ];

        requiredFields.forEach(([field, label]) => {
            if (!data[field]) {
                throwInventoryError(400, CODE.INVALID_PARAMS, `${label}不能为空`);
            }
        });

    }

    private async generateWaybillNo(sentAt: Date) {
        const year = sentAt.getFullYear();
        const month = String(sentAt.getMonth() + 1).padStart(2, "0");
        const day = String(sentAt.getDate()).padStart(2, "0");
        const dateKey = `${year}${month}${day}`;
        const serial = await useInventoryCounterModel().nextNumber(`inventory:waybill:${dateKey}`);

        return `WL${dateKey}${String(serial).padStart(3, "0")}`;
    }

    private async assertUniqueWaybillNo(waybillNo: string, excludeId?: string) {
        const filter: Record<string, any> = { waybillNo };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }

        const exists = await this.waybill.findOne(filter).select("_id").lean();
        if (exists) {
            throwInventoryError(409, CODE.INVENTORY_DUPLICATE_CODE, "物流单号已存在");
        }
    }
}

export const useInventoryWaybillModel = () => new InventoryWaybillModel(InventoryWaybill);
export { InventoryWaybill };
