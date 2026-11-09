import { getErpAttachmentRoot } from "~~/server/utils/erpAttachmentRoot";
import { createHash } from "crypto";
import { unlink } from "fs/promises";
import mongoose from "mongoose";
import path from "path";
import { ApprovalInstance } from "~~/server/models/approvalInstance.model";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import { PurchaseMaterialRequirement } from "~~/server/models/purchaseMaterialRequirement.model";
import { PurchaseOrderAllocation } from "~~/server/models/purchaseOrderAllocation.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { SalesOrderPurgeAudit } from "~~/server/models/salesOrderPurgeAudit.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { InventoryOrderReview } from "~~/server/models/inventoryOrderReview.model";
import { useNotificationModel } from "~~/server/models/notification.model";
import { logger } from "~~/server/utils/logger";

type PurgeOrder = {
    _id: mongoose.Types.ObjectId;
    orderNo?: string;
    status?: string;
    orderImages?: any[];
    attachments?: any[];
    receivableAttachments?: any[];
};
type PurgeCheck = {
    id: string;
    orderNo: string;
    canDelete: boolean;
    reasons: string[];
    counts: Record<string, number>;
};

const idList = (ids: unknown[]) => Array.from(new Set(ids.map((id) => String(id || "").trim()).filter((id) => mongoose.Types.ObjectId.isValid(id))));
const objectIds = (ids: string[]) => ids.map((id) => new mongoose.Types.ObjectId(id));
const SALES_ORDER_PURGE_STATUSES = new Set(["已驳回", "待采购"]);
const orderFilter = (order: PurgeOrder) => ({ $or: [
    { salesOrderId: order._id }, { salesOrderId: order._id.toString() },
    { orderId: order._id }, { orderId: order._id.toString() },
    { businessId: order._id }, { businessId: order._id.toString() },
    ...(order.orderNo ? [{ salesOrderNo: order.orderNo }, { orderNo: order.orderNo }] : []),
] });
const countBy = async (collection: any, order: PurgeOrder, session?: mongoose.ClientSession) => {
    const filter = orderFilter(order);
    return await collection.countDocuments(filter, session ? { session } : undefined);
};

const countModel = async (model: any, filter: Record<string, any>, session?: mongoose.ClientSession) => {
    const query = model.countDocuments(filter);
    if (session) query.session(session);
    return await query;
};

const getRelatedCounts = async (order: PurgeOrder, session?: mongoose.ClientSession) => {
    const reservationFilter = { $or: [{ salesOrderId: order._id }, { salesOrderId: order._id.toString() }, ...(order.orderNo ? [{ salesOrderNo: order.orderNo }] : [])] };
    const requirementFilter = { $or: [{ salesOrderId: order._id }, { salesOrderId: order._id.toString() }, ...(order.orderNo ? [{ salesOrderNo: order.orderNo }] : [])] };
    const allocationFilter = { $or: [{ salesOrderId: order._id }, { salesOrderId: order._id.toString() }, ...(order.orderNo ? [{ salesOrderNo: order.orderNo }] : [])] };
    const approvalFilter = { type: "sales-order", businessId: order._id };
    const [receipts, outbounds, inbounds, reservations, consumedReservations, activeReservations, requirements, effectiveRequirements, allocations, completedApprovals, pendingApprovals] = await Promise.all([
        countBy(mongoose.connection.collection("salesorderreceipts"), order, session),
        countBy(mongoose.connection.collection("inventoryoutbounds"), order, session),
        countBy(mongoose.connection.collection("inventoryinbounds"), order, session),
        countModel(SalesOrderStockReservation, reservationFilter, session),
        countModel(SalesOrderStockReservation, { ...reservationFilter, consumedQuantity: { $gt: 0 } }, session),
        countModel(SalesOrderStockReservation, { ...reservationFilter, status: "active" }, session),
        countModel(PurchaseMaterialRequirement, requirementFilter, session),
        countModel(PurchaseMaterialRequirement, { $and: [requirementFilter, { $or: [{ status: "已完成" }, { fulfilledQuantity: { $gt: 0 } }, { allocatedQuantity: { $gt: 0 } }] }] }, session),
        countModel(PurchaseOrderAllocation, allocationFilter, session),
        countModel(ApprovalInstance, { ...approvalFilter, status: { $in: ["approved", "rejected", "completed"] } }, session),
        countModel(ApprovalInstance, { ...approvalFilter, status: "pending" }, session),
    ]);
    return { receipts, outbounds, inbounds, reservations, consumedReservations, activeReservations, requirements, effectiveRequirements, allocations, completedApprovals, pendingApprovals };
};

const checkOrder = async (order: PurgeOrder, session?: mongoose.ClientSession): Promise<PurgeCheck> => {
    const counts = await getRelatedCounts(order, session);
    const reasons: string[] = [];
    const canPurgeStatus = SALES_ORDER_PURGE_STATUSES.has(String(order.status || "").trim());
    if (!canPurgeStatus) {
        reasons.push("仅已驳回或待采购订单允许彻底删除");
    }
    if (counts.receipts) reasons.push(`存在${counts.receipts}条回款记录`);
    if (counts.outbounds) reasons.push(`存在${counts.outbounds}张出库单`);
    if (counts.inbounds) reasons.push(`存在${counts.inbounds}条入库记录`);
    if (counts.consumedReservations) reasons.push("库存预占已消耗");
    if (counts.activeReservations) {
        const reservationQuery = SalesOrderStockReservation.find({
            $or: [{ salesOrderId: order._id }, { salesOrderNo: order.orderNo || "" }],
            status: "active",
        });
        if (session) reservationQuery.session(session);
        const activeRows = await reservationQuery.lean() as any[];
        for (const row of activeRows) {
            const remaining = Math.max(Number(row.reservedQuantity || 0) - Number(row.consumedQuantity || 0) - Number(row.releasedQuantity || 0), 0);
            if (!remaining) continue;
            if (!row.stockProductId) {
                reasons.push("存在无法确认库存锁定量的预占");
                break;
            }
            const stockQuery = InventoryStock.findOne({ productId: row.stockProductId, warehouseId: row.warehouseId || null, locationId: row.locationId || null });
            if (session) stockQuery.session(session);
            const stock = await stockQuery.select("lockedQuantity").lean() as any;
            if (!stock || Number(stock.lockedQuantity || 0) < remaining) {
                reasons.push("库存预占对应锁定量不足");
                break;
            }
        }
    }
    if (counts.allocations) reasons.push(`存在${counts.allocations}条采购分配`);
    if (counts.effectiveRequirements) reasons.push(`存在${counts.effectiveRequirements}条已生效采购需求`);
    if (counts.completedApprovals && !canPurgeStatus) reasons.push("存在已完成审批记录");
    if (hasUnclearAttachment(order)) reasons.push("存在无法定位的订单附件或图片");
    return { id: order._id.toString(), orderNo: String(order.orderNo || ""), canDelete: reasons.length === 0, reasons, counts };
};

const loadDeletedOrders = async (ids: string[], session?: mongoose.ClientSession) => {
    const query = useSalesOrderModel().order.find({ _id: { $in: objectIds(ids) }, _isDeleted: true });
    if (session) query.session(session);
    return await query.lean<PurgeOrder[]>();
};

export const previewSalesOrderPurge = async (ids: unknown[]) => {
    const normalized = idList(ids);
    if (!normalized.length || normalized.length !== ids.length) throw new Error("缺少有效订单ID");
    const orders = await loadDeletedOrders(normalized);
    if (orders.length !== normalized.length) throw new Error("仅允许彻底删除已软删除且存在的订单");
    const checks = [];
    for (const order of orders) checks.push(await checkOrder(order));
    return { canDelete: checks.every((item) => item.canDelete), orders: checks };
};

const attachmentPaths = (order: PurgeOrder) => [...(order.orderImages || []), ...(order.attachments || []), ...(order.receivableAttachments || [])]
    .map((item: any) => String(item?.path || item?.url || item || "").trim())
    .filter(Boolean);

const resolvePublicFile = (value: string) => {
    if (!value.startsWith("/main/")) return null;
    const root = getErpAttachmentRoot();
    const target = path.resolve(root, value.slice(1));
    return target === root || target.startsWith(`${root}${path.sep}`) ? target : null;
};

const hasUnclearAttachment = (order: PurgeOrder) => attachmentPaths(order)
    .some((value) => !resolvePublicFile(value));

export const purgeSalesOrders = async (ids: unknown[], operator: { id?: string; name?: string }) => {
    const normalized = idList(ids);
    if (!normalized.length || normalized.length !== ids.length) throw new Error("缺少有效订单ID");
    const session = await mongoose.startSession();
    const files: string[] = [];
    let result = { deletedCount: 0, releasedReservationCount: 0, removedRequirementCount: 0, retainedHistoryCount: 0 };
    try {
        await session.withTransaction(async () => {
            const orders = await loadDeletedOrders(normalized, session);
            if (orders.length !== normalized.length) throw new Error("仅允许彻底删除已软删除且存在的订单");
            const checks: PurgeCheck[] = [];
            for (const order of orders) checks.push(await checkOrder(order, session));
            if (checks.some((item) => !item.canDelete)) throw new Error(checks.filter((item) => item.reasons.length).map((item) => `${item.orderNo || item.id}: ${item.reasons.join("、")}`).join("；"));
            const orderIds = objectIds(normalized);
            const reservations = await SalesOrderStockReservation.find({
                $or: [
                    { salesOrderId: { $in: orderIds } },
                    { salesOrderNo: { $in: orders.map((order) => order.orderNo).filter(Boolean) } },
                ],
            }).session(session) as any[];
            for (const reservation of reservations) {
                const remaining = Math.max(Number(reservation.reservedQuantity || 0) - Number(reservation.consumedQuantity || 0) - Number(reservation.releasedQuantity || 0), 0);
                if (remaining > 0) {
                    if (!reservation.stockProductId) throw new Error("库存预占缺少库存关联，彻底删除已回滚");
                    const stock = await InventoryStock.updateOne({ productId: reservation.stockProductId, warehouseId: reservation.warehouseId || null, locationId: reservation.locationId || null, $expr: { $gte: ["$lockedQuantity", remaining] } }, { $inc: { lockedQuantity: -remaining } }, { session });
                    if (stock.modifiedCount !== 1) throw new Error("库存锁定量不足，彻底删除已回滚");
                }
            }
            result.releasedReservationCount = reservations.length;
            const relationFilter = {
                $or: [
                    { salesOrderId: { $in: orderIds } },
                    { salesOrderNo: { $in: orders.map((order) => order.orderNo).filter(Boolean) } },
                ],
            };
            await SalesOrderStockReservation.deleteMany(relationFilter, { session });
            const requirements = await PurchaseMaterialRequirement.find(relationFilter).select("_id").session(session).lean() as any[];
            const requirementIds = requirements.map((item) => item._id);
            if (requirementIds.length) {
                await PurchaseMaterialRequirement.deleteMany({ _id: { $in: requirementIds } }, { session });
                result.removedRequirementCount = requirementIds.length;
            }
            await ApprovalInstance.deleteMany({ type: "sales-order", businessId: { $in: orderIds }, status: "pending" }, { session });
            await InventoryOrderReview.deleteMany({ salesOrderId: { $in: orderIds } }, { session });
            await useNotificationModel().notification.deleteMany(
                { type: "notification", category: "库存核对", relatedId: { $in: orderIds.map((id) => id.toString()) } },
                { session },
            );
            result.retainedHistoryCount = checks.reduce((sum, item) => sum + item.counts.receipts + item.counts.outbounds + item.counts.inbounds + item.counts.completedApprovals, 0);
            const deleted = await (mongoose.connection.collection("salesorders")).deleteMany({ _id: { $in: orderIds }, _isDeleted: true }, { session });
            if (deleted.deletedCount !== orderIds.length) throw new Error("订单删除数量不一致，彻底删除已回滚");
            result.deletedCount = deleted.deletedCount;
            orders.forEach((order) => files.push(...attachmentPaths(order).map(resolvePublicFile).filter((file): file is string => Boolean(file))));
            const hash = createHash("sha256").update(normalized.join(",")).digest("hex");
            await SalesOrderPurgeAudit.create([{ orderIdHash: hash, operatorId: operator.id || "", operatorName: operator.name || "", deletedAt: new Date(), ...result, result: "success" }], { session });
        });
    } catch (error) {
        try {
            await SalesOrderPurgeAudit.create({
                orderIdHash: createHash("sha256").update(normalized.join(",")).digest("hex"),
                operatorId: operator.id || "",
                operatorName: operator.name || "",
                deletedAt: new Date(),
                ...result,
                result: "failed",
            });
        } catch (auditError) {
            logger.error("Sales order purge failure audit error", auditError);
        }
        throw error;
    } finally {
        await session.endSession();
    }
    for (const file of Array.from(new Set(files))) {
        try { await unlink(file); } catch (error) {
            logger.error("Sales order purge file cleanup error", { file, error });
        }
    }
    return result;
};
