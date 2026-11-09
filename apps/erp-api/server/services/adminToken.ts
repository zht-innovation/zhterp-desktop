import jwt from "jsonwebtoken";

export interface AdminTokenSource {
    username: unknown;
    role?: unknown;
    nickname?: unknown;
    canAuditSalesOrder?: unknown;
    canAuditSalesReceipt?: unknown;
    canAuditBorrowRequest?: unknown;
}

export const signAdminToken = (
    admin: AdminTokenSource,
    expiresInSeconds = 7 * 24 * 60 * 60,
) => {
    const baseToken = String(useRuntimeConfig().baseToken || "");
    const username = String(admin.username || "");
    const role = Number(admin.role);
    if (!baseToken) {
        throw new Error("ADMIN_BASE_TOKEN is not configured");
    }
    if (!username || !Number.isInteger(role)) {
        throw new Error("Admin identity is invalid");
    }

    return jwt.sign(
        {
            username,
            role,
            nickname: String(admin.nickname || ""),
            canAuditSalesOrder: Boolean(admin.canAuditSalesOrder),
            canAuditSalesReceipt: Boolean(admin.canAuditSalesReceipt),
            canAuditBorrowRequest: Boolean(admin.canAuditBorrowRequest),
        },
        baseToken,
        { expiresIn: expiresInSeconds },
    );
};
