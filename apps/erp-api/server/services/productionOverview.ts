import mongoose from "mongoose";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { APPROVED_SALES_ORDER_STATUSES } from "~~/server/services/salesOrderApproval";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryBom } from "~~/server/models/inventoryBom.model";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { hasProductionCandidateDemand, overviewProductQuantities, productionDueDate, reservationRemaining, salesOrderDisplayStatus } from "~~/server/services/productionOverviewMath";
import { buildProductionPlanning } from "~~/server/services/productionPlanning";
import { resolveProductionReservationOrigins } from "~~/server/services/productionMaterialPool";
import { ensureSalesOrderCompletionState } from "~~/server/services/salesOrderCompletionState";
import { getSalesOrderCompletionReadiness, getSalesOrderCompletionSummary } from "~~/server/services/salesOrderProductionCompletion";
import { normalizeStockQuantity } from "~~/server/services/inventoryStockMath";
import { isSalesOrderWaitingInventoryReview, SALES_ORDER_INVENTORY_REVIEW_READY_FILTER } from "./salesOrderInventoryReviewGate";

export const PRODUCTION_OVERVIEW_SALES_STATUSES = ["待采购", "待生产", "生产中", "待出库"] as const;
const text = (value: unknown) => String(value ?? "").trim();
const quantity = (value: unknown) => Math.max(0, Number(value) || 0);
const id = (value: any) => text(value?.toString?.() || value);

export const getProductionOverview = async (
    params: { page: number; limit: number; keyword?: string; status?: string; salesOrderId?: string; candidateOnly?: boolean },
    options: { salespersonId?: string; readOnly?: boolean } = {},
) => {
    const page = Math.max(1, Math.trunc(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Math.trunc(params.limit) || 10));
    const visibleSalesStatuses: readonly string[] = params.candidateOnly ? APPROVED_SALES_ORDER_STATUSES : PRODUCTION_OVERVIEW_SALES_STATUSES;
    const ownershipMatch: Record<string, any> = {};
    if (options.salespersonId !== undefined) {
        if (!mongoose.isValidObjectId(options.salespersonId)) throw new Error("INVALID_SALESPERSON_ID");
        ownershipMatch.salespersonId = new mongoose.Types.ObjectId(options.salespersonId);
    }
    const match: Record<string, any> = {
        _isDeleted: { $ne: true },
        status: { $in: visibleSalesStatuses },
        $and: [SALES_ORDER_INVENTORY_REVIEW_READY_FILTER],
        ...ownershipMatch,
    };
    if (params.salesOrderId) {
        if (!mongoose.isValidObjectId(params.salesOrderId)) throw new Error("INVALID_SALES_ORDER_ID");
        match._id = new mongoose.Types.ObjectId(params.salesOrderId);
    }
    if (params.status && params.status !== "全部") {
        const status = params.status === "待发货" ? "待出库" : params.status;
        if (!visibleSalesStatuses.includes(status)) throw new Error("INVALID_STATUS");
        match.status = status;
    }
    if (params.keyword) {
        const keyword = text(params.keyword).slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(keyword, "i");
        const matchingProducts = await InventoryProduct.find({
            _isDeleted: { $ne: true }, $or: [{ code: regex }, { name: regex }, { model: regex }],
        }).select("_id").limit(500).lean() as any[];
        match.$or = [
            { orderNo: regex },
            { "products.productCode": regex },
            { "products.productName": regex },
            { "products.model": regex },
            ...(matchingProducts.length ? [{ "products.productId": { $in: matchingProducts.map((product) => id(product._id)) } }] : []),
        ];
    }
    const salesOrderModel = useSalesOrderModel().order;
    const orderQuery = salesOrderModel.find(match)
        .select("orderNo salespersonName orderType orderDate durationDays status products sampleRequirement installationRequirement testingRequirement orderRemark remark orderImages machineNo productionPlanVersion productionCompletionRequired productionCompletionInitialized productionCompletion inventoryReviewRequiredAt inventoryReviewCompletedAt inventoryReviewResult")
        .sort({ orderDate: -1, _id: -1 }).skip((page - 1) * limit).limit(limit);
    const [matchedSalesOrders, total, statusRows] = await Promise.all([
        orderQuery.lean() as Promise<any[]>,
        salesOrderModel.countDocuments(match),
        salesOrderModel.aggregate([
            { $match: params.candidateOnly ? match : { _isDeleted: { $ne: true }, status: { $in: PRODUCTION_OVERVIEW_SALES_STATUSES }, $and: [SALES_ORDER_INVENTORY_REVIEW_READY_FILTER], ...ownershipMatch } },
            { $group: { _id: "$status", count: { $sum: 1 } } },
        ]) as Promise<any[]>,
    ]);
    const salesOrders: any[] = [];
    for (const matchedOrder of matchedSalesOrders) {
        const order = await ensureSalesOrderCompletionState(matchedOrder, undefined, { readOnly: options.readOnly });
        // 状态解析会重读订单，归属发生变化时不能返回给原销售。
        if (options.salespersonId !== undefined && id(order.salespersonId) !== id(ownershipMatch.salespersonId)) continue;
        if (isSalesOrderWaitingInventoryReview(order)) continue;
        if (options.readOnly && !visibleSalesStatuses.includes(order.status)) continue;
        salesOrders.push(order);
    }
    const orderIds = salesOrders.map((order) => order._id);
    const productIds = [...new Set(salesOrders.flatMap((order) => (order.products || []).map((product: any) => text(product.productId)).filter(mongoose.isValidObjectId)))];
    const [reservations, productionOrders, products, boms] = await Promise.all([
        SalesOrderStockReservation.find({ salesOrderId: { $in: orderIds }, reservationType: "finished-product" })
            .select("salesOrderId demandProductId stockProductId reservationType sourceInboundId sourceProductionOrderId reservedQuantity consumedQuantity releasedQuantity").lean() as Promise<any[]>,
        ProductionOrder.find({ salesOrderId: { $in: orderIds }, status: { $ne: "已取消" } })
            .select("documentNo salesOrderId rootProductId productId planQty status completedQty receivedQty machineNumbers version").lean() as Promise<any[]>,
        InventoryProduct.find({ _id: { $in: productIds } }).select("code name model material categoryName unitName image source _isDeleted").lean() as Promise<any[]>,
        InventoryBom.find({ productId: { $in: productIds }, isEnabled: true, _isDeleted: { $ne: true } })
            .select("productId items version").lean() as Promise<any[]>,
    ]);
    const componentIds = [...new Set(boms.flatMap((bom) => (bom.items || []).map((item: any) => id(item.productId)).filter(mongoose.isValidObjectId)))];
    const [componentProducts, componentBoms, rawComponentReservations] = await Promise.all([
        InventoryProduct.find({ _id: { $in: componentIds }, _isDeleted: { $ne: true } })
            .select("code name model material categoryName unitName image source").lean() as Promise<any[]>,
        InventoryBom.find({ productId: { $in: componentIds }, isEnabled: true, _isDeleted: { $ne: true } })
            .select("productId version").lean() as Promise<any[]>,
        SalesOrderStockReservation.find({ salesOrderId: { $in: orderIds }, reservationType: "production-material", stockProductId: { $in: componentIds } })
            .select("salesOrderId demandProductId stockProductId reservationType sourceAllocationId sourceInboundId sourceProductionOrderId reservedQuantity consumedQuantity releasedQuantity").lean() as Promise<any[]>,
    ]);
    const componentReservations = await resolveProductionReservationOrigins(rawComponentReservations);
    const productMap = new Map([...products, ...componentProducts].map((product) => [id(product._id), product]));
    const isProductAvailable = (productId: string) => {
        const product = productMap.get(productId);
        return Boolean(product && product._isDeleted !== true);
    };
    const bomMap = new Map(boms.map((bom) => [id(bom.productId), bom]));
    for (const bom of componentBoms) {
        if (!bomMap.has(id(bom.productId))) bomMap.set(id(bom.productId), bom);
    }
    const list: any[] = [];
    for (const order of salesOrders) {
        // 初始化会重读订单，避免状态已变为未审核时仍作为来源订单展示。
        if (params.candidateOnly && !visibleSalesStatuses.includes(order.status)) continue;
        const salesOrderId = id(order._id);
        const orderReservations = reservations.filter((row) => id(row.salesOrderId) === salesOrderId);
        const orderComponentReservations = componentReservations.filter((row) => id(row.salesOrderId) === salesOrderId);
        const planningReservations = [...orderReservations, ...orderComponentReservations];
        const linked = productionOrders.filter((row) => id(row.salesOrderId) === salesOrderId);
        // 生产计划及预占按产品ID核算，同SKU多行合并后再展示，避免库存被每行重复计入。
        const productLines = new Map<string, any>();
        for (const line of order.products || []) {
            const productId = text(line.productId);
            if (!productLines.has(productId)) productLines.set(productId, { ...line, quantity: 0, remarks: [] });
            const mergedLine = productLines.get(productId);
            mergedLine.quantity += quantity(line.quantity);
            const remark = text(line.remark);
            if (remark && !mergedLine.remarks.includes(remark)) mergedLine.remarks.push(remark);
        }
        const orderProducts = [...productLines.values()].map((line: any) => {
            const productId = text(line.productId);
            const product = productMap.get(productId);
            const demand = quantity(line.quantity);
            const rows = orderReservations.filter((row) => id(row.stockProductId) === productId);
            const planning = buildProductionPlanning(order, productId, productId, linked, planningReservations);
            const amounts = overviewProductQuantities(demand, rows, planning.released, planning.remaining);
            return {
                productId, code: text(product?.code || line.productCode),
                name: text(product?.model || line.model || product?.name || line.productName),
                material: text(product?.material) || "未维护", category: text(product?.categoryName) || "未分类",
                unit: text(product?.unitName || line.unitName) || "个", image: text(product?.image || line.image),
                remark: line.remarks.join("\n"),
                quantity: demand, ...amounts, planningCoverage: planning.externalCoverage,
                legacyReviewRequired: planning.legacyReviewRequired,
                bomVersion: params.candidateOnly && !isProductAvailable(productId) ? "" : text(bomMap.get(productId)?.version),
            };
        });
        const components = orderProducts.flatMap((root: any) => {
            const bom = bomMap.get(root.productId);
            return (bom?.items || []).flatMap((item: any) => {
                const childId = id(item.productId);
                const child = productMap.get(childId);
                if (!child || !bomMap.has(childId)) return [];
                const planning = buildProductionPlanning(order, root.productId, childId, linked, planningReservations, bom);
                const reserved = orderComponentReservations.filter((row) => id(row.demandProductId) === root.productId && id(row.stockProductId) === childId)
                    .reduce((sum, row) => sum + reservationRemaining(row), 0);
                return [{ productId: childId, parentProductId: root.productId, code: text(child.code),
                    name: text(child.model || child.name), material: text(child.material) || "未维护",
                    category: text(child.categoryName) || "未分类", unit: text(child.unitName) || "个",
                    image: text(child.image), quantity: planning.requiredQty, locked: reserved, received: 0,
                    released: planning.released, remaining: planning.remaining, planningCoverage: planning.externalCoverage,
                    legacyReviewRequired: planning.legacyReviewRequired,
                    bomVersion: params.candidateOnly && (!isProductAvailable(root.productId) || !isProductAvailable(childId))
                        ? "" : text(bomMap.get(childId)?.version) }];
            });
        });
        const completion = params.candidateOnly || options.readOnly
            ? getSalesOrderCompletionSummary(order)
            : await getSalesOrderCompletionReadiness(order);
        const item: any = {
            id: text(order.orderNo), salesOrderId, salesperson: text(order.salespersonName) || "未指定",
            completion,
            type: text(order.orderType), dueDate: productionDueDate(order), status: salesOrderDisplayStatus(order.status),
            productionOrders: linked.map((row) => row.documentNo),
            productionOrderDetails: linked.map((row) => ({ id: id(row._id), documentNo: row.documentNo, status: row.status, version: row.version,
                productId: id(row.productId), planQty: quantity(row.planQty), completedQty: quantity(row.completedQty), receivedQty: quantity(row.receivedQty) })),
            products: orderProducts, components,
            requirements: { custom: text(order.sampleRequirement), installation: text(order.installationRequirement), testing: text(order.testingRequirement) },
            orderRemark: text(order.orderRemark) || text(order.remark),
            orderImages: Array.isArray(order.orderImages) ? order.orderImages : [],
            machineNumbers: linked.flatMap((row) => row.machineNumbers || []),
        };
        if (!options.readOnly && order.inventoryReviewCompletedAt && order.inventoryReviewResult) {
            item.warehouseReview = {
                ...order.inventoryReviewResult,
                reviewedAt: new Date(order.inventoryReviewCompletedAt).toISOString(),
            };
        }
        if (params.candidateOnly) {
            let createBlockReason = "";
            if (completion.confirmation) createBlockReason = "订单已确认完工或历史放行，不能新建生产单。";
            else if (order.status === "已出库") createBlockReason = "订单已出库，不能新建生产单。";
            else if (!hasProductionCandidateDemand(item)) {
                const pendingProducts = [...orderProducts, ...components].filter((product) => Math.floor(product.remaining) >= 1);
                const finishedProductsReady = orderProducts.length > 0 && orderProducts.every((product) =>
                    normalizeStockQuantity(product.locked + product.received) >= product.quantity);
                if (!orderProducts.length) createBlockReason = "订单缺少产品资料，不能新建生产单。";
                else if (finishedProductsReady || !pendingProducts.length) createBlockReason = "库存或已有生产计划已覆盖需求，暂无可下达数量。";
                else if (pendingProducts.some((product) => product.legacyReviewRequired)) createBlockReason = "存在未关联的历史生产入库，请先核对来源记录。";
                else if (pendingProducts.some((product) => !isProductAvailable(product.productId)
                    || ("parentProductId" in product && !isProductAvailable(product.parentProductId)))) {
                    createBlockReason = "生产产品资料缺失或已删除，请先维护产品档案。";
                } else createBlockReason = "待生产产品缺少有效 BOM，请先维护并启用 BOM。";
            }
            item.canCreate = !createBlockReason;
            item.createBlockReason = createBlockReason;
        }
        list.push(item);
    }
    const counts: Record<string, number> = { "待采购": 0, "待生产": 0, "生产中": 0, "待发货": 0 };
    if (params.candidateOnly) counts["已出库"] = 0;
    for (const row of statusRows) counts[salesOrderDisplayStatus(row._id)] = row.count;
    return { list, pagination: { page, limit, total }, counts };
};
