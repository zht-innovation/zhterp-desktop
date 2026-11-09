import {
    checkAllNotifications,
    checkNotification,
    getNotificationUnreadSummary,
    type NotificationUnreadSummary,
} from "~/composables/api/useNotificationApi";

const emptySummary = (): NotificationUnreadSummary => ({
    announcementUnread: 0,
    notificationUnread: 0,
    totalUnread: 0,
});

export const useNotificationUnread = () => {
    const summary = useState<NotificationUnreadSummary>(
        "notification-unread-summary",
        emptySummary,
    );
    const refreshing = useState<boolean>("notification-unread-refreshing", () => false);
    const lastSyncedAt = useState<number>("notification-unread-synced-at", () => 0);
    const accountUsername = useState<string>("notification-unread-account", () => "");
    const requestSequence = useState<number>("notification-unread-request-sequence", () => 0);
    const activeRequests = useState<number>("notification-unread-active-requests", () => 0);

    const setAccountContext = (username: string) => {
        const normalizedUsername = username.trim();
        if (accountUsername.value === normalizedUsername) {
            return;
        }

        accountUsername.value = normalizedUsername;
        summary.value = emptySummary();
        lastSyncedAt.value = 0;
        requestSequence.value += 1;
    };

    const refreshUnreadSummary = async () => {
        const requestId = requestSequence.value + 1;
        requestSequence.value = requestId;
        activeRequests.value += 1;
        refreshing.value = true;
        try {
            const response = await getNotificationUnreadSummary();
            if (
                response.code !== 200
                || !response.data
                || requestId !== requestSequence.value
            ) {
                return false;
            }

            summary.value = {
                announcementUnread: Number(response.data.announcementUnread || 0),
                notificationUnread: Number(response.data.notificationUnread || 0),
                totalUnread: Number(response.data.totalUnread || 0),
            };
            lastSyncedAt.value = Date.now();
            return true;
        } catch (error) {
            console.error("刷新通知未读数量失败", error);
            return false;
        } finally {
            activeRequests.value = Math.max(0, activeRequests.value - 1);
            refreshing.value = activeRequests.value > 0;
        }
    };

    const markReadAndRefresh = async (
        id: string,
        type: "announcement" | "notification",
    ) => {
        await checkNotification(id);
        const announcementUnread = type === "announcement"
            ? Math.max(0, summary.value.announcementUnread - 1)
            : summary.value.announcementUnread;
        const notificationUnread = type === "notification"
            ? Math.max(0, summary.value.notificationUnread - 1)
            : summary.value.notificationUnread;
        summary.value = {
            announcementUnread,
            notificationUnread,
            totalUnread: announcementUnread + notificationUnread,
        };
        await refreshUnreadSummary();
    };

    const markAllReadAndRefresh = async (type: "announcement" | "notification") => {
        await checkAllNotifications(type);
        const announcementUnread = type === "announcement"
            ? 0
            : summary.value.announcementUnread;
        const notificationUnread = type === "notification"
            ? 0
            : summary.value.notificationUnread;
        summary.value = {
            announcementUnread,
            notificationUnread,
            totalUnread: announcementUnread + notificationUnread,
        };
        await refreshUnreadSummary();
    };

    return {
        lastSyncedAt,
        markAllReadAndRefresh,
        markReadAndRefresh,
        refreshing,
        refreshUnreadSummary,
        setAccountContext,
        summary,
    };
};
