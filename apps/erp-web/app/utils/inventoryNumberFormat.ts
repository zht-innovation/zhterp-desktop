export const formatOneDecimalText = (
    value?: number | string,
    fallback = "--",
) => {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(1) : fallback;
};
