import { useAdminModel } from "~~/server/models/admin.model";
import { useNotificationModel, type NotificationReq } from "~~/server/models/notification.model";
import { getNotificationCategoryRole } from "~~/server/utils/notificationVisibility";

export const resolveNotificationRecipients = async (category: string) => {
    const role = getNotificationCategoryRole(category);
    if (role === undefined) return undefined;

    const admins = await useAdminModel().findAdminsByRole(role);
    return admins.map((admin: any) => String(admin._id));
};

export const addNotificationWithAudience = async (data: NotificationReq) => {
    const recipientAdminIds = await resolveNotificationRecipients(data.category);
    const notification = recipientAdminIds === undefined
        ? data
        : { ...data, recipientAdminIds };

    await useNotificationModel().add(notification);
};

export const upsertNotificationWithAudience = async (
    data: NotificationReq & { sourceKey: string },
) => {
    const recipientAdminIds = await resolveNotificationRecipients(data.category);
    const notification = recipientAdminIds === undefined
        ? data
        : { ...data, recipientAdminIds };

    return await useNotificationModel().upsertBySourceKey(notification);
};
