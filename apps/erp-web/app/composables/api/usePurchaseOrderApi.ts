import type {
    InventoryApiResponse,
    InventoryBaseDetailResponse,
} from "~/composables/api/useInventoryApi";
import type {
    PurchaseOrder,
    PurchaseOrderInboundCandidate,
    PurchaseOrderInboundCandidateRetrieveParams,
    PurchaseOrderInboundDetail,
    PurchaseOrderMutationPayload,
    PurchaseOrderRetrieveParams,
    PurchaseOrderSalesCandidate,
    PurchaseOrderSalesCandidateParams,
    PurchaseRequestOrderCandidate,
    PurchaseRequestOrderCandidateParams,
    PurchaseMaterialRequirementRefreshPayload,
    QuickInboundCandidatesResponse,
} from "~~/shared/types/purchase";
import type { InventoryListResponse } from "~~/shared/types/inventory";
import type { TaobaoMatchResult } from "~~/shared/types/logistics";

const purchaseHeaders = () => ({
    Token: getToken() || "",
});

export const resolveTaobaoWaybills = (platformOrderNos: string[]) =>
    $fetch<InventoryApiResponse<TaobaoMatchResult>>("/purchase/order/detail", {
        method: "POST",
        headers: purchaseHeaders(),
        body: { action: "resolve-taobao", platformOrderNos },
    });

export const syncTaobaoPurchaseWaybills = (id: string) =>
    $fetch<InventoryBaseDetailResponse<PurchaseOrder>>("/purchase/order/update", {
        method: "PUT",
        headers: purchaseHeaders(),
        body: { id, action: "sync-taobao-waybills" },
    });

export const retrievePurchaseOrders = (
    params: PurchaseOrderRetrieveParams = {},
    options: { skipLoading?: boolean } = {},
) =>
    $fetch<InventoryApiResponse<InventoryListResponse<PurchaseOrder>>>(
        "/purchase/order/retrieve",
        {
            method: "GET",
            headers: {
                ...purchaseHeaders(),
                ...(options.skipLoading ? { "x-skip-loading": "1" } : {}),
            },
            query: params,
        },
    );

export const retrievePurchaseOrderInboundCandidates = (
    params: PurchaseOrderInboundCandidateRetrieveParams = {},
    options: { skipLoading?: boolean } = {},
) =>
    $fetch<InventoryApiResponse<InventoryListResponse<PurchaseOrderInboundCandidate>>>(
        "/purchase/order/inbound-candidates",
        {
            method: "GET",
            headers: {
                ...purchaseHeaders(),
                ...(options.skipLoading ? { "x-skip-loading": "1" } : {}),
            },
            query: params,
        },
    );

export const addPurchaseOrder = (payload: PurchaseOrderMutationPayload) =>
    $fetch<InventoryBaseDetailResponse<PurchaseOrder>>(
        "/purchase/order/add",
        {
            method: "POST",
            headers: purchaseHeaders(),
            body: payload,
        },
    );

export const getPurchaseOrderDetail = (params: { id?: string; orderNo?: string }) =>
    $fetch<InventoryApiResponse<PurchaseOrder>>(
        "/purchase/order/detail",
        {
            method: "GET",
            headers: purchaseHeaders(),
            query: params,
        },
    );

export const getPurchaseOrderInboundDetail = (params: { id?: string; orderNo?: string }) =>
    $fetch<InventoryApiResponse<PurchaseOrderInboundDetail>>(
        "/purchase/order/inbound-detail",
        {
            method: "GET",
            headers: purchaseHeaders(),
            query: params,
        },
    );

export const updatePurchaseOrder = (payload: Partial<PurchaseOrderMutationPayload> & { id: string }) =>
    $fetch<InventoryBaseDetailResponse<PurchaseOrder>>(
        "/purchase/order/update",
        {
            method: "PUT",
            headers: purchaseHeaders(),
            body: payload,
        },
    );

export const deletePurchaseOrder = (payload: { id?: string; ids?: string[] }) =>
    $fetch<InventoryApiResponse>(
        "/purchase/order/delete",
        {
            method: "DELETE",
            headers: purchaseHeaders(),
            body: payload,
        },
    );

export const getPurchaseOrderByTracking = (params: { trackingNo: string }) =>
    $fetch<InventoryApiResponse<PurchaseOrderInboundDetail>>(
        "/purchase/order/lookup-by-tracking",
        {
            method: "GET",
            headers: purchaseHeaders(),
            query: params,
        },
    );

export const retrievePurchaseOrderSalesCandidates = (
    params: PurchaseOrderSalesCandidateParams,
) =>
    $fetch<InventoryApiResponse<InventoryListResponse<PurchaseOrderSalesCandidate>>>(
        "/purchase/order/sales-candidates",
        {
            method: "GET",
            headers: purchaseHeaders(),
            query: params,
        },
    );

export const retrievePurchaseRequestOrderCandidates = (
    params: PurchaseRequestOrderCandidateParams,
) =>
    $fetch<InventoryApiResponse<InventoryListResponse<PurchaseRequestOrderCandidate>>>(
        "/purchase/order/sales-candidates",
        {
            method: "GET",
            headers: purchaseHeaders(),
            query: params,
        },
    );

export const refreshPurchaseMaterialRequirementsForSalesOrder = (
    payload: PurchaseMaterialRequirementRefreshPayload,
) =>
    $fetch<InventoryApiResponse<{ analysisVersion: string; count: number; list: unknown[] }>>(
        "/purchase/material-requirement/refresh-sales-order",
        {
            method: "POST",
            headers: purchaseHeaders(),
            body: payload,
        },
    );

export const getQuickInboundCandidates = (params: { orderNo: string }) =>
    $fetch<InventoryApiResponse<QuickInboundCandidatesResponse>>(
        "/purchase/order/quick-inbound-candidates",
        {
            method: "GET",
            headers: purchaseHeaders(),
            query: params,
        },
    );

export const quickInboundAllocate = (payload: { orderNo: string; items: Array<{ productId: string; quantity: number }> }) =>
    $fetch<InventoryApiResponse<{ count: number }>>(
        "/purchase/order/quick-inbound-allocate",
        {
            method: "POST",
            headers: purchaseHeaders(),
            body: payload,
        },
    );
