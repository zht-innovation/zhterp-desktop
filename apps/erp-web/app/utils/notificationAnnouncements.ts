import type { NotificationItem } from "~/composables/api/useNotificationApi";
import { systemUpdates, type SystemUpdateType } from "~/config/systemUpdates";
import { getDateSortTimestamp } from "~/utils/time";

const updateTagLabels: Record<SystemUpdateType, string> = {
    feature: "新功能",
    fix: "修复",
    improvement: "优化",
    notice: "通知",
};

export function mergeNotificationAnnouncements(apiItems: NotificationItem[], searchKeyword = ""): NotificationItem[] {
    const keyword = searchKeyword.trim().toLowerCase();
    const items: NotificationItem[] = [];

    for (const update of systemUpdates) {
        const item: NotificationItem = {
            _id: `system-update-${update.version}`,
            type: "announcement",
            category: "系统更新",
            title: update.title,
            content: update.items.join("\n"),
            version: `v${update.version}`,
            tag: updateTagLabels[update.type],
            isRead: true,
            _time: update.date,
        };
        if (keyword && ![item.title, item.content, item.version, item.tag]
            .some((value) => value?.toLowerCase().includes(keyword))) {
            continue;
        }
        items.push(item);
    }

    return [...items, ...apiItems].sort((left, right) =>
        getDateSortTimestamp(right._time) - getDateSortTimestamp(left._time),
    );
}
