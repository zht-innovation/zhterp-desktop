import { useAdminModel } from "~~/server/models/admin.model"
import { logger } from "~~/server/utils/logger"
import { canManageApprovalFlow } from "~~/shared/utils/adminPermission"
import { getCurrentDepartments } from "~~/server/services/department"

export default defineEventHandler(async (event) => {
    try {
        const username = String(event.context?.auth?.username || "").trim()
        if (!username) {
            setResponseStatus(event, 401)
            return {
                code: 401,
                msg: "权限不足",
                data: null,
            }
        }

        const admin = await useAdminModel().findAdminByUsername(username)
        if (!admin) {
            setResponseStatus(event, 404)
            return {
                code: CODE.ADMIN_NOT_FOUND,
                msg: codeToMsg[CODE.ADMIN_NOT_FOUND],
                data: null,
            }
        }

        const departments = await getCurrentDepartments([admin])
        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                user: {
                    username: admin.username,
                    nickname: admin.nickname,
                    role: admin.role,
                    ...departments.get(String(admin._id)),
                    canManageApprovalFlow: canManageApprovalFlow(
                        Number(admin.role),
                        admin.canManageApprovalFlow,
                    ),
                    canAuditSalesOrder: Boolean(admin.canAuditSalesOrder),
                    canAuditSalesReceipt: Boolean(admin.canAuditSalesReceipt),
                    canAuditBorrowRequest: Boolean(admin.canAuditBorrowRequest),
                },
            },
        }
    } catch (err: any) {
        logger.error("Retrieve admin profile error", err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
            data: null,
        }
    }
})
