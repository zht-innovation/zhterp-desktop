import mongoose from "mongoose";

export type PurchaseRequirementDraft = {
    salesOrderId: string;
    salesOrderNo: string;
    salesOrderStatusSnapshot: string;
    salesperson: string;
    orderType: string;
    dispatchDate: string | Date | null;
    durationText: string;
    productId: string;
    demandProductId: string;
    requiredQuantity: number;
    availableQuantityAtAnalysis: number;
    shortageQuantity: number;
    demandType: "purchase";
    suggestion: "需要采购";
};

export type PurchaseRequirementAnalysisDeps = {
    getAvailableQuantity: (productId: string) => Promise<number>;
    getBomItems: (productId: string) => Promise<Array<{
        productId?: string | { toString?: () => string } | null;
        quantity?: number | string;
    }>>;
};

const normalizeQuantity = (value: unknown) => {
    const numberValue = Number(value || 0);
    if (!Number.isFinite(numberValue)) return 0;
    return Math.max(0, Number(numberValue.toFixed(6)));
};

const toText = (value: unknown) => {
    if (value === null || value === undefined) return "";
    return String(value).trim();
};

const isValidObjectId = (id?: string | null) => {
    return Boolean(id && mongoose.Types.ObjectId.isValid(id));
};

const toObjectId = (id?: string | null) => {
    if (!isValidObjectId(id)) return null;
    return new mongoose.Types.ObjectId(id as string);
};

const getIdText = (value: any) => value?.toString?.() || toText(value);

const addDemand = (map: Map<string, number>, productId: string, quantity: number) => {
    const normalizedQuantity = normalizeQuantity(quantity);
    if (!productId || normalizedQuantity <= 0) return;
    map.set(productId, normalizeQuantity((map.get(productId) || 0) + normalizedQuantity));
};

const getSalesOrderId = (salesOrder: any) =>
    getIdText(salesOrder?._id || salesOrder?.id || salesOrder?.salesOrderId);

const buildInitialDemandMap = (salesOrder: any) => {
    const demandMap = new Map<string, number>();
    const products = Array.isArray(salesOrder?.products) ? salesOrder.products : [];

    products.forEach((product: any) => {
        const productId = getIdText(product?.productId || product?._id || product?.id);
        addDemand(demandMap, productId, Number(product?.quantity || 0));
    });

    return demandMap;
};

export const buildPurchaseRequirementDraftsForSalesOrder = async (
    salesOrder: any,
    deps: PurchaseRequirementAnalysisDeps,
): Promise<PurchaseRequirementDraft[]> => {
    const salesOrderId = getSalesOrderId(salesOrder);
    const salesOrderNo = toText(salesOrder?.orderNo || salesOrder?.salesOrderNo);
    const demandMap = buildInitialDemandMap(salesOrder);
    const rootProductIds = new Set(
        (Array.isArray(salesOrder?.products) ? salesOrder.products : [])
            .map((product: any) => getIdText(product?.productId || product?._id || product?.id))
            .filter((id: string) => isValidObjectId(id)),
    );
    const expandedShortageMap = new Map<string, number>();
    const availableQuantityMap = new Map<string, number>();
    const bomItemsMap = new Map<string, Array<{
        productId?: string | { toString?: () => string } | null;
        quantity?: number | string;
    }>>();

    const getAvailableQuantity = async (productId: string) => {
        if (!availableQuantityMap.has(productId)) {
            availableQuantityMap.set(
                productId,
                normalizeQuantity(await deps.getAvailableQuantity(productId)),
            );
        }
        return availableQuantityMap.get(productId) || 0;
    };

    const getBomItems = async (productId: string) => {
        if (!bomItemsMap.has(productId)) {
            bomItemsMap.set(productId, await deps.getBomItems(productId));
        }
        return bomItemsMap.get(productId) || [];
    };

    let depth = 0;
    let hasExpansion = true;

    while (hasExpansion && depth < 20) {
        hasExpansion = false;

        for (const [productId, requiredQuantity] of Array.from(demandMap.entries())) {
            const bomItems = await getBomItems(productId);
            if (!bomItems.length) {
                continue;
            }

            const availableQuantity = await getAvailableQuantity(productId);
            const shortageQuantity = normalizeQuantity(requiredQuantity - availableQuantity);
            const expandedShortage = expandedShortageMap.get(productId) || 0;
            const nextExpansionQuantity = normalizeQuantity(shortageQuantity - expandedShortage);
            if (nextExpansionQuantity <= 0) continue;

            bomItems.forEach((item) => {
                const childProductId = getIdText(item.productId);
                const childQuantity = normalizeQuantity(item.quantity);
                addDemand(demandMap, childProductId, nextExpansionQuantity * childQuantity);
            });
            expandedShortageMap.set(productId, shortageQuantity);
            hasExpansion = true;
        }

        depth += 1;
    }

    const drafts: PurchaseRequirementDraft[] = [];
    for (const [productId, requiredQuantity] of demandMap.entries()) {
        const bomItems = await getBomItems(productId);
        if (bomItems.length) continue;

        const availableQuantity = await getAvailableQuantity(productId);
        const shortageQuantity = normalizeQuantity(requiredQuantity - availableQuantity);
        if (shortageQuantity <= 0) continue;

        drafts.push({
            salesOrderId,
            salesOrderNo,
            salesOrderStatusSnapshot: toText(salesOrder?.status),
            salesperson: toText(salesOrder?.salespersonName || salesOrder?.creator),
            orderType: toText(salesOrder?.orderType),
            dispatchDate: salesOrder?.orderDate || null,
            durationText: toText(salesOrder?.durationText),
            productId,
            demandProductId: rootProductIds.has(productId) ? productId : "",
            requiredQuantity,
            availableQuantityAtAnalysis: availableQuantity,
            shortageQuantity,
            demandType: "purchase",
            suggestion: "需要采购",
        });
    }

    return drafts;
};

const getMongoBomItems = async (
    productId: string,
    session?: mongoose.ClientSession,
) => {
    if (!isValidObjectId(productId)) return [];

    const { InventoryBom } = await import("../models/inventoryBom.model");
    const query = InventoryBom
        .findOne({
            productId: toObjectId(productId),
            isEnabled: true,
            _isDeleted: { $ne: true },
        })
        .select("items")
        .lean();
    if (session) query.session(session);
    const bom = await query as any;

    return Array.isArray(bom?.items) ? bom.items : [];
};

const getMongoAvailableQuantity = async (
    productId: string,
    session?: mongoose.ClientSession,
) => {
    if (!isValidObjectId(productId)) return 0;

    const { InventoryStock } = await import("../models/inventoryStock.model");
    const { InventoryWarehouse } = await import("../models/inventoryBase.model");
    const stockQuery = InventoryStock
        .find({
            productId: toObjectId(productId),
            _isDeleted: { $ne: true },
        })
        .select("warehouseId quantity lockedQuantity")
        .lean();
    if (session) stockQuery.session(session);
    const stockRows = await stockQuery as any[];
    const warehouseIds = [
        ...new Set(stockRows.map((row) => getIdText(row.warehouseId)).filter(isValidObjectId)),
    ];
    const warehouseQuery = warehouseIds.length
        ? InventoryWarehouse
            .find({ _id: { $in: warehouseIds.map((id) => toObjectId(id)) }, _isDeleted: { $ne: true } })
            .select("_id includeInAvailable")
            .lean()
        : null;
    if (session && warehouseQuery) warehouseQuery.session(session);
    const warehouses = warehouseQuery
        ? await warehouseQuery as any[]
        : [];
    const warehouseAvailability = new Map(
        warehouses.map((warehouse) => [
            getIdText(warehouse._id),
            warehouse.includeInAvailable !== false,
        ]),
    );

    return normalizeQuantity(
        stockRows.reduce((sum, row) => {
            const warehouseId = getIdText(row.warehouseId);
            const includeInAvailable = warehouseId
                ? warehouseAvailability.get(warehouseId) !== false
                : true;
            if (!includeInAvailable) return sum;

            const quantity = normalizeQuantity(row.quantity);
            const lockedQuantity = normalizeQuantity(row.lockedQuantity);
            return sum + Math.max(quantity - lockedQuantity, 0);
        }, 0),
    );
};

export const buildPurchaseRequirementDraftsFromMongoSalesOrder = async (
    salesOrder: any,
    session?: mongoose.ClientSession,
) =>
    buildPurchaseRequirementDraftsForSalesOrder(salesOrder, {
        getAvailableQuantity: (productId) =>
            getMongoAvailableQuantity(productId, session),
        getBomItems: (productId) => getMongoBomItems(productId, session),
    });
