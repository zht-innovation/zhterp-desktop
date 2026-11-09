export const APPROVED_SALES_ORDER_STATUSES = [
    "待仓库复核",
    "待采购",
    "待生产",
    "生产中",
    "待出库",
    "已出库",
] as const;

export type SalesOrderApprovalResult = "pending" | "rejected" | "approved" | "all";

const SALES_ORDER_APPROVAL_RESULTS = new Set<SalesOrderApprovalResult>([
    "pending",
    "rejected",
    "approved",
    "all",
]);

export const parseSalesOrderApprovalResult = (value: unknown): SalesOrderApprovalResult | null => {
    const text = String(value ?? "").trim();
    if (!text) return "pending";
    return SALES_ORDER_APPROVAL_RESULTS.has(text as SalesOrderApprovalResult)
        ? text as SalesOrderApprovalResult
        : null;
};

const buildAuditorRelationFilter = (auditorId: unknown) => ({
    $or: [
        { "auditRecords.adminId": auditorId },
        { "auditHistory.records.adminId": auditorId },
    ],
});

const buildPendingApprovalFilter = (auditorId: unknown) => ({
    status: "待审核",
    _isDeleted: { $ne: true },
    auditRecords: {
        $elemMatch: {
            adminId: auditorId,
            approved: { $ne: true },
            rejected: { $ne: true },
        },
    },
    $expr: {
        $let: {
            vars: {
                targetRecord: {
                    $first: {
                        $filter: {
                            input: "$auditRecords",
                            as: "record",
                            cond: { $eq: ["$$record.adminId", auditorId] },
                        },
                    },
                },
                pendingNonFinalCount: {
                    $size: {
                        $filter: {
                            input: "$auditRecords",
                            as: "record",
                            cond: {
                                $and: [
                                    { $ne: ["$$record.isFinalAuditor", true] },
                                    { $ne: ["$$record.approved", true] },
                                    { $ne: ["$$record.rejected", true] },
                                ],
                            },
                        },
                    },
                },
            },
            in: {
                $or: [
                    { $ne: ["$$targetRecord.isFinalAuditor", true] },
                    { $eq: ["$$pendingNonFinalCount", 0] },
                ],
            },
        },
    },
});

const buildRejectedApprovalFilter = (auditorId: unknown) => ({
    status: "已驳回",
    ...buildAuditorRelationFilter(auditorId),
});

const buildApprovedApprovalFilter = (auditorId: unknown) => ({
    status: { $in: [...APPROVED_SALES_ORDER_STATUSES] },
    ...buildAuditorRelationFilter(auditorId),
});

export const buildSalesOrderApprovalFilter = (
    auditorId: unknown,
    result: SalesOrderApprovalResult,
): Record<string, any> => {
    if (result === "pending") return buildPendingApprovalFilter(auditorId);
    if (result === "rejected") return buildRejectedApprovalFilter(auditorId);
    if (result === "approved") return buildApprovedApprovalFilter(auditorId);
    return {
        $or: [
            buildPendingApprovalFilter(auditorId),
            buildRejectedApprovalFilter(auditorId),
            buildApprovedApprovalFilter(auditorId),
        ],
    };
};

const cloneDate = (value: unknown) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : new Date(date.getTime());
};

export const cloneSalesOrderAuditRecord = (record: Record<string, any> = {}) => ({
    adminId: record.adminId,
    username: String(record.username || ""),
    nickname: String(record.nickname || ""),
    role: Number.isFinite(Number(record.role)) ? Number(record.role) : 999,
    auditOrder: Number(record.auditOrder || 0),
    isFinalAuditor: Boolean(record.isFinalAuditor),
    approved: Boolean(record.approved),
    approvedAt: cloneDate(record.approvedAt),
    rejected: Boolean(record.rejected),
    rejectedById: record.rejectedById || null,
    rejectedByName: String(record.rejectedByName || ""),
    rejectedAt: cloneDate(record.rejectedAt),
    rejectReason: String(record.rejectReason || ""),
});

export const markSalesOrderAuditRecordRejected = (
    records: Array<Record<string, any>>,
    auditorId: unknown,
    rejection: {
        rejectedById: unknown;
        rejectedByName: string;
        rejectedAt: Date;
        rejectReason: string;
    },
) => {
    const targetId = String(auditorId ?? "");
    const target = records.find((record) => String(record.adminId ?? "") === targetId);
    if (!target) return null;

    target.rejected = true;
    target.rejectedById = rejection.rejectedById;
    target.rejectedByName = rejection.rejectedByName;
    target.rejectedAt = rejection.rejectedAt;
    target.rejectReason = rejection.rejectReason;
    return target;
};

export const createAuditHistoryRound = (
    history: Array<{ roundNo?: number }> = [],
    records: Array<Record<string, any>> = [],
) => ({
    roundNo: Math.max(0, ...history.map((round) => Number(round.roundNo || 0))) + 1,
    records: records.map((record) => cloneSalesOrderAuditRecord(record)),
});
