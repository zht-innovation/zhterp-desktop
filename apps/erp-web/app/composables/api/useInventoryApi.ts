import { getToken } from "~/utils/auth";
import type {
    InventoryReviewListParams,
    InventoryReviewListResult,
    InventoryReviewOrder,
} from "~~/shared/types/inventoryReview";
import type {
    InventoryBaseEntity,
    InventoryBom,
    InventoryBomCategory,
    InventoryCategory,
    InventoryCurrency,
    InventoryInboundOrder,
    InventoryListResponse,
    InventoryLocation,
    InventoryOutboundOrder,
    InventoryProduct,
    InventoryStock,
    InventoryStockLedger,
    InventoryStockRestrictionDetails,
    InventoryStockRestrictionRetrieveParams,
    SalesOrderStockReservation,
    InventoryTransferOrder,
    InventoryUnit,
    InventoryWarehouse,
    InventoryWaybillAttachment,
    InventoryWaybill,
} from "~~/shared/types/inventory";
import type {
    PurchaseLogisticsAcceptancePayload,
    PurchaseLogisticsRecord,
} from "~~/shared/types/purchase";
import { INVENTORY_IMPORT_REQUEST_TIMEOUT_MS } from "~~/shared/utils/inventoryImport";
import type { InventoryBomHistoryResponse } from "~~/shared/types/inventoryBomHistory";

export type InventoryBaseResource =
    | "unit"
    | "category"
    | "warehouse"
    | "location"
    | "currency"
    | "bom-category"
    | "material";

export type InventoryApiResponse<T = undefined> = {
    code: number;
    msg: string;
    data?: T;
};

export type InventoryBaseRetrieveParams = {
    keyword?: string;
    warehouseId?: string;
    includeDeleted?: boolean;
};

export type InventoryBaseRetrieveResponse<T extends InventoryBaseEntity = InventoryBaseEntity> =
    InventoryApiResponse<{
        list: T[];
        actor: string;
    }>;

export type InventoryBaseTreeResponse<T extends InventoryBaseEntity = InventoryBaseEntity> =
    InventoryApiResponse<{
        tree: T[];
    }>;

export type InventoryBaseDetailResponse<T = InventoryBaseEntity> =
    InventoryApiResponse<{
        id: string;
        detail: Partial<T>;
    }>;

export type InventoryBaseMutationPayload = {
    id?: string;
    code?: string;
    name?: string;
    remark?: string;
    sort?: number;
    isEnabled?: boolean;
    currencyCode?: string;
    parentId?: string | null;
    warehouseId?: string;
    manager?: string;
    managerId?: string;
    includeInAvailable?: boolean;
    enableLocation?: boolean;
};

export type InventoryProductRetrieveParams = {
    ids?: string[] | string;
    keyword?: string;
    categoryId?: string;
    source?: string;
    unitId?: string;
    warehouseId?: string;
    locationId?: string;
    isSaleable?: boolean | string;
    stockWarning?: string;
    includeDeleted?: boolean;
    includeStock?: boolean;
    page?: number;
    limit?: number;
};

export type InventoryProductMutationPayload = {
    id?: string;
    code?: string;
    name?: string;
    categoryId?: string | null;
    image?: string;
    unitId?: string | null;
    material?: string;
    source?: string;
    standardPrice?: number;
    averagePrice?: number;
    model?: string;
    modelCode?: string;
    kitQuantity?: number;
    stockUpperLimit?: number;
    stockLowerLimit?: number;
    warehouseId?: string | null;
    locationId?: string | null;
    introduction?: string;
    barcode?: string;
    snPrefixes?: string[];
    isSaleable?: boolean;
    operator?: string;
    remark?: string;
};

export type InventoryProductImportResponse = {
    totalCount: number;
    successCount: number;
    failCount: number;
    errors: Array<{
        row: number;
        message: string;
    }>;
};

export type InventoryBomRetrieveParams = {
    keyword?: string;
    productId?: string;
    isEnabled?: boolean | string;
    includeDeleted?: boolean;
    page?: number;
    limit?: number;
};

export type InventoryBomExportParams = InventoryBomRetrieveParams & {
    codes?: string | string[];
};

export type InventoryBomMutationPayload = {
    id?: string;
    expectedRevision?: number;
    code?: string;
    name: string;
    productId: string;
    isEnabled?: boolean;
    remark?: string;
    operator?: string;
    items: Array<{
        lineId?: string;
        productId: string;
        quantity: number;
        unitId?: string | null;
        lossRate?: number;
        remark?: string;
        sort?: number;
    }>;
};

export type InventoryBomStructureNode = {
    productId?: string;
    productCode?: string;
    productName?: string;
    model?: string;
    material?: string;
    image?: string;
    bomId?: string | null;
    bomCode?: string;
    bomName?: string;
    quantity?: number;
    unitId?: string | null;
    unitCode?: string;
    unitName?: string;
    level?: number;
    circular?: boolean;
    children?: InventoryBomStructureNode[];
};

export type InventoryWaybillRetrieveParams = {
    direction?: "send" | "receive";//收件|寄件
    relatedOrderNo?: string;
    trackingNo?: string;
    salesperson?: string;
    sortOrder?: "asc" | "desc";
    keyword?: string;
    company?: string;
    businessType?: string;
    startDate?: string;
    endDate?: string;
    includeDeleted?: boolean;
    ids?: string[] | string;
    page?: number;
    limit?: number;
};

export type InventoryInboundRetrieveParams = {
    keyword?: string;
    type?: string;
    inboundDate?: string;
    startDate?: string;
    endDate?: string;
    includeDeleted?: boolean;
    ids?: string[] | string;
    page?: number;
    limit?: number;
};

export type InventoryInboundMutationPayload = {
    id?: string;
    inboundNo?: string;
    type: string;
    inboundDate: string;
    handler?: string;
    status?: string;
    remark?: string;
    courierCompany?: string;
    trackingNo?: string;
    purchaseOrderNo?: string;
    processingOrderNo?: string;
    productionOwner?: string;
    salesOrderId?: string;
    orderNo?: string;
    returnReason?: string;
    items: Array<{
        productId: string;
        quantity: number;
        unitId?: string | null;
        warehouseId?: string | null;
        locationId?: string | null;
    }>;
};

export type ProductionInboundSalesOrderCandidate = {
    id: string;
    orderNo: string;
    customerName: string;
    salespersonName: string;
    status: "待生产" | "生产中";
};

export type InventoryTransferRetrieveParams = {
    keyword?: string;
    transferDate?: string;
    startDate?: string;
    endDate?: string;
    includeDeleted?: boolean;
    ids?: string[] | string;
    page?: number;
    limit?: number;
};

export type InventoryTransferMutationPayload = {
    id?: string;
    transferNo?: string;
    transferDate: string;
    borrower: string;
    expectedReturnDate?: string;
    actualReturnTime?: string;
    handler?: string;
    status?: string;
    courierCompany?: string;
    trackingNo?: string;
    remark?: string;
    items: Array<{
        productId: string;
        quantity: number;
        unitId?: string | null;
        warehouseId?: string | null;
        locationId?: string | null;
    }>;
};

export type InventoryOutboundRetrieveParams = {
    keyword?: string;
    type?: string;
    outboundDate?: string;
    startDate?: string;
    endDate?: string;
    includeDeleted?: boolean;
    ids?: string[] | string;
    page?: number;
    limit?: number;
};

export type InventoryOutboundMutationPayload = {
    id?: string;
    outboundNo?: string;
    type: string;
    outboundDate: string;
    handler?: string;
    status?: string;
    remark?: string;
    contractOrderNo?: string;
    expressCompany?: string;
    waybillNo?: string;
    borrower?: string;
    borrowingParty?: string;
    deposit?: string;
    returnDate?: string;
    project?: string;
    images?: InventoryWaybillAttachment[];
    items: Array<{
        productId: string;
        quantity: number;
        unitId?: string | null;
        warehouseId?: string | null;
        locationId?: string | null;
    }>;
};

export type InventoryStockRetrieveParams = {
    productId?: string;
    productIds?: string[];
    keyword?: string;
    categoryId?: string;
    warehouseId?: string;
    locationId?: string;
    stockStatus?: string;
    includeAssignedProducts?: boolean;
    paginateAssignedProducts?: boolean;
    includeDescendantLocations?: boolean;
    includeInTransit?: boolean;
    availableOnly?: boolean;
    includeDeleted?: boolean;
    page?: number;
    limit?: number;
};

export type InventoryStockLedgerRetrieveParams = {
    productId?: string;
    keyword?: string;
    page?: number;
    limit?: number;
};

const inventoryHeaders = () => ({
    Token: getToken() || "",
});

export function retrieveInventoryBase<T extends InventoryBaseEntity = InventoryBaseEntity>(
    resource: InventoryBaseResource,
) {
    return (params: InventoryBaseRetrieveParams = {}) =>
        $fetch<InventoryBaseRetrieveResponse<T>>(`/inventory/${resource}/retrieve`, {
            method: "GET",
            headers: inventoryHeaders(),
            query: params,
        });
}

export function retrieveInventoryBaseTree<T extends InventoryBaseEntity = InventoryBaseEntity>(
    resource: InventoryBaseResource,
) {
    return (params: Pick<InventoryBaseRetrieveParams, "keyword"> = {}) =>
        $fetch<InventoryBaseTreeResponse<T>>(`/inventory/${resource}/tree`, {
            method: "GET",
            headers: inventoryHeaders(),
            query: params,
        });
}

export function addInventoryBase<T extends InventoryBaseEntity = InventoryBaseEntity>(
    resource: InventoryBaseResource,
) {
    return (payload: InventoryBaseMutationPayload & { name: string }) =>
        $fetch<InventoryBaseDetailResponse<T>>(`/inventory/${resource}/add`, {
            method: "POST",
            headers: inventoryHeaders(),
            body: payload,
        });
}

export function updateInventoryBase<T extends InventoryBaseEntity = InventoryBaseEntity>(
    resource: InventoryBaseResource,
) {
    return (payload: InventoryBaseMutationPayload & { id: string }) =>
        $fetch<InventoryBaseDetailResponse<T>>(`/inventory/${resource}/update`, {
            method: "PUT",
            headers: inventoryHeaders(),
            body: payload,
        });
}

export function deleteInventoryBase(resource: InventoryBaseResource) {
    return (payload: { id?: string; ids?: string[] }) =>
        $fetch<InventoryApiResponse>(`/inventory/${resource}/delete`, {
            method: "DELETE",
            headers: inventoryHeaders(),
            body: payload,
        });
}

export const retrieveInventoryUnits = retrieveInventoryBase<InventoryUnit>("unit");
export const addInventoryUnit = addInventoryBase<InventoryUnit>("unit");
export const updateInventoryUnit = updateInventoryBase<InventoryUnit>("unit");
export const deleteInventoryUnit = deleteInventoryBase("unit");

export const retrieveInventoryCurrencies = retrieveInventoryBase<InventoryCurrency>("currency");
export const addInventoryCurrency = addInventoryBase<InventoryCurrency>("currency");
export const updateInventoryCurrency = updateInventoryBase<InventoryCurrency>("currency");
export const deleteInventoryCurrency = deleteInventoryBase("currency");

export const retrieveInventoryCategoryTree =
    retrieveInventoryBaseTree<InventoryCategory>("category");
export const addInventoryCategory = addInventoryBase<InventoryCategory>("category");
export const updateInventoryCategory = updateInventoryBase<InventoryCategory>("category");
export const deleteInventoryCategory = deleteInventoryBase("category");

export const retrieveInventoryBomCategoryTree =
    retrieveInventoryBaseTree<InventoryBomCategory>("bom-category");
export const addInventoryBomCategory = addInventoryBase<InventoryBomCategory>("bom-category");
export const updateInventoryBomCategory = updateInventoryBase<InventoryBomCategory>("bom-category");
export const deleteInventoryBomCategory = deleteInventoryBase("bom-category");

export const retrieveInventoryWarehouses =
    retrieveInventoryBase<InventoryWarehouse>("warehouse");
export const addInventoryWarehouse = addInventoryBase<InventoryWarehouse>("warehouse");
export const updateInventoryWarehouse = updateInventoryBase<InventoryWarehouse>("warehouse");
export const deleteInventoryWarehouse = deleteInventoryBase("warehouse");

export const retrieveInventoryLocations = retrieveInventoryBase<InventoryLocation>("location");
export const scanInventoryLocation = (params: { code: string }) =>
    $fetch<InventoryApiResponse<{ detail: InventoryLocation }>>("/inventory/location-scan", {
        method: "GET",
        headers: inventoryHeaders(),
        query: params,
    });
export const addInventoryLocation = addInventoryBase<InventoryLocation>("location");
export const updateInventoryLocation = updateInventoryBase<InventoryLocation>("location");
export const deleteInventoryLocation = deleteInventoryBase("location");

export const retrieveInventoryMaterials = retrieveInventoryBase<InventoryUnit>("material");
export const addInventoryMaterial = addInventoryBase<InventoryUnit>("material");
export const updateInventoryMaterial = updateInventoryBase<InventoryUnit>("material");
export const deleteInventoryMaterial = deleteInventoryBase("material");

export const retrieveInventoryProducts = (params: InventoryProductRetrieveParams = {}) =>
    $fetch<InventoryApiResponse<InventoryListResponse<InventoryProduct>>>(
        "/inventory/product/retrieve",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: params,
        },
    );

export const getInventoryProductDetail = (params: { id: string; includeBom?: boolean }) =>
    $fetch<InventoryApiResponse<{ detail: InventoryProduct; bomStructure?: InventoryBomStructureNode }>>(
        "/inventory/product/detail",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: params,
        },
    );

export const addInventoryProduct = (payload: FormData) =>
    $fetch<InventoryBaseDetailResponse<InventoryProduct>>("/inventory/product/add", {
        method: "POST",
        headers: inventoryHeaders(),
        body: payload,
    });

export const updateInventoryProduct = (
    payload: (InventoryProductMutationPayload & { id: string }) | FormData,
) =>
    $fetch<InventoryBaseDetailResponse<InventoryProduct>>("/inventory/product/update", {
        method: "PUT",
        headers: inventoryHeaders(),
        body: payload,
    });

export const updateInventoryProductSnPrintState = (payload: {
    id: string;
    monthKey: string;
    lastSerial: number;
}) =>
    $fetch<InventoryApiResponse<{
        snPrintState: NonNullable<InventoryProduct["snPrintState"]> | null;
    }>>("/inventory/product/sn-print-state", {
        method: "POST",
        headers: inventoryHeaders(),
        body: payload,
    });

export const deleteInventoryProduct = (payload: { id?: string; ids?: string[] }) =>
    $fetch<InventoryApiResponse>("/inventory/product/delete", {
        method: "DELETE",
        headers: inventoryHeaders(),
        body: payload,
    });

export const importInventoryProducts = (payload: FormData) =>
    $fetch<InventoryApiResponse<InventoryProductImportResponse>>("/inventory/product/import", {
        method: "POST",
        headers: inventoryHeaders(),
        body: payload,
        timeout: INVENTORY_IMPORT_REQUEST_TIMEOUT_MS,
    });

export const exportInventoryProducts = (params: InventoryProductRetrieveParams = {}) =>
    $fetch<Blob>("/inventory/product/export", {
        method: "GET",
        headers: inventoryHeaders(),
        query: params,
        responseType: "blob",
    });

export const retrieveInventoryBoms = (params: InventoryBomRetrieveParams = {}) =>
    $fetch<InventoryApiResponse<InventoryListResponse<InventoryBom>>>(
        "/inventory/bom/retrieve",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: params,
        },
    );

export const addInventoryBom = (payload: InventoryBomMutationPayload) =>
    $fetch<InventoryBaseDetailResponse<InventoryBom>>("/inventory/bom/add", {
        method: "POST",
        headers: inventoryHeaders(),
        body: payload,
    });

export const updateInventoryBom = (payload: Partial<InventoryBomMutationPayload> & { id: string }) =>
    $fetch<InventoryBaseDetailResponse<InventoryBom>>("/inventory/bom/update", {
        method: "PUT",
        headers: inventoryHeaders(),
        body: payload,
    });

export const deleteInventoryBom = (payload: { id?: string; ids?: string[] }) =>
    $fetch<InventoryApiResponse>("/inventory/bom/delete", {
        method: "DELETE",
        headers: inventoryHeaders(),
        body: payload,
    });

export type InventoryBomImportResponse = {
    successCount: number;
    errorCount: number;
    errors: { row: number; message: string }[];
};

export const importInventoryBoms = (payload: FormData) =>
    $fetch<InventoryApiResponse<InventoryBomImportResponse>>("/inventory/bom/import", {
        method: "POST",
        headers: inventoryHeaders(),
        body: payload,
        timeout: INVENTORY_IMPORT_REQUEST_TIMEOUT_MS,
    });

export const exportInventoryBoms = (params: InventoryBomExportParams = {}) =>
    $fetch<Blob>("/inventory/bom/export", {
        method: "GET",
        headers: inventoryHeaders(),
        query: params,
        responseType: "blob",
    });

export const getInventoryBomDetail = (params: {
    id: string;
    includeStructure?: boolean;
    includeHistory?: boolean;
    page?: number;
    limit?: number;
}) =>
    $fetch<InventoryApiResponse<{
        detail: InventoryBom & { structure?: InventoryBomStructureNode };
        history?: InventoryBomHistoryResponse;
    }>>(
        "/inventory/bom/detail",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: params,
        },
    );

export const getInventoryBomStructure = (productId: string) =>
    $fetch<InventoryApiResponse<{ structure: InventoryBomStructureNode }>>(
        "/inventory/bom/structure",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: { productId },
        },
    );

export const retrieveInventoryWaybills = (params: InventoryWaybillRetrieveParams = {}) =>
    $fetch<InventoryApiResponse<InventoryListResponse<InventoryWaybill>>>(
        "/inventory/waybill/retrieve",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: params,
        },
    );

export const acceptPurchaseLogistics = (payload: PurchaseLogisticsAcceptancePayload) =>
    $fetch<InventoryApiResponse<{ detail: PurchaseLogisticsRecord }>>(
        "/inventory/waybill/update",
        {
            method: "PUT",
            headers: inventoryHeaders(),
            body: payload,
        },
    );

export const getInventoryWaybillDetail = (id: string) =>
    $fetch<InventoryApiResponse<{ detail: InventoryWaybill }>>(
        "/inventory/waybill/detail",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: { id },
        },
    );

export const addInventoryWaybill = (payload: FormData) =>
    $fetch<InventoryBaseDetailResponse<InventoryWaybill>>("/inventory/waybill/add", {
        method: "POST",
        headers: inventoryHeaders(),
        body: payload,
    });

export const updateInventoryWaybill = (payload: FormData) =>
    $fetch<InventoryBaseDetailResponse<InventoryWaybill>>("/inventory/waybill/update", {
        method: "PUT",
        headers: inventoryHeaders(),
        body: payload,
    });

export const deleteInventoryWaybill = (payload: { id?: string; ids?: string[] }) =>
    $fetch<InventoryApiResponse>("/inventory/waybill/delete", {
        method: "DELETE",
        headers: inventoryHeaders(),
        body: payload,
    });

export const exportInventoryWaybills = (params: InventoryWaybillRetrieveParams = {}) =>
    $fetch<Blob>("/inventory/waybill/export", {
        method: "GET",
        headers: inventoryHeaders(),
        query: params,
        responseType: "blob",
    });

export const importInventoryWaybills = (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return $fetch<InventoryApiResponse<{
        totalCount: number;
        successCount: number;
        failCount: number;
        errors: Array<{ row: number; message: string }>;
    }>>("/inventory/waybill/import", {
        method: "POST",
        headers: inventoryHeaders(),
        body: formData,
        timeout: INVENTORY_IMPORT_REQUEST_TIMEOUT_MS,
    });
};

export const downloadInventoryWaybillAttachments = (id: string) =>
    $fetch<Blob>("/inventory/waybill/attachments", {
        method: "GET",
        headers: inventoryHeaders(),
        query: { id },
        responseType: "blob",
    });

// ========== 盘点单 API ==========

export type StocktakeStatus = "draft" | "in_progress" | "completed" | "cancelled";

export interface StocktakeItem {
    productId: string;
    productCode: string;
    productName: string;
    productModel: string;
    locationId?: string | null;
    locationCode?: string;
    locationName?: string;
    unitName: string;
    systemQuantity: number;
    actualQuantity: number | null;
    difference: number | null;
    remark: string;
}

export interface InventoryStocktake {
    _id: string;
    code: string;
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
    locationId?: string | null;
    locationCode?: string;
    locationName?: string;
    stocktakeDate: string;
    status: StocktakeStatus;
    operator: string;
    remark: string;
    items: StocktakeItem[];
    inboundOrderId?: string;
    inboundOrderCode?: string;
    outboundOrderId?: string;
    outboundOrderCode?: string;
    createdBy: string;
    updatedBy: string;
    createTime: string;
    updateTime: string;
}

export type StocktakeRetrieveParams = {
    keyword?: string;
    createDate?: string;
    warehouseId?: string;
    status?: StocktakeStatus;
    page?: number;
    limit?: number;
};

export type StocktakeMutationPayload = {
    warehouseId: string;
    locationId?: string | null;
    stocktakeDate?: string;
    remark?: string;
    items?: StocktakeItem[];
};

export const retrieveInventoryStocktakes = (params: StocktakeRetrieveParams = {}) =>
    $fetch<InventoryApiResponse<InventoryListResponse<InventoryStocktake>>>(
        "/inventory/stocktake/retrieve",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: params,
        },
    );

export const getInventoryStocktakeDetail = (id: string) =>
    $fetch<InventoryApiResponse<{ detail: InventoryStocktake }>>(
        "/inventory/stocktake/detail",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: { id },
        },
    );

export const addInventoryStocktake = (payload: StocktakeMutationPayload) =>
    $fetch<InventoryBaseDetailResponse<InventoryStocktake>>("/inventory/stocktake/add", {
        method: "POST",
        headers: inventoryHeaders(),
        body: payload,
    });

// 复用现有认证入口，以独立场景分派到订单复核服务，不能省略 scene。
export const retrieveInventoryOrderReviews = (params: InventoryReviewListParams = {}) =>
    $fetch<InventoryApiResponse<InventoryReviewListResult>>("/inventory/stocktake/retrieve", {
        method: "GET",
        headers: inventoryHeaders(),
        query: { ...params, scene: "order-review" },
    });

export const getInventoryOrderReviewDetail = (id: string) =>
    $fetch<InventoryApiResponse<{ detail: InventoryReviewOrder }>>("/inventory/stocktake/detail", {
        method: "GET",
        headers: inventoryHeaders(),
        query: { id, scene: "order-review" },
    });

export const saveInventoryOrderReview = (order: InventoryReviewOrder, complete: boolean) =>
    $fetch<InventoryApiResponse<{ detail: InventoryReviewOrder }>>(
        complete ? "/inventory/stocktake/complete" : "/inventory/stocktake/update",
        {
            method: complete ? "POST" : "PUT",
            headers: inventoryHeaders(),
            retry: 0,
            body: {
                scene: "order-review",
                id: order.id,
                approvalKey: order.approvalKey,
                snapshotKey: order.snapshotKey,
                revision: order.revision,
                products: order.products,
                remark: order.remark,
            },
        },
    );

export const updateInventoryStocktake = (payload: Partial<StocktakeMutationPayload> & { id: string; status?: StocktakeStatus }) =>
    $fetch<InventoryBaseDetailResponse<InventoryStocktake>>("/inventory/stocktake/update", {
        method: "PUT",
        headers: inventoryHeaders(),
        body: payload,
    });

export const deleteInventoryStocktake = (payload: { id?: string; ids?: string[] }) =>
    $fetch<InventoryApiResponse>("/inventory/stocktake/delete", {
        method: "DELETE",
        headers: inventoryHeaders(),
        body: payload,
    });

export const completeInventoryStocktake = (id: string) =>
    $fetch<InventoryApiResponse<{
        detail: InventoryStocktake;
        inboundOrderId?: string;
        inboundOrderCode?: string;
        outboundOrderId?: string;
        outboundOrderCode?: string;
    }>>("/inventory/stocktake/complete", {
        method: "POST",
        headers: inventoryHeaders(),
        body: { id },
    });

export const uploadInventoryAttachment = (formData: FormData) =>
    $fetch<InventoryApiResponse<{ url: string; name: string; size: number; type: string }>>(
        "/inventory/attachment/upload",
        {
            method: "POST",
            headers: inventoryHeaders(),
            body: formData,
        },
    );

export const retrieveInventoryInboundOrders = (params: InventoryInboundRetrieveParams = {}) =>
    $fetch<InventoryApiResponse<InventoryListResponse<InventoryInboundOrder>>>(
        "/inventory/inbound/retrieve",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: params,
        },
    );

export const getInventoryInboundDetail = (id: string) =>
    $fetch<InventoryApiResponse<{ detail: InventoryInboundOrder }>>(
        "/inventory/inbound/detail",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: { id },
        },
    );

export const addInventoryInboundOrder = (payload: InventoryInboundMutationPayload) =>
    $fetch<InventoryBaseDetailResponse<InventoryInboundOrder>>("/inventory/inbound/add", {
        method: "POST",
        headers: inventoryHeaders(),
        body: payload,
    });

export const updateInventoryInboundOrder = (
    payload: Partial<InventoryInboundMutationPayload> & { id: string },
) =>
    $fetch<InventoryBaseDetailResponse<InventoryInboundOrder>>("/inventory/inbound/update", {
        method: "PUT",
        headers: inventoryHeaders(),
        body: payload,
    });

export const deleteInventoryInboundOrder = (payload: { id?: string; ids?: string[] }) =>
    $fetch<InventoryApiResponse>("/inventory/inbound/delete", {
        method: "DELETE",
        headers: inventoryHeaders(),
        body: payload,
    });

export const importInventoryInboundOrders = (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return $fetch<InventoryApiResponse<{
        totalCount: number;
        successCount: number;
        failCount: number;
        errors: Array<{ row: number; message: string }>;
    }>>("/inventory/inbound/import", {
        method: "POST",
        headers: inventoryHeaders(),
        body: formData,
        timeout: INVENTORY_IMPORT_REQUEST_TIMEOUT_MS,
    });
};

export const exportInventoryInboundOrders = (params: InventoryInboundRetrieveParams = {}) =>
    $fetch<Blob>("/inventory/inbound/export", {
        method: "GET",
        headers: inventoryHeaders(),
        query: params,
        responseType: "blob",
    });

export const retrieveInventoryTransferOrders = (params: InventoryTransferRetrieveParams = {}) =>
    $fetch<InventoryApiResponse<InventoryListResponse<InventoryTransferOrder>>>(
        "/inventory/transfer/retrieve",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: params,
        },
    );

export const getInventoryTransferDetail = (id: string) =>
    $fetch<InventoryApiResponse<{ detail: InventoryTransferOrder }>>(
        "/inventory/transfer/detail",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: { id },
        },
    );

export const addInventoryTransferOrder = (payload: InventoryTransferMutationPayload) =>
    $fetch<InventoryBaseDetailResponse<InventoryTransferOrder>>("/inventory/transfer/add", {
        method: "POST",
        headers: inventoryHeaders(),
        body: payload,
    });

export const updateInventoryTransferOrder = (
    payload: Partial<InventoryTransferMutationPayload> & { id: string },
) =>
    $fetch<InventoryBaseDetailResponse<InventoryTransferOrder>>("/inventory/transfer/update", {
        method: "PUT",
        headers: inventoryHeaders(),
        body: payload,
    });

export const returnInventoryTransferOrder = (payload: { id: string; actualReturnTime: string }) =>
    $fetch<InventoryBaseDetailResponse<InventoryTransferOrder>>("/inventory/transfer/return", {
        method: "POST",
        headers: inventoryHeaders(),
        body: payload,
    });

export const deleteInventoryTransferOrder = (payload: { id?: string; ids?: string[] }) =>
    $fetch<InventoryApiResponse>("/inventory/transfer/delete", {
        method: "DELETE",
        headers: inventoryHeaders(),
        body: payload,
    });

export const importInventoryTransferOrders = (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return $fetch<InventoryApiResponse<{
        totalCount: number;
        successCount: number;
        failCount: number;
        errors: Array<{ row: number; message: string }>;
    }>>("/inventory/transfer/import", {
        method: "POST",
        headers: inventoryHeaders(),
        body: formData,
        timeout: INVENTORY_IMPORT_REQUEST_TIMEOUT_MS,
    });
};

export const exportInventoryTransferOrders = (params: InventoryTransferRetrieveParams = {}) =>
    $fetch<Blob>("/inventory/transfer/export", {
        method: "GET",
        headers: inventoryHeaders(),
        query: params,
        responseType: "blob",
    });

export const retrieveInventoryOutboundOrders = (params: InventoryOutboundRetrieveParams = {}) =>
    $fetch<InventoryApiResponse<InventoryListResponse<InventoryOutboundOrder>>>(
        "/inventory/outbound/retrieve",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: params,
        },
    );

export const getInventoryOutboundDetail = (id: string) =>
    $fetch<InventoryApiResponse<{ detail: InventoryOutboundOrder }>>(
        "/inventory/outbound/detail",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: { id },
        },
    );

export const addInventoryOutboundOrder = (payload: InventoryOutboundMutationPayload) =>
    $fetch<InventoryBaseDetailResponse<InventoryOutboundOrder>>("/inventory/outbound/add", {
        method: "POST",
        headers: inventoryHeaders(),
        body: payload,
    });

export const updateInventoryOutboundOrder = (
    payload: Partial<InventoryOutboundMutationPayload> & { id: string },
) =>
    $fetch<InventoryBaseDetailResponse<InventoryOutboundOrder>>("/inventory/outbound/update", {
        method: "PUT",
        headers: inventoryHeaders(),
        body: payload,
    });

export const deleteInventoryOutboundOrder = (payload: { id?: string; ids?: string[] }) =>
    $fetch<InventoryApiResponse>("/inventory/outbound/delete", {
        method: "DELETE",
        headers: inventoryHeaders(),
        body: payload,
    });

export const importInventoryOutboundOrders = (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return $fetch<InventoryApiResponse<{
        totalCount: number;
        successCount: number;
        failCount: number;
        errors: Array<{ row: number; message: string }>;
    }>>("/inventory/outbound/import", {
        method: "POST",
        headers: inventoryHeaders(),
        body: formData,
        timeout: INVENTORY_IMPORT_REQUEST_TIMEOUT_MS,
    });
};

export const exportInventoryOutboundOrders = (params: InventoryOutboundRetrieveParams = {}) =>
    $fetch<Blob>("/inventory/outbound/export", {
        method: "GET",
        headers: inventoryHeaders(),
        query: params,
        responseType: "blob",
    });

export const retrieveInventoryStocks = (params: InventoryStockRetrieveParams = {}) =>
    $fetch<InventoryApiResponse<InventoryListResponse<InventoryStock>>>(
        "/inventory/stock/retrieve",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: params,
        },
    );

export const retrieveInventoryStockRestrictions = (params: InventoryStockRestrictionRetrieveParams) =>
    $fetch<InventoryApiResponse<InventoryStockRestrictionDetails>>(
        "/inventory/stock/retrieve",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: { ...params, view: "restrictions" },
        },
    );

export const retrieveInventoryStockLedgers = (
    params: InventoryStockLedgerRetrieveParams = {},
) =>
    $fetch<InventoryApiResponse<InventoryListResponse<InventoryStockLedger>>>(
        "/inventory/stock/ledger",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: params,
        },
    );

export const retrieveProductionInboundSalesOrderCandidates = (params: {
    keyword?: string;
    page?: number;
    limit?: number;
} = {}) =>
    $fetch<InventoryApiResponse<InventoryListResponse<ProductionInboundSalesOrderCandidate>>>(
        "/inventory/inbound/retrieve",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: { ...params, view: "sales-order-candidates" },
        },
    );

export const retrieveSalesOrderStockReservations = (params: {
    salesOrderId?: string;
    salesOrderNo?: string;
}) =>
    $fetch<InventoryApiResponse<{ list: SalesOrderStockReservation[]; orderRemark?: string }>>(
        "/inventory/reservation/retrieve",
        {
            method: "GET",
            headers: inventoryHeaders(),
            query: params,
        },
    );
