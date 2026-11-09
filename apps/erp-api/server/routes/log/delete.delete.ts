// 根据id将日志放入回收站
import { logger } from "~~/server/utils/logger"
import { useLogModel } from "~~/server/models/log.model"

export default defineEventHandler(async (event) => {
    const logModel = useLogModel()
    const body = await readBody(event)
    const id = body.id


    await logModel.delete(id)

    setResponseStatus(event, 200)
    return {
        code: CODE.SUCCESS,
        msg: codeToMsg[CODE.SUCCESS]
    }
})