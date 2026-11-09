import type { OrderApprovalField } from "./orderApproval";

export interface OrderKitAnalysisRow {
    key: string;
    parentKey: string;
    level: number;
    productId?: string;
    productCode: string;
    productName: string;
    model: string;
    image: string;
    demandQuantity: number;
    unitName: string;
    availableQuantity: number;
    shortageQuantity: number;
    status: "正常" | "缺货";
    suggestion: string;
    children: OrderKitAnalysisRow[];
}

export interface OrderKitAnalysisResult {
    rows: OrderKitAnalysisRow[];
    analyzedAt: string;
    visibleFields?: OrderApprovalField[];
}
