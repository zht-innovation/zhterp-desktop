export type ProductionMaterialStatus = "缺料" | "缺料·部分领料" | "待领料" | "已领齐";

export interface ProductionMaterialState {
    materialStatus: ProductionMaterialStatus | null;
    materialStatusReason: string;
}

export interface ExecutionPurchaseOrderReceipt {
    id: string;
    orderNo: string;
    inboundReceived: number;
    inboundTotal: number;
    receiptComplete: boolean;
}

export interface ExecutionPurchaseReceiptState {
    purchaseReceiptReady: boolean;
    purchaseReceiptBlockReason: string;
    purchaseSourceValid: boolean;
    purchaseSourceBlockReason: string;
    relatedPurchaseOrders: ExecutionPurchaseOrderReceipt[];
}

export interface ExecutionAllocation {
    id: string;
    stockId: string;
    reservationId: string;
    warehouseId: string;
    locationId: string;
    quantity: number;
    issued: number;
    cancelled: number;
    returned: number;
    pendingReturn: number;
    pendingQty: number;
    returnLimit: number;
}

export interface ExecutionMaterial {
    productId: string;
    code: string;
    name: string;
    unit: string;
    per: number;
    source: string;
    image: string;
    material: string;
    category: string;
    requiredQty: number;
    lossQty: number;
    lossLimit: number;
    issuedQty: number;
    pendingQty: number;
    pendingReturnQty: number;
    availableQty: number;
    allocatedInTransitQty?: number;
    availableWithTransitQty?: number;
    requestLimit: number;
    supportedQty: number;
}

export interface ExecutionOrder extends ProductionMaterialState, ExecutionPurchaseReceiptState {
    id: string;
    documentNo: string;
    version: number;
    status: string;
    cleanupAllowed?: boolean;
    sourceType: "order" | "stock";
    salesOrderId: string;
    salesOrderNo: string;
    rootProductId: string;
    productId: string;
    productCode: string;
    productName: string;
    kind: "finished" | "component";
    image: string;
    material: string;
    category: string;
    unit: string;
    planQty: number;
    completedQty: number;
    receivedQty: number;
    completionLimit: number;
    executable: boolean;
    hasMaterialLoss: boolean;
    blockReason: string;
    owner: string;
    workshop: string;
    bomVersion: string;
    planStart: string;
    planFinish: string;
    machineNumbers: string[];
    remark: string;
    materials: ExecutionMaterial[];
}

export interface ExecutionRequisitionLine {
    productId: string;
    materialCode: string;
    name: string;
    unit: string;
    per: number;
    quantity: number;
    issued: number;
    cancelled: number;
    returned: number;
    pendingReturn: number;
    pendingQty: number;
    returnLimit: number;
    allocations: ExecutionAllocation[];
}

export interface ExecutionRecord {
    date: string;
    action: string;
    materialCode: string;
    quantity: number;
    unit: string;
    documentNo: string;
    remark: string;
    warehouseId?: string;
    locationId?: string;
}

export interface ExecutionRequisition {
    id: string;
    documentNo: string;
    version: number;
    orderId: string;
    salesOrderId: string;
    applicant: string;
    remark: string;
    date: string;
    status: string;
    hasPendingReturn: boolean;
    lines: ExecutionRequisitionLine[];
    records: ExecutionRecord[];
}

export interface ExecutionCompletion {
    id: string;
    documentNo: string;
    version: number;
    orderId: string;
    quantity: number;
    receivedQty: number;
    pendingQty: number;
    status: string;
    date: string;
    person: string;
    remark: string;
}

export interface ExecutionMaterialLoss {
    id: string;
    orderId: string;
    productId: string;
    materialCode: string;
    materialName: string;
    quantity: number;
    unit: string;
    remark: string;
    person: string;
    date: string;
}

export interface ExecutionReceiptLine {
    completionId: string;
    orderId: string;
    quantity: number;
    warehouseId: string;
    locationId: string;
}

export interface ExecutionReceipt {
    id: string;
    documentNo: string;
    sourceKey: string;
    date: string;
    person: string;
    remark: string;
    lines: ExecutionReceiptLine[];
}

export interface ExecutionWarehouse {
    id: string;
    name: string;
    locations: Array<{ id: string; name: string }>;
}

export interface ExecutionSnapshot {
    orders: ExecutionOrder[];
    requisitions: ExecutionRequisition[];
    completions: ExecutionCompletion[];
    relatedCompletions?: ExecutionCompletion[];
    materialLosses?: ExecutionMaterialLoss[];
    receipts: ExecutionReceipt[];
    warehouses: ExecutionWarehouse[];
    pagination: { page: number; limit: number; total: number };
    counts: Record<string, number>;
}

export interface ExecutionIssueInput { allocationId: string; quantity: number; }
export type ExecutionRequisitionOperation = "cancel" | "return" | "receive";

export interface ProductionPublicMaterial {
    productId: string;
    code: string;
    name: string;
    unit: string;
    publicAvailableQty: number;
}

export interface ProductionPublicMaterials {
    orderId: string;
    version: number;
    documentNo: string;
    salesOrderNo: string;
    relatedProductionOrderCount: number;
    productName: string;
    productCode: string;
    materials: ProductionPublicMaterial[];
}

export const PUBLIC_MATERIAL_ALLOCATION_REASONS = ["赶工补料", "生产缺料", "临时替补", "其他生产调整"] as const;
export type PublicMaterialAllocationReason = typeof PUBLIC_MATERIAL_ALLOCATION_REASONS[number];

export interface PublicMaterialAllocationInput {
    orderId: string;
    version: number;
    reason: PublicMaterialAllocationReason;
    person: string;
    remark: string;
    lines: Array<{ productId: string; quantity: number }>;
}
