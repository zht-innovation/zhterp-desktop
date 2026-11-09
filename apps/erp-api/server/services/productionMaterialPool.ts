import type mongoose from "mongoose";
import { PurchaseOrderAllocation } from "~~/server/models/purchaseOrderAllocation.model";
import { PurchaseMaterialRequirement } from "~~/server/models/purchaseMaterialRequirement.model";

const id = (value: any) => String(value?.toString?.() || value || "");

// 旧采购入库曾把原料自身写成需求产品；仅沿已有外键还原归属，不猜配或修改历史数据。
export const resolveProductionReservationOrigins = async (reservations: any[], session?: mongoose.ClientSession) => {
    const legacy = reservations.filter((row) => row.reservationType === "production-material"
        && row.sourceAllocationId && id(row.demandProductId) === id(row.stockProductId));
    if (!legacy.length) return reservations;
    const allocationQuery = PurchaseOrderAllocation.find({ _id: { $in: legacy.map((row) => row.sourceAllocationId) } })
        .select("requirementId salesOrderId productId").lean();
    if (session) allocationQuery.session(session);
    const allocations = await allocationQuery as any[];
    const requirementQuery = PurchaseMaterialRequirement.find({ _id: { $in: allocations.map((row) => row.requirementId) } })
        .select("salesOrderId productId demandProductId").lean();
    if (session) requirementQuery.session(session);
    const requirements = await requirementQuery as any[];
    return reservations.map((row) => {
        if (row.reservationType !== "production-material" || !row.sourceAllocationId || id(row.demandProductId) !== id(row.stockProductId)) return row;
        const allocation = allocations.find((item) => id(item._id) === id(row.sourceAllocationId));
        const requirement = allocation && requirements.find((item) => id(item._id) === id(allocation.requirementId));
        if (!allocation || !requirement || !requirement.demandProductId
            || id(allocation.salesOrderId) !== id(row.salesOrderId) || id(requirement.salesOrderId) !== id(row.salesOrderId)
            || id(allocation.productId) !== id(row.stockProductId) || id(requirement.productId) !== id(row.stockProductId)) return row;
        return { ...row, demandProductId: requirement.demandProductId };
    });
};
