import { ApplicationReq, useApplicationModel } from "~~/server/models/application.model"
import { logger } from "~~/server/utils/logger"

export default defineEventHandler(async (event) => {
    try {
        const {
            appCustomerId,
            appSalespersonId,
            appDays
        } = await readBody(event)

        const apply: ApplicationReq = {
            appCustomerId,
            appSalespersonId,
            appDays
        }

        const application = useApplicationModel()
        const auth = event.context.auth


        try {
            await application.add(apply, {
                name: auth?.nickname || auth?.username || '销售',
                role: Number(auth?.role ?? 3),
                salesId: appSalespersonId,
            })
        } catch (e: any) {
            logger.error(`Apply failed for appCustomerId: ${appCustomerId}, appSalespersonId: ${appSalespersonId}`, e)
            setResponseStatus(event, 618)
            return {
                code: CODE.ERROR_ADD_APPLICATION,
                msg: codeToMsg[CODE.ERROR_ADD_APPLICATION]
            }
        }

        logger.info(`Successful apply`)
        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS]
        }

    } catch (err: any) {
        logger.error('Apply Error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }
})
