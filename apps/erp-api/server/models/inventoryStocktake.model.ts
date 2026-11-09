import mongoose from "mongoose";
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
import {
    InventoryLocation,
    InventoryWarehouse,
} from "~~/server/models/inventoryBase.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import { logger } from "~~/server/utils/logger";

const { Schema } = mongoose;

// 盘点单状态
export enum STOCKTAKE_STATUS {
    DRAFT = "draft",           // 草稿
    IN_PROGRESS = "in_progress", // 盘点中
    COMPLETED = "completed",   // 已完成
    CANCELLED = "cancelled",   // 已取消
}

// 盘点单明细项
export interface StocktakeItemReq {
    productId: string;
    locationId?: string;
    systemQuantity: number;    // 系统库存数量
    actualQuantity: number;    // 实际盘点数量
    difference: number;        // 差异
    remark?: string;
}

// 盘点单请求
export interface StocktakeReq {
    code?: string;
    warehouseId: string;
    locationId?: string;
    stocktakeDate?: Date;
    status?: STOCKTAKE_STATUS;
    operator?: string;
    remark?: string;
    items: StocktakeItemReq[];
}

// 盘点单明细 Schema
const stocktakeItemSchema = new Schema(
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
        locationId: {
            type: Schema.Types.ObjectId,
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
        unitName: {
            type: String,
            default: "",
        },
        systemQuantity: {
            type: Number,
            required: true,
            default: 0,
        },
        actualQuantity: {
            type: Number,
            default: null,  // 默认为空
        },
        difference: {
            type: Number,
            default: null,  // 默认为空
        },
        remark: {
            type: String,
            default: "",
        },
    },
    { _id: false }
);

// 盘点单主表 Schema
const stocktakeSchema = new Schema(
    {
        code: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
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
        locationId: {
            type: Schema.Types.ObjectId,
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
        stocktakeDate: {
            type: Date,
            default: () => new Date(),
        },
        status: {
            type: String,
            enum: Object.values(STOCKTAKE_STATUS),
            default: STOCKTAKE_STATUS.DRAFT,
        },
        operator: {
            type: String,
            default: "",
        },
        remark: {
            type: String,
            default: "",
        },
        items: [stocktakeItemSchema],
        // 盘盈入库单 ID
        inboundOrderId: {
            type: Schema.Types.ObjectId,
            default: null,
        },
        inboundOrderCode: {
            type: String,
            default: "",
        },
        // 盘亏出库单 ID
        outboundOrderId: {
            type: Schema.Types.ObjectId,
            default: null,
        },
        outboundOrderCode: {
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

// 索引
stocktakeSchema.index({ _isDeleted: 1, updateTime: -1 });
stocktakeSchema.index({ _isDeleted: 1, warehouseId: 1, updateTime: -1 });
stocktakeSchema.index({ _isDeleted: 1, status: 1, updateTime: -1 });
stocktakeSchema.index(
    { code: 1 },
    { unique: true, partialFilterExpression: { _isDeleted: { $ne: true } } }
);

const InventoryStocktake =
    mongoose.models.InventoryStocktake || mongoose.model("InventoryStocktake", stocktakeSchema);

type StocktakeListOptions = {
    keyword?: string;
    createDate?: string;
    warehouseId?: string;
    status?: string;
    includeDeleted?: boolean;
    page?: number;
    limit?: number;
};

class StocktakeModel {
    model: typeof InventoryStocktake;

    constructor(model: typeof InventoryStocktake) {
        this.model = model;
    }

    async retrieve(options: StocktakeListOptions = {}) {
        const pageOptions = getPageParams({
            page: options.page,
            limit: options.limit,
        });
        const filter = this.buildFilter(options);

        const [list, total] = await Promise.all([
            this.model
                .find(filter)
                .sort({ updateTime: -1, createTime: -1 })
                .skip(pageOptions.skip)
                .limit(pageOptions.limit)
                .lean(),
            this.model.countDocuments(filter),
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

        return await this.model.findOne({ _id: id, _isDeleted: { $ne: true } }).lean();
    }

    async create(payload: StocktakeReq, actor = "") {
        // 验证仓库
        if (!isValidObjectId(payload.warehouseId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "warehouseId 格式错误");
        }

        const warehouse = await InventoryWarehouse.findOne({
            _id: payload.warehouseId,
            _isDeleted: { $ne: true },
        }).lean();

        if (!warehouse) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "仓库不存在");
        }

        const locationId = toText(payload.locationId);
        let location: any = null;
        if (locationId) {
            if (!isValidObjectId(locationId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "locationId 格式错误");
            }

            location = await InventoryLocation.findOne({
                _id: locationId,
                warehouseId: payload.warehouseId,
                _isDeleted: { $ne: true },
            }).lean();

            if (!location) {
                throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "仓位不存在");
            }
            if (Number(location.level || 1) !== 1) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "盘点单只能选择一级仓位");
            }
        }

        // 生成编号
        const code = await useInventoryCounterModel().nextCode("inventory:stocktake", "PD", 4);

        // 如果前端传了items，使用前端的items；否则从库存表构建
        let items: any[];
        if (payload.items && payload.items.length > 0) {
            logger.info("[创建盘点单] 前端传了items, 数量:", payload.items.length);
            logger.info("[创建盘点单] 第一个item:", JSON.stringify(payload.items[0]));
            // 前端传了items，直接使用
            items = payload.items.map((item: any) => {
                const productId = toObjectId(item.productId);
                logger.info("[创建盘点单] 处理item, productId:", item.productId, "转换后:", productId);
                return {
                    productId,
                    productCode: item.productCode || "",
                    productName: item.productName || "",
                    productModel: item.productModel || "",
                    locationId: toObjectId(item.locationId) || null,
                    locationCode: item.locationCode || "",
                    locationName: item.locationName || "",
                    unitName: item.unitName || "",
                    systemQuantity: toNumber(item.systemQuantity, 0),
                    actualQuantity: item.actualQuantity !== null && item.actualQuantity !== undefined
                        ? toNumber(item.actualQuantity, 0)
                        : null,
                    difference: item.difference !== null && item.difference !== undefined
                        ? toNumber(item.difference, 0)
                        : null,
                    remark: toText(item.remark) || "",
                };
            });
            logger.info("[创建盘点单] 处理后items数量:", items.length);
        } else {
            // 没有传items，从库存表构建
            const stockFilter: Record<string, any> = {
                warehouseId: payload.warehouseId,
                _isDeleted: { $ne: true },
            };
            if (location) {
                stockFilter.locationId = location._id;
            }

            const stockRows = await InventoryStock.find(stockFilter).lean();

            items = stockRows.map((stock: any) => ({
                productId: stock.productId,
                productCode: stock.productCode || "",
                productName: stock.productName || "",
                productModel: stock.model || "",
                locationId: stock.locationId || null,
                locationCode: location?.code || "",
                locationName: location?.name || "",
                unitName: stock.unitName || "",
                systemQuantity: stock.totalQuantity || 0,
                actualQuantity: null,
                difference: null,
                remark: "",
            }));
            logger.info("[创建盘点单] 从库存表构建items, 数量:", items.length);
        }

        const created = await this.model.create({
            code,
            warehouseId: toObjectId(payload.warehouseId),
            warehouseCode: warehouse.code || "",
            warehouseName: warehouse.name || "",
            locationId: location?._id || null,
            locationCode: location?.code || "",
            locationName: location?.name || "",
            stocktakeDate: payload.stocktakeDate || new Date(),
            status: STOCKTAKE_STATUS.DRAFT,
            operator: actor,
            remark: toText(payload.remark) || "",
            items,
            createdBy: actor,
            updatedBy: actor,
        });

        return created;
    }

    async update(id: string, payload: Partial<StocktakeReq>, actor = "") {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const current = await this.model.findOne({ _id: id, _isDeleted: { $ne: true } });
        if (!current) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
        }

        if (current.status === STOCKTAKE_STATUS.COMPLETED) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "已完成的盘点单不能修改");
        }

        const data: Record<string, any> = {
            updatedBy: actor,
        };

        if (payload.status !== undefined) {
            data.status = payload.status;
        }

        if (payload.remark !== undefined) {
            data.remark = toText(payload.remark);
        }

        if (payload.items !== undefined) {
            data.items = payload.items.map((item: any) => ({
                productId: toObjectId(item.productId),
                productCode: item.productCode || "",
                productName: item.productName || "",
                productModel: item.productModel || "",
                locationId: toObjectId(item.locationId) || null,
                locationCode: item.locationCode || "",
                locationName: item.locationName || "",
                unitName: item.unitName || "",
                systemQuantity: toNumber(item.systemQuantity, 0),
                actualQuantity: item.actualQuantity !== null && item.actualQuantity !== undefined
                    ? toNumber(item.actualQuantity, 0)
                    : null,
                difference: item.difference !== null && item.difference !== undefined
                    ? toNumber(item.difference, 0)
                    : null,
                remark: toText(item.remark) || "",
            }));
        }

        if (payload.stocktakeDate !== undefined) {
            data.stocktakeDate = payload.stocktakeDate;
        }

        return await this.model.findByIdAndUpdate(
            id,
            { $set: data },
            { new: true, runValidators: true }
        );
    }

    async delete(ids: string[], actor = "") {
        if (!ids.length || ids.some((id) => !isValidObjectId(id))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "ids 格式错误");
        }

        const objectIds = ids.map((id) => toObjectId(id));
        const stocktakes = await this.model
            .find({ _id: { $in: objectIds }, _isDeleted: { $ne: true } })
            .lean() as any[];

        // 先软删除盘点单，防止回滚部分失败时被重复操作
        const result = await this.model.updateMany(
            { _id: { $in: objectIds }, _isDeleted: { $ne: true } },
            {
                $set: {
                    _isDeleted: true,
                    deletedAt: new Date(),
                    deletedBy: actor,
                    updatedBy: actor,
                },
            }
        );

        // 再尝试回滚关联的入库单和出库单（含库存回滚）
        const inboundIds = stocktakes
            .map((s) => s.inboundOrderId?.toString?.())
            .filter(Boolean);
        const outboundIds = stocktakes
            .map((s) => s.outboundOrderId?.toString?.())
            .filter(Boolean);

        if (inboundIds.length > 0) {
            try {
                const { useInventoryInboundModel } = await import("~~/server/models/inventoryInbound.model");
                await useInventoryInboundModel().delete(inboundIds, actor);
                logger.info(`[盘点单删除] 回滚盘盈入库单: ${inboundIds.join(",")}`);
            } catch (err) {
                logger.error(`[盘点单删除] 回滚盘盈入库单失败: ${inboundIds.join(",")}`, err as Error);
            }
        }
        if (outboundIds.length > 0) {
            try {
                const { useInventoryOutboundModel } = await import("~~/server/models/inventoryOutbound.model");
                await useInventoryOutboundModel().delete(outboundIds, actor);
                logger.info(`[盘点单删除] 回滚盘亏出库单: ${outboundIds.join(",")}`);
            } catch (err) {
                logger.error(`[盘点单删除] 回滚盘亏出库单失败: ${outboundIds.join(",")}`, err as Error);
            }
        }

        return result;
    }

    async complete(id: string, actor = "") {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
        }

        const stocktake = await this.model.findOne({ _id: id, _isDeleted: { $ne: true } });
        if (!stocktake) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
        }

        if (stocktake.status === STOCKTAKE_STATUS.COMPLETED) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "盘点单已完成");
        }

        // 更新状态为已完成
        stocktake.status = STOCKTAKE_STATUS.COMPLETED;
        stocktake.updatedBy = actor;

        return await stocktake.save();
    }

    private buildFilter(options: StocktakeListOptions) {
        const filter: Record<string, any> = {};
        if (!options.includeDeleted) {
            filter._isDeleted = { $ne: true };
        }

        if (options.keyword) {
            const regex = new RegExp(escapeRegExp(options.keyword), "i");
            filter.$or = [
                { code: regex },
                { warehouseName: regex },
                { operator: regex },
                { remark: regex },
            ];
        }

        if (options.warehouseId) {
            if (!isValidObjectId(options.warehouseId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "warehouseId 格式错误");
            }
            filter.warehouseId = options.warehouseId;
        }

        if (options.createDate) {
            const start = new Date(`${options.createDate}T00:00:00`);
            if (Number.isNaN(start.getTime())) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "创建日期格式错误");
            }

            const end = new Date(start);
            end.setHours(23, 59, 59, 999);
            filter.createTime = { $gte: start, $lte: end };
        }

        if (options.status) {
            filter.status = options.status;
        }

        return filter;
    }
}

export const useStocktakeModel = () => new StocktakeModel(InventoryStocktake);
export { InventoryStocktake };
