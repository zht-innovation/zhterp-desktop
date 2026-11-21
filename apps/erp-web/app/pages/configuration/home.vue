<template>
    <main v-if="route.path === '/configuration/home'" class="workbench-page">
        <header class="page-header">
            <h1>工作台</h1>
            <button
                class="refresh-button"
                type="button"
                :disabled="loading || !isRoleReady"
                @click="loadWorkbench"
            >
                <Icon name="lucide:refresh-cw" :class="{ spinning: loading }" />
                刷新
            </button>
        </header>

        <div v-if="errorMessage" class="error-banner">
            <Icon name="lucide:triangle-alert" />
            <span>{{ errorMessage }}</span>
            <button type="button" @click="loadWorkbench">重试</button>
        </div>

        <dl v-if="summaries.length" class="summary-strip" aria-label="工作台摘要">
            <div v-for="summary in summaries" :key="summary.label" :title="summary.hint">
                <dt>{{ summary.label }}</dt>
                <dd>{{ summary.value }}</dd>
            </div>
        </dl>

        <div class="content-grid" :class="{ 'two-columns': panelColumns.length === 2 }">
            <div v-for="column in panelColumns" :key="column.key" class="panel-column">
                <section v-if="column.key === 'primary' && quickEntries.length" class="panel">
                    <h2>快捷入口</h2>
                    <div class="quick-grid">
                        <NuxtLink
                            v-for="entry in quickEntries"
                            :key="entry.label"
                            :to="entry.path"
                            :title="entry.description"
                            class="quick-card"
                        >
                            <Icon :name="entry.icon" class="quick-icon" />
                            <span>{{ entry.label }}</span>
                        </NuxtLink>
                    </div>
                </section>

                <article
                    v-for="panel in column.panels"
                    :key="panel.key"
                    class="panel"
                    :class="`${panel.key}-panel`"
                >
                    <div class="panel-header">
                        <h2 :title="panel.description">{{ panel.title }}</h2>
                        <NuxtLink :to="panel.path">
                            查看全部 <Icon name="lucide:arrow-up-right" />
                        </NuxtLink>
                    </div>

                    <div v-if="panel.error" class="panel-error">
                        <Icon name="lucide:triangle-alert" />
                        <span>{{ panel.error }}</span>
                        <button type="button" @click="loadWorkbench">重试</button>
                    </div>

                    <div v-if="loading && !panel.items.length" class="state">加载中...</div>
                    <div v-else-if="!panel.items.length && !panel.error" class="state">
                        <Icon :name="panel.emptyIcon" />
                        <span>{{ panel.emptyText }}</span>
                    </div>
                    <div v-else-if="panel.items.length" class="item-list">
                        <NuxtLink
                            v-for="item in panel.items"
                            :key="item.id"
                            :to="item.path"
                            class="list-item"
                        >
                            <span class="item-icon" :class="item.icon || panel.key">
                                <Icon :name="item.iconName || panel.icon" />
                            </span>
                            <span class="item-main">
                                <strong>{{ item.title }}</strong>
                                <small>{{ item.meta }}</small>
                                <span v-if="item.tags?.length" class="item-tags">
                                    <em
                                        v-for="tag in item.tags"
                                        :key="tag"
                                        :class="tag === '待核库存' || tag === '待仓库复核' ? 'inventory-tag' : 'approved-tag'"
                                    >
                                        {{ tag }}
                                    </em>
                                </span>
                            </span>
                            <span v-if="item.unread" class="unread-dot" aria-label="未读" />
                            <span v-if="panel.key === 'approval'" class="item-status">待处理</span>
                        </NuxtLink>
                    </div>
                </article>
                <template v-if="column.key === 'secondary' && isRoleReady && username">
                    <HomeProjectLogs v-if="capabilities.projectLogs" :key="username" class="panel"
                        :logs="logs" :loading="loading" :error="logError" @retry="loadWorkbench" />
                    <HomePersonalCalendar :key="'calendar-' + username" class="panel" :username="username" />
                    <HomeFeedbackSquare v-if="canAccessFeedback(role)" :key="'feedback-' + username + '-' + role"
                        class="panel" :refresh-key="refreshKey" />
                </template>
            </div>
        </div>
    </main>
    <NuxtPage v-else />
</template>

<script setup lang="ts">
import { retrieveApprovals } from "~/composables/api/useApprovalApi";
import { retrieveApplicationList } from "~/composables/api/useAppApi";
import { retrieveLogList, type SalesProjectLog } from "~/composables/api/useLogApi";
import {
    getNotificationStats,
    retrieveNotifications,
} from "~/composables/api/useNotificationApi";
import { canAccessFeedback, getHomeWorkbenchCapabilities } from "~~/shared/utils/adminPermission";
import { ADMIN_ROLE } from "~~/shared/enums";
import { resolveInventoryCheckPath } from "~/utils/inventory/orderCheckNotification";

definePageMeta({ layout: "home" });

type WorkItem = {
    id: string;
    title: string;
    meta: string;
    path: string;
    unread?: boolean;
    tags?: string[];
    icon?: string;
    iconName?: string;
};

const route = useRoute();
const adminInfo = useState<any>("admin_info", () => ({}));
const role = computed(() => {
    const value = adminInfo.value?.role;
    return value == null || value === "" ? NaN : Number(value);
});
const username = computed(() => String(adminInfo.value?.username || ""));
const isRoleReady = computed(() => Number.isInteger(role.value));
const capabilities = computed(() => ({
    ...getHomeWorkbenchCapabilities(role.value),
    projectLogs: role.value === ADMIN_ROLE.SUPER && Boolean(username.value),
}));
const loading = ref(false);
const errorMessage = ref("");
const notificationError = ref("");
const approvals = ref<WorkItem[]>([]);
const notifications = ref<WorkItem[]>([]);
const logs = ref<SalesProjectLog[]>([]);
const logError = ref("");
const refreshKey = ref(0);
const applicationCount = ref(0);
const unreadCount = ref(0);

const allQuickEntries = [
    {
        label: "审批中心",
        description: "处理待审核事项",
        path: "/configuration/approval",
        icon: "lucide:clipboard-check",
        capability: "approval",
    },
    {
        label: "销售管理",
        description: "查看客户与销售进展",
        path: "/configuration/sales/sale",
        icon: "lucide:briefcase-business",
        capability: "sales",
    },
    {
        label: "项目日志",
        description: "跟进项目最新动态",
        path: "/configuration/sales/logs",
        icon: "lucide:file-clock",
        capability: "projectLogs",
    },
    {
        label: "通知中心",
        description: "查看公告和业务通知",
        path: "/configuration/notification",
        icon: "lucide:bell",
        capability: "notification",
    },
] as const;

const quickEntries = computed(() => allQuickEntries.filter(
    (entry) => capabilities.value[entry.capability],
));

const summaries = computed(() => {
    const items: Array<{ label: string; value: number; hint: string }> = [];

    if (capabilities.value.approval) {
        items.push({ label: "待处理审批", value: approvals.value.length, hint: "条待办申请" });
    }
    if (capabilities.value.sales) {
        items.push({ label: "销售申请", value: applicationCount.value, hint: "条近期申请" });
    }
    if (capabilities.value.notification) {
        items.push({ label: "未读通知", value: unreadCount.value, hint: "条待查看消息" });
    }
    if (capabilities.value.projectLogs) {
        items.push({ label: "项目动态", value: logs.value.length, hint: "条项目日志" });
    }

    return items;
});

const panels = computed(() => {
    const items: Array<Record<string, any>> = [];

    if (capabilities.value.approval) {
        items.push({
            key: "approval",
            title: "待办事项",
            description: "需要优先处理的审批与业务申请",
            path: "/configuration/approval",
            icon: "lucide:clipboard-check",
            emptyIcon: "lucide:circle-check",
            emptyText: "暂无待办事项",
            error: "",
            items: approvals.value,
        });
    }
    if (capabilities.value.notification) {
        items.push({
            key: "notification",
            title: "最新消息",
            description: "公告与系统通知",
            path: "/configuration/notification",
            icon: "lucide:bell",
            emptyIcon: "lucide:bell-off",
            emptyText: "暂无新消息",
            error: notificationError.value,
            items: notifications.value,
        });
    }

    return items;
});

const panelColumns = computed(() => {
    const primary = panels.value.filter(panel => panel.key === "approval");
    const secondary = panels.value.filter(panel => panel.key !== "approval");
    const columns = [];
    if (quickEntries.value.length || primary.length) columns.push({ key: "primary", panels: primary });
    if (isRoleReady.value && username.value) columns.push({ key: "secondary", panels: secondary });
    return columns;
});

const toDateText = (value: unknown) => {
    const date = new Date(String(value || ""));
    return Number.isNaN(date.getTime())
        ? "刚刚"
        : date.toLocaleString("zh-CN", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        });
};

let workbenchRequestId = 0;

const resetWorkbenchState = () => {
    approvals.value = [];
    notifications.value = [];
    logs.value = [];
    logError.value = "";
    applicationCount.value = 0;
    unreadCount.value = 0;
    errorMessage.value = "";
    notificationError.value = "";
};

const loadWorkbench = async () => {
    if (!isRoleReady.value || !username.value || route.path !== "/configuration/home") return;

    refreshKey.value++;
    const requestId = ++workbenchRequestId;
    const currentCapabilities = capabilities.value;
    loading.value = true;
    errorMessage.value = "";
    notificationError.value = "";
    const failures: string[] = [];

    if (!currentCapabilities.approval) approvals.value = [];
    if (!currentCapabilities.notification) {
        notifications.value = [];
        unreadCount.value = 0;
    }
    if (!currentCapabilities.sales) {
        applicationCount.value = 0;
        logs.value = [];
    }

    const approvalRequest = currentCapabilities.approval
        ? Promise.allSettled([
            retrieveApprovals({ view: "pending", pageSize: 5 }),
        ])
        : Promise.resolve(null);
    const notificationRequest = currentCapabilities.notification
        ? Promise.allSettled([
            retrieveNotifications("notification", 1, 5),
            getNotificationStats("notification"),
        ])
        : Promise.resolve(null);
    const salesRequest = currentCapabilities.sales
        ? Promise.allSettled([
            retrieveApplicationList()(),
            currentCapabilities.projectLogs ? retrieveLogList()() : Promise.resolve(null),
        ])
        : Promise.resolve(null);
    const [approvalResults, notificationResults, salesResults] = await Promise.all([
        approvalRequest,
        notificationRequest,
        salesRequest,
    ]);

    if (requestId !== workbenchRequestId) return;

    const approvalResult = approvalResults?.[0];
    if (currentCapabilities.approval && approvalResult?.status === "fulfilled") {
        const items = approvalResult.value?.data?.items ?? [];
        approvals.value = items.slice(0, 5).map((item: any) => ({
            id: item.id || item._id,
            title: item.title || item.approvalNo || "审批申请",
            meta: `${item.applicant?.name || "未知申请人"} · ${toDateText(item.createTime)}`,
            path: "/configuration/approval?view=pending",
        }));
    } else if (currentCapabilities.approval) {
        failures.push("审批");
    }

    const notificationResult = notificationResults?.[0];
    const notificationStatsResult = notificationResults?.[1];
    if (currentCapabilities.notification && notificationResult?.status === "fulfilled") {
        const items = notificationResult.value?.data?.list ?? [];
        notifications.value = items.slice(0, 5).map((item: any) => {
            const isInventoryCheck = item.category === "库存核对";
            const isInventoryReview = item.relatedPath === "/configuration/inventory/review";
            return {
                id: item._id,
                title: item.title || "系统通知",
                meta: `${item.category || "通知"} · ${toDateText(item._time)}`,
                path: resolveInventoryCheckPath(
                    item.relatedPath,
                    item.category,
                    item.relatedId,
                ),
                unread: item.isRead === false,
                tags: isInventoryCheck ? ["审核通过", isInventoryReview ? "待仓库复核" : "待核库存"] : [],
                icon: isInventoryCheck ? "inventory" : "notification",
                iconName: isInventoryCheck ? "lucide:warehouse" : "lucide:bell",
            };
        });
    } else if (currentCapabilities.notification) {
        notificationError.value = "最新消息加载失败";
    }

    if (currentCapabilities.notification && notificationStatsResult?.status === "fulfilled") {
        unreadCount.value = notificationStatsResult.value?.data?.unread ?? 0;
    } else if (currentCapabilities.notification) {
        notificationError.value = notificationError.value
            ? `${notificationError.value}，未读统计加载失败`
            : "未读统计加载失败";
    }

    if (currentCapabilities.sales && salesResults) {
        const [applicationResult, logResult] = salesResults;
        if (applicationResult.status === "fulfilled") {
            applicationCount.value = (applicationResult.value as any)?.data?.applications?.length ?? 0;
        } else {
            failures.push("申请");
        }

        if (currentCapabilities.projectLogs) {
            if (logResult.status === "fulfilled") {
                logs.value = logResult.value?.data?.logs ?? [];
                logError.value = "";
            } else {
                logError.value = "项目日志加载失败";
            }
        }
    }

    if (failures.length) {
        errorMessage.value = `${failures.join("、")}数据加载失败，可点击重试。`;
    }
    loading.value = false;
};

watch(
    [role, username, () => route.path],
    () => {
        workbenchRequestId++;
        resetWorkbenchState();
        loading.value = false;
        void loadWorkbench();
    },
    { immediate: true },
);
</script>

<style scoped>
.workbench-page {
    --brand: #3dabee;
    --brand-soft: #ecf7fd;
    --border: #e5e7eb;
    --secondary: #73767a;
    box-sizing: border-box;
    height: 100%;
    overflow: auto;
    padding: 16px;
    background: #f5f7fa;
    color: #303133;
    font-size: 13px;
}
.page-header, .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px 8px;
    margin-bottom: 12px;
}
h1, h2 { margin: 0; font-weight: 600; }
h1 { font-size: 18px; }
h2 { font-size: 15px; }
.refresh-button, .panel-header a {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--brand);
    font-size: 13px;
    text-decoration: none;
    cursor: pointer;
}
.refresh-button:hover, .panel-header a:hover { background: var(--brand-soft); }
.refresh-button:disabled { opacity: .65; cursor: wait; }
.spinning { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.summary-strip { display: flex; flex-wrap: wrap; gap: 6px 20px; margin: 0 0 16px; color: var(--secondary); }
.summary-strip > div { display: flex; align-items: baseline; gap: 6px; }
.summary-strip dd { margin: 0; color: #303133; font-weight: 600; }
.content-grid, .panel-column { display: grid; grid-template-columns: minmax(0, 1fr); align-items: start; gap: 16px; }
.content-grid.two-columns { grid-template-columns: minmax(0, 1.8fr) minmax(280px, 1fr); }
.panel { min-width: 0; padding: 16px; border: 1px solid var(--border); border-radius: 10px; background: #fff; }
.quick-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 72px), 80px));
    gap: 8px;
    margin-top: 12px;
}
.quick-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    box-sizing: border-box;
    aspect-ratio: 1;
    padding: 5px;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: inherit;
    text-decoration: none;
    font-size: 12px;
}
.quick-icon { width: 24px; height: 24px; color: var(--brand); }
.quick-card:hover, .quick-card:focus-visible { background: var(--brand-soft); border-color: var(--brand); }

.list-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; color: inherit; text-decoration: none; }
.list-item + .list-item { border-top: 1px solid var(--border); }
.list-item:hover, .list-item:focus-visible { background: var(--brand-soft); }
.item-icon { display: inline-flex; flex: none; color: var(--secondary); }
.item-icon.inventory { color: #ad7116; }
.item-main { display: grid; flex: 1; min-width: 0; gap: 3px; overflow-wrap: anywhere; }
.item-main strong { font-weight: 500; }
.item-main small, .state { font-size: 12px; color: var(--secondary); }
.approval-panel .list-item { padding-block: 6px; }
.panel :deep(.home-card-header) { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.panel :deep(.home-card-header h2) { margin: 0; font-size: 15px; font-weight: 600; }
.panel :deep(.home-action) { color: var(--brand); background: transparent; border: 0; cursor: pointer; font: inherit; text-decoration: none; }
.panel :deep(.home-card-note) { color: var(--secondary); font-size: 12px; }
.item-tags { display: flex; flex-wrap: wrap; gap: 5px; }
.item-tags em, .item-status { padding: 2px 7px; border-radius: 10px; font-size: 12px; font-style: normal; }
.approved-tag { color: #21865c; background: #edf8f1; }
.inventory-tag, .item-status { color: #8a4408; background: #fff0de; }
.unread-dot { width: 8px; height: 8px; flex: none; border-radius: 50%; background: #e15b64; }
.state { display: flex; align-items: center; gap: 6px; }
.error-banner, .panel-error {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding: 8px 10px;
    border-radius: 4px;
    color: #b42318;
    background: #fff1f2;
}
.error-banner button, .panel-error button { margin-left: auto; border: 0; color: inherit; background: transparent; text-decoration: underline; cursor: pointer; }
@media (max-width: 900px) {
    .content-grid.two-columns { grid-template-columns: minmax(0, 1fr); }
}
</style>
