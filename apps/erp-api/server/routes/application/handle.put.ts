// 处理申请接口，提交申请_id以及是否通过申请agreed: Boolean

import { ApplicationReq, useApplicationModel } from "~~/server/models/application.model"
import { logger } from "~~/server/utils/logger"

export default defineEventHandler(async (event) => {
    try {
        const {
            _id,
            agreed
        } = await readBody(event)

        const application = useApplicationModel()
        const auth = event.context.auth
        const actorName = auth?.nickname || auth?.username || '管理员'


        try {
        await application.handle(_id, agreed, {
            name: actorName,
            role: Number(auth?.role ?? 2),
        })
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
        logger.error('Handle Application Error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }
})
