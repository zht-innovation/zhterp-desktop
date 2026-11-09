import type { FinanceStandardPriceSyncSettingsPayload } from "~~/shared/types/finance";

type StandardPriceSyncSchedule = Pick<
    FinanceStandardPriceSyncSettingsPayload,
    "frequency" | "time" | "weekDay" | "monthDay"
>;

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

const validInteger = (value: unknown, minimum: number, maximum: number): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;

export const normalizeStandardPriceSyncSettingsPayload = (
    value: unknown,
): FinanceStandardPriceSyncSettingsPayload | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const payload = value as Record<string, unknown>;
    if (typeof payload.enabled !== "boolean") return null;
    if (payload.frequency !== "daily" && payload.frequency !== "weekly" && payload.frequency !== "monthly") return null;
    if (typeof payload.time !== "string" || payload.time.length !== 5 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(payload.time)) return null;
    if (!validInteger(payload.version, 0, Number.MAX_SAFE_INTEGER)) return null;

    const weekDay = payload.weekDay === undefined ? 1 : payload.weekDay;
    const monthDay = payload.monthDay === undefined ? 1 : payload.monthDay;
    if (payload.enabled && payload.frequency === "weekly" && !validInteger(weekDay, 1, 7)) return null;
    if (payload.enabled && payload.frequency === "monthly" && !validInteger(monthDay, 1, 31)) return null;

    return {
        enabled: payload.enabled,
        frequency: payload.frequency,
        time: payload.time,
        weekDay: validInteger(weekDay, 1, 7) ? weekDay : 1,
        monthDay: validInteger(monthDay, 1, 31) ? monthDay : 1,
        version: payload.version,
    };
};

// 使用 UTC 方法表示北京时间的日历日期，避免依赖进程所在时区；支持月份和日期自然进位。
const getCalendarTime = (year: number, month: number, day: number, hour: number, minute: number): number => {
    const date = new Date(0);
    date.setUTCFullYear(year, month, day);
    date.setUTCHours(hour, minute, 0, 0);
    return date.getTime();
};

export const getNextStandardPriceSyncAt = (
    schedule: StandardPriceSyncSchedule,
    after: Date,
): Date | null => {
    if (!schedule || !(after instanceof Date) || !Number.isFinite(after.getTime())) return null;
    const normalized = normalizeStandardPriceSyncSettingsPayload({ ...schedule, enabled: true, version: 0 });
    if (!normalized) return null;

    const afterTime = after.getTime();
    const localDate = new Date(afterTime + SHANGHAI_OFFSET_MS);
    if (!Number.isFinite(localDate.getTime())) return null;
    const year = localDate.getUTCFullYear();
    const month = localDate.getUTCMonth();
    const day = localDate.getUTCDate();
    const [hourText = "0", minuteText = "0"] = normalized.time.split(":");
    const hour = Number(hourText);
    const minute = Number(minuteText);
    let nextTime: number;

    if (normalized.frequency === "daily") {
        nextTime = getCalendarTime(year, month, day, hour, minute) - SHANGHAI_OFFSET_MS;
        if (nextTime <= afterTime) {
            nextTime = getCalendarTime(year, month, day + 1, hour, minute) - SHANGHAI_OFFSET_MS;
        }
    } else if (normalized.frequency === "weekly") {
        const currentWeekDay = localDate.getUTCDay() || 7;
        let daysAhead = (normalized.weekDay - currentWeekDay + 7) % 7;
        nextTime = getCalendarTime(year, month, day + daysAhead, hour, minute) - SHANGHAI_OFFSET_MS;
        if (nextTime <= afterTime) {
            daysAhead += 7;
            nextTime = getCalendarTime(year, month, day + daysAhead, hour, minute) - SHANGHAI_OFFSET_MS;
        }
    } else {
        const monthCandidate = (candidateMonth: number): number => {
            const lastDay = new Date(getCalendarTime(year, candidateMonth + 1, 0, 0, 0)).getUTCDate();
            const candidateDay = Math.min(normalized.monthDay, lastDay);
            return getCalendarTime(year, candidateMonth, candidateDay, hour, minute) - SHANGHAI_OFFSET_MS;
        };
        nextTime = monthCandidate(month);
        if (nextTime <= afterTime) nextTime = monthCandidate(month + 1);
    }

    const next = new Date(nextTime);
    return Number.isFinite(next.getTime()) && next.getTime() > afterTime ? next : null;
};
