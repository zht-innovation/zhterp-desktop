import type {
    InventoryStockDetail,
    InventoryStockRestriction,
    InventoryStockRestrictionReason,
} from "~~/shared/types/inventory";
import { toText } from "~~/server/services/inventory";
import { normalizeStockQuantity } from "~~/server/services/inventoryStockMath";

type StockRestrictionReservation = {
    salesOrderId?: unknown;
    warehouseId?: unknown;
    locationId?: unknown;
    reservationType?: string;
    reservedQuantity?: number;
    consumedQuantity?: number;
    releasedQuantity?: number;
};

const positionKey = (warehouseId: unknown, locationId: unknown) =>
    `${toText(warehouseId)}:${toText(locationId)}`;

export const buildInventoryStockRestrictions = (
    details: InventoryStockDetail[],
    reservations: StockRestrictionReservation[],
    visibleOrderNumbers: Map<string, string>,
): InventoryStockRestriction[] => {
    const reservationsByPosition = new Map<string, StockRestrictionReservation[]>();
    for (const reservation of reservations) {
        const key = positionKey(reservation.warehouseId, reservation.locationId);
        const rows = reservationsByPosition.get(key) || [];
        rows.push(reservation);
        reservationsByPosition.set(key, rows);
    }

    const list: InventoryStockRestriction[] = [];
    for (const detail of details) {
        const unavailableQuantity = normalizeStockQuantity(detail.unavailableQuantity);
        if (unavailableQuantity <= 0) continue;

        const stockId = toText(detail._id);
        const warehouseDisplayName = detail.warehouseDisplayName || "--";
        const addRestriction = (
            reason: InventoryStockRestrictionReason,
            quantity: number,
        ) => {
            list.push({
                id: `${stockId}:${reason}`,
                stockId,
                reason,
                quantity: normalizeStockQuantity(quantity),
                warehouseDisplayName,
            });
        };

        // 不计入可用的仓库，全部库存只计一次，不再叠加订单占用。
        if (detail.includeInAvailable === false) {
            addRestriction("warehouse-excluded", unavailableQuantity);
            continue;
        }

        const positionReservations = reservationsByPosition.get(
            positionKey(detail.warehouseId, detail.locationId),
        ) || [];
        const orderRestrictions = new Map<string, InventoryStockRestriction>();
        let reservedQuantity = 0;
        for (const reservation of positionReservations) {
            const remainingQuantity = normalizeStockQuantity(Math.max(
                Number(reservation.reservedQuantity || 0)
                    - Number(reservation.consumedQuantity || 0)
                    - Number(reservation.releasedQuantity || 0),
                0,
            ));
            if (remainingQuantity <= 0) continue;
            reservedQuantity = normalizeStockQuantity(reservedQuantity + remainingQuantity);

            const salesOrderId = toText(reservation.salesOrderId);
            const salesOrderNo = visibleOrderNumbers.get(salesOrderId);
            let reason: InventoryStockRestrictionReason = "other-order";
            if (salesOrderNo) {
                if (reservation.reservationType === "production-material") {
                    reason = "order-production-material";
                } else {
                    reason = "order-finished-product";
                }
            }
            // 无权查看的订单合并为一行，行 ID 也不能泄露订单或预占记录 ID。
            const key = salesOrderNo ? `${reason}:${salesOrderId}` : reason;
            const current = orderRestrictions.get(key);
            if (current) {
                current.quantity = normalizeStockQuantity(current.quantity + remainingQuantity);
            } else {
                const row: InventoryStockRestriction = {
                    id: `${stockId}:${key}`,
                    stockId,
                    reason,
                    quantity: remainingQuantity,
                    warehouseDisplayName,
                };
                if (salesOrderNo) row.salesOrderNo = salesOrderNo;
                orderRestrictions.set(key, row);
            }
        }

        if (reservedQuantity > unavailableQuantity) {
            addRestriction("inconsistent-lock", unavailableQuantity);
            continue;
        }
        list.push(...orderRestrictions.values());
        if (reservedQuantity < unavailableQuantity) {
            addRestriction("other-lock", unavailableQuantity - reservedQuantity);
        }
    }

    list.sort((left, right) =>
        left.warehouseDisplayName.localeCompare(right.warehouseDisplayName, "zh-CN")
        || left.stockId.localeCompare(right.stockId)
        || left.reason.localeCompare(right.reason)
        || (left.salesOrderNo || "").localeCompare(right.salesOrderNo || "")
        || left.id.localeCompare(right.id),
    );
    return list;
};
