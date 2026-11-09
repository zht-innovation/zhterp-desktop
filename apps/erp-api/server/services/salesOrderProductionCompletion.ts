import mongoose from "mongoose";
import type { CompletionInventoryLine, SalesOrderCompletionSummary } from "~~/shared/types/sales-order-completion";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryWarehouse, InventoryLocation } from "~~/server/models/inventoryBase.model";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { ProductionCompletion, ProductionRequisition, ProductionExecutionOperation } from "~~/server/models/productionExecution.model";
import { PurchaseMaterialRequirement } from "~~/server/models/purchaseMaterialRequirement.model";
import { PurchaseOrderAllocation } from "~~/server/models/purchaseOrderAllocation.model";
import { PurchaseOrder } from "~~/server/models/purchaseOrder.model";
import { PurchaseRequest } from "~~/server/models/purchaseRequest.model";
import { PurchaseRequestOrderAllocation } from "~~/server/models/purchaseRequestOrderAllocation.model";
import { buildExecutionOrders } from "./productionExecutionView";
import { resolveProductionReservationOrigins } from "./productionMaterialPool";
import { ensureSalesOrderCompletionState, hasSalesOrderCompletionRelease } from "./salesOrderCompletionState";
import { buildCompletionDemand, completionAllocationBalance, completionMaterialRemainder, completionReservationBalance, completionReservationExecutionMatches, getDirectPurchaseAllocationReceipts } from "./salesOrderProductionCompletionMath";
import { normalizeStockQuantity as qty } from "./inventoryStockMath";
import { toObjectId, toText as text, throwInventoryError } from "./inventory";
import { CODE } from "~~/server/utils/code";

const id = (value: any) => text(value?.toString?.() || value).toLowerCase();
const withSession = (query: any, session?: mongoose.ClientSession) => session ? query.session(session) : query;
const positionKey = (product: any, warehouse: any, location: any) => `${id(product)}:${id(warehouse)}:${id(location)}`;
const fail = (message: string): never => throwInventoryError(409, CODE.INVENTORY_REFERENCED, message);
const matchesValue = (value: any) => value === undefined ? { $exists: false } : value;
const validNumber = (value: any) => Number.isFinite(Number(value)) && Number(value) >= 0;
const addQuantity = (map: Map<string, number>, key: string, quantity: number) => map.set(key, qty((map.get(key) || 0) + quantity));
const rows = (value: any): any[] => Array.isArray(value) ? value : [];

const serializeConfirmation = (confirmation: any): SalesOrderCompletionSummary["confirmation"] => {
    if (!confirmation || !["manual", "legacy"].includes(confirmation.source)) return null;
    const date = confirmation.confirmedAt ? new Date(confirmation.confirmedAt) : null;
    return { source: confirmation.source, confirmedAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
        confirmedBy: text(confirmation.confirmedBy) };
};

// 供生产候选列表读取放行事实，不在全量候选扫描中执行完工资格查询。
export const getSalesOrderCompletionSummary = (order: any): SalesOrderCompletionSummary => ({
    required: order?.productionCompletionRequired === true,
    confirmation: serializeConfirmation(order?.productionCompletion),
    version: Number(order?.productionPlanVersion || 0), canComplete: false, blockingReasons: [],
    releaseMaterials: [], retainedProducts: [],
});

const inventoryRows = async (collection: string, filter: Record<string, any>, session?: mongoose.ClientSession) =>
    await mongoose.connection.collection(collection).find({ ...filter, stockApplied: true, _isDeleted: { $ne: true } }, session ? { session } : {}).toArray();

const checkDirectProductionPurchases = async (order: any, productionOrders: any[], reasons: Set<string>, session?: mongoose.ClientSession) => {
    const requestSources: Record<string, any>[] = [
        { productionOrderId: { $in: productionOrders.map((row) => row._id) } },
        { salesOrderId: order._id },
    ];
    const productionNumbers = productionOrders.map((row) => text(row.documentNo)).filter(Boolean);
    if (productionNumbers.length) requestSources.push({ productionOrderNo: { $in: productionNumbers } });
    if (text(order.orderNo)) requestSources.push({ salesOrderNo: text(order.orderNo) });
    const relatedRequests = await withSession(PurchaseRequest.find({ $or: requestSources }).lean(), session) as any[];
    const allocationSources: Record<string, any>[] = [{ purchaseRequestId: { $in: relatedRequests.map((row) => row._id) } }];
    if (text(order.orderNo)) allocationSources.push({ salesOrderNo: text(order.orderNo) });
    const targets = await withSession(PurchaseRequestOrderAllocation.find({ requirementId: null, $or: allocationSources }).lean(), session) as any[];
    if (!targets.length) return;

    const purchaseIds = [...new Set(targets.map((row) => id(row.purchaseOrderId)).filter(mongoose.isValidObjectId))];
    const productIds = [...new Set(targets.map((row) => id(row.productId)).filter(mongoose.isValidObjectId))];
    const groupKey = (row: any) => `${id(row.purchaseOrderId)}:${id(row.productId)}`;
    const targetGroups = new Set(targets.map(groupKey));
    // 共享采购单按所有订单的同 SKU 分配一起核算，不让每张销售订单重复使用同一笔到货。
    const allDirect = purchaseIds.length && productIds.length ? await withSession(PurchaseRequestOrderAllocation.find({
        purchaseOrderId: { $in: purchaseIds.map(toObjectId) }, productId: { $in: productIds.map(toObjectId) }, requirementId: null,
    }).sort({ createTime: 1, _id: 1 }).lean(), session) as any[] : [];
    const direct = allDirect.filter((row) => targetGroups.has(groupKey(row)));
    const allLegacy = purchaseIds.length && productIds.length ? await withSession(PurchaseOrderAllocation.find({
        purchaseOrderId: { $in: purchaseIds.map(toObjectId) }, productId: { $in: productIds.map(toObjectId) },
    }).lean(), session) as any[] : [];
    const legacy = allLegacy.filter((row) => targetGroups.has(groupKey(row)));
    const purchases = purchaseIds.length ? await withSession(PurchaseOrder.find({ _id: { $in: purchaseIds.map(toObjectId) } }).lean(), session) as any[] : [];
    const purchaseMap = new Map(purchases.map((row) => [id(row._id), row]));
    const requestIds = [...new Set([...targets, ...direct].map((row) => id(row.purchaseRequestId)).filter(mongoose.isValidObjectId))];
    const requests = requestIds.length ? await withSession(PurchaseRequest.find({ _id: { $in: requestIds.map(toObjectId) } }).lean(), session) as any[] : [];
    const requestMap = new Map(requests.map((row) => [id(row._id), row]));
    const sourceIds = [...new Set(requests.map((row) => id(row.productionOrderId)).filter(mongoose.isValidObjectId))];
    const sources = sourceIds.length ? await withSession(ProductionOrder.find({ _id: { $in: sourceIds.map(toObjectId) } }).lean(), session) as any[] : [];
    const sourceMap = new Map(sources.map((row) => [id(row._id), row]));
    const targetIds = new Set(targets.map((row) => id(row._id)));
    const allocationsToCheck = new Map(direct.map((row) => [id(row._id), row]));
    for (const allocation of targets) allocationsToCheck.set(id(allocation._id), allocation);
    for (const allocation of allocationsToCheck.values()) {
        const purchase = purchaseMap.get(id(allocation.purchaseOrderId));
        const request = requestMap.get(id(allocation.purchaseRequestId));
        const itemIndex = Number(allocation.purchaseRequestItemIndex);
        const item = Number.isInteger(itemIndex) && itemIndex >= 0 ? rows(request?.items)[itemIndex] : null;
        const label = text(allocation.purchaseOrderNo || purchase?.orderNo) || id(allocation._id);
        if (!purchase || purchase._isDeleted || text(purchase.orderNo) !== text(allocation.purchaseOrderNo)
            || !request || request.status !== "approved" || id(item?.productId) !== id(allocation.productId)
            || !validNumber(allocation.allocatedQuantity) || Number(allocation.allocatedQuantity) <= 0) {
            reasons.add(`生产采购分配 ${label} 缺少有效的来源采购单、采购申请或产品明细，请先核对。`);
        }
        if (request?.productionOrderId && !sourceMap.has(id(request.productionOrderId))) {
            reasons.add(`生产采购分配 ${label} 的来源生产单缺失，请先核对。`);
        }
        if (targetIds.has(id(allocation._id))) {
            const source = request && sourceMap.get(id(request.productionOrderId));
            if (!source || id(source.salesOrderId) !== id(order._id) || request?.category !== "生产用料采购") {
                reasons.add(`生产采购分配 ${label} 无法沿采购申请追溯至本订单生产单，请先核对。`);
            }
        }
    }
    for (const allocation of legacy) {
        if (!validNumber(allocation.lockedAfterInboundQuantity)) reasons.add("共享采购单的原需求分配到货数量异常，请先核对后再确认完工。");
    }
    const purchaseByNumber = new Map(purchases.filter((row) => !row._isDeleted).map((row) => [text(row.orderNo), row]));
    const receiptDocuments = purchaseByNumber.size ? await inventoryRows("inventoryinbounds", { type: "采购", purchaseOrderNo: { $in: [...purchaseByNumber.keys()] } }, session) : [];
    const receipts: Array<{ purchaseOrderId: any; productId: any; quantity: number }> = [];
    for (const document of receiptDocuments) {
        const purchase = purchaseByNumber.get(text(document.purchaseOrderNo));
        if (!purchase) continue;
        for (const item of rows(document.items)) {
            if (!targetGroups.has(`${id(purchase._id)}:${id(item.productId)}`)) continue;
            if (!validNumber(item.quantity)) {
                reasons.add(`采购入库单 ${text(document.inboundNo)} 的到货数量异常，请先核对。`);
                continue;
            }
            receipts.push({ purchaseOrderId: purchase._id, productId: item.productId, quantity: Number(item.quantity) });
        }
    }
    const receivedByAllocation = getDirectPurchaseAllocationReceipts(direct, receipts, legacy);
    for (const allocation of targets) {
        const allocated = validNumber(allocation.allocatedQuantity) ? qty(allocation.allocatedQuantity) : 0;
        const pending = qty(allocated - (receivedByAllocation.get(id(allocation._id)) || 0));
        if (pending > 0) reasons.add(`生产采购分配 ${text(allocation.purchaseOrderNo)}（申请 ${text(allocation.purchaseRequestNo)}）仍有 ${pending} 未到货，请先结清本订单分配。`);
    }
};

// 预览和提交共用同一套检查；事务内查询顺序执行，避免同一 session 上并行读写。
export const getSalesOrderCompletionReadiness = async (
    input: any,
    session?: mongoose.ClientSession,
): Promise<SalesOrderCompletionSummary> => {
    const order = await ensureSalesOrderCompletionState(input, session);
    const reasons = new Set<string>();
    const summary = getSalesOrderCompletionSummary(order);
    if (!order || order._isDeleted) {
        summary.blockingReasons.push("销售订单不存在或已删除。");
        return summary;
    }
    if (summary.confirmation) return summary;
    if (!summary.required) {
        summary.blockingReasons.push("该订单无需人工确认生产完工。");
        return summary;
    }
    if (order.status !== "生产中") reasons.add("订单尚未进入生产中，不能确认完工。");
    if (text(order.productionCompletionReviewReason)) reasons.add(text(order.productionCompletionReviewReason));
    const { demand, reasons: demandReasons } = buildCompletionDemand(order.products);
    for (const reason of demandReasons) reasons.add(reason);

    const salesOrderId = order._id;
    const productionOrders = await withSession(ProductionOrder.find({ salesOrderId }).lean(), session) as any[];
    if (!productionOrders.length) reasons.add("订单缺少关联生产来源，请先核对历史生产、领料和完工入库记录。");
    const committed = productionOrders.filter((row) => !["草稿", "已取消"].includes(row.status));
    const productionMap = new Map(productionOrders.map((row) => [id(row._id), row]));
    await checkDirectProductionPurchases(order, productionOrders, reasons, session);
    const productionIds = productionOrders.map((row) => row._id);
    const executionFilter = { $or: [{ salesOrderId }, { productionOrderId: { $in: productionIds } }] };
    const requests = await withSession(ProductionRequisition.find(executionFilter).lean(), session) as any[];
    const completions = await withSession(ProductionCompletion.find(executionFilter).lean(), session) as any[];
    const rawReservations = await withSession(SalesOrderStockReservation.find({ salesOrderId }).lean(), session) as any[];
    const normalizedReservations = await resolveProductionReservationOrigins(rawReservations.filter((row) => !row.sourceAllocationId || mongoose.isValidObjectId(row.sourceAllocationId)), session);
    const normalizedMap = new Map(normalizedReservations.map((row) => [id(row._id), row]));
    const reservations = rawReservations.map((row) => normalizedMap.get(id(row._id)) || row);
    const requirements = await withSession(PurchaseMaterialRequirement.find({ salesOrderId }).lean(), session) as any[];
    const allocations = await withSession(PurchaseOrderAllocation.find({ salesOrderId }).lean(), session) as any[];
    const allocationMap = new Map(allocations.map((row) => [id(row._id), row]));
    const requirementMap = new Map(requirements.map((row) => [id(row._id), row]));
    const purchaseOrders = await withSession(PurchaseOrder.find({ _id: { $in: allocations.map((row) => row.purchaseOrderId).filter(mongoose.isValidObjectId) } }).lean(), session) as any[];
    const purchaseMap = new Map(purchaseOrders.map((row) => [id(row._id), row]));
    for (const requirement of requirements) {
        if (!requirement._isDeleted && requirement.status !== "已完成") {
            reasons.add(`采购需求 ${text(requirement.productCode || requirement.productModel) || id(requirement._id)} 尚未结清。`);
        }
    }
    for (const allocation of allocations) {
        const label = text(allocation.purchaseOrderNo) || id(allocation._id);
        const allocated = Number(allocation.allocatedQuantity);
        const received = Number(allocation.lockedAfterInboundQuantity || 0);
        if (!validNumber(allocated) || !validNumber(received) || qty(received) > qty(allocated)) {
            reasons.add(`采购分配 ${label} 的数量记录异常。`);
        } else if (qty(allocated - received) > 0) {
            reasons.add(`采购分配 ${label} 仍有 ${qty(allocated - received)} 未到货，请先结清本订单分配。`);
        }
        if (allocated > 0 && (!purchaseMap.get(id(allocation.purchaseOrderId)) || !requirementMap.get(id(allocation.requirementId)))) {
            reasons.add(`采购分配 ${label} 缺少来源采购单或需求记录。`);
        }
    }

    let validProduction = true;
    for (const request of requests) {
        if (!Array.isArray(request.lines) || !request.lines.every((line: any) => Array.isArray(line.allocations))) {
            validProduction = false;
            reasons.add(`发料单 ${text(request.documentNo)} 缺少有效的物料分配明细。`);
        }
    }
    for (const row of committed) {
        const label = text(row.documentNo) || id(row._id);
        if (row.status !== "已完成") reasons.add(`生产单 ${label} 尚未完成。`);
        if (!validNumber(row.planQty) || Number(row.planQty) <= 0 || qty(row.completedQty) !== qty(row.planQty) || qty(row.receivedQty) !== qty(row.planQty)) {
            reasons.add(`生产单 ${label} 的计划、完工或入库数量未结清。`);
        }
        if (!mongoose.isValidObjectId(row.productId) || !mongoose.isValidObjectId(row.rootProductId)
            || !demand.has(id(row.rootProductId)) || !Array.isArray(row.bomMaterials) || !row.bomMaterials.length) {
            validProduction = false;
            reasons.add(`生产单 ${label} 缺少有效的订单产品或 BOM 快照，请先核对历史记录。`);
        }
        for (const material of rows(row.bomMaterials)) {
            if (!mongoose.isValidObjectId(material.productId) || !validNumber(material.unitQty) || Number(material.unitQty) <= 0) {
                validProduction = false;
                reasons.add(`生产单 ${label} 的 BOM 物料记录无效。`);
            }
        }
    }
    if (validProduction) {
        const details = await buildExecutionOrders(committed, session);
        for (const detail of details) {
            if (detail.blockReason) reasons.add(`生产单 ${detail.documentNo}：${detail.blockReason}`);
            for (const material of detail.materials) {
                const remainder = completionMaterialRemainder(material, detail.completedQty);
                if (remainder > 0) reasons.add(`生产单 ${detail.documentNo} 的 ${material.name || material.code} 尚有 ${remainder} 车间余料，请先退料或登记真实损耗。`);
                if (remainder < 0) reasons.add(`生产单 ${detail.documentNo} 的 ${material.name || material.code} 领料不足以支撑完工和损耗，请核对记录。`);
            }
        }
    }

    const requestMap = new Map(requests.map((row) => [id(row._id), row]));
    const expectedIssues = new Map<string, number>();
    const expectedReturns = new Map<string, number>();
    const consumedByReservation = new Map<string, number>();
    const allocatedByReservation = new Map<string, number>();
    for (const request of requests) {
        const sourceOrder = productionMap.get(id(request.productionOrderId));
        if (!sourceOrder || id(request.salesOrderId) !== id(salesOrderId) || sourceOrder.status === "草稿") {
            reasons.add(`发料单 ${text(request.documentNo)} 的生产来源不完整，请先核对。`);
        }
        for (const line of rows(request.lines)) {
            for (const allocation of rows(line.allocations)) {
                const balance = completionAllocationBalance(allocation);
                const label = `发料单 ${text(request.documentNo)} 的 ${text(line.name || line.materialCode)}`;
                if (!balance.valid) reasons.add(`${label}数量记录异常。`);
                if (balance.pending > 0) reasons.add(`${label}仍有 ${balance.pending} 待发料，请先撤销未出库分配。`);
                if (balance.pendingReturn > 0) reasons.add(`${label}仍有 ${balance.pendingReturn} 待退料入库。`);
                if (sourceOrder?.status === "已取消" && balance.netIssued > 0) reasons.add(`${label}所属生产单已取消，但仍有未退回物料。`);
                const key = `${id(request._id)}:${positionKey(line.productId, allocation.warehouseId, allocation.locationId)}`;
                addQuantity(expectedIssues, key, balance.issued);
                addQuantity(expectedReturns, key, balance.returned);
                if (allocation.reservationId) {
                    const reservation = rawReservations.find((row) => id(row._id) === id(allocation.reservationId));
                    if (!reservation || reservation.reservationType !== "production-material" || id(reservation.stockProductId) !== id(line.productId)
                        || id(reservation.warehouseId) !== id(allocation.warehouseId) || id(reservation.locationId) !== id(allocation.locationId)) {
                        reasons.add(`${label}的物料预占来源不匹配。`);
                    } else if (balance.valid && id(request.salesOrderId) === id(salesOrderId) && id(sourceOrder?.salesOrderId) === id(salesOrderId)) {
                        addQuantity(consumedByReservation, id(reservation._id), balance.netIssued);
                        addQuantity(allocatedByReservation, id(reservation._id), balance.pending);
                    }
                }
            }
        }
    }
    const requestIds = requests.map((row) => row._id);
    const issueDocuments = requestIds.length ? await inventoryRows("inventoryoutbounds", {
        type: "生产领料", $or: [{ requisitionId: { $in: requestIds } }, { "items.requisitionId": { $in: requestIds } }],
    }, session) : [];
    const returnDocuments = requestIds.length ? await inventoryRows("inventoryinbounds", {
        type: "退料", $or: [{ requisitionId: { $in: requestIds } }, { "items.requisitionId": { $in: requestIds } }],
    }, session) : [];
    const actualMovement = (documents: any[]) => {
        const quantities = new Map<string, number>();
        for (const document of documents) {
            if (id(document.salesOrderId) !== id(salesOrderId)) { reasons.add(`库存单 ${text(document.outboundNo || document.inboundNo)} 的订单来源不匹配。`); continue; }
            for (const line of rows(document.items)) {
                const requestId = id(line.requisitionId || document.requisitionId);
                const request = requestMap.get(requestId);
                const source = request && productionMap.get(id(request.productionOrderId));
                if (!request || !source || id(line.productionOrderId || document.productionOrderId) !== id(source._id)
                    || id(line.rootProductId || document.rootProductId) !== id(source.rootProductId)) {
                    reasons.add(`库存单 ${text(document.outboundNo || document.inboundNo)} 的生产发料来源不匹配。`);
                }
                const key = `${requestId}:${positionKey(line.productId, line.warehouseId, line.locationId)}`;
                if (!validNumber(line.quantity)) reasons.add(`库存单 ${text(document.outboundNo || document.inboundNo)} 的数量异常。`);
                addQuantity(quantities, key, Number(line.quantity || 0));
            }
        }
        return quantities;
    };
    const actualIssues = actualMovement(issueDocuments);
    const actualReturns = actualMovement(returnDocuments);
    for (const [key, quantity] of expectedIssues) {
        if (quantity !== (actualIssues.get(key) || 0)) reasons.add("发料记录与实际领料出库单数量不一致，请先核对来源单据。");
    }
    for (const [key, quantity] of expectedReturns) {
        if (quantity !== (actualReturns.get(key) || 0)) reasons.add("退料记录与实际退料入库单数量不一致，请先核对来源单据。");
    }
    for (const [key, quantity] of actualIssues) {
        if (quantity > 0 && !expectedIssues.has(key)) reasons.add("实际生产领料出库存在未关联的物料分配，请先核对来源记录。");
    }
    for (const [key, quantity] of actualReturns) {
        if (quantity > 0 && !expectedReturns.has(key)) reasons.add("实际退料入库存在未关联的物料分配，请先核对来源记录。");
    }
    const expectedReceipts = new Map<string, number>();
    for (const completion of completions) {
        const source = productionMap.get(id(completion.productionOrderId));
        if (!source || id(completion.salesOrderId) !== id(salesOrderId) || ["草稿", "已取消"].includes(source.status)) {
            reasons.add(`完工批次 ${text(completion.documentNo)} 的生产来源异常。`);
        }
        if (!validNumber(completion.quantity) || !validNumber(completion.receivedQty) || qty(completion.receivedQty) !== qty(completion.quantity)) {
            reasons.add(`完工批次 ${text(completion.documentNo)} 尚未全部入库或数量异常。`);
        }
        expectedReceipts.set(id(completion._id), qty(completion.receivedQty));
    }
    const completionIds = completions.map((row) => row._id);
    const receipts = completionIds.length ? await inventoryRows("inventoryinbounds", {
        type: "生产", $or: [{ completionId: { $in: completionIds } }, { "items.completionId": { $in: completionIds } }],
    }, session) : [];
    const actualReceipts = new Map<string, number>();
    for (const document of receipts) {
        for (const line of rows(document.items)) {
            const completionId = id(line.completionId || document.completionId);
            const completion = completions.find((row) => id(row._id) === completionId);
            const source = completion && productionMap.get(id(completion.productionOrderId));
            if (!completion || !source || id(document.salesOrderId) !== id(salesOrderId) || id(line.productId) !== id(source.productId)
                || id(line.productionOrderId || document.productionOrderId) !== id(source._id) || !validNumber(line.quantity)) {
                reasons.add(`入库单 ${text(document.inboundNo)} 的完工批次来源不匹配。`);
                continue;
            }
            addQuantity(actualReceipts, completionId, Number(line.quantity));
        }
    }
    for (const [key, quantity] of expectedReceipts) {
        if (quantity !== (actualReceipts.get(key) || 0)) reasons.add("完工批次与已过账合格生产入库数量不一致，请先核对来源记录。");
    }

    const productIds = [...new Set([...demand.keys(), ...reservations.map((row) => id(row.stockProductId))])].filter(mongoose.isValidObjectId);
    const products = await withSession(InventoryProduct.find({ _id: { $in: productIds.map(toObjectId) }, _isDeleted: { $ne: true } }).select("code name model unitName").lean(), session) as any[];
    const productMap = new Map(products.map((row) => [id(row._id), row]));
    const warehouses = await withSession(InventoryWarehouse.find({ _id: { $in: reservations.map((row) => row.warehouseId).filter(mongoose.isValidObjectId) }, _isDeleted: { $ne: true } }).lean(), session) as any[];
    const locations = await withSession(InventoryLocation.find({ _id: { $in: reservations.map((row) => row.locationId).filter(mongoose.isValidObjectId) }, _isDeleted: { $ne: true } }).lean(), session) as any[];
    const warehouseMap = new Map(warehouses.map((row) => [id(row._id), row]));
    const locationMap = new Map(locations.map((row) => [id(row._id), row]));
    const positionFilters: any[] = [];
    const currentPositions = new Set<string>();
    for (const reservation of reservations) {
        const balance = completionReservationBalance(reservation);
        if (!balance.valid) reasons.add(`产品 ${id(reservation.stockProductId)} 的预占余额异常。`);
        if (balance.remaining > 0 && reservation.status !== "active") reasons.add(`产品 ${id(reservation.stockProductId)} 的预占状态与剩余数量不一致。`);
        const key = positionKey(reservation.stockProductId, reservation.warehouseId, reservation.locationId);
        if (balance.remaining > 0 && !currentPositions.has(key)) {
            if (!mongoose.isValidObjectId(reservation.stockProductId) || !mongoose.isValidObjectId(reservation.warehouseId)
                || (reservation.locationId && !mongoose.isValidObjectId(reservation.locationId))) {
                reasons.add(`产品 ${id(reservation.stockProductId)} 的实际库存仓位来源缺失。`);
                continue;
            }
            positionFilters.push({ productId: reservation.stockProductId, warehouseId: reservation.warehouseId || null, locationId: reservation.locationId || null });
            currentPositions.add(key);
        }
    }
    const stocks = positionFilters.length ? await withSession(InventoryStock.find({ $or: positionFilters, _isDeleted: { $ne: true } }).lean(), session) as any[] : [];
    const stockMap = new Map(stocks.map((row) => [positionKey(row.productId, row.warehouseId, row.locationId), row]));
    const sharedReservations = positionFilters.length ? await withSession(SalesOrderStockReservation.find({ $or: positionFilters.map((row) => ({ stockProductId: row.productId, warehouseId: row.warehouseId, locationId: row.locationId })) }).lean(), session) as any[] : [];
    const totalPositionReservations = new Map<string, number>();
    for (const reservation of sharedReservations) {
        const balance = completionReservationBalance(reservation);
        if (!balance.valid) reasons.add("相关仓位存在异常预占余额，请先核对库存。");
        addQuantity(totalPositionReservations, positionKey(reservation.stockProductId, reservation.warehouseId, reservation.locationId), balance.remaining);
    }
    for (const key of currentPositions) {
        const stock = stockMap.get(key);
        if (!stock || !validNumber(stock.quantity) || !validNumber(stock.lockedQuantity)
            || qty(stock.quantity) < qty(stock.lockedQuantity) || qty(stock.lockedQuantity) < (totalPositionReservations.get(key) || 0)) {
            reasons.add("相关仓位的实存、锁定与订单预占余额不一致，请先核对库存。");
        }
    }

    const sourceInboundIds = [...new Set(reservations.map((row) => id(row.sourceInboundId)).filter(mongoose.isValidObjectId))];
    const sourceInbounds = sourceInboundIds.length ? await inventoryRows("inventoryinbounds", { _id: { $in: sourceInboundIds.map(toObjectId) } }, session) : [];
    const inboundMap = new Map(sourceInbounds.map((row) => [id(row._id), row]));
    const purchaseNumbers = [...new Set(allocations.map((row) => text(row.purchaseOrderNo)).filter(Boolean))];
    const purchaseInbounds = purchaseNumbers.length ? await inventoryRows("inventoryinbounds", { type: "采购", purchaseOrderNo: { $in: purchaseNumbers } }, session) : [];
    const purchasedByPosition = new Map<string, number>();
    for (const inbound of purchaseInbounds) {
        for (const line of rows(inbound.items)) {
            const key = `${text(inbound.purchaseOrderNo)}:${positionKey(line.productId, line.warehouseId, line.locationId)}`;
            if (validNumber(line.lockedQuantity)) addQuantity(purchasedByPosition, key, Number(line.lockedQuantity));
        }
    }
    const reservationByAllocation = new Map<string, number>();
    const reservationByPurchasePosition = new Map<string, number>();
    const reservationByInboundPosition = new Map<string, number>();
    const finishedCoverage = new Map<string, number>();
    for (const reservation of reservations) {
        const balance = completionReservationBalance(reservation);
        const product = productMap.get(id(reservation.stockProductId));
        const label = text(product?.model || product?.name || product?.code) || id(reservation.stockProductId);
        if (!demand.has(id(reservation.demandProductId))) reasons.add(`${label}的预占缺少有效销售需求归属。`);
        if (reservation.reservationType === "finished-product") {
            if (id(reservation.demandProductId) !== id(reservation.stockProductId)) reasons.add(`${label}的成品预占归属不匹配。`);
            if (balance.consumed > 0) reasons.add(`${label}存在完工确认前的销售出库记录，请先核对历史数据。`);
            if (balance.valid) addQuantity(finishedCoverage, id(reservation.stockProductId), balance.remaining);
        } else if (reservation.reservationType === "production-material") {
            if (balance.allocated > 0) reasons.add(`${label}仍有 ${balance.allocated} 生产分配，请先撤销未出库分配。`);
            if (!completionReservationExecutionMatches(reservation, consumedByReservation.get(id(reservation._id)) || 0, allocatedByReservation.get(id(reservation._id)) || 0)) {
                reasons.add(`${label}的生产物料预占消费或分配余额与本订单实际发料记录不一致，存在缺失来源或历史重复消费，请先核对。`);
            }
        } else {
            reasons.add(`${label}的库存预占用途无法识别。`);
        }
        if (balance.remaining <= 0 && balance.consumed <= 0) continue;
        const warehouse = warehouseMap.get(id(reservation.warehouseId));
        const location = locationMap.get(id(reservation.locationId));
        const validLocation = reservation.locationId ? Boolean(location && id(location.warehouseId) === id(warehouse?._id)) : warehouse?.enableLocation !== true;
        if (balance.remaining > 0 && (!product || !warehouse || warehouse.includeInAvailable === false || !validLocation)) {
            reasons.add(`${label}的产品档案、合格库存仓库或实际库位无效。`);
        }
        if (reservation.sourceInboundId) {
            const inbound = inboundMap.get(id(reservation.sourceInboundId));
            const source = productionMap.get(id(reservation.sourceProductionOrderId));
            const matchingItem = rows(inbound?.items).some((line: any) => id(line.productId) === id(reservation.stockProductId)
                && id(line.warehouseId) === id(reservation.warehouseId) && id(line.locationId) === id(reservation.locationId));
            if (!inbound || inbound.type !== "生产" || id(inbound.salesOrderId) !== id(salesOrderId) || !matchingItem
                || !source || source.status !== "已完成" || id(source.productId) !== id(reservation.stockProductId)
                || id(source.rootProductId) !== id(reservation.demandProductId)) {
                reasons.add(`${label}的生产入库预占来源不完整或尚未过账，请先核对历史记录。`);
            }
            const key = `${id(reservation.sourceInboundId)}:${positionKey(reservation.stockProductId, reservation.warehouseId, reservation.locationId)}`;
            addQuantity(reservationByInboundPosition, key, qty(balance.remaining + balance.consumed));
        } else if (reservation.sourceProductionOrderId) {
            reasons.add(`${label}的生产预占缺少合格入库来源。`);
        }
        if (reservation.sourceAllocationId) {
            const allocation = allocationMap.get(id(reservation.sourceAllocationId));
            const requirement = allocation && requirementMap.get(id(allocation.requirementId));
            const purchase = allocation && purchaseMap.get(id(allocation.purchaseOrderId));
            const expectedType = requirement && id(requirement.demandProductId) === id(requirement.productId) ? "finished-product" : "production-material";
            if (!allocation || !requirement || !purchase || purchase._isDeleted || id(allocation.productId) !== id(reservation.stockProductId)
                || id(requirement.demandProductId) !== id(reservation.demandProductId) || reservation.reservationType !== expectedType) {
                reasons.add(`${label}的采购预占用途或来源不一致，请先核对历史记录。`);
            }
            if (allocation) {
                addQuantity(reservationByAllocation, id(allocation._id), qty(balance.remaining + balance.consumed));
                const key = `${text(allocation.purchaseOrderNo)}:${positionKey(reservation.stockProductId, reservation.warehouseId, reservation.locationId)}`;
                addQuantity(reservationByPurchasePosition, key, qty(balance.remaining + balance.consumed));
            }
        }
        if (balance.remaining <= 0) continue;
        const line: CompletionInventoryLine = {
            reservationId: id(reservation._id), productId: id(reservation.stockProductId), productCode: text(product?.code),
            productName: text(product?.model || product?.name) || label, unit: text(product?.unitName) || "个",
            warehouseId: id(reservation.warehouseId), warehouseName: text(warehouse?.name),
            locationId: id(reservation.locationId), locationName: text(location?.name), quantity: balance.remaining,
        };
        if (reservation.reservationType === "finished-product") summary.retainedProducts.push(line);
        if (reservation.reservationType === "production-material") summary.releaseMaterials.push(line);
    }
    for (const [key, quantity] of reservationByAllocation) {
        if (quantity > qty(allocationMap.get(key)?.lockedAfterInboundQuantity)) reasons.add("采购分配的已入库数量不足以支撑当前订单预占，请先核对来源记录。");
    }
    for (const [key, quantity] of reservationByPurchasePosition) {
        if (quantity > (purchasedByPosition.get(key) || 0)) reasons.add("采购预占缺少对应仓位的已过账采购入库，请先核对来源记录。");
    }
    for (const [key, quantity] of reservationByInboundPosition) {
        const inboundId = key.split(":")[0];
        const inbound = inboundMap.get(inboundId);
        let received = 0;
        for (const line of rows(inbound?.items)) {
            if (`${inboundId}:${positionKey(line.productId, line.warehouseId, line.locationId)}` === key && validNumber(line.lockedQuantity)) received = qty(received + Number(line.lockedQuantity));
        }
        if (quantity > received) reasons.add("生产预占数量超过对应仓位的合格入库锁定量，请先核对来源记录。");
    }
    for (const [productId, item] of demand) {
        if (!productMap.has(productId)) reasons.add(`${item.name}的产品档案不存在或已删除。`);
        const shortage = qty(item.quantity - (finishedCoverage.get(productId) || 0));
        if (shortage > 0) reasons.add(`${item.name}缺少 ${shortage} 合格成品，尚未备齐（${finishedCoverage.get(productId) || 0}/${item.quantity}）。`);
    }
    summary.blockingReasons = [...reasons];
    summary.canComplete = summary.blockingReasons.length === 0;
    return summary;
};

export const confirmSalesOrderProductionCompletion = async (body: any, actor: string, session: mongoose.ClientSession) => {
    if (!session?.inTransaction()) throw new Error("订单完工确认必须在事务中执行");
    if (!mongoose.isValidObjectId(body.salesOrderId) || !Number.isInteger(body.version) || body.version < 0) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "销售订单 ID 或版本不合法。");
    }
    const model = useSalesOrderModel().order;
    const existing = await withSession(model.findOne({ _id: body.salesOrderId, _isDeleted: { $ne: true } }).lean(), session);
    if (!existing) throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "销售订单不存在。");
    const order = await ensureSalesOrderCompletionState(existing, session);
    if (hasSalesOrderCompletionRelease(order)) {
        if (order.productionCompletion?.source !== "manual") fail("该订单已按历史规则放行，无需再次确认或释放库存。");
        const operation = await ProductionExecutionOperation.findOne({ idempotencyKey: order.productionCompletion.operationId, action: "confirm-order-completion" }).session(session).lean() as any;
        if (operation?.result) return operation.result;
        return { id: id(order._id), documentNo: text(order.orderNo), status: order.status, version: Number(order.productionPlanVersion || 0),
            affectedOrderIds: [], affectedSalesOrderIds: [id(order._id)], completion: await getSalesOrderCompletionReadiness(order, session), releasedMaterials: [] };
    }
    const locked = await model.findOneAndUpdate({ _id: order._id, _isDeleted: { $ne: true }, status: "生产中",
        productionCompletionRequired: true, productionCompletion: null,
        productionPlanVersion: order.productionPlanVersion === undefined && body.version === 0 ? { $exists: false } : body.version,
    }, { $inc: { productionPlanVersion: 1 }, $set: { updatedBy: actor } }, { new: true, session }).lean() as any;
    if (!locked) fail("订单状态或版本已变化，请刷新后重新确认完工。");
    const preview = await getSalesOrderCompletionReadiness(locked, session);
    if (!preview.canComplete) fail(preview.blockingReasons.join("\n"));
    for (const line of preview.releaseMaterials) {
        const reservation = await SalesOrderStockReservation.findOne({ _id: line.reservationId, salesOrderId: order._id,
            reservationType: "production-material", status: "active" }).session(session).lean() as any;
        const balance = reservation && completionReservationBalance(reservation);
        if (!balance?.valid || balance.allocated !== 0 || balance.remaining !== line.quantity) fail("订单物料预占已变化，请刷新后重试。");
        const stock = await InventoryStock.findOne({ productId: reservation.stockProductId, warehouseId: reservation.warehouseId || null,
            locationId: reservation.locationId || null, _isDeleted: { $ne: true } }).session(session).lean() as any;
        if (!stock || !validNumber(stock.lockedQuantity) || qty(stock.lockedQuantity) < line.quantity) fail("库存锁定余额不足，请先核对库存。");
        const stockChanged = await InventoryStock.updateOne({ _id: stock._id, quantity: stock.quantity,
            lockedQuantity: matchesValue(stock.lockedQuantity), _isDeleted: { $ne: true } },
        { $set: { lockedQuantity: qty(Number(stock.lockedQuantity) - line.quantity), updatedBy: actor } }, { session });
        if (stockChanged.matchedCount !== 1) fail("库存已被其他操作更新，请刷新后重试。");
        const changed = await SalesOrderStockReservation.updateOne({ _id: reservation._id, status: "active",
            reservedQuantity: reservation.reservedQuantity, consumedQuantity: matchesValue(reservation.consumedQuantity),
            releasedQuantity: matchesValue(reservation.releasedQuantity), productionAllocatedQuantity: matchesValue(reservation.productionAllocatedQuantity),
        }, { $set: { releasedQuantity: qty(balance.released + line.quantity), status: balance.consumed > 0 ? "consumed" : "released", updatedBy: actor } }, { session });
        if (changed.matchedCount !== 1) fail("订单物料已被其他操作更新，请刷新后重试。");
    }
    const confirmation = { source: "manual", confirmedAt: new Date(), confirmedBy: actor, operationId: text(body.operationId) };
    const completed = await model.updateOne({ _id: order._id, status: "生产中", productionPlanVersion: locked.productionPlanVersion,
        productionCompletion: null }, { $set: { status: "待出库", productionCompletion: confirmation, updatedBy: actor } }, { session, runValidators: true });
    if (completed.matchedCount !== 1) fail("订单已被其他操作更新，请刷新后重试。");
    const linked = await ProductionOrder.find({ salesOrderId: order._id }).select("_id").session(session).lean() as any[];
    return { id: id(order._id), documentNo: text(order.orderNo), status: "待出库", version: locked.productionPlanVersion,
        affectedOrderIds: linked.map((row) => id(row._id)), affectedSalesOrderIds: [id(order._id)],
        completion: { ...preview, confirmation: serializeConfirmation(confirmation), canComplete: false, blockingReasons: [], releaseMaterials: [] },
        releasedMaterials: preview.releaseMaterials };
};
