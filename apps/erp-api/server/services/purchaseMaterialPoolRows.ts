export type MaterialPoolRequirement = Record<string, any>;

export type StockSummary = {
    availableQuantity: number;
    lockedQuantity: number;
};

export type InTransitSummary = {
    inTransitQuantity: number;
};

export type PurchaseHistory = {
    id: string;
    orderNo: string;
    purchaseDate: Date | string | null;
    supplierName: string;
    quantity: number;
    unitPrice: number;
    status: string;
};

export type BuildRowsOptions = {
    requirements: MaterialPoolRequirement[];
    salesOrderMap: Map<string, any>;
    purchaseRequestMap?: Map<string, any>;
    purchaseRequests?: any[];
    requestAllocationMap?: Map<string, number>;
    productMap: Map<string, any>;
    stockMap: Map<string, StockSummary>;
    inTransitMap: Map<string, InTransitSummary>;
    supplierMap: Map<string, { supplierId: string; supplierName: string }>;
    purchaseHistoryMap: Map<string, PurchaseHistory[]>;
    keyword?: string;
    materialKeyword?: string;
    now?: Date;
};

const normalizeQuantity = (value: unknown) => {
    const num = Number(value ?? 0);
    return Number.isFinite(num) ? Number(num.toFixed(3)) : 0;
};

const toText = (value: unknown) => {
    if (value === null || value === undefined) return "";
    return String(value).trim();
};

const normalizeDate = (value: unknown) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
};

const getContractDurationDays = (value: unknown) => {
    const match = toText(value).match(/\d+/);
    if (!match) return 0;

    return Number(match[0] || 0);
};

const getDeliveryDate = (requirement: MaterialPoolRequirement) => {
    const dispatchDate = normalizeDate(requirement.dispatchDate);
    const durationDays = getContractDurationDays(requirement.durationText);
    if (dispatchDate && (durationDays > 0 || toText(requirement.durationText) === "0天")) {
        const deliveryDate = new Date(dispatchDate);
        deliveryDate.setUTCDate(deliveryDate.getUTCDate() + durationDays);

        return deliveryDate;
    }

    return normalizeDate(requirement.contractDeliveryDate || requirement.dispatchDate);
};

const getIdText = (value: any) => value?.toString?.() || toText(value);

const includesText = (values: unknown[], keyword = "") => {
    const text = toText(keyword).toLowerCase();
    if (!text) return true;

    return values.some((value) => toText(value).toLowerCase().includes(text));
};

const getRemainingDays = (date: Date | null, now = new Date()) => {
    if (!date) return null;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(0, 0, 0, 0);

    return Math.ceil((end.getTime() - start.getTime()) / 86400000);
};

const getPurchaseRequestItemIndex = (request: any, requirement: MaterialPoolRequirement) => {
    const items = Array.isArray(request?.items) ? request.items : [];
    const requirementId = getIdText(requirement._id);
    const productId = getIdText(requirement.productId);

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (
            requirementId
            && toText(item?.requirementId) === requirementId
            && toText(item?.productId) === productId
        ) {
            return index;
        }
    }

    if (requirement.source !== "purchase-request-added") return undefined;
    let matchedIndex: number | undefined;
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (toText(item?.requirementId) || toText(item?.productId) !== productId) continue;
        if (matchedIndex !== undefined) return undefined;
        matchedIndex = index;
    }
    return matchedIndex;
};

export const buildPurchaseMaterialPoolRows = ({
    requirements,
    salesOrderMap,
    purchaseRequestMap = new Map<string, any>(),
    purchaseRequests = [],
    requestAllocationMap = new Map<string, number>(),
    productMap,
    stockMap,
    inTransitMap,
    supplierMap,
    purchaseHistoryMap,
    keyword = "",
    materialKeyword = "",
    now = new Date(),
}: BuildRowsOptions) => {
    const groups = new Map<string, any>();

    const getOrCreateGroup = (productId: string, fallback: MaterialPoolRequirement) => {
        const product = productMap.get(productId) || {};
        const supplier = supplierMap.get(productId);
        if (!groups.has(productId)) {
            const stock = stockMap.get(productId) || { availableQuantity: 0, lockedQuantity: 0 };
            const inTransit = inTransitMap.get(productId) || { inTransitQuantity: 0 };

            groups.set(productId, {
                id: productId,
                productId,
                unitId: getIdText(product.unitId || fallback.unitId),
                materialCode: product.code || fallback.productCode || "",
                materialName: product.name || fallback.productName || "",
                materialModel: product.model || product.modelCode || fallback.productModel || "",
                materialType: product.categoryName || product.source || product.material || "",
                shortageQuantity: 0,
                unit: product.unitName || fallback.unitName || "",
                suggestedSupplier: supplier?.supplierName || "",
                suggestedSupplierId: supplier?.supplierId || "",
                estimatedUnitPrice: Number(product.averagePrice || product.standardPrice || 0),
                inventory: {
                    availableQuantity: stock.availableQuantity,
                    inTransitQuantity: inTransit.inTransitQuantity,
                    reservedQuantity: 0,
                    safetyStock: Number(product.stockLowerLimit || 0),
                },
                purchaseHistory: purchaseHistoryMap.get(productId) || [],
                sources: [],
            });
        }
        return groups.get(productId);
    };

    for (const requirement of requirements) {
        const productId = getIdText(requirement.productId);
        if (!productId) continue;
        const remainingPurchaseQuantity = normalizeQuantity(requirement.remainingPurchaseQuantity);
        if (remainingPurchaseQuantity <= 0) continue;

        const salesOrder = salesOrderMap.get(getIdText(requirement.salesOrderId)) || {};
        const purchaseRequestId = getIdText(requirement.purchaseRequestId);
        const purchaseRequest = purchaseRequestMap.get(purchaseRequestId);
        const purchaseRequestItemIndex = getPurchaseRequestItemIndex(purchaseRequest, requirement);
        const group = getOrCreateGroup(productId, requirement);
        const deliveryDate = getDeliveryDate({
            ...requirement,
            dispatchDate: salesOrder.orderDate || requirement.dispatchDate,
            durationText: salesOrder.durationText || requirement.durationText,
        });
        group.shortageQuantity = normalizeQuantity(group.shortageQuantity + remainingPurchaseQuantity);
        group.inventory.reservedQuantity = normalizeQuantity(
            group.inventory.reservedQuantity + Number(requirement.allocatedQuantity || 0),
        );
        group.sources.push({
            id: getIdText(requirement._id),
            sourceType: "sales-order",
            requirementId: getIdText(requirement._id),
            purchaseRequestId,
            purchaseRequestNo: purchaseRequest?.requestNo || "",
            ...(purchaseRequestItemIndex !== undefined ? { purchaseRequestItemIndex } : {}),
            salesOrderId: getIdText(requirement.salesOrderId),
            orderNo: salesOrder.orderNo || requirement.salesOrderNo || "",
            salesOrderNo: salesOrder.orderNo || requirement.salesOrderNo || "",
            orderType: salesOrder.orderType || requirement.orderType || "",
            salesperson: salesOrder.salespersonName || salesOrder.creator || requirement.salesperson || "",
            orderRemark: salesOrder.orderRemark || salesOrder.remark || "",
            orderImages: Array.isArray(salesOrder.orderImages) ? salesOrder.orderImages : [],
            sampleRequirement: salesOrder.sampleRequirement || "",
            requiredQuantity: normalizeQuantity(requirement.requiredQuantity || 0),
            shortageQuantity: normalizeQuantity(requirement.shortageQuantity || 0),
            remainingPurchaseQuantity,
            deliveryDate,
            remainingDays: getRemainingDays(deliveryDate, now),
        });
    }

    for (const request of purchaseRequests) {
        const purchaseRequestId = getIdText(request._id);
        if (!purchaseRequestId || request.status !== "approved" || request.category === "销售订单采购") continue;
        const items = Array.isArray(request.items) ? request.items : [];
        for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
            const item = items[itemIndex];
            const productId = toText(item?.productId);
            if (!productId || !productMap.has(productId)) continue;

            const requestedQuantity = normalizeQuantity(item.quantity);
            const allocatedQuantity = Math.max(normalizeQuantity(
                requestAllocationMap.get(`${purchaseRequestId}:${itemIndex}`),
            ), 0);
            const remainingPurchaseQuantity = Math.max(
                normalizeQuantity(requestedQuantity - allocatedQuantity),
                0,
            );
            if (remainingPurchaseQuantity <= 0) continue;

            const group = getOrCreateGroup(productId, {
                productName: item.name,
                productModel: item.model,
                unitName: item.unit,
            });
            group.shortageQuantity = normalizeQuantity(group.shortageQuantity + remainingPurchaseQuantity);
            group.inventory.reservedQuantity = normalizeQuantity(
                group.inventory.reservedQuantity + allocatedQuantity,
            );
            group.sources.push({
                id: `request:${purchaseRequestId}:${itemIndex}`,
                sourceType: "purchase-request",
                requirementId: "",
                purchaseRequestId,
                purchaseRequestNo: request.requestNo || "",
                purchaseRequestItemIndex: itemIndex,
                salesOrderId: "",
                orderNo: request.requestNo || "",
                salesOrderNo: "",
                orderType: request.category || "",
                salesperson: request.applicantName || request.applicantUsername || "",
                orderRemark: request.remark || "",
                orderImages: Array.isArray(request.images) ? request.images : [],
                sampleRequirement: "",
                requiredQuantity: requestedQuantity,
                shortageQuantity: requestedQuantity,
                remainingPurchaseQuantity,
                deliveryDate: null,
                remainingDays: null,
            });
        }
    }

    return Array.from(groups.values())
        .filter((row) => includesText([
            row.materialCode,
            row.materialName,
            row.materialModel,
            ...row.sources.flatMap((source: any) => [
                source.orderNo,
                source.orderType,
                source.salesperson,
                source.orderRemark,
                source.sampleRequirement,
            ]),
        ], keyword))
        .filter((row) => includesText([
            row.materialCode,
            row.materialName,
            row.materialModel,
        ], materialKeyword))
        .sort((a, b) => {
            const aDate = a.sources[0]?.deliveryDate ? new Date(a.sources[0].deliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
            const bDate = b.sources[0]?.deliveryDate ? new Date(b.sources[0].deliveryDate).getTime() : Number.MAX_SAFE_INTEGER;
            if (aDate !== bDate) return aDate - bDate;
            return String(a.materialCode).localeCompare(String(b.materialCode));
        });
};
