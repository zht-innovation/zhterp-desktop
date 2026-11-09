import { useNotificationModel } from "~~/server/models/notification.model";
import { getNotificationAdmin } from "~~/server/services/notificationAdmin";
import { ADMIN_ROLE } from "~~/shared/enums";

export default defineEventHandler(async (event) => {
    const admin = await getNotificationAdmin(event);
    const role = Number(admin.role);
    const data = await useNotificationModel().getUnreadSummary(admin._id.toString(), role, role === ADMIN_ROLE.ORDINARY_USER);

    setResponseStatus(event, 200);
    return {
        code: CODE.SUCCESS,
        msg: codeToMsg[CODE.SUCCESS],
        data,
    };
});
