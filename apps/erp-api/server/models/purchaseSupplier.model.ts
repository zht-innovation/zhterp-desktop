import mongoose from "mongoose";
import { CODE } from "~~/server/utils/code";
import { InventoryCategory } from "~~/server/models/inventoryBase.model";
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import {
    escapeRegExp,
    getPageParams,
    isValidObjectId,
    throwInventoryError,
    toBoolean,
    toObjectId,
    toText,
} from "~~/server/services/inventory";

const { Schema } = mongoose;

export interface PurchaseSupplierReq {
    name?: string;
    contact?: string;
    phone?: string;
    address?: string;
    detailedAddress?: string;
    remark?: string;
    isEnabled?: boolean;
    operator?: string;
    attachments?: Array<{
        url?: string;
        name?: string;
        size?: number;
        type?: string;
    }>;
}

type SupplierListOptions = {
    keyword?: string;
    isEnabled?: unknown;
    productId?: string;
    includeDeleted?: boolean;
    page?: number;
    limit?: number;
};

type SupplierProductListOptions = {
    keyword?: string;
    categoryId?: string;
    page?: number;
    limit?: number;
};

const attachmentSchema = new Schema(
    {
        url: {
            type: String,
            required: true,
            trim: true,
        },
        name: {
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
    { _id: false }
);

const purchaseSupplierSchema = new Schema(
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
        contact: {
            type: String,
            default: "",
        },
        phone: {
            type: String,
            default: "",
        },
        address: {
            type: String,
            default: "",
        },
        detailedAddress: {
            type: String,
            default: "",
        },
        remark: {
            type: String,
            default: "",
        },
        isEnabled: {
            type: Boolean,
            default: true,
        },
        operator: {
            type: String,
            default: "",
        },
        attachments: {
            type: [attachmentSchema],
            default: [],
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

purchaseSupplierSchema.index({ _isDeleted: 1, updateTime: -1 });
purchaseSupplierSchema.index({ _isDeleted: 1, isEnabled: 1, updateTime: -1 });

const purchaseSupplierProductSchema = new Schema(
    {
        supplierId: {
            type: Schema.Types.ObjectId,
            ref: "PurchaseSupplier",
            required: true,
            index: true,
        },
        productId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryProduct",
            required: true,
            index: true,
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

purchaseSupplierProductSchema.index({ supplierId: 1, _isDeleted: 1, updateTime: -1 });
purchaseSupplierProductSchema.index({ productId: 1, _isDeleted: 1 });
purchaseSupplierProductSchema.index(
    { supplierId: 1, productId: 1 },
    {
        unique: true,
        partialFilterExpression: { _isDeleted: false },
    }
);

const PurchaseSupplier =
    mongoose.models.PurchaseSupplier || mongoose.model("PurchaseSupplier", purchaseSupplierSchema);

const PurchaseSupplierProduct =
    mongoose.models.PurchaseSupplierProduct
    || mongoose.model("PurchaseSupplierProduct", purchaseSupplierProductSchema);

class PurchaseSupplierModel {
    supplier: typeof PurchaseSupplier;
    supplierProduct: typeof PurchaseSupplierProduct;

    constructor(supplier: typeof PurchaseSupplier, supplierProduct: typeof PurchaseSupplierProduct) {
        this.supplier = supplier;
        this.supplierProduct = supplierProduct;
    }

    async retrieve(options: SupplierListOptions = {}) {
        const pageOptions = getPageParams({
            page: options.page,
            limit: options.limit,
        });
        const filter = await this.buildFilter(options);

        const [list, total] = await Promise.all([
            this.supplier
                .find(filter)
                .sort({ updateTime: -1, createTime: -1 })
                .skip(pageOptions.skip)
                .limit(pageOptions.limit)
                .lean(),
            this.supplier.countDocuments(filter),
        ]);

        const productsMap = await this.listProductsBySupplierIds(
            list.map((item: any) => item._id).filter(Boolean)
        );

        return {
            list: list.map((item: any) => ({
                ...this.appendOperator(item),
                products: productsMap.get(String(item._id)) || [],
            })),
            pagination: {
                page: pageOptions.page,
                limit: pageOptions.limit,
                total,
                hasMore: pageOptions.skip + list.length < total,
            },
        };
    }

    private async listProductsBySupplierIds(supplierIds: unknown[]) {
        const ids = supplierIds.filter(Boolean);
        const result = new Map<string, Array<{ productId: string; code: string; image: string }>>();
        if (!ids.length) {
            return result;
        }

        const relations = await this.supplierProduct
            .find({ supplierId: { $in: ids }, _isDeleted: { $ne: true } })
            .select("supplierId productId")
            .lean();
        const productIds = [...new Set(
            relations.map((item: any) => item.productId?.toString?.() || "").filter(Boolean)
        )];
        const products = productIds.length
            ? await InventoryProduct
                .find({ _id: { $in: productIds }, _isDeleted: { $ne: true } })
                .select("_id code image")
                .lean()
            : [];
        const productMap = new Map(products.map((item: any) => [
            String(item._id),
            {
                productId: String(item._id),
                code: item.code || "",
                image: item.image || "",
            },
        ]));

        for (const relation of relations as any[]) {
            const supplierId = relation.supplierId?.toString?.() || "";
            const product = productMap.get(relation.productId?.toString?.() || "");
            if (!supplierId || !product) continue;
            const bucket = result.get(supplierId) || [];
            bucket.push(product);
            result.set(supplierId, bucket);
        }

        return result;
    }

    async create(payload: PurchaseSupplierReq, actor = "") {
        const data = this.normalizePayload(payload, false);
        await this.assertUniqueName(data.name);
        data.code = await useInventoryCounterModel().nextCode(
            "purchase:supplier",
            "GYS",
            6
        );

        return await this.supplier.create({
            ...data,
            operator: data.operator || actor,
            createdBy: actor,
            updatedBy: actor,
        });
    }

    async update(id: string, payload: Partial<PurchaseSupplierReq>, actor = "") {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const current = await this.supplier.findOne({ _id: id, _isDeleted: { $ne: true } });
        if (!current) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "供应商不存在");
        }

        const data = this.normalizePayload(payload, true);
        if (Object.keys(data).length === 0) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "更新时至少传一个字段");
        }
        if (data.name) {
            await this.assertUniqueName(data.name, id);
        }

        data.updatedBy = actor;
        if (!data.operator) {
            data.operator = actor;
        }
        return await this.supplier.findByIdAndUpdate(
            id,
            { $set: data },
            { new: true, runValidators: true }
        );
    }

    async updateStatus(id: string, isEnabled: unknown, actor = "") {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }
        if (isEnabled === undefined || isEnabled === null || isEnabled === "") {
            throwInventoryError(400, CODE.INVALID_PARAMS, "缺少 isEnabled");
        }

        const updated = await this.supplier.findOneAndUpdate(
            { _id: id, _isDeleted: { $ne: true } },
            {
                $set: {
                    isEnabled: toBoolean(isEnabled, true),
                    operator: actor,
                    updatedBy: actor,
                },
            },
            { new: true, runValidators: true }
        );
        if (!updated) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "供应商不存在");
        }

        return updated;
    }

    async delete(ids: string[], actor = "") {
        if (!ids.length || ids.some((id) => !isValidObjectId(id))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "ids 格式错误");
        }

        const now = new Date();
        const result = await this.supplier.updateMany(
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

        await this.supplierProduct.updateMany(
            { supplierId: { $in: ids }, _isDeleted: { $ne: true } },
            {
                $set: {
                    _isDeleted: true,
                    deletedAt: now,
                    deletedBy: actor,
                    updatedBy: actor,
                },
            }
        );

        return result;
    }

    async retrieveProducts(supplierId: string, options: SupplierProductListOptions = {}) {
        await this.assertSupplierExists(supplierId);

        const relations = await this.supplierProduct
            .find({ supplierId, _isDeleted: { $ne: true } })
            .sort({ updateTime: -1, createTime: -1 })
            .select("productId")
            .lean();
        const productIds = relations
            .map((item: any) => item.productId?.toString?.() || "")
            .filter(Boolean);
        if (!productIds.length) {
            return {
                list: [],
                pagination: {
                    page: 1,
                    limit: 0,
                    total: 0,
                    hasMore: false,
                },
            };
        }

        const hasPaging = options.page !== undefined || options.limit !== undefined;
        const pageOptions = hasPaging ? getPageParams(options) : null;
        const filter = await this.buildSupplierProductFilter(productIds, options);
        const query = InventoryProduct
            .find(filter)
            .sort({ updateTime: -1, createTime: -1 });
        if (pageOptions) {
            query.skip(pageOptions.skip).limit(pageOptions.limit);
        }

        const [list, total] = await Promise.all([
            query.lean(),
            InventoryProduct.countDocuments(filter),
        ]);

        return {
            list,
            pagination: {
                page: pageOptions?.page || 1,
                limit: pageOptions?.limit || total,
                total,
                hasMore: pageOptions ? pageOptions.skip + list.length < total : false,
            },
        };
    }

    async saveProducts(supplierId: string, productIds: string[], actor = "") {
        await this.assertSupplierExists(supplierId);

        const normalizedProductIds = [
            ...new Set((Array.isArray(productIds) ? productIds : []).map((id) => toText(id)).filter(Boolean)),
        ];
        if (normalizedProductIds.some((id) => !isValidObjectId(id))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "存在无效产品");
        }

        if (normalizedProductIds.length) {
            const products = await InventoryProduct
                .find({
                    _id: { $in: normalizedProductIds },
                    _isDeleted: { $ne: true },
                })
                .select("_id")
                .lean();
            if (products.length !== normalizedProductIds.length) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "存在无效产品");
            }
        }

        const currentRelations = await this.supplierProduct
            .find({ supplierId, _isDeleted: { $ne: true } })
            .select("productId")
            .lean();
        const currentProductIds = new Set(
            currentRelations.map((item: any) => item.productId?.toString?.() || "").filter(Boolean)
        );
        const nextProductIds = new Set(normalizedProductIds);
        const toAdd = normalizedProductIds.filter((productId) => !currentProductIds.has(productId));
        const toRemove = [...currentProductIds].filter((productId) => !nextProductIds.has(productId));
        const now = new Date();

        if (toRemove.length) {
            await this.supplierProduct.updateMany(
                {
                    supplierId,
                    productId: { $in: toRemove },
                    _isDeleted: { $ne: true },
                },
                {
                    $set: {
                        _isDeleted: true,
                        deletedAt: now,
                        deletedBy: actor,
                        updatedBy: actor,
                    },
                }
            );
        }

        if (toAdd.length) {
            await this.supplierProduct.insertMany(
                toAdd.map((productId) => ({
                    supplierId: toObjectId(supplierId),
                    productId: toObjectId(productId),
                    createdBy: actor,
                    updatedBy: actor,
                })),
                { ordered: false }
            );
        }

        return { count: normalizedProductIds.length };
    }

    async appendProducts(supplierId: string, productIds: string[], actor = "") {
        await this.assertSupplierExists(supplierId);

        const normalizedProductIds = [
            ...new Set((Array.isArray(productIds) ? productIds : []).map((id) => toText(id)).filter(Boolean)),
        ];
        if (normalizedProductIds.some((id) => !isValidObjectId(id))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "存在无效产品");
        }

        if (normalizedProductIds.length) {
            const products = await InventoryProduct
                .find({
                    _id: { $in: normalizedProductIds },
                    _isDeleted: { $ne: true },
                })
                .select("_id")
                .lean();
            if (products.length !== normalizedProductIds.length) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "存在无效产品");
            }
        }

        const now = new Date();
        for (const productId of normalizedProductIds) {
            const filter = {
                supplierId: toObjectId(supplierId),
                productId: toObjectId(productId),
                _isDeleted: false,
            };
            try {
                await this.supplierProduct.updateOne(
                    filter,
                    {
                        $setOnInsert: {
                            ...filter,
                            createdBy: actor,
                            updatedBy: actor,
                            createTime: now,
                            updateTime: now,
                        },
                    },
                    { upsert: true, runValidators: true, setDefaultsOnInsert: true, timestamps: false },
                );
            } catch (err: any) {
                if (err?.code !== 11000 || !await this.supplierProduct.exists(filter)) {
                    throw err;
                }
            }
        }

        return { count: normalizedProductIds.length };
    }

    async deleteProductRelations(productIds: string[], actor = "") {
        const ids = productIds.filter((id) => isValidObjectId(id));
        if (!ids.length) {
            return;
        }

        const now = new Date();
        return await this.supplierProduct.updateMany(
            {
                productId: { $in: ids },
                _isDeleted: { $ne: true },
            },
            {
                $set: {
                    _isDeleted: true,
                    deletedAt: now,
                    deletedBy: actor,
                    updatedBy: actor,
                },
            }
        );
    }

    private async assertSupplierExists(id: string) {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "supplierId 格式错误");
        }

        const supplier = await this.supplier
            .findOne({ _id: id, _isDeleted: { $ne: true } })
            .select("_id")
            .lean();
        if (!supplier) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "供应商不存在");
        }
    }

    private normalizePayload(payload: Record<string, any>, partial: boolean) {
        const data: Record<string, any> = {};
        const hasOwn = (field: string) => Object.prototype.hasOwnProperty.call(payload || {}, field);
        const textFields = ["contact", "phone", "address", "detailedAddress", "remark", "operator"];

        if (hasOwn("name") || !partial) {
            data.name = toText(payload?.name);
            if (!data.name) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "供应商名称不能为空");
            }
        }

        for (const field of textFields) {
            if (hasOwn(field)) {
                data[field] = toText(payload[field]);
            } else if (!partial) {
                data[field] = "";
            }
        }

        if (hasOwn("isEnabled")) {
            data.isEnabled = toBoolean(payload.isEnabled, true);
        } else if (!partial) {
            data.isEnabled = true;
        }

        if (hasOwn("attachments")) {
            data.attachments = this.normalizeAttachments(payload.attachments);
        } else if (!partial) {
            data.attachments = [];
        }

        return data;
    }

    private normalizeAttachments(value: unknown) {
        if (value === undefined || value === null || value === "") {
            return [];
        }

        let rawList = value;
        if (typeof value === "string") {
            try {
                rawList = JSON.parse(value);
            } catch {
                throwInventoryError(400, CODE.INVALID_PARAMS, "附件格式错误");
            }
        }
        if (!Array.isArray(rawList)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "附件格式错误");
        }

        return (rawList as any[]).map((item: any) => {
            const url = toText(item?.url);
            const name = toText(item?.name);
            if (!url || !name) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "附件缺少 url 或 name");
            }

            return {
                url,
                name,
                size: Number.isFinite(Number(item?.size)) ? Number(item.size) : 0,
                type: toText(item?.type),
            };
        });
    }

    private async buildFilter(options: SupplierListOptions) {
        const filter: Record<string, any> = {};
        if (!options.includeDeleted) {
            filter._isDeleted = { $ne: true };
        }

        if (options.keyword) {
            const regex = new RegExp(escapeRegExp(options.keyword), "i");
            filter.$or = [
                { code: regex },
                { name: regex },
                { contact: regex },
                { phone: regex },
                { address: regex },
                { detailedAddress: regex },
                { remark: regex },
                { operator: regex },
                { createdBy: regex },
                { updatedBy: regex },
            ];
        }

        if (options.isEnabled !== undefined && options.isEnabled !== "") {
            filter.isEnabled = toBoolean(options.isEnabled, true);
        }

        if (options.productId) {
            if (!isValidObjectId(options.productId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
            }

            const relations = await this.supplierProduct
                .find({
                    productId: options.productId,
                    _isDeleted: { $ne: true },
                })
                .select("supplierId")
                .lean();
            const supplierIds = relations.map((item: any) => item.supplierId).filter(Boolean);
            filter._id = { $in: supplierIds };
        }

        return filter;
    }

    private appendOperator(item: any) {
        return {
            ...item,
            operator: item.updatedBy || item.operator || item.createdBy || "",
        };
    }

    private async assertUniqueName(name: string, excludeId?: string) {
        const filter: Record<string, any> = {
            name,
            _isDeleted: { $ne: true },
        };
        if (excludeId && isValidObjectId(excludeId)) {
            filter._id = { $ne: toObjectId(excludeId) };
        }

        const existing = await this.supplier.findOne(filter).select("_id").lean();
        if (existing) {
            throwInventoryError(409, CODE.INVALID_PARAMS, "供应商名称已存在");
        }
    }

    private async buildSupplierProductFilter(productIds: string[], options: SupplierProductListOptions) {
        const filter: Record<string, any> = {
            _id: { $in: productIds },
            _isDeleted: { $ne: true },
        };

        if (options.keyword) {
            const regex = new RegExp(escapeRegExp(options.keyword), "i");
            filter.$or = [
                { code: regex },
                { name: regex },
                { model: regex },
                { modelCode: regex },
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

            filter.categoryId = { $in: await this.getProductCategoryIds(options.categoryId) };
        }

        return filter;
    }

    private async getProductCategoryIds(categoryId: string) {
        const ids = [toObjectId(categoryId)].filter(Boolean);
        let frontier = ids;

        while (frontier.length) {
            const children = await InventoryCategory
                .find({
                    parentId: { $in: frontier },
                    _isDeleted: { $ne: true },
                })
                .select("_id")
                .lean();
            frontier = children.map((item: any) => item._id).filter(Boolean);
            ids.push(...frontier);
        }

        return ids;
    }
}

export const usePurchaseSupplierModel = () => new PurchaseSupplierModel(
    PurchaseSupplier,
    PurchaseSupplierProduct
);
export { PurchaseSupplier, PurchaseSupplierProduct };
