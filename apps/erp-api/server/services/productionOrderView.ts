import { normalizeStockQuantity } from "./inventoryStockMath";
import type { ExecutionMaterial, ProductionMaterialState } from "~~/shared/types/production-execution";
import { productionWarningDays } from "./productionWarningMath";
import type { ProductionOrderDeleteState } from "./productionOrderDeleteEligibility";

const text = (value: unknown) => String(value ?? "").trim();
const id = (value: any) => text(value?.toString?.() || value);

export const productionOrderListItem = (row: any, salesOrder?: any, materialState?: ProductionMaterialState, deleteState?: ProductionOrderDeleteState) => ({
    id: id(row._id), documentNo: text(row.documentNo) || text(row.productionNo), sourceType: row.sourceType,
    salesOrderNo: text(row.salesOrderNo || salesOrder?.orderNo), salesperson: text(salesOrder?.salespersonName),
    productId: id(row.productId), rootProductId: id(row.rootProductId),
    productCode: text(row.productCode), productName: text(row.productName), unit: text(row.unitName) || "个",
    planQty: Number(row.planQty || 0), status: row.status, owner: text(row.owner), workshop: text(row.workshop),
    priority: text(row.priority), planStart: row.planStart, planFinish: row.planFinish,
    warningDays: productionWarningDays(row.warningDays),
    pendingWarningCount: (row.warnings || []).filter((warning: any) => !warning.handledAt).length,
    bomVersion: text(row.bomVersion), completedQty: Number(row.completedQty || 0),
    receivedQty: Number(row.receivedQty || 0), machineNumbers: row.machineNumbers || [],
    remark: text(row.remark), version: Number(row.version || 1), createTime: row.createTime,
    materialCount: Array.isArray(row.bomMaterials) ? row.bomMaterials.length : 0,
    materialStatus: materialState?.materialStatus ?? null,
    materialStatusReason: materialState?.materialStatusReason ?? "未能取得物料状态，请刷新后重试。",
    canDelete: deleteState?.canDelete ?? false,
    deleteBlockReason: deleteState?.deleteBlockReason ?? "未能取得删除条件，请刷新后重试。",
});

export const productionMaterialLines = (planQty: number, materials: any[], executionMaterials: readonly Pick<ExecutionMaterial, "productId" | "lossQty">[] = []) => {
    const appliedLosses = new Set<string>();
    return materials.map((material) => {
        const productId = id(material.productId);
        // 同种物料可能在 BOM 中出现多次，累计损耗只计入一行，避免重复增加需求。
        const lossQty = appliedLosses.has(productId) ? 0 : executionMaterials.find((row) => row.productId === productId)?.lossQty || 0;
        appliedLosses.add(productId);
        return {
            productId, code: text(material.code), name: text(material.name),
            unit: text(material.unit) || "个", source: text(material.source), image: text(material.image),
            unitQty: normalizeStockQuantity(material.unitQty), lossQty,
            requiredQty: normalizeStockQuantity(normalizeStockQuantity(Number(planQty || 0) * Number(material.unitQty || 0)) + lossQty),
            sort: Number(material.sort || 0),
        };
    }).sort((left, right) => left.sort - right.sort || left.code.localeCompare(right.code));
};
