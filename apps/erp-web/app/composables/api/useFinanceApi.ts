import { getToken } from "~/utils/auth";
import type {
    FinanceAccessoryCostItem,
    FinanceCostRetrieveParams,
    FinanceCostTreeNode,
    FinanceListResponse,
    FinanceMachineCostItem,
    FinanceStandardPriceSyncSettings,
    FinanceStandardPriceSyncSettingsPayload,
} from "~~/shared/types/finance";

export type FinanceApiResponse<T = undefined> = {
    code: number;
    msg: string;
    data?: T;
};

const financeHeaders = () => ({
    Token: getToken() || "",
});

// 查询原料资产列表
export const retrieveAccessoryCost = (params: FinanceCostRetrieveParams = {}) =>
    $fetch<FinanceApiResponse<FinanceListResponse<FinanceAccessoryCostItem>>>(
        "/finance/cost/accessory-retrieve",
        {
            method: "GET",
            headers: financeHeaders(),
            query: params,
        },
    );

// 查询整机/组装件标准成本列表
export const retrieveMachineCost = (params: FinanceCostRetrieveParams = {}) =>
    $fetch<FinanceApiResponse<FinanceListResponse<FinanceMachineCostItem>>>(
        "/finance/cost/machine-retrieve",
        {
            method: "GET",
            headers: financeHeaders(),
            query: params,
        },
    );

// 获取产品成本明细（BOM 树形结构）
export const getCostDetail = (productId: string) =>
    $fetch<FinanceApiResponse<{ tree: FinanceCostTreeNode }>>(
        "/finance/cost/detail",
        {
            method: "GET",
            headers: financeHeaders(),
            query: { productId },
        },
    );

// 更新产品标准价
export const updateStandardPrice = (productId: string, standardPrice: number) =>
    $fetch<FinanceApiResponse<{ standardPrice: number }>>(
        "/finance/cost/update-price",
        {
            method: "PUT",
            headers: financeHeaders(),
            body: { productId, standardPrice },
        },
    );

export const getStandardPriceSyncSettings = () =>
    $fetch<FinanceApiResponse<FinanceStandardPriceSyncSettings>>(
        "/finance/cost/detail",
        {
            method: "GET",
            headers: financeHeaders(),
            query: { action: "standard-price-sync-settings" },
        },
    );

export const saveStandardPriceSyncSettings = (payload: FinanceStandardPriceSyncSettingsPayload) =>
    $fetch<FinanceApiResponse<FinanceStandardPriceSyncSettings>>(
        "/finance/cost/update-price",
        {
            method: "PUT",
            headers: financeHeaders(),
            body: { action: "standard-price-sync-settings", ...payload },
        },
    );
