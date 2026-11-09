import mongoose from "mongoose";
import { CODE } from "~~/server/utils/code";
import {
    isValidObjectId,
    throwInventoryError,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import {
    PurchaseMaterialRequirement,
    normalizePurchaseQuantity,
    usePurchaseMaterialRequirementModel,
} from "~~/server/models/purchaseMaterialRequirement.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { refreshSalesOrderFulfillmentStatus } from "~~/server/services/salesOrderFulfillment";
import {
    assertSalesOrderProductionReversalAllowed,
    ensureSalesOrderCompletionState,
    hasSalesOrderCompletionRelease,
    lockSalesOrderForProduction,
} from "~~/server/services/salesOrderCompletionState";

const { Schema } = mongoose;

export const runPurchaseAllocationTransaction = async <T>(
    session: mongoose.ClientSession | undefined,
    action: (currentSession: mongoose.ClientSession) => Promise<T>,
): Promise<T> => {
    if (session) return await action(session);
    const currentSession = await mongoose.startSession();
    try {
        let result: T;
        await currentSession.withTransaction(async () => { result = await action(currentSession); });
        return result!;
    } finally {
        await currentSession.endSession();
    }
};

export interface PurchaseOrderAllocationReq {
    requirementId?: string | mongoose.Types.ObjectId;
    allocatedQuantity?: number | string;
}

type PurchaseOrderAllocationContext = {
    purchaseOrderId: string;
    purchaseOrderNo: string;
    items: Array<{
        productId: any;
        quantity: number;
    }>;
};

const purchaseOrderAllocationSchema = new Schema(
    {
        purchaseOrderId: {
            type: Schema.Types.ObjectId,
            ref: "PurchaseOrder",
            required: true,
            index: true,
        },
        purchaseOrderNo: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        requirementId: {
            type: Schema.Types.ObjectId,
            ref: "PurchaseMaterialRequirement",
            required: true,
            index: true,
        },
        salesOrderId: {
            type: Schema.Types.ObjectId,
            ref: "SalesOrder",
            required: true,
            index: true,
        },
        salesOrderNo: {
            type: String,
            default: "",
            trim: true,
        },
        productId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryProduct",
            required: true,
            index: true,
        },
        allocatedQuantity: {
            type: Number,
            required: true,
            min: 0,
        },
        lockedAfterInboundQuantity: {
            type: Number,
            default: 0,
            min: 0,
        },
        status: {
            type: String,
            enum: ["未完成", "已完成"],
            default: "未完成",
            index: true,
        },
        createdBy: {
            type: String,
            default: "",
        },
        updatedBy: {
            type: String,
            default: "",
        },
    },
    {
        versionKey: false,
        timestamps: {
            createdAt: "createTime",
            updatedAt: "updateTime",
        },
    },
);

purchaseOrderAllocationSchema.index({ purchaseOrderId: 1, status: 1 });
purchaseOrderAllocationSchema.index({ purchaseOrderNo: 1, status: 1 });
purchaseOrderAllocationSchema.index({ requirementId: 1, status: 1 });
purchaseOrderAllocationSchema.index({ productId: 1, status: 1 });

const PurchaseOrderAllocation =
    mongoose.models.PurchaseOrderAllocation
    || mongoose.model("PurchaseOrderAllocation", purchaseOrderAllocationSchema);

class PurchaseOrderAllocationModel {
    allocation: typeof PurchaseOrderAllocation;

    constructor(allocation: typeof PurchaseOrderAllocation) {
        this.allocation = allocation;
    }

    async buildAllocationDocs(
        context: PurchaseOrderAllocationContext,
        allocations: PurchaseOrderAllocationReq[] = [],
        actor = "",
        excludePurchaseOrderId = "",
        session?: mongoose.ClientSession,
    ) {
        const normalized = this.normalizeAllocationInput(allocations);
        if (!normalized.length) return [];

        const productQuantityMap = new Map<string, number>();
        context.items.forEach((item) => {
            const productId = item.productId?.toString?.() || "";
            if (productId) {
                productQuantityMap.set(productId, normalizePurchaseQuantity(item.quantity));
            }
        });

        const requirementIds = normalized.map((item) => item.requirementId);
        const requirementQuery = PurchaseMaterialRequirement
            .find({
                _id: { $in: requirementIds.map((id) => toObjectId(id)) },
                status: "未完成",
                poolReady: true,
            })
            .lean();
        if (session) requirementQuery.session(session);
        const requirements = await requirementQuery;
        if ((requirements as any[]).length !== requirementIds.length) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "仅审核通过的采购需求可生成采购单");
        }

        const salesOrderIds = [
            ...new Set((requirements as any[]).map((item) => item.salesOrderId?.toString?.() || "").filter(Boolean)),
        ];
        const salesOrderQuery = useSalesOrderModel().order
            .find({
                _id: { $in: salesOrderIds.map((id) => toObjectId(id)) },
                _isDeleted: { $ne: true },
                status: { $in: ["待采购", "待生产", "生产中"] },
            })
            .select("_id status")
            .lean();
        if (session) salesOrderQuery.session(session);
        const salesOrders = await salesOrderQuery;
        const validSalesOrderIds = new Set<string>();
        for (const order of salesOrders as any[]) {
            const current = await ensureSalesOrderCompletionState(order, session);
            if (!hasSalesOrderCompletionRelease(current)) validSalesOrderIds.add(current._id.toString());
        }

        const requirementMap = new Map<string, any>(
            (requirements as any[]).map((item) => [item._id?.toString?.() || "", item]),
        );
        const nextRequirementQuantity = new Map<string, number>();
        const nextProductQuantity = new Map<string, number>();

        normalized.forEach((allocation) => {
            const requirement = requirementMap.get(allocation.requirementId);
            if (!requirement) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "存在无效缺料需求");
            }
            if (requirement.demandType !== "purchase") {
                throwInventoryError(400, CODE.INVALID_PARAMS, "只能关联采购类型缺料需求");
            }
            if (!validSalesOrderIds.has(requirement.salesOrderId?.toString?.() || "")) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "只能关联尚未放行的待采购、待生产或生产中销售订单");
            }

            const productId = requirement.productId?.toString?.() || "";
            const purchaseQuantity = normalizePurchaseQuantity(productQuantityMap.get(productId));
            if (purchaseQuantity <= 0) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "缺料产品不在采购单产品明细中");
            }

            const productAllocated = normalizePurchaseQuantity(
                (nextProductQuantity.get(productId) || 0) + allocation.allocatedQuantity,
            );
            if (productAllocated > purchaseQuantity) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "同一采购产品分配数量不能超过采购数量");
            }
            nextProductQuantity.set(productId, productAllocated);

            const requirementAllocated = normalizePurchaseQuantity(
                (nextRequirementQuantity.get(allocation.requirementId) || 0) + allocation.allocatedQuantity,
            );
            if (requirementAllocated > normalizePurchaseQuantity(requirement.shortageQuantity)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "同一缺料需求分配数量不能超过缺口数量");
            }
            nextRequirementQuantity.set(allocation.requirementId, requirementAllocated);
        });

        await this.assertRequirementRemainingQuantities(nextRequirementQuantity, excludePurchaseOrderId, session);

        return normalized.map((allocation) => {
            const requirement = requirementMap.get(allocation.requirementId);

            return {
                purchaseOrderId: toObjectId(context.purchaseOrderId),
                purchaseOrderNo: context.purchaseOrderNo,
                requirementId: toObjectId(allocation.requirementId),
                salesOrderId: requirement.salesOrderId,
                salesOrderNo: requirement.salesOrderNo || "",
                productId: requirement.productId,
                allocatedQuantity: allocation.allocatedQuantity,
                lockedAfterInboundQuantity: 0,
                status: "未完成",
                createdBy: actor,
                updatedBy: actor,
            };
        });
    }

    async replaceForPurchaseOrder(
        context: PurchaseOrderAllocationContext,
        allocations: PurchaseOrderAllocationReq[] = [],
        actor = "",
        excludePurchaseOrderId = "",
        session?: mongoose.ClientSession,
    ) {
        return await runPurchaseAllocationTransaction(session, async (currentSession) => {
            const docs = await this.buildAllocationDocs(context, allocations, actor, excludePurchaseOrderId, currentSession);
            return await this.replaceWithDocsForPurchaseOrder(context.purchaseOrderId, docs, actor, currentSession);
        });
    }

    async replaceWithDocsForPurchaseOrder(
        purchaseOrderId: string,
        docs: Array<Record<string, any>> = [],
        actor = "",
        session?: mongoose.ClientSession,
    ) {
        if (!isValidObjectId(purchaseOrderId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "purchaseOrderId 格式错误");
        }

        return await runPurchaseAllocationTransaction(session, async (currentSession) => {
            const existing = await this.allocation.find({ purchaseOrderId: toObjectId(purchaseOrderId) }).session(currentSession).lean() as any[];
            const requirementIds = [...new Set(docs.map((doc) => toText(doc.requirementId)))];
            if (requirementIds.some((id) => !isValidObjectId(id))) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "采购分配缺少有效的需求 ID");
            }
            const requirements = await PurchaseMaterialRequirement.find({ _id: { $in: requirementIds.map(toObjectId) } }).session(currentSession).lean() as any[];
            await this.lockAllocationChanges(existing, requirements, actor, currentSession);
            if (existing.some((row) => Number(row.lockedAfterInboundQuantity || 0) > 0)) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "已有采购入库，不能替换采购分配");
            }
            const purchaseOrder = await mongoose.connection.collection("purchaseorders").findOne({ _id: toObjectId(purchaseOrderId), _isDeleted: { $ne: true } }, { session: currentSession });
            if (!purchaseOrder) throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "采购单不存在");
            // 写入前在锁单事务中重新核对需求归属及剩余分配量，不能信任事务外生成的 docs。
            const validated = await this.buildAllocationDocs({
                purchaseOrderId, purchaseOrderNo: purchaseOrder.orderNo, items: purchaseOrder.items || [],
            }, docs.map((doc) => ({ requirementId: toText(doc.requirementId), allocatedQuantity: doc.allocatedQuantity })), actor, purchaseOrderId, currentSession);
            await this.allocation.deleteMany({ purchaseOrderId: toObjectId(purchaseOrderId) }, { session: currentSession });
            if (validated.length) await this.allocation.insertMany(validated, { session: currentSession });
            await usePurchaseMaterialRequirementModel().refreshProgress([
                ...existing.map((row) => row.requirementId), ...validated.map((doc) => doc.requirementId),
            ], actor, currentSession);
            return validated;
        });
    }

    async deleteByPurchaseOrder(purchaseOrderId: string, actor = "", session?: mongoose.ClientSession) {
        if (!isValidObjectId(purchaseOrderId)) return;
        return await runPurchaseAllocationTransaction(session, async (currentSession) => {
            const existing = await this.allocation.find({ purchaseOrderId: toObjectId(purchaseOrderId) }).session(currentSession).lean() as any[];
            await this.lockAllocationChanges(existing, [], actor, currentSession);
            if (existing.some((row) => Number(row.lockedAfterInboundQuantity || 0) > 0)) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "请先撤销采购入库，再删除采购分配");
            }
            await this.allocation.deleteMany({ purchaseOrderId: toObjectId(purchaseOrderId) }, { session: currentSession });
            await usePurchaseMaterialRequirementModel().refreshProgress(existing.map((row) => row.requirementId), actor, currentSession);
        });
    }

    async getByPurchaseOrder(purchaseOrderId: string) {
        if (!isValidObjectId(purchaseOrderId)) return [];

        return await this.allocation
            .find({
                purchaseOrderId: toObjectId(purchaseOrderId),
            })
            .sort({ createTime: 1 })
            .lean();
    }

    async calculateInboundLocks(
        purchaseOrderNo: string,
        items: any[],
        session?: mongoose.ClientSession,
    ) {
        const orderNo = toText(purchaseOrderNo);
        if (!orderNo || !Array.isArray(items) || !items.length) {
            return new Map<string, number>();
        }

        const allocationsQuery = this.allocation
            .find({
                purchaseOrderNo: orderNo,
            })
            .sort({ createTime: 1 })
            .lean();
        if (session) allocationsQuery.session(session);
        const allocations = await allocationsQuery;
        const remainingByProduct = new Map<string, number>();

        const incomingProducts = new Set(items.filter((item) => Number(item.quantity || 0) > 0).map((item) => toText(item.productId)));
        const checkedSalesOrders = new Set<string>();
        for (const allocation of allocations as any[]) {
            const productId = allocation.productId?.toString?.() || "";
            const remaining = normalizePurchaseQuantity(
                Number(allocation.allocatedQuantity || 0) - Number(allocation.lockedAfterInboundQuantity || 0),
            );
            if (productId && remaining > 0) {
                const salesOrderId = toText(allocation.salesOrderId);
                if (incomingProducts.has(productId) && !checkedSalesOrders.has(salesOrderId)) {
                    const order = await ensureSalesOrderCompletionState({ _id: salesOrderId }, session);
                    if (hasSalesOrderCompletionRelease(order)) {
                        throwInventoryError(409, CODE.INVENTORY_REFERENCED, `订单 ${order.orderNo || salesOrderId} 已放行，请先编辑采购单取消该订单尚未入库的分配，再办理其他订单入库`);
                    }
                    checkedSalesOrders.add(salesOrderId);
                }
                remainingByProduct.set(
                    productId,
                    normalizePurchaseQuantity((remainingByProduct.get(productId) || 0) + remaining),
                );
            }
        }

        const inboundByProduct = new Map<string, number>();
        items.forEach((item) => {
            const productId = item.productId?.toString?.() || "";
            const inboundQuantity = normalizePurchaseQuantity(item.quantity);
            if (!productId || inboundQuantity <= 0) return;
            inboundByProduct.set(
                productId,
                normalizePurchaseQuantity((inboundByProduct.get(productId) || 0) + inboundQuantity),
            );
        });

        const result = new Map<string, number>();
        inboundByProduct.forEach((inboundQuantity, productId) => {
            const remaining = remainingByProduct.get(productId) || 0;
            result.set(productId, Math.min(inboundQuantity, remaining));
        });

        return result;
    }

    async markInboundLocked(
        purchaseOrderNo: string,
        items: any[],
        actor = "",
        session?: mongoose.ClientSession,
    ): Promise<void> {
        if (!session) {
            return await runPurchaseAllocationTransaction(undefined, (currentSession) => this.markInboundLocked(purchaseOrderNo, items, actor, currentSession));
        }
        const locks = await this.calculateInboundLocks(purchaseOrderNo, items, session);
        if (!locks.size) return;

        const inboundBuckets = new Map<string, Array<{ item: any; remaining: number }>>();
        items.forEach((item: any) => {
            const productId = item.productId?.toString?.() || "";
            const remaining = normalizePurchaseQuantity(item.lockedQuantity || 0);
            if (!productId || remaining <= 0) return;
            const buckets = inboundBuckets.get(productId) || [];
            buckets.push({ item, remaining });
            inboundBuckets.set(productId, buckets);
        });

        const touchedRequirementIds: any[] = [];
        const touchedSalesOrderIds = new Set<string>();
        const orderAllocationsQuery = this.allocation
            .find({ purchaseOrderNo: toText(purchaseOrderNo) })
            .select("_id requirementId salesOrderId productId allocatedQuantity lockedAfterInboundQuantity")
            .lean();
        if (session) orderAllocationsQuery.session(session);
        const orderAllocations = await orderAllocationsQuery;
        const ordersToLock = new Set<string>();
        for (const allocation of orderAllocations as any[]) {
            if ((locks.get(toText(allocation.productId)) || 0) > 0
                && Number(allocation.allocatedQuantity || 0) > Number(allocation.lockedAfterInboundQuantity || 0)) {
                ordersToLock.add(toText(allocation.salesOrderId));
            }
        }
        for (const salesOrderId of [...ordersToLock].sort()) {
            await lockSalesOrderForProduction(salesOrderId, actor, session);
        }
        const requirementIds = [
            ...new Set(orderAllocations
                .map((item: any) => item.requirementId?.toString?.() || "")
                .filter(isValidObjectId)),
        ];
        const requirementQuery = requirementIds.length
            ? PurchaseMaterialRequirement.find({
                _id: { $in: requirementIds.map((id) => toObjectId(id)) },
            }).select("_id salesOrderId productId demandProductId").lean()
            : null;
        if (session && requirementQuery) requirementQuery.session(session);
        const requirementRows = requirementQuery ? await requirementQuery : [];
        const requirementMap = new Map<string, any>(
            (requirementRows as any[]).map((item) => [item._id?.toString?.() || "", item]),
        );
        for (const [productId, quantity] of locks.entries()) {
            let remaining = normalizePurchaseQuantity(quantity);
            if (remaining <= 0) continue;

            const allocationsQuery = this.allocation
                .find({
                    purchaseOrderNo: toText(purchaseOrderNo),
                    productId: toObjectId(productId),
                    status: "未完成",
                    $expr: { $lt: ["$lockedAfterInboundQuantity", "$allocatedQuantity"] },
                })
                .sort({ createTime: 1 });
            if (session) allocationsQuery.session(session);
            const allocations = await allocationsQuery;

            for (const allocation of allocations as any[]) {
                if (remaining <= 0) break;
                const requirement = requirementMap.get(allocation.requirementId?.toString?.() || "");
                if (!requirement || toText(requirement.salesOrderId) !== toText(allocation.salesOrderId)
                    || toText(requirement.productId) !== productId) {
                    throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购分配的需求来源不完整，请先核对历史记录");
                }
                const unlocked = normalizePurchaseQuantity(
                    Number(allocation.allocatedQuantity || 0) - Number(allocation.lockedAfterInboundQuantity || 0),
                );
                const delta = Math.min(unlocked, remaining);
                allocation.lockedAfterInboundQuantity = normalizePurchaseQuantity(
                    Number(allocation.lockedAfterInboundQuantity || 0) + delta,
                );
                if (allocation.lockedAfterInboundQuantity >= normalizePurchaseQuantity(allocation.allocatedQuantity)) {
                    allocation.status = "已完成";
                }
                allocation.updatedBy = actor;
                await allocation.save(session ? { session } : undefined);
                let reservationRemaining = delta;
                // 成品直采需求（订单项无 BOM 下级，采购的就是订单要的成品）
                // 入库后计入成品齐套，订单直接进入待出库。
                const isDirectFinishedDemand = Boolean(
                    requirement?.demandProductId
                    && requirement.demandProductId.toString() === requirement.productId?.toString?.(),
                );
                for (const bucket of inboundBuckets.get(productId) || []) {
                    if (reservationRemaining <= 0) break;
                    const bucketQuantity = Math.min(bucket.remaining, reservationRemaining);
                    if (bucketQuantity <= 0) continue;
                    await SalesOrderStockReservation.create([{
                        salesOrderId: allocation.salesOrderId,
                        salesOrderNo: allocation.salesOrderNo,
                        demandProductId: requirement?.demandProductId || allocation.productId,
                        stockProductId: allocation.productId,
                        warehouseId: bucket.item.warehouseId || null,
                        locationId: bucket.item.locationId || null,
                        reservationType: isDirectFinishedDemand ? "finished-product" : "production-material",
                        requiredQuantity: allocation.allocatedQuantity,
                        reservedQuantity: bucketQuantity,
                        sourceAllocationId: allocation._id,
                        createdBy: actor,
                        updatedBy: actor,
                    }], session ? { session } : undefined);
                    bucket.remaining = normalizePurchaseQuantity(bucket.remaining - bucketQuantity);
                    reservationRemaining = normalizePurchaseQuantity(reservationRemaining - bucketQuantity);
                }
                if (reservationRemaining > 0) {
                    throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购入库仓位锁定数量不足，请重新核对入库明细");
                }
                touchedRequirementIds.push(allocation.requirementId);
                touchedSalesOrderIds.add(allocation.salesOrderId?.toString?.() || "");
                remaining = normalizePurchaseQuantity(remaining - delta);
            }
            if (remaining > 0) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购分配余额已变化，请刷新后重试");
        }

        await usePurchaseMaterialRequirementModel().refreshProgress(touchedRequirementIds, actor, session);
        await this.refreshSalesOrderReadiness([...touchedSalesOrderIds], actor, session);
    }

    async unmarkInboundLocked(purchaseOrderNo: string, items: any[], actor = "", session?: mongoose.ClientSession): Promise<void> {
        if (!session) {
            return await runPurchaseAllocationTransaction(undefined, (currentSession) => this.unmarkInboundLocked(purchaseOrderNo, items, actor, currentSession));
        }
        const orderNo = toText(purchaseOrderNo);
        if (!orderNo || !Array.isArray(items) || !items.length) return;

        const locks = new Map<string, number>();
        items.forEach((item) => {
            const productId = item.productId?.toString?.() || "";
            const lockedQuantity = normalizePurchaseQuantity(item.lockedQuantity || 0);
            if (!productId || lockedQuantity <= 0) return;
            locks.set(
                productId,
                normalizePurchaseQuantity((locks.get(productId) || 0) + lockedQuantity),
            );
        });
        if (!locks.size) return;
        await this.assertInboundCanBeReversed(purchaseOrderNo, items, session, actor);

        const changes: Array<{ allocation: any; delta: number }> = [];
        for (const [productId, quantity] of locks.entries()) {
            let remaining = normalizePurchaseQuantity(quantity);
            if (remaining <= 0) continue;

            const allocationsQuery = this.allocation
                .find({
                    purchaseOrderNo: orderNo,
                    productId: toObjectId(productId),
                    lockedAfterInboundQuantity: { $gt: 0 },
                })
                .sort({ createTime: -1 });
            if (session) allocationsQuery.session(session);
            const allocations = await allocationsQuery;
            for (const allocation of allocations as any[]) {
                if (remaining <= 0) break;
                const locked = normalizePurchaseQuantity(allocation.lockedAfterInboundQuantity || 0);
                const delta = Math.min(locked, remaining);
                if (delta <= 0) continue;
                changes.push({ allocation, delta });
                remaining = normalizePurchaseQuantity(remaining - delta);
            }

            if (remaining > 0) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购分配锁定数量不足，无法删除入库单");
            }
        }

        const touchedRequirementIds: any[] = [];
        const touchedSalesOrderIds = new Set<string>();
        for (const change of changes) {
            const allocation = change.allocation;
            const salesOrderQuery = useSalesOrderModel().order.findById(allocation.salesOrderId).select("status").lean();
            if (session) salesOrderQuery.session(session);
            const salesOrder = await salesOrderQuery as any;
            if (salesOrder && !["待采购", "待生产", "待出库"].includes(salesOrder.status)) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "销售订单已进入生产或后续环节，不能冲销支撑该订单的采购入库");
            }
            let releaseRemaining = change.delta;
            const reservationsQuery = SalesOrderStockReservation.find({
                sourceAllocationId: allocation._id,
                status: "active",
            }).sort({ createTime: -1 });
            if (session) reservationsQuery.session(session);
            const reservations = await reservationsQuery;
            const consumedQuery = SalesOrderStockReservation.exists({
                sourceAllocationId: allocation._id,
                $or: [{ consumedQuantity: { $gt: 0 } }, { productionAllocatedQuantity: { $gt: 0 } }],
            });
            if (session) consumedQuery.session(session);
            if (await consumedQuery) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "物料已分配给生产或已经出库，不能冲销来源采购入库");
            }
            for (const reservation of reservations as any[]) {
                if (releaseRemaining <= 0) break;
                const releasable = normalizePurchaseQuantity(
                    reservation.reservedQuantity - reservation.consumedQuantity - reservation.releasedQuantity,
                );
                const released = Math.min(releasable, releaseRemaining);
                const releasedQuantity = normalizePurchaseQuantity(reservation.releasedQuantity + released);
                const status = releasedQuantity + reservation.consumedQuantity >= reservation.reservedQuantity
                    ? "released"
                    : "active";
                const changed = await SalesOrderStockReservation.updateOne({
                    _id: reservation._id,
                    releasedQuantity: reservation.releasedQuantity,
                    consumedQuantity: reservation.consumedQuantity,
                    $or: [{ productionAllocatedQuantity: { $exists: false } }, { productionAllocatedQuantity: 0 }],
                }, { $set: { releasedQuantity, status, updatedBy: actor } }, session ? { session } : {});
                if (changed.modifiedCount !== 1) {
                    throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购预占已分配给生产或数量已变化，请刷新后重试");
                }
                releaseRemaining = normalizePurchaseQuantity(releaseRemaining - released);
            }
            if (releaseRemaining > 0) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "可释放采购预占不足，无法冲销入库");
            }
            allocation.lockedAfterInboundQuantity = normalizePurchaseQuantity(
                Number(allocation.lockedAfterInboundQuantity || 0) - change.delta,
            );
            allocation.status = allocation.lockedAfterInboundQuantity >= normalizePurchaseQuantity(allocation.allocatedQuantity)
                ? "已完成"
                : "未完成";
            allocation.updatedBy = actor;
            await allocation.save(session ? { session } : undefined);
            touchedRequirementIds.push(allocation.requirementId);
            touchedSalesOrderIds.add(allocation.salesOrderId?.toString?.() || "");
        }

        await usePurchaseMaterialRequirementModel().refreshProgress(touchedRequirementIds, actor, session);
        await this.refreshSalesOrderReadiness([...touchedSalesOrderIds], actor, session);
    }

    async assertInboundCanBeReversed(purchaseOrderNo: string, items: any[], session?: mongoose.ClientSession, actor = "") {
        const productIds = (Array.isArray(items) ? items : [])
            .filter((item: any) => Number(item.lockedQuantity || 0) > 0)
            .map((item: any) => item.productId)
            .filter(Boolean);
        if (!productIds.length) return;
        const allocationsQuery = this.allocation.find({
            purchaseOrderNo: toText(purchaseOrderNo),
            productId: { $in: productIds },
            lockedAfterInboundQuantity: { $gt: 0 },
        }).select("_id salesOrderId").lean();
        if (session) allocationsQuery.session(session);
        const allocations = await allocationsQuery as any[];
        const salesOrderIds = [...new Set(allocations.map((item) => item.salesOrderId?.toString?.()).filter(Boolean))];
        for (const salesOrderId of salesOrderIds.sort()) {
            await assertSalesOrderProductionReversalAllowed(salesOrderId, session);
            if (session) await lockSalesOrderForProduction(salesOrderId, actor, session);
        }
        const blockedQuery = useSalesOrderModel().order.exists({
            _id: { $in: salesOrderIds.map((id) => toObjectId(id)) },
            status: { $nin: ["待采购", "待生产", "待出库"] },
            _isDeleted: { $ne: true },
        });
        if (session) blockedQuery.session(session);
        if (await blockedQuery) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "销售订单已进入生产或后续环节，不能冲销支撑该订单的采购入库");
        }
        if (allocations.length) {
            const consumedQuery = SalesOrderStockReservation.exists({
                sourceAllocationId: { $in: allocations.map((item) => item._id) },
                $or: [{ consumedQuantity: { $gt: 0 } }, { productionAllocatedQuantity: { $gt: 0 } }],
            });
            if (session) consumedQuery.session(session);
            if (await consumedQuery) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "物料已分配给生产或已经出库，不能冲销来源采购入库");
            }
        }
    }

    private async lockAllocationChanges(
        existing: any[],
        nextRequirements: any[],
        actor: string,
        session: mongoose.ClientSession,
    ) {
        const salesOrderIds = [...new Set([...existing, ...nextRequirements].map((row) => toText(row.salesOrderId)))].sort();
        for (const salesOrderId of salesOrderIds) {
            const order = await ensureSalesOrderCompletionState({ _id: salesOrderId }, session);
            if (!hasSalesOrderCompletionRelease(order)) {
                await lockSalesOrderForProduction(salesOrderId, actor, session);
                continue;
            }

            const oldRows = existing.filter((row) => toText(row.salesOrderId) === salesOrderId);
            const hasNextAllocation = nextRequirements.some((row) => toText(row.salesOrderId) === salesOrderId);
            if (!oldRows.length || hasNextAllocation || oldRows.some((row) => Number(row.lockedAfterInboundQuantity || 0) !== 0)) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, `订单 ${order.orderNo || salesOrderId} 已放行，仅允许取消整个尚未入库的旧分配`);
            }
            const reservation = await SalesOrderStockReservation.exists({
                sourceAllocationId: { $in: oldRows.map((row) => row._id) },
            }).session(session);
            if (reservation) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "已形成预占或存在入库历史的分配不能直接取消，请保留来源记录");
            }

            // 只允许删除未到货分配，仍与出库/完工等操作共用订单版本，不能借此重新分配已放行订单。
            const changed = await useSalesOrderModel().order.updateOne({
                _id: order._id,
                _isDeleted: { $ne: true },
                status: order.status,
                "productionCompletion.source": order.productionCompletion.source,
                productionPlanVersion: order.productionPlanVersion === undefined ? { $exists: false } : order.productionPlanVersion,
            }, { $inc: { productionPlanVersion: 1 }, $set: { updatedBy: actor } }, { session });
            if (changed.matchedCount !== 1) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "订单已被其他操作更新，请刷新后重试");
            }
        }
    }

    private async refreshSalesOrderReadiness(
        salesOrderIds: string[],
        actor: string,
        session?: mongoose.ClientSession,
    ) {
        for (const salesOrderId of salesOrderIds.filter(isValidObjectId)) {
            await refreshSalesOrderFulfillmentStatus(salesOrderId, actor, { session });
        }
    }

    private normalizeAllocationInput(allocations: PurchaseOrderAllocationReq[] = []) {
        if (!Array.isArray(allocations)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "allocations 必须是数组");
        }

        const result: Array<{ requirementId: string; allocatedQuantity: number }> = [];
        const requirementIds = new Set<string>();

        allocations.forEach((allocation, index) => {
            const requirementId = toText(allocation?.requirementId || (allocation as any)?.id);
            if (!isValidObjectId(requirementId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, `第 ${index + 1} 条分配缺少有效需求ID`);
            }
            if (requirementIds.has(requirementId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "同一缺料需求不能重复分配");
            }
            requirementIds.add(requirementId);

            const allocatedQuantity = normalizePurchaseQuantity(allocation?.allocatedQuantity);
            if (allocatedQuantity <= 0) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "分配数量必须大于0");
            }

            result.push({ requirementId, allocatedQuantity });
        });

        return result;
    }

    private async assertRequirementRemainingQuantities(
        nextRequirementQuantity: Map<string, number>,
        excludePurchaseOrderId = "",
        session?: mongoose.ClientSession,
    ) {
        const requirementIds = [...nextRequirementQuantity.keys()];
        if (!requirementIds.length) return;

        const match: Record<string, any> = {
            requirementId: { $in: requirementIds.map((id) => toObjectId(id)) },
        };
        if (isValidObjectId(excludePurchaseOrderId)) {
            match.purchaseOrderId = { $ne: toObjectId(excludePurchaseOrderId) };
        }

        const allocationQuery = this.allocation.aggregate([
            { $match: match },
            {
                $group: {
                    _id: "$requirementId",
                    allocatedQuantity: { $sum: "$allocatedQuantity" },
                },
            },
        ]);
        if (session) allocationQuery.session(session);
        const rows = await allocationQuery;
        const existingMap = new Map<string, number>(
            rows.map((row: any) => [row._id?.toString?.() || "", normalizePurchaseQuantity(row.allocatedQuantity)]),
        );
        const requirementQuery = PurchaseMaterialRequirement
            .find({ _id: { $in: requirementIds.map((id) => toObjectId(id)) } })
            .select("_id shortageQuantity")
            .lean();
        if (session) requirementQuery.session(session);
        const requirements = await requirementQuery;
        const shortageMap = new Map<string, number>(
            (requirements as any[]).map((item) => [
                item._id?.toString?.() || "",
                normalizePurchaseQuantity(item.shortageQuantity),
            ]),
        );

        for (const [requirementId, nextQuantity] of nextRequirementQuantity.entries()) {
            const existingQuantity = existingMap.get(requirementId) || 0;
            const shortageQuantity = shortageMap.get(requirementId) || 0;
            const total = normalizePurchaseQuantity(existingQuantity + nextQuantity);
            if (total > shortageQuantity) {
                if (existingQuantity >= shortageQuantity) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "该采购申请缺料已全部分配，不能再合并生成采购单");
                }
                throwInventoryError(400, CODE.INVALID_PARAMS, "缺料需求累计分配数量不能超过缺口数量");
            }
        }
    }

}

export const usePurchaseOrderAllocationModel = () =>
    new PurchaseOrderAllocationModel(PurchaseOrderAllocation);

export { PurchaseOrderAllocation };
