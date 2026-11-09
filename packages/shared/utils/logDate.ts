export const LOG_DAYS = 7;

const toYmd = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

export const getLogRange = (now = new Date()) => {
    const max = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const min = new Date(max);
    let count = 0;

    while (count < LOG_DAYS) {
        min.setDate(min.getDate() - 1);
        const day = min.getDay();
        if (day !== 0 && day !== 6) count += 1;
    }

    return {
        min: toYmd(min),
        max: toYmd(max),
    };
};

export const inLogRange = (value: string, now = new Date()) => {
    const date = value.slice(0, 10);
    const { min, max } = getLogRange(now);
    return date >= min && date <= max;
};
