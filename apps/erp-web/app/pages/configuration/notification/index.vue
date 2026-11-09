<template>
    <div class="notification-page">
        <!-- 顶部标题栏 -->
        <div class="page-header">
            <div class="header-left">
                <Icon name="mdi:bell-outline" class="header-icon" />
                <h2>通知中心</h2>
            </div>
            <div class="search-box">
                <el-input
                    v-model="searchKeyword"
                    placeholder="输入你想要寻找的内容"
                    clearable
                    @keyup.enter="handleSearch"
                >
                    <template #prefix>
                        <Icon name="mdi:magnify" />
                    </template>
                </el-input>
                <el-button type="primary" @click="handleSearch">搜索</el-button>
            </div>
        </div>

        <!-- 内容区 -->
        <div class="content-wrapper">
            <!-- Tab 切换栏 -->
            <div class="tab-bar">
                <div class="tab-buttons">
                    <div
                        class="tab-btn"
                        :class="{ active: activeTab === 'announcement' }"
                        @click="switchTab('announcement')"
                    >
                        <Icon name="mdi:bullhorn-outline" />
                        <span>公告栏</span>
                        <span v-if="announcementStats.unread > 0" class="badge">{{ formatUnreadCount(announcementStats.unread) }}</span>
                    </div>
                    <div
                        class="tab-btn"
                        :class="{ active: activeTab === 'message' }"
                        @click="switchTab('message')"
                    >
                        <Icon name="mdi:message-outline" />
                        <span>消息通知</span>
                        <span v-if="msgStats.unread > 0" class="badge">{{ formatUnreadCount(msgStats.unread) }}</span>
                    </div>
                </div>
                <div class="tab-info">
                    <template v-if="activeTab === 'announcement'">
                        <span class="total-text">共 {{ announcementStats.total }} 条，{{ announcementStats.unread }}条未读</span>
                    </template>
                    <template v-else>
                        <span class="total-text">共 {{ msgStats.total }} 条，{{ msgStats.unread }}条未读</span>
                    </template>
                    <button
                        v-if="activeUnreadCount > 0"
                        class="mark-all-btn"
                        type="button"
                        @click="handleMarkAllRead"
                    >
                        全部标为已读
                    </button>
                </div>
            </div>

            <!-- 公告栏内容 -->
            <template v-if="activeTab === 'announcement'">
                <!-- 提示条 -->
                <div class="tip-banner">
                    <Icon name="mdi:information-outline" class="tip-icon" />
                    <span>这里会同步系统更新、版本发布与重要通知。</span>
                </div>

                <!-- 公告列表 -->
                <div class="announcement-list">
                    <div
                        v-for="item in announcementList"
                        :key="item._id"
                        class="announcement-card"
                        :class="{ unread: !item.isRead }"
                        :role="item.isRead ? undefined : 'button'"
                        :tabindex="item.isRead ? undefined : 0"
                        @click="handleAnnouncementRead(item)"
                        @keydown.enter.prevent="handleAnnouncementRead(item)"
                    >
                        <div class="card-header">
                            <div class="card-tags">
                                <span
                                    v-if="item.tag"
                                    class="tag"
                                    :class="getTagClass(item.tag)"
                                >
                                    {{ item.tag }}
                                </span>
                                <span v-if="item.version" class="version">{{ item.version }}</span>
                            </div>
                            <div class="announcement-meta">
                                <span v-if="!item.isRead" class="announcement-unread">未读</span>
                                <span class="card-date">{{ formatDate(item._time) }}</span>
                            </div>
                        </div>
                        <h3 class="card-title">{{ item.title }}</h3>
                        <p class="card-content">{{ item.content }}</p>
                    </div>

                    <!-- 空状态 -->
                    <div v-if="announcementList.length === 0 && !loading" class="empty-state">
                        <Icon name="lucide:megaphone-off" class="empty-icon" />
                        <p>暂无公告</p>
                    </div>
                </div>
            </template>

            <!-- 消息通知内容 -->
            <template v-else>
                <!-- 提示条 -->
                <div class="tip-banner">
                    <Icon name="mdi:information-outline" class="tip-icon" />
                    <span>这里会显示采购提醒、生产任务等重要业务消息。</span>
                </div>

                <!-- 通知列表 -->
                <div class="notification-list">
                    <div
                        v-for="item in notificationList"
                        :key="item._id"
                        class="notification-card"
                        :class="{ unread: !item.isRead }"
                    >
                        <div class="card-content">
                            <div class="card-icon-wrapper">
                                <div class="card-icon">
                                    <Icon :name="getCategoryIcon(item.category)" />
                                </div>
                            </div>
                            <div class="card-body">
                                <div class="card-header">
                                    <span class="card-title">{{ item.title }}</span>
                                    <span class="card-time">{{ formatTime(item._time) }}</span>
                                </div>
                                <p class="card-desc">{{ item.content }}</p>
                                <div class="card-footer">
                                    <span
                                        v-if="item.relatedPath"
                                        class="detail-link"
                                        @click="handleViewDetail(item)"
                                    >
                                        查看详情
                                        <Icon name="mdi:chevron-right" />
                                    </span>
                                    <span v-if="!item.isRead" class="unread-badge" @click.stop="handleMarkRead(item._id)">
                                        未读
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 空状态 -->
                    <div v-if="notificationList.length === 0 && !loading" class="empty-state">
                        <Icon name="mdi:bell-off-outline" class="empty-icon" />
                        <p>暂无通知</p>
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { mainSitePage } from "~/utils/mainSitePage";
import {
    retrieveNotifications,
    getNotificationStats,
} from '~/composables/api/useNotificationApi'
import type { NotificationItem, NotificationStats } from '~/composables/api/useNotificationApi'
import { useNotificationUnread } from '~/composables/useNotificationUnread'
import { systemUpdates, type SystemUpdateType } from '~/config/systemUpdates'
import { formatLocalDateRange, getDateSortTimestamp } from '~/utils/time'
import { resolveInventoryCheckPath } from '~/utils/inventory/orderCheckNotification'

const { mainSiteOrigin } = useRuntimeConfig().public;

definePageMeta({
    layout: 'notification',
})

const loading = ref(false)
const searchKeyword = ref('')
const activeTab = ref<'announcement' | 'message'>('announcement')

// 公告栏数据
const apiAnnouncementList = ref<NotificationItem[]>([])
const announcementStats = ref<NotificationStats>({ total: 0, unread: 0 })

const updateTagLabels: Record<SystemUpdateType, string> = {
    feature: '新功能',
    fix: '修复',
    improvement: '优化',
    notice: '通知',
}

const systemAnnouncementList = computed<NotificationItem[]>(() => {
    const keyword = searchKeyword.value.trim().toLowerCase()

    return systemUpdates
        .map((update) => ({
            _id: `system-update-${update.version}`,
            type: 'announcement' as const,
            category: '系统更新',
            title: update.title,
            content: update.items.join('\n'),
            version: `v${update.version}`,
            tag: updateTagLabels[update.type],
            isRead: true,
            _time: update.date,
        }))
        .filter((item) => {
            if (!keyword) return true
            return [item.title, item.content, item.version, item.tag]
                .some((value) => value.toLowerCase().includes(keyword))
        })
})

const announcementList = computed(() => {
    return [
        ...systemAnnouncementList.value,
        ...apiAnnouncementList.value,
    ].sort((left, right) => {
        return getDateSortTimestamp(right._time) - getDateSortTimestamp(left._time)
    })
})

// 消息通知数据
const notificationList = ref<NotificationItem[]>([])
const msgStats = ref<NotificationStats>({ total: 0, unread: 0 })
const {
    markAllReadAndRefresh,
    markReadAndRefresh,
    summary: unreadSummary,
} = useNotificationUnread()
const activeUnreadCount = computed(() =>
    activeTab.value === 'announcement'
        ? announcementStats.value.unread
        : msgStats.value.unread,
)

function syncUnreadStats() {
    announcementStats.value.unread = unreadSummary.value.announcementUnread
    msgStats.value.unread = unreadSummary.value.notificationUnread
}

function updateSharedUnreadSummary() {
    unreadSummary.value = {
        announcementUnread: announcementStats.value.unread,
        notificationUnread: msgStats.value.unread,
        totalUnread: announcementStats.value.unread + msgStats.value.unread,
    }
}

// 加载公告数据
async function loadAnnouncementData() {
    loading.value = true
    try {
        const [listRes, statsRes, msgStatsRes] = await Promise.all([
            retrieveNotifications('announcement', 1, 50, searchKeyword.value),
            getNotificationStats('announcement'),
            getNotificationStats('notification'),
        ])
        apiAnnouncementList.value = listRes.data.list
        announcementStats.value = {
            total: statsRes.data.total + systemUpdates.length,
            unread: statsRes.data.unread,
        }
        msgStats.value = msgStatsRes.data
        updateSharedUnreadSummary()
    } catch (err) {
        console.error('加载公告失败:', err)
    } finally {
        loading.value = false
    }
}

// 加载消息通知数据
async function loadMessageData() {
    loading.value = true
    try {
        const [listRes, statsRes] = await Promise.all([
            retrieveNotifications('notification', 1, 50, searchKeyword.value),
            getNotificationStats('notification'),
        ])
        notificationList.value = listRes.data.list
        msgStats.value = statsRes.data
        unreadSummary.value = {
            ...unreadSummary.value,
            notificationUnread: statsRes.data.unread,
            totalUnread: unreadSummary.value.announcementUnread + statsRes.data.unread,
        }
    } catch (err) {
        console.error('加载通知失败:', err)
    } finally {
        loading.value = false
    }
}

// 切换 tab
function switchTab(tab: 'announcement' | 'message') {
    if (activeTab.value === tab) return
    activeTab.value = tab
    searchKeyword.value = ''
    if (tab === 'announcement') {
        loadAnnouncementData()
    } else {
        loadMessageData()
    }
}

// 搜索
function handleSearch() {
    if (activeTab.value === 'announcement') {
        loadAnnouncementData()
    } else {
        loadMessageData()
    }
}

// 标记单条已读
async function handleMarkRead(id: string) {
    try {
        await markReadAndRefresh(id, 'notification')
        const item = notificationList.value.find((entry) => entry._id === id)
        if (item) item.isRead = true
        syncUnreadStats()
    } catch (err) {
        console.error('标记已读失败:', err)
    }
}

async function handleAnnouncementRead(item: NotificationItem) {
    if (item.isRead) return
    try {
        await markReadAndRefresh(item._id, 'announcement')
        item.isRead = true
        syncUnreadStats()
    } catch (err) {
        console.error('公告标记已读失败:', err)
    }
}

// 全部标为已读
async function handleMarkAllRead() {
    const type = activeTab.value === 'announcement' ? 'announcement' : 'notification'
    try {
        await markAllReadAndRefresh(type)
        const list = type === 'announcement' ? apiAnnouncementList.value : notificationList.value
        list.forEach((item) => { item.isRead = true })
        syncUnreadStats()
    } catch (err) {
        console.error('全部已读失败:', err)
    }
}

// 查看详情
async function handleViewDetail(item: NotificationItem) {
    if (item.relatedPath) {
        if (["意见进度", "意见退回"].includes(item.category) && item.relatedId) {
            const path = `/configuration/feedback?feedbackId=${encodeURIComponent(item.relatedId)}`;
            await navigateTo(mainSitePage(path, mainSiteOrigin), { external: true });
            return;
        }
        try {
            if (!item.isRead) {
                await markReadAndRefresh(item._id, 'notification')
                item.isRead = true
                syncUnreadStats()
            }
            await navigateTo(resolveInventoryCheckPath(
                item.relatedPath,
                item.category,
                item.relatedId,
            ))
        } catch (err) {
            console.error('查看通知详情失败:', err)
        }
    }
}

function formatUnreadCount(count: number) {
    return count > 99 ? '99+' : String(count)
}

// 获取标签样式
function getTagClass(tag: string) {
    const classMap: Record<string, string> = {
        '新功能': 'tag-new',
        '修复': 'tag-fix',
        '优化': 'tag-improvement',
        '通知': 'tag-notice',
    }
    return classMap[tag] || 'tag-default'
}

// 获取分类图标
function getCategoryIcon(category: string) {
    const iconMap: Record<string, string> = {
        '采购提醒': 'mdi:cart-outline',
        '生产领料': 'mdi:factory',
        '库存预警': 'mdi:warehouse',
        '库存核对': 'mdi:warehouse',
        '物流取件': 'mdi:package-variant-closed-check',
        '物流验收异常': 'mdi:alert-circle-outline',
        '订单提醒': 'mdi:receipt-text-outline',
    }
    return iconMap[category] || 'mdi:bell-outline'
}

// 格式日期
function formatDate(time: string) {
    return formatLocalDateRange(time)
}

// 格式时间
function formatTime(time: string) {
    if (!time) return ''
    const date = new Date(time)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes}分钟前`
    if (hours < 24) return `${hours}小时前`
    if (days < 30) return `${days}天前`
    return date.toLocaleDateString('zh-CN')
}

onMounted(() => {
    loadAnnouncementData()
})
</script>

<style lang="less" scoped>
.notification-page {
    --d-color: #3dabee;
    --gray-b15: #262626;
    --gray-b40: #666666;
    --gray-b70: #b3b3b3;
    --gray-b95: #f2f2f2;

    padding: 20px;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: #f5f7fa;
}

.page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 40px;

    .header-left {
        display: flex;
        align-items: center;
        gap: 8px;

        .header-icon {
            font-size: 24px;
            color: var(--d-color);
        }

        h2 {
            font-size: 18px;
            font-weight: 500;
            color: var(--gray-b15);
            margin: 0;
            font-family: 'PingFang SC', sans-serif;
        }
    }

    .search-box {
        display: flex;
        align-items: center;
        gap: 8px;

        .el-input {
            width: 400px;
        }
    }
}

.content-wrapper {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    overflow-y: auto;
}

.tab-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: white;
    padding: 4px;
    border-radius: 10px;

    .tab-buttons {
        display: flex;
        gap: 7px;

        .tab-btn {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 6px 12px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 16px;
            color: var(--gray-b40);
            font-family: 'PingFang SC', sans-serif;
            font-weight: 500;
            position: relative;

            &.active {
                background: var(--d-color);
                color: white;
            }

            .badge {
                background: #fb2c36;
                color: white;
                font-size: 11px;
                min-width: 20px;
                height: 18px;
                border-radius: 999px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 4px;
            }
        }
    }

    .tab-info {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 14px;

        .total-text {
            color: var(--gray-b40);
            font-family: 'PingFang SC', sans-serif;
        }

        .mark-all-btn {
            padding: 0;
            border: 0;
            color: var(--d-color);
            background: transparent;
            cursor: pointer;

            &:hover {
                text-decoration: underline;
            }
        }
    }
}

.tip-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11.5px 20px;
    background: #e6f7ff;
    border: 1px solid #b3e5fc;
    border-radius: 10px;
    font-size: 14px;
    color: var(--d-color);
    font-family: 'PingFang SC', sans-serif;

    .tip-icon {
        font-size: 14px;
    }
}

.announcement-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.announcement-card {
    border: 1px solid transparent;
    background: white;
    border-radius: 10px;
    padding: 20px;

    &.unread {
        border-color: var(--d-color);
        background: rgba(61, 171, 238, 0.1);
        cursor: pointer;
    }

    .announcement-meta {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .announcement-unread {
        padding: 2px 8px;
        border-radius: 999px;
        color: white;
        background: var(--d-color);
        font-size: 11px;
        font-weight: 500;
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;

        .card-tags {
            display: flex;
            align-items: center;
            gap: 8px;

            .tag {
                padding: 4px 8px;
                border-radius: 5px;
                font-size: 12px;
                font-family: 'PingFang SC', sans-serif;

                &.tag-new {
                    background: #dcfce7;
                    color: #008236;
                }

                &.tag-fix {
                    background: #ffe2e2;
                    color: #c10007;
                }

                &.tag-notice {
                    background: var(--gray-b95);
                    color: var(--gray-b40);
                }

                &.tag-improvement {
                    background: #fef3c7;
                    color: #a16207;
                }

                &.tag-default {
                    background: var(--gray-b95);
                    color: var(--gray-b40);
                }
            }

            .version {
                font-size: 14px;
                color: var(--gray-b40);
                font-family: 'PingFang SC', sans-serif;
            }
        }

        .card-date {
            font-size: 14px;
            color: var(--gray-b70);
            font-family: 'PingFang SC', sans-serif;
        }
    }

    .card-title {
        font-size: 18px;
        font-weight: 500;
        color: var(--gray-b15);
        margin: 0 0 4px 0;
        font-family: 'PingFang SC', sans-serif;
    }

    .card-content {
        font-size: 14px;
        color: var(--gray-b40);
        margin: 0;
        line-height: 1.5;
        white-space: pre-line;
        font-family: 'PingFang SC', sans-serif;
    }
}

.notification-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.notification-card {
    background: white;
    border: 1px solid var(--gray-b70);
    border-radius: 10px;
    padding: 20px;
    transition: all 0.2s;

    &.unread {
        background: rgba(61, 171, 238, 0.1);
        border: 2px solid var(--d-color);
    }

    .card-content {
        display: flex;
        gap: 14px;

        .card-icon-wrapper {
            flex-shrink: 0;

            .card-icon {
                width: 42px;
                height: 42px;
                border-radius: 50%;
                background: #ffedd4;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 21px;
                color: #e6a23c;
            }
        }

        .card-body {
            flex: 1;
            min-width: 0;

            .card-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;

                .card-title {
                    font-size: 16px;
                    font-weight: 600;
                    color: var(--gray-b15);
                    font-family: 'PingFang SC', sans-serif;
                }

                .card-time {
                    font-size: 12px;
                    color: var(--gray-b70);
                    flex-shrink: 0;
                    font-family: 'PingFang SC', sans-serif;
                }
            }

            .card-desc {
                font-size: 14px;
                color: var(--gray-b40);
                margin: 8px 0;
                line-height: 1.5;
                font-family: 'PingFang SC', sans-serif;
            }

            .card-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 8px;

                .detail-link {
                    display: flex;
                    align-items: center;
                    gap: 3.5px;
                    font-size: 14px;
                    color: var(--d-color);
                    cursor: pointer;

                    &:hover {
                        text-decoration: underline;
                    }
                }

                .unread-badge {
                    background: var(--d-color);
                    color: white;
                    font-size: 11px;
                    padding: 2px 8px;
                    border-radius: 999px;
                    cursor: pointer;
                    font-weight: 500;

                    &:hover {
                        opacity: 0.8;
                    }
                }
            }
        }
    }
}

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 80px 0;
    color: var(--gray-b70);

    .empty-icon {
        font-size: 64px;
        margin-bottom: 16px;
        opacity: 0.5;
    }

    p {
        font-size: 16px;
        font-family: 'PingFang SC', sans-serif;
    }
}
</style>
