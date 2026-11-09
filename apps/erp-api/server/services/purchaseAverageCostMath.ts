export interface PurchaseAveragePriceInput {
    stockQuantity: number;
    averagePrice: number;
    standardPriceZero: boolean;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
}

export type PurchaseAverageCostMathEvent = {
    kind: "purchase";
    active: boolean;
    stockQuantity: number;
    standardPriceZero: boolean;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
} | {
    kind: "reset";
    averagePrice: number;
};

interface DecimalValue {
    units: bigint;
    scale: number;
}

const MAX_SAFE_UNITS = BigInt(Number.MAX_SAFE_INTEGER);

const readDecimal = (value: number): DecimalValue | null => {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
        return null;
    }

    const [mantissa = "0", exponentText = "0"] = value.toString().toLowerCase().split("e");
    const decimalPoint = mantissa.indexOf(".");
    const fractionLength = decimalPoint < 0 ? 0 : mantissa.length - decimalPoint - 1;
    let scale = fractionLength - Number(exponentText);
    let units = BigInt(mantissa.replace(".", ""));
    if (scale < 0) {
        units *= 10n ** BigInt(-scale);
        scale = 0;
    }
    return { units, scale };
};

const readScaledInteger = (value: number, scale: number): bigint | null => {
    const decimal = readDecimal(value);
    if (!decimal) return null;

    let units = decimal.units;
    if (decimal.scale > scale) {
        const divisor = 10n ** BigInt(decimal.scale - scale);
        if (units % divisor !== 0n) return null;
        units /= divisor;
    } else {
        units *= 10n ** BigInt(scale - decimal.scale);
    }
    return units <= MAX_SAFE_UNITS ? units : null;
};

const toAveragePrice = (mills: bigint): number | null => {
    if (mills < 0n || mills > MAX_SAFE_UNITS) return null;
    const expected = `${mills / 1000n}.${String(mills % 1000n).padStart(3, "0")}`;
    const price = Number(expected);
    if (!Number.isFinite(price) || price.toFixed(3) !== expected) return null;
    if (readScaledInteger(price, 3) !== mills) return null;
    return price;
};

export const calculatePurchaseAveragePrice = (input: PurchaseAveragePriceInput): number | null => {
    if (!input || typeof input.standardPriceZero !== "boolean") return null;
    const stockQuantity = readScaledInteger(input.stockQuantity, 3);
    const quantity = readScaledInteger(input.quantity, 3);
    const unitPrice = readScaledInteger(input.unitPrice, 3);
    const totalAmount = readScaledInteger(input.totalAmount, 2);
    const averagePrice = readDecimal(input.averagePrice);
    if (stockQuantity === null || quantity === null || quantity <= 0n
        || unitPrice === null || unitPrice <= 0n || totalAmount === null || !averagePrice) {
        return null;
    }
    if (input.standardPriceZero) return toAveragePrice(unitPrice);

    // 旧均价可能有更多小数或科学记数表示；保留原精度，仅在最终均价舍入至千分位。
    const averageScale = 10n ** BigInt(averagePrice.scale);
    const numerator = (stockQuantity * averagePrice.units + totalAmount * 10n * averageScale) * 1000n;
    const denominator = (stockQuantity + quantity) * averageScale;
    const mills = (numerator + denominator / 2n) / denominator;
    return toAveragePrice(mills);
};

export const replayPurchaseAveragePrices = (
    baseline: number,
    events: ReadonlyArray<PurchaseAverageCostMathEvent>,
): number | null => {
    if (!readDecimal(baseline) || !Array.isArray(events)) return null;
    let averagePrice = baseline;
    for (const event of events) {
        if (!event || typeof event !== "object") return null;
        if (event.kind === "reset") {
            if (!readDecimal(event.averagePrice)) return null;
            averagePrice = event.averagePrice;
            continue;
        }
        if (event.kind !== "purchase" || typeof event.active !== "boolean") return null;
        if (!event.active) continue;
        const nextPrice = calculatePurchaseAveragePrice({
            stockQuantity: event.stockQuantity,
            averagePrice,
            standardPriceZero: event.standardPriceZero,
            quantity: event.quantity,
            unitPrice: event.unitPrice,
            totalAmount: event.totalAmount,
        });
        if (nextPrice === null) return null;
        averagePrice = nextPrice;
    }
    return averagePrice;
};
