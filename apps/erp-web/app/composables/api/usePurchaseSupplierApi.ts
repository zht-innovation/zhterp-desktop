import type {
    InventoryApiResponse,
    InventoryBaseDetailResponse,
} from "~/composables/api/useInventoryApi";
import type {
    PurchaseSupplier,
    PurchaseSupplierProductListResponse,
    PurchaseSupplierProductRetrieveParams,
    PurchaseSupplierListResponse,
    PurchaseSupplierMutationPayload,
    PurchaseSupplierRetrieveParams,
} from "~~/shared/types/purchase";

const purchaseHeaders = () => ({
    Token: getToken() || "",
});

export const retrievePurchaseSuppliers = (
    params: PurchaseSupplierRetrieveParams = {},
    options: { skipLoading?: boolean } = {},
) =>
    $fetch<InventoryApiResponse<PurchaseSupplierListResponse>>(
        "/purchase/supplier/retrieve",
        {
            method: "GET",
            headers: {
                ...purchaseHeaders(),
                ...(options.skipLoading ? { "x-skip-loading": "1" } : {}),
            },
            query: params,
        },
    );

export const addPurchaseSupplier = (payload: PurchaseSupplierMutationPayload) =>
    $fetch<InventoryBaseDetailResponse<PurchaseSupplier>>(
        "/purchase/supplier/add",
        {
            method: "POST",
            headers: purchaseHeaders(),
            body: payload,
        },
    );

export const updatePurchaseSupplier = (
    payload: Partial<PurchaseSupplierMutationPayload> & { id: string },
) =>
    $fetch<InventoryBaseDetailResponse<PurchaseSupplier>>(
        "/purchase/supplier/update",
        {
            method: "PUT",
            headers: purchaseHeaders(),
            body: payload,
        },
    );

export const deletePurchaseSupplier = (payload: { id?: string; ids?: string[] }) =>
    $fetch<InventoryApiResponse>(
        "/purchase/supplier/delete",
        {
            method: "DELETE",
            headers: purchaseHeaders(),
            body: payload,
        },
    );

export const updatePurchaseSupplierStatus = (payload: { id: string; isEnabled: boolean }) =>
    $fetch<InventoryBaseDetailResponse<PurchaseSupplier>>(
        "/purchase/supplier/status",
        {
            method: "PUT",
            headers: purchaseHeaders(),
            body: payload,
        },
    );

export const retrievePurchaseSupplierProducts = (
    supplierId: string,
    params: Omit<Partial<PurchaseSupplierProductRetrieveParams>, "supplierId"> = {},
) =>
    $fetch<InventoryApiResponse<PurchaseSupplierProductListResponse>>(
        "/purchase/supplier/products",
        {
            method: "GET",
            headers: purchaseHeaders(),
            query: { supplierId, ...params },
        },
    );

export const savePurchaseSupplierProducts = (
    payload: { supplierId: string; productIds: string[]; mode?: "append" },
) =>
    $fetch<InventoryApiResponse<{ count: number }>>(
        "/purchase/supplier/products",
        {
            method: "PUT",
            headers: purchaseHeaders(),
            body: payload,
        },
    );
