export interface PurchaseBomNode {
    key: string;
    productId: string;
    productCode: string;
    model: string;
    category: string;
    image: string;
    unit: string;
    quantity: number;
    requiredQuantity: number;
    availableQuantity: number;
    shortageQuantity: number;
    bomId?: string;
    bomCode?: string;
    bomName?: string;
    bomVersion?: string;
    children: PurchaseBomNode[];
}

export interface PurchaseBomGroup {
    sourceRequirementId: string;
    demandProductId: string;
    root: PurchaseBomNode;
}

export interface PurchaseBomExpansion {
    version: string;
    sourceRequirementIds: string[];
}

export interface PurchaseBomPreviewLine {
    id?: string;
    productId: string;
    productCode: string;
    productModel: string;
    unitName: string;
    categoryName: string;
    image: string;
    remainingPurchaseQuantity: number;
    shortageQuantity: number;
    bomLineKey?: string;
}

export interface PurchaseBomPreview {
    version: string;
    sourceRequirementIds: string[];
    groups: PurchaseBomGroup[];
    list: PurchaseBomPreviewLine[];
}
