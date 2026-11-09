import { useLogModel } from "~~/server/models/log.model"
import { useSalespersonModel } from "~~/server/models/salesperson.model"
import { useAdminModel } from "~~/server/models/admin.model"
import { logger } from "~~/server/utils/logger"
import mongoose from 'mongoose'

export default defineEventHandler(async (event) => {
    try {
        const auth = event.context.auth

        let salespersonId: string | null = null
        
        if (auth.role == 3) {
            const salespersonModel = useSalespersonModel()
            const adminModel = useAdminModel()
            const admin = await adminModel.login(auth.username)
            const adminId = admin?._id

            let salesperson = null
            if (adminId) {
                salesperson = await salespersonModel.salesperson.findOne({
                    linkAdminId: adminId,
                    _isFakeDel: { $ne: true }
                }).select('_id')
            }

            if (!salesperson) {
                salesperson = await salespersonModel.salesperson.findOne({
                    _isFakeDel: { $ne: true },
                    $or: [
                        { name: auth.username },
                        { nameCn: auth.username }
                    ]
                }).select('_id')
            }
            
            if (!salesperson) {
                logger.warn(`Salesperson not found for username: ${auth.username}`)
                setResponseStatus(event, 404)
                return {
                    code: CODE.SERVER_ERROR,
                    msg: '销售人员信息不存在'
                }
            }
            
            salespersonId = salesperson._id.toString()
            logger.info(`Salesperson ID for ${auth.username}: ${salespersonId}`)
        }

        const logModel = useLogModel()
        const logs = await logModel.retrieveLogList(salespersonId, auth.role)

        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                logs
            }
        }

    } catch (err: any) {
        logger.error('Retrieve logs error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }
})
