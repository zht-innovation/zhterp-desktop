import mongoose from "mongoose";
import { CODE } from "~~/server/utils/code";
import {
    escapeRegExp,
    getPageParams,
    InventoryHttpError,
    isValidObjectId,
    throwInventoryError,
    toBoolean,
    toNumber,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";
import { InventoryUnit } from "~~/server/models/inventoryBase.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryBomHistory } from "~~/server/models/inventoryBomHistory.model";
import {
    buildBomHistoryChanges,
    createBomSnapshot,
    getBomLineId,
    getBomRevision,
    normalizeBomForRead,
} from "~~/server/utils/inventoryBomHistory";

const { Schema } = mongoose;

export interface InventoryBomItemReq {
    lineId?: string;
    productId: string;
    quantity: number;
    unitId?: string | null;
    lossRate?: number;
    remark?: string;
    sort?: number;
}

export interface InventoryBomReq {
    expectedRevision?: number;
    code?: string;
    name: string;
    productId: string;
    version?: string;
    process?: string;
    isEnabled?: boolean;
    remark?: string;
    operator?: string;
    items: InventoryBomItemReq[];
    reserved1?: string;
    reserved2?: string;
    reserved3?: string;
    reserved4?: string;
    reserved5?: string;
}

const bomItemSchema = new Schema(
    {
        lineId: { type: String },
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
        categoryId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryCategory",
            default: null,
        },
        categoryName: {
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
        lossRate: {
            type: Number,
            default: 0,
        },
        remark: {
            type: String,
            default: "",
        },
        sort: {
            type: Number,
            default: 0,
        },
    },
    {
        _id: false,
        versionKey: false,
    }
);

const inventoryBomSchema = new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        productId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryProduct",
            required: true,
            index: true,
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
        version: {
            type: String,
            default: "V1.0",
        },
        revision: { type: Number, min: 1 },
        // 采购拆分使用的事务写锁版本，不作为 BOM 业务版本对外展示。
        purchaseBomRevision: { type: Number, select: false },
        process: {
            type: String,
            default: "",
        },
        isEnabled: {
            type: Boolean,
            default: true,
            index: true,
        },
        remark: {
            type: String,
            default: "",
        },
        operator: {
            type: String,
            default: "",
        },
        items: {
            type: [bomItemSchema],
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
    }
);

inventoryBomSchema.index({ _isDeleted: 1, productId: 1, isEnabled: 1 });

const InventoryBom =
    mongoose.models.InventoryBom || mongoose.model("InventoryBom", inventoryBomSchema);

type BomListOptions = {
    keyword?: string;
    productId?: string;
    isEnabled?: unknown;
    codes?: string | string[];
    includeDeleted?: boolean;
    page?: number;
    limit?: number;
};

const textFields = [
    "version",
    "process",
    "remark",
    "operator",
    "reserved1",
    "reserved2",
    "reserved3",
    "reserved4",
    "reserved5",
];

class InventoryBomModel {
    bom: typeof InventoryBom;

    constructor(bom: typeof InventoryBom) {
        this.bom = bom;
    }

    async retrieve(options: BomListOptions = {}) {
        const pageOptions = getPageParams({ page: options.page, limit: options.limit });
        const filter = this.buildFilter(options);

        const [list, total] = await Promise.all([
            this.bom
                .find(filter)
                .sort({ code: 1, createTime: 1 })
                .skip(pageOptions.skip)
                .limit(pageOptions.limit)
                .lean(),
            this.bom.countDocuments(filter),
        ]);

        return {
            list: list.map((bom: any) => normalizeBomForRead(bom)),
            pagination: {
                page: pageOptions.page,
                limit: pageOptions.limit,
                total,
                hasMore: pageOptions.skip + list.length < total,
            },
        };
    }

    async detail(id: string, options: { includeStructure?: boolean } = {}) {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const bom = await this.bom.findOne({ _id: id, _isDeleted: { $ne: true } }).lean();
        if (!bom) return null;

        const detail = normalizeBomForRead(bom);
        if (!options.includeStructure) return detail;

        return {
            ...detail,
            structure: await this.getProductStructure(bom.productId?.toString?.() || ""),
        };
    }

    async history(id: string, options: { page?: number; limit?: number } = {}) {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }
        const pageOptions = getPageParams(options);
        const filter = { bomId: toObjectId(id) };
        const [list, total] = await Promise.all([
            InventoryBomHistory.find(filter).sort({ revision: -1 })
                .skip(pageOptions.skip).limit(pageOptions.limit).lean(),
            InventoryBomHistory.countDocuments(filter),
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

    async create(payload: InventoryBomReq, actor = "") {
        await InventoryBomHistory.init();
        const session = await this.bom.db.startSession();
        try {
            return await session.withTransaction(async () => {
                const data = await this.normalizePayload(payload, false, undefined, session);
                if (!data.name) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "BOM 名称不能为空");
                }
                if (!data.productId) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "主产品不能为空");
                }
                if (!data.code) {
                    data.code = await useInventoryCounterModel().nextCode("inventory:bom", "BOM", 6, "-", session);
                }
                await this.assertUniqueCode(data.code, undefined, session);
                if (data.isEnabled) {
                    await this.assertUniqueEnabledProduct(data.productId, undefined, session);
                }
                const [created] = await this.bom.create([{
                    ...data,
                    revision: 1,
                    operator: data.operator || actor,
                    createdBy: actor,
                    updatedBy: actor,
                }], { session, ordered: true });
                await InventoryBomHistory.create([{
                    bomId: created._id,
                    revision: 1,
                    action: "create",
                    operator: actor,
                    createdAt: created.createTime || new Date(),
                    snapshot: createBomSnapshot(created),
                    changes: { fields: [], items: [] },
                }], { session, ordered: true });
                return created;
            });
        } finally {
            await session.endSession();
        }
    }

    async update(id: string, payload: Partial<InventoryBomReq>, actor = "") {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        if (payload.expectedRevision !== undefined
            && (!Number.isInteger(payload.expectedRevision) || payload.expectedRevision < 1)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "expectedRevision 必须是正整数");
        }

        await InventoryBomHistory.init();
        const session = await this.bom.db.startSession();
        try {
            return await session.withTransaction(async () => {
                const current = await this.bom.findOne({ _id: id, _isDeleted: { $ne: true } }).session(session).lean();
                if (!current) {
                    throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
                }
                const revision = getBomRevision(current);
                if (payload.expectedRevision !== undefined && payload.expectedRevision !== revision) {
                    throw new InventoryHttpError(409, 409, "BOM 已被其他人员修改，请重新打开后编辑");
                }
                const previous = normalizeBomForRead(current);
                const data = await this.normalizePayload(payload, true, previous, session);
                if (Object.keys(data).length === 0) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "更新时至少传一个字段");
                }
                if (data.name !== undefined && !data.name) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "BOM 名称不能为空");
                }
                if (data.code !== undefined) {
                    if (!data.code) {
                        throwInventoryError(400, CODE.INVALID_PARAMS, "BOM 编码不能为空");
                    }
                    await this.assertUniqueCode(data.code, id, session);
                }
                const effectiveProductId = data.productId || current.productId;
                const effectiveEnabled = data.isEnabled !== undefined ? data.isEnabled : Boolean(current.isEnabled);
                if (effectiveEnabled) {
                    await this.assertUniqueEnabledProduct(effectiveProductId, id, session);
                }

                // 自动填写的经办人和审计字段不参与是否有实际修改的判断。
                if (!data.operator) delete data.operator;
                const changes = buildBomHistoryChanges(previous, { ...previous, ...data });
                if (!changes.fields.length && !changes.items.length) return previous;

                const updated = await this.bom.findOneAndUpdate(
                    {
                        _id: id,
                        _isDeleted: { $ne: true },
                        revision: current.revision === undefined ? { $exists: false } : current.revision,
                    },
                    { $set: {
                        ...data,
                        items: data.items || previous.items,
                        revision: revision + 1,
                        updatedBy: actor,
                        operator: data.operator || actor,
                    } },
                    { new: true, runValidators: true, session },
                );
                if (!updated) {
                    throw new InventoryHttpError(409, 409, "BOM 已被其他人员修改，请重新打开后编辑");
                }

                const records: Record<string, any>[] = [];
                const hasBaseline = await InventoryBomHistory.exists({ bomId: current._id, revision }).session(session);
                if (!hasBaseline) {
                    records.push({
                        bomId: current._id,
                        revision,
                        action: "baseline",
                        operator: actor,
                        createdAt: new Date(),
                        snapshot: createBomSnapshot(previous),
                        changes: { fields: [], items: [] },
                    });
                }
                records.push({
                    bomId: current._id,
                    revision: revision + 1,
                    action: "update",
                    operator: actor,
                    createdAt: updated.updateTime || new Date(),
                    snapshot: createBomSnapshot(updated),
                    changes,
                });
                await InventoryBomHistory.insertMany(records, { session, ordered: true });
                return updated;
            });
        } finally {
            await session.endSession();
        }
    }

    async delete(ids: string[], actor = "") {
        if (!ids.length || ids.some((id) => !isValidObjectId(id))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "ids 格式错误");
        }

        return await this.bom.updateMany(
            { _id: { $in: ids }, _isDeleted: { $ne: true } },
            {
                $set: {
                    _isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: actor,
                    updatedBy: actor,
                },
            }
        );
    }

    async getProductStructure(productId: string, depth = 1, visited = new Set<string>(), session?: mongoose.ClientSession) {
        if (!isValidObjectId(productId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
        }

        if (visited.has(productId)) {
            return {
                productId,
                level: depth,
                circular: true,
                children: [],
            };
        }

        visited.add(productId);
        const productQuery = InventoryProduct.findOne({ _id: productId, _isDeleted: { $ne: true } }).lean();
        if (session) productQuery.session(session);
        const product = await productQuery as any;
        const bomQuery = this.bom
            .findOne({
                productId,
                isEnabled: true,
                _isDeleted: { $ne: true },
            })
            .lean();
        if (session) bomQuery.session(session);
        const bom = await bomQuery;

        const node: Record<string, any> = {
            level: depth,
            productId,
            productCode: product?.code || bom?.productCode || "",
            productName: product?.name || bom?.productName || "",
            model: product?.model || bom?.model || "",
            material: product?.material || "",
            image: product?.image || "",
            bomId: bom?._id || null,
            bomCode: bom?.code || "",
            bomName: bom?.name || "",
            quantity: depth === 1 ? 1 : undefined,
            unitName: product?.unitName || "",
            children: [],
        };

        if (!bom?.items?.length) {
            visited.delete(productId);
            return node;
        }

        const children: any[] = [];
        const sortedItems = bom.items
            .sort((a: any, b: any) => Number(a.sort || 0) - Number(b.sort || 0));
        for (const item of sortedItems) {
            const childId = item.productId?.toString?.() || "";
            const child = await this.getProductStructure(childId, depth + 1, visited, session);
            children.push({
                ...child,
                quantity: item.quantity,
                unitId: item.unitId,
                unitCode: item.unitCode,
                unitName: item.unitName,
                lossRate: item.lossRate,
                remark: item.remark,
                sort: item.sort,
            });
        }
        node.children = children;

        visited.delete(productId);
        return node;
    }

    private buildFilter(options: BomListOptions) {
        const filter: Record<string, any> = {};
        if (!options.includeDeleted) {
            filter._isDeleted = { $ne: true };
        }

        if (options.codes !== undefined) {
            const codes = Array.isArray(options.codes) ? options.codes : [options.codes];
            filter.code = { $in: [...new Set(codes.map(toText).filter(Boolean))] };
        }

        if (options.keyword) {
            const regex = new RegExp(escapeRegExp(options.keyword), "i");
            filter.$or = [
                { code: regex },
                { name: regex },
                { productCode: regex },
                { productName: regex },
                { model: regex },
                { version: regex },
            ];
        }
        if (options.productId) {
            if (!isValidObjectId(options.productId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
            }
            filter.productId = options.productId;
        }
        if (options.isEnabled !== undefined && options.isEnabled !== "") {
            filter.isEnabled = toBoolean(options.isEnabled, true);
        }

        return filter;
    }

    private async normalizePayload(
        payload: Record<string, any>,
        partial: boolean,
        current?: any,
        session?: mongoose.ClientSession,
    ) {
        const data: Record<string, any> = {};
        const hasOwn = (field: string) => Object.prototype.hasOwnProperty.call(payload, field);

        if (hasOwn("code")) {
            data.code = toText(payload.code).toUpperCase();
        }
        if (hasOwn("name") || !partial) {
            data.name = toText(payload.name);
        }

        for (const field of textFields) {
            if (hasOwn(field)) {
                data[field] = toText(payload[field]);
            } else if (!partial) {
                data[field] = field === "version" ? "V1.0" : "";
            }
        }

        if (hasOwn("isEnabled")) {
            data.isEnabled = toBoolean(payload.isEnabled, true);
        } else if (!partial) {
            data.isEnabled = true;
        }

        if (hasOwn("productId") || !partial) {
            const productSnapshot = await this.resolveProductSnapshot(
                toText(payload.productId ?? current?.productId), current, session,
            );
            Object.assign(data, productSnapshot);
        }

        if (hasOwn("items") || !partial) {
            if (!Array.isArray(payload.items)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "items 必须是数组");
            }
            data.items = await this.normalizeItems(payload.items, data.productId || current?.productId, current?.items, session);
        } else if (hasOwn("productId") && current?.items) {
            data.items = await this.normalizeItems(current.items, data.productId || current.productId, current.items, session);
        }

        return data;
    }

    private async resolveProductSnapshot(productId: string, current?: any, session?: mongoose.ClientSession) {
        if (!productId || !isValidObjectId(productId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "productId 必填且格式正确");
        }

        const existingProduct = await this.resolveProduct(productId, "主产品", session);
        const product = current && String(current.productId) === productId
            ? { code: current.productCode, name: current.productName, model: current.model }
            : existingProduct;
        return {
            productId: toObjectId(productId),
            productCode: product.code || "",
            productName: product.name || "",
            model: product.model || "",
        };
    }

    private async normalizeItems(
        items: InventoryBomItemReq[],
        mainProductId: string | mongoose.Types.ObjectId,
        currentItems: any[] = [],
        session?: mongoose.ClientSession,
    ) {
        const mainId = mainProductId?.toString?.() || "";
        const seenProducts = new Set<string>();
        const seenLines = new Set<string>();
        const currentByLine = new Map(currentItems.map((item) => [getBomLineId(item), item]));
        const currentByProduct = new Map(currentItems.map((item) => [String(item.productId), item]));
        const normalized: any[] = [];

        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            const productId = toText(item?.productId);
            if (!productId || !isValidObjectId(productId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, `第 ${index + 1} 行子项产品格式错误`);
            }
            if (productId === mainId) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "主产品不能作为自己的子项");
            }
            if (seenProducts.has(productId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "BOM 子项产品不能重复");
            }
            seenProducts.add(productId);

            const suppliedLineId = toText(item.lineId);
            const previous = suppliedLineId ? currentByLine.get(suppliedLineId) : currentByProduct.get(productId);
            if (suppliedLineId && !previous) {
                if (!/^[a-fA-F0-9]{24}$/.test(suppliedLineId) || currentByProduct.has(productId)) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, `第 ${index + 1} 行明细标识无效，请重新打开后编辑`);
                }
            }
            const lineId = suppliedLineId || (previous ? getBomLineId(previous) : new mongoose.Types.ObjectId().toString());
            if (seenLines.has(lineId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "BOM 明细标识不能重复");
            }
            seenLines.add(lineId);

            const hasOwn = (field: string) => Object.prototype.hasOwnProperty.call(item, field);
            const quantity = toNumber(hasOwn("quantity") ? item.quantity : previous?.quantity, 0);
            if (quantity <= 0) {
                throwInventoryError(400, CODE.INVALID_PARAMS, `第 ${index + 1} 行数量必须大于 0`);
            }

            const sameProduct = previous && String(previous.productId) === productId;
            const existingProduct = await this.resolveProduct(productId, "子项产品", session);
            const product = sameProduct
                ? {
                    code: previous.productCode,
                    name: previous.productName,
                    model: previous.model,
                    categoryId: previous.categoryId,
                    categoryName: previous.categoryName,
                    unitId: previous.unitId,
                }
                : existingProduct;
            const keepUnit = sameProduct && (!hasOwn("unitId") || toText(item.unitId) === toText(previous.unitId));
            const unitSnapshot = keepUnit
                ? { unitId: previous.unitId || null, unitCode: previous.unitCode || "", unitName: previous.unitName || "" }
                : await this.resolveItemUnitSnapshot(item.unitId, product, session);

            normalized.push({
                lineId,
                productId: toObjectId(productId),
                productCode: product.code || "",
                productName: product.name || "",
                model: product.model || "",
                categoryId: product.categoryId || null,
                categoryName: product.categoryName || "",
                quantity,
                ...unitSnapshot,
                lossRate: hasOwn("lossRate") ? Math.max(0, toNumber(item.lossRate, 0)) : Number(previous?.lossRate || 0),
                remark: hasOwn("remark") ? toText(item.remark) : previous?.remark || "",
                sort: hasOwn("sort") && Number.isFinite(Number(item.sort)) ? Number(item.sort) : previous?.sort ?? index,
            });
        }
        return normalized;
    }

    private async resolveProduct(productId: string, label: string, session?: mongoose.ClientSession) {
        const query = InventoryProduct.findOne({ _id: productId, _isDeleted: { $ne: true } }).lean();
        if (session) query.session(session);
        const product = await query;
        if (!product) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, `${label}不存在`);
        }
        return product;
    }

    private async resolveItemUnitSnapshot(unitId: string | null | undefined, product: any, session?: mongoose.ClientSession) {
        const normalizedUnitId = toText(unitId || product.unitId);
        if (!normalizedUnitId) {
            return {
                unitId: null,
                unitCode: "",
                unitName: "",
            };
        }
        if (!isValidObjectId(normalizedUnitId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "子项单位格式错误");
        }

        const unitQuery = InventoryUnit
            .findOne({ _id: normalizedUnitId, _isDeleted: { $ne: true } })
            .lean();
        if (session) unitQuery.session(session);
        const unit = await unitQuery;
        if (!unit) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "子项单位不存在");
        }

        return {
            unitId: toObjectId(normalizedUnitId),
            unitCode: unit.code || "",
            unitName: unit.name || "",
        };
    }

    private async assertUniqueCode(code: string, excludeId?: string, session?: mongoose.ClientSession) {
        const filter: Record<string, any> = { code };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }

        const query = this.bom.findOne(filter).select("_id").lean();
        if (session) query.session(session);
        const exists = await query;
        if (exists) {
            throwInventoryError(409, CODE.INVENTORY_DUPLICATE_CODE, "BOM 编码已存在");
        }
    }

    private async assertUniqueEnabledProduct(
        productId: string | mongoose.Types.ObjectId,
        excludeId?: string,
        session?: mongoose.ClientSession,
    ) {
        const filter: Record<string, any> = {
            productId,
            isEnabled: true,
            _isDeleted: { $ne: true },
        };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }

        const query = this.bom.findOne(filter).select("_id").lean();
        if (session) query.session(session);
        const exists = await query;
        if (exists) {
            throwInventoryError(409, CODE.INVENTORY_DUPLICATE_CODE, "该主产品已存在启用中的 BOM");
        }
    }
}

export const useInventoryBomModel = () => new InventoryBomModel(InventoryBom);
export { InventoryBom };
