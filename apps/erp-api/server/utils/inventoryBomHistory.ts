import type { InventoryBom, InventoryBomItem } from "~~/shared/types/inventory";
import type { BomHistoryValue, InventoryBomHistory } from "~~/shared/types/inventoryBomHistory";

const fieldLabels: Record<string, string> = {
    code: "BOM 编码",
    name: "BOM 名称",
    productId: "主产品",
    productCode: "主产品编码",
    productName: "主产品名称",
    model: "主产品型号",
    version: "业务版本",
    process: "工序",
    isEnabled: "是否启用",
    remark: "备注",
    operator: "经办人",
    reserved1: "预留字段1",
    reserved2: "预留字段2",
    reserved3: "预留字段3",
    reserved4: "预留字段4",
    reserved5: "预留字段5",
};

const itemFields = [
    "productId", "productCode", "productName", "model", "categoryId", "categoryName",
    "quantity", "unitId", "unitCode", "unitName", "lossRate", "remark", "sort",
];

export const getBomRevision = (bom: any): number => {
    return Number.isInteger(bom?.revision) && bom.revision > 0 ? bom.revision : 1;
};

export const getBomLineId = (item: any): string => {
    return String(item?.lineId || `legacy-${String(item?.productId || "")}`);
};

// 旧记录仅在响应中补齐标识，读取不会写回数据库或产生历史版本。
export const normalizeBomForRead = (bom: any): any => {
    const data = typeof bom?.toObject === "function" ? bom.toObject() : bom;
    return {
        ...data,
        revision: getBomRevision(data),
        items: (data?.items || []).map((item: any) => ({ ...item, lineId: getBomLineId(item) })),
    };
};

export const createBomSnapshot = (bom: any): InventoryBom => {
    const data = normalizeBomForRead(bom);
    delete data.purchaseBomRevision;
    delete data.__v;
    delete data.structure;
    return JSON.parse(JSON.stringify(data));
};

const fieldValue = (row: any, field: string): BomHistoryValue => {
    const value = row[field];
    if (field === "isEnabled") return value !== false;
    if (["quantity", "lossRate", "sort"].includes(field)) return Number(value || 0);
    if (["productId", "categoryId", "unitId"].includes(field)) return value ? String(value) : null;
    return value === undefined || value === null ? "" : String(value);
};

const itemChanged = (before: InventoryBomItem, after: InventoryBomItem): boolean => {
    for (const field of itemFields) {
        if (fieldValue(before, field) !== fieldValue(after, field)) return true;
    }
    return false;
};

export const buildBomHistoryChanges = (beforeBom: any, afterBom: any): InventoryBomHistory["changes"] => {
    const before = createBomSnapshot(beforeBom);
    const after = createBomSnapshot(afterBom);
    const changes: InventoryBomHistory["changes"] = { fields: [], items: [] };

    for (const field of Object.keys(fieldLabels)) {
        const beforeValue = fieldValue(before, field);
        const afterValue = fieldValue(after, field);
        if (beforeValue !== afterValue) {
            changes.fields.push({ field, label: fieldLabels[field], before: beforeValue, after: afterValue });
        }
    }

    const oldItems = new Map(before.items.map((item) => [getBomLineId(item), item]));
    const newItems = new Map(after.items.map((item) => [getBomLineId(item), item]));
    for (const [lineId, oldItem] of oldItems) {
        const newItem = newItems.get(lineId);
        if (!newItem) {
            changes.items.push({ type: "removed", lineId, before: oldItem, after: null });
        } else if (String(oldItem.productId) !== String(newItem.productId)) {
            changes.items.push({ type: "replaced", lineId, before: oldItem, after: newItem });
        } else if (itemChanged(oldItem, newItem)) {
            changes.items.push({ type: "updated", lineId, before: oldItem, after: newItem });
        }
    }
    for (const [lineId, newItem] of newItems) {
        if (!oldItems.has(lineId)) {
            changes.items.push({ type: "added", lineId, before: null, after: newItem });
        }
    }
    return changes;
};
