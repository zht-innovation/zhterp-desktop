import mongoose from "mongoose";
import { ApprovalInstance } from "~~/server/models/approvalInstance.model";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import { PurchaseMaterialRequirement } from "~~/server/models/purchaseMaterialRequirement.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { PurchaseOrderAllocation } from "~~/server/models/purchaseOrderAllocation.model";
import { InventoryOrderReview } from "~~/server/models/inventoryOrderReview.model";
import { useNotificationModel } from "~~/server/models/notification.model";

type CleanupResult = {
    deletedCount: number;
    releasedReservationCount: number;
    hiddenRequirementCount: number;
    retainedHistoryCount: number;
};

const toObjectIds = (ids: string[]) => ids
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

/**
 * Marks orders deleted and releases only inventory/purchase data that has not
 * become an irreversible business record. The caller owns the transaction.
 */
export const cleanupSalesOrderDeletion = async (
    ids: string[],
    actor: string,
    session: mongoose.ClientSession,
): Promise<CleanupResult> => {
    const orderIds = toObjectIds(ids);
    if (!orderIds.length) throw new Error("缺少有效订单ID");

    await InventoryOrderReview.updateMany(
        { salesOrderId: { $in: orderIds }, _isDeleted: { $ne: true } },
        { $set: { _isDeleted: true, deletedAt: new Date(), deletedBy: actor } },
        { session, timestamps: false },
    );
    const notifications = useNotificationModel().notification;
    for (const orderId of orderIds) {
        const relatedId = orderId.toString();
        await notifications.updateMany(
            { type: "notification", category: "库存核对", relatedId, _isFakeDel: false },
            { $set: { _isFakeDel: true, salesOrderDeletionId: relatedId } },
            { session },
        );
    }

    const reservations = await SalesOrderStockReservation.find({
        salesOrderId: { $in: orderIds },
    }).session(session) as any[];
    let releasedReservationCount = 0;
    for (const reservation of reservations) {
        const remaining = Math.max(
            Number(reservation.reservedQuantity || 0)
                - Number(reservation.consumedQuantity || 0)
                - Number(reservation.releasedQuantity || 0),
            0,
        );
        if (remaining > 0) {
            const stockId = reservation.stockProductId;
            const warehouseId = reservation.warehouseId || null;
            const locationId = reservation.locationId || null;
            if (stockId) {
                const stockResult = await InventoryStock.updateOne(
                    {
                        productId: stockId,
                        warehouseId,
                        locationId,
                        _isDeleted: { $ne: true },
                        $expr: { $gte: ["$lockedQuantity", remaining] },
                    },
                    { $inc: { lockedQuantity: -remaining }, $set: { updatedBy: actor } },
                    { session },
                );
                if (stockResult.modifiedCount !== 1) {
                    throw new Error("关联库存不存在或锁定数量不足，订单删除已回滚");
                }
            }
            reservation.releasedQuantity = Number(reservation.releasedQuantity || 0) + remaining;
            reservation.status = reservation.releasedQuantity + Number(reservation.consumedQuantity || 0)
                >= Number(reservation.reservedQuantity || 0) ? "released" : "active";
            reservation.updatedBy = actor;
            await reservation.save({ session });
            releasedReservationCount += 1;
        }
    }

    const requirements = await PurchaseMaterialRequirement.find({
        salesOrderId: { $in: orderIds },
        status: "未完成",
    }).select("_id").session(session).lean() as any[];
    const requirementIds = requirements.map((item) => item._id).filter(Boolean);
    const removableAllocations = requirementIds.length
        ? await PurchaseOrderAllocation.find({
            requirementId: { $in: requirementIds },
            status: "未完成",
            lockedAfterInboundQuantity: { $lte: 0 },
        }).select("_id requirementId").session(session).lean() as any[]
        : [];
    const removableAllocationIds = removableAllocations.map((item: any) => item._id).filter(Boolean);
    if (removableAllocationIds.length) {
        await PurchaseOrderAllocation.deleteMany(
            { _id: { $in: removableAllocationIds } },
            { session },
        );
    }
    const remainingAllocationRequirements = requirementIds.length
        ? await PurchaseOrderAllocation.find({ requirementId: { $in: requirementIds } })
            .distinct("requirementId").session(session)
        : [];
    const retainedRequirementSet = new Set(remainingAllocationRequirements.map((id: any) => id.toString()));
    const removableRequirementIds = requirementIds.filter((id: any) => !retainedRequirementSet.has(id.toString()));
    let hiddenRequirementCount = 0;
    if (removableRequirementIds.length) {
        const result = await PurchaseMaterialRequirement.updateMany(
            { _id: { $in: removableRequirementIds } },
            { $set: { _isDeleted: true, deletedAt: new Date(), deletedBy: actor, updatedBy: actor } },
            { session },
        );
        hiddenRequirementCount = result.modifiedCount || 0;
    }

    const approvalResult = await ApprovalInstance.updateMany(
        { type: "sales-order", businessId: { $in: orderIds }, status: "pending" },
        { $set: { status: "cancelled", completedAt: new Date() } },
        { session },
    );

    const orderResult = await mongoose.connection.collection("salesorders").updateMany(
        { _id: { $in: orderIds }, _isDeleted: { $ne: true } },
        { $set: { _isDeleted: true, deletedAt: new Date(), deletedBy: actor, updatedBy: actor } },
        { session },
    );

    const retainedHistoryCount = Math.max(reservations.length - releasedReservationCount, 0)
        + Number(approvalResult.matchedCount || 0)
        + await mongoose.connection.collection("salesorderreceipts").countDocuments(
            { salesOrderId: { $in: orderIds } }, { session },
        )
        + await mongoose.connection.collection("inventoryoutbounds").countDocuments(
            { salesOrderId: { $in: orderIds } }, { session },
        )
        + await mongoose.connection.collection("inventoryinbounds").countDocuments(
            { salesOrderId: { $in: orderIds } }, { session },
        );
    return {
        deletedCount: orderResult.modifiedCount || 0,
        releasedReservationCount,
        hiddenRequirementCount,
        retainedHistoryCount,
    };
};

// Only restore notifications hidden by order deletion, not manually deleted ones.
export const restoreSalesOrderDeletion = async (
    ids: string[],
    session: mongoose.ClientSession,
): Promise<void> => {
    const orderIds = toObjectIds(ids);
    if (!orderIds.length) throw new Error("缺少有效订单ID");

    await InventoryOrderReview.updateMany(
        { salesOrderId: { $in: orderIds }, _isDeleted: true },
        { $set: { _isDeleted: false }, $unset: { deletedAt: 1, deletedBy: 1 } },
        { session, timestamps: false },
    );
    const notifications = useNotificationModel().notification;
    for (const orderId of orderIds) {
        const relatedId = orderId.toString();
        await notifications.updateMany(
            { type: "notification", category: "库存核对", relatedId, salesOrderDeletionId: relatedId },
            { $set: { _isFakeDel: false }, $unset: { salesOrderDeletionId: 1 } },
            { session },
        );
    }
};
