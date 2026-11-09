import { useNotificationModel } from "~~/server/models/notification.model"

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const id = body.id

    const model = useNotificationModel()
    await model.fakeDelete(id)

    setResponseStatus(event, 200)
    return {
        code: CODE.SUCCESS,
        msg: codeToMsg[CODE.SUCCESS],
    }
})
