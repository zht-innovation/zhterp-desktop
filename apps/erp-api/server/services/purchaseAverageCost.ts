import mongoose from "mongoose";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import {
    ProductAverageCostEvent,
    ProductAverageCostState,
    PurchaseAverageCostOrder,
} from "~~/server/models/purchaseAverageCost.model";
import { CODE } from "~~/server/utils/code";
import { isValidObjectId, throwInventoryError, toObjectId, toText } from "~~/server/services/inventory";
import { replayPurchaseAveragePrices, type PurchaseAverageCostMathEvent } from "./purchaseAverageCostMath";
import { calculatePurchaseItemAmount } from "~~/shared/utils/purchaseOrderAmount";

type CostOrder = { _id: any; orderNo?: string; items: readonly any[] };
type LockedProduct = { product: any; state: any };

let readyPromise: Promise<void> | undefined;

// 调用方在开启事务前等待；不在事务内隐式建集合或索引。
export const ensurePurchaseAverageCostReady = (): Promise<void> => {
    if (!readyPromise) {
        readyPromise = (async () => {
            for (const model of [PurchaseAverageCostOrder, ProductAverageCostState, ProductAverageCostEvent]) {
                await model.createCollection();
                await model.createIndexes();
            }
        })().catch((error) => {
            readyPromise = undefined;
            throw error;
        });
    }
    return readyPromise;
};

const validAveragePrice = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

const lockProducts = async (
    productIds: string[],
    session: mongoose.ClientSession,
    replacementBaseline?: number,
): Promise<Map<string, LockedProduct>> => {
    const locked = new Map<string, LockedProduct>();
    const sortedIds = [...new Set(productIds)].sort();
    for (const productId of sortedIds) {
        if (!isValidObjectId(productId)) throwInventoryError(400, CODE.INVALID_PARAMS, "计价产品无效");
        const product = await InventoryProduct.findById(productId).session(session).lean() as any;
        if (!product) throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "计价产品不存在");
        const averagePrice = product.averagePrice ?? 0;
        if (!validAveragePrice(averagePrice) && replacementBaseline === undefined) {
            throwInventoryError(400, CODE.INVALID_PARAMS, `产品「${product.code || productId}」原平均价无效`);
        }
        let state: any;
        try {
            state = await ProductAverageCostState.findOneAndUpdate(
                { _id: toObjectId(productId) },
                {
                    $inc: { revision: 1 },
                    // 人工修正旧非法均价时，首次状态以合法新值为基线；已有基线不覆盖。
                    $setOnInsert: { baselineAveragePrice: validAveragePrice(averagePrice) ? averagePrice : replacementBaseline, lastSequence: 0 },
                },
                { upsert: true, new: true, session, setDefaultsOnInsert: false },
            ).lean();
        } catch (error: any) {
            if (error?.code === 11000) {
                throwInventoryError(409, CODE.INVALID_PARAMS, "产品成本正在更新，请重新保存");
            }
            throw error;
        }
        locked.set(productId, { product, state });
    }
    return locked;
};

const nextSequence = async (locked: LockedProduct, session: mongoose.ClientSession): Promise<number> => {
    const sequence = Number(locked.state.lastSequence) + 1;
    if (!Number.isSafeInteger(sequence)) throwInventoryError(400, CODE.INVALID_PARAMS, "计价顺序超出允许范围");
    await ProductAverageCostState.updateOne({ _id: locked.state._id }, { $set: { lastSequence: sequence } }, { session });
    locked.state.lastSequence = sequence;
    return sequence;
};

const replayProduct = async (productId: string, locked: LockedProduct, actor: string, session: mongoose.ClientSession) => {
    const events = await ProductAverageCostEvent.find({ productId: toObjectId(productId) })
        .sort({ sequence: 1 }).session(session).lean() as any[];
    const averagePrice = replayPurchaseAveragePrices(
        locked.state.baselineAveragePrice,
        events as PurchaseAverageCostMathEvent[],
    );
    if (averagePrice === null) {
        throwInventoryError(400, CODE.INVALID_PARAMS, `产品「${locked.product.code || productId}」平均价超出允许范围`);
    }
    if (averagePrice !== Number(locked.product.averagePrice ?? 0)) {
        await InventoryProduct.updateOne({ _id: toObjectId(productId) }, {
            $set: { averagePrice, updatedBy: actor },
        }, { session });
    }
};

const getStockQuantity = async (productId: string, session: mongoose.ClientSession): Promise<number> => {
    const rows = await InventoryStock.find({ productId: toObjectId(productId), _isDeleted: { $ne: true } })
        .select("quantity").session(session).lean() as any[];
    let scaledTotal = 0n;
    for (const row of rows) {
        const quantity = Number(row.quantity ?? 0);
        if (!Number.isFinite(quantity) || quantity < 0) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "产品库存数量无效，无法计算平均价");
        }
        const scaled = Number(quantity.toFixed(3).replace(".", ""));
        if (!Number.isSafeInteger(scaled)) throwInventoryError(400, CODE.INVALID_PARAMS, "产品库存数量超出允许范围");
        scaledTotal += BigInt(scaled);
    }
    if (scaledTotal > BigInt(Number.MAX_SAFE_INTEGER)) throwInventoryError(400, CODE.INVALID_PARAMS, "产品库存总量超出允许范围");
    const total = Number(scaledTotal) / 1000;
    if (Number(total.toFixed(3).replace(".", "")) !== Number(scaledTotal)) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "产品库存总量超出允许精度");
    }
    return total;
};

export const registerPurchaseAverageCost = async (order: CostOrder, actor: string, session: mongoose.ClientSession): Promise<void> => {
    const exists = await PurchaseAverageCostOrder.exists({ _id: order._id }).session(session);
    if (!exists) await PurchaseAverageCostOrder.create([{ _id: order._id, version: 1, active: true }], { session });
    await syncPurchaseAverageCost(order, actor, session);
};

export const syncPurchaseAverageCost = async (order: CostOrder, actor: string, session: mongoose.ClientSession): Promise<void> => {
    const participation = await PurchaseAverageCostOrder.exists({ _id: order._id, active: true }).session(session);
    if (!participation) return;
    const previous = await ProductAverageCostEvent.find({ purchaseOrderId: order._id, kind: "purchase" })
        .session(session).lean() as any[];
    const previousByProduct = new Map(previous.map((event) => [String(event.productId), event]));
    const nextByProduct = new Map<string, { quantity: number; unitPrice: number; totalAmount: number }>();
    for (const item of order.items) {
        const productId = toText(item.productId);
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unitPrice);
        const totalAmount = calculatePurchaseItemAmount(quantity, item.unitPrice);
        if (totalAmount === null || Number(quantity.toFixed(3)) !== quantity || nextByProduct.has(productId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "采购计价明细无效");
        }
        nextByProduct.set(productId, { quantity, unitPrice, totalAmount });
    }
    const changedIds = new Set<string>();
    for (const [productId, item] of nextByProduct) {
        const old = previousByProduct.get(productId);
        if (!old || !old.active || old.quantity !== item.quantity || old.unitPrice !== item.unitPrice || old.totalAmount !== item.totalAmount) {
            changedIds.add(productId);
        }
    }
    for (const old of previous) {
        if (old.active && !nextByProduct.has(String(old.productId))) changedIds.add(String(old.productId));
    }
    if (!changedIds.size) return;
    const lockedProducts = await lockProducts([...changedIds], session);
    for (const productId of [...changedIds].sort()) {
        const locked = lockedProducts.get(productId)!;
        const old = previousByProduct.get(productId);
        const item = nextByProduct.get(productId);
        if (!item) {
            await ProductAverageCostEvent.updateOne({ _id: old._id }, { $set: { active: false, updatedBy: actor } }, { session });
        } else if (old) {
            await ProductAverageCostEvent.updateOne({ _id: old._id }, {
                $set: { ...item, active: true, updatedBy: actor },
            }, { session });
        } else {
            const standardPrice = Number(locked.product.standardPrice ?? 0);
            if (!Number.isFinite(standardPrice)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "产品标准价无效，无法计算平均价");
            }
            await ProductAverageCostEvent.create([{
                productId: toObjectId(productId), purchaseOrderId: order._id, purchaseOrderNo: order.orderNo || "",
                kind: "purchase", active: true, sequence: await nextSequence(locked, session),
                stockQuantity: await getStockQuantity(productId, session), standardPriceZero: standardPrice === 0,
                ...item, createdBy: actor, updatedBy: actor,
            }], { session });
        }
        await replayProduct(productId, locked, actor, session);
    }
};

export const removePurchaseAverageCost = async (orderIds: string[], actor: string, session: mongoose.ClientSession): Promise<void> => {
    const markers = await PurchaseAverageCostOrder.find({ _id: { $in: orderIds }, active: true }).session(session).lean() as any[];
    if (!markers.length) return;
    const markerIds = markers.map((marker) => marker._id);
    const events = await ProductAverageCostEvent.find({ purchaseOrderId: { $in: markerIds }, kind: "purchase", active: true })
        .session(session).lean() as any[];
    const productIds = [...new Set(events.map((event) => String(event.productId)))].sort();
    const lockedProducts = await lockProducts(productIds, session);
    await ProductAverageCostEvent.updateMany({ purchaseOrderId: { $in: markerIds }, kind: "purchase", active: true }, {
        $set: { active: false, updatedBy: actor },
    }, { session });
    await PurchaseAverageCostOrder.updateMany({ _id: { $in: markerIds } }, { $set: { active: false } }, { session });
    for (const productId of productIds) await replayProduct(productId, lockedProducts.get(productId)!, actor, session);
};

export const resetProductAverageCost = async (productId: string, value: number, actor: string, session: mongoose.ClientSession): Promise<void> => {
    if (!validAveragePrice(value)) throwInventoryError(400, CODE.INVALID_PARAMS, "平均价必须是允许范围内的非负有效数字");
    const locked = (await lockProducts([productId], session, value)).get(productId)!;
    if (Number(locked.product.averagePrice ?? 0) === value) return;
    await ProductAverageCostEvent.create([{
        productId: toObjectId(productId), kind: "reset", sequence: await nextSequence(locked, session),
        active: true, averagePrice: value, createdBy: actor, updatedBy: actor,
    }], { session });
    await InventoryProduct.updateOne({ _id: toObjectId(productId) }, {
        $set: { averagePrice: value, updatedBy: actor },
    }, { session });
};
