import type { ExecutionPurchaseOrderReceipt } from "~~/shared/types/production-execution";
import { normalizeStockQuantity as qty } from "./inventoryStockMath";

const text = (value: any) => String(value?.toString?.() || value || "").trim();
const validQuantity = (value: unknown) => (typeof value === "number" || (typeof value === "string" && value.trim() !== ""))
    && Number.isFinite(Number(value)) && Number(value) >= 0;

export const getPurchaseOrderReceipt = (
    purchase: any,
    receipts: Array<{ productId: any; quantity: any }>,
): { summary: ExecutionPurchaseOrderReceipt; blockReason: string; sourceBlockReason: string } => {
    const orderNo = text(purchase?.orderNo) || text(purchase?._id || purchase?.id) || "未知采购单";
    const summary: ExecutionPurchaseOrderReceipt = {
        id: text(purchase?._id || purchase?.id), orderNo,
        inboundReceived: 0, inboundTotal: validQuantity(purchase?.totalQuantity) ? qty(purchase.totalQuantity) : 0,
        receiptComplete: false,
    };
    const invalidSource = (reason: string) => ({ summary, blockReason: reason, sourceBlockReason: reason });
    if (!purchase || purchase._isDeleted === true) return invalidSource(`采购单 ${orderNo} 不存在或已删除，请先核对。`);
    if (!validQuantity(purchase.totalQuantity) || summary.inboundTotal <= 0) {
        return invalidSource(`采购单 ${orderNo} 的采购总数无效，请先核对。`);
    }
    if (!Array.isArray(purchase.items) || !purchase.items.length) {
        return invalidSource(`采购单 ${orderNo} 缺少产品明细，请先核对。`);
    }
    const requiredByProduct = new Map<string, { quantity: number; label: string; unit: string }>();
    for (const item of purchase.items) {
        const productId = text(item?.productId);
        if (!productId || !validQuantity(item?.quantity)) {
            return invalidSource(`采购单 ${orderNo} 的产品或采购数量无效，请先核对。`);
        }
        const previous = requiredByProduct.get(productId);
        const quantity = Number(item.quantity) + (previous?.quantity || 0);
        if (!Number.isFinite(quantity)) return invalidSource(`采购单 ${orderNo} 的产品采购数量异常，请先核对。`);
        requiredByProduct.set(productId, {
            quantity: qty(quantity),
            label: previous?.label || text(item.productCode || item.productName || item.productModel || productId).slice(0, 40),
            unit: previous?.unit || text(item.unitName) || "个",
        });
    }
    if (!Array.isArray(receipts)) return invalidSource(`采购单 ${orderNo} 的实际入库记录无效，请先核对。`);
    const receivedByProduct = new Map<string, number>();
    for (const receipt of receipts) {
        const productId = text(receipt?.productId);
        if (!productId || !requiredByProduct.has(productId) || !validQuantity(receipt?.quantity)) {
            return invalidSource(`采购单 ${orderNo} 的实际入库产品或数量异常，请先核对。`);
        }
        const quantity = Number(receipt.quantity);
        const receivedQuantity = (receivedByProduct.get(productId) || 0) + quantity;
        const totalReceived = summary.inboundReceived + quantity;
        if (!Number.isFinite(receivedQuantity) || !Number.isFinite(totalReceived)) {
            return invalidSource(`采购单 ${orderNo} 的实际入库数量异常，请先核对。`);
        }
        receivedByProduct.set(productId, qty(receivedQuantity));
        summary.inboundReceived = qty(totalReceived);
    }
    for (const [productId, item] of requiredByProduct) {
        const missing = qty(item.quantity - (receivedByProduct.get(productId) || 0));
        if (missing > 0) {
            return { summary, blockReason: `采购单 ${orderNo} 的 ${item.label} 尚缺 ${missing} ${item.unit} 入库。`, sourceBlockReason: "" };
        }
    }
    if (summary.inboundReceived < summary.inboundTotal) {
        return { summary, blockReason: `采购单 ${orderNo} 入库总数尚缺 ${qty(summary.inboundTotal - summary.inboundReceived)}（${summary.inboundReceived} / ${summary.inboundTotal}）。`, sourceBlockReason: "" };
    }
    summary.receiptComplete = true;
    return { summary, blockReason: "", sourceBlockReason: "" };
};
