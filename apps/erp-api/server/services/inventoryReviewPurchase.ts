import type { InventoryReviewPurchaseContext } from "~~/shared/types/approval";

export function cloneInventoryReviewPurchaseContext(
    context: InventoryReviewPurchaseContext,
): InventoryReviewPurchaseContext {
    return {
        source: "inventory-review",
        lines: context.lines.map((line) => ({
            productId: line.productId,
            productCode: line.productCode,
            model: line.model,
            unit: line.unit,
            requiredQuantity: line.requiredQuantity,
            actualQuantity: line.actualQuantity,
            availableQuantity: line.availableQuantity,
            lockedQuantity: line.lockedQuantity,
            reservedQuantity: line.reservedQuantity,
            shortageQuantity: line.shortageQuantity,
            differenceReason: line.differenceReason,
            remark: line.remark,
            ...(line.demandType ? { demandType: line.demandType } : {}),
        })),
    };
}
