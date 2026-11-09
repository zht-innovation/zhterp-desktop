export interface NotificationItem {
    _id: string
    type: 'announcement' | 'notification'
    category: string
    title: string
    content: string
    version?: string
    tag?: string
    icon?: string
    relatedId?: string
    relatedPath?: string
    isRead: boolean
    _time: string
}

export interface NotificationStats {
    total: number
    unread: number
}

export interface NotificationUnreadSummary {
    announcementUnread: number//当前账号未读的内部公告数量
    notificationUnread: number//当前账号未读的业务消息数量
    totalUnread: number//二者之和
}

export interface NotificationListResult {
    list: NotificationItem[]
    total: number
    page: number
    pageSize: number
}

// 查询通知列表
export function retrieveNotifications(type: string, page: number = 1, pageSize: number = 20, keyword: string = '') {
    return $fetch('/notification/retrieve', {
        method: 'GET',
        headers: {
            "Token": getToken() || '',
        },
        query: { type, page, pageSize, keyword },
    }) as Promise<{ code: number, data: NotificationListResult }>
}

// 获取统计信息
export function getNotificationStats(type: string) {
    return $fetch('/notification/stats', {
        method: 'GET',
        headers: {
            "Token": getToken() || '',
        },
        query: { type },
    }) as Promise<{ code: number, data: NotificationStats }>
}

export function getNotificationUnreadSummary() {
    return $fetch('/notification/unread-summary', {
        method: 'GET',
        headers: {
            "Token": getToken() || '',
        },
    }) as Promise<{ code: number, data: NotificationUnreadSummary }>
}

// 标记单条已读
export function checkNotification(id: string) {
    return $fetch('/notification/check', {
        method: 'PUT',
        headers: {
            "Token": getToken() || '',
        },
        body: { id },
    })
}

// 全部标为已读
export function checkAllNotifications(type: string) {
    return $fetch('/notification/check-all', {
        method: 'PUT',
        headers: {
            "Token": getToken() || '',
        },
        body: { type },
    })
}

// 删除通知
export function deleteNotification(id: string) {
    return $fetch('/notification/delete', {
        method: 'DELETE',
        headers: {
            "Token": getToken() || '',
        },
        body: { id },
    })
}
