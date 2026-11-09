import mongoose from "mongoose";
import { CODE } from "~~/server/utils/code";
import type { InventoryBaseResource } from "~~/server/services/inventory";
import {
    isValidObjectId,
    throwInventoryError,
    toBoolean,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";

const { Schema } = mongoose;

const softDeleteFields = {
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
};

const auditFields = {
    createdBy: {
        type: String,
        default: "",
    },
    updatedBy: {
        type: String,
        default: "",
    },
};

const baseOptions = {
    versionKey: false,
    timestamps: {
        createdAt: "createTime",
        updatedAt: "updateTime",
    },
};

const unitSchema = new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        isEnabled: {
            type: Boolean,
            default: true,
        },
        remark: {
            type: String,
            default: "",
        },
        sort: {
            type: Number,
            default: 0,
        },
        ...auditFields,
        ...softDeleteFields,
    },
    baseOptions
);

const categorySchema = new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        parentId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryCategory",
            default: null,
            index: true,
        },
        level: {
            type: Number,
            default: 1,
        },
        remark: {
            type: String,
            default: "",
        },
        sort: {
            type: Number,
            default: 0,
        },
        ...auditFields,
        ...softDeleteFields,
    },
    baseOptions
);

const warehouseSchema = new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        manager: {
            type: String,
            default: "",
        },
        managerId: {
            type: Schema.Types.ObjectId,
            default: null,
        },
        includeInAvailable: {
            type: Boolean,
            default: true,
        },
        enableLocation: {
            type: Boolean,
            default: false,
        },
        remark: {
            type: String,
            default: "",
        },
        sort: {
            type: Number,
            default: 0,
        },
        ...auditFields,
        ...softDeleteFields,
    },
    baseOptions
);

const currencySchema = new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        currencyCode: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
        },
        remark: {
            type: String,
            default: "",
        },
        sort: {
            type: Number,
            default: 0,
        },
        ...auditFields,
        ...softDeleteFields,
    },
    baseOptions
);

const locationSchema = new Schema(
    {
        warehouseId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryWarehouse",
            required: true,
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
        parentId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryLocation",
            default: null,
            index: true,
        },
        level: {
            type: Number,
            default: 1,
        },
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        manager: {
            type: String,
            default: "",
        },
        managerId: {
            type: Schema.Types.ObjectId,
            default: null,
        },
        remark: {
            type: String,
            default: "",
        },
        sort: {
            type: Number,
            default: 0,
        },
        ...auditFields,
        ...softDeleteFields,
    },
    baseOptions
);

const bomCategorySchema = new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        parentId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryBomCategory",
            default: null,
            index: true,
        },
        level: {
            type: Number,
            default: 1,
        },
        remark: {
            type: String,
            default: "",
        },
        sort: {
            type: Number,
            default: 0,
        },
        ...auditFields,
        ...softDeleteFields,
    },
    baseOptions
);

const materialSchema = new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        isEnabled: {
            type: Boolean,
            default: true,
        },
        remark: {
            type: String,
            default: "",
        },
        sort: {
            type: Number,
            default: 0,
        },
        ...auditFields,
        ...softDeleteFields,
    },
    baseOptions
);

unitSchema.index({ _isDeleted: 1, updateTime: -1 });
categorySchema.index({ _isDeleted: 1, parentId: 1, sort: 1, updateTime: -1 });
warehouseSchema.index({ _isDeleted: 1, updateTime: -1 });
currencySchema.index({ _isDeleted: 1, updateTime: -1 });
locationSchema.index({ _isDeleted: 1, warehouseId: 1, parentId: 1, sort: 1, updateTime: -1 });
bomCategorySchema.index({ _isDeleted: 1, parentId: 1, sort: 1, updateTime: -1 });
materialSchema.index({ _isDeleted: 1, updateTime: -1 });

const InventoryUnit = mongoose.models.InventoryUnit || mongoose.model("InventoryUnit", unitSchema);
const InventoryCategory =
    mongoose.models.InventoryCategory || mongoose.model("InventoryCategory", categorySchema);
const InventoryWarehouse =
    mongoose.models.InventoryWarehouse || mongoose.model("InventoryWarehouse", warehouseSchema);
const InventoryCurrency =
    mongoose.models.InventoryCurrency || mongoose.model("InventoryCurrency", currencySchema);
const InventoryLocation =
    mongoose.models.InventoryLocation || mongoose.model("InventoryLocation", locationSchema);
const InventoryBomCategory =
    mongoose.models.InventoryBomCategory || mongoose.model("InventoryBomCategory", bomCategorySchema);
const InventoryMaterial =
    mongoose.models.InventoryMaterial || mongoose.model("InventoryMaterial", materialSchema);

export const InventoryBaseModels = {
    unit: InventoryUnit,
    category: InventoryCategory,
    warehouse: InventoryWarehouse,
    location: InventoryLocation,
    currency: InventoryCurrency,
    "bom-category": InventoryBomCategory,
    material: InventoryMaterial,
} as const;

type BasePayload = Record<string, any>;

const resourceCodeConfig: Record<InventoryBaseResource, { prefix: string; width: number }> = {
    unit: { prefix: "DW", width: 2 },
    category: { prefix: "FL", width: 2 },
    warehouse: { prefix: "CK", width: 2 },
    location: { prefix: "", width: 3 },
    currency: { prefix: "HB", width: 2 },
    "bom-category": { prefix: "BL", width: 2 },
    material: { prefix: "CZ", width: 3 },
};

const isTreeResource = (resource: InventoryBaseResource) => {
    return resource === "category" || resource === "bom-category" || resource === "location";
};

class InventoryBaseModel {
    resource: InventoryBaseResource;
    model: any;

    constructor(resource: InventoryBaseResource) {
        this.resource = resource;
        this.model = InventoryBaseModels[resource];
    }

    async retrieve(options: {
        keyword?: string;
        warehouseId?: string;
        includeDeleted?: boolean;
    } = {}) {
        const filter: Record<string, any> = {};
        if (!options.includeDeleted) {
            filter._isDeleted = { $ne: true };
        }

        if (options.keyword) {
            const regex = new RegExp(options.keyword, "i");
            filter.$or = [{ code: regex }, { name: regex }, { currencyCode: regex }, { remark: regex }];
        }

        if (this.resource === "location" && options.warehouseId) {
            if (!isValidObjectId(options.warehouseId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "warehouseId 格式错误");
            }
            filter.warehouseId = options.warehouseId;
        }

        return await this.model
            .find(filter)
            .sort({ sort: 1, updateTime: -1, createTime: -1 })
            .lean();
    }

    async tree(options: { keyword?: string } = {}) {
        if (!isTreeResource(this.resource)) {
            return await this.retrieve(options);
        }

        const rows = await this.retrieve(options);
        return this.buildTree(rows);
    }

    async detail(id: string) {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        return await this.model.findOne({ _id: id, _isDeleted: { $ne: true } }).lean();
    }

    async create(payload: BasePayload, actor = "") {
        const normalized = await this.normalizePayload(payload, actor, false);

        if (!normalized.code) {
            normalized.code = await this.generateCode(normalized);
        }

        await this.assertUniqueCode(normalized.code);
        await this.assertUniqueCurrencyCode(normalized.currencyCode);
        await this.assertUniqueName(normalized.name);

        return await this.model.create({
            ...normalized,
            createdBy: actor,
            updatedBy: actor,
        });
    }

    async update(id: string, payload: BasePayload, actor = "") {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const current = await this.model.findOne({ _id: id, _isDeleted: { $ne: true } });
        if (!current) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
        }

        const normalized = await this.normalizePayload(payload, actor, true, current);
        if (normalized.code !== undefined) {
            if (!normalized.code) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "编码不能为空");
            }
            await this.assertUniqueCode(normalized.code, id);
        }

        if (normalized.currencyCode !== undefined) {
            if (!normalized.currencyCode) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "币种代码不能为空");
            }
            await this.assertUniqueCurrencyCode(normalized.currencyCode, id);
        }

        if (normalized.name !== undefined) {
            if (!normalized.name) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "名称不能为空");
            }
            await this.assertUniqueName(normalized.name, id);
        }

        if (Object.keys(normalized).length === 0) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "更新时至少传一个字段");
        }

        normalized.updatedBy = actor;

        return await this.model.findByIdAndUpdate(
            id,
            { $set: normalized },
            { new: true, runValidators: true }
        );
    }

    async delete(ids: string[], actor = "") {
        if (!ids.length || ids.some((id) => !isValidObjectId(id))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "ids 格式错误");
        }

        await this.assertCanDelete(ids);

        return await this.model.updateMany(
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

    async assertUniqueCode(code: string, excludeId?: string) {
        const filter: Record<string, any> = { code };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }

        const exists = await this.model.findOne(filter).select("_id").lean();
        if (exists) {
            throwInventoryError(409, CODE.INVENTORY_DUPLICATE_CODE);
        }
    }

    async assertUniqueCurrencyCode(currencyCode?: string, excludeId?: string) {
        if (this.resource !== "currency" || !currencyCode) return;
        const filter: Record<string, any> = { currencyCode };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }

        const exists = await this.model.findOne(filter).select("_id").lean();
        if (exists) {
            throwInventoryError(409, CODE.INVENTORY_DUPLICATE_CODE, "币种代码已存在");
        }
    }

    async assertUniqueName(name?: string, excludeId?: string) {
        if (!["category", "unit", "material"].includes(this.resource) || !name) return;

        const filter: Record<string, any> = {
            name,
            _isDeleted: { $ne: true },
        };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }

        const exists = await this.model.findOne(filter).select("_id").lean();
        if (exists) {
            const labelMap: Partial<Record<InventoryBaseResource, string>> = {
                category: "分类",
                unit: "单位",
                material: "材质",
            };
            throwInventoryError(
                409,
                CODE.INVENTORY_DUPLICATE_CODE,
                `${labelMap[this.resource] || "名称"}名称已存在`,
            );
        }
    }

    private async normalizePayload(payload: BasePayload, actor: string, partial: boolean, current?: any) {
        const data: Record<string, any> = {};

        const assignText = (field: string) => {
            if (!partial || Object.prototype.hasOwnProperty.call(payload, field)) {
                data[field] = toText(payload[field]);
            }
        };

        const assignOptionalText = (field: string) => {
            if (Object.prototype.hasOwnProperty.call(payload, field)) {
                data[field] = toText(payload[field]);
            } else if (!partial) {
                data[field] = "";
            }
        };

        const assignNumber = (field: string, defaultValue = 0) => {
            if (Object.prototype.hasOwnProperty.call(payload, field)) {
                const value = Number(payload[field]);
                data[field] = Number.isFinite(value) ? value : defaultValue;
            } else if (!partial) {
                data[field] = defaultValue;
            }
        };

        const hasOwn = (field: string) => Object.prototype.hasOwnProperty.call(payload, field);

        if (hasOwn("code")) {
            data.code = toText(payload.code).toUpperCase();
        }

        assignText("name");
        assignOptionalText("remark");
        assignNumber("sort", 0);

        if (!partial && !data.name) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "名称不能为空");
        }

        if (this.resource === "unit") {
            if (hasOwn("isEnabled")) {
                data.isEnabled = toBoolean(payload.isEnabled, true);
            } else if (!partial) {
                data.isEnabled = true;
            }
        }

        if (this.resource === "currency") {
            if (hasOwn("currencyCode") || !partial) {
                data.currencyCode = toText(payload.currencyCode).toUpperCase();
            }
            if (!partial && !data.currencyCode) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "币种代码不能为空");
            }
        }

        if (isTreeResource(this.resource)) {
            if (hasOwn("parentId") || !partial) {
                const parentId = toText(payload.parentId);
                data.parentId = parentId ? toObjectId(parentId) : null;

                if (parentId) {
                    if (!isValidObjectId(parentId)) {
                        throwInventoryError(400, CODE.INVALID_PARAMS, "parentId 格式错误");
                    }
                    if (current?._id?.toString() === parentId) {
                        throwInventoryError(400, CODE.INVENTORY_INVALID_TREE, "不能将自己设为父级");
                    }
                    const parent = await this.model.findOne({
                        _id: parentId,
                        _isDeleted: { $ne: true },
                    }).lean();
                    if (!parent) {
                        throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "父级不存在");
                    }
                    await this.assertNoDescendantParent(current?._id?.toString(), parentId);
                    data.level = Number(parent.level || 1) + 1;
                } else {
                    data.level = 1;
                }

                if (this.resource === "location" && data.level > 3) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "仓位最多支持三级");
                }
            }
        }

        if (this.resource === "warehouse") {
            assignOptionalText("manager");
            if (hasOwn("managerId")) {
                const managerId = toText(payload.managerId);
                data.managerId = managerId ? toObjectId(managerId) : null;
            }
            if (hasOwn("includeInAvailable")) {
                data.includeInAvailable = toBoolean(payload.includeInAvailable, true);
            } else if (!partial) {
                data.includeInAvailable = true;
            }
            if (hasOwn("enableLocation")) {
                data.enableLocation = toBoolean(payload.enableLocation, false);
            } else if (!partial) {
                data.enableLocation = false;
            }
        }

        if (this.resource === "location") {
            let warehouseId = toText(payload.warehouseId ?? current?.warehouseId);
            const parentId = toText(data.parentId);

            if (parentId) {
                const parent = await InventoryLocation
                    .findOne({ _id: parentId, _isDeleted: { $ne: true } })
                    .lean();
                if (!parent) {
                    throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "父级仓位不存在");
                }
                const parentWarehouseId = parent.warehouseId?.toString?.() || "";
                if (warehouseId && warehouseId !== parentWarehouseId) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "子仓位必须属于父级仓位所在仓库");
                }
                warehouseId = parentWarehouseId;
                data.warehouseId = parent.warehouseId;
                data.warehouseCode = parent.warehouseCode || "";
                data.warehouseName = parent.warehouseName || "";
            }

            if (!warehouseId || !isValidObjectId(warehouseId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "warehouseId 必填且格式正确");
            }

            const warehouse = await InventoryWarehouse.findOne({
                _id: warehouseId,
                _isDeleted: { $ne: true },
            }).lean();
            if (!warehouse) {
                throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "仓库不存在");
            }

            if (!warehouse.enableLocation) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "该仓库未启用仓位");
            }

            if (!parentId) {
                data.warehouseId = toObjectId(warehouseId);
                data.warehouseCode = warehouse.code || "";
                data.warehouseName = warehouse.name || "";
            }

            assignOptionalText("manager");
            if (hasOwn("managerId")) {
                const managerId = toText(payload.managerId);
                data.managerId = managerId ? toObjectId(managerId) : null;
            }
        }

        Object.keys(data).forEach((key) => {
            if (partial && data[key] === undefined) {
                delete data[key];
            }
        });

        return data;
    }

    private async generateCode(payload: BasePayload) {
        if (this.resource === "location") {
            const parentId = toText(payload.parentId);
            if (parentId) {
                const parent = await InventoryLocation.findOne({ _id: parentId }).lean();
                if (!parent) {
                    throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "父级仓位不存在");
                }
                const next = await useInventoryCounterModel().nextNumber(`inventory:location:${parent.code}`);
                return `${parent.code}-${String(next).padStart(3, "0")}`;
            }

            const warehouseId = toText(payload.warehouseId);
            if (!warehouseId || !isValidObjectId(warehouseId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "warehouseId 必填");
            }
            const warehouse = await InventoryWarehouse.findOne({ _id: warehouseId }).lean();
            if (!warehouse) {
                throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "仓库不存在");
            }
            const next = await useInventoryCounterModel().nextNumber(`inventory:location:${warehouse.code}`);
            return `${warehouse.code}-${String(next).padStart(3, "0")}`;
        }

        if (this.resource === "category" || this.resource === "bom-category") {
            const config = resourceCodeConfig[this.resource];
            const parentId = toText(payload.parentId);
            if (parentId) {
                const parent = await this.model.findById(parentId).lean();
                if (!parent) {
                    throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "父级不存在");
                }
                const next = await useInventoryCounterModel().nextNumber(
                    `inventory:${this.resource}:${parent.code}`
                );
                const separator = this.resource === "bom-category" ? "-" : "";
                return `${parent.code}${separator}${String(next).padStart(2, "0")}`;
            }
            return await useInventoryCounterModel().nextCode(
                `inventory:${this.resource}`,
                config.prefix,
                config.width
            );
        }

        const config = resourceCodeConfig[this.resource];
        return await useInventoryCounterModel().nextCode(
            `inventory:${this.resource}`,
            config.prefix,
            config.width
        );
    }

    private async assertNoDescendantParent(currentId?: string, parentId?: string) {
        if (!currentId || !parentId || currentId === parentId) return;

        let cursor = parentId;
        const seen = new Set<string>();
        while (cursor) {
            if (seen.has(cursor)) {
                throwInventoryError(400, CODE.INVENTORY_INVALID_TREE);
            }
            seen.add(cursor);

            const node = await this.model.findById(cursor).select("parentId").lean();
            const nextParentId = node?.parentId?.toString?.() || "";
            if (nextParentId === currentId) {
                throwInventoryError(400, CODE.INVENTORY_INVALID_TREE, "不能选择自己的子级作为父级");
            }
            cursor = nextParentId;
        }
    }

    private async assertCanDelete(ids: string[]) {
        if (isTreeResource(this.resource)) {
            const child = await this.model
                .findOne({ parentId: { $in: ids }, _isDeleted: { $ne: true } })
                .select("_id")
                .lean();
            if (child) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "存在子级，无法删除");
            }
        }

        if (this.resource === "warehouse") {
            const location = await InventoryLocation
                .findOne({ warehouseId: { $in: ids }, _isDeleted: { $ne: true } })
                .select("_id")
                .lean();
            if (location) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "仓库下存在仓位，无法删除");
            }
        }

        const { InventoryProduct } = await import("~~/server/models/inventoryProduct.model");
        const productReferenceMap: Partial<Record<InventoryBaseResource, Record<string, any>>> = {
            unit: { unitId: { $in: ids } },
            category: { categoryId: { $in: ids } },
            warehouse: { warehouseId: { $in: ids } },
            location: { locationId: { $in: ids } },
        };
        const productReferenceFilter = productReferenceMap[this.resource];
        if (productReferenceFilter) {
            const product = await InventoryProduct
                .findOne({
                    ...productReferenceFilter,
                    _isDeleted: { $ne: true },
                })
                .select("_id")
                .lean();
            if (product) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "当前数据已被产品引用，无法删除");
            }
        }

        const { InventoryBom } = await import("~~/server/models/inventoryBom.model");
        const bomReferenceMap: Partial<Record<InventoryBaseResource, Record<string, any>>> = {
            unit: { "items.unitId": { $in: ids } },
        };
        const bomReferenceFilter = bomReferenceMap[this.resource];
        if (bomReferenceFilter) {
            const bom = await InventoryBom
                .findOne({
                    ...bomReferenceFilter,
                    _isDeleted: { $ne: true },
                })
                .select("_id")
                .lean();
            if (bom) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "当前数据已被 BOM 引用，无法删除");
            }
        }
    }

    private buildTree(rows: any[]) {
        const nodeMap = new Map<string, any>();
        const roots: any[] = [];

        rows.forEach((row) => {
            const id = row._id?.toString?.() || String(row._id);
            nodeMap.set(id, { ...row, children: [] });
        });

        nodeMap.forEach((node) => {
            const parentId = node.parentId?.toString?.() || "";
            const parent = parentId ? nodeMap.get(parentId) : null;
            if (parent) {
                parent.children.push(node);
            } else {
                roots.push(node);
            }
        });

        return roots;
    }
}

export const useInventoryBaseModel = (resource: InventoryBaseResource) => {
    return new InventoryBaseModel(resource);
};

export const getInventoryLocationPath = async (location: any) => {
    const nodes = [location];
    let cursor = location?.parentId?.toString?.() || "";
    const seen = new Set<string>();

    while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        const parent = await InventoryLocation
            .findOne({ _id: cursor, _isDeleted: { $ne: true } })
            .lean();
        if (!parent) break;
        nodes.unshift(parent);
        cursor = parent.parentId?.toString?.() || "";
    }

    return nodes;
};

export const getInventoryLocationPathName = async (location: any) => {
    const path = await getInventoryLocationPath(location);
    return path.map((item) => item.name).filter(Boolean).join(" / ");
};

export const assertInventoryLocationLeaf = async (locationId: any) => {
    const child = await InventoryLocation
        .findOne({ parentId: locationId, _isDeleted: { $ne: true } })
        .select("_id")
        .lean();

    if (child) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "请选择末级仓位");
    }
};

export {
    InventoryBomCategory,
    InventoryCategory,
    InventoryCurrency,
    InventoryLocation,
    InventoryUnit,
    InventoryWarehouse,
};
