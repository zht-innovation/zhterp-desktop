import mongoose from "mongoose";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import { InventoryWarehouse } from "~~/server/models/inventoryBase.model";
import { PurchaseMaterialRequirement, normalizePurchaseQuantity } from "~~/server/models/purchaseMaterialRequirement.model";
import { PurchaseOrder } from "~~/server/models/purchaseOrder.model";
import { PurchaseOrderAllocation } from "~~/server/models/purchaseOrderAllocation.model";
import { PurchaseRequest, type PurchaseRequestData } from "~~/server/models/purchaseRequest.model";
import { PurchaseRequestOrderAllocation } from "~~/server/models/purchaseRequestOrderAllocation.model";
import { PurchaseSupplier, PurchaseSupplierProduct } from "~~/server/models/purchaseSupplier.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { getPurchaseInTransitSummaryMap } from "~~/server/services/purchaseInTransitSummary";
import type { PurchaseVisibilityScope } from "~~/server/services/purchaseVisibility";
import { getDirectPurchaseAllocationReceipts } from "~~/server/services/salesOrderProductionCompletionMath";
import {
    buildPurchaseMaterialPoolRows,
    type InTransitSummary,
    type MaterialPoolRequirement,
    type PurchaseHistory,
    type StockSummary,
} from "~~/server/services/purchaseMaterialPoolRows";
import {
    getPageParams,
    isValidObjectId,
    throwInventoryError,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import { CODE } from "~~/server/utils/code";

type MaterialPoolOptions = {
    keyword?: string;
    materialKeyword?: string;
    productId?: string;
    page?: number;
    limit?: number;
    scope?: PurchaseVisibilityScope;
};

const getIdText = (value: any) => value?.toString?.() || toText(value);

const getValidSalesOrderMap = async (requirements: MaterialPoolRequirement[]) => {
    const salesOrderIds = [
        ...new Set(requirements.map((item) => getIdText(item.salesOrderId)).filter(isValidObjectId)),
    ];
    if (!salesOrderIds.length) return new Map<string, any>();

    const orders = await useSalesOrderModel().order
        .find({
            _id: { $in: salesOrderIds.map((id) => toObjectId(id)) },
            _isDeleted: { $ne: true },
            status: "待采购",
        })
        .select([
            "_id",
            "orderNo",
            "orderType",
            "salespersonName",
            "creator",
            "orderDate",
            "durationText",
            "orderRemark",
            "remark",
            "orderImages",
            "sampleRequirement",
        ].join(" "))
        .lean();

    return new Map((orders as any[]).map((order) => [getIdText(order._id), order]));
};

const getProductMap = async (productIds: string[]) => {
    const products = await InventoryProduct
        .find({
            _id: { $in: productIds.map((id) => toObjectId(id)) },
            _isDeleted: { $ne: true },
        })
        .lean();

    return new Map((products as any[]).map((product) => [getIdText(product._id), product]));
};

const getStockMap = async (productIds: string[]) => {
    const stockRows = await InventoryStock
        .find({
            productId: { $in: productIds.map((id) => toObjectId(id)) },
            _isDeleted: { $ne: true },
        })
        .select("productId warehouseId quantity lockedQuantity")
        .lean();
    const warehouseIds = [
        ...new Set(
            (stockRows as any[])
                .map((row) => getIdText(row.warehouseId))
                .filter(isValidObjectId),
        ),
    ];
    const warehouses = warehouseIds.length
        ? await InventoryWarehouse
            .find({ _id: { $in: warehouseIds.map((id) => toObjectId(id)) }, _isDeleted: { $ne: true } })
            .select("_id includeInAvailable")
            .lean()
        : [];
    const warehouseAvailability = new Map<string, boolean>(
        (warehouses as any[]).map((warehouse) => [
            getIdText(warehouse._id),
            warehouse.includeInAvailable !== false,
        ]),
    );
    const result = new Map<string, StockSummary>();

    (stockRows as any[]).forEach((row) => {
        const productId = getIdText(row.productId);
        const summary = result.get(productId) || { availableQuantity: 0, lockedQuantity: 0 };
        const warehouseId = getIdText(row.warehouseId);
        const includeInAvailable = warehouseId
            ? warehouseAvailability.get(warehouseId) !== false
            : true;
        const quantity = normalizePurchaseQuantity(row.quantity || 0);
        const lockedQuantity = normalizePurchaseQuantity(row.lockedQuantity || 0);
        if (includeInAvailable) {
            summary.availableQuantity = normalizePurchaseQuantity(
                summary.availableQuantity + Math.max(quantity - lockedQuantity, 0),
            );
        }
        summary.lockedQuantity = normalizePurchaseQuantity(summary.lockedQuantity + lockedQuantity);
        result.set(productId, summary);
    });

    return result;
};

const getSupplierMap = async (productIds: string[]) => {
    const relations = await PurchaseSupplierProduct
        .find({
            productId: { $in: productIds.map((id) => toObjectId(id)) },
            _isDeleted: { $ne: true },
        })
        .sort({ updateTime: -1, createTime: -1 })
        .lean();
    const supplierIds = [
        ...new Set((relations as any[]).map((relation) => getIdText(relation.supplierId)).filter(isValidObjectId)),
    ];
    const suppliers = supplierIds.length
        ? await PurchaseSupplier
            .find({
                _id: { $in: supplierIds.map((id) => toObjectId(id)) },
                _isDeleted: { $ne: true },
                isEnabled: true,
            })
            .select("_id name")
            .lean()
        : [];
    const supplierNameMap = new Map((suppliers as any[]).map((supplier) => [getIdText(supplier._id), supplier.name || ""]));
    const result = new Map<string, { supplierId: string; supplierName: string }>();

    (relations as any[]).forEach((relation) => {
        const productId = getIdText(relation.productId);
        const supplierName = supplierNameMap.get(getIdText(relation.supplierId));
        if (productId && supplierName && !result.has(productId)) {
            result.set(productId, {
                supplierId: getIdText(relation.supplierId),
                supplierName,
            });
        }
    });

    return result;
};

const getPurchaseHistoryMap = async (productIds: string[], limitPerProduct = 5) => {
    const orders = await PurchaseOrder
        .find({
            _isDeleted: { $ne: true },
            "items.productId": { $in: productIds.map((id) => toObjectId(id)) },
        })
        .sort({ purchaseDate: -1, updateTime: -1 })
        .limit(productIds.length * limitPerProduct)
        .lean();
    const result = new Map<string, PurchaseHistory[]>();

    (orders as any[]).forEach((order) => {
        (order.items || []).forEach((item: any) => {
            const productId = getIdText(item.productId);
            if (!productIds.includes(productId)) return;

            const list = result.get(productId) || [];
            if (list.length >= limitPerProduct) return;

            const quantity = normalizePurchaseQuantity(item.quantity || 0);
            const totalPrice = Number(order.totalPrice || 0);
            const totalQuantity = Number(order.totalQuantity || 0);
            list.push({
                id: getIdText(order._id),
                orderNo: order.orderNo || "",
                purchaseDate: order.purchaseDate || null,
                supplierName: order.supplierName || "",
                quantity,
                unitPrice: item.unitPrice === undefined || item.unitPrice === null
                    ? (totalQuantity > 0 ? normalizePurchaseQuantity(totalPrice / totalQuantity) : 0)
                    : Number(item.unitPrice),
                status: order.status || "",
            });
            result.set(productId, list);
        });
    });

    return result;
};

const getOwnedInTransitMap = async (productIds: string[], requestIds: any[]) => {
    const result = new Map<string, InTransitSummary>();
    if (!requestIds.length) return result;
    const productObjectIds = productIds.map((id) => toObjectId(id));
    const [directAllocations, requirements] = await Promise.all([
        PurchaseRequestOrderAllocation.find({
            purchaseRequestId: { $in: requestIds },
            productId: { $in: productObjectIds },
            requirementId: null,
        }).lean(),
        PurchaseMaterialRequirement.find({
            purchaseRequestId: { $in: requestIds },
            productId: { $in: productObjectIds },
        }).select("_id").lean(),
    ]) as [any[], any[]];
    const legacyAllocations = requirements.length
        ? await PurchaseOrderAllocation.find({
            requirementId: { $in: requirements.map((item) => item._id) },
            productId: { $in: productObjectIds },
        }).lean() as any[]
        : [];
    const purchaseIds = [...new Set(
        [...directAllocations, ...legacyAllocations].map((item) => getIdText(item.purchaseOrderId)).filter(isValidObjectId),
    )];
    if (!purchaseIds.length) return result;
    const purchases = await PurchaseOrder.find({
        _id: { $in: purchaseIds.map((id) => toObjectId(id)) },
        _isDeleted: { $ne: true },
        status: { $ne: "已完成" },
    }).select("_id orderNo").lean() as any[];
    if (!purchases.length) return result;
    const purchaseIdSet = new Set(purchases.map((item) => getIdText(item._id)));
    const purchaseByNo = new Map(purchases.map((item) => [toText(item.orderNo), item]));
    const purchaseMatch = {
        purchaseOrderId: { $in: purchases.map((item) => item._id) },
        productId: { $in: productObjectIds },
    };
    const [allDirect, allLegacy, inboundDocuments] = directAllocations.length
        ? await Promise.all([
            PurchaseRequestOrderAllocation.find({ ...purchaseMatch, requirementId: null }).lean(),
            PurchaseOrderAllocation.find(purchaseMatch).lean(),
            mongoose.connection.collection("inventoryinbounds").find({
                type: "采购", purchaseOrderNo: { $in: [...purchaseByNo.keys()] },
                stockApplied: true, _isDeleted: { $ne: true },
            }, { projection: { purchaseOrderNo: 1, items: 1 } }).toArray(),
        ]) as [any[], any[], any[]]
        : [[], [], []];
    const receipts: Array<{ purchaseOrderId: any; productId: any; quantity: number }> = [];
    for (const document of inboundDocuments) {
        const purchase = purchaseByNo.get(toText(document.purchaseOrderNo));
        if (!purchase) continue;
        for (const item of Array.isArray(document.items) ? document.items : []) {
            receipts.push({ purchaseOrderId: purchase._id, productId: item.productId, quantity: item.quantity });
        }
    }
    // 到货先满足需求分配，再按现有 FIFO 归属直连分配；只汇总本人分配余额。
    const receivedByAllocation = getDirectPurchaseAllocationReceipts(allDirect, receipts, allLegacy);
    for (const allocation of [...legacyAllocations, ...directAllocations]) {
        if (!purchaseIdSet.has(getIdText(allocation.purchaseOrderId))) continue;
        const received = allocation.requirementId
            ? Number(allocation.lockedAfterInboundQuantity || 0)
            : receivedByAllocation.get(getIdText(allocation._id).toLowerCase()) || 0;
        const remaining = normalizePurchaseQuantity(Math.max(Number(allocation.allocatedQuantity || 0) - received, 0));
        const productId = getIdText(allocation.productId);
        const previous = result.get(productId)?.inTransitQuantity || 0;
        result.set(productId, { inTransitQuantity: normalizePurchaseQuantity(previous + remaining) });
    }
    return result;
};

const getCandidateRequirements = async (options: MaterialPoolOptions = {}, requestIds?: any[]) => {
    const filter: Record<string, any> = {
        status: "未完成",
        demandType: "purchase",
        poolReady: true,
        remainingPurchaseQuantity: { $gt: 0 },
    };
    if (requestIds) filter.purchaseRequestId = { $in: requestIds };
    if (options.productId) {
        if (!isValidObjectId(options.productId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
        }
        filter.productId = toObjectId(options.productId);
    }

    return await PurchaseMaterialRequirement
        .find(filter)
        .sort({ contractDeliveryDate: 1, dispatchDate: 1, updateTime: -1 })
        .lean();
};

const getApprovedPurchaseRequests = async (requirements: MaterialPoolRequirement[], productId?: string, ownedRequestIds?: any[]) => {
    const requestIds = [
        ...new Set(requirements.map((item) => getIdText(item.purchaseRequestId)).filter(isValidObjectId)),
    ];
    const filter: Record<string, any> = {
        status: "approved",
        $or: [
            { category: { $ne: "销售订单采购" } },
            { _id: { $in: requestIds.map((id) => toObjectId(id)) } },
        ],
    };
    if (ownedRequestIds) filter._id = { $in: ownedRequestIds };
    if (productId) filter["items.productId"] = productId;

    return await PurchaseRequest.find(filter)
        .select("_id requestNo status category applicantName applicantUsername items remark images salesOrderId salesOrderNo")
        .sort({ processedAt: -1, updateTime: -1 })
        .lean<PurchaseRequestData[]>();
};

const getRequestAllocationMap = async (requests: PurchaseRequestData[], productId?: string) => {
    const result = new Map<string, number>();
    if (!requests.length) return result;

    const match: Record<string, any> = {
        purchaseRequestId: { $in: requests.map((request) => request._id) },
        $or: [{ requirementId: null }, { requirementId: { $exists: false } }],
    };
    if (productId) match.productId = toObjectId(productId);

    const rows = await PurchaseRequestOrderAllocation.aggregate([
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
    ]);
    for (const row of rows) {
        const key = `${getIdText(row._id.purchaseRequestId)}:${row._id.purchaseRequestItemIndex}`;
        result.set(key, normalizePurchaseQuantity(row.allocatedQuantity));
    }
    return result;
};

export const retrievePurchaseMaterialPool = async (options: MaterialPoolOptions = {}) => {
    const pageOptions = getPageParams({ page: options.page, limit: options.limit });
    const ownedRequestIds = options.scope?.applicantId
        ? await PurchaseRequest.find({
            applicantId: toObjectId(options.scope.applicantId),
            status: "approved",
        }).distinct("_id")
        : undefined;
    const requirements = await getCandidateRequirements(options, ownedRequestIds);
    const salesOrderMap = await getValidSalesOrderMap(requirements as any[]);
    const validRequirements = (requirements as any[]).filter((item) =>
        salesOrderMap.has(getIdText(item.salesOrderId)),
    );
    const approvedRequests = await getApprovedPurchaseRequests(validRequirements, options.productId, ownedRequestIds);
    const purchaseRequestMap = new Map(approvedRequests.map((request) => [getIdText(request._id), request]));
    const purchaseRequests = approvedRequests.filter((request) => request.category !== "销售订单采购");
    const productIdSet = new Set(validRequirements.map((item) => getIdText(item.productId)).filter(isValidObjectId));
    for (const request of purchaseRequests) {
        for (const item of request.items || []) {
            const productId = getIdText(item.productId);
            if (isValidObjectId(productId) && (!options.productId || productId === options.productId)) {
                productIdSet.add(productId);
            }
        }
    }
    const productIds = [...productIdSet];
    if (!productIds.length) {
        return {
            list: [],
            pagination: {
                page: pageOptions.page,
                limit: pageOptions.limit,
                total: 0,
                hasMore: false,
            },
        };
    }

    const [productMap, stockMap, inTransitMap, supplierMap, purchaseHistoryMap, requestAllocationMap] = await Promise.all([
        getProductMap(productIds),
        getStockMap(productIds),
        ownedRequestIds ? getOwnedInTransitMap(productIds, ownedRequestIds) : getPurchaseInTransitSummaryMap(productIds),
        getSupplierMap(productIds),
        ownedRequestIds ? Promise.resolve(new Map<string, PurchaseHistory[]>()) : getPurchaseHistoryMap(productIds),
        getRequestAllocationMap(purchaseRequests, options.productId),
    ]);
    const rows = buildPurchaseMaterialPoolRows({
        requirements: validRequirements,
        purchaseRequests,
        purchaseRequestMap,
        requestAllocationMap,
        salesOrderMap,
        productMap,
        stockMap,
        inTransitMap,
        supplierMap,
        purchaseHistoryMap,
        keyword: options.keyword,
        materialKeyword: options.materialKeyword,
    });
    const list = rows.slice(pageOptions.skip, pageOptions.skip + pageOptions.limit);

    return {
        list,
        pagination: {
            page: pageOptions.page,
            limit: pageOptions.limit,
            total: rows.length,
            hasMore: pageOptions.skip + list.length < rows.length,
        },
    };
};

export const getPurchaseMaterialPoolDetail = async (productId: string, options: Pick<MaterialPoolOptions, "scope"> = {}) => {
    if (!isValidObjectId(productId)) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "productId 格式错误");
    }

    const result = await retrievePurchaseMaterialPool({
        scope: options.scope,
        productId,
        page: 1,
        limit: 200,
    });
    const detail = result.list.find((item: any) => item.productId === productId || item.id === productId);
    if (!detail) {
        throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "待采购物料不存在");
    }

    return detail;
};
