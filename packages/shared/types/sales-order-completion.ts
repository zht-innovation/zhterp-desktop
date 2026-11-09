export interface CompletionInventoryLine {
    reservationId: string;
    productId: string;
    productCode: string;
    productName: string;
    unit: string;
    warehouseId: string;
    warehouseName: string;
    locationId: string;
    locationName: string;
    quantity: number;
}

export interface SalesOrderCompletionSummary {
    required: boolean;
    confirmation: {
        source: "manual" | "legacy";
        confirmedAt: string | null;
        confirmedBy: string;
    } | null;
    version: number;
    canComplete: boolean;
    blockingReasons: string[];
    releaseMaterials: CompletionInventoryLine[];
    retainedProducts: CompletionInventoryLine[];
}
