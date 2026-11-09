import type {
    InventoryApiResponse,
} from "~/composables/api/useInventoryApi";
import type { InventoryListResponse } from "~~/shared/types/inventory";
import type {
    PurchaseMaterialPoolItem,
    PurchaseMaterialPoolRetrieveParams,
} from "~~/shared/types/purchase";

const purchaseHeaders = () => ({
    Token: getToken() || "",
});

export const retrievePurchaseMaterialPool = (params: PurchaseMaterialPoolRetrieveParams = {}) =>
    $fetch<InventoryApiResponse<InventoryListResponse<PurchaseMaterialPoolItem>>>(
        "/purchase/material-pool/retrieve",
        {
            method: "GET",
            headers: purchaseHeaders(),
            query: params,
        },
    );

export const getPurchaseMaterialPoolDetail = (productId: string) =>
    $fetch<InventoryApiResponse<PurchaseMaterialPoolItem>>(
        "/purchase/material-pool/detail",
        {
            method: "GET",
            headers: purchaseHeaders(),
            query: { productId },
        },
    );
