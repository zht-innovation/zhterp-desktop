import mongoose from "mongoose";
import type { ExecutionPurchaseOrderReceipt, ExecutionPurchaseReceiptState } from "~~/shared/types/production-execution";
import { PurchaseMaterialRequirement } from "~~/server/models/purchaseMaterialRequirement.model";
import { PurchaseOrderAllocation } from "~~/server/models/purchaseOrderAllocation.model";
import { PurchaseOrder } from "~~/server/models/purchaseOrder.model";
import { PurchaseRequest } from "~~/server/models/purchaseRequest.model";
import { PurchaseRequestOrderAllocation } from "~~/server/models/purchaseRequestOrderAllocation.model";
import { InventoryInbound } from "~~/server/models/inventoryInbound.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { toObjectId, toText, throwInventoryError } from "./inventory";
import { getPurchaseOrderReceipt } from "./productionPurchaseReceiptMath";
import { CODE } from "~~/server/utils/code";

const id = (value: any) => toText(value?.toString?.() || value).toLowerCase();
const withSession = (query: any, session?: mongoose.ClientSession) => session ? query.session(session) : query;
const validQuantity = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0;

interface PurchaseLink {
    orderNo: string;
    productIds: Set<string>;
}

// 预览和实际出库共用；不把采购条件写入 executable，以免阻断撤销、退料和完工。
export const buildProductionPurchaseReceiptMap = async (
    orders: any[],
    session?: mongoose.ClientSession,
): Promise<Map<string, ExecutionPurchaseReceiptState>> => {
    const result = new Map<string, ExecutionPurchaseReceiptState>();
    const links = new Map<string, Map<string, PurchaseLink>>();
    const reasons = new Map<string, Set<string>>();
    const sourceReasons = new Map<string, Set<string>>();
    const scopes = new Map<string, any[]>();
    const salesOrderIds = new Set<string>();
    const materialIds = new Set<string>();
    const orderById = new Map(orders.map((order) => [id(order._id), order]));
    const orderByNumber = new Map(orders.map((order) => [toText(order.documentNo), order]));
    const block = (order: any, reason: string) => {
        reasons.get(id(order._id))!.add(reason);
        sourceReasons.get(id(order._id))!.add(reason);
    };
    const linkPurchase = (order: any, allocation: any) => {
        const label = toText(allocation.purchaseOrderNo) || id(allocation.purchaseOrderId) || "未知采购单";
        if (!mongoose.isValidObjectId(allocation.purchaseOrderId) || !toText(allocation.purchaseOrderNo)
            || !mongoose.isValidObjectId(allocation.productId) || !validQuantity(allocation.allocatedQuantity)) {
            block(order, `采购分配 ${label} 的来源或数量无效，请先核对。`);
            return;
        }
        const purchases = links.get(id(order._id))!;
        const purchaseId = id(allocation.purchaseOrderId);
        const previous = purchases.get(purchaseId);
        if (previous && previous.orderNo !== toText(allocation.purchaseOrderNo)) {
            block(order, `采购分配 ${label} 的单号与来源不一致，请先核对。`);
        }
        if (!previous) purchases.set(purchaseId, { orderNo: toText(allocation.purchaseOrderNo), productIds: new Set() });
        purchases.get(purchaseId)!.productIds.add(id(allocation.productId));
    };

    for (const order of orders) {
        const orderId = id(order._id);
        result.set(orderId, { purchaseReceiptReady: true, purchaseReceiptBlockReason: "", purchaseSourceValid: true,
            purchaseSourceBlockReason: "", relatedPurchaseOrders: [] });
        links.set(orderId, new Map());
        reasons.set(orderId, new Set());
        sourceReasons.set(orderId, new Set());
        if (order.sourceType !== "order" || !mongoose.isValidObjectId(order.salesOrderId)) continue;
        salesOrderIds.add(id(order.salesOrderId));
        for (const material of order.bomMaterials || []) {
            if (!mongoose.isValidObjectId(material.productId)) continue;
            const productId = id(material.productId);
            materialIds.add(productId);
            const key = `${id(order.salesOrderId)}:${productId}`;
            if (!scopes.has(key)) scopes.set(key, []);
            if (!scopes.get(key)!.includes(order)) scopes.get(key)!.push(order);
        }
    }
    if (!orders.length) return result;

    // 先发现分配再校验需求，不提前过滤已完成采购或缺失来源，避免误判为无采购关联。
    const allocations = scopes.size ? await withSession(PurchaseOrderAllocation.find({
        salesOrderId: { $in: [...salesOrderIds].map(toObjectId) },
        productId: { $in: [...materialIds].map(toObjectId) },
    }).lean(), session) as any[] : [];
    const requirementIds = [...new Set(allocations.map((row) => id(row.requirementId)).filter(mongoose.isValidObjectId))];
    const requirements = requirementIds.length ? await withSession(PurchaseMaterialRequirement.find({
        _id: { $in: requirementIds.map(toObjectId) },
    }).select("salesOrderId demandProductId productId _isDeleted").lean(), session) as any[] : [];
    const requirementMap = new Map(requirements.map((row) => [id(row._id), row]));
    const allocationMap = new Map(allocations.map((row) => [id(row._id), row]));
    for (const allocation of allocations) {
        const candidates = scopes.get(`${id(allocation.salesOrderId)}:${id(allocation.productId)}`) || [];
        const requirement = requirementMap.get(id(allocation.requirementId));
        for (const order of candidates) {
            if (requirement && mongoose.isValidObjectId(requirement.demandProductId)
                && id(requirement.salesOrderId) === id(order.salesOrderId) && id(requirement.productId) === id(allocation.productId)
                && id(requirement.demandProductId) !== id(order.rootProductId)) continue;
            if (!requirement || requirement._isDeleted || !mongoose.isValidObjectId(requirement.demandProductId)
                || id(requirement.salesOrderId) !== id(order.salesOrderId) || id(requirement.productId) !== id(allocation.productId)) {
                block(order, `采购分配 ${toText(allocation.purchaseOrderNo)} 的需求来源失效，请先核对。`);
                continue;
            }
            if (id(requirement.demandProductId) === id(order.rootProductId)) linkPurchase(order, allocation);
        }
    }

    // 已用于本订单的采购预占也是来源证据，不能因原分配丢失就按公共库存放行。
    const reservations = scopes.size ? await withSession(SalesOrderStockReservation.find({
        salesOrderId: { $in: [...salesOrderIds].map(toObjectId) }, stockProductId: { $in: [...materialIds].map(toObjectId) },
        reservationType: "production-material", sourceAllocationId: { $ne: null },
        $or: [{ status: "active" }, { productionAllocatedQuantity: { $gt: 0 } }, { consumedQuantity: { $gt: 0 } }],
    }).select("salesOrderId demandProductId stockProductId sourceAllocationId").lean(), session) as any[] : [];
    for (const reservation of reservations) {
        const candidates = scopes.get(`${id(reservation.salesOrderId)}:${id(reservation.stockProductId)}`) || [];
        for (const order of candidates) {
            if (id(reservation.demandProductId) !== id(order.rootProductId)
                && id(reservation.demandProductId) !== id(reservation.stockProductId)) continue;
            if (!allocationMap.has(id(reservation.sourceAllocationId))) block(order, "订单物料预占的采购分配来源缺失，请先核对。");
        }
    }

    const requestSources: Record<string, any>[] = [{ productionOrderId: { $in: orders.map((order) => order._id) } }];
    const productionNumbers = orders.map((order) => toText(order.documentNo)).filter(Boolean);
    if (productionNumbers.length) requestSources.push({ productionOrderNo: { $in: productionNumbers } });
    const requests = await withSession(PurchaseRequest.find({ $or: requestSources }).lean(), session) as any[];
    const requestMap = new Map(requests.map((row) => [id(row._id), row]));
    const directAllocations = requests.length ? await withSession(PurchaseRequestOrderAllocation.find({
        purchaseRequestId: { $in: requests.map((row) => row._id) },
    }).lean(), session) as any[] : [];
    for (const allocation of directAllocations) {
        const request = requestMap.get(id(allocation.purchaseRequestId));
        const byId = orderById.get(id(request?.productionOrderId));
        const byNumber = orderByNumber.get(toText(request?.productionOrderNo));
        const affected = new Set([byId, byNumber].filter(Boolean));
        const index = allocation.purchaseRequestItemIndex;
        const item = Number.isInteger(index) && index >= 0 ? request?.items?.[index] : null;
        for (const order of affected) {
            if (!request || request.status !== "approved" || request.category !== "生产用料采购"
                || id(request.productionOrderId) !== id(order._id)
                || (request.productionOrderNo && toText(request.productionOrderNo) !== toText(order.documentNo))
                || (request.salesOrderId && id(request.salesOrderId) !== id(order.salesOrderId))
                || allocation.requirementId || id(item?.productId) !== id(allocation.productId)
                || !(order.bomMaterials || []).some((material: any) => id(material.productId) === id(allocation.productId))) {
                block(order, `采购分配 ${toText(allocation.purchaseOrderNo)} 的生产采购申请来源失效，请先核对。`);
                continue;
            }
            linkPurchase(order, allocation);
        }
    }

    const purchaseIds = new Set<string>();
    for (const purchases of links.values()) for (const purchaseId of purchases.keys()) purchaseIds.add(purchaseId);
    const purchases = purchaseIds.size ? await withSession(PurchaseOrder.find({
        _id: { $in: [...purchaseIds].map(toObjectId) },
    }).select("orderNo totalQuantity items _isDeleted").lean(), session) as any[] : [];
    const purchaseMap = new Map(purchases.map((row) => [id(row._id), row]));
    const purchaseNumbers = purchases.filter((row) => !row._isDeleted).map((row) => toText(row.orderNo)).filter(Boolean);
    const inboundDocuments = purchaseNumbers.length ? await withSession(InventoryInbound.find({
        purchaseOrderNo: { $in: purchaseNumbers }, type: "采购", stockApplied: true, _isDeleted: { $ne: true },
    }).select("purchaseOrderNo items").lean(), session) as any[] : [];
    const receipts = new Map<string, any[]>();
    const invalidReceiptOrders = new Set<string>();
    for (const document of inboundDocuments) {
        const orderNo = toText(document.purchaseOrderNo);
        if (!Array.isArray(document.items) || !document.items.length) {
            invalidReceiptOrders.add(orderNo);
            continue;
        }
        if (!receipts.has(orderNo)) receipts.set(orderNo, []);
        receipts.get(orderNo)!.push(...document.items);
    }
    const receiptStates = new Map(purchases.map((purchase) => [id(purchase._id),
        getPurchaseOrderReceipt(purchase, receipts.get(toText(purchase.orderNo)) || [])]));
    for (const order of orders) {
        const state = result.get(id(order._id))!;
        for (const [purchaseId, link] of links.get(id(order._id))!) {
            const purchase = purchaseMap.get(purchaseId);
            if (!purchase || purchase._isDeleted || toText(purchase.orderNo) !== link.orderNo) {
                block(order, `关联采购单 ${link.orderNo} 不存在、已删除或单号不一致，请先核对。`);
                continue;
            }
            for (const productId of link.productIds) {
                if (!Array.isArray(purchase.items) || !purchase.items.some((item: any) => id(item?.productId) === productId)) {
                    block(order, `关联采购单 ${link.orderNo} 缺少分配物料，请先核对。`);
                }
            }
            const receipt = receiptStates.get(purchaseId)!;
            state.relatedPurchaseOrders.push(receipt.summary);
            if (invalidReceiptOrders.has(link.orderNo)) block(order, `采购单 ${link.orderNo} 的实际入库明细缺失或无效，请先核对。`);
            if (receipt.sourceBlockReason) block(order, receipt.sourceBlockReason);
            else if (receipt.blockReason) reasons.get(id(order._id))!.add(receipt.blockReason);
        }
        state.purchaseReceiptBlockReason = [...reasons.get(id(order._id))!].join(" ");
        state.purchaseReceiptReady = !state.purchaseReceiptBlockReason;
        state.purchaseSourceBlockReason = [...sourceReasons.get(id(order._id))!].join(" ");
        state.purchaseSourceValid = !state.purchaseSourceBlockReason;
    }
    return result;
};

// 锁住已核验的整单来源，避免其他 SKU 的入库并发冲销后仍按旧快照出库。
// 使用已有更新时间和经办人字段形成真实写入冲突，无需新增锁字段。
export const lockProductionPurchaseReceipts = async (
    purchases: ExecutionPurchaseOrderReceipt[],
    actor: string,
    session: mongoose.ClientSession,
) => {
    if (!session.inTransaction()) throw new Error("生产采购入库校验必须在事务中执行");
    if (!purchases.length) return;
    const orders = await PurchaseOrder.find({
        _id: { $in: purchases.map((purchase) => toObjectId(purchase.id)) }, _isDeleted: { $ne: true },
    }).select("updateTime").sort({ _id: 1 }).session(session).lean() as any[];
    if (orders.length !== purchases.length) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "关联采购单已变化，请刷新后重试。");
    for (const order of orders) {
        const updateTime = new Date(Math.max(Date.now(), new Date(order.updateTime || 0).getTime() + 1));
        const changed = await PurchaseOrder.updateOne({ _id: order._id, _isDeleted: { $ne: true } }, {
            $set: { updateTime, updatedBy: actor },
        }, { session, timestamps: false });
        if (changed.matchedCount !== 1) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "关联采购单已变化，请刷新后重试。");
    }
    const documents = await InventoryInbound.find({
        purchaseOrderNo: { $in: purchases.map((purchase) => purchase.orderNo) },
        type: "采购", stockApplied: true, _isDeleted: { $ne: true },
    }).select("updateTime").sort({ _id: 1 }).session(session).lean() as any[];
    for (const document of documents) {
        const updateTime = new Date(Math.max(Date.now(), new Date(document.updateTime || 0).getTime() + 1));
        const changed = await InventoryInbound.updateOne({ _id: document._id, stockApplied: true, _isDeleted: { $ne: true } }, {
            $set: { updateTime, updatedBy: actor },
        }, { session, timestamps: false });
        if (changed.matchedCount !== 1) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "关联采购入库已变化，请刷新后重试。");
    }
};
