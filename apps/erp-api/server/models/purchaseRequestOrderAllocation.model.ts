import mongoose from "mongoose";
import { CODE } from "~~/server/utils/code";
import {
    escapeRegExp,
    getPageParams,
    isValidObjectId,
    throwInventoryError,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import { PurchaseRequest } from "~~/server/models/purchaseRequest.model";
import { PurchaseMaterialRequirement } from "~~/server/models/purchaseMaterialRequirement.model";
import { PurchaseOrderAllocation, runPurchaseAllocationTransaction } from "~~/server/models/purchaseOrderAllocation.model";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { ensureSalesOrderCompletionState, hasSalesOrderCompletionRelease, lockSalesOrderForProduction } from "~~/server/services/salesOrderCompletionState";

const { Schema } = mongoose;

export interface PurchaseRequestOrderAllocationReq {
    purchaseRequestId?: string;
    purchaseRequestNo?: string;
    purchaseRequestItemIndex?: number;
    productId?: string;
    requirementId?: string;
    allocatedQuantity?: number | string;
}

const normalizeQuantity = (value: unknown) => {
    const quantity = Number(value || 0);
    return Number.isFinite(quantity) ? Number(quantity.toFixed(3)) : 0;
};

const withSession = (query: any, session?: mongoose.ClientSession) => session ? query.session(session) : query;

const allocationSchema = new Schema(
    {
        purchaseOrderId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", required: true, index: true },
        purchaseOrderNo: { type: String, required: true, trim: true, index: true },
        purchaseRequestId: { type: Schema.Types.ObjectId, ref: "PurchaseRequest", required: true, index: true },
        purchaseRequestNo: { type: String, required: true, trim: true, index: true },
        purchaseRequestItemIndex: { type: Number, required: true, min: 0 },
        salesOrderNo: { type: String, default: "", trim: true, index: true },
        productId: { type: Schema.Types.ObjectId, ref: "InventoryProduct", required: true, index: true },
        requirementId: { type: Schema.Types.ObjectId, ref: "PurchaseMaterialRequirement", default: null, index: true },
        allocatedQuantity: { type: Number, required: true, min: 0 },
        createdBy: { type: String, default: "" },
        updatedBy: { type: String, default: "" },
    },
    {
        versionKey: false,
        timestamps: { createdAt: "createTime", updatedAt: "updateTime" },
    },
);

allocationSchema.index(
    { purchaseOrderId: 1, purchaseRequestId: 1, purchaseRequestItemIndex: 1 },
    { unique: true },
);
allocationSchema.index({ purchaseRequestId: 1, purchaseRequestItemIndex: 1 });

export const PurchaseRequestOrderAllocation =
    mongoose.models.PurchaseRequestOrderAllocation
    || mongoose.model("PurchaseRequestOrderAllocation", allocationSchema);

class PurchaseRequestOrderAllocationModel {
    private async assertRequestSourcesOpen(requests: any[], actor: string, session?: mongoose.ClientSession,
        lock = false, releasedRemovals = new Set<string>()) {
        const productionIds = [...new Set(requests.map((request) => toText(request.productionOrderId)).filter(Boolean))];
        if (productionIds.some((id) => !isValidObjectId(id))) {
            throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购申请的生产单来源无效，请先核对历史单据");
        }
        const productionOrders = productionIds.length ? await withSession(ProductionOrder.find({
            _id: { $in: productionIds.map(toObjectId) },
        }).lean(), session) as any[] : [];
        const productionMap = new Map(productionOrders.map((order) => [toText(order._id), order]));
        const salesOrderIds = new Map<string, { requiresCompletion: boolean; removalOnly: boolean }>();
        const addSource = (salesOrderId: string, requiresCompletion: boolean, removalOnly: boolean) => {
            const current = salesOrderIds.get(salesOrderId);
            salesOrderIds.set(salesOrderId, { requiresCompletion: requiresCompletion || current?.requiresCompletion === true,
                removalOnly: removalOnly && current?.removalOnly !== false });
        };
        for (const request of requests) {
            const removalOnly = releasedRemovals.has(toText(request._id));
            if (request.salesOrderId) addSource(toText(request.salesOrderId), false, removalOnly);
            else if (toText(request.salesOrderNo)) {
                const salesOrder = await withSession(useSalesOrderModel().order.findOne({
                    orderNo: toText(request.salesOrderNo), _isDeleted: { $ne: true },
                }).select("_id").lean(), session) as any;
                if (!salesOrder) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购申请的销售订单来源无法追溯，请先核对历史单据");
                addSource(toText(salesOrder._id), false, removalOnly);
            }
            let production = request.productionOrderId ? productionMap.get(toText(request.productionOrderId)) : null;
            if (!production && !request.productionOrderId && toText(request.productionOrderNo)) {
                production = await withSession(ProductionOrder.findOne({ documentNo: toText(request.productionOrderNo) }).lean(), session);
            }
            if ((request.productionOrderId || toText(request.productionOrderNo)) && !production) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购申请的来源生产单不存在，请先核对历史单据");
            }
            if (production && production.sourceType !== "stock" && !production.salesOrderId) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "来源生产单的销售订单归属缺失，请先核对历史单据");
            }
            if (production?.salesOrderId) addSource(toText(production.salesOrderId), true, removalOnly);
        }
        for (const salesOrderId of [...salesOrderIds.keys()].sort()) {
            const source = salesOrderIds.get(salesOrderId)!;
            const order = await ensureSalesOrderCompletionState({ _id: salesOrderId }, session);
            if (hasSalesOrderCompletionRelease(order)) {
                if (!lock || !session || !source.removalOnly) {
                    throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购申请来源销售订单已放行，不能继续生成或修改采购分配");
                }
                const changed = await useSalesOrderModel().order.updateOne({
                    _id: order._id, _isDeleted: { $ne: true }, "productionCompletion.source": order.productionCompletion.source,
                    productionPlanVersion: order.productionPlanVersion === undefined ? { $exists: false } : order.productionPlanVersion,
                }, { $inc: { productionPlanVersion: 1 }, $set: { updatedBy: actor } }, { session });
                if (changed.matchedCount !== 1) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "来源销售订单已变化，请刷新后重试");
            } else if (lock && session) {
                await lockSalesOrderForProduction(salesOrderId, actor, session, { requireCompletion: source.requiresCompletion });
            }
        }
    }

    private async releasedRemovalRequests(existing: any[], next: Record<string, any>[], purchaseOrderNo: string,
        purchaseOrderId: string, session: mongoose.ClientSession) {
        const retained = new Set(next.map((doc) => toText(doc.purchaseRequestId)));
        const removable = new Set(existing.map((doc) => toText(doc.purchaseRequestId)).filter((id) => !retained.has(id)));
        if (!removable.size) return removable;
        const inbound = await mongoose.connection.collection("inventoryinbounds").findOne({
            type: "采购", purchaseOrderNo, stockApplied: true, _isDeleted: { $ne: true },
        }, { session });
        if (inbound) return new Set<string>();
        for (const doc of existing) {
            if (!removable.has(toText(doc.purchaseRequestId)) || !doc.requirementId) continue;
            const legacy = await PurchaseOrderAllocation.exists({ purchaseOrderId: toObjectId(purchaseOrderId), requirementId: doc.requirementId }).session(session);
            if (legacy) removable.delete(toText(doc.purchaseRequestId));
        }
        return removable;
    }

    async candidates(options: {
        productId?: string;
        purchaseOrderId?: string;
        keyword?: string;
        page?: number;
        limit?: number;
    }) {
        const productId = toText(options.productId);
        if (!isValidObjectId(productId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
        }

        const filter: Record<string, any> = {
            status: "approved",
            "items.productId": productId,
        };
        const keyword = toText(options.keyword);
        if (keyword) {
            const regex = new RegExp(escapeRegExp(keyword), "i");
            filter.$or = [{ requestNo: regex }, { salesOrderNo: regex }];
        }

        const requests = await PurchaseRequest.find(filter)
            .sort({ processedAt: -1, updateTime: -1 })
            .lean() as any[];
        const requestIds = requests.map((request) => request._id);
        const requirements = requestIds.length
            ? await PurchaseMaterialRequirement.find({
                purchaseRequestId: { $in: requestIds },
                productId: toObjectId(productId),
                demandType: "purchase",
                poolReady: true,
                status: "未完成",
            }).lean() as any[]
            : [];
        const requirementById = new Map(
            requirements.map((item) => [item._id?.toString?.() || "", item]),
        );
        const requirementByRequestProduct = new Map(
            requirements.map((item) => [
                `${item.purchaseRequestId?.toString?.() || ""}:${item.productId?.toString?.() || ""}`,
                item,
            ]),
        );

        const purchaseOrderId = toText(options.purchaseOrderId);
        const directMatch: Record<string, any> = {
            purchaseRequestId: { $in: requestIds },
            productId: toObjectId(productId),
            $or: [{ requirementId: null }, { requirementId: { $exists: false } }],
        };
        if (isValidObjectId(purchaseOrderId)) {
            directMatch.purchaseOrderId = { $ne: toObjectId(purchaseOrderId) };
        }
        const directProgress = requestIds.length
            ? await PurchaseRequestOrderAllocation.aggregate([
                {
                    $match: directMatch,
                },
                {
                    $group: {
                        _id: {
                            purchaseRequestId: "$purchaseRequestId",
                            purchaseRequestItemIndex: "$purchaseRequestItemIndex",
                        },
                        allocatedQuantity: { $sum: "$allocatedQuantity" },
                    },
                },
            ])
            : [];
        const directProgressMap = new Map(
            directProgress.map((item: any) => [
                `${item._id.purchaseRequestId?.toString?.() || ""}:${item._id.purchaseRequestItemIndex}`,
                normalizeQuantity(item.allocatedQuantity),
            ]),
        );
        const currentSalesAllocations = isValidObjectId(purchaseOrderId)
            ? await PurchaseOrderAllocation.find({
                purchaseOrderId: toObjectId(purchaseOrderId),
                productId: toObjectId(productId),
            }).select("requirementId allocatedQuantity").lean() as any[]
            : [];
        const currentSalesAllocationMap = new Map(
            currentSalesAllocations.map((item) => [
                item.requirementId?.toString?.() || "",
                normalizeQuantity(item.allocatedQuantity),
            ]),
        );

        const list: any[] = [];
        requests.forEach((request) => {
            (request.items || []).forEach((item: any, itemIndex: number) => {
                if (toText(item.productId) !== productId) return;

                const requestedQuantity = normalizeQuantity(item.quantity);
                const isSalesOrderRequest = request.category === "销售订单采购";
                const requirement = isSalesOrderRequest
                    ? requirementById.get(toText(item.requirementId))
                        || requirementByRequestProduct.get(`${request._id}:${productId}`)
                    : null;
                if (isSalesOrderRequest && !requirement) return;

                const currentAllocatedQuantity = isSalesOrderRequest
                    ? currentSalesAllocationMap.get(requirement._id?.toString?.() || "") || 0
                    : 0;
                const allocatedQuantity = isSalesOrderRequest
                    ? Math.max(normalizeQuantity(requirement.allocatedQuantity) - currentAllocatedQuantity, 0)
                    : directProgressMap.get(`${request._id}:${itemIndex}`) || 0;
                const remainingQuantity = isSalesOrderRequest
                    ? normalizeQuantity(
                        Number(requirement.remainingPurchaseQuantity || 0) + currentAllocatedQuantity,
                    )
                    : Math.max(normalizeQuantity(requestedQuantity - allocatedQuantity), 0);
                if (remainingQuantity <= 0) return;

                list.push({
                    purchaseRequestId: request._id.toString(),
                    purchaseRequestNo: request.requestNo || "",
                    purchaseRequestItemIndex: itemIndex,
                    salesOrderNo: request.salesOrderNo || "",
                    category: request.category || "",
                    productId,
                    requirementId: requirement?._id?.toString?.() || "",
                    requestedQuantity,
                    allocatedQuantity,
                    remainingQuantity,
                    unitName: item.unit || requirement?.unitName || "",
                });
            });
        });

        const pageOptions = getPageParams({ page: options.page, limit: options.limit });
        const pageList = list.slice(pageOptions.skip, pageOptions.skip + pageOptions.limit);
        return {
            list: pageList,
            pagination: {
                page: pageOptions.page,
                limit: pageOptions.limit,
                total: list.length,
                hasMore: pageOptions.skip + pageList.length < list.length,
            },
        };
    }

    async buildDocs(
        context: { purchaseOrderId: string; purchaseOrderNo: string },
        allocations: PurchaseRequestOrderAllocationReq[],
        actor: string,
        excludePurchaseOrderId = "",
        session?: mongoose.ClientSession,
    ) {
        const directAllocations = allocations.filter((item) => !toText(item.requirementId));
        const salesAllocations = allocations.filter((item) => toText(item.requirementId));
        if (!directAllocations.length && !salesAllocations.length) return [];

        const keys = new Set<string>();
        const normalized = directAllocations.map((allocation) => {
            const purchaseRequestId = toText(allocation.purchaseRequestId);
            const productId = toText(allocation.productId);
            const purchaseRequestItemIndex = Number(allocation.purchaseRequestItemIndex);
            const allocatedQuantity = normalizeQuantity(allocation.allocatedQuantity);
            if (
                !isValidObjectId(purchaseRequestId)
                || !isValidObjectId(productId)
                || !Number.isInteger(purchaseRequestItemIndex)
                || purchaseRequestItemIndex < 0
            ) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "采购申请分配信息不合法");
            }
            if (allocatedQuantity <= 0) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "分配数量必须大于0");
            }
            const key = `${purchaseRequestId}:${purchaseRequestItemIndex}`;
            if (keys.has(key)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "同一采购申请明细不能重复分配");
            }
            keys.add(key);
            return { purchaseRequestId, productId, purchaseRequestItemIndex, allocatedQuantity };
        });

        const requests = await withSession(PurchaseRequest.find({
            _id: { $in: normalized.map((item) => toObjectId(item.purchaseRequestId)) },
            status: "approved",
            category: { $ne: "销售订单采购" },
        }).lean(), session) as any[];
        await this.assertRequestSourcesOpen(requests, actor, session);
        const requestMap = new Map(requests.map((request) => [request._id.toString(), request]));
        const match: Record<string, any> = {
            purchaseRequestId: { $in: normalized.map((item) => toObjectId(item.purchaseRequestId)) },
        };
        if (isValidObjectId(excludePurchaseOrderId)) {
            match.purchaseOrderId = { $ne: toObjectId(excludePurchaseOrderId) };
        }
        const progress = await withSession(PurchaseRequestOrderAllocation.aggregate([
            { $match: match },
            {
                $group: {
                    _id: {
                        purchaseRequestId: "$purchaseRequestId",
                        purchaseRequestItemIndex: "$purchaseRequestItemIndex",
                    },
                    allocatedQuantity: { $sum: "$allocatedQuantity" },
                },
            },
        ]), session);
        const progressMap = new Map(progress.map((item: any) => [
            `${item._id.purchaseRequestId?.toString?.() || ""}:${item._id.purchaseRequestItemIndex}`,
            normalizeQuantity(item.allocatedQuantity),
        ]));

        const directDocs = normalized.map((allocation) => {
            const request = requestMap.get(allocation.purchaseRequestId);
            const item = request?.items?.[allocation.purchaseRequestItemIndex];
            if (!request || toText(item?.productId) !== allocation.productId) {
                throwInventoryError(409, CODE.INVALID_PARAMS, "采购申请状态或产品已变化，请刷新后重试");
            }
            const alreadyAllocated = progressMap.get(
                `${allocation.purchaseRequestId}:${allocation.purchaseRequestItemIndex}`,
            ) || 0;
            const requestedQuantity = normalizeQuantity(item.quantity);
            if (alreadyAllocated + allocation.allocatedQuantity > requestedQuantity) {
                if (alreadyAllocated >= requestedQuantity) {
                    throwInventoryError(
                        409,
                        CODE.INVALID_PARAMS,
                        `采购申请 ${request.requestNo || ""} 已全部分配，不能再合并生成采购单`,
                    );
                }
                throwInventoryError(
                    409,
                    CODE.INVALID_PARAMS,
                    `采购申请 ${request.requestNo || ""} 剩余数量不足（剩余 ${requestedQuantity - alreadyAllocated}），请刷新后重试`,
                );
            }
            return {
                purchaseOrderId: toObjectId(context.purchaseOrderId),
                purchaseOrderNo: context.purchaseOrderNo,
                purchaseRequestId: toObjectId(allocation.purchaseRequestId),
                purchaseRequestNo: request.requestNo || "",
                purchaseRequestItemIndex: allocation.purchaseRequestItemIndex,
                salesOrderNo: request.salesOrderNo || "",
                productId: toObjectId(allocation.productId),
                allocatedQuantity: allocation.allocatedQuantity,
                createdBy: actor,
                updatedBy: actor,
            };
        });

        if (!salesAllocations.length) return directDocs;
        const salesRequestIds = salesAllocations.map((item) => toText(item.purchaseRequestId));
        const salesRequests = await withSession(PurchaseRequest.find({
            _id: { $in: salesRequestIds.filter(isValidObjectId).map((id) => toObjectId(id)) },
            status: "approved",
            category: "销售订单采购",
        }).lean(), session) as any[];
        await this.assertRequestSourcesOpen(salesRequests, actor, session);
        const salesRequestMap = new Map(
            salesRequests.map((request) => [request._id.toString(), request]),
        );
        const requirementIds = salesAllocations.map((item) => toText(item.requirementId));
        const salesRequirements = await withSession(PurchaseMaterialRequirement.find({
            _id: { $in: requirementIds.filter(isValidObjectId).map((id) => toObjectId(id)) },
            poolReady: true,
            demandType: "purchase",
        }).lean(), session) as any[];
        const salesRequirementMap = new Map(
            salesRequirements.map((item) => [item._id.toString(), item]),
        );
        const salesDocs = salesAllocations.map((allocation) => {
            const purchaseRequestId = toText(allocation.purchaseRequestId);
            const requirementId = toText(allocation.requirementId);
            const productId = toText(allocation.productId);
            const itemIndex = Number(allocation.purchaseRequestItemIndex);
            const allocatedQuantity = normalizeQuantity(allocation.allocatedQuantity);
            const request = salesRequestMap.get(purchaseRequestId);
            const item = request?.items?.[itemIndex];
            const requirement = salesRequirementMap.get(requirementId);
            if (
                !request
                || !requirement
                || !Number.isInteger(itemIndex)
                || itemIndex < 0
                || toText(item?.productId) !== productId
                || requirement.purchaseRequestId?.toString?.() !== purchaseRequestId
                || requirement.productId?.toString?.() !== productId
                || requirement.salesOrderId?.toString?.() !== request.salesOrderId?.toString?.()
                || toText(requirement.salesOrderNo) !== toText(request.salesOrderNo)
                || allocatedQuantity <= 0
            ) {
                throwInventoryError(409, CODE.INVALID_PARAMS, "销售订单采购申请状态已变化，请刷新后重试");
            }
            return {
                purchaseOrderId: toObjectId(context.purchaseOrderId),
                purchaseOrderNo: context.purchaseOrderNo,
                purchaseRequestId: toObjectId(purchaseRequestId),
                purchaseRequestNo: request.requestNo || "",
                purchaseRequestItemIndex: itemIndex,
                salesOrderNo: request.salesOrderNo || "",
                productId: toObjectId(productId),
                requirementId: toObjectId(requirementId),
                allocatedQuantity,
                createdBy: actor,
                updatedBy: actor,
            };
        });

        return [...directDocs, ...salesDocs];
    }

    async replaceWithDocs(purchaseOrderId: string, docs: Record<string, any>[], actor = "", session?: mongoose.ClientSession) {
        if (!isValidObjectId(purchaseOrderId)) throwInventoryError(400, CODE.INVALID_PARAMS, "purchaseOrderId 格式错误");
        return await runPurchaseAllocationTransaction(session, async (currentSession) => {
            const purchase = await mongoose.connection.collection("purchaseorders").findOne({
                _id: toObjectId(purchaseOrderId), _isDeleted: { $ne: true },
            }, { session: currentSession });
            if (!purchase) throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "采购单不存在");
            const existing = await PurchaseRequestOrderAllocation.find({ purchaseOrderId: purchase._id }).session(currentSession).lean() as any[];
            const requestIds = [...new Set([...existing, ...docs].map((doc) => toText(doc.purchaseRequestId)))];
            if (requestIds.some((id) => !isValidObjectId(id))) throwInventoryError(400, CODE.INVALID_PARAMS, "采购分配缺少有效的申请来源");
            const requests = await PurchaseRequest.find({ _id: { $in: requestIds.map(toObjectId) } }).session(currentSession).lean() as any[];
            if (requests.length !== requestIds.length) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购分配的申请来源不存在，请先核对历史记录");
            const removable = await this.releasedRemovalRequests(existing, docs, toText(purchase.orderNo), purchaseOrderId, currentSession);
            await this.assertRequestSourcesOpen(requests, actor, currentSession, true, removable);
            for (const request of requests) {
                await PurchaseRequest.updateOne({ _id: request._id }, {
                    $currentDate: { updateTime: true }, $set: { updatedBy: actor },
                }, { session: currentSession });
            }
            const validated = await this.buildDocs({ purchaseOrderId, purchaseOrderNo: toText(purchase.orderNo) },
                docs.map((doc) => ({ purchaseRequestId: toText(doc.purchaseRequestId), productId: toText(doc.productId),
                    purchaseRequestItemIndex: doc.purchaseRequestItemIndex, requirementId: toText(doc.requirementId), allocatedQuantity: doc.allocatedQuantity,
                })), actor, purchaseOrderId, currentSession);
            const allocatedByProduct = new Map<string, number>();
            const orderedByProduct = new Map<string, number>();
            for (const item of purchase.items || []) {
                orderedByProduct.set(toText(item.productId), normalizeQuantity((orderedByProduct.get(toText(item.productId)) || 0) + Number(item.quantity || 0)));
            }
            for (const doc of validated) {
                const productId = toText(doc.productId);
                const quantity = normalizeQuantity((allocatedByProduct.get(productId) || 0) + Number(doc.allocatedQuantity));
                if (quantity > (orderedByProduct.get(productId) || 0)) throwInventoryError(409, CODE.INVALID_PARAMS, "采购分配数量超过采购单产品数量");
                allocatedByProduct.set(productId, quantity);
            }
            const inbound = await mongoose.connection.collection("inventoryinbounds").findOne({
                type: "采购", purchaseOrderNo: purchase.orderNo, stockApplied: true, _isDeleted: { $ne: true },
            }, { session: currentSession });
            if (inbound) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购单已有实际入库，不能重新分配采购申请");
            await mongoose.connection.collection("purchaseorders").updateOne({ _id: purchase._id, _isDeleted: { $ne: true } }, {
                $currentDate: { updateTime: true }, $set: { updatedBy: actor },
            }, { session: currentSession });
            await PurchaseRequestOrderAllocation.deleteMany({ purchaseOrderId: purchase._id }, { session: currentSession });
            if (validated.length) await PurchaseRequestOrderAllocation.insertMany(validated, { session: currentSession });
            return validated;
        });
    }

    async getByPurchaseOrder(purchaseOrderId: string) {
        if (!isValidObjectId(purchaseOrderId)) return [];
        return await PurchaseRequestOrderAllocation.find({
            purchaseOrderId: toObjectId(purchaseOrderId),
        }).sort({ createTime: 1 }).lean();
    }

    async deleteByPurchaseOrder(purchaseOrderId: string, actor = "", session?: mongoose.ClientSession) {
        if (!isValidObjectId(purchaseOrderId)) return;
        return await runPurchaseAllocationTransaction(session, async (currentSession) => {
            const existing = await PurchaseRequestOrderAllocation.find({ purchaseOrderId: toObjectId(purchaseOrderId) }).session(currentSession).lean() as any[];
            if (!existing.length) return;
            const requestIds = [...new Set(existing.map((doc) => toText(doc.purchaseRequestId)))];
            const requests = await PurchaseRequest.find({ _id: { $in: requestIds.map(toObjectId) } }).session(currentSession).lean() as any[];
            if (requests.length !== requestIds.length) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购分配的申请来源不存在，请先核对历史记录");
            const purchase = await mongoose.connection.collection("purchaseorders").findOne({ _id: toObjectId(purchaseOrderId) }, { session: currentSession });
            if (!purchase) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "采购分配的采购单来源不存在，请先核对历史记录");
            const inbound = await mongoose.connection.collection("inventoryinbounds").findOne({
                type: "采购", purchaseOrderNo: purchase.orderNo, stockApplied: true, _isDeleted: { $ne: true },
            }, { session: currentSession });
            if (inbound) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "请先撤销实际采购入库，再删除采购申请分配");
            const removable = await this.releasedRemovalRequests(existing, [], toText(purchase.orderNo), purchaseOrderId, currentSession);
            await this.assertRequestSourcesOpen(requests, actor, currentSession, true, removable);
            await PurchaseRequestOrderAllocation.deleteMany({ purchaseOrderId: toObjectId(purchaseOrderId) }, { session: currentSession });
        });
    }
}

export const usePurchaseRequestOrderAllocationModel = () =>
    new PurchaseRequestOrderAllocationModel();
