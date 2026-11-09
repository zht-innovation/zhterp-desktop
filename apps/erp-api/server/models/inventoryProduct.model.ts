import mongoose from "mongoose";
import {
    INVENTORY_PRODUCT_SOURCE,
    INVENTORY_STOCK_WARNING_STATUS,
} from "~~/shared/enums";
import { CODE } from "~~/server/utils/code";
import {
    escapeRegExp,
    getPageParams,
    isValidObjectId,
    throwInventoryError,
    toBoolean,
    toNumber,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";
import { normalizeStockQuantity } from "~~/server/services/inventoryStockMath";
import {
    ensurePurchaseAverageCostReady,
    resetProductAverageCost,
} from "~~/server/services/purchaseAverageCost";
import {
    assertInventoryLocationLeaf,
    getInventoryLocationPathName,
    InventoryCategory,
    InventoryLocation,
    InventoryUnit,
    InventoryWarehouse,
} from "~~/server/models/inventoryBase.model";

const { Schema } = mongoose;

export interface InventoryProductReq {
    code?: string;
    name: string;
    categoryId?: string | null;
    image?: string;
    unitId?: string | null;
    material?: string;
    source?: string;
    standardPrice?: number;
    averagePrice?: number;
    model?: string;
    modelCode?: string;
    kitQuantity?: number;
    stockUpperLimit?: number;
    stockLowerLimit?: number;
    warehouseId?: string | null;
    locationId?: string | null;
    introduction?: string;
    barcode?: string;
    snPrefixes?: string[] | string;
    isSaleable?: boolean;
    operator?: string;
    remark?: string;
    reserved1?: string;
    reserved2?: string;
    reserved3?: string;
    reserved4?: string;
    reserved5?: string;
}

const inventoryProductSchema = new Schema(
    {
        code: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        categoryId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryCategory",
            default: null,
            index: true,
        },
        categoryCode: {
            type: String,
            default: "",
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
        unitId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryUnit",
            default: null,
            index: true,
        },
        unitCode: {
            type: String,
            default: "",
        },
        unitName: {
            type: String,
            default: "",
        },
        material: {
            type: String,
            default: "",
        },
        source: {
            type: String,
            enum: Object.values(INVENTORY_PRODUCT_SOURCE),
            default: INVENTORY_PRODUCT_SOURCE.PURCHASED,
        },
        standardPrice: {
            type: Number,
            default: 0,
        },
        averagePrice: {
            type: Number,
            default: 0,
        },
        model: {
            type: String,
            default: "",
            trim: true,
        },
        modelCode: {
            type: String,
            default: "",
            trim: true,
        },
        kitQuantity: {
            type: Number,
            default: 1,
        },
        stockUpperLimit: {
            type: Number,
            default: 0,
        },
        stockLowerLimit: {
            type: Number,
            default: 0,
        },
        warehouseId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryWarehouse",
            default: null,
            index: true,
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
            index: true,
        },
        locationCode: {
            type: String,
            default: "",
        },
        locationName: {
            type: String,
            default: "",
        },
        introduction: {
            type: String,
            default: "",
        },
        barcode: {
            type: String,
            default: "",
        },
        snPrefixes: {
            type: [String],
            default: [],
        },
        snPrintState: {
            monthKey: {
                type: String,
                default: "",
            },
            lastSerial: {
                type: Number,
                default: 0,
            },
            updatedAt: {
                type: Date,
                default: null,
            },
            updatedBy: {
                type: String,
                default: "",
            },
        },
        isSaleable: {
            type: Boolean,
            default: true,
        },
        operator: {
            type: String,
            default: "",
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
    }
);

inventoryProductSchema.index({ _isDeleted: 1, categoryId: 1, updateTime: -1 });
inventoryProductSchema.index({ _isDeleted: 1, unitId: 1, updateTime: -1 });
inventoryProductSchema.index({ _isDeleted: 1, warehouseId: 1, locationId: 1 });
inventoryProductSchema.index({ modelCode: 1, _isDeleted: 1 });
inventoryProductSchema.index({ barcode: 1, _isDeleted: 1 });
inventoryProductSchema.index({ snPrefixes: 1, _isDeleted: 1 });
inventoryProductSchema.index(
    { code: 1 },
    { unique: true, partialFilterExpression: { _isDeleted: { $ne: true } } }
);
inventoryProductSchema.index(
    { model: 1 },
    { unique: true, partialFilterExpression: { _isDeleted: false, model: { $exists: true, $gt: "" } } }
);

const InventoryProduct =
    mongoose.models.InventoryProduct || mongoose.model("InventoryProduct", inventoryProductSchema);

type ProductListOptions = {
    ids?: string | string[];
    keyword?: string;
    categoryId?: string;
    source?: string;
    unitId?: string;
    warehouseId?: string;
    locationId?: string;
    isSaleable?: unknown;
    stockWarning?: string;
    includeDeleted?: boolean;
    includeStock?: boolean;
    page?: number;
    limit?: number;
};

const textFields = [
    "image",
    "model",
    "modelCode",
    "material",
    "introduction",
    "barcode",
    "operator",
    "remark",
    "reserved1",
    "reserved2",
    "reserved3",
    "reserved4",
    "reserved5",
];

class InventoryProductModel {
    product: typeof InventoryProduct;

    constructor(product: typeof InventoryProduct) {
        this.product = product;
    }

    async retrieve(options: ProductListOptions = {}) {
        const pageOptions = getPageParams({
            page: options.page,
            limit: options.limit,
        });
        const filter = await this.buildFilter(options);

        const [list, total] = await Promise.all([
            this.product
                .find(filter)
                .sort({ updateTime: -1, createTime: -1 })
                .skip(pageOptions.skip)
                .limit(pageOptions.limit)
                .lean(),
            this.product.countDocuments(filter),
        ]);

        const productList = options.includeStock
            ? await this.appendStockSummary(list)
            : list;

        return {
            list: productList.map((item: any) => this.appendWarningStatus(item)),
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

        const product = await this.product.findOne({ _id: id, _isDeleted: { $ne: true } }).lean();
        return product ? this.appendWarningStatus(product) : null;
    }

    async findById(id: string) {
        if (!isValidObjectId(id)) return null;
        return await this.product.findOne({ _id: id, _isDeleted: { $ne: true } }).lean();
    }

    async findByCodeOrName(text: string) {
        const value = toText(text);
        if (!value) return null;

        return await this.product
            .findOne({
                _isDeleted: { $ne: true },
                $or: [{ code: value.toUpperCase() }, { name: value }],
            })
            .lean();
    }

    async create(payload: InventoryProductReq, actor = "") {
        const data = await this.normalizePayload(payload, false);
        if (!data.model) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "型号不能为空");
        }

        if (!data.code) {
            data.code = await this.generateCode(data);
        }

        await this.assertUniqueCode(data.code);
        await this.assertUniqueModel(data.model);
        await this.assertUniqueModelCode(data.modelCode);
        await this.assertUniqueSnPrefixes(data.snPrefixes);

        return await this.product.create({
            ...data,
            barcode: data.barcode || data.code,
            operator: data.operator || actor,
            createdBy: actor,
            updatedBy: actor,
        });
    }

    async update(
        id: string,
        payload: Partial<InventoryProductReq>,
        actor = "",
        session?: mongoose.ClientSession,
    ): Promise<any> {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const hasAveragePrice = Object.prototype.hasOwnProperty.call(payload, "averagePrice");
        if (hasAveragePrice && !session) {
            await ensurePurchaseAverageCostReady();
            const currentSession = await this.product.db.startSession();
            try {
                return await currentSession.withTransaction(() => this.update(id, payload, actor, currentSession));
            } finally {
                await currentSession.endSession();
            }
        }

        const currentQuery = this.product.findOne({ _id: id, _isDeleted: { $ne: true } });
        if (session) currentQuery.session(session);
        const current = await currentQuery;
        if (!current) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
        }

        const data = await this.normalizePayload(payload, true, current);
        if (data.code !== undefined) {
            if (!data.code) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "产品编号不能为空");
            }
            await this.assertUniqueCode(data.code, id);
        }
        if (data.model !== undefined) {
            if (!data.model) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "型号不能为空");
            }
            await this.assertUniqueModel(data.model, id);
        }
        if (data.modelCode !== undefined) {
            await this.assertUniqueModelCode(data.modelCode, id);
        }
        if (data.snPrefixes !== undefined) {
            await this.assertUniqueSnPrefixes(data.snPrefixes, id);
        }

        if (Object.keys(data).length === 0) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "更新时至少传一个字段");
        }

        data.updatedBy = actor;
        if (!data.operator) {
            data.operator = actor;
        }

        const currentPosition = {
            warehouseId: toText(current.warehouseId),
            locationId: toText(current.locationId),
        };
        const nextPosition = {
            warehouseId: toText(data.warehouseId === undefined ? current.warehouseId : data.warehouseId),
            locationId: toText(data.locationId === undefined ? current.locationId : data.locationId),
        };
        const locationChanged = currentPosition.warehouseId !== nextPosition.warehouseId
            || currentPosition.locationId !== nextPosition.locationId;
        const currentFilter = {
            _id: id,
            _isDeleted: { $ne: true },
            warehouseId: current.warehouseId || null,
            locationId: current.locationId || null,
        };

        if (locationChanged && !session) {
            const currentSession = await this.product.db.startSession();
            try {
                return await currentSession.withTransaction(() => this.update(id, payload, actor, currentSession));
            } finally {
                await currentSession.endSession();
            }
        }

        if (hasAveragePrice) {
            const nextAveragePrice = data.averagePrice;
            delete data.averagePrice;
            if (nextAveragePrice !== Number(current.averagePrice ?? 0)) {
                await resetProductAverageCost(id, nextAveragePrice, actor, session!);
            }
        }

        const updated = await this.product.findOneAndUpdate(
            currentFilter,
            { $set: data },
            { new: true, runValidators: true, ...(session ? { session } : {}) },
        );
        if (!updated) {
            throwInventoryError(409, CODE.INVALID_PARAMS, "产品库位已发生变化或产品已删除，请刷新后重试");
        }
        if (locationChanged && session) {
            const { useInventoryStockModel } = await import("~~/server/models/inventoryStock.model");
            await useInventoryStockModel().updateProductLocation(
                id,
                currentPosition,
                nextPosition,
                actor,
                session,
            );
        }
        return updated;
    }

    async updateSnPrintState(
        id: string,
        payload: { monthKey?: string; lastSerial?: unknown },
        actor = "",
    ) {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const monthKey = toText(payload.monthKey);
        if (!/^\d{4}-\d{2}$/.test(monthKey)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "月份格式错误");
        }

        const nextLastSerial = Number(payload.lastSerial);
        if (!Number.isInteger(nextLastSerial) || nextLastSerial < 0) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "流水号必须是大于等于 0 的整数");
        }

        const current = await this.product
            .findOne({ _id: id, _isDeleted: { $ne: true } })
            .select("snPrintState")
            .lean() as any;
        if (!current) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
        }

        const currentState = current.snPrintState || {};
        const currentLastSerial = Number(currentState.lastSerial || 0);
        if (currentState.monthKey === monthKey && nextLastSerial <= currentLastSerial) {
            throwInventoryError(
                409,
                CODE.INVENTORY_DUPLICATE_CODE,
                `当月延顺号已打印至：${String(currentLastSerial).padStart(4, "0")}`,
            );
        }

        const snPrintState = {
            monthKey,
            lastSerial: nextLastSerial,
            updatedAt: new Date(),
            updatedBy: actor,
        };

        return await this.product.findByIdAndUpdate(
            id,
            { $set: { snPrintState, updatedBy: actor } },
            { new: true, runValidators: true },
        );
    }

    async delete(ids: string[], actor = "") {
        if (!ids.length || ids.some((id) => !isValidObjectId(id))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "ids 格式错误");
        }

        const { InventoryBom } = await import("~~/server/models/inventoryBom.model");
        const referenced = await InventoryBom
            .findOne({
                _isDeleted: { $ne: true },
                $or: [
                    { productId: { $in: ids } },
                    { "items.productId": { $in: ids } },
                ],
            })
            .select("_id")
            .lean();

        if (referenced) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "产品已被 BOM 引用，无法删除");
        }

        const now = new Date();
        const result = await this.product.updateMany(
            { _id: { $in: ids }, _isDeleted: { $ne: true } },
            {
                $set: {
                    _isDeleted: true,
                    deletedAt: now,
                    deletedBy: actor,
                    updatedBy: actor,
                },
            }
        );
        const { usePurchaseSupplierModel } = await import("~~/server/models/purchaseSupplier.model");
        await usePurchaseSupplierModel().deleteProductRelations(ids, actor);

        return result;
    }

    async assertExists(id: string, label = "产品") {
        const product = await this.findById(id);
        if (!product) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, `${label}不存在`);
        }
        return product;
    }

    private async normalizePayload(payload: Record<string, any>, partial: boolean, current?: any) {
        const data: Record<string, any> = {};
        const hasOwn = (field: string) => Object.prototype.hasOwnProperty.call(payload, field);
        const allowedSources = Object.values(INVENTORY_PRODUCT_SOURCE);

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
                data[field] = "";
            }
        }

        if (hasOwn("snPrefixes")) {
            data.snPrefixes = this.normalizeSnPrefixes(payload.snPrefixes);
        } else if (!partial) {
            data.snPrefixes = [];
        }

        if (hasOwn("model") || !partial) {
            data.name = data.model;
        }

        if (hasOwn("source")) {
            const source = toText(payload.source);
            if (!source || !allowedSources.includes(source as INVENTORY_PRODUCT_SOURCE)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "产品来源不合法");
            }
            data.source = source;
        } else if (!partial) {
            data.source = INVENTORY_PRODUCT_SOURCE.PURCHASED;
        }

        for (const field of ["standardPrice", "stockUpperLimit", "stockLowerLimit"]) {
            if (hasOwn(field)) {
                data[field] = toNumber(payload[field], 0);
            } else if (!partial) {
                data[field] = 0;
            }
        }
        if (hasOwn("averagePrice")) {
            const averagePrice = Number(payload.averagePrice ?? 0);
            if (!Number.isFinite(averagePrice) || averagePrice < 0 || averagePrice > Number.MAX_SAFE_INTEGER) {
                throwInventoryError(400, CODE.INVALID_PARAMS, `平均价必须是0至${Number.MAX_SAFE_INTEGER}范围内的有效数字`);
            }
            data.averagePrice = averagePrice;
        } else if (!partial) {
            data.averagePrice = 0;
        }

        if (hasOwn("kitQuantity")) {
            data.kitQuantity = Math.max(0, toNumber(payload.kitQuantity, 1));
        } else if (!partial) {
            data.kitQuantity = 1;
        }

        if (hasOwn("isSaleable")) {
            data.isSaleable = toBoolean(payload.isSaleable, true);
        } else if (!partial) {
            data.isSaleable = true;
        }

        if (hasOwn("categoryId") || !partial) {
            const categorySnapshot = await this.resolveCategorySnapshot(
                toText(payload.categoryId ?? current?.categoryId)
            );
            Object.assign(data, categorySnapshot);
        }

        if (hasOwn("unitId") || !partial) {
            const unitSnapshot = await this.resolveUnitSnapshot(toText(payload.unitId ?? current?.unitId));
            Object.assign(data, unitSnapshot);
        }

        if (hasOwn("warehouseId") || !partial) {
            const warehouseSnapshot = await this.resolveWarehouseSnapshot(
                toText(payload.warehouseId ?? current?.warehouseId)
            );
            Object.assign(data, warehouseSnapshot);
        }

        if (hasOwn("locationId") || hasOwn("warehouseId") || !partial) {
            const locationSnapshot = await this.resolveLocationSnapshot(
                toText(payload.locationId ?? current?.locationId),
                data.warehouseId || current?.warehouseId
            );
            Object.assign(data, locationSnapshot);
        }

        if (data.modelCode) {
            if (data.modelCode.includes("-")) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "型号编码不能包含 -");
            }
            data.modelCode = data.modelCode.toUpperCase();
        }

        if (data.stockUpperLimit > 0 && data.stockLowerLimit > data.stockUpperLimit) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "库存下限不能大于库存上限");
        }

        return data;
    }

    private async resolveCategorySnapshot(categoryId: string) {
        if (!categoryId) {
            return {
                categoryId: null,
                categoryCode: "",
                categoryName: "",
                categoryPath: "",
            };
        }
        if (!isValidObjectId(categoryId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "categoryId 格式错误");
        }

        const category = await InventoryCategory
            .findOne({ _id: categoryId, _isDeleted: { $ne: true } })
            .lean();
        if (!category) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "分类不存在");
        }

        const pathNodes = await this.getCategoryPath(category);

        return {
            categoryId: toObjectId(categoryId),
            categoryCode: category.code || "",
            categoryName: category.name || "",
            categoryPath: pathNodes.map((item: any) => item.name).filter(Boolean).join("/"),
        };
    }

    private async resolveUnitSnapshot(unitId: string) {
        if (!unitId) {
            return {
                unitId: null,
                unitCode: "",
                unitName: "",
            };
        }
        if (!isValidObjectId(unitId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "unitId 格式错误");
        }

        const unit = await InventoryUnit.findOne({ _id: unitId, _isDeleted: { $ne: true } }).lean();
        if (!unit) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "单位不存在");
        }

        return {
            unitId: toObjectId(unitId),
            unitCode: unit.code || "",
            unitName: unit.name || "",
        };
    }

    private async resolveWarehouseSnapshot(warehouseId: string) {
        if (!warehouseId) {
            return {
                warehouseId: null,
                warehouseCode: "",
                warehouseName: "",
            };
        }
        if (!isValidObjectId(warehouseId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "warehouseId 格式错误");
        }

        const warehouse = await InventoryWarehouse
            .findOne({ _id: warehouseId, _isDeleted: { $ne: true } })
            .lean();
        if (!warehouse) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "仓库不存在");
        }

        return {
            warehouseId: toObjectId(warehouseId),
            warehouseCode: warehouse.code || "",
            warehouseName: warehouse.name || "",
        };
    }

    private async resolveLocationSnapshot(locationId: string, warehouseId?: string | mongoose.Types.ObjectId | null) {
        if (!locationId) {
            return {
                locationId: null,
                locationCode: "",
                locationName: "",
            };
        }
        if (!isValidObjectId(locationId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "locationId 格式错误");
        }

        const location = await InventoryLocation
            .findOne({ _id: locationId, _isDeleted: { $ne: true } })
            .lean();
        if (!location) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "仓位不存在");
        }

        const normalizedWarehouseId = warehouseId?.toString?.() || "";
        if (normalizedWarehouseId && location.warehouseId?.toString?.() !== normalizedWarehouseId) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "仓位不属于所选仓库");
        }

        await assertInventoryLocationLeaf(location._id);
        const locationName = await getInventoryLocationPathName(location);

        return {
            warehouseId: location.warehouseId,
            warehouseCode: location.warehouseCode || "",
            warehouseName: location.warehouseName || "",
            locationId: toObjectId(locationId),
            locationCode: location.code || "",
            locationName: locationName || location.name || "",
        };
    }

    private async getCategoryPath(category: any) {
        const nodes = [category];
        let cursor = category.parentId?.toString?.() || "";
        const seen = new Set<string>();

        while (cursor && !seen.has(cursor)) {
            seen.add(cursor);
            const parent = await InventoryCategory.findById(cursor).lean();
            if (!parent) break;
            nodes.unshift(parent);
            cursor = parent.parentId?.toString?.() || "";
        }

        return nodes;
    }

    private normalizeSnPrefixes(value: unknown) {
        const rawValues = Array.isArray(value)
            ? value
            : (() => {
                const text = toText(value);
                if (!text) return [];

                try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) {
                        return parsed;
                    }
                } catch {}

                return text.split(/[，,\s]+/);
            })();
        const prefixes = rawValues
            .map((item) => toText(item).toUpperCase().replace(/-/g, ""))
            .filter(Boolean);
        const uniquePrefixes = [...new Set(prefixes)];

        if (uniquePrefixes.length !== prefixes.length) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "SN前缀参数不能重复");
        }

        const invalidPrefix = uniquePrefixes.find((prefix) => !/^[A-Z0-9]+$/.test(prefix));
        if (invalidPrefix) {
            throwInventoryError(400, CODE.INVALID_PARAMS, `SN前缀参数只能包含字母和数字：${invalidPrefix}`);
        }

        return uniquePrefixes;
    }

    private async assertUniqueSnPrefixes(prefixes?: string[], excludeId?: string) {
        if (!prefixes?.length) return;

        const filter: Record<string, any> = {
            snPrefixes: { $in: prefixes },
            _isDeleted: { $ne: true },
        };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }

        const existing = await this.product.findOne(filter).select("snPrefixes").lean();
        const duplicatedPrefix = existing?.snPrefixes?.find((prefix: string) => prefixes.includes(prefix));
        if (duplicatedPrefix) {
            throwInventoryError(409, CODE.INVENTORY_DUPLICATE_CODE, `SN前缀已被其他产品使用：${duplicatedPrefix}`);
        }
    }

    private async generateCode(data: Record<string, any>) {
        let prefix = "PROD";
        const categoryId = data.categoryId?.toString?.() || "";

        if (categoryId) {
            const category = await InventoryCategory.findById(categoryId).lean();
            if (category) {
                const pathNodes = await this.getCategoryPath(category);
                const codeParts = pathNodes
                    .slice(0, 2)
                    .map((item: any) => toText(item.code).toUpperCase())
                    .filter(Boolean);
                prefix = codeParts.length ? codeParts.join("") : toText(category.code).toUpperCase();
            }
        }

        if (data.modelCode) {
            return `${prefix}${data.modelCode}`;
        }

        const serial = await useInventoryCounterModel().nextNumber(`inventory:product:${prefix}`);
        return `${prefix}${String(serial).padStart(4, "0")}`;
    }

    private async assertUniqueCode(code: string, excludeId?: string) {
        const filter: Record<string, any> = { code, _isDeleted: { $ne: true } };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }

        const exists = await this.product.findOne(filter).select("_id").lean();
        if (exists) {
            throwInventoryError(409, CODE.INVENTORY_DUPLICATE_CODE, "产品编号已存在");
        }
    }

    private async assertUniqueModel(model: string, excludeId?: string) {
        const normalizedModel = toText(model);
        if (!normalizedModel) return;

        const filter: Record<string, any> = { model: normalizedModel, _isDeleted: { $ne: true } };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }

        const exists = await this.product.findOne(filter).select("_id").lean();
        if (exists) {
            throwInventoryError(409, CODE.INVENTORY_DUPLICATE_CODE, "产品型号已存在");
        }
    }

    private async assertUniqueModelCode(modelCode?: string, excludeId?: string) {
        if (!modelCode) return;

        const filter: Record<string, any> = {
            modelCode,
            _isDeleted: { $ne: true },
        };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }

        const exists = await this.product.findOne(filter).select("_id").lean();
        if (exists) {
            throwInventoryError(409, CODE.INVENTORY_DUPLICATE_CODE, "型号编码已存在");
        }
    }

    private async buildFilter(options: ProductListOptions) {
        const filter: Record<string, any> = {};
        if (!options.includeDeleted) {
            filter._isDeleted = { $ne: true };
        }

        if (options.ids) {
            const ids = (Array.isArray(options.ids) ? options.ids : options.ids.split(","))
                .map((id) => toText(id))
                .filter(isValidObjectId);
            if (!ids.length) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "ids 格式错误");
            }
            filter._id = { $in: ids.map((id) => toObjectId(id)) };
        }

        if (options.keyword) {
            const regex = new RegExp(escapeRegExp(options.keyword), "i");
            const hyphenlessKeyword = options.keyword.replace(/-/g, "");
            const skuRegex = hyphenlessKeyword
                ? new RegExp(
                    hyphenlessKeyword.split("").map((char) => escapeRegExp(char)).join("-?"),
                    "i",
                )
                : null;
            filter.$or = [
                { code: regex },
                ...(skuRegex ? [{ code: skuRegex }] : []),
                { name: regex },
                { model: regex },
                { modelCode: regex },
                ...(skuRegex ? [{ modelCode: skuRegex }] : []),
                { barcode: regex },
                ...(skuRegex ? [{ barcode: skuRegex }] : []),
                { snPrefixes: regex },
                ...(skuRegex ? [{ snPrefixes: skuRegex }] : []),
                { source: regex },
                { categoryName: regex },
                { unitName: regex },
                { material: regex },
                { introduction: regex },
            ];
        }

        if (options.categoryId) {
            if (!isValidObjectId(options.categoryId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "categoryId 格式错误");
            }
            const categoryIds = await this.getDescendantCategoryIds(options.categoryId);
            filter.categoryId = { $in: categoryIds };
        }
        if (options.source) filter.source = options.source;
        if (options.unitId) {
            if (!isValidObjectId(options.unitId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "unitId 格式错误");
            }
            filter.unitId = options.unitId;
        }
        if (options.warehouseId) {
            if (!isValidObjectId(options.warehouseId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "warehouseId 格式错误");
            }
            filter.warehouseId = options.warehouseId;
        }
        if (options.locationId) {
            if (!isValidObjectId(options.locationId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "locationId 格式错误");
            }
            filter.locationId = options.locationId;
        }
        if (options.isSaleable !== undefined && options.isSaleable !== "") {
            filter.isSaleable = toBoolean(options.isSaleable, true);
        }

        if (options.stockWarning) {
            if (options.stockWarning === INVENTORY_STOCK_WARNING_STATUS.LOW) {
                filter.stockLowerLimit = { $gt: 0 };
            }
            if (options.stockWarning === INVENTORY_STOCK_WARNING_STATUS.HIGH) {
                filter.stockUpperLimit = { $gt: 0 };
            }
        }

        return filter;
    }

    private async getDescendantCategoryIds(categoryId: string) {
        const rows = await InventoryCategory
            .find({ _isDeleted: { $ne: true } })
            .select("_id parentId")
            .lean();
        const result = new Set<string>([categoryId]);
        let changed = true;

        while (changed) {
            changed = false;
            rows.forEach((row: any) => {
                const id = row._id?.toString?.() || "";
                const parentId = row.parentId?.toString?.() || "";
                if (parentId && result.has(parentId) && !result.has(id)) {
                    result.add(id);
                    changed = true;
                }
            });
        }

        return Array.from(result).map((id) => toObjectId(id));
    }

    private async appendStockSummary(list: any[]) {
        if (!list.length) {
            return list;
        }

        const productIds = list
            .map((item) => item._id)
            .filter(Boolean);

        if (!productIds.length) {
            return list;
        }

        const { InventoryStock } = await import("~~/server/models/inventoryStock.model");
        const stockRows = await InventoryStock
            .find({
                _isDeleted: { $ne: true },
                productId: { $in: productIds },
            })
            .select("productId warehouseId quantity lockedQuantity")
            .lean();
        const warehouseIds = [
            ...new Set(
                (stockRows as any[])
                    .map((row) => row.warehouseId?.toString?.() || "")
                    .filter(Boolean),
            ),
        ];
        const warehouses = warehouseIds.length
            ? await InventoryWarehouse
                .find({ _id: { $in: warehouseIds }, _isDeleted: { $ne: true } })
                .select("_id includeInAvailable")
                .lean()
            : [];
        const warehouseAvailability = new Map<string, boolean>(
            (warehouses as any[]).map((warehouse) => [
                warehouse._id?.toString?.() || "",
                warehouse.includeInAvailable !== false,
            ]),
        );
        const stockSummary = new Map<string, { totalQuantity: number; availableQuantity: number }>();

        (stockRows as any[]).forEach((row) => {
            const productId = row.productId?.toString?.() || "";
            if (!productId) {
                return;
            }

            const warehouseId = row.warehouseId?.toString?.() || "";
            const includeInAvailable = warehouseId
                ? warehouseAvailability.get(warehouseId) !== false
                : true;
            const quantity = normalizeStockQuantity(row.quantity || 0);
            const lockedQuantity = normalizeStockQuantity(row.lockedQuantity || 0);
            const summary = stockSummary.get(productId) || {
                totalQuantity: 0,
                availableQuantity: 0,
            };

            summary.totalQuantity = normalizeStockQuantity(summary.totalQuantity + quantity);
            summary.availableQuantity = includeInAvailable
                ? normalizeStockQuantity(summary.availableQuantity + Math.max(quantity - lockedQuantity, 0))
                : summary.availableQuantity;
            stockSummary.set(productId, summary);
        });

        return list.map((item: any) => {
            const productId = item._id?.toString?.() || "";
            const summary = stockSummary.get(productId) || {
                totalQuantity: 0,
                availableQuantity: 0,
            };

            return {
                ...item,
                totalQuantity: summary.totalQuantity,
                availableQuantity: summary.availableQuantity,
            };
        });
    }

    private appendWarningStatus(item: any) {
        const normalized = { ...item };
        const totalQuantity = Number(normalized.totalQuantity ?? normalized.stockTotal ?? 0);
        if (normalized.stockLowerLimit > 0 && totalQuantity < normalized.stockLowerLimit) {
            normalized.stockWarningStatus = INVENTORY_STOCK_WARNING_STATUS.LOW;
        } else if (normalized.stockUpperLimit > 0 && totalQuantity > normalized.stockUpperLimit) {
            normalized.stockWarningStatus = INVENTORY_STOCK_WARNING_STATUS.HIGH;
        } else {
            normalized.stockWarningStatus = INVENTORY_STOCK_WARNING_STATUS.NORMAL;
        }
        return normalized;
    }
}

export const useInventoryProductModel = () => new InventoryProductModel(InventoryProduct);
export { InventoryProduct };
