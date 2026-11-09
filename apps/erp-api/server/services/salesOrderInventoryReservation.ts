import mongoose from "mongoose";
import { InventoryWarehouse } from "~~/server/models/inventoryBase.model";
import { InventoryBom } from "~~/server/models/inventoryBom.model";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { normalizeStockQuantity } from "~~/server/services/inventoryStockMath";
import { isValidObjectId, toObjectId, toText } from "~~/server/services/inventory";
import { logger } from "~~/server/utils/logger";

type ReservationDraft = {
    salesOrderId: string;
    salesOrderNo: string;
    salesOrderStatusSnapshot: string;
    salesperson: string;
    orderType: string;
    dispatchDate: string | Date | null;
    durationText: string;
    productId: string;
    demandProductId: string;
    requiredQuantity: number;
    availableQuantityAtAnalysis: number;
    shortageQuantity: number;
    demandType: "purchase";
    suggestion: "需要采购";
};

type ReservationDemand = {
    productId: string;
    requiredQuantity: number;
    demandType: "finished-product" | "production-material";
};

const addQuantity = (map: Map<string, number>, id: string, quantity: number) => {
    if (!isValidObjectId(id) || quantity <= 0) return;
    map.set(id, normalizeStockQuantity((map.get(id) || 0) + quantity));
};

export const reserveInventoryForSalesOrder = async (
    salesOrder: any,
    actor: string,
    session: mongoose.ClientSession,
    options: { allowReleasedHistory?: boolean } = {},
) => {
    const salesOrderId = salesOrder._id?.toString?.() || "";
    const salesOrderNo = toText(salesOrder.orderNo);
    // 只有仓库复核完成且已安全释放本单旧占用后，才允许保留 released 历史重新占用。
    const reservationFilter: Record<string, any> = { salesOrderId: toObjectId(salesOrderId) };
    if (options.allowReleasedHistory === true) {
        reservationFilter.$or = [
            { status: { $ne: "released" } },
            { consumedQuantity: { $gt: 0 } },
            { productionAllocatedQuantity: { $gt: 0 } },
            { $expr: { $gt: ["$reservedQuantity", { $ifNull: ["$releasedQuantity", 0] }] } },
        ];
    }
    const existing = await SalesOrderStockReservation.exists(reservationFilter).session(session);
    if (existing) throw new Error("当前销售订单已存在库存预占，不能重复终审");

    const warehouseRows = await InventoryWarehouse.find({
        _isDeleted: { $ne: true },
        includeInAvailable: { $ne: false },
    }).select("_id").session(session).lean() as any[];
    const availableWarehouseIds = new Set(warehouseRows.map((row) => row._id.toString()));
    const demands = new Map<string, ReservationDemand>();
    const recordDemand = (productId: string, quantity: number, demandType: ReservationDemand["demandType"]) => {
        const key = `${demandType}:${productId}`;
        const previous = demands.get(key);
        demands.set(key, {
            productId, demandType,
            requiredQuantity: normalizeStockQuantity((previous?.requiredQuantity || 0) + quantity),
        });
    };

    const reserveProduct = async (
        stockProductId: string,
        demandProductId: string,
        requiredQuantity: number,
        reservationType: "finished-product" | "production-material",
    ) => {
        let remaining = normalizeStockQuantity(requiredQuantity);
        let reserved = 0;
        logger.info(`[库存预占][开始] ${JSON.stringify({
            salesOrderId,
            salesOrderNo,
            stockProductId,
            demandProductId,
            reservationType,
            requiredQuantity,
        })}`);
        const rows = await InventoryStock.find({
            productId: toObjectId(stockProductId),
            warehouseId: { $in: [...availableWarehouseIds].map((id) => toObjectId(id)) },
            _isDeleted: { $ne: true },
        }).sort({ createTime: 1, _id: 1 }).session(session).lean() as any[];

        for (const row of rows) {
            if (remaining <= 0) break;
            const available = normalizeStockQuantity(
                Math.max(Number(row.quantity || 0) - Number(row.lockedQuantity || 0), 0),
            );
            const quantity = Math.min(available, remaining);
            const originalLockedQuantity = normalizeStockQuantity(row.lockedQuantity || 0);
            logger.info(`[库存预占][仓位计算] ${JSON.stringify({
                salesOrderNo,
                stockProductId,
                warehouseId: row.warehouseId?.toString?.() || "",
                locationId: row.locationId?.toString?.() || "",
                stockQuantity: normalizeStockQuantity(row.quantity || 0),
                originalLockedQuantity,
                availableQuantity: available,
                remainingDemandQuantity: remaining,
                currentReservedQuantity: quantity,
                newLockedQuantity: normalizeStockQuantity(originalLockedQuantity + quantity),
                newAvailableQuantity: normalizeStockQuantity(Math.max(available - quantity, 0)),
            })}`);
            if (quantity <= 0) continue;
            const result = await InventoryStock.updateOne(
                {
                    _id: row._id,
                    $expr: {
                        $gte: [
                            { $subtract: ["$quantity", "$lockedQuantity"] },
                            quantity,
                        ],
                    },
                },
                { $inc: { lockedQuantity: quantity }, $set: { updatedBy: actor } },
                { session },
            );
            if (result.modifiedCount !== 1) {
                logger.warn(`[库存预占][原子更新失败] ${JSON.stringify({
                    salesOrderId,
                    salesOrderNo,
                    stockProductId,
                    warehouseId: row.warehouseId?.toString?.() || "",
                    locationId: row.locationId?.toString?.() || "",
                    plannedReservedQuantity: quantity,
                })}`);
                throw new mongoose.mongo.MongoServerError({
                    message: "库存已被其他订单占用，请重试",
                    code: 112,
                });
            }
            await SalesOrderStockReservation.create([{
                salesOrderId: toObjectId(salesOrderId),
                salesOrderNo,
                demandProductId: toObjectId(demandProductId),
                stockProductId: toObjectId(stockProductId),
                warehouseId: row.warehouseId || null,
                locationId: row.locationId || null,
                reservationType,
                requiredQuantity,
                reservedQuantity: quantity,
                createdBy: actor,
                updatedBy: actor,
            }], { session });
            reserved = normalizeStockQuantity(reserved + quantity);
            remaining = normalizeStockQuantity(remaining - quantity);
        }
        logger.info(`[库存预占][产品汇总] ${JSON.stringify({
            salesOrderId,
            salesOrderNo,
            stockProductId,
            demandProductId,
            reservationType,
            requiredQuantity,
            reservedQuantity: reserved,
            shortageQuantity: remaining,
        })}`);
        return { reserved, shortage: remaining };
    };

    const rootDemand = new Map<string, number>();
    for (const product of Array.isArray(salesOrder.products) ? salesOrder.products : []) {
        addQuantity(
            rootDemand,
            toText(product?.productId || product?._id || product?.id),
            Number(product?.quantity || 0),
        );
    }

    const leafDemand = new Map<string, number>();
    const expand = async (productId: string, quantity: number, rootProductId: string, depth = 0): Promise<void> => {
        if (depth >= 20) throw new Error("BOM 层级超过 20 层或存在循环引用");
        const bom = await InventoryBom.findOne({
            productId: toObjectId(productId),
            isEnabled: true,
            _isDeleted: { $ne: true },
        }).select("items").session(session).lean() as any;
        if (!Array.isArray(bom?.items) || !bom.items.length) {
            const key = `${rootProductId}:${productId}`;
            leafDemand.set(key, normalizeStockQuantity((leafDemand.get(key) || 0) + quantity));
            return;
        }
        let shortageQuantity = quantity;
        if (depth > 0) {
            recordDemand(productId, quantity, "production-material");
            const result = await reserveProduct(productId, rootProductId, quantity, "production-material");
            shortageQuantity = result.shortage;
        }
        if (shortageQuantity <= 0) return;
        for (const item of bom.items) {
            const childId = item.productId?.toString?.() || "";
            await expand(childId, normalizeStockQuantity(shortageQuantity * Number(item.quantity || 0)), rootProductId, depth + 1);
        }
    };

    const rootShortages = new Map<string, number>();
    // 先预占所有销售项成品，避免前一销售项的 BOM 部件占用后一销售项的成品库存。
    for (const [productId, quantity] of rootDemand) {
        recordDemand(productId, quantity, "finished-product");
        const result = await reserveProduct(productId, productId, quantity, "finished-product");
        if (result.shortage > 0) rootShortages.set(productId, result.shortage);
    }
    for (const [productId, shortageQuantity] of rootShortages) {
        await expand(productId, shortageQuantity, productId);
    }

    const drafts: ReservationDraft[] = [];
    for (const [key, requiredQuantity] of leafDemand) {
        const [demandProductId, productId] = key.split(":");
        // 订单项自身无 BOM 下级（配件/单品直采）时，入库预占应计入成品齐套，
        // 使采购完成后订单直接进入待出库。
        const reservationType = demandProductId === productId
            ? "finished-product"
            : "production-material";
        if (demandProductId !== productId) recordDemand(productId, requiredQuantity, "production-material");
        const result = await reserveProduct(productId, demandProductId, requiredQuantity, reservationType);
        if (result.shortage <= 0) continue;
        drafts.push({
            salesOrderId,
            salesOrderNo,
            salesOrderStatusSnapshot: toText(salesOrder.status),
            salesperson: toText(salesOrder.salespersonName || salesOrder.creator),
            orderType: toText(salesOrder.orderType),
            dispatchDate: salesOrder.orderDate || null,
            durationText: toText(salesOrder.durationText),
            productId,
            demandProductId,
            requiredQuantity,
            availableQuantityAtAnalysis: result.reserved,
            shortageQuantity: result.shortage,
            demandType: "purchase",
            suggestion: "需要采购",
        });
    }
    return { requirements: drafts, demands: [...demands.values()] };
};
