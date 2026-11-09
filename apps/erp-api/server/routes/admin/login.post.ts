import crypto from "crypto"

import { useAdminModel } from "~~/server/models/admin.model"
import { signAdminToken } from "~~/server/services/adminToken"
import { logger } from "~~/server/utils/logger"
import { getCurrentDepartments } from "~~/server/services/department"

export default defineEventHandler(async (event) => {
    try {
        const {
            username,
            password
        } = await readBody(event)

        const admin = useAdminModel()

        let existingUser = await admin.login(username)

        if (!existingUser) {
            const ip = getRequestIP(event)
            logger.warn(`Login attempt with non-existent username: ${username} from IP: ${ip}`)
            setResponseStatus(event, 611)
            return {
                code: CODE.ADMIN_NOT_FOUND,
                msg: codeToMsg[CODE.ADMIN_NOT_FOUND]
            }
        }

        // 加密输入的密码进行比对
        const hashedPassword = crypto.createHash('sha256').update(password).digest('hex')

        if (existingUser.password != hashedPassword) {
            const ip = getRequestIP(event)
            logger.warn(`Login attempt with wrong password for username: ${username} from IP: ${ip}`)
            setResponseStatus(event, 612)
            return {
                code: CODE.WRONG_PASSWORD,
                msg: codeToMsg[CODE.WRONG_PASSWORD]
            }
        }

        let token;
        try {
            token = signAdminToken(existingUser)
        } catch (err) {
            logger.error(`JWT token generation failed for username: ${username}`, err as Error)
            setResponseStatus(event, 610)
            return {
                code: CODE.ERROR_GEN_TOKEN,
                msg: codeToMsg[CODE.ERROR_GEN_TOKEN]
            }
        }

        const departments = await getCurrentDepartments([existingUser])
        const ip = getRequestIP(event)
        logger.info(`Successful login for username: ${username} from IP: ${ip}`)

        setResponseHeader(event, "token", token)
        setResponseStatus(event, 200)

        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                token,
                user: {
                    username: existingUser.username,
                    nickname: existingUser.nickname,
                    role: existingUser.role,
                    ...departments.get(String(existingUser._id)),
                    canAuditSalesOrder: Boolean(existingUser.canAuditSalesOrder),
                    canAuditSalesReceipt: Boolean(existingUser.canAuditSalesReceipt),
                    canAuditBorrowRequest: Boolean(existingUser.canAuditBorrowRequest)
                }
            }
        }
    } catch (err: any) {
        logger.error('Admin Login Error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }
})
