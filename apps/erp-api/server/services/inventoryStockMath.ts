import { INVENTORY_STOCK_WARNING_STATUS } from "~~/shared/enums";

type InboundStockDeltaInput = {
    totalQuantity?: number;
    availableQuantity?: number;
    unavailableQuantity?: number;
    inboundQuantity: number;
    includeInAvailable: boolean;
};

type StockWarningInput = {
    totalQuantity?: number;
    stockLowerLimit?: number;
    stockUpperLimit?: number;
};

type InboundLockedQuantityInput = {
    inboundType?: string;
    purchaseOrderNo?: string;
    quantity: number;
};

const toSafeNumber = (value: unknown, defaultValue = 0) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : defaultValue;
};

export const normalizeStockQuantity = (value: unknown) =>
    Number(toSafeNumber(value).toFixed(3));

export const getInboundLockedQuantity = (input: InboundLockedQuantityInput) => {
    const quantity = normalizeStockQuantity(input.quantity);

    if (
        input.inboundType === "采购" &&
        String(input.purchaseOrderNo || "").trim() &&
        quantity > 0
    ) {
        return quantity;
    }

    return 0;
};

export const applyInboundStockDelta = (input: InboundStockDeltaInput) => {
    const inboundQuantity = normalizeStockQuantity(input.inboundQuantity);
    const totalQuantity = normalizeStockQuantity(
        toSafeNumber(input.totalQuantity) + inboundQuantity,
    );
    const availableQuantity = normalizeStockQuantity(
        toSafeNumber(input.availableQuantity) + (input.includeInAvailable ? inboundQuantity : 0),
    );
    const unavailableQuantity = normalizeStockQuantity(
        toSafeNumber(input.unavailableQuantity) + (input.includeInAvailable ? 0 : inboundQuantity),
    );

    return {
        totalQuantity,
        availableQuantity,
        unavailableQuantity,
    };
};

export const getStockWarningStatus = (input: StockWarningInput) => {
    const totalQuantity = toSafeNumber(input.totalQuantity);
    const stockLowerLimit = toSafeNumber(input.stockLowerLimit);
    const stockUpperLimit = toSafeNumber(input.stockUpperLimit);

    if (stockLowerLimit > 0 && totalQuantity < stockLowerLimit) {
        return INVENTORY_STOCK_WARNING_STATUS.LOW;
    }

    if (stockUpperLimit > 0 && totalQuantity > stockUpperLimit) {
        return INVENTORY_STOCK_WARNING_STATUS.HIGH;
    }

    return INVENTORY_STOCK_WARNING_STATUS.NORMAL;
};
