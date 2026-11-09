import type {
    InventoryAuditFields,
    InventoryInboundOrder,
    InventoryListResponse,
    InventoryProduct,
    InventorySoftDeleteFields,
} from "./inventory";
import type { PurchaseChannel, TaobaoSyncStatus } from "./logistics";

export interface PurchaseSupplierAttachment {
    url: string;
    name: string;
    size?: number;
    type?: string;
}

export interface PurchaseSupplier extends InventoryAuditFields, InventorySoftDeleteFields {
    _id?: string;
    code: string;
    name: string;
    contact?: string;
    phone?: string;
    address?: string;
    detailedAddress?: string;
    remark?: string;
    isEnabled?: boolean;
    attachments?: PurchaseSupplierAttachment[];
    operator?: string;
    products?: PurchaseSupplierProductSummary[];
}

export type PurchaseSupplierProductSummary = {
    productId: string;
    code: string;
    image: string;
};

export type PurchaseSupplierRetrieveParams = {
    keyword?: string;
    isEnabled?: boolean | string;
    productId?: string;
    includeDeleted?: boolean;
    page?: number;
    limit?: number;
};

export type PurchaseSupplierMutationPayload = {
    id?: string;
    name: string;
    contact?: string;
    phone?: string;
    address?: string;
    detailedAddress?: string;
    remark?: string;
    isEnabled?: boolean;
    operator?: string;
    attachments?: PurchaseSupplierAttachment[];
};

export type PurchaseSupplierListResponse = InventoryListResponse<PurchaseSupplier>;

export type PurchaseSupplierProductRetrieveParams = {
    supplierId: string;
    keyword?: string;
    categoryId?: string;
    page?: number;
    limit?: number;
};

export type PurchaseSupplierProductListResponse = InventoryListResponse<InventoryProduct>;

export interface PurchaseOrderWaybill {
    source?: "manual" | "taobao";
    accountKey?: string;
    platformOrderNos?: string[];
    _id?: string;
    trackingNo: string;
    courierCompany?: string;
    remark?: string;
    productIds?: string[];
    transportInfo?: string;
    transportTraces?: PurchaseLogisticsTrace[];
    transportStatus?: PurchaseTransportStatus;
    transportUpdatedAt?: string | Date | null;
    transportUpdatedBy?: string;
    acceptanceStatus?: PurchaseLogisticsAcceptanceStatus;
    acceptanceItems?: PurchaseLogisticsAcceptanceItem[];
    acceptedAt?: string | Date | null;
    acceptedBy?: string;
    acceptanceRemark?: string;
    acceptanceAttachments?: PurchaseLogisticsAcceptanceAttachment[];
    acceptanceImages?: PurchaseLogisticsAcceptanceAttachment[];
    inboundOrderId?: string | null;
    inboundOrderNo?: string;
    syncedWaybillId?: string | null;
    syncedAt?: string | Date | null;
}

export interface PurchaseLogisticsTrace {
    action?: string;
    acceptStation: string;
    acceptTime: string | Date;
    location?: string;
}

export type PurchaseTransportStatus = "待发货" | "已揽收" | "运输中" | "待取货" | "已签收";

export type PurchaseLogisticsAcceptanceStatus = "待验收" | "验收正常" | "验收异常";

export interface PurchaseLogisticsAcceptanceAttachment {
    name: string;
    url: string;
    size?: number;
    type?: string;
}

export interface PurchaseLogisticsAcceptanceItem {
    productId: string;
    productCode?: string;
    productName: string;
    productModel?: string;
    unitId?: string | null;
    unitName?: string;
    expectedQuantity: number;
    receivedQuantity: number;
    damagedQuantity: number;
    inboundQuantity: number;
    remainingQuantity?: number;
    warehouseId?: string | null;
    warehouseName?: string;
    locationId?: string | null;
    locationName?: string;
}

export interface PurchaseLogisticsRecord {
    id: string;
    purchaseOrderId: string;
    waybillId: string;
    purchaseOrderNo: string;
    trackingNo: string;
    courierCompany?: string;
    goodsNames: string[];
    goodsText: string;
    transportInfo: string;
    transportTraces: PurchaseLogisticsTrace[];
    transportStatus: PurchaseTransportStatus;
    acceptanceStatus: PurchaseLogisticsAcceptanceStatus;
    acceptanceItems: PurchaseLogisticsAcceptanceItem[];
    availableItems: PurchaseLogisticsAcceptanceItem[];
    acceptedAt?: string | Date | null;
    acceptedBy?: string;
    acceptanceRemark?: string;
    acceptanceAttachments: PurchaseLogisticsAcceptanceAttachment[];
    acceptanceImages: PurchaseLogisticsAcceptanceAttachment[];
    inboundOrderId?: string | null;
    inboundOrderNo?: string;
    syncedWaybillId?: string | null;
    syncedAt?: string | Date | null;
    purchaseDate?: string | Date | null;
    updatedAt?: string | Date | null;
    isDemo?: boolean;
}

export type PurchaseLogisticsRetrieveParams = {
    view: "purchase-logistics";
    keyword?: string;
    transportStatus?: PurchaseTransportStatus | "";
    acceptanceStatus?: PurchaseLogisticsAcceptanceStatus | "";
    page?: number;
    limit?: number;
};

export type PurchaseLogisticsAcceptancePayload = {
    operation: "acceptPurchaseTransport";
    purchaseOrderId: string;
    waybillId: string;
    remark?: string;
    attachments?: PurchaseLogisticsAcceptanceAttachment[];
    images?: PurchaseLogisticsAcceptanceAttachment[];
    items: Array<{
        productId: string;
        expectedQuantity: number;
        receivedQuantity: number;
        damagedQuantity: number;
        warehouseId?: string | null;
        locationId?: string | null;
    }>;
};

export interface PurchaseOrderAttachment {
    url: string;
    name: string;
    size?: number;
    type?: string;
}

export interface PurchaseOrderSupplier {
    supplierId: string;
    supplierCode?: string;
    supplierName?: string;
}

export interface PurchaseOrderItem {
    productId: string;
    productCode?: string;
    productName?: string;
    productModel?: string;
    unitId?: string | null;
    unitName?: string;
    quantity: number;
    remark?: string;
    supplierId?: string;
    supplierCode?: string;
    supplierName?: string;
    suppliers?: PurchaseOrderSupplier[];
    unitPrice?: number;
    totalAmount?: number;
    platformOrderNos?: string[];
}

export interface PurchaseOrderAllocationPayload {
    requirementId?: string;
    purchaseRequestId?: string;
    purchaseRequestNo?: string;
    purchaseRequestItemIndex?: number;
    productId?: string;
    allocatedQuantity: number;
}

export interface PurchaseOrderAllocation extends PurchaseOrderAllocationPayload {
    _id?: string;
    id?: string;
    purchaseOrderId?: string;
    purchaseOrderNo?: string;
    salesOrderId?: string;
    salesOrderNo?: string;
    productId?: string;
    lockedAfterInboundQuantity?: number;
    status?: string;
}

export interface PurchaseOrderInboundProgressItem {
    productId: string;
    productCode?: string;
    productModel?: string;
    unitId?: string | null;
    unitName?: string;
    totalQuantity: number;
    receivedQuantity: number;
    inboundPercent?: number;
}

export interface PurchaseOrderInboundProgress {
    orderNo: string;
    inboundReceived: number;
    inboundTotal: number;
    inboundPercent: number;
    items: PurchaseOrderInboundProgressItem[];
    records?: InventoryInboundOrder[];
}

export interface PurchaseOrder extends InventoryAuditFields, InventorySoftDeleteFields {
    purchaseChannel?: PurchaseChannel;
    platformOrderNos?: string[];
    taobaoSyncStatus?: TaobaoSyncStatus;
    taobaoSyncMessage?: string;
    taobaoSyncedAt?: string | Date | null;
    taobaoUnmatchedOrderNos?: string[];
    _id?: string;
    id?: string;
    orderNo: string;
    creationSource?: "purchase-request";
    supplierId?: string;
    supplierCode?: string;
    supplierName?: string;
    buyer?: string;
    purchaseDate?: string;
    status?: string;
    totalPrice?: number;
    totalAmount?: string;
    totalQuantity?: number;
    inboundReceived?: number;
    inboundTotal?: number;
    inboundPercent?: number;
    remark?: string;
    attachments?: PurchaseOrderAttachment[];
    operator?: string;
    updatedAt?: string | Date;
    items?: PurchaseOrderItem[];
    waybills?: PurchaseOrderWaybill[];
    allocations?: PurchaseOrderAllocation[];
    inboundProgress?: PurchaseOrderInboundProgress;
}

export type PurchaseOrderRetrieveParams = {
    orderNo?: string;
    keyword?: string;
    supplierId?: string;
    supplierName?: string;
    productId?: string;
    status?: string;
    trackingNo?: string;
    startDate?: string;
    endDate?: string;
    includeDeleted?: boolean;
    page?: number;
    limit?: number;
};

export type PurchaseOrderInboundCandidateRetrieveParams = Pick<
    PurchaseOrderRetrieveParams,
    "keyword" | "page" | "limit"
>;

export interface PurchaseOrderInboundCandidate {
    id: string;
    orderNo: string;
    status: string;
    products: Array<{
        productId: string;
        productName: string;
        productCode?: string;
        productModel?: string;
        image?: string;
    }>;
}

export interface PurchaseOrderInboundDetail {
    orderNo: string;
    status: string;
    items: PurchaseOrderItem[];
    waybills: PurchaseOrderWaybill[];
    inboundProgress: PurchaseOrderInboundProgress;
}

export type PurchaseOrderMutationPayload = {
    purchaseChannel?: PurchaseChannel;
    platformOrderNos?: string[];
    id?: string;
    creationSource?: "purchase-request";
    supplierId: string;
    buyer: string;
    purchaseDate: string;
    totalPrice?: number | string;
    remark?: string;
    items: Array<{
        productId: string;
        quantity: number;
        unitPrice: number | string;
        unitId?: string | null;
        remark?: string;
        supplierId?: string;
        supplierIds?: string[];
        totalAmount?: number | string;
        platformOrderNos?: string[];
    }>;
    allocations?: PurchaseOrderAllocationPayload[];
    waybills?: PurchaseOrderWaybill[];
};

export interface PurchaseRequestOrderCandidate {
    purchaseRequestId: string;
    purchaseRequestNo: string;
    purchaseRequestItemIndex: number;
    salesOrderNo: string;
    category: string;
    productId: string;
    requirementId?: string;
    requestedQuantity: number;
    allocatedQuantity: number;
    remainingQuantity: number;
    unitName: string;
}

export type PurchaseRequestOrderCandidateParams = {
    source: "purchase-request";
    productId: string;
    purchaseOrderId?: string;
    keyword?: string;
    page?: number;
    limit?: number;
};

export interface PurchaseOrderSalesCandidate {
    id: string;
    requirementId: string;
    salesOrderId: string;
    orderNo: string;
    salesOrderNo?: string;
    salesperson?: string;
    orderType?: string;
    dispatchDate?: string | Date | null;
    duration?: string;
    durationText?: string;
    requiredQuantity?: number;
    shortageQuantity?: number;
    allocatedQuantity?: number;
    fulfilledQuantity?: number;
    remainingPurchaseQuantity: number;
    remainingFulfillmentQuantity?: number;
    remainingQuantity?: number;
    status?: string;
}

export type PurchaseOrderSalesCandidateParams = {
    productId: string;
    keyword?: string;
    orderType?: string;
    page?: number;
    limit?: number;
};

export type PurchaseMaterialPoolSourceType = "sales-order" | "purchase-request";

export interface PurchaseMaterialPoolSource {
    id: string;
    sourceType?: PurchaseMaterialPoolSourceType;
    purchaseRequestId?: string;
    purchaseRequestNo?: string;
    purchaseRequestItemIndex?: number;
    requirementId?: string;
    salesOrderId?: string;
    orderNo: string;
    salesOrderNo?: string;
    orderType: string;
    salesperson: string;
    orderRemark?: string;
    orderImages?: Array<string | Record<string, unknown>>;
    sampleRequirement?: string;
    requiredQuantity: number;
    shortageQuantity?: number;
    remainingPurchaseQuantity?: number;
    deliveryDate?: string | Date | null;
    remainingDays?: number | null;
}

export interface PurchaseMaterialPoolInventory {
    availableQuantity: number;
    inTransitQuantity: number;
    reservedQuantity: number;
    safetyStock: number;
}

export interface PurchaseMaterialPoolHistory {
    id: string;
    orderNo: string;
    purchaseDate: string | Date | null;
    supplierName: string;
    quantity: number;
    unitPrice?: number;
    status: string;
}

export interface PurchaseMaterialPoolItem {
    id: string;
    productId: string;
    unitId?: string | null;
    materialCode: string;
    materialName: string;
    materialModel: string;
    materialType: string;
    shortageQuantity: number;
    unit: string;
    suggestedSupplierId?: string;
    suggestedSupplier: string;
    estimatedUnitPrice?: number;
    inventory: PurchaseMaterialPoolInventory;
    purchaseHistory: PurchaseMaterialPoolHistory[];
    sources: PurchaseMaterialPoolSource[];
}

export type PurchaseMaterialPoolRetrieveParams = {
    keyword?: string;
    materialKeyword?: string;
    page?: number;
    limit?: number;
};

export type PurchaseMaterialRequirementRefreshPayload = {
    salesOrderId: string;
    analysisVersion?: string;
    requirements?: Array<{
        productId: string;
        requiredQuantity?: number;
        availableQuantityAtAnalysis?: number;
        shortageQuantity: number;
        demandType?: "purchase" | "assembly";
        suggestion?: string;
    }>;
    items?: Array<{
        productId: string;
        requiredQuantity?: number;
        availableQuantityAtAnalysis?: number;
        shortageQuantity: number;
        demandType?: "purchase" | "assembly";
        suggestion?: string;
    }>;
};

export interface PurchaseOrderDialogDraftRelatedOrder {
    id: string;
    sourceType?: PurchaseMaterialPoolSourceType;
    purchaseRequestId?: string;
    purchaseRequestNo?: string;
    purchaseRequestItemIndex?: number;
    requirementId?: string;
    salesOrderNo?: string;
    category?: string;
    orderNo: string;
    requiredQuantity: number;
    remainingQuantity: number | null;
    allocatedQuantity: number;
}

export interface PurchaseOrderDialogDraft {
    source?: string;
    supplierId?: string;
    supplierName?: string;
    productId: string;
    productCode?: string;
    productModel?: string;
    productName?: string;
    unitId?: string | null;
    unitName?: string;
    purchaseQuantity: number;
    relatedOrders?: PurchaseOrderDialogDraftRelatedOrder[];
    items?: Array<{
        productId: string;
        productCode?: string;
        productModel?: string;
        productName?: string;
        unitId?: string | null;
        unitName?: string;
        purchaseQuantity: number;
        supplierId?: string;
        supplierName?: string;
        relatedOrders?: PurchaseOrderDialogDraftRelatedOrder[];
    }>;
}

export interface QuickInboundCandidateItem {
    requirementId: string;
    purchaseRequestNo: string;
    salesOrderNo: string;
    dispatchDate: string | null;
    remainingGap: number;
}

export interface QuickInboundProduct {
    productId: string;
    productCode: string;
    model: string;
    unitName: string;
    quantity: number;
    receivedQuantity: number;
    remainingQuantity: number;
    warehouseId: string;
    locationId: string;
    warehouseName: string;
    locationName: string;
    candidates: QuickInboundCandidateItem[];
}

export interface QuickInboundCandidatesResponse {
    orderNo: string;
    salesOrderNos: string[];
    products: QuickInboundProduct[];
}

export interface QuickInboundAllocatePayload {
    orderNo: string;
    allocations: Array<{
        productId: string;
        requirementId: string;
        allocatedQuantity: number;
    }>;
}
