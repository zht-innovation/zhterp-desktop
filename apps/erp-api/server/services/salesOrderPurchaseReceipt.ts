import mongoose from "mongoose";
import { PurchaseOrderAllocation } from "~~/server/models/purchaseOrderAllocation.model";
import { PurchaseRequestOrderAllocation } from "~~/server/models/purchaseRequestOrderAllocation.model";
import { PurchaseRequest } from "~~/server/models/purchaseRequest.model";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { CODE } from "~~/server/utils/code";
import { assertSalesOrderProductionReversalAllowed, lockSalesOrderForProduction } from "./salesOrderCompletionState";
import { getDirectPurchaseAllocationReceipts } from "./salesOrderProductionCompletionMath";
import { normalizeStockQuantity as qty } from "./inventoryStockMath";
import { throwInventoryError, toObjectId, toText } from "./inventory";

const id = (value: any) => toText(value?.toString?.() || value).toLowerCase();
const validQuantity = (value: unknown) => Number.isFinite(Number(value)) && Number(value) >= 0;

// 比较本次入库前后的 FIFO 到货归属，只锁本次实际影响的订单，避免共享采购单误伤已结清分配。
export const lockSalesOrdersForDirectPurchaseReceipt = async (
    purchaseOrderNo: string,
    items: any[],
    direction: "apply" | "reverse",
    actor: string,
    session?: mongoose.ClientSession,
): Promise<string[]> => {
    const orderNo = toText(purchaseOrderNo);
    if (!orderNo || !Array.isArray(items) || !items.length) return [];
    const productIds = [...new Set(items.map((item) => id(item.productId)))];
    const directQuery = PurchaseRequestOrderAllocation.find({
        purchaseOrderNo: orderNo, productId: { $in: productIds.map(toObjectId) }, requirementId: null,
    }).lean();
    if (session) directQuery.session(session);
    const direct = await directQuery as any[];
    if (!direct.length) return [];
    if (!session?.inTransaction()) throw new Error("关联生产采购分配的入库和冲销必须在 transaction 中执行");

    const purchase = await mongoose.connection.collection("purchaseorders").findOne({
        orderNo, _isDeleted: { $ne: true },
    }, { session });
    if (!purchase) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "直连采购分配的来源采购单不存在，请先核对");
    for (const allocation of direct) {
        if (id(allocation.purchaseOrderId) !== id(purchase._id) || !mongoose.isValidObjectId(allocation.purchaseRequestId)
            || !validQuantity(allocation.allocatedQuantity) || Number(allocation.allocatedQuantity) <= 0) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "直连采购分配的来源或数量异常，请先核对历史记录");
        }
    }

    const productSet = new Set(direct.map((row) => id(row.productId)));
    const beforeQuantities = new Map<string, number>();
    const documents = await mongoose.connection.collection("inventoryinbounds").find({
        type: "采购", purchaseOrderNo: orderNo, stockApplied: true, _isDeleted: { $ne: true },
    }, { session, projection: { items: 1 } }).toArray();
    for (const document of documents) {
        for (const item of Array.isArray(document.items) ? document.items : []) {
            const productId = id(item.productId);
            if (!productSet.has(productId)) continue;
            if (!validQuantity(item.quantity)) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "来源采购入库数量异常，请先核对历史记录");
            }
            beforeQuantities.set(productId, qty((beforeQuantities.get(productId) || 0) + Number(item.quantity)));
        }
    }
    const legacy = await PurchaseOrderAllocation.find({
        purchaseOrderId: purchase._id, productId: { $in: [...productSet].map(toObjectId) },
    }).session(session).lean() as any[];
    const beforeLegacy = new Map<string, number>();
    for (const allocation of legacy) {
        if (!validQuantity(allocation.lockedAfterInboundQuantity)) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购需求分配的到货数量异常，请先核对");
        }
        const productId = id(allocation.productId);
        beforeLegacy.set(productId, qty((beforeLegacy.get(productId) || 0) + Number(allocation.lockedAfterInboundQuantity)));
    }

    const afterQuantities = new Map(beforeQuantities);
    const afterLegacy = new Map(beforeLegacy);
    const sign = direction === "apply" ? 1 : -1;
    for (const item of items) {
        const productId = id(item.productId);
        if (!productSet.has(productId)) continue;
        if (!validQuantity(item.quantity) || !validQuantity(item.lockedQuantity || 0)
            || qty(item.lockedQuantity || 0) > qty(item.quantity)) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "本次采购入库数量或锁定数量无效");
        }
        const received = qty((afterQuantities.get(productId) || 0) + sign * Number(item.quantity));
        const fulfilled = qty((afterLegacy.get(productId) || 0) + sign * Number(item.lockedQuantity || 0));
        if (received < 0 || fulfilled < 0) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购到货或需求分配余额不足，无法冲销本次入库");
        }
        afterQuantities.set(productId, received);
        afterLegacy.set(productId, fulfilled);
    }
    const receipts = (quantities: Map<string, number>) => [...quantities].map(([productId, quantity]) => ({
        purchaseOrderId: purchase._id, productId, quantity,
    }));
    const legacyReceipts = (quantities: Map<string, number>) => [...quantities].map(([productId, lockedAfterInboundQuantity]) => ({
        purchaseOrderId: purchase._id, productId, lockedAfterInboundQuantity,
    }));
    const before = getDirectPurchaseAllocationReceipts(direct, receipts(beforeQuantities), legacyReceipts(beforeLegacy));
    const after = getDirectPurchaseAllocationReceipts(direct, receipts(afterQuantities), legacyReceipts(afterLegacy));
    const affected = direct.filter((allocation) => before.get(id(allocation._id)) !== after.get(id(allocation._id)));
    if (!affected.length) return [];

    const requestIds = [...new Set(affected.map((allocation) => id(allocation.purchaseRequestId)))];
    const requests = await PurchaseRequest.find({ _id: { $in: requestIds.map(toObjectId) } }).session(session).lean() as any[];
    const requestMap = new Map(requests.map((request) => [id(request._id), request]));
    const productionIds = [...new Set(requests.map((request) => id(request.productionOrderId)).filter(Boolean))];
    if (productionIds.some((productionId) => !mongoose.isValidObjectId(productionId))) {
        throwInventoryError(409, CODE.INVENTORY_REFERENCED, "生产采购申请的来源生产单 ID 无效，请先核对");
    }
    const productionOrders = productionIds.length ? await ProductionOrder.find({
        _id: { $in: productionIds.map(toObjectId) },
    }).session(session).lean() as any[] : [];
    const productionMap = new Map(productionOrders.map((production) => [id(production._id), production]));
    const ordersToLock = new Map<string, boolean>();
    for (const allocation of affected) {
        const request = requestMap.get(id(allocation.purchaseRequestId));
        const itemIndex = Number(allocation.purchaseRequestItemIndex);
        const item = request && Number.isInteger(itemIndex) && itemIndex >= 0 ? request.items?.[itemIndex] : null;
        if (!request || request.status !== "approved" || id(item?.productId) !== id(allocation.productId)) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "本次影响的采购分配缺少有效的已审批申请或产品明细，请先核对");
        }
        if (request.productionOrderId) {
            const production = productionMap.get(id(request.productionOrderId));
            if (!production || (production.sourceType === "order" && !mongoose.isValidObjectId(production.salesOrderId))
                || (request.salesOrderId && id(request.salesOrderId) !== id(production.salesOrderId))) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "本次影响的生产采购申请无法追溯至来源生产单及销售订单");
            }
            if (production.salesOrderId) ordersToLock.set(id(production.salesOrderId), true);
        } else if (toText(request.productionOrderNo)) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "生产采购申请缺少来源生产单关联，请先核对历史记录");
        } else if (request.salesOrderId) {
            if (!mongoose.isValidObjectId(request.salesOrderId)) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购申请的销售订单来源无效，请先核对");
            }
            const salesOrderId = id(request.salesOrderId);
            if (!ordersToLock.has(salesOrderId)) ordersToLock.set(salesOrderId, false);
        } else if (toText(request.salesOrderNo) || toText(allocation.salesOrderNo)) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "直连采购分配存在订单号但缺少来源订单关联，请先核对历史记录");
        }
    }
    for (const salesOrderId of [...ordersToLock.keys()].sort()) {
        if (direction === "reverse") await assertSalesOrderProductionReversalAllowed(salesOrderId, session);
        await lockSalesOrderForProduction(salesOrderId, actor, session, { requireCompletion: ordersToLock.get(salesOrderId) });
    }
    return [...ordersToLock.keys()];
};
