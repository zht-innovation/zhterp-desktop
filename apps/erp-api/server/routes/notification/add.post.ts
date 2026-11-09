import { addNotificationWithAudience } from "~~/server/services/notificationAudience"

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event)
        await addNotificationWithAudience(body)

        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
        }
    } catch (err: any) {
        logger.logRequestError(event, err, 'Add Notification Error')
        setResponseStatus(event, 500)
        return {
            code: CODE.NOTIFICATION_ADD_FAILED,
            msg: codeToMsg[CODE.NOTIFICATION_ADD_FAILED],
        }
    }
})
