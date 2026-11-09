import { formatLocalDate } from "~/utils/time";

export type RealtimeInventoryStatus = "正常" | "过低" | "过高";

export interface RealtimeInventoryRecord {
    id: string;
    productId: string;
    productCode: string;
    model: string;
    material: string;
    category: string;
    categoryId: string;
    parentCategoryId: string;
    image: string;
    status: RealtimeInventoryStatus;
    totalQuantity: number | null;
    availableQuantity: number | null;
    unavailableQuantity: number | null;
    inTransitQuantity: number | null;
    allocatedInTransitQuantity: number | null;
    unit: string;
    warehouse: string;
    finishedCount: number | null;
    stockUpper: number | null;
    stockLower: number | null;
    bom: string;
    description: string;
    details?: RealtimeInventoryRecord[];
}

export interface RealtimeInventoryLedgerRecord {
    id: string;
    changedAt: string;
    relatedOrderNo: string;
    businessType: string;
    quantity: string;
    unit: string;
    outboundWarehouse: string;
    inboundWarehouse: string;
    remark: string;
}

const toEntityId = (value: unknown) => {
    if (!value) {
        return "";
    }

    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "object" && value !== null && "toString" in value) {
        return String(value);
    }

    return "";
};

const toNullableNumber = (value: unknown) => {
    const num = Number(value);

    return Number.isFinite(num) ? num : null;
};

const formatOneDecimalText = (value: unknown) => {
    const num = Number(value);

    return Number.isFinite(num) ? num.toFixed(1) : "0.0";
};

const normalizeStatus = (status: unknown): RealtimeInventoryStatus => {
    if (status === "过低" || status === "过高" || status === "正常") {
        return status;
    }

    return "正常";
};

const getWarehouseDisplayName = (detail: Record<string, any>) => {
    if (detail.warehouseDisplayName) {
        return detail.warehouseDisplayName;
    }

    const parts = [detail.warehouseName, detail.locationName].filter(Boolean);

    return parts.length ? parts.join(" / ") : "--";
};

export const normalizeRealtimeInventoryStock = (
    stock: Record<string, any>,
): RealtimeInventoryRecord => {
    const productId = toEntityId(stock.productId || stock._id);
    const category = stock.categoryPath || stock.categoryName || "--";
    const status = normalizeStatus(stock.stockStatus);
    const unit = stock.unitName || "--";

    return {
        id: productId,
        productId,
        productCode: stock.productCode || "",
        model: stock.model || "",
        material: stock.material || "",
        category,
        categoryId: toEntityId(stock.categoryId),
        parentCategoryId: "",
        image: stock.image || "",
        status,
        totalQuantity: toNullableNumber(stock.totalQuantity),
        availableQuantity: toNullableNumber(stock.availableQuantity),
        unavailableQuantity: toNullableNumber(stock.unavailableQuantity),
        inTransitQuantity: toNullableNumber(stock.inTransitQuantity),
        allocatedInTransitQuantity: toNullableNumber(stock.allocatedInTransitQuantity),
        unit,
        warehouse: "",
        finishedCount: toNullableNumber(stock.kitQuantity),
        stockUpper: toNullableNumber(stock.stockUpperLimit),
        stockLower: toNullableNumber(stock.stockLowerLimit),
        bom: "查看bom结构",
        description: stock.introduction || "",
        details: Array.isArray(stock.details)
            ? stock.details.map((detail: Record<string, any>) => ({
                id: toEntityId(detail._id),
                productId,
                productCode: "",
                model: "细分明细",
                material: "",
                category,
                categoryId: toEntityId(stock.categoryId),
                parentCategoryId: "",
                image: "",
                status,
                totalQuantity: toNullableNumber(detail.totalQuantity),
                availableQuantity: toNullableNumber(detail.availableQuantity),
                unavailableQuantity: toNullableNumber(detail.unavailableQuantity),
                inTransitQuantity: null,
                allocatedInTransitQuantity: null,
                unit,
                warehouse: getWarehouseDisplayName(detail),
                finishedCount: null,
                stockUpper: null,
                stockLower: null,
                bom: "",
                description: "",
            }))
            : [],
    };
};

export const normalizeRealtimeInventoryLedger = (
    record: Record<string, any>,
): RealtimeInventoryLedgerRecord => ({
    id: toEntityId(record._id),
    changedAt: formatLocalDate(record.changedAt),
    relatedOrderNo: record.relatedOrderNo || record.sourceNo || "",
    businessType: record.businessType || "",
    quantity: formatOneDecimalText(record.quantity),
    unit: record.unitName || "--",
    outboundWarehouse: record.outboundWarehouseName || "--",
    inboundWarehouse: record.inboundWarehouseName || "--",
    remark: record.remark || "",
});
