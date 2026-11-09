import mongoose from "mongoose";
import { PurchaseOrder } from "~~/server/models/purchaseOrder.model";
import { PurchaseOrderAllocation } from "~~/server/models/purchaseOrderAllocation.model";
import { PurchaseRequestOrderAllocation } from "~~/server/models/purchaseRequestOrderAllocation.model";
import {
    PurchaseMaterialRequirement,
    normalizePurchaseQuantity,
} from "~~/server/models/purchaseMaterialRequirement.model";
import type { PurchaseRequestData } from "~~/server/models/purchaseRequest.model";
import type { PurchaseRequestDisplayStatus } from "~~/shared/types/approval";

type RequestStatusSource = Pick<PurchaseRequestData, "_id" | "category" | "items">;

type AllocationProgress = {
    purchaseOrderId: mongoose.Types.ObjectId;
    allocatedQuantity: number;
};

type DirectAllocationProgress = AllocationProgress & {
    purchaseRequestId: mongoose.Types.ObjectId;
    purchaseRequestItemIndex: number;
};

type SalesAllocationProgress = AllocationProgress & {
    requirementId: mongoose.Types.ObjectId;
};

type SalesRequirement = {
    _id: mongoose.Types.ObjectId;
    purchaseRequestId: mongoose.Types.ObjectId;
    productId: mongoose.Types.ObjectId;
    shortageQuantity: number;
};

export const getPurchaseRequestDisplayStatusMap = async (requests: RequestStatusSource[]) => {
    const statusMap = new Map<string, PurchaseRequestDisplayStatus>();
    if (!requests.length) return statusMap;

    const directRequestIds: mongoose.Types.ObjectId[] = [];
    const salesRequestIds: mongoose.Types.ObjectId[] = [];
    for (const request of requests) {
        statusMap.set(request._id.toString(), "approved");
        if (request.category === "销售订单采购") {
            salesRequestIds.push(request._id);
        } else {
            directRequestIds.push(request._id);
        }
    }

    const [directAllocations, requirements] = await Promise.all([
        directRequestIds.length
            ? PurchaseRequestOrderAllocation.find({
                purchaseRequestId: { $in: directRequestIds },
                allocatedQuantity: { $gt: 0 },
            }).select("purchaseOrderId purchaseRequestId purchaseRequestItemIndex allocatedQuantity")
                .lean<DirectAllocationProgress[]>()
            : Promise.resolve([] as DirectAllocationProgress[]),
        salesRequestIds.length
            ? PurchaseMaterialRequirement.find({
                purchaseRequestId: { $in: salesRequestIds },
                demandType: "purchase",
                _isDeleted: { $ne: true },
            }).select("_id purchaseRequestId productId shortageQuantity")
                .sort({ createTime: -1, _id: -1 })
                .lean<SalesRequirement[]>()
            : Promise.resolve([] as SalesRequirement[]),
    ]);
    // 销售采购的两张分配表记录同一笔数量，只统计需求分配，兼容物料池采购单。
    const salesAllocations = requirements.length
        ? await PurchaseOrderAllocation.find({
            requirementId: { $in: requirements.map((requirement) => requirement._id) },
            allocatedQuantity: { $gt: 0 },
        }).select("purchaseOrderId requirementId allocatedQuantity").lean<SalesAllocationProgress[]>()
        : [];

    const purchaseOrderIds = new Map<string, mongoose.Types.ObjectId>();
    for (const allocation of [...directAllocations, ...salesAllocations]) {
        purchaseOrderIds.set(allocation.purchaseOrderId.toString(), allocation.purchaseOrderId);
    }
    const orders = purchaseOrderIds.size
        ? await PurchaseOrder.find({
            _id: { $in: [...purchaseOrderIds.values()] },
            _isDeleted: { $ne: true },
        }).select("_id").lean<Array<{ _id: mongoose.Types.ObjectId }>>()
        : [];
    const validOrderIds = new Set(orders.map((order) => order._id.toString()));
    const directQuantities = new Map<string, number>();
    for (const allocation of directAllocations) {
        if (!validOrderIds.has(allocation.purchaseOrderId.toString())) continue;
        const key = `${allocation.purchaseRequestId}:${allocation.purchaseRequestItemIndex}`;
        directQuantities.set(key, normalizePurchaseQuantity(
            (directQuantities.get(key) || 0) + allocation.allocatedQuantity,
        ));
    }
    const salesQuantities = new Map<string, number>();
    for (const allocation of salesAllocations) {
        if (!validOrderIds.has(allocation.purchaseOrderId.toString())) continue;
        const key = allocation.requirementId.toString();
        salesQuantities.set(key, normalizePurchaseQuantity(
            (salesQuantities.get(key) || 0) + allocation.allocatedQuantity,
        ));
    }

    const requirementById = new Map<string, SalesRequirement>();
    const requirementByRequestProduct = new Map<string, SalesRequirement>();
    for (const requirement of requirements) {
        requirementById.set(requirement._id.toString(), requirement);
        const key = `${requirement.purchaseRequestId}:${requirement.productId}`;
        if (!requirementByRequestProduct.has(key)) {
            requirementByRequestProduct.set(key, requirement);
        }
    }

    for (const request of requests) {
        const requestId = request._id.toString();
        const items = request.items || [];
        let hasOrderedQuantity = false;
        let allItemsOrdered = items.length > 0;
        for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            const item = items[itemIndex]!;
            let targetQuantity = normalizePurchaseQuantity(item.quantity);
            let orderedQuantity = directQuantities.get(`${requestId}:${itemIndex}`) || 0;
            if (request.category === "销售订单采购") {
                const productId = String(item.productId || "");
                let requirement = requirementById.get(String(item.requirementId || ""));
                if (!requirement
                    || requirement.purchaseRequestId.toString() !== requestId
                    || requirement.productId.toString() !== productId) {
                    requirement = requirementByRequestProduct.get(`${requestId}:${productId}`);
                }
                if (!requirement) {
                    allItemsOrdered = false;
                    continue;
                }
                targetQuantity = normalizePurchaseQuantity(requirement.shortageQuantity);
                orderedQuantity = salesQuantities.get(requirement._id.toString()) || 0;
            }
            if (orderedQuantity > 0) hasOrderedQuantity = true;
            if (targetQuantity <= 0 || orderedQuantity < targetQuantity) allItemsOrdered = false;
        }
        if (hasOrderedQuantity) {
            statusMap.set(requestId, allItemsOrdered ? "ordered" : "partially_ordered");
        }
    }
    return statusMap;
};
