import mongoose from "mongoose";
import { INVENTORY_ORDER_STATUS, INVENTORY_STOCK_WARNING_STATUS } from "~~/shared/enums";
import type {
    InventoryStockRestrictionDetails,
    InventoryStockRestrictionRetrieveParams,
    InventoryStockWarningStatus,
} from "~~/shared/types/inventory";
import {
    escapeRegExp,
    getPageParams,
    isValidObjectId,
    throwInventoryError,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import {
    getStockWarningStatus,
    normalizeStockQuantity,
} from "~~/server/services/inventoryStockMath";
import { getPurchaseInTransitSummaryMap } from "~~/server/services/purchaseInTransitSummary";
import { buildInventoryStockRestrictions } from "~~/server/services/inventoryStockRestrictions";
import { getVisibleInventoryOrderNumbers } from "~~/server/services/inventoryStockOrderAccess";
import {
    assertInventoryLocationLeaf,
    getInventoryLocationPathName,
    InventoryCategory,
    InventoryLocation,
    InventoryUnit,
    InventoryWarehouse,
} from "~~/server/models/inventoryBase.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import {
    SalesOrderStockReservation,
    useSalesOrderStockReservationModel,
} from "~~/server/models/salesOrderStockReservation.model";
import { CODE } from "~~/server/utils/code";

const { Schema } = mongoose;

type StockListOptions = {
    productId?: string;
    productIds?: string[];
    keyword?: string;
    categoryId?: string;
    warehouseId?: string;
    locationId?: string;
    stockStatus?: string;
    includeAssignedProducts?: boolean;
    paginateAssignedProducts?: boolean;
    includeDescendantLocations?: boolean;
    includeInTransit?: boolean;
    availableOnly?: boolean;
    includeDeleted?: boolean;
    page?: number;
    limit?: number;
};

type LedgerListOptions = {
    productId?: string;
    keyword?: string;
    page?: number;
    limit?: number;
};

type InventoryStockPosition = {
    warehouseId: string;
    locationId: string;
};

export type InventoryStockApplyItem = {
    productId: string;
    quantity: number;
    lockedQuantity?: number;
    unitId?: string | null;
    warehouseId?: string | null;
    locationId?: string | null;
};

export type InventoryStockSource = {
    sourceType: string;
    sourceId: string;
    sourceNo: string;
    businessType: string;
    changedAt: Date;
    operator: string;
    remark?: string;
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

const productLedgerSnapshotFields = {
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
};

const inventoryStockSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryProduct",
            required: true,
            index: true,
        },
        warehouseId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryWarehouse",
            default: null,
            index: true,
        },
        locationId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryLocation",
            default: null,
            index: true,
        },
        quantity: {
            type: Number,
            default: 0,
        },
        lockedQuantity: {
            type: Number,
            default: 0,
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
        ...auditFields,
        ...softDeleteFields,
    },
    {
        versionKey: false,
        timestamps: {
            createdAt: "createTime",
            updatedAt: "updateTime",
        },
    },
);

const inventoryStockLedgerSchema = new Schema(
    {
        productId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryProduct",
            required: true,
            index: true,
        },
        ...productLedgerSnapshotFields,
        changedAt: {
            type: Date,
            required: true,
            index: true,
        },
        relatedOrderNo: {
            type: String,
            default: "",
            trim: true,
        },
        businessType: {
            type: String,
            required: true,
            trim: true,
        },
        direction: {
            type: String,
            enum: ["inbound", "outbound", "transfer"],
            default: "inbound",
        },
        quantity: {
            type: Number,
            required: true,
        },
        outboundWarehouseId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryWarehouse",
            default: null,
        },
        outboundWarehouseName: {
            type: String,
            default: "",
        },
        outboundLocationId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryLocation",
            default: null,
        },
        outboundLocationName: {
            type: String,
            default: "",
        },
        inboundWarehouseId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryWarehouse",
            default: null,
        },
        inboundWarehouseName: {
            type: String,
            default: "",
        },
        inboundLocationId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryLocation",
            default: null,
        },
        inboundLocationName: {
            type: String,
            default: "",
        },
        sourceType: {
            type: String,
            default: "",
        },
        sourceId: {
            type: Schema.Types.ObjectId,
            default: null,
            index: true,
        },
        sourceNo: {
            type: String,
            default: "",
        },
        operator: {
            type: String,
            default: "",
        },
        remark: {
            type: String,
            default: "",
        },
        ...auditFields,
        ...softDeleteFields,
    },
    {
        versionKey: false,
        timestamps: {
            createdAt: "createTime",
            updatedAt: "updateTime",
        },
    },
);

inventoryStockSchema.index(
    { productId: 1, warehouseId: 1, locationId: 1 },
    { unique: true },
);
inventoryStockSchema.index({ _isDeleted: 1, productId: 1, updateTime: -1 });
inventoryStockSchema.index({ _isDeleted: 1, warehouseId: 1, locationId: 1 });
inventoryStockLedgerSchema.index({ _isDeleted: 1, productId: 1, changedAt: -1 });
inventoryStockLedgerSchema.index({ _isDeleted: 1, sourceId: 1 });

const InventoryStock =
    mongoose.models.InventoryStock || mongoose.model("InventoryStock", inventoryStockSchema);
const InventoryStockLedger =
    mongoose.models.InventoryStockLedger ||
    mongoose.model("InventoryStockLedger", inventoryStockLedgerSchema);

const formatWarehouseName = (warehouseName = "", locationName = "") => {
    const parts = [warehouseName, locationName].filter(Boolean);
    return parts.length ? parts.join("/") : "";
};

class InventoryStockModel {
    stock: typeof InventoryStock;
    ledger: typeof InventoryStockLedger;

    constructor(stock: typeof InventoryStock, ledger: typeof InventoryStockLedger) {
        this.stock = stock;
        this.ledger = ledger;
    }

    async updateProductLocation(
        productId: string,
        currentPosition: InventoryStockPosition,
        nextPosition: InventoryStockPosition,
        actor: string,
        session: mongoose.ClientSession,
    ) {
        const stockProductId = toObjectId(productId);
        const currentStockPosition = {
            warehouseId: toObjectId(currentPosition.warehouseId) || null,
            locationId: toObjectId(currentPosition.locationId) || null,
        };
        const stockRows = await this.stock.find({
            productId: stockProductId,
            _isDeleted: { $ne: true },
        }).select("warehouseId locationId lockedQuantity").session(session).lean() as any[];
        const activeReservations = await SalesOrderStockReservation.find({
            stockProductId,
            status: "active",
            $expr: {
                $gt: [
                    "$reservedQuantity",
                    { $add: ["$consumedQuantity", "$releasedQuantity"] },
                ],
            },
        }).session(session).lean() as any[];
        const getPositionKey = (warehouseId: unknown, locationId: unknown) =>
            `${toText(warehouseId)}:${toText(locationId)}`;
        const reservedQuantityMap = new Map<string, number>();
        const movedReservations: any[] = [];
        const currentPositionKey = getPositionKey(currentPosition.warehouseId, currentPosition.locationId);
        for (const reservation of activeReservations) {
            const key = getPositionKey(reservation.warehouseId, reservation.locationId);
            const remainingQuantity = normalizeStockQuantity(
                reservation.reservedQuantity
                    - (reservation.consumedQuantity || 0)
                    - (reservation.releasedQuantity || 0),
            );
            reservedQuantityMap.set(key, normalizeStockQuantity((reservedQuantityMap.get(key) || 0) + remainingQuantity));
            if (key === currentPositionKey) {
                movedReservations.push(reservation);
            }
        }
        let hasCurrentStock = false;
        // 锁定数量中只有销售预占可以跟随库位修改，额外的借用等锁定继续拦截。
        for (const stock of stockRows) {
            const key = getPositionKey(stock.warehouseId, stock.locationId);
            const lockedQuantity = normalizeStockQuantity(stock.lockedQuantity || 0);
            const salesReservedQuantity = reservedQuantityMap.get(key) || 0;
            if (lockedQuantity > salesReservedQuantity) {
                throwInventoryError(409, CODE.INVALID_PARAMS, "该产品存在借用或其他非销售订单锁定，请先解除锁定后再修改库位");
            }
            if (lockedQuantity < salesReservedQuantity) {
                throwInventoryError(409, CODE.INVALID_PARAMS, "销售订单预占数量与库存锁定数量不一致，无法修改库位");
            }
            if (key === currentPositionKey) {
                hasCurrentStock = true;
            }
        }
        if (!hasCurrentStock && movedReservations.length) {
            throwInventoryError(409, CODE.INVALID_PARAMS, "原库位库存记录不存在，无法同步销售订单预占库位");
        }

        const nextStockPosition = {
            warehouseId: toObjectId(nextPosition.warehouseId) || null,
            locationId: toObjectId(nextPosition.locationId) || null,
        };
        // 唯一索引也包含已删除、零数量记录，不能覆盖或合并目标库位的记录。
        const targetStock = await this.stock.exists({
            productId: stockProductId,
            ...nextStockPosition,
        }).session(session);
        if (targetStock) {
            throwInventoryError(409, CODE.INVALID_PARAMS, "目标库位已存在该产品的库存记录，无法直接修改库位");
        }

        try {
            // 只修改原库存记录的位置，保留记录 ID、数量、锁定数量及其他字段。
            await this.stock.updateOne(
                {
                    productId: stockProductId,
                    ...currentStockPosition,
                    _isDeleted: { $ne: true },
                },
                { $set: { ...nextStockPosition, updatedBy: actor } },
                { session, runValidators: true },
            );
        } catch (err: any) {
            if (err?.code === 11000) {
                throwInventoryError(409, CODE.INVALID_PARAMS, "目标库位已存在该产品的库存记录，请刷新后重试");
            }
            throw err;
        }

        await useSalesOrderStockReservationModel().updateLocation(
            movedReservations,
            nextStockPosition,
            actor,
            session,
        );
        if (movedReservations.length) {
            const { InventoryOutbound } = await import("~~/server/models/inventoryOutbound.model");
            const warehouse = await this.resolveWarehouseSnapshot(nextPosition.warehouseId, session);
            const location = await this.resolveLocationSnapshot(nextPosition.locationId, warehouse.warehouseId, session);
            const salesOrderIds = movedReservations.map((reservation) => reservation.salesOrderId);
            const salesOrderNos = movedReservations.map((reservation) => reservation.salesOrderNo);
            await InventoryOutbound.updateMany(
                {
                    _isDeleted: { $ne: true },
                    type: "订单",
                    stockApplied: { $ne: true },
                    status: { $nin: [INVENTORY_ORDER_STATUS.COMPLETED, INVENTORY_ORDER_STATUS.CANCELLED] },
                    $or: [
                        { salesOrderId: { $in: salesOrderIds } },
                        { contractOrderNo: { $in: salesOrderNos } },
                    ],
                    items: { $elemMatch: { productId: stockProductId, ...currentStockPosition } },
                },
                {
                    $set: {
                        "items.$[item].warehouseId": warehouse.warehouseId,
                        "items.$[item].warehouseCode": warehouse.warehouseCode,
                        "items.$[item].warehouseName": warehouse.warehouseName,
                        "items.$[item].locationId": location.locationId,
                        "items.$[item].locationCode": location.locationCode,
                        "items.$[item].locationName": location.locationName,
                        "items.$[item].includeInAvailable": warehouse.includeInAvailable,
                        updatedBy: actor,
                    },
                },
                {
                    session,
                    runValidators: true,
                    arrayFilters: [{
                        "item.productId": stockProductId,
                        "item.warehouseId": currentStockPosition.warehouseId,
                        "item.locationId": currentStockPosition.locationId,
                    }],
                },
            );
        }
    }

    async retrieve(options: StockListOptions = {}) {
        const pageOptions = getPageParams({ page: options.page, limit: options.limit });
        const locationScopeIds = await this.resolveLocationScope(options);
        const filter = await this.buildStockFilter(options, locationScopeIds);
        const stockRows = await this.stock.find(filter).sort({ updateTime: -1 }).lean() as any[];
        const groupedStockRows = await this.groupStockRows(stockRows);
        const groupedRows = options.includeAssignedProducts
            ? await this.mergeAssignedProducts(groupedStockRows, options, locationScopeIds)
            : groupedStockRows;
        const keywordFilteredRows = this.filterStockRowsByKeyword(groupedRows, options.keyword);
        const statusFilteredRows = options.stockStatus
            ? keywordFilteredRows.filter((row) => row.stockStatus === options.stockStatus)
            : keywordFilteredRows;
        const availableFilteredRows = options.availableOnly
            ? statusFilteredRows.filter((row) => Number(row.availableQuantity || 0) > 0)
            : statusFilteredRows;
        const shouldPaginate = !options.includeAssignedProducts || options.paginateAssignedProducts;
        let list = shouldPaginate
            ? availableFilteredRows.slice(pageOptions.skip, pageOptions.skip + pageOptions.limit)
            : availableFilteredRows;
        if (options.includeInTransit) {
            list = await this.appendInTransitSummary(list);
        }

        return {
            list,
            pagination: {
                page: pageOptions.page,
                limit: shouldPaginate ? pageOptions.limit : list.length,
                total: availableFilteredRows.length,
                hasMore: shouldPaginate
                    ? pageOptions.skip + list.length < availableFilteredRows.length
                    : false,
            },
        };
    }

    async restrictionDetails(
        options: InventoryStockRestrictionRetrieveParams,
        auth: any,
    ): Promise<InventoryStockRestrictionDetails> {
        const productId = toText(options.productId);
        const stockId = toText(options.stockId);
        if (!isValidObjectId(productId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "缺少有效的 productId");
        }
        if (stockId && !isValidObjectId(stockId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "stockId 格式错误");
        }

        const product = await InventoryProduct.findOne({
            _id: toObjectId(productId),
            _isDeleted: { $ne: true },
        }).select("code model unitName").lean() as any;
        if (!product) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "产品不存在");
        }

        // 只接收明细查询支持的筛选，不能通过 includeDeleted 等参数扩大范围。
        const stockOptions: StockListOptions = {
            productId,
            warehouseId: toText(options.warehouseId),
            locationId: toText(options.locationId),
            includeDescendantLocations: options.includeDescendantLocations === true,
        };
        const locationScopeIds = await this.resolveLocationScope(stockOptions);
        const filter = await this.buildStockFilter(stockOptions, locationScopeIds);
        if (stockId) filter._id = toObjectId(stockId);
        const stockRows = await this.stock.find(filter).sort({ _id: 1 }).lean() as any[];
        if (stockId && !stockRows.length) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "所选库存记录不存在或不在当前筛选范围内");
        }

        const groups = await this.groupStockRows(stockRows);
        const group = groups[0];
        const details = group?.details || [];
        const restrictedPositions: Array<Record<string, any>> = [];
        for (const detail of details) {
            if (detail.includeInAvailable === false || detail.unavailableQuantity <= 0) continue;
            restrictedPositions.push({
                warehouseId: detail.warehouseId || null,
                locationId: detail.locationId || null,
            });
        }
        const reservations = restrictedPositions.length
            ? await SalesOrderStockReservation.find({
                stockProductId: toObjectId(productId),
                status: "active",
                $or: restrictedPositions,
            }).select("salesOrderId warehouseId locationId reservationType reservedQuantity consumedQuantity releasedQuantity").lean() as any[]
            : [];

        const visibleOrderNumbers = await getVisibleInventoryOrderNumbers(
            auth,
            reservations.map((row) => toText(row.salesOrderId)),
        );

        return {
            productId,
            productCode: product.code || "",
            model: product.model || "",
            unitName: product.unitName || "",
            unavailableQuantity: normalizeStockQuantity(group?.unavailableQuantity),
            list: buildInventoryStockRestrictions(details, reservations, visibleOrderNumbers),
        };
    }

    async ledgerList(options: LedgerListOptions = {}) {
        const pageOptions = getPageParams({ page: options.page, limit: options.limit });
        const filter: Record<string, any> = { _isDeleted: { $ne: true } };

        if (options.productId) {
            if (!isValidObjectId(options.productId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
            }
            filter.productId = toObjectId(options.productId);
        }

        if (options.keyword) {
            const regex = new RegExp(escapeRegExp(options.keyword), "i");
            filter.$or = [
                { productCode: regex },
                { productName: regex },
                { model: regex },
                { relatedOrderNo: regex },
                { businessType: regex },
                { operator: regex },
                { remark: regex },
            ];
        }

        const [list, total] = await Promise.all([
            this.ledger
                .find(filter)
                .sort({ changedAt: -1, createTime: -1 })
                .skip(pageOptions.skip)
                .limit(pageOptions.limit)
                .lean(),
            this.ledger.countDocuments(filter),
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

    async applyInbound(
        items: InventoryStockApplyItem[],
        source: InventoryStockSource,
        actor = "",
        session?: mongoose.ClientSession,
    ) {
        const sessionOptions = session ? { session } : {};
        // 第一阶段：校验所有明细
        for (const item of items) {
            const quantity = normalizeStockQuantity(item.quantity);
            const lockedQuantity = normalizeStockQuantity(item.lockedQuantity || 0);
            if (quantity <= 0) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "入库数量必须大于0");
            }
            if (lockedQuantity < 0 || lockedQuantity > quantity) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "入库锁定数量不合法");
            }
        }

        // 第二阶段：全部校验通过，执行增加，记录变更用于回滚
        const changes: Array<{
            stockId: any;
            wasNew: boolean;
            quantity: number;
            lockedQuantity: number;
            ledgerId: any;
        }> = [];

        try {
            for (const item of items) {
                const quantity = normalizeStockQuantity(item.quantity);
                const lockedQuantity = normalizeStockQuantity(item.lockedQuantity || 0);

                const snapshots = await this.resolveStockSnapshots(item, session);
                const stockFilter = {
                    productId: snapshots.product.productId,
                    warehouseId: snapshots.warehouse.warehouseId,
                    locationId: snapshots.location.locationId,
                    _isDeleted: { $ne: true },
                };
                const currentQuery = this.stock.findOne(stockFilter).lean();
                if (session) currentQuery.session(session);
                const current = await currentQuery as any;
                let wasNew = false;
                let stockId = current?._id;

                if (current) {
                    await this.stock.updateOne(
                        { _id: current._id },
                        {
                            $set: {
                                quantity: normalizeStockQuantity(current.quantity + quantity),
                                lockedQuantity: normalizeStockQuantity((current.lockedQuantity || 0) + lockedQuantity),
                                updatedBy: actor,
                            },
                        },
                        sessionOptions,
                    );
                } else {
                    const created = new this.stock({
                        productId: snapshots.product.productId,
                        warehouseId: snapshots.warehouse.warehouseId,
                        locationId: snapshots.location.locationId,
                        quantity: normalizeStockQuantity(quantity),
                        lockedQuantity: normalizeStockQuantity(lockedQuantity),
                        createdBy: actor,
                        updatedBy: actor,
                    });
                    await created.save(sessionOptions);
                    wasNew = true;
                    stockId = created._id;
                }

                const ledgerDoc = new this.ledger({
                    ...snapshots.ledgerProduct,
                    changedAt: source.changedAt,
                    relatedOrderNo: source.sourceNo,
                    businessType: source.businessType,
                    direction: "inbound",
                    quantity,
                    inboundWarehouseId: snapshots.warehouse.warehouseId,
                    inboundWarehouseName: formatWarehouseName(
                        snapshots.warehouse.warehouseName,
                        snapshots.location.locationName,
                    ),
                    inboundLocationId: snapshots.location.locationId,
                    inboundLocationName: snapshots.location.locationName,
                    sourceType: source.sourceType,
                    sourceId: toObjectId(source.sourceId),
                    sourceNo: source.sourceNo,
                    operator: source.operator || actor,
                    remark: source.remark || "",
                    createdBy: actor,
                    updatedBy: actor,
                });
                await ledgerDoc.save(sessionOptions);

                changes.push({
                    stockId,
                    wasNew,
                    quantity,
                    lockedQuantity,
                    ledgerId: ledgerDoc._id,
                });
            }
        } catch (err) {
            if (session) throw err;
            // 兜底回滚：反向恢复已处理的明细
            for (const change of changes) {
                try {
                    if (change.wasNew) {
                        await this.stock.deleteOne({ _id: change.stockId }, sessionOptions);
                    } else {
                        const stockQuery = this.stock.findOne({ _id: change.stockId }).lean();
                        if (session) stockQuery.session(session);
                        const stock = await stockQuery as any;
                        if (stock) {
                            await this.stock.updateOne(
                                { _id: change.stockId },
                                {
                                    $set: {
                                        quantity: normalizeStockQuantity(stock.quantity - change.quantity),
                                        lockedQuantity: normalizeStockQuantity((stock.lockedQuantity || 0) - change.lockedQuantity),
                                        updatedBy: actor,
                                    },
                                },
                                sessionOptions,
                            );
                        }
                    }
                    await this.ledger.deleteOne({ _id: change.ledgerId }, sessionOptions);
                } catch {
                    // 回滚失败时静默，避免掩盖原始错误
                }
            }
            throw err;
        }
    }

    async buildInboundItemSnapshot(
        item: InventoryStockApplyItem,
        session?: mongoose.ClientSession,
        options: { preservePosition?: boolean } = {},
    ) {
        const snapshots = await this.resolveStockSnapshots(item, session, options);

        return {
            ...snapshots.inboundProduct,
            ...snapshots.unit,
            ...snapshots.warehouse,
            ...snapshots.location,
            quantity: normalizeStockQuantity(item.quantity),
            lockedQuantity: normalizeStockQuantity(item.lockedQuantity || 0),
        };
    }

    async buildTransferItemSnapshot(item: InventoryStockApplyItem) {
        const snapshots = await this.resolveStockSnapshots(item);

        return {
            ...snapshots.inboundProduct,
            ...snapshots.unit,
            ...snapshots.warehouse,
            ...snapshots.location,
            quantity: normalizeStockQuantity(item.quantity),
        };
    }

    async lockTransferBorrowItems(items: InventoryStockApplyItem[], source: InventoryStockSource, actor = "") {
        const stockRows: Array<{
            snapshots: any;
            stock: any;
            quantity: number;
        }> = [];

        for (const item of items) {
            const quantity = normalizeStockQuantity(item.quantity);
            if (quantity <= 0) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "调拨数量必须大于0");
            }

            const snapshots = await this.resolveStockSnapshots(item);
            const current = await this.stock.findOne({
                productId: snapshots.product.productId,
                warehouseId: snapshots.warehouse.warehouseId,
                locationId: snapshots.location.locationId,
                _isDeleted: { $ne: true },
            }).lean() as any;
            const stockQuantity = normalizeStockQuantity(current?.quantity || 0);
            const lockedQuantity = normalizeStockQuantity(current?.lockedQuantity || 0);
            const availableQuantity = snapshots.warehouse.includeInAvailable
                ? normalizeStockQuantity(Math.max(stockQuantity - lockedQuantity, 0))
                : 0;

            if (!current || availableQuantity < quantity) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "当前库存不足，无法完成调拨操作");
            }

            stockRows.push({ snapshots, stock: current, quantity });
        }

        const changes: Array<{ stockId: any; quantity: number; ledgerId: any }> = [];
        try {
            for (const row of stockRows) {
                await this.stock.updateOne(
                    { _id: row.stock._id },
                    {
                        $inc: { lockedQuantity: row.quantity },
                        $set: { updatedBy: actor },
                    },
                );

                const ledgerDoc = await this.ledger.create({
                    ...row.snapshots.ledgerProduct,
                    changedAt: source.changedAt,
                    relatedOrderNo: source.sourceNo,
                    businessType: source.businessType,
                    direction: "transfer",
                    quantity: row.quantity,
                    outboundWarehouseId: row.snapshots.warehouse.warehouseId,
                    outboundWarehouseName: formatWarehouseName(
                        row.snapshots.warehouse.warehouseName,
                        row.snapshots.location.locationName,
                    ),
                    outboundLocationId: row.snapshots.location.locationId,
                    outboundLocationName: row.snapshots.location.locationName,
                    sourceType: source.sourceType,
                    sourceId: toObjectId(source.sourceId),
                    sourceNo: source.sourceNo,
                    operator: source.operator || actor,
                    remark: source.remark || "",
                    createdBy: actor,
                    updatedBy: actor,
                });

                changes.push({ stockId: row.stock._id, quantity: row.quantity, ledgerId: ledgerDoc._id });
            }
        } catch (err) {
            for (const change of changes.reverse()) {
                try {
                    const stock = await this.stock.findOne({ _id: change.stockId }).lean() as any;
                    if (stock) {
                        await this.stock.updateOne(
                            { _id: change.stockId },
                            {
                                $inc: { lockedQuantity: -change.quantity },
                                $set: { updatedBy: actor },
                            },
                        );
                    }
                    await this.ledger.deleteOne({ _id: change.ledgerId });
                } catch {
                    // 回滚失败时静默，避免掩盖原始错误
                }
            }
            throw err;
        }
    }

    async releaseTransferBorrowItems(items: InventoryStockApplyItem[], actor = "") {
        const stockRows: Array<{ stock: any; quantity: number }> = [];

        for (const item of items) {
            const quantity = normalizeStockQuantity(item.quantity);
            if (quantity <= 0) continue;

            const snapshots = await this.resolveStockSnapshots(item);
            const current = await this.stock.findOne({
                productId: snapshots.product.productId,
                warehouseId: snapshots.warehouse.warehouseId,
                locationId: snapshots.location.locationId,
                _isDeleted: { $ne: true },
            }).lean() as any;
            const lockedQuantity = normalizeStockQuantity(current?.lockedQuantity || 0);
            if (!current || lockedQuantity < quantity) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "当前锁定库存不足，无法归还调拨产品");
            }

            stockRows.push({ stock: current, quantity });
        }

        const changes: Array<{ stockId: any; quantity: number }> = [];
        try {
            for (const row of stockRows) {
                await this.stock.updateOne(
                    { _id: row.stock._id },
                    {
                        $inc: { lockedQuantity: -row.quantity },
                        $set: { updatedBy: actor },
                    },
                );
                changes.push({ stockId: row.stock._id, quantity: row.quantity });
            }
        } catch (err) {
            for (const change of changes.reverse()) {
                try {
                    const stock = await this.stock.findOne({ _id: change.stockId }).lean() as any;
                    if (stock) {
                        await this.stock.updateOne(
                            { _id: change.stockId },
                            {
                                $inc: { lockedQuantity: change.quantity },
                                $set: { updatedBy: actor },
                            },
                        );
                    }
                } catch {
                    // 回滚失败时静默，避免掩盖原始错误
                }
            }
            throw err;
        }
    }

    async deleteTransferLedgers(sourceId: string) {
        if (!isValidObjectId(sourceId)) {
            return;
        }

        await this.ledger.deleteMany({ sourceType: "transfer", sourceId: toObjectId(sourceId) });
    }

    async applyTransfer(items: any[], source: InventoryStockSource, actor = "") {
        // 第一阶段：校验所有明细的库存充足性
        for (const item of items) {
            const quantity = normalizeStockQuantity(item.quantity);
            if (quantity <= 0) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "调拨数量必须大于0");
            }

            const sourceStockFilter = {
                productId: toObjectId(item.productId),
                warehouseId: toObjectId(item.sourceWarehouseId),
                locationId: toObjectId(item.sourceLocationId) || null,
                _isDeleted: { $ne: true },
            };
            const sourceStock = await this.stock.findOne(sourceStockFilter).lean() as any;
            const sourceWarehouse = await this.resolveWarehouseSnapshot(item.sourceWarehouseId);
            const sourceStockQuantity = normalizeStockQuantity(sourceStock?.quantity || 0);
            const sourceLockedQuantity = normalizeStockQuantity(sourceStock?.lockedQuantity || 0);
            const sourceAvailableQuantity = sourceWarehouse.includeInAvailable
                ? normalizeStockQuantity(Math.max(sourceStockQuantity - sourceLockedQuantity, 0))
                : 0;
            if (!sourceStock || sourceAvailableQuantity < quantity) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "当前库存不足，无法完成调拨操作");
            }
        }

        const changes: Array<{
            sourceStockId: any;
            sourceQuantity: number;
            destStockId: any | null;
            destWasNew: boolean;
            destQuantity: number;
            ledgerId: any;
        }> = [];

        try {
            for (const item of items) {
                const quantity = normalizeStockQuantity(item.quantity);

                const snapshots = await this.resolveStockSnapshots({
                    productId: item.productId,
                    quantity: item.quantity,
                    unitId: item.unitId,
                    warehouseId: item.sourceWarehouseId,
                    locationId: item.sourceLocationId,
                });

                const sourceStockFilter = {
                    productId: snapshots.product.productId,
                    warehouseId: toObjectId(item.sourceWarehouseId),
                    locationId: toObjectId(item.sourceLocationId) || null,
                    _isDeleted: { $ne: true },
                };
                const sourceStock = await this.stock.findOne(sourceStockFilter).lean() as any;
                const newSourceQuantity = normalizeStockQuantity(sourceStock.quantity - quantity);
                await this.stock.updateOne(
                    { _id: sourceStock._id },
                    { $set: { quantity: newSourceQuantity, updatedBy: actor } },
                );

                const destWarehouseSnapshot = await this.resolveWarehouseSnapshot(item.destWarehouseId);
                const destLocationSnapshot = await this.resolveLocationSnapshot(item.destLocationId, destWarehouseSnapshot.warehouseId);

                const destStockFilter = {
                    productId: snapshots.product.productId,
                    warehouseId: destWarehouseSnapshot.warehouseId,
                    locationId: destLocationSnapshot.locationId,
                    _isDeleted: { $ne: true },
                };
                const destStock = await this.stock.findOne(destStockFilter).lean() as any;
                let destWasNew = false;
                let destStockId = destStock?._id;

                if (destStock) {
                    await this.stock.updateOne(
                        { _id: destStock._id },
                        { $set: { quantity: normalizeStockQuantity(destStock.quantity + quantity), updatedBy: actor } },
                    );
                } else {
                    const created = await this.stock.create({
                        productId: snapshots.product.productId,
                        warehouseId: destWarehouseSnapshot.warehouseId,
                        locationId: destLocationSnapshot.locationId,
                        quantity: normalizeStockQuantity(quantity),
                        lockedQuantity: 0,
                        createdBy: actor,
                        updatedBy: actor,
                    });
                    destWasNew = true;
                    destStockId = created._id;
                }

                const sourceWarehouseSnapshot = await this.resolveWarehouseSnapshot(item.sourceWarehouseId);
                const sourceLocationSnapshot = await this.resolveLocationSnapshot(item.sourceLocationId, sourceWarehouseSnapshot.warehouseId);

                const ledgerDoc = await this.ledger.create({
                    ...snapshots.ledgerProduct,
                    changedAt: source.changedAt,
                    relatedOrderNo: source.sourceNo,
                    businessType: source.businessType,
                    direction: "transfer",
                    quantity,
                    outboundWarehouseId: sourceWarehouseSnapshot.warehouseId,
                    outboundWarehouseName: formatWarehouseName(
                        sourceWarehouseSnapshot.warehouseName,
                        sourceLocationSnapshot.locationName,
                    ),
                    outboundLocationId: sourceLocationSnapshot.locationId,
                    outboundLocationName: sourceLocationSnapshot.locationName,
                    inboundWarehouseId: destWarehouseSnapshot.warehouseId,
                    inboundWarehouseName: formatWarehouseName(
                        destWarehouseSnapshot.warehouseName,
                        destLocationSnapshot.locationName,
                    ),
                    inboundLocationId: destLocationSnapshot.locationId,
                    inboundLocationName: destLocationSnapshot.locationName,
                    sourceType: source.sourceType,
                    sourceId: toObjectId(source.sourceId),
                    sourceNo: source.sourceNo,
                    operator: source.operator || actor,
                    remark: source.remark || "",
                    createdBy: actor,
                    updatedBy: actor,
                });

                changes.push({
                    sourceStockId: sourceStock._id,
                    sourceQuantity: quantity,
                    destStockId,
                    destWasNew,
                    destQuantity: quantity,
                    ledgerId: ledgerDoc._id,
                });
            }
        } catch (err) {
            for (const change of changes) {
                try {
                    const sourceStock = await this.stock.findOne({ _id: change.sourceStockId }).lean() as any;
                    if (sourceStock) {
                        await this.stock.updateOne(
                            { _id: change.sourceStockId },
                            { $set: { quantity: normalizeStockQuantity(sourceStock.quantity + change.sourceQuantity), updatedBy: actor } },
                        );
                    }

                    if (change.destWasNew) {
                        await this.stock.deleteOne({ _id: change.destStockId });
                    } else {
                        const destStock = await this.stock.findOne({ _id: change.destStockId }).lean() as any;
                        if (destStock) {
                            await this.stock.updateOne(
                                { _id: change.destStockId },
                                { $set: { quantity: normalizeStockQuantity(destStock.quantity - change.destQuantity), updatedBy: actor } },
                            );
                        }
                    }

                    await this.ledger.deleteOne({ _id: change.ledgerId });
                } catch {
                    // 回滚失败时静默，避免掩盖原始错误
                }
            }
            throw err;
        }
    }

    async reverseTransfer(order: any, actor = "") {
        if (!isValidObjectId(order?._id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "调拨单ID格式错误");
        }

        for (const item of order.items || []) {
            const quantity = normalizeStockQuantity(item.quantity);
            if (quantity <= 0) continue;

            const productId = toObjectId(toText(item.productId));
            const sourceWarehouseId = toObjectId(toText(item.warehouseId)) || null;
            const sourceLocationId = toObjectId(toText(item.locationId)) || null;
            const destWarehouseId = toObjectId(toText(order.destWarehouseId)) || null;
            const destLocationId = toObjectId(toText(order.destLocationId)) || null;

            const sourceStock = await this.stock.findOne({
                productId,
                warehouseId: sourceWarehouseId,
                locationId: sourceLocationId,
                _isDeleted: { $ne: true },
            }).lean() as any;
            if (sourceStock) {
                await this.stock.updateOne(
                    { _id: sourceStock._id },
                    { $set: { quantity: normalizeStockQuantity(sourceStock.quantity + quantity), updatedBy: actor } },
                );
            }

            const destStock = await this.stock.findOne({
                productId,
                warehouseId: destWarehouseId,
                locationId: destLocationId,
                _isDeleted: { $ne: true },
            }).lean() as any;
            if (destStock) {
                await this.stock.updateOne(
                    { _id: destStock._id },
                    { $set: { quantity: normalizeStockQuantity(destStock.quantity - quantity), updatedBy: actor } },
                );
            }
        }

        await this.ledger.deleteMany({ sourceId: toObjectId(order._id.toString()) });
    }

    resolveWarehouseSnapshotPublic(warehouseId: string) {
        return this.resolveWarehouseSnapshot(warehouseId);
    }

    resolveLocationSnapshotPublic(locationId: string, warehouseId?: any) {
        return this.resolveLocationSnapshot(locationId, warehouseId);
    }

    async buildOutboundItemSnapshot(item: InventoryStockApplyItem, session?: mongoose.ClientSession) {
        const snapshots = await this.resolveStockSnapshots(item, session);

        return {
            ...snapshots.inboundProduct,
            ...snapshots.unit,
            ...snapshots.warehouse,
            ...snapshots.location,
            quantity: normalizeStockQuantity(item.quantity),
        };
    }

    async applyOutbound(
        items: InventoryStockApplyItem[],
        source: InventoryStockSource,
        actor = "",
        session?: mongoose.ClientSession,
        options: { preservePosition?: boolean } = {},
    ) {
        if (session) {
            await this.applyOutboundInTransaction(items, source, actor, session, options);
            return;
        }
        // 第一阶段：校验所有明细的库存充足性
        for (const item of items) {
            const quantity = normalizeStockQuantity(item.quantity);
            const lockedQuantity = normalizeStockQuantity(item.lockedQuantity || 0);
            if (quantity <= 0) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "出库数量必须大于0");
            }
            if (lockedQuantity < 0 || lockedQuantity > quantity) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "出库锁定数量不合法");
            }

            // 与执行阶段保持一致，通过 resolveStockSnapshots 解析实际的 locationId
            const snapshots = await this.resolveStockSnapshots(item, undefined, options);
            const stockFilter = {
                productId: snapshots.product.productId,
                warehouseId: snapshots.warehouse.warehouseId,
                locationId: snapshots.location.locationId,
                _isDeleted: { $ne: true },
            };
            const current = await this.stock.findOne(stockFilter).lean() as any;
            const warehouse = snapshots.warehouse;
            const stockQuantity = normalizeStockQuantity(current?.quantity || 0);
            const currentLockedQuantity = normalizeStockQuantity(current?.lockedQuantity || 0);
            const availableQuantity = warehouse.includeInAvailable
                ? normalizeStockQuantity(Math.max(stockQuantity - currentLockedQuantity, 0))
                : 0;
            if (lockedQuantity > 0) {
                const unlockedQuantity = normalizeStockQuantity(quantity - lockedQuantity);
                if (
                    !current ||
                    stockQuantity < quantity ||
                    currentLockedQuantity < lockedQuantity ||
                    availableQuantity < unlockedQuantity
                ) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "当前锁定库存不足，无法完成订单出库操作");
                }
                continue;
            }
            if (!current || availableQuantity < quantity) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "当前库存不足，无法完成出库操作");
            }
        }

        // 第二阶段：全部校验通过，执行扣减，记录变更用于回滚
        const changes: Array<{
            stockId: any;
            quantity: number;
            lockedQuantity: number;
            ledgerId: any;
        }> = [];

        try {
            for (const item of items) {
                const quantity = normalizeStockQuantity(item.quantity);
                const lockedQuantity = normalizeStockQuantity(item.lockedQuantity || 0);

                const snapshots = await this.resolveStockSnapshots(item, undefined, options);
                const stockFilter = {
                    productId: snapshots.product.productId,
                    warehouseId: snapshots.warehouse.warehouseId,
                    locationId: snapshots.location.locationId,
                    _isDeleted: { $ne: true },
                };
                const current = await this.stock.findOne(stockFilter).lean() as any;

                const newQuantity = normalizeStockQuantity(current.quantity - quantity);
                await this.stock.updateOne(
                    { _id: current._id },
                    {
                        $set: {
                            quantity: newQuantity,
                            lockedQuantity: normalizeStockQuantity((current.lockedQuantity || 0) - lockedQuantity),
                            updatedBy: actor,
                        },
                    },
                );

                const ledgerDoc = await this.ledger.create({
                    ...snapshots.ledgerProduct,
                    changedAt: source.changedAt,
                    relatedOrderNo: source.sourceNo,
                    businessType: source.businessType,
                    direction: "outbound",
                    quantity,
                    outboundWarehouseId: snapshots.warehouse.warehouseId,
                    outboundWarehouseName: formatWarehouseName(
                        snapshots.warehouse.warehouseName,
                        snapshots.location.locationName,
                    ),
                    outboundLocationId: snapshots.location.locationId,
                    outboundLocationName: snapshots.location.locationName,
                    sourceType: source.sourceType,
                    sourceId: toObjectId(source.sourceId),
                    sourceNo: source.sourceNo,
                    operator: source.operator || actor,
                    remark: source.remark || "",
                    createdBy: actor,
                    updatedBy: actor,
                });

                changes.push({
                    stockId: current._id,
                    quantity,
                    lockedQuantity,
                    ledgerId: ledgerDoc._id,
                });
            }
        } catch (err) {
            // 兜底回滚：反向恢复已处理的明细
            for (const change of changes) {
                try {
                    const stock = await this.stock.findOne({ _id: change.stockId }).lean() as any;
                    if (stock) {
                        await this.stock.updateOne(
                            { _id: change.stockId },
                            {
                                $set: {
                                    quantity: normalizeStockQuantity(stock.quantity + change.quantity),
                                    lockedQuantity: normalizeStockQuantity((stock.lockedQuantity || 0) + change.lockedQuantity),
                                    updatedBy: actor,
                                },
                            },
                        );
                    }
                    await this.ledger.deleteOne({ _id: change.ledgerId });
                } catch {
                    // 回滚失败时静默，避免掩盖原始错误
                }
            }
            throw err;
        }
    }

    private async applyOutboundInTransaction(
        items: InventoryStockApplyItem[],
        source: InventoryStockSource,
        actor: string,
        session: mongoose.ClientSession,
        options: { preservePosition?: boolean },
    ) {
        for (const item of items) {
            const quantity = normalizeStockQuantity(item.quantity);
            const lockedQuantity = normalizeStockQuantity(item.lockedQuantity || 0);
            if (!Number.isFinite(quantity) || quantity <= 0 || lockedQuantity < 0 || lockedQuantity > quantity) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "出库数量或锁定数量不合法");
            }
            const snapshots = await this.resolveStockSnapshots(item, session, options);
            const unlockedQuantity = normalizeStockQuantity(quantity - lockedQuantity);
            if (!snapshots.warehouse.includeInAvailable && unlockedQuantity > 0) {
                throwInventoryError(409, CODE.INVALID_PARAMS, "该仓库不计入可用库存，无法出库未锁定物料");
            }
            const stockFilter = {
                productId: snapshots.product.productId,
                warehouseId: snapshots.warehouse.warehouseId,
                locationId: snapshots.location.locationId,
                _isDeleted: { $ne: true },
            };
            const stock = await this.stock.findOne(stockFilter).session(session).lean() as any;
            const stockQuantity = normalizeStockQuantity(stock?.quantity);
            const stockLocked = normalizeStockQuantity(stock?.lockedQuantity);
            if (!stock || stockQuantity < quantity || stockLocked < lockedQuantity
                || normalizeStockQuantity(stockQuantity - stockLocked) < unlockedQuantity) {
                throwInventoryError(409, CODE.INVALID_PARAMS, "库存或锁定数量已变化，请刷新后重新出库");
            }
            const changed = await this.stock.updateOne({
                ...stockFilter, _id: stock._id, quantity: stock.quantity,
                lockedQuantity: stock.lockedQuantity === undefined ? { $exists: false } : stock.lockedQuantity,
            }, { $set: {
                quantity: normalizeStockQuantity(stockQuantity - quantity),
                lockedQuantity: normalizeStockQuantity(stockLocked - lockedQuantity),
                updatedBy: actor,
            } }, { session });
            if (changed.modifiedCount !== 1) throwInventoryError(409, CODE.INVALID_PARAMS, "库存或锁定数量已变化，请刷新后重新出库");
            await this.ledger.create([{
                ...snapshots.ledgerProduct,
                changedAt: source.changedAt,
                relatedOrderNo: source.sourceNo,
                businessType: source.businessType,
                direction: "outbound",
                quantity,
                outboundWarehouseId: snapshots.warehouse.warehouseId,
                outboundWarehouseName: formatWarehouseName(snapshots.warehouse.warehouseName, snapshots.location.locationName),
                outboundLocationId: snapshots.location.locationId,
                outboundLocationName: snapshots.location.locationName,
                sourceType: source.sourceType,
                sourceId: toObjectId(source.sourceId),
                sourceNo: source.sourceNo,
                operator: source.operator || actor,
                remark: source.remark || "",
                createdBy: actor,
                updatedBy: actor,
            }], { session });
        }
    }

    async reverseOutbound(items: InventoryStockApplyItem[], sourceId: string, actor = "", session?: mongoose.ClientSession) {
        if (!isValidObjectId(sourceId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "sourceId 格式错误");
        }
        if (session) {
            await this.reverseOutboundInTransaction(items, sourceId, actor, session);
            return;
        }

        const normalizedItems = items.map((item) => {
            const quantity = normalizeStockQuantity(item.quantity);
            const lockedQuantity = normalizeStockQuantity(item.lockedQuantity || 0);
            const productId = toObjectId(toText(item.productId));
            if (quantity <= 0) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "出库数量必须大于0");
            }
            if (lockedQuantity < 0 || lockedQuantity > quantity) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "出库锁定数量不合法");
            }

            return {
                productId,
                warehouseId: toObjectId(toText(item.warehouseId)) || null,
                locationId: toObjectId(toText(item.locationId)) || null,
                quantity,
                lockedQuantity,
            };
        });

        const changes: Array<{
            stockId: any;
            wasNew: boolean;
            quantity: number;
            lockedQuantity: number;
        }> = [];

        try {
            for (const item of normalizedItems) {
                const stockFilter = {
                    productId: item.productId,
                    warehouseId: item.warehouseId,
                    locationId: item.locationId,
                    _isDeleted: { $ne: true },
                };
                const current = await this.stock.findOne(stockFilter).lean() as any;

                if (current) {
                    await this.stock.updateOne(
                        { _id: current._id },
                        {
                            $set: {
                                quantity: normalizeStockQuantity(current.quantity + item.quantity),
                                lockedQuantity: normalizeStockQuantity((current.lockedQuantity || 0) + item.lockedQuantity),
                                updatedBy: actor,
                            },
                        },
                    );
                    changes.push({
                        stockId: current._id,
                        wasNew: false,
                        quantity: item.quantity,
                        lockedQuantity: item.lockedQuantity,
                    });
                } else {
                    const created = await this.stock.create({
                        productId: item.productId,
                        warehouseId: item.warehouseId,
                        locationId: item.locationId,
                        quantity: item.quantity,
                        lockedQuantity: item.lockedQuantity,
                        createdBy: actor,
                        updatedBy: actor,
                    });
                    changes.push({
                        stockId: created._id,
                        wasNew: true,
                        quantity: item.quantity,
                        lockedQuantity: item.lockedQuantity,
                    });
                }
            }

            await this.ledger.updateMany(
                {
                    sourceType: "outbound",
                    sourceId: toObjectId(sourceId),
                    _isDeleted: { $ne: true },
                },
                {
                    $set: {
                        _isDeleted: true,
                        deletedAt: new Date(),
                        deletedBy: actor,
                        updatedBy: actor,
                    },
                },
            );
        } catch (err) {
            for (const change of changes.reverse()) {
                try {
                    if (change.wasNew) {
                        await this.stock.deleteOne({ _id: change.stockId });
                        continue;
                    }

                    const stock = await this.stock.findOne({ _id: change.stockId }).lean() as any;
                    if (stock) {
                        await this.stock.updateOne(
                            { _id: change.stockId },
                            {
                                $set: {
                                    quantity: normalizeStockQuantity(stock.quantity - change.quantity),
                                    lockedQuantity: normalizeStockQuantity((stock.lockedQuantity || 0) - change.lockedQuantity),
                                    updatedBy: actor,
                                },
                            },
                        );
                    }
                } catch {
                    // 回滚失败时静默，避免掩盖原始错误
                }
            }
            throw err;
        }
    }

    private async reverseOutboundInTransaction(items: InventoryStockApplyItem[], sourceId: string, actor: string, session: mongoose.ClientSession) {
        for (const item of items) {
            const quantity = normalizeStockQuantity(item.quantity);
            const lockedQuantity = normalizeStockQuantity(item.lockedQuantity || 0);
            if (!Number.isFinite(Number(item.quantity)) || quantity <= 0 || lockedQuantity < 0 || lockedQuantity > quantity) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "撤销出库数量不合法");
            }
            const position = {
                productId: toObjectId(toText(item.productId)),
                warehouseId: toObjectId(toText(item.warehouseId)) || null,
                locationId: toObjectId(toText(item.locationId)) || null,
            };
            const stock = await this.stock.findOne({ ...position, _isDeleted: { $ne: true } }).session(session).lean() as any;
            if (stock) {
                const changed = await this.stock.updateOne({ _id: stock._id, quantity: stock.quantity,
                    lockedQuantity: stock.lockedQuantity === undefined ? { $exists: false } : stock.lockedQuantity,
                }, { $set: {
                    quantity: normalizeStockQuantity(Number(stock.quantity || 0) + quantity),
                    lockedQuantity: normalizeStockQuantity(Number(stock.lockedQuantity || 0) + lockedQuantity),
                    updatedBy: actor,
                } }, { session });
                if (changed.matchedCount !== 1) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "库存已变化，请重试撤销出库");
            } else {
                await this.stock.create([{ ...position, quantity, lockedQuantity, createdBy: actor, updatedBy: actor }], { session });
            }
        }
        await this.ledger.updateMany({ sourceType: "outbound", sourceId: toObjectId(sourceId), _isDeleted: { $ne: true } }, {
            $set: { _isDeleted: true, deletedAt: new Date(), deletedBy: actor, updatedBy: actor },
        }, { session });
    }

    async getAvailableQuantityMap(productIds: string[] = [], session?: mongoose.ClientSession) {
        const ids = [
            ...new Set(productIds.map((id) => toText(id)).filter((id) => isValidObjectId(id))),
        ];
        const availableQuantityMap = new Map(ids.map((id) => [id, 0]));
        if (!ids.length) return availableQuantityMap;

        const stockQuery = this.stock
            .find({
                productId: { $in: ids.map((id) => toObjectId(id)) },
                _isDeleted: { $ne: true },
            })
            .select("productId warehouseId quantity lockedQuantity")
            .lean();
        if (session) stockQuery.session(session);
        const stockRows = await stockQuery as any[];
        const warehouseIds = [
            ...new Set(
                stockRows
                    .map((row) => row.warehouseId?.toString?.() || "")
                    .filter(Boolean),
            ),
        ];
        let warehouses: any[] = [];
        if (warehouseIds.length) {
            const warehouseQuery = InventoryWarehouse.find({
                _id: { $in: warehouseIds.map((id) => toObjectId(id)) },
                _isDeleted: { $ne: true },
            }).select("_id includeInAvailable").lean();
            if (session) warehouseQuery.session(session);
            warehouses = await warehouseQuery as any[];
        }
        const warehouseAvailableMap = new Map(
            warehouses.map((warehouse) => [
                warehouse._id?.toString?.() || "",
                warehouse.includeInAvailable !== false,
            ]),
        );

        stockRows.forEach((row) => {
            const warehouseId = row.warehouseId?.toString?.() || "";
            if (warehouseId && warehouseAvailableMap.get(warehouseId) === false) return;

            const productId = row.productId?.toString?.() || "";
            const quantity = normalizeStockQuantity(row.quantity || 0);
            const lockedQuantity = normalizeStockQuantity(row.lockedQuantity || 0);
            const availableQuantity = normalizeStockQuantity(Math.max(quantity - lockedQuantity, 0));
            availableQuantityMap.set(
                productId,
                normalizeStockQuantity((availableQuantityMap.get(productId) || 0) + availableQuantity),
            );
        });

        return availableQuantityMap;
    }

    async lockSalesOrderProducts(
        products: any[],
        actor: string,
        session: mongoose.ClientSession,
    ) {
        const demandMap = new Map<string, number>();
        for (const product of products) {
            const productId = toText(product?.productId || product?._id || product?.id);
            if (!isValidObjectId(productId)) continue;

            const quantity = normalizeStockQuantity(product?.quantity || 0);
            if (quantity <= 0) continue;

            demandMap.set(productId, normalizeStockQuantity((demandMap.get(productId) || 0) + quantity));
        }
        if (!demandMap.size) return;

        const stockQuery = this.stock
            .find({
                productId: { $in: Array.from(demandMap.keys()).map((id) => toObjectId(id)) },
                _isDeleted: { $ne: true },
            })
            .sort({ createTime: 1 })
            .lean();
        stockQuery.session(session);
        const stockRows = await stockQuery as any[];

        const warehouseIds = [
            ...new Set(
                stockRows
                    .map((row) => row.warehouseId?.toString?.() || "")
                    .filter(Boolean),
            ),
        ];
        const warehouseQuery = warehouseIds.length
            ? InventoryWarehouse
                .find({ _id: { $in: warehouseIds.map((id) => toObjectId(id)) }, _isDeleted: { $ne: true } })
                .select("_id includeInAvailable")
                .lean()
            : null;
        if (warehouseQuery) warehouseQuery.session(session);
        const warehouses = warehouseQuery
            ? await warehouseQuery
            : [];
        const warehouseAvailableMap = new Map(
            (warehouses as any[]).map((warehouse) => [
                warehouse._id?.toString?.() || "",
                warehouse.includeInAvailable !== false,
            ]),
        );

        for (const row of stockRows) {
            const productId = row.productId?.toString?.() || "";
            const remainingQuantity = normalizeStockQuantity(demandMap.get(productId) || 0);
            if (remainingQuantity <= 0) continue;

            const warehouseId = row.warehouseId?.toString?.() || "";
            if (warehouseId && warehouseAvailableMap.get(warehouseId) === false) continue;

            const quantity = normalizeStockQuantity(row.quantity || 0);
            const lockedQuantity = normalizeStockQuantity(row.lockedQuantity || 0);
            const availableQuantity = normalizeStockQuantity(Math.max(quantity - lockedQuantity, 0));
            const nextLockedQuantity = normalizeStockQuantity(Math.min(availableQuantity, remainingQuantity));
            if (nextLockedQuantity <= 0) continue;

            await this.stock.updateOne(
                { _id: row._id },
                {
                    $inc: { lockedQuantity: nextLockedQuantity },
                    $set: { updatedBy: actor },
                },
                { session },
            );
            demandMap.set(productId, normalizeStockQuantity(remainingQuantity - nextLockedQuantity));
        }
    }

    async reverseInbound(
        items: InventoryStockApplyItem[],
        sourceId: string,
        actor = "",
        session?: mongoose.ClientSession,
    ) {
        const sessionOptions = session ? { session } : {};
        if (!isValidObjectId(sourceId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "sourceId 格式错误");
        }

        const itemMap = new Map<string, {
            productId: any;
            warehouseId: any;
            locationId: any;
            quantity: number;
            lockedQuantity: number;
        }>();
        for (const item of items) {
            const quantity = normalizeStockQuantity(item.quantity);
            const lockedQuantity = normalizeStockQuantity(item.lockedQuantity || 0);
            const productId = toObjectId(toText(item.productId));
            const warehouseId = toObjectId(toText(item.warehouseId)) || null;
            const locationId = toObjectId(toText(item.locationId)) || null;
            const key = [
                productId?.toString?.() || "",
                warehouseId?.toString?.() || "",
                locationId?.toString?.() || "",
            ].join(":");
            const current = itemMap.get(key);

            if (quantity <= 0) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "入库数量必须大于0");
            }
            if (lockedQuantity < 0 || lockedQuantity > quantity) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "入库锁定数量不合法");
            }

            itemMap.set(key, {
                productId,
                warehouseId,
                locationId,
                quantity: normalizeStockQuantity((current?.quantity || 0) + quantity),
                lockedQuantity: normalizeStockQuantity((current?.lockedQuantity || 0) + lockedQuantity),
            });
        }

        const normalizedItems = Array.from(itemMap.values());
        const stockRows: Array<{
            stock: any;
            quantity: number;
            lockedQuantity: number;
        }> = [];
        for (const item of normalizedItems) {
            const stockFilter = {
                productId: item.productId,
                warehouseId: item.warehouseId,
                locationId: item.locationId,
                _isDeleted: { $ne: true },
            };
            const currentQuery = this.stock.findOne(stockFilter).lean();
            if (session) currentQuery.session(session);
            const current = await currentQuery as any;
            const currentQuantity = normalizeStockQuantity(current?.quantity || 0);
            const currentLockedQuantity = normalizeStockQuantity(current?.lockedQuantity || 0);

            if (!current || currentQuantity < item.quantity) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "当前库存不足，无法删除入库单");
            }
            if (currentLockedQuantity < item.lockedQuantity) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "当前锁定库存不足，无法删除入库单");
            }
            if (normalizeStockQuantity(currentQuantity - item.quantity) < normalizeStockQuantity(currentLockedQuantity - item.lockedQuantity)) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "该库存已被其他业务锁定，请先解除关联后再冲销入库");
            }

            stockRows.push({
                stock: current,
                quantity: item.quantity,
                lockedQuantity: item.lockedQuantity,
            });
        }

        const changes: Array<{
            stockId: any;
            quantity: number;
            lockedQuantity: number;
        }> = [];

        try {
            for (const row of stockRows) {
                const changed = await this.stock.updateOne(
                    {
                        _id: row.stock._id, quantity: row.stock.quantity, _isDeleted: { $ne: true },
                        lockedQuantity: row.stock.lockedQuantity === undefined ? { $exists: false } : row.stock.lockedQuantity,
                    },
                    {
                        $set: {
                            quantity: normalizeStockQuantity(row.stock.quantity - row.quantity),
                            lockedQuantity: normalizeStockQuantity((row.stock.lockedQuantity || 0) - row.lockedQuantity),
                            updatedBy: actor,
                        },
                    },
                    sessionOptions,
                );
                if (changed.modifiedCount !== 1) {
                    throwInventoryError(409, CODE.INVENTORY_REFERENCED, "库存或锁定已变化，请刷新后重新冲销入库");
                }
                changes.push({
                    stockId: row.stock._id,
                    quantity: row.quantity,
                    lockedQuantity: row.lockedQuantity,
                });
            }

            await this.ledger.updateMany(
                {
                    sourceType: "inbound",
                    sourceId: toObjectId(sourceId),
                    _isDeleted: { $ne: true },
                },
                {
                    $set: {
                        _isDeleted: true,
                        deletedAt: new Date(),
                        deletedBy: actor,
                        updatedBy: actor,
                    },
                },
                sessionOptions,
            );
        } catch (err) {
            if (session) throw err;
            for (const change of changes.reverse()) {
                try {
                    const stockQuery = this.stock.findOne({ _id: change.stockId }).lean();
                    if (session) stockQuery.session(session);
                    const stock = await stockQuery as any;
                    if (stock) {
                        await this.stock.updateOne(
                            { _id: change.stockId },
                            {
                                $inc: { quantity: change.quantity, lockedQuantity: change.lockedQuantity },
                                $set: { updatedBy: actor },
                            },
                            sessionOptions,
                        );
                    }
                } catch {
                    // 回滚失败时静默，避免掩盖原始错误
                }
            }
            throw err;
        }
    }

    private async resolveStockSnapshots(
        item: InventoryStockApplyItem,
        session?: mongoose.ClientSession,
        options: { preservePosition?: boolean } = {},
    ) {
        if (!isValidObjectId(item.productId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
        }

        const productQuery = InventoryProduct
            .findOne({ _id: item.productId, _isDeleted: { $ne: true } })
            .lean();
        if (session) productQuery.session(session);
        const product = await productQuery as any;
        if (!product) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "产品不存在");
        }

        const unitId = toText(item.unitId || product.unitId);
        const warehouseId = toText(options.preservePosition ? item.warehouseId : item.warehouseId || product.warehouseId);
        let locationId = toText(options.preservePosition ? item.locationId : item.locationId || product.locationId);

        // 产品没有默认 locationId 时，从已有库存记录取（优先取有 locationId 的记录）
        if (!options.preservePosition && !locationId && warehouseId) {
            const existingStockQuery = this.stock.findOne({
                productId: product._id,
                warehouseId: toObjectId(warehouseId),
                locationId: { $ne: null },
                _isDeleted: { $ne: true },
            }).select("locationId").lean();
            if (session) existingStockQuery.session(session);
            const existingStock = await existingStockQuery as any;
            if (existingStock?.locationId) {
                locationId = existingStock.locationId.toString();
            }
        }
        const unitSnapshot = await this.resolveUnitSnapshot(unitId, product, session);
        const warehouseSnapshot = await this.resolveWarehouseSnapshot(warehouseId, session);
        const locationSnapshot = await this.resolveLocationSnapshot(
            locationId,
            warehouseSnapshot.warehouseId,
            session,
        );
        const baseProduct = {
            productId: product._id,
            productCode: product.code || "",
            productName: product.name || product.model || "",
            model: product.model || "",
        };

        return {
            product: {
                productId: product._id,
            },
            inboundProduct: {
                ...baseProduct,
                material: product.material || "",
                categoryId: product.categoryId || null,
                categoryName: product.categoryName || "",
                categoryPath: product.categoryPath || product.categoryName || "",
                image: product.image || "",
            },
            ledgerProduct: {
                ...baseProduct,
                ...unitSnapshot,
            },
            unit: unitSnapshot,
            warehouse: warehouseSnapshot,
            location: locationSnapshot,
        };
    }

    private async resolveUnitSnapshot(
        unitId: string,
        product: any,
        session?: mongoose.ClientSession,
    ) {
        if (!unitId) {
            return {
                unitId: product.unitId || null,
                unitCode: product.unitCode || "",
                unitName: product.unitName || "",
            };
        }
        if (!isValidObjectId(unitId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "unitId 格式错误");
        }

        const unitQuery = InventoryUnit.findOne({ _id: unitId, _isDeleted: { $ne: true } }).lean();
        if (session) unitQuery.session(session);
        const unit = await unitQuery as any;
        if (!unit) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "单位不存在");
        }

        return {
            unitId: unit._id,
            unitCode: unit.code || "",
            unitName: unit.name || "",
        };
    }

    private async resolveWarehouseSnapshot(
        warehouseId: string,
        session?: mongoose.ClientSession,
    ) {
        if (!warehouseId) {
            return {
                warehouseId: null,
                warehouseCode: "",
                warehouseName: "",
                includeInAvailable: true,
            };
        }
        if (!isValidObjectId(warehouseId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "warehouseId 格式错误");
        }

        const warehouseQuery = InventoryWarehouse
            .findOne({ _id: warehouseId, _isDeleted: { $ne: true } })
            .lean();
        if (session) warehouseQuery.session(session);
        const warehouse = await warehouseQuery as any;
        if (!warehouse) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "仓库不存在");
        }

        return {
            warehouseId: warehouse._id,
            warehouseCode: warehouse.code || "",
            warehouseName: warehouse.name || "",
            includeInAvailable: warehouse.includeInAvailable !== false,
        };
    }

    private async resolveLocationSnapshot(
        locationId: string,
        warehouseId?: any,
        session?: mongoose.ClientSession,
    ) {
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

        const locationQuery = InventoryLocation
            .findOne({ _id: locationId, _isDeleted: { $ne: true } })
            .lean();
        if (session) locationQuery.session(session);
        const location = await locationQuery as any;
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
            locationId: location._id,
            locationCode: location.code || "",
            locationName: locationName || location.name || "",
        };
    }

    private async buildStockFilter(options: StockListOptions, locationScopeIds: any[] | null = null) {
        const filter: Record<string, any> = {};
        if (!options.includeDeleted) {
            filter._isDeleted = { $ne: true };
        }

        let exactProductId = "";
        if (options.productId) {
            if (!isValidObjectId(options.productId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
            }
            exactProductId = options.productId;
            filter.productId = toObjectId(exactProductId);
        }

        if (Array.isArray(options.productIds)) {
            const requestedProductIds = options.productIds
                .map((id) => toText(id))
                .filter((id) => isValidObjectId(id));
            filter.productId = { $in: requestedProductIds.map((id) => toObjectId(id)) };
        }

        const productIds = await this.resolveFilteredProductIds(options);
        if (productIds) {
            if (exactProductId) {
                const hasMatchedProduct = productIds.some((id) => id?.toString?.() === exactProductId);
                if (!hasMatchedProduct) {
                    filter.productId = { $in: [] };
                }
            } else {
                filter.productId = { $in: productIds };
            }
        }

        if (options.warehouseId) {
            if (!isValidObjectId(options.warehouseId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "warehouseId 格式错误");
            }
            filter.warehouseId = toObjectId(options.warehouseId);
        }

        if (options.locationId) {
            if (!isValidObjectId(options.locationId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "locationId 格式错误");
            }
            filter.locationId = locationScopeIds
                ? { $in: locationScopeIds }
                : toObjectId(options.locationId);
        }

        return filter;
    }

    private async resolveLocationScope(options: StockListOptions) {
        if (
            !options.locationId
            || (!options.includeAssignedProducts && !options.includeDescendantLocations)
        ) {
            return null;
        }
        if (!isValidObjectId(options.locationId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "locationId 格式错误");
        }
        if (options.warehouseId && !isValidObjectId(options.warehouseId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "warehouseId 格式错误");
        }

        const selectedLocation = await InventoryLocation
            .findOne({ _id: options.locationId, _isDeleted: { $ne: true } })
            .select("_id warehouseId")
            .lean() as any;
        if (!selectedLocation) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "仓位不存在");
        }
        if (
            options.warehouseId
            && selectedLocation.warehouseId?.toString?.() !== options.warehouseId
        ) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "仓位不属于所选仓库");
        }

        const locationIds = new Set<string>([selectedLocation._id.toString()]);
        if (!options.includeDescendantLocations) {
            return Array.from(locationIds).map((id) => toObjectId(id));
        }

        const locations = await InventoryLocation
            .find({
                warehouseId: selectedLocation.warehouseId,
                _isDeleted: { $ne: true },
            })
            .select("_id parentId")
            .lean() as any[];
        let changed = true;

        while (changed) {
            changed = false;
            locations.forEach((location) => {
                const id = location._id?.toString?.() || "";
                const parentId = location.parentId?.toString?.() || "";
                if (parentId && locationIds.has(parentId) && !locationIds.has(id)) {
                    locationIds.add(id);
                    changed = true;
                }
            });
        }

        return Array.from(locationIds).map((id) => toObjectId(id));
    }

    private async mergeAssignedProducts(
        stockRows: any[],
        options: StockListOptions,
        locationScopeIds: any[] | null,
    ) {
        const productFilter: Record<string, any> = {
            _isDeleted: { $ne: true },
        };
        if (options.warehouseId) {
            productFilter.warehouseId = toObjectId(options.warehouseId);
        }
        if (locationScopeIds) {
            productFilter.locationId = { $in: locationScopeIds };
        }
        if (options.productId) {
            productFilter._id = toObjectId(options.productId);
        }
        if (Array.isArray(options.productIds)) {
            productFilter._id = {
                $in: options.productIds
                    .map((id) => toText(id))
                    .filter((id) => isValidObjectId(id))
                    .map((id) => toObjectId(id)),
            };
        }
        if (options.categoryId) {
            productFilter.categoryId = {
                $in: await this.getDescendantCategoryIds(options.categoryId),
            };
        }
        if (options.keyword) {
            const regex = new RegExp(escapeRegExp(options.keyword), "i");
            productFilter.$or = [
                { code: regex },
                { name: regex },
                { model: regex },
                { modelCode: regex },
                { material: regex },
                { categoryName: regex },
                { categoryPath: regex },
                { unitName: regex },
                { introduction: regex },
            ];
        }

        const products = await InventoryProduct
            .find(productFilter)
            .sort({ updateTime: -1, createTime: -1 })
            .lean() as any[];
        const stockMap = new Map<string, any>(
            stockRows.map((row) => [row.productId?.toString?.() || "", row]),
        );

        const assignedProductIds = new Set<string>();
        const assignedRows = products.map((product) => {
            const productId = product._id?.toString?.() || "";
            assignedProductIds.add(productId);
            const stock = stockMap.get(productId);
            const totalQuantity = normalizeStockQuantity(stock?.totalQuantity || 0);

            return {
                _id: productId,
                productId: product._id,
                productCode: product.code || "",
                productName: product.name || product.model || "",
                model: product.model || "",
                material: product.material || "",
                categoryId: product.categoryId || null,
                categoryCode: product.categoryCode || "",
                categoryName: product.categoryName || "",
                categoryPath: product.categoryPath || product.categoryName || "",
                image: product.image || "",
                averagePrice: product.averagePrice || 0,
                kitQuantity: product.kitQuantity || 1,
                stockUpperLimit: product.stockUpperLimit || 0,
                stockLowerLimit: product.stockLowerLimit || 0,
                introduction: product.introduction || "",
                unitId: product.unitId || null,
                unitCode: product.unitCode || "",
                unitName: product.unitName || "",
                warehouseId: product.warehouseId || null,
                warehouseCode: product.warehouseCode || "",
                warehouseName: product.warehouseName || "",
                locationId: product.locationId || null,
                locationCode: product.locationCode || "",
                locationName: product.locationName || "",
                totalQuantity,
                availableQuantity: normalizeStockQuantity(stock?.availableQuantity || 0),
                unavailableQuantity: normalizeStockQuantity(stock?.unavailableQuantity || 0),
                lockedQuantity: normalizeStockQuantity(stock?.lockedQuantity || 0),
                details: stock?.details || [],
                stockStatus: getStockWarningStatus({
                    totalQuantity,
                    stockLowerLimit: product.stockLowerLimit,
                    stockUpperLimit: product.stockUpperLimit,
                }),
            };
        });

        return [
            ...assignedRows,
            ...stockRows.filter((row) => !assignedProductIds.has(row.productId?.toString?.() || "")),
        ];
    }

    private async resolveFilteredProductIds(options: StockListOptions) {
        const productFilter: Record<string, any> = {};
        if (options.categoryId) {
            if (!isValidObjectId(options.categoryId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "categoryId 格式错误");
            }
            productFilter.categoryId = { $in: await this.getDescendantCategoryIds(options.categoryId) };
        }

        if (!Object.keys(productFilter).length) {
            return null;
        }

        productFilter._isDeleted = { $ne: true };
        const products = await InventoryProduct.find(productFilter).select("_id").lean() as any[];
        return products.map((product) => product._id);
    }

    private async groupStockRows(rows: any[]) {
        const productIds = [...new Set(rows.map((row) => row.productId?.toString?.()).filter(Boolean))];
        const warehouseIds = [...new Set(rows.map((row) => row.warehouseId?.toString?.()).filter(Boolean))];
        const locationIds = [...new Set(rows.map((row) => row.locationId?.toString?.()).filter(Boolean))];
        const [products, warehouses, locations] = await Promise.all([
            InventoryProduct.find({ _id: { $in: productIds }, _isDeleted: { $ne: true } }).lean(),
            InventoryWarehouse.find({ _id: { $in: warehouseIds }, _isDeleted: { $ne: true } }).lean(),
            InventoryLocation.find({ _id: { $in: locationIds }, _isDeleted: { $ne: true } }).lean(),
        ]);
        const productRows = products as any[];
        const warehouseRows = warehouses as any[];
        const locationRows = locations as any[];
        const productMap = new Map<string, any>(productRows.map((product) => [product._id.toString(), product]));
        const warehouseMap = new Map<string, any>(warehouseRows.map((warehouse) => [warehouse._id.toString(), warehouse]));
        const locationMap = new Map<string, any>(locationRows.map((location) => [location._id.toString(), location]));
        const locationNameMap = new Map(
            await Promise.all(
                locationRows.map(async (location) => [
                    location._id.toString(),
                    await getInventoryLocationPathName(location),
                ] as const),
            ),
        );
        const groups = new Map<string, any>();

        rows.forEach((row) => {
            const key = row.productId?.toString?.() || "";
            const product = productMap.get(key);
            if (!key || !product) return;

            if (!groups.has(key)) {
                groups.set(key, {
                    _id: key,
                    productId: row.productId,
                    productCode: product.code || "",
                    productName: product.name || product.model || "",
                    model: product.model || "",
                    material: product.material || "",
                    categoryId: product.categoryId || null,
                    categoryCode: product.categoryCode || "",
                    categoryName: product.categoryName || "",
                    categoryPath: product.categoryPath || product.categoryName || "",
                    image: product.image || "",
                    averagePrice: product.averagePrice || 0,
                    kitQuantity: product.kitQuantity || 1,
                    stockUpperLimit: product.stockUpperLimit || 0,
                    stockLowerLimit: product.stockLowerLimit || 0,
                    introduction: product.introduction || "",
                    unitId: product.unitId || null,
                    unitCode: product.unitCode || "",
                    unitName: product.unitName || "",
                    totalQuantity: 0,
                    availableQuantity: 0,
                    unavailableQuantity: 0,
                    lockedQuantity: 0,
                    details: [],
                });
            }

            const group = groups.get(key);
            const warehouse = row.warehouseId ? warehouseMap.get(row.warehouseId.toString()) : null;
            const location = row.locationId ? locationMap.get(row.locationId.toString()) : null;
            const locationName = location
                ? locationNameMap.get(location._id.toString()) || location.name || ""
                : "";
            const quantity = normalizeStockQuantity(row.quantity || 0);
            const lockedQuantity = normalizeStockQuantity(row.lockedQuantity || 0);
            const includeInAvailable = warehouse?.includeInAvailable !== false;
            const availableQuantity = includeInAvailable
                ? normalizeStockQuantity(Math.max(quantity - lockedQuantity, 0))
                : 0;
            const unavailableQuantity = includeInAvailable ? lockedQuantity : quantity;

            group.totalQuantity += quantity;
            group.availableQuantity += availableQuantity;
            group.unavailableQuantity += unavailableQuantity;
            group.lockedQuantity += lockedQuantity;
            group.details.push({
                _id: row._id,
                warehouseId: row.warehouseId || null,
                warehouseCode: warehouse?.code || "",
                warehouseName: warehouse?.name || "",
                locationId: row.locationId || null,
                locationCode: location?.code || "",
                locationName,
                includeInAvailable,
                quantity,
                totalQuantity: quantity,
                availableQuantity,
                unavailableQuantity,
                lockedQuantity,
                warehouseDisplayName: formatWarehouseName(warehouse?.name || "", locationName) || "--",
            });
        });

        return Array.from(groups.values()).map((row) => ({
            ...row,
            totalQuantity: normalizeStockQuantity(row.totalQuantity),
            availableQuantity: normalizeStockQuantity(row.availableQuantity),
            unavailableQuantity: normalizeStockQuantity(row.unavailableQuantity),
            lockedQuantity: normalizeStockQuantity(row.lockedQuantity),
            stockStatus: INVENTORY_STOCK_WARNING_STATUS.NORMAL as InventoryStockWarningStatus,
        })).map((row) => ({
            ...row,
            stockStatus: getStockWarningStatus({
                totalQuantity: row.totalQuantity,
                stockLowerLimit: row.stockLowerLimit,
                stockUpperLimit: row.stockUpperLimit,
            }),
        }));
    }

    private async appendInTransitSummary(rows: any[]) {
        const productIds = rows
            .map((row) => row.productId?.toString?.() || row._id?.toString?.() || "")
            .filter((id) => isValidObjectId(id));
        const uniqueProductIds = [...new Set(productIds)];
        if (!uniqueProductIds.length) {
            return rows;
        }

        const summaryMap = await getPurchaseInTransitSummaryMap(uniqueProductIds);

        return rows.map((row) => {
            const productId = row.productId?.toString?.() || row._id?.toString?.() || "";
            const summary = summaryMap.get(productId);
            if (!summary) {
                return {
                    ...row,
                    inTransitQuantity: 0,
                    allocatedInTransitQuantity: 0,
                };
            }

            return {
                ...row,
                inTransitQuantity: summary.inTransitQuantity,
                allocatedInTransitQuantity: summary.allocatedInTransitQuantity,
            };
        });
    }

    private filterStockRowsByKeyword(rows: any[], keyword?: string) {
        const text = toText(keyword).toLocaleLowerCase();
        if (!text) {
            return rows;
        }

        return rows.filter((row) => {
            const values = [
                row.productCode,
                row.productName,
                row.model,
                row.material,
                row.categoryName,
                row.categoryPath,
                row.unitName,
                row.introduction,
                ...(row.details || []).flatMap((detail: any) => [
                    detail.warehouseCode,
                    detail.warehouseName,
                    detail.locationCode,
                    detail.locationName,
                ]),
            ];

            return values.some((value) => String(value || "").toLocaleLowerCase().includes(text));
        });
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
}

export const useInventoryStockModel = () =>
    new InventoryStockModel(InventoryStock, InventoryStockLedger);
export { InventoryStock, InventoryStockLedger };
