import type {
    INVENTORY_ORDER_STATUS,
    INVENTORY_PRODUCT_SOURCE,
    INVENTORY_STOCK_WARNING_STATUS,
} from "../enums";
import type { PurchaseLogisticsRecord } from "./purchase";

export interface InventoryAuditFields {
    createdBy?: string;
    updatedBy?: string;
    createTime?: string | Date;
    updateTime?: string | Date;
}

export interface InventorySoftDeleteFields {
    _isDeleted?: boolean;
    deletedAt?: string | Date | null;
    deletedBy?: string;
}

export interface InventoryBaseEntity extends InventoryAuditFields, InventorySoftDeleteFields {
    _id?: string;
    code: string;
    name: string;
    remark?: string;
    sort?: number;
}

export interface InventoryTreeEntity extends InventoryBaseEntity {
    parentId?: string | null;
    level?: number;
    children?: InventoryTreeEntity[];
}

export interface InventoryUnit extends InventoryBaseEntity {
    isEnabled?: boolean;
}

export interface InventoryCurrency extends InventoryBaseEntity {
    currencyCode: string;
}

export interface InventoryCategory extends InventoryTreeEntity {}

export interface InventoryWarehouse extends InventoryBaseEntity {
    manager?: string;
    managerId?: string;
    includeInAvailable?: boolean;
    enableLocation?: boolean;
}

export interface InventoryLocation extends InventoryBaseEntity {
    warehouseId: string;
    warehouseCode?: string;
    warehouseName?: string;
    parentId?: string | null;
    level?: number;
    manager?: string;
    managerId?: string;
    children?: InventoryLocation[];
}

export interface InventoryBomCategory extends InventoryTreeEntity {}

export interface InventoryProduct extends InventoryBaseEntity {
    categoryId?: string | null;
    categoryCode?: string;
    categoryName?: string;
    categoryPath?: string;
    image?: string;
    unitId?: string | null;
    unitCode?: string;
    unitName?: string;
    material?: string;
    source?: INVENTORY_PRODUCT_SOURCE | string;
    standardPrice?: number;
    averagePrice?: number;
    model?: string;
    modelCode?: string;
    kitQuantity?: number;
    stockUpperLimit?: number;
    stockLowerLimit?: number;
    totalQuantity?: number;
    availableQuantity?: number;
    warehouseId?: string | null;
    warehouseCode?: string;
    warehouseName?: string;
    locationId?: string | null;
    locationCode?: string;
    locationName?: string;
    introduction?: string;
    barcode?: string;
    snPrefixes?: string[];
    snPrintState?: {
        monthKey: string;
        lastSerial: number;
        updatedAt?: string | Date;
        updatedBy?: string;
    };
    isSaleable?: boolean;
    operator?: string;
    reserved1?: string;
    reserved2?: string;
    reserved3?: string;
    reserved4?: string;
    reserved5?: string;
}

export interface InventoryBomItem {
    lineId?: string;
    productId: string;
    productCode?: string;
    productName?: string;
    model?: string;
    categoryId?: string | null;
    categoryName?: string;
    quantity: number;
    unitId?: string | null;
    unitCode?: string;
    unitName?: string;
    lossRate?: number;
    remark?: string;
    sort?: number;
}

export interface InventoryBom extends InventoryBaseEntity {
    revision?: number;
    productId: string;
    productCode?: string;
    productName?: string;
    model?: string;
    version?: string;
    process?: string;
    isEnabled?: boolean;
    items: InventoryBomItem[];
    operator?: string;
    reserved1?: string;
    reserved2?: string;
    reserved3?: string;
    reserved4?: string;
    reserved5?: string;
}

export interface InventoryWaybillAttachment {
    name: string;
    url: string;
    size?: number;
    type?: string;
}

export interface InventoryWaybill extends InventoryAuditFields, InventorySoftDeleteFields {
    direction?: "send" | "receive";
    _id?: string;
    sourceType?: "purchase-logistics" | "inventory-inbound" | "inventory-outbound" | "inventory-transfer";
    sourceOrderId?: string;
    sourceWaybillId?: string;
    purchaseLogistics?: PurchaseLogisticsRecord;
    waybillNo: string;
    company: string;
    trackingNo: string;
    relatedOrderNo?: string;
    salesperson?: string;
    goods: string;
    goodsDisplay?: string;
    businessType: string;
    sentAt: string | Date;
    senderAddress?: string;
    receiverAddress: string;
    receiverName?: string;
    transportInfo?: string;
    transportTraces?: Array<{
        action?: string;
        acceptStation: string;
        acceptTime?: string | Date | null;
        location?: string;
    }>;
    transportStatus?: "待发货" | "已揽收" | "运输中" | "待取货" | "已签收";
    transportUpdatedAt?: string | Date | null;
    transportUpdatedBy?: string;
    needsSupplement?: boolean;
    image?: string;
    imageName?: string;
    images?: InventoryWaybillAttachment[];
    attachmentNames?: string[];
    attachments?: InventoryWaybillAttachment[];
    remark?: string;
    reserved1?: string;
    reserved2?: string;
    reserved3?: string;
    reserved4?: string;
    reserved5?: string;
}

export interface InventoryStockDetail {
    _id?: string;
    warehouseId?: string | null;
    warehouseCode?: string;
    warehouseName?: string;
    locationId?: string | null;
    locationCode?: string;
    locationName?: string;
    includeInAvailable?: boolean;
    quantity: number;
    totalQuantity: number;
    availableQuantity: number;
    unavailableQuantity: number;
    lockedQuantity?: number;
    warehouseDisplayName?: string;
}

export interface InventoryStock extends InventoryAuditFields, InventorySoftDeleteFields {
    _id?: string;
    productId: string;
    productCode?: string;
    productName?: string;
    model?: string;
    material?: string;
    categoryId?: string | null;
    categoryCode?: string;
    categoryName?: string;
    categoryPath?: string;
    image?: string;
    averagePrice?: number;
    kitQuantity?: number;
    stockUpperLimit?: number;
    stockLowerLimit?: number;
    introduction?: string;
    unitId?: string | null;
    unitCode?: string;
    unitName?: string;
    totalQuantity: number;
    availableQuantity: number;
    unavailableQuantity: number;
    lockedQuantity?: number;
    inTransitQuantity?: number;
    allocatedInTransitQuantity?: number;
    stockStatus?: InventoryStockWarningStatus;
    details?: InventoryStockDetail[];
}

export type InventoryStockRestrictionReason =
    | "order-finished-product"
    | "order-production-material"
    | "warehouse-excluded"
    | "other-order"
    | "other-lock"
    | "inconsistent-lock";

export interface InventoryStockRestriction {
    id: string;
    stockId: string;
    reason: InventoryStockRestrictionReason;
    salesOrderNo?: string;
    quantity: number;
    warehouseDisplayName: string;
}

export interface InventoryStockRestrictionDetails {
    productId: string;
    productCode: string;
    model: string;
    unitName: string;
    unavailableQuantity: number;
    list: InventoryStockRestriction[];
}

export interface InventoryStockRestrictionRetrieveParams {
    productId: string;
    stockId?: string;
    warehouseId?: string;
    locationId?: string;
    includeDescendantLocations?: boolean;
}

export interface SalesOrderStockReservation extends InventoryAuditFields {
    _id?: string;
    salesOrderId: string;
    salesOrderNo: string;
    demandProductId: string;
    stockProductId: string;
    warehouseId?: string | null;
    locationId?: string | null;
    reservationType: "finished-product" | "production-material";
    requiredQuantity: number;
    reservedQuantity: number;
    consumedQuantity: number;
    releasedQuantity: number;
    sourceAllocationId?: string | null;
    sourceInboundId?: string | null;
    status: "active" | "consumed" | "released";
}

export interface InventoryStockLedger extends InventoryAuditFields, InventorySoftDeleteFields {
    _id?: string;
    productId: string;
    productCode?: string;
    productName?: string;
    model?: string;
    unitId?: string | null;
    unitCode?: string;
    unitName?: string;
    changedAt: string | Date;
    relatedOrderNo?: string;
    businessType: string;
    direction?: "inbound" | "outbound" | "transfer";
    quantity: number;
    outboundWarehouseId?: string | null;
    outboundWarehouseName?: string;
    outboundLocationId?: string | null;
    outboundLocationName?: string;
    inboundWarehouseId?: string | null;
    inboundWarehouseName?: string;
    inboundLocationId?: string | null;
    inboundLocationName?: string;
    sourceType?: string;
    sourceId?: string | null;
    sourceNo?: string;
    operator?: string;
    remark?: string;
}

export interface InventoryInboundItem {
    productId: string;
    productCode?: string;
    productName?: string;
    model?: string;
    material?: string;
    categoryId?: string | null;
    categoryName?: string;
    categoryPath?: string;
    image?: string;
    quantity: number;
    lockedQuantity?: number;
    unitId?: string | null;
    unitCode?: string;
    unitName?: string;
    warehouseId?: string | null;
    warehouseCode?: string;
    warehouseName?: string;
    locationId?: string | null;
    locationCode?: string;
    locationName?: string;
    includeInAvailable?: boolean;
}

export interface InventoryInboundOrder extends InventoryAuditFields, InventorySoftDeleteFields {
    _id?: string;
    inboundNo: string;
    sourceType?: string;
    sourceKey?: string;
    type: string;
    relatedNo?: string;
    totalQuantity: number;
    inboundDate: string | Date;
    handler?: string;
    status?: InventoryOrderStatus;
    stockApplied?: boolean;
    courierCompany?: string;
    trackingNo?: string;
    purchaseOrderNo?: string;
    processingOrderNo?: string;
    productionOwner?: string;
    salesOrderId?: string | null;
    salesOrderNo?: string;
    orderNo?: string;
    returnReason?: string;
    remark?: string;
    items: InventoryInboundItem[];
    reserved1?: string;
    reserved2?: string;
    reserved3?: string;
    reserved4?: string;
    reserved5?: string;
}

// 出库单明细项
export interface InventoryOutboundItem {
    productId: string;
    productCode: string;
    productName: string;
    model: string;
    material?: string;
    categoryId?: string;
    categoryName?: string;
    categoryPath?: string;
    image?: string;
    quantity: number;
    unitId?: string | null;
    unitCode?: string;
    unitName?: string;
    warehouseId?: string | null;
    warehouseCode?: string;
    warehouseName?: string;
    locationId?: string | null;
    locationCode?: string;
    locationName?: string;
    includeInAvailable?: boolean;
}

// 出库单
export interface InventoryOutboundOrder extends InventoryAuditFields, InventorySoftDeleteFields {
    _id?: string;
    outboundNo: string;
    salesOrderId?: string | null;
    type: string;
    relatedNo?: string;
    totalQuantity: number;
    outboundDate: string | Date;
    handler?: string;
    status?: InventoryOrderStatus;
    stockApplied?: boolean;
    contractOrderNo?: string;
    expressCompany?: string;
    waybillNo?: string;
    borrower?: string;
    borrowingParty?: string;
    deposit?: string;
    returnDate?: string | Date;
    project?: string;
    images?: InventoryWaybillAttachment[];
    remark?: string;
    items: InventoryOutboundItem[];
    reserved1?: string;
    reserved2?: string;
    reserved3?: string;
    reserved4?: string;
    reserved5?: string;
}

// 调拨单明细项
export interface InventoryTransferItem {
    productId: string;
    productCode: string;
    productName: string;
    model: string;
    material?: string;
    categoryId?: string;
    categoryName?: string;
    categoryPath?: string;
    category: string; // 前端显示用，值为 categoryPath 或 categoryName
    image: string;
    quantity: number;
    unitId: string;
    unitCode?: string;
    unit: string; // 前端显示用，值为 unitName
    warehouseId?: string;
    warehouseCode?: string;
    warehouseName?: string;
    locationId?: string;
    locationCode?: string;
    locationName?: string;
    includeInAvailable?: boolean;
    remark?: string;
}

// 调拨单
export interface InventoryTransferOrder extends InventoryAuditFields, InventorySoftDeleteFields {
    _id: string;
    code: string; // 单据编号，格式：DB-YYYYMMDD-NNN
    transferDate: string;
    borrower: string;
    expectedReturnDate?: string | Date;
    actualReturnTime?: string | Date;
    returned?: boolean;
    handler: string;
    courierCompany?: string;
    trackingNo?: string;
    remark?: string;
    status: InventoryOrderStatus;
    items: InventoryTransferItem[];
    reserved1?: string;
    reserved2?: string;
    reserved3?: string;
    reserved4?: string;
    reserved5?: string;
}

export interface InventoryPagination {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
}

export interface InventoryListResponse<T> {
    list: T[];
    pagination: InventoryPagination;
}

export type InventoryStockWarningStatus =
    | INVENTORY_STOCK_WARNING_STATUS
    | `${INVENTORY_STOCK_WARNING_STATUS}`;

export type InventoryOrderStatus =
    | INVENTORY_ORDER_STATUS
    | `${INVENTORY_ORDER_STATUS}`;
