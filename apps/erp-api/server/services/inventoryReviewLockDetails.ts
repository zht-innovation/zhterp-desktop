import type { InventoryStockDetail } from "~~/shared/types/inventory";
import type { InventoryReviewDemandLine, InventoryReviewLockDetails } from "~~/shared/types/inventoryReview";
import { buildInventoryStockRestrictions } from "./inventoryStockRestrictions";
import { getVisibleInventoryOrderNumbers } from "./inventoryStockOrderAccess";
import type { InventoryReviewLockSnapshot } from "./inventoryReviewLocks";

export async function buildInventoryReviewLockDetails(
    auth: any,
    line: InventoryReviewDemandLine,
    snapshot?: InventoryReviewLockSnapshot,
): Promise<InventoryReviewLockDetails> {
    const result: InventoryReviewLockDetails = {
        productId: line.productId,
        productCode: line.productCode,
        model: line.model,
        unitName: line.unit,
        lockedQuantity: line.lockedQuantity,
        snapshotAvailable: false,
        list: [],
    };
    const product = snapshot?.products?.find((item) => item.productId === line.productId);
    if (!product || !Array.isArray(product.positions) || !Array.isArray(product.reservations)) return result;

    const visibleOrderNumbers = await getVisibleInventoryOrderNumbers(
        auth,
        product.reservations.map((reservation) => reservation.salesOrderId),
    );
    const snapshotOrderNumbers = new Map<string, string>();
    for (const reservation of product.reservations) {
        if (visibleOrderNumbers.has(reservation.salesOrderId) && reservation.salesOrderNo) {
            snapshotOrderNumbers.set(reservation.salesOrderId, reservation.salesOrderNo);
        }
    }
    // 本弹窗只拆分冻结的锁定数量，不把未计可用仓库的全部库存加入锁定合计。
    const positions: InventoryStockDetail[] = product.positions.map((position) => ({
        _id: position.stockId,
        warehouseId: position.warehouseId,
        locationId: position.locationId,
        warehouseDisplayName: position.warehouseDisplayName,
        quantity: position.lockedQuantity,
        totalQuantity: position.lockedQuantity,
        availableQuantity: 0,
        unavailableQuantity: position.lockedQuantity,
        lockedQuantity: position.lockedQuantity,
        includeInAvailable: true,
    }));
    const reservations = product.reservations.map((reservation) => ({
        salesOrderId: reservation.salesOrderId,
        warehouseId: reservation.warehouseId,
        locationId: reservation.locationId,
        reservationType: reservation.reservationType,
        reservedQuantity: reservation.quantity,
    }));
    return {
        ...result,
        capturedAt: snapshot?.capturedAt,
        snapshotAvailable: true,
        list: buildInventoryStockRestrictions(positions, reservations, snapshotOrderNumbers),
    };
}
