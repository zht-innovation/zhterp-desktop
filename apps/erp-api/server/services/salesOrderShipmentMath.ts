import { normalizeStockQuantity } from "./inventoryStockMath";

const id = (value: any) => String(value?.toString?.() || value || "");

export const groupSalesOrderShipmentItems = (items: any[]) => {
    const grouped = new Map<string, { productId: any; warehouseId: any; locationId: any; quantity: number }>();
    for (const item of items) {
        const quantity = normalizeStockQuantity(item.quantity);
        if (!Number.isFinite(Number(item.quantity)) || quantity <= 0) throw new Error("出库数量必须大于0");
        const key = `${id(item.productId)}:${id(item.warehouseId)}:${id(item.locationId)}`;
        const current = grouped.get(key);
        if (current) {
            current.quantity = normalizeStockQuantity(current.quantity + quantity);
        } else {
            grouped.set(key, { productId: item.productId, warehouseId: item.warehouseId || null,
                locationId: item.locationId || null, quantity });
        }
    }
    return [...grouped.values()];
};

export const salesOrderShipmentStatus = (demand: Map<string, number>, shipped: Map<string, number>) => {
    if (!demand.size) return "待出库";
    for (const [productId, required] of demand) {
        if ((shipped.get(productId) || 0) < required) return "待出库";
    }
    return "已出库";
};
