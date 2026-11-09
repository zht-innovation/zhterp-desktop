const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

const toSafeAmount = (cents: bigint): number | null => {
    if (cents > MAX_SAFE_CENTS) return null;
    const amount = Number(cents) / 100;
    const expected = `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
    // 安全整数的分除以 100 后也可能丢失一分钱，必须保证展示和再次汇总均可还原。
    if (amount.toFixed(2) !== expected || Math.round(amount * 100) !== Number(cents)) return null;
    return amount;
};

const toPurchaseNumber = (value: unknown): number => {
    if (typeof value !== "number" && typeof value !== "string") return NaN;
    if (typeof value === "string" && !value.trim()) return NaN;
    return Number(value);
};

export const getPurchaseUnitPriceError = (value: unknown): string => {
    const price = toPurchaseNumber(value);
    if (!Number.isFinite(price) || price <= 0) {
        return "单价必须填写大于0的有效数字";
    }
    if (Number(price.toFixed(3)) !== price) {
        return "单价最多支持3位小数";
    }
    if (!Number.isSafeInteger(Number(price.toFixed(3).replace(".", "")))) {
        return "单价超出可计算范围";
    }
    return "";
};

export const calculatePurchaseItemAmount = (quantity: unknown, unitPrice: unknown): number | null => {
    if (getPurchaseUnitPriceError(unitPrice)) return null;
    const parsedQuantity = toPurchaseNumber(quantity);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return null;
    const scaledQuantity = Number(parsedQuantity.toFixed(3).replace(".", ""));
    const scaledPrice = Number(Number(unitPrice).toFixed(3).replace(".", ""));
    if (!Number.isSafeInteger(scaledQuantity) || scaledQuantity <= 0) return null;

    // 数量、单价均放大 1000 倍；除以 10000 得到分，加半分再整除实现四舍五入。
    const cents = (BigInt(scaledQuantity) * BigInt(scaledPrice) + 5000n) / 10000n;
    return toSafeAmount(cents);
};

export const sumPurchaseItemAmounts = (amounts: readonly number[]): number | null => {
    let totalCents = 0n;
    for (const amount of amounts) {
        const cents = Math.round(amount * 100);
        if (!Number.isFinite(amount) || amount < 0 || !Number.isSafeInteger(cents)) return null;
        if (toSafeAmount(BigInt(cents)) !== amount) return null;
        totalCents += BigInt(cents);
        if (totalCents > MAX_SAFE_CENTS) return null;
    }
    return toSafeAmount(totalCents);
};
