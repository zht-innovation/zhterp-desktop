import { normalizeStockQuantity as qty } from "./inventoryStockMath";
import type { ExecutionMaterial, ProductionMaterialState, ProductionMaterialStatus } from "~~/shared/types/production-execution";

type MaterialStateLine = Pick<ExecutionMaterial, "requiredQty" | "issuedQty" | "pendingQty" | "pendingReturnQty" | "availableQty">;

export const getProductionMaterialState = (
    planQty: number,
    materials: readonly MaterialStateLine[],
    incompleteReason = "",
): ProductionMaterialState => {
    if (incompleteReason) {
        return { materialStatus: null, materialStatusReason: incompleteReason };
    }
    if (!Number.isFinite(planQty) || planQty <= 0) {
        return { materialStatus: null, materialStatusReason: "生产计划数量无效，无法判定物料状态。" };
    }
    if (!materials.length) {
        return { materialStatus: null, materialStatusReason: "生产单缺少有效 BOM 快照，无法判定物料状态。" };
    }

    let allIssued = true;
    let hasIssued = false;
    let hasShortage = false;
    for (const material of materials) {
        const quantities = [material.requiredQty, material.issuedQty, material.pendingQty, material.pendingReturnQty, material.availableQty];
        if (quantities.some((quantity) => !Number.isFinite(quantity)) || qty(material.requiredQty) <= 0) {
            return { materialStatus: null, materialStatusReason: "物料需求或执行数量无效，请先核对物料记录。" };
        }
        // issuedQty 已扣除实际退回；待退料不再参与生产，现货覆盖不包含采购在途。
        const issued = qty(Math.max(0, qty(material.issuedQty) - qty(material.pendingReturnQty)));
        const required = qty(material.requiredQty);
        const coverage = qty(issued + Math.max(0, qty(material.pendingQty)) + Math.max(0, qty(material.availableQty)));
        if (issued < required) allIssued = false;
        if (issued > 0) hasIssued = true;
        if (coverage < required) hasShortage = true;
    }

    let materialStatus: ProductionMaterialStatus = "待领料";
    if (allIssued) materialStatus = "已领齐";
    else if (hasShortage) materialStatus = hasIssued ? "缺料·部分领料" : "缺料";
    return { materialStatus, materialStatusReason: "" };
};

export const allocationPending = (allocation: any) => qty(Math.max(0, allocation.quantity - allocation.issued - allocation.cancelled));
export const allocationNetIssued = (allocation: any) => qty(allocation.issued - allocation.returned);
export const requisitionState = (lines: any[]) => {
    let pending = 0;
    let issued = 0;
    let cancelled = 0;
    for (const line of lines) {
        for (const allocation of line.allocations || []) {
            pending += allocationPending(allocation);
            issued += allocation.issued;
            cancelled += allocation.cancelled;
        }
    }
    if (pending > 0) return issued > 0 ? "部分出库" : "待出库";
    if (cancelled > 0) return issued > 0 ? "已关闭" : "已撤销";
    return "已出库";
};

type ConsumedMaterial = { per: number; issuedQty: number; pendingReturnQty: number; lossQty?: number };

export const materialLossLimit = (material: ConsumedMaterial, completedQty: number) => qty(Math.max(0,
    material.issuedQty - material.pendingReturnQty - (material.lossQty || 0) - qty(completedQty * material.per),
));

export const supportedCompletionQuantity = (planQty: number, completedQty: number, materials: ConsumedMaterial[]) => {
    if (!materials.length) return 0;
    let supported = planQty;
    for (const material of materials) {
        if (material.per <= 0) return 0;
        // 物料精度三位，先标准化余额，避免0.3/0.1的浮点误差。
        const materialQty = qty(material.issuedQty - material.pendingReturnQty - (material.lossQty || 0));
        supported = Math.min(supported, Math.floor((materialQty + 0.0000001) / material.per));
    }
    return Math.max(0, supported - completedQty);
};

export const unconsumedReturnLimit = (allocation: any, material: ConsumedMaterial, completedQty: number) => qty(Math.max(0, Math.min(
    allocationNetIssued(allocation) - allocation.pendingReturn,
    materialLossLimit(material, completedQty),
)));
