export type TermActor = {
    name?: string;
    role?: number;
    salesId?: string | null;
};

export type CustomerTermRecord = {
    _id: string;
    customerId?: string;
    type: "apply" | "manual";
    seed?: boolean;
    appId?: string;
    appType?: "new" | "extend";
    status?: "pending" | "approved" | "rejected";
    days?: number | null;
    reqExpire?: string | Date | null;
    oldExpire?: string | Date | null;
    newExpire?: string | Date | null;
    oldSalesId?: string | null;
    oldSalesName?: string;
    newSalesId?: string | null;
    newSalesName?: string;
    createdBy?: TermActor;
    reviewBy?: TermActor | null;
    createdAt?: string | Date;
    reviewedAt?: string | Date | null;
};

export type TermTone = "warning" | "success" | "danger" | "neutral";

export type CustomerTermView = {
    id: string;
    title: string;
    time: string;
    statusText: string;
    statusTone: TermTone;
    current: boolean;
    lines: string[];
};

const toDate = (raw?: string | Date | null) => {
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
};

const pad = (value: number) => String(value).padStart(2, "0");

export const formatTermDate = (raw?: string | Date | null) => {
    const date = toDate(raw);
    if (!date) return "未设置";
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const formatTermTime = (raw?: string | Date | null) => {
    const date = toDate(raw);
    if (!date) return "时间未知";
    return `${formatTermDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const formatTermDays = (days?: number | null) => {
    const value = Number(days);
    if (!Number.isFinite(value) || value <= 0) return "";
    if (value >= 30 && value % 30 === 0) {
        return `${value / 30}个月（${value}天）`;
    }
    return `${value}天`;
};

const sameId = (left?: string | null, right?: string | null) =>
    Boolean(left && right && String(left) === String(right));

const getManualTitle = (record: CustomerTermRecord) => {
    const oldId = record.oldSalesId || null;
    const newId = record.newSalesId || null;
    const hasOldSales = Boolean(oldId || record.oldSalesName);
    const hasNewSales = Boolean(newId || record.newSalesName);
    const sameSales = oldId && newId
        ? sameId(oldId, newId)
        : Boolean(
            record.oldSalesName &&
            record.newSalesName &&
            record.oldSalesName === record.newSalesName
        );

    if (!hasOldSales && hasNewSales) {
        return record.newSalesName
            ? `分配给 ${record.newSalesName}`
            : "分配客户";
    }
    if (hasOldSales && !hasNewSales) return "放回公共客户池";
    if (hasOldSales && hasNewSales && !sameSales) {
        return `${record.oldSalesName || "原销售"} 转交给 ${record.newSalesName || "新销售"}`;
    }
    return "调整维护期限";
};

const getStatus = (status?: CustomerTermRecord["status"]) => {
    if (status === "approved") {
        return { text: "已通过", tone: "success" as const };
    }
    if (status === "rejected") {
        return { text: "已拒绝", tone: "danger" as const };
    }
    if (status === "pending") {
        return { text: "待审批", tone: "warning" as const };
    }
    return { text: "", tone: "neutral" as const };
};

const getTermLine = (
    start?: string | Date | null,
    end?: string | Date | null
) => {
    if (!end) return "";
    return `维护期限：${formatTermDate(start)} → ${formatTermDate(end)}`;
};

export const toTermView = (
    record: CustomerTermRecord,
    currentAppId?: string | null
): CustomerTermView => {
    const current = Boolean(
        currentAppId && record.appId && String(currentAppId) === String(record.appId)
    );

    if (record.type === "apply") {
        const status = getStatus(record.status);
        const typeText = record.appType === "extend" ? "延期申请" : "对接申请";
        const duration = formatTermDays(record.days);
        const expireLine = record.status === "approved"
            ? getTermLine(record.reviewedAt, record.newExpire)
            : record.reqExpire
                ? `申请时期限：${formatTermDate(record.reqExpire)}`
                : "";
        const reviewer = record.reviewBy?.name
            ? `审批人：${record.reviewBy.name}${record.reviewedAt ? ` · ${formatTermTime(record.reviewedAt)}` : ""}`
            : "";

        return {
            id: record._id,
            title: typeText,
            time: formatTermTime(record.createdAt),
            statusText: status.text,
            statusTone: status.tone,
            current,
            lines: [
                record.newSalesName ? `申请销售：${record.newSalesName}` : "",
                duration ? `申请时长：${duration}` : "",
                expireLine,
                reviewer,
            ].filter(Boolean),
        };
    }

    const expireLine = getTermLine(
        record.seed ? null : record.createdAt,
        record.newExpire
    );
    return {
        id: record._id,
        title: getManualTitle(record),
        time: formatTermTime(record.createdAt),
        statusText: "",
        statusTone: "neutral",
        current,
        lines: [
            expireLine,
            !record.seed && record.createdBy?.name
                ? `操作人：${record.createdBy.name}`
                : "",
        ].filter(Boolean),
    };
};
