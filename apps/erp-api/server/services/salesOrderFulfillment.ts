import mongoose from "mongoose";
import { PurchaseMaterialRequirement } from "~~/server/models/purchaseMaterialRequirement.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { productionFulfillmentStatus } from "~~/server/services/productionOverviewMath";
import {
    escapeRegExp,
    getPageParams,
    isValidObjectId,
    throwInventoryError,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import { normalizeStockQuantity } from "~~/server/services/inventoryStockMath";
import { CODE } from "~~/server/utils/code";
import { salesOrderShipmentStatus } from "./salesOrderShipmentMath";
import {
    ensureSalesOrderCompletionState,
    hasSalesOrderCompletionRelease,
    lockSalesOrderForProduction,
} from "./salesOrderCompletionState";

export const FULFILLMENT_MANAGED_STATUSES = [
    "待采购",
    "待生产",
    "生产中",
    "待出库",
] as const;

export const PRODUCTION_INBOUND_SALES_ORDER_STATUSES = [
    "待生产",
    "生产中",
] as const;

type FulfillmentStatus = typeof FULFILLMENT_MANAGED_STATUSES[number] | "已出库";

type FulfillmentOptions = {
    session?: mongoose.ClientSession;
    allowPendingApproval?: boolean;
};

type CandidateOptions = {
    keyword?: string;
    page?: number;
    limit?: number;
};

type ProductionInboundItem = {
    productId?: any;
    quantity?: number;
    warehouseId?: any;
    locationId?: any;
    toObject?: () => Record<string, any>;
    [key: string]: any;
};

const withSession = <T extends mongoose.Query<any, any>>(
    query: T,
    session?: mongoose.ClientSession,
) => {
    if (session) query.session(session);
    return query;
};

export const buildSalesOrderProductDemandMap = (products: any[] = []) => {
    const demandMap = new Map<string, number>();
    for (const product of Array.isArray(products) ? products : []) {
        const productId = toText(product?.productId || product?._id || product?.id);
        const quantity = normalizeStockQuantity(product?.quantity || 0);
        if (!isValidObjectId(productId) || quantity <= 0) continue;
        demandMap.set(
            productId,
            normalizeStockQuantity((demandMap.get(productId) || 0) + quantity),
        );
    }
    return demandMap;
};

export const getFinishedProductCoverageMap = async (
    salesOrderId: string,
    session?: mongoose.ClientSession,
) => {
    const coverageMap = new Map<string, number>();
    const query = SalesOrderStockReservation.find({
        salesOrderId: toObjectId(salesOrderId),
        reservationType: "finished-product",
    }).select("stockProductId reservedQuantity releasedQuantity").lean();
    const reservations = await withSession(query, session) as any[];

    for (const reservation of reservations) {
        const productId = reservation.stockProductId?.toString?.() || "";
        if (!productId) continue;
        const covered = normalizeStockQuantity(Math.max(
            Number(reservation.reservedQuantity || 0) - Number(reservation.releasedQuantity || 0),
            0,
        ));
        coverageMap.set(
            productId,
            normalizeStockQuantity((coverageMap.get(productId) || 0) + covered),
        );
    }
    return coverageMap;
};

export const getFinishedProductShortageMap = async (
    salesOrder: any,
    session?: mongoose.ClientSession,
) => {
    const salesOrderId = salesOrder?._id?.toString?.() || "";
    const demandMap = buildSalesOrderProductDemandMap(salesOrder?.products || []);
    const coverageMap = await getFinishedProductCoverageMap(salesOrderId, session);
    const shortageMap = new Map<string, number>();

    for (const [productId, requiredQuantity] of demandMap) {
        shortageMap.set(
            productId,
            normalizeStockQuantity(Math.max(
                requiredQuantity - (coverageMap.get(productId) || 0),
                0,
            )),
        );
    }

    return { demandMap, coverageMap, shortageMap };
};

export const getSalesOrderShippedQuantities = async (salesOrderId: string, session?: mongoose.ClientSession) => {
    const query = SalesOrderStockReservation.find({
        salesOrderId: toObjectId(salesOrderId), reservationType: "finished-product",
    }).select("stockProductId consumedQuantity").lean();
    const rows = await withSession(query, session) as any[];
    const quantities = new Map<string, number>();
    for (const row of rows) {
        const productId = toText(row.stockProductId);
        quantities.set(productId, normalizeStockQuantity((quantities.get(productId) || 0) + Number(row.consumedQuantity || 0)));
    }
    return quantities;
};

export const refreshSalesOrderShipmentStatus = async (salesOrder: any, actor: string, session: mongoose.ClientSession) => {
    const demand = buildSalesOrderProductDemandMap(salesOrder.products);
    const shipped = await getSalesOrderShippedQuantities(toText(salesOrder._id), session);
    const status = salesOrderShipmentStatus(demand, shipped);
    await useSalesOrderModel().order.updateOne({ _id: salesOrder._id, _isDeleted: { $ne: true } }, {
        $set: { status, updatedBy: actor },
    }, { session });
    return status;
};

const hasActiveProductionInbound = async (
    salesOrderId: string,
    session?: mongoose.ClientSession,
) => {
    const directInbound = await mongoose.connection.collection("inventoryinbounds").findOne({
        salesOrderId: toObjectId(salesOrderId), type: "生产", stockApplied: true, _isDeleted: { $ne: true },
    }, { session });
    if (directInbound) return true;
    const reservationQuery = SalesOrderStockReservation.find({
        salesOrderId: toObjectId(salesOrderId),
        reservationType: "finished-product",
        sourceInboundId: { $ne: null },
        $expr: { $gt: ["$reservedQuantity", "$releasedQuantity"] },
    }).select("sourceInboundId").lean();
    const reservations = await withSession(reservationQuery, session) as any[];
    const sourceInboundIds = [
        ...new Set(
            reservations
                .map((item) => item.sourceInboundId?.toString?.() || "")
                .filter(isValidObjectId),
        ),
    ];
    if (!sourceInboundIds.length) return false;

    const inboundIds = sourceInboundIds
        .map((id) => toObjectId(id))
        .filter((id): id is mongoose.Types.ObjectId => Boolean(id));
    const inbound = await mongoose.connection.collection("inventoryinbounds").findOne(
        {
            _id: { $in: inboundIds },
            type: "生产",
            stockApplied: true,
            _isDeleted: { $ne: true },
        },
        session ? { session } : {},
    );
    return Boolean(inbound);
};

export const resolveSalesOrderFulfillmentStatus = async (
    salesOrder: any,
    options: FulfillmentOptions = {},
): Promise<FulfillmentStatus> => {
    salesOrder = await ensureSalesOrderCompletionState(salesOrder, options.session);
    const salesOrderId = salesOrder?._id?.toString?.() || "";
    if (hasSalesOrderCompletionRelease(salesOrder)) {
        if (salesOrder.productionCompletion?.source === "legacy" && salesOrder.status === "已出库") return "已出库";
        const demand = buildSalesOrderProductDemandMap(salesOrder.products);
        const shipped = await getSalesOrderShippedQuantities(salesOrderId, options.session);
        return salesOrderShipmentStatus(demand, shipped);
    }
    if (salesOrder.productionCompletionReviewReason) {
        if (salesOrder.status === "待采购" || salesOrder.status === "待生产") return salesOrder.status;
        return "生产中";
    }
    const { demandMap, coverageMap } = await getFinishedProductShortageMap(
        salesOrder,
        options.session,
    );
    const pendingRequirementQuery = PurchaseMaterialRequirement.exists({
        salesOrderId: toObjectId(salesOrderId),
        _isDeleted: { $ne: true },
        status: "未完成",
    });
    const pendingRequirement = await withSession(pendingRequirementQuery, options.session);
    const finishedProductsReady = demandMap.size > 0 && [...demandMap.entries()].every(
        ([productId, requiredQuantity]) =>
            (coverageMap.get(productId) || 0) >= requiredQuantity,
    );

    if (finishedProductsReady && salesOrder.productionCompletionRequired !== true) {
        return salesOrderShipmentStatus(demandMap, await getSalesOrderShippedQuantities(salesOrderId, options.session));
    }

    const startedQuery = ProductionOrder.exists({
        salesOrderId: toObjectId(salesOrderId), status: { $in: ["生产中", "已完成"] },
    });
    const started = await withSession(startedQuery, options.session);
    const hasProduction = toText(salesOrder.status) === "生产中" || Boolean(started)
        || await hasActiveProductionInbound(salesOrderId, options.session);
    return productionFulfillmentStatus(finishedProductsReady, hasProduction, Boolean(pendingRequirement),
        salesOrder.productionCompletionRequired === true);
};

export const refreshSalesOrderFulfillmentStatus = async (
    salesOrderId: string,
    actor: string,
    options: FulfillmentOptions = {},
) => {
    if (!isValidObjectId(salesOrderId)) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "销售订单ID格式错误");
    }

    const orderQuery = useSalesOrderModel().order.findOne({
        _id: toObjectId(salesOrderId),
        _isDeleted: { $ne: true },
    });
    let order = await withSession(orderQuery, options.session) as any;
    if (!order) {
        throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "销售订单不存在");
    }

    order = await ensureSalesOrderCompletionState(order, options.session);
    const currentStatus = toText(order.status);
    const canRefresh = FULFILLMENT_MANAGED_STATUSES.includes(currentStatus as typeof FULFILLMENT_MANAGED_STATUSES[number])
        || currentStatus === "已出库"
        || (options.allowPendingApproval && currentStatus === "待审核");
    if (!canRefresh) return order;

    const nextStatus = await resolveSalesOrderFulfillmentStatus(order, options);
    if (currentStatus === nextStatus) return order;

    const updated = await useSalesOrderModel().order.findOneAndUpdate(
        { _id: order._id, status: order.status, _isDeleted: { $ne: true },
            productionPlanVersion: order.productionPlanVersion === undefined ? { $exists: false } : order.productionPlanVersion },
        { $set: { status: nextStatus, updatedBy: actor } },
        {
            new: true,
            runValidators: true,
            ...(options.session ? { session: options.session } : {}),
        },
    );
    if (!updated) {
        throw new Error("订单状态已变化，请重试");
    }
    return updated;
};

export const buildProductionInboundLockPlan = async (
    salesOrderId: string,
    items: ProductionInboundItem[],
    session: mongoose.ClientSession,
    actor = "",
) => {
    if (!isValidObjectId(salesOrderId)) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "销售订单ID格式错误");
    }

    const order = await useSalesOrderModel().order.findOne({
        _id: toObjectId(salesOrderId),
        _isDeleted: { $ne: true },
        status: { $in: [...PRODUCTION_INBOUND_SALES_ORDER_STATUSES] },
    }).session(session) as any;
    if (!order) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "生产入库只能关联待生产或生产中的销售订单");
    }

    const lockedOrder = await lockSalesOrderForProduction(salesOrderId, actor, session, { requireCompletion: true });

    const { demandMap, shortageMap } = await getFinishedProductShortageMap(lockedOrder, session);
    let hasMatchedProduct = false;
    const plannedItems: Array<Record<string, any> & {
        quantity: number;
        lockedQuantity: number;
    }> = (Array.isArray(items) ? items : []).map((item) => {
        const productId = item.productId?.toString?.() || toText(item.productId);
        const quantity = normalizeStockQuantity(item.quantity || 0);
        const isOrderProduct = demandMap.has(productId);
        if (isOrderProduct) hasMatchedProduct = true;

        const remainingShortage = shortageMap.get(productId) || 0;
        const lockedQuantity = isOrderProduct
            ? normalizeStockQuantity(Math.min(quantity, remainingShortage))
            : 0;
        if (isOrderProduct) {
            shortageMap.set(
                productId,
                normalizeStockQuantity(Math.max(remainingShortage - lockedQuantity, 0)),
            );
        }

        const sourceItem: Record<string, any> = item.toObject?.() || item;
        return {
            ...sourceItem,
            quantity,
            lockedQuantity,
        };
    });

    if (!hasMatchedProduct) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "生产入库产品与所选销售订单不匹配");
    }

    const reservations = plannedItems
        .filter((item) => item.lockedQuantity > 0)
        .map((item) => ({
            salesOrderId: order._id,
            salesOrderNo: toText(order.orderNo),
            demandProductId: item.productId,
            stockProductId: item.productId,
            warehouseId: item.warehouseId || null,
            locationId: item.locationId || null,
            reservationType: "finished-product",
            requiredQuantity: demandMap.get(item.productId?.toString?.() || "") || 0,
            reservedQuantity: item.lockedQuantity,
        }));
    if (!reservations.length) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "所选销售订单没有可锁定的成品缺口");
    }

    return {
        order: lockedOrder,
        items: plannedItems,
        reservations,
    };
};

export const listProductionInboundSalesOrderCandidates = async (
    options: CandidateOptions = {},
) => {
    const pageOptions = getPageParams({ page: options.page, limit: options.limit });
    const filter: Record<string, any> = {
        _isDeleted: { $ne: true },
        status: { $in: [...PRODUCTION_INBOUND_SALES_ORDER_STATUSES] },
    };
    if (options.keyword) {
        const regex = new RegExp(escapeRegExp(toText(options.keyword)), "i");
        filter.$or = [
            { orderNo: regex },
            { customerName: regex },
            { customerCompany: regex },
            { salespersonName: regex },
        ];
    }

    const [orders, total] = await Promise.all([
        useSalesOrderModel().order
            .find(filter)
            .select("orderNo customerName customerCompany salespersonName status")
            .sort({ orderDate: 1, createTime: 1 })
            .skip(pageOptions.skip)
            .limit(pageOptions.limit)
            .lean(),
        useSalesOrderModel().order.countDocuments(filter),
    ]);

    return {
        list: (orders as any[]).map((order) => ({
            id: order._id?.toString?.() || "",
            orderNo: order.orderNo || "",
            customerName: order.customerCompany || order.customerName || "",
            salespersonName: order.salespersonName || "",
            status: order.status || "",
        })),
        pagination: {
            page: pageOptions.page,
            limit: pageOptions.limit,
            total,
            hasMore: pageOptions.skip + orders.length < total,
        },
    };
};
