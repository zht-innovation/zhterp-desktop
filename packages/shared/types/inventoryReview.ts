import type { InventoryStockRestriction } from "./inventory";

export type InventoryReviewStatus = "pending" | "reviewing" | "reviewed";

export interface InventoryReviewLockDetails {
    productId: string;
    productCode: string;
    model: string;
    unitName: string;
    lockedQuantity: number;
    capturedAt?: string;
    snapshotAvailable: boolean;
    list: InventoryStockRestriction[];
}

export interface InventoryReviewStockPosition {
    id: string;
    warehouseId: string;
    warehouseName: string;
    locationId: string;
    locationName: string;
    quantity: number;
    lockedQuantity: number;
    checkedQuantity: number | null;
    includeInAvailable: boolean;
}

export interface InventoryReviewDemandLine {
    productId: string;
    productCode: string;
    model: string;
    unit: string;
    requiredQuantity: number;
    actualQuantity: number;
    availableQuantity: number;
    lockedQuantity: number;
    reservedQuantity: number;
    shortageQuantity: number;
    differenceReason: string;
    remark?: string;
    demandType?: "finished-product" | "production-material";
}

export interface InventoryReviewResult {
    route: "production" | "purchase";
    lines: InventoryReviewDemandLine[];
    purchaseRequestId?: string;
    purchaseRequestNo?: string;
    approvalId?: string;
}

export interface InventoryReviewMaterial {
    id: string;
    productId?: string;
    productCode: string;
    model: string;
    source: string;
    unit: string;
    quantityPerSet: number;
    // 公共可用库存，不包含本订单已预占的数量。
    stockQuantity: number;
    ownReservedQuantity?: number;
    totalQuantity?: number;
    positions?: InventoryReviewStockPosition[];
    checkedQuantity: number | null;
    differenceReason: string;
    remark?: string;
    image?: string;
    issue?: string;
    children?: InventoryReviewMaterial[];
}

export interface InventoryReviewBom {
    id: string;
    name: string;
    enabled: boolean;
    materials: InventoryReviewMaterial[];
}

export interface InventoryReviewProduct {
    id: string;
    productId?: string;
    productCode: string;
    model: string;
    unit: string;
    salesQuantity: number;
    // 公共可用库存；旧快照未拆分时通过 ownReservedQuantity 缺省识别。
    stockQuantity: number;
    ownReservedQuantity?: number;
    // 旧复核快照没有记录总量，保留缺省值以区别于实际零库存。
    totalQuantity?: number;
    positions?: InventoryReviewStockPosition[];
    checkedQuantity: number | null;
    differenceReason: string;
    remark?: string;
    image?: string;
    issue?: string;
    activeBomId: string;
    boms: InventoryReviewBom[];
}

export interface InventoryReviewOrder {
    id: string;
    code: string;
    salesperson: string;
    deliveryDate: string;
    status: InventoryReviewStatus;
    approved: boolean;
    approvalKey: string;
    snapshotKey: string;
    revision: number;
    products: InventoryReviewProduct[];
    remark: string;
    reviewedAt?: string;
    reviewedBy?: string;
    updatedAt?: string;
    result?: InventoryReviewResult;
}

export interface InventoryReviewListParams {
    keyword?: string;
    status?: InventoryReviewStatus | "";
    page?: number;
    limit?: number;
}

export interface InventoryReviewListResult {
    list: InventoryReviewOrder[];
    counts: Record<InventoryReviewStatus, number>;
    pagination: {
        page: number;
        limit: number;
        total: number;
        hasMore: boolean;
    };
}
