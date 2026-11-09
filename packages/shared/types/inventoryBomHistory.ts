import type { InventoryBom, InventoryBomItem, InventoryListResponse } from "./inventory";

export type BomHistoryValue = string | number | boolean | null;

export interface BomHistoryFieldChange {
    field: string;
    label: string;
    before: BomHistoryValue;
    after: BomHistoryValue;
}

export interface BomHistoryItemChange {
    type: "added" | "removed" | "replaced" | "updated";
    lineId: string;
    before: InventoryBomItem | null;
    after: InventoryBomItem | null;
}

export interface InventoryBomHistory {
    _id?: string;
    bomId: string;
    revision: number;
    action: "create" | "baseline" | "update";
    operator: string;
    createdAt: string | Date;
    snapshot: InventoryBom;
    changes: {
        fields: BomHistoryFieldChange[];
        items: BomHistoryItemChange[];
    };
}

export type InventoryBomHistoryResponse = InventoryListResponse<InventoryBomHistory>;
