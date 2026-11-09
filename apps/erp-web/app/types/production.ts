import type { SalesOrderCompletionSummary } from "~~/shared/types/sales-order-completion";
import type { InventoryReviewResult } from "~~/shared/types/inventoryReview";

export interface ProductionOverviewProduct {
    productId: string;
    parentProductId?: string;
    name: string;
    code: string;
    material: string;
    category: string;
    image?: string;
    remark?: string;
    quantity: number;
    unit: string;
    locked: number;
    received: number;
    released: number;
    remaining: number;
    planningCoverage: number;
    legacyReviewRequired: boolean;
    bomVersion?: string;
}

export interface ProductionOverviewOrder {
    id: string;
    salesOrderId: string;
    salesperson: string;
    type?: string;
    dueDate: string;
    status: "待采购" | "待生产" | "生产中" | "待发货";
    completion: SalesOrderCompletionSummary;
    productionOrders: string[];
    productionOrderDetails: Array<{ id: string; documentNo: string; status: string; version: number; productId: string; planQty: number; completedQty: number; receivedQty: number }>;
    products: ProductionOverviewProduct[];
    components: ProductionOverviewProduct[];
    warehouseReview?: InventoryReviewResult & { reviewedAt: string };
    requirements?: { custom?: string; installation?: string; testing?: string };
    orderRemark?: string;
    orderImages?: Array<string | {
        path?: string;
        url?: string;
        href?: string;
        originalName?: string;
        name?: string;
        filename?: string;
        size?: number;
        type?: string;
    }>;
    machineNumbers?: string[];
}

export interface ProductionCandidateOrder extends Omit<ProductionOverviewOrder, "status"> {
    status: ProductionOverviewOrder["status"] | "已出库";
    canCreate: boolean;
    createBlockReason: string;
}
