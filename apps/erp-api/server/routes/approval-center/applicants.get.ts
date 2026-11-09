import { useAdminModel } from "~~/server/models/admin.model";
import { CODE, codeToMsg } from "~~/server/utils/code";
import { logger } from "~~/server/utils/logger";
import type { ApprovalUser } from "~~/shared/types/approval";
import { ADMIN_ROLE } from "~~/shared/enums";

export default defineEventHandler(async (event) => {
    try {
        const currentAuth = event.context.auth;
        const currentAdmin = await useAdminModel().findAdminByUsername(String(currentAuth?.username || ""));
        const admins = Number(currentAdmin?.role) === ADMIN_ROLE.ORDINARY_USER
            ? (currentAdmin ? [currentAdmin] : [])
            : await useAdminModel().retrieveAdminList();
        const applicants = admins
            .map((admin): ApprovalUser => ({
                adminId: admin._id.toString(),
                username: admin.username,
                name: admin.nickname || admin.username,
                role: Number(admin.role),
            }))
            .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: { applicants },
        };
    } catch (error) {
        logger.error("Retrieve approval applicants error", error as Error);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
            data: null,
        };
    }
});
