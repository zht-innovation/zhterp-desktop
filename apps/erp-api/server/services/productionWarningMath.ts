const dayMilliseconds = 86_400_000;
export const productionWarningStatuses = ["待发料", "待生产", "生产中"];

export const productionWarningDays = (value: unknown): 3 | 5 => value === 5 ? 5 : 3;

// 计划完成日按 UTC 零点保存；今天取北京时间日历日，再转为相同日期口径。
export const productionWarningToday = (now = new Date()) => {
    const date = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return new Date(`${date}T00:00:00.000Z`);
};

export const productionWarningKey = (dueDate: Date | string, days: unknown) =>
    `${new Date(dueDate).toISOString().slice(0, 10)}:${productionWarningDays(days)}`;

export const productionWarningDue = (row: { status: string; planFinish: Date | string; warningDays?: unknown }, now = new Date()) => {
    if (!productionWarningStatuses.includes(row.status) || !row.planFinish) return false;
    const dueDate = new Date(row.planFinish);
    if (Number.isNaN(dueDate.getTime())) return false;
    const remainingDays = (dueDate.getTime() - productionWarningToday(now).getTime()) / dayMilliseconds;
    return remainingDays <= productionWarningDays(row.warningDays);
};
