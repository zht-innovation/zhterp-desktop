import type { INVENTORY_PRODUCT_SOURCE } from "../enums";

// 成本树节点（递归结构）
export interface FinanceCostTreeNode {
    level: number;
    productId: string;
    productCode: string;
    productName: string;
    model?: string;
    bomId?: string;
    bomCode?: string;
    bomName?: string;
    quantity: number;
    unitName?: string;
    lossRate?: number;
    unitPrice: number;
    cost: number;
    children: FinanceCostTreeNode[];
    circular?: boolean;
}

// 原料资产列表项
export interface FinanceAccessoryCostItem {
    _id: string;
    code: string;
    name: string;
    model?: string;
    image?: string;
    unitCode?: string;
    unitName?: string;
    standardPrice?: number;
    averagePrice?: number;
    availableQuantity?: number;
    lockedQuantity?: number;
    categoryId?: string | null;
    categoryName?: string;
}

// 整机/组装件标准成本列表项
export interface FinanceMachineCostItem {
    _id: string;
    code: string;
    name: string;
    model?: string;
    image?: string;
    source?: INVENTORY_PRODUCT_SOURCE | string;
    standardPrice?: number;
    bomCost?: number;
    availableQuantity?: number;
    lockedQuantity?: number;
    unitName?: string;
    categoryId?: string | null;
    categoryName?: string;
}

// 查询参数
export interface FinanceCostRetrieveParams {
    keyword?: string;
    category?: string;
    source?: string;
    page?: number;
    limit?: number;
}

// 分页信息
export interface FinancePagination {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
}

// 列表响应
export interface FinanceListResponse<T> {
    list: T[];
    pagination: FinancePagination;
}

export type FinanceStandardPriceSyncFrequency = "daily" | "weekly" | "monthly";

export interface FinanceStandardPriceSyncSettings {
    enabled: boolean;
    frequency: FinanceStandardPriceSyncFrequency;
    time: string;
    weekDay: number;
    monthDay: number;
    timeZone: "Asia/Shanghai";
    version: number;
    nextRunAt: string | null;
    lastRun: {
        scheduledAt: string;
        completedAt: string;
        updatedCount: number;
        skippedCount: number;
    } | null;
    lastError: string;
}

export type FinanceStandardPriceSyncSettingsPayload = Pick<
    FinanceStandardPriceSyncSettings,
    "enabled" | "frequency" | "time" | "weekDay" | "monthDay" | "version"
>;
