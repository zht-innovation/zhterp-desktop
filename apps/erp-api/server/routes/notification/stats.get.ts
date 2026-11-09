import { useNotificationModel } from "~~/server/models/notification.model"
import { getNotificationAdmin } from "~~/server/services/notificationAdmin"
import { ADMIN_ROLE } from "~~/shared/enums"

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const type = (query.type as string) || 'notification'

    const admin = await getNotificationAdmin(event)
    const model = useNotificationModel()
    const role = Number(admin.role)
    const stats = await model.getStats(type, admin._id.toString(), role, role === ADMIN_ROLE.ORDINARY_USER)

    setResponseStatus(event, 200)
    return {
        code: CODE.SUCCESS,
        msg: codeToMsg[CODE.SUCCESS],
        data: stats,
    }
})
