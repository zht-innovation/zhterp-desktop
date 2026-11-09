// 撤销申请接口，提交申请_id

import { ApplicationReq, useApplicationModel } from "~~/server/models/application.model"
import { logger } from "~~/server/utils/logger"

export default defineEventHandler(async (event) => {
    try {
        const {
            _id
        } = await readBody(event)

        const application = useApplicationModel()


        try {
            await application.revoke(_id)
        } catch (e: any) {
            setResponseStatus(event, 500)
            return {
                code: CODE.SERVER_ERROR,
                msg: codeToMsg[CODE.SERVER_ERROR]
            }
        }

        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
        }
    } catch (err: any) {
        logger.error('Revoke Application Error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }
})