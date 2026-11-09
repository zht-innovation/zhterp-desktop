export class ProductionInputError extends Error {
    constructor(public status: number, public businessCode: string, message: string) { super(message); }
}

export const failProductionInput = (status: number, code: string, message: string): never => {
    throw new ProductionInputError(status, code, message);
};
const text = (value: unknown) => String(value ?? "").trim();

export const parseProductionWarningDays = (value: unknown): 3 | 5 => {
    if (value === undefined) return 3;
    if (value !== 3 && value !== 5) failProductionInput(400, "INVALID_WARNING_DAYS", "生产预警仅支持提前 3 天或 5 天");
    return value as 3 | 5;
};

export const dateOnly = (value: unknown) => {
    const input = text(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
    const date = new Date(`${input}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === input ? date : null;
};

export const parseMachineNumbers = (input: unknown) => {
    const tokens = Array.isArray(input) ? input.map(text) : text(input).split(/[\n,，;；]+/).map(text);
    return tokens.filter(Boolean).flatMap((token) => {
        const range = token.match(/^(.*?)(\d+)[-—–~～](.*?)(\d+)$/);
        if (!range || (range[3] && range[3] !== range[1])) return [token];
        const start = Number(range[2]);
        const end = Number(range[4]);
        if (end < start || end - start > 9999) failProductionInput(400, "INVALID_MACHINE_RANGE", "机器号段不合法");
        const width = Math.max(range[2]!.length, range[4]!.length);
        return Array.from({ length: end - start + 1 }, (_, index) => `${range[1]}${String(start + index).padStart(width, "0")}`);
    }).map((number) => number.toUpperCase());
};
