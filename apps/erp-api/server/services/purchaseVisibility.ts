import mongoose from "mongoose";
import { useAdminModel } from "~~/server/models/admin.model";
import { PurchaseRequest } from "~~/server/models/purchaseRequest.model";
import { InventoryHttpError } from "~~/server/services/inventory";
import { normalizeStockQuantity } from "~~/server/services/inventoryStockMath";
import { getDirectPurchaseAllocationReceipts } from "~~/server/services/salesOrderProductionCompletionMath";
import { canViewAllPurchaseRequests } from "~~/shared/utils/adminPermission";

export type PurchaseVisibilityScope = {
    applicantId?: string;
};

const idText = (value: any) => String(value?.toString?.() || value || "").trim();
const quantity = (value: unknown) => {
    const number = Number(value || 0);
    return Number.isFinite(number) ? normalizeStockQuantity(Math.max(number, 0)) : 0;
};

export const getPurchaseVisibilityScope = async (auth: any): Promise<PurchaseVisibilityScope> => {
    const username = idText(auth?.username);
    if (!username) throw new InventoryHttpError(401, 401, "请先登录");
    const admin = await useAdminModel().findAdminByUsername(username);
    if (!admin) throw new InventoryHttpError(401, 401, "当前登录用户不存在");
    return canViewAllPurchaseRequests(Number(admin.role)) ? {} : { applicantId: idText(admin._id) };
};

const getOwnedRequests = async (
    scope: PurchaseVisibilityScope,
): Promise<Array<{ _id: mongoose.Types.ObjectId; requestNo: string }>> => {
    if (!mongoose.isValidObjectId(scope.applicantId)) {
        throw new InventoryHttpError(401, 401, "当前登录用户不存在");
    }
    return await PurchaseRequest.find({ applicantId: new mongoose.Types.ObjectId(scope.applicantId) })
        .select("_id requestNo").lean();
};

export const getVisiblePurchaseOrderIds = async (scope: PurchaseVisibilityScope) => {
    if (!scope.applicantId) return undefined;
    const requests = await getOwnedRequests(scope);
    const requestIds = requests.map((request) => request._id);
    if (!requestIds.length) return [];
    const requirementIds = await mongoose.connection.collection("purchasematerialrequirements")
        .distinct("_id", { purchaseRequestId: { $in: requestIds } });
    const [directIds, legacyIds] = await Promise.all([
        mongoose.connection.collection("purchaserequestorderallocations")
            .distinct("purchaseOrderId", { purchaseRequestId: { $in: requestIds } }),
        mongoose.connection.collection("purchaseorderallocations")
            .distinct("purchaseOrderId", { requirementId: { $in: requirementIds } }),
    ]);
    const ids = new Set<string>();
    for (const value of [...directIds, ...legacyIds]) {
        if (mongoose.isValidObjectId(value)) ids.add(idText(value));
    }
    return [...ids].map((id) => new mongoose.Types.ObjectId(id));
};

// Only procurement reads pass a scope; warehouse receiving keeps its existing access.
export const scopePurchaseOrders = async (orders: any[], scope: PurchaseVisibilityScope): Promise<any[]> => {
    if (!scope.applicantId || !orders.length) return orders;
    const requests = await getOwnedRequests(scope);
    const requestMap = new Map(requests.map((request) => [idText(request._id), request]));
    const orderIds = orders.map((order) => new mongoose.Types.ObjectId(idText(order._id || order.id)));
    const orderIdByNo = new Map(orders.map((order) => [idText(order.orderNo), order._id || order.id]));
    const [direct, legacy, inboundDocuments] = await Promise.all([
        mongoose.connection.collection("purchaserequestorderallocations")
            .find({ purchaseOrderId: { $in: orderIds } }).toArray(),
        mongoose.connection.collection("purchaseorderallocations")
            .find({ purchaseOrderId: { $in: orderIds } }).toArray(),
        mongoose.connection.collection("inventoryinbounds").find({
            type: "采购", purchaseOrderNo: { $in: [...orderIdByNo.keys()] },
            stockApplied: true, _isDeleted: { $ne: true },
        }, { projection: { purchaseOrderNo: 1, items: 1 } }).toArray(),
    ]);
    const requirementIds = [...new Set(legacy.map((allocation) => idText(allocation.requirementId)))];
    const ownedRequirements = await mongoose.connection.collection("purchasematerialrequirements").find({
        _id: { $in: requirementIds.filter(mongoose.isValidObjectId).map((id) => new mongoose.Types.ObjectId(id)) },
        purchaseRequestId: { $in: requests.map((request) => request._id) },
    }, { projection: { purchaseRequestId: 1 } }).toArray();
    const requirementMap = new Map(ownedRequirements.map((requirement) => [idText(requirement._id), requirement]));
    const receiptRows: Array<{ purchaseOrderId: any; productId: any; quantity: number }> = [];
    for (const document of inboundDocuments) {
        for (const item of Array.isArray(document.items) ? document.items : []) {
            receiptRows.push({
                purchaseOrderId: orderIdByNo.get(idText(document.purchaseOrderNo)),
                productId: item.productId,
                quantity: quantity(item.quantity),
            });
        }
    }
    const directReceipts = getDirectPurchaseAllocationReceipts(direct, receiptRows, legacy);
    const legacyKey = (allocation: any) =>
        `${idText(allocation.purchaseOrderId)}:${idText(allocation.requirementId)}:${idText(allocation.productId)}`;
    const legacyReceipts = new Map<string, number>();
    for (const allocation of legacy) {
        const key = legacyKey(allocation);
        legacyReceipts.set(key, quantity((legacyReceipts.get(key) || 0) + quantity(allocation.lockedAfterInboundQuantity)));
    }
    const ownedByOrder = new Map<string, any[]>();
    const addAllocation = (allocation: any, request: any, received: number) => {
        const allocated = quantity(allocation.allocatedQuantity);
        if (!allocated) return;
        const orderId = idText(allocation.purchaseOrderId);
        const list = ownedByOrder.get(orderId) || [];
        list.push({
            _id: allocation._id,
            purchaseOrderId: allocation.purchaseOrderId,
            purchaseOrderNo: allocation.purchaseOrderNo,
            purchaseRequestId: request._id,
            purchaseRequestNo: request.requestNo || "",
            purchaseRequestItemIndex: allocation.purchaseRequestItemIndex,
            requirementId: allocation.requirementId,
            salesOrderNo: allocation.salesOrderNo || "",
            productId: allocation.productId,
            allocatedQuantity: allocated,
            lockedAfterInboundQuantity: Math.min(allocated, quantity(received)),
        });
        ownedByOrder.set(orderId, list);
    };
    const directRequirements = new Set<string>();
    for (const allocation of direct) {
        if (allocation.requirementId) directRequirements.add(legacyKey(allocation));
        const request = requestMap.get(idText(allocation.purchaseRequestId));
        if (!request) continue;
        const received = allocation.requirementId
            ? legacyReceipts.get(legacyKey(allocation)) || 0
            : directReceipts.get(idText(allocation._id).toLowerCase()) || 0;
        addAllocation(allocation, request, received);
    }
    for (const allocation of legacy) {
        if (directRequirements.has(legacyKey(allocation))) continue;
        const requirement = requirementMap.get(idText(allocation.requirementId));
        const request = requestMap.get(idText(requirement?.purchaseRequestId));
        if (request) addAllocation(allocation, request, quantity(allocation.lockedAfterInboundQuantity));
    }

    const result: any[] = [];
    for (const order of orders) {
        const allocations = ownedByOrder.get(idText(order._id || order.id)) || [];
        if (!allocations.length) continue;
        const allocatedByProduct = new Map<string, number>();
        const receivedByProduct = new Map<string, number>();
        for (const allocation of allocations) {
            const productId = idText(allocation.productId);
            allocatedByProduct.set(productId, quantity((allocatedByProduct.get(productId) || 0) + allocation.allocatedQuantity));
            receivedByProduct.set(productId, quantity((receivedByProduct.get(productId) || 0) + allocation.lockedAfterInboundQuantity));
        }
        const items: any[] = [];
        const visibleProductIds = new Set<string>();
        for (const item of order.items || []) {
            const productId = idText(item.productId);
            if (!allocatedByProduct.has(productId) || visibleProductIds.has(productId)) continue;
            visibleProductIds.add(productId);
            items.push({
                productId: item.productId,
                productCode: item.productCode || "",
                productName: item.productName || "",
                productModel: item.productModel || "",
                unitId: item.unitId,
                unitName: item.unitName || "",
                quantity: allocatedByProduct.get(productId),
                platformOrderNos: item.platformOrderNos || [],
            });
        }
        if (!items.length) continue;
        const waybills: any[] = [];
        for (const waybill of order.waybills || []) {
            const linkedIds = Array.isArray(waybill.productIds) ? waybill.productIds : [];
            const productIds = linkedIds.filter((value: any) => visibleProductIds.has(idText(value)));
            if (!productIds.length) continue;
            waybills.push({
                _id: waybill._id,
                source: waybill.source,
                trackingNo: waybill.trackingNo,
                courierCompany: waybill.courierCompany || "",
                productIds,
                transportInfo: waybill.transportInfo || "",
                transportTraces: waybill.transportTraces || [],
                transportStatus: waybill.transportStatus,
            });
        }
        let totalQuantity = 0;
        let inboundReceived = 0;
        const progressItems: any[] = [];
        const platformOrderNos = new Set<string>();
        for (const item of items) {
            const received = Math.min(item.quantity, receivedByProduct.get(idText(item.productId)) || 0);
            totalQuantity = quantity(totalQuantity + item.quantity);
            inboundReceived = quantity(inboundReceived + received);
            progressItems.push({
                productId: item.productId, productCode: item.productCode, productModel: item.productModel,
                unitId: item.unitId, unitName: item.unitName,
                totalQuantity: item.quantity, receivedQuantity: received,
                inboundPercent: Math.min(100, Math.round(received / item.quantity * 100)),
            });
            for (const orderNo of item.platformOrderNos) platformOrderNos.add(orderNo);
        }
        const inboundPercent = totalQuantity > 0 ? Math.min(100, Math.round(inboundReceived / totalQuantity * 100)) : 0;
        // Rebuild the response so shared remarks, attachments, acceptance quantities and inbound records cannot leak.
        result.push({
            _id: order._id,
            id: idText(order._id || order.id),
            orderNo: order.orderNo,
            creationSource: order.creationSource,
            purchaseChannel: order.purchaseChannel,
            purchaseDate: order.purchaseDate,
            status: order.status,
            buyer: order.buyer,
            operator: order.operator,
            createdBy: order.createdBy,
            updatedBy: order.updatedBy,
            createTime: order.createTime,
            updateTime: order.updateTime,
            updatedAt: order.updatedAt,
            items,
            allocations: allocations.filter((allocation) => visibleProductIds.has(idText(allocation.productId))),
            waybills,
            platformOrderNos: [...platformOrderNos],
            totalQuantity,
            inboundTotal: totalQuantity,
            inboundReceived,
            inboundPercent,
            inboundProgress: {
                orderNo: order.orderNo, inboundTotal: totalQuantity, inboundReceived, inboundPercent,
                items: progressItems, records: [],
            },
        });
    }
    return result;
};

export const scopePurchaseOrder = async (order: any, scope: PurchaseVisibilityScope) => {
    const [visible] = await scopePurchaseOrders(order ? [order] : [], scope);
    if (!visible) throw new InventoryHttpError(404, 404, "采购单不存在或无权查看");
    return visible;
};
