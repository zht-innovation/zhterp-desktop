import { ADMIN_ROLE } from "~~/shared/enums";
import { useAdminModel } from "~~/server/models/admin.model";
import { useSalespersonModel } from "~~/server/models/salesperson.model";

export type SalesOrderAccess = {
    role: number;
    salespersonId: string | null;
    adminId: string | null;
    username: string;
    nickname: string;
    canAuditSalesOrder: boolean;
    canAuditSalesReceipt: boolean;
};

export const toSalesOrderText = (value: unknown) => {
    if (value == null) return "";
    return String(value).trim();
};

export const isSalesOrderSuperAdmin = (role: unknown) => Number(role) === ADMIN_ROLE.SUPER;

export const getSalesOrderActor = (event: any) =>
    String(event.context?.auth?.nickname || event.context?.auth?.username || "");

export const getSalesOrderAuditorSnapshot = async (auth: any) => {
    const username = toSalesOrderText(auth?.username);
    if (!username) return null;

    const admin = await useAdminModel().findAdminByUsername(username);
    if (!admin || !admin.canAuditSalesOrder) return null;

    return {
        adminId: admin._id?.toString?.() || "",
        username: admin.username || username,
        nickname: admin.nickname || auth?.nickname || username,
        role: Number(admin.role),
        isFinalAuditor: Number(admin.role) === ADMIN_ROLE.SUPER,
    };
};

export const getSalesOrderAuditors = async () => {
    const auditors = await useAdminModel().findSalesOrderAuditors();
    const normalizedAuditors = auditors.map((auditor: any) => ({
        adminId: auditor._id?.toString?.() || "",
        username: auditor.username || "",
        nickname: auditor.nickname || auditor.username || "",
        role: Number(auditor.role),
        isFinalAuditor: Number(auditor.role) === ADMIN_ROLE.SUPER,
    })).filter((auditor) => auditor.adminId);

    return [
        ...normalizedAuditors.filter((auditor) => !auditor.isFinalAuditor),
        ...normalizedAuditors.filter((auditor) => auditor.isFinalAuditor),
    ].map((auditor, index) => ({
        ...auditor,
        auditOrder: index + 1,
    }));
};

export const hasSalesOrderFinalAuditor = (auditors: Array<{ isFinalAuditor?: boolean }> = []) =>
    auditors.some((auditor) => Boolean(auditor.isFinalAuditor));

export const resolveSalespersonId = async (auth: any) => {
    if (!auth?.username) return null;

    const adminModel = useAdminModel();
    const salespersonModel = useSalespersonModel();
    const admin = await adminModel.login(auth.username);
    const adminId = admin?._id;

    let salesperson = null;
    if (adminId) {
        salesperson = await salespersonModel.salesperson
            .findOne({ linkAdminId: adminId, _isFakeDel: { $ne: true } })
            .select("_id");
    }

    if (!salesperson) {
        salesperson = await salespersonModel.salesperson
            .findOne({
                _isFakeDel: { $ne: true },
                $or: [{ name: auth.username }, { nameCn: auth.username }],
            })
            .select("_id");
    }

    return salesperson?._id?.toString?.() || null;
};

export const getSalesOrderAccess = async (auth: any): Promise<SalesOrderAccess> => {
    const admin = auth?.username
        ? await useAdminModel().findAdminByUsername(auth.username)
        : null;
    const adminRole = Number(admin?.role);
    const tokenRole = Number(auth?.role);
    const role = Number.isFinite(adminRole)
        ? adminRole
        : tokenRole;
    const salespersonId = role === ADMIN_ROLE.SELLER
        ? await resolveSalespersonId(auth)
        : null;

    return {
        role: Number.isFinite(role) ? role : ADMIN_ROLE.VENDOR,
        salespersonId,
        adminId: admin?._id?.toString?.() || null,
        username: admin?.username || toSalesOrderText(auth?.username),
        nickname: admin?.nickname || toSalesOrderText(auth?.nickname),
        canAuditSalesOrder: Boolean(admin?.canAuditSalesOrder),
        canAuditSalesReceipt: Boolean(admin?.canAuditSalesReceipt),
    };
};
