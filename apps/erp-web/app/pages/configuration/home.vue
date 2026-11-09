<template>
    <main v-if="route.path === '/configuration/home'" class="workbench-page">
        <header class="page-header">
            <div>
                <p class="eyebrow">ERP WORKSPACE</p>
                <h1>工作台</h1>
                <p class="subtitle">集中查看待办事项、最新消息和业务快捷入口</p>
            </div>
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

        <section class="quick-grid" aria-label="快捷入口">
            <NuxtLink
                v-for="entry in quickEntries"
                :key="entry.label"
                :to="entry.path"
                class="quick-card"
            >
                <span
                    class="quick-icon"
                    :style="{ color: entry.color, backgroundColor: entry.background }"
                >
                    <Icon :name="entry.icon" />
                </span>
                <span class="quick-copy">
                    <strong>{{ entry.label }}</strong>
                    <small>{{ entry.description }}</small>
                </span>
                <Icon name="lucide:chevron-right" class="quick-arrow" />
            </NuxtLink>
        </section>

        <section class="summary-grid">
            <div v-for="summary in summaries" :key="summary.label" class="summary-card">
                <span class="summary-label">{{ summary.label }}</span>
                <strong>{{ summary.value }}</strong>
                <small>{{ summary.hint }}</small>
            </div>
        </section>

        <section class="content-grid">
            <article
                v-for="panel in panels"
                :key="panel.key"
                class="panel"
                :class="`${panel.key}-panel`"
            >
                <div class="panel-header">
                    <div>
                        <h2>{{ panel.title }}</h2>
                        <p>{{ panel.description }}</p>
                    </div>
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
        </section>
    </main>
    <NuxtPage v-else />
</template>

<script setup lang="ts">
import { retrieveApprovals } from "~/composables/api/useApprovalApi";
import { retrieveApplicationList } from "~/composables/api/useAppApi";
import { retrieveLogList } from "~/composables/api/useLogApi";
import {
    getNotificationStats,
    retrieveNotifications,
} from "~/composables/api/useNotificationApi";
import { getHomeWorkbenchCapabilities } from "~~/shared/utils/adminPermission";
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
const role = computed(() => Number(adminInfo.value?.role));
const username = computed(() => String(adminInfo.value?.username || ""));
const isRoleReady = computed(() => Number.isInteger(role.value));
const capabilities = computed(() => getHomeWorkbenchCapabilities(role.value));
const loading = ref(false);
const errorMessage = ref("");
const notificationError = ref("");
const approvals = ref<WorkItem[]>([]);
const notifications = ref<WorkItem[]>([]);
const logs = ref<WorkItem[]>([]);
const applicationCount = ref(0);
const unreadCount = ref(0);

const allQuickEntries = [
    {
        label: "审批中心",
        description: "处理待审核事项",
        path: "/configuration/approval",
        icon: "lucide:clipboard-check",
        color: "#2563eb",
        background: "#e8f1ff",
        capability: "approval",
    },
    {
        label: "销售管理",
        description: "查看客户与销售进展",
        path: "/configuration/sales/sale",
        icon: "lucide:briefcase-business",
        color: "#0f766e",
        background: "#e5f7f3",
        capability: "sales",
    },
    {
        label: "项目日志",
        description: "跟进项目最新动态",
        path: "/configuration/sales/logs",
        icon: "lucide:file-clock",
        color: "#c2410c",
        background: "#fff0e6",
        capability: "sales",
    },
    {
        label: "通知中心",
        description: "查看公告和业务通知",
        path: "/configuration/notification",
        icon: "lucide:bell",
        color: "#7c3aed",
        background: "#f1eaff",
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
    if (capabilities.value.sales) {
        items.push({ label: "项目动态", value: logs.value.length, hint: "条最新日志" });
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

    if (capabilities.value.sales) {
        items.push({
            key: "log",
            title: "最近动态",
            description: "销售跟进与项目日志",
            path: "/configuration/sales/logs",
            icon: "lucide:file-text",
            emptyIcon: "lucide:inbox",
            emptyText: "暂无项目动态",
            error: "",
            items: logs.value,
        });
    }

    return items;
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
    applicationCount.value = 0;
    unreadCount.value = 0;
    errorMessage.value = "";
    notificationError.value = "";
};

const loadWorkbench = async () => {
    if (!isRoleReady.value) return;

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
            retrieveLogList()({}),
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

        if (logResult.status === "fulfilled") {
            const items = (logResult.value as any)?.data?.logs ?? [];
            logs.value = items.slice(0, 5).map((item: any) => ({
                id: item._id,
                title: item.subject || item.content || "项目跟进日志",
                meta: `${item.salesperson?.nameCn || item.salesperson?.name || "未知销售"} · ${toDateText(item._createDate || item.logDate)}`,
                path: "/configuration/sales/logs",
            }));
        } else {
            failures.push("日志");
        }
    }

    if (failures.length) {
        errorMessage.value = `${failures.join("、")}数据加载失败，可点击重试。`;
    }
    loading.value = false;
};

watch(
    [role, username],
    ([currentRole, currentUsername], [previousRole, previousUsername]) => {
        if (
            Number.isInteger(currentRole)
            && (
                currentRole !== previousRole
                || currentUsername !== previousUsername
            )
        ) {
            workbenchRequestId += 1;
            resetWorkbenchState();
            void loadWorkbench();
        }
    },
    { immediate: true },
);
</script>

<style scoped>
.workbench-page { height: 100%; padding: 28px; overflow: auto; background: #f5f7fa; color: #202122; } .page-header, .panel-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; } .page-header { margin-bottom: 24px; } .eyebrow { margin: 0 0 5px; color: #409eff; font-size: 12px; font-weight: 700; letter-spacing: .12em; } h1, h2, p { margin: 0; } h1 { font-size: 30px; line-height: 40px; } h2 { font-size: 19px; line-height: 27px; } .subtitle, .panel-header p { margin-top: 5px; color: #909399; font-size: 14px; } .refresh-button { display: inline-flex; align-items: center; gap: 6px; padding: 9px 15px; border: 1px solid #dcdfe6; border-radius: 8px; color: #409eff; background: #fff; cursor: pointer; } .refresh-button:disabled { cursor: wait; opacity: .65; } .spinning { animation: spin 1s linear infinite; } .error-banner, .panel-error { display: flex; align-items: center; gap: 8px; color: #b42318; background: #fff1f2; font-size: 14px; } .error-banner { margin-bottom: 18px; padding: 11px 14px; border: 1px solid #f5c2c7; border-radius: 8px; } .panel-error { margin-top: 12px; padding: 9px 11px; border-radius: 6px; } .error-banner button, .panel-error button { margin-left: auto; border: 0; color: #b42318; background: transparent; cursor: pointer; text-decoration: underline; } .quick-grid, .summary-grid, .content-grid { display: grid; gap: 18px; } .quick-grid, .summary-grid { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); } .summary-grid { margin: 18px 0; } .quick-card, .summary-card, .panel { border-radius: 8px; background: #fff; box-shadow: 0 2px 12px rgb(0 0 0 / 3%); } .quick-card { display: flex; align-items: center; gap: 12px; padding: 17px; color: inherit; transition: transform .15s, box-shadow .15s; } .quick-card:hover { transform: translateY(-2px); box-shadow: 0 7px 18px rgb(0 0 0 / 8%); } .quick-icon { display: grid; width: 42px; height: 42px; flex: 0 0 42px; place-items: center; border-radius: 8px; font-size: 21px; } .quick-copy { min-width: 0; display: grid; gap: 3px; } .quick-copy strong { font-size: 16px; } .quick-copy small { overflow: hidden; color: #909399; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; } .quick-arrow { margin-left: auto; color: #c0c4cc; } .summary-card { display: grid; gap: 7px; padding: 18px 20px; } .summary-label { color: #606266; font-size: 14px; } .summary-card strong { color: #409eff; font-size: 30px; line-height: 34px; } .summary-card small { color: #a0a4aa; font-size: 12px; } .content-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .panel { min-height: 310px; padding: 20px; } .log-panel { grid-column: 1 / -1; min-height: 250px; } .panel-header { padding-bottom: 15px; border-bottom: 1px solid #f0f2f5; } .panel-header a { display: inline-flex; align-items: center; gap: 4px; color: #409eff; font-size: 13px; white-space: nowrap; } .item-list { display: grid; } .list-item { display: flex; align-items: center; gap: 11px; padding: 14px 2px; border-bottom: 1px solid #f5f6f7; color: inherit; } .list-item:last-child { border-bottom: 0; } .item-icon { display: grid; width: 34px; height: 34px; flex: 0 0 34px; place-items: center; border-radius: 8px; } .item-icon.approval { color: #2563eb; background: #e8f1ff; } .item-icon.notification { color: #7c3aed; background: #f1eaff; } .item-icon.inventory { color: #b54708; background: #fff0d9; } .item-icon.log { color: #c2410c; background: #fff0e6; } .item-main { min-width: 0; display: grid; flex: 1; gap: 4px; } .item-main strong { overflow: hidden; font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; } .item-main small { color: #909399; font-size: 12px; } .item-tags { display: flex; flex-wrap: wrap; gap: 5px; } .item-tags em { padding: 2px 6px; border-radius: 4px; font-size: 11px; font-style: normal; line-height: 16px; } .approved-tag { color: #087443; background: #dcfce7; } .inventory-tag { color: #b54708; background: #fff0d9; } .item-status { color: #e6a23c; font-size: 12px; } .unread-dot { width: 8px; height: 8px; flex: 0 0 8px; border-radius: 50%; background: #f56c6c; } .state { min-height: 200px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 8px; color: #a0a4aa; font-size: 14px; } .state :deep(svg) { width: 30px; height: 30px; color: #67c23a; } @keyframes spin { to { transform: rotate(360deg); } } @media (max-width: 1100px) { .quick-grid, .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } } @media (max-width: 760px) { .workbench-page { padding: 18px; } .quick-grid, .summary-grid, .content-grid { grid-template-columns: 1fr; } .log-panel { grid-column: auto; } }
</style>
