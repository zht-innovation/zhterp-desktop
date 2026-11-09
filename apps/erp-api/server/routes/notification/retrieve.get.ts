import { useNotificationModel } from "~~/server/models/notification.model"
import { getNotificationAdmin } from "~~/server/services/notificationAdmin"
import { ADMIN_ROLE } from "~~/shared/enums"

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const type = (query.type as string) || 'notification'
    const page = Number(query.page) || 1
    const pageSize = Number(query.pageSize) || 20
    const keyword = (query.keyword as string) || ''

    const admin = await getNotificationAdmin(event)
    const model = useNotificationModel()
    const role = Number(admin.role)
    const result = await model.retrieveByType(type, admin._id.toString(), page, pageSize, keyword, role, role === ADMIN_ROLE.ORDINARY_USER)

    setResponseStatus(event, 200)
    return {
        code: CODE.SUCCESS,
        msg: codeToMsg[CODE.SUCCESS],
        data: result,
    }
})
