<template>
    <div class="approval-workbench" @click="showFilterDialog = false">
        <nav class="view-tabs">
            <button
                v-for="tab in tabs"
                :key="tab.value"
                class="view-tab"
                :class="{ active: activeView === tab.value }"
                type="button"
                @click="switchView(tab.value)"
            >
                <span>{{ tab.label }}</span>
                <span v-if="getTabCount(tab.value)" class="tab-count">
                    {{ getTabCount(tab.value) }}
                </span>
            </button>
        </nav>

        <div class="workbench-content">
            <aside class="approval-list-panel">
                <div class="list-toolbar">
                    <div class="search-row">
                        <ErpSearchBox
                            v-model="searchText"
                            class="list-search"
                            placeholder="搜索审批单"
                            @search="applySearch"
                        />
                        <div class="filter-anchor" @click.stop>
                            <button
                                class="filter-trigger"
                                :class="{ active: hasAdvancedFilters }"
                                type="button"
                                title="筛选"
                                @click="showFilterDialog = !showFilterDialog"
                            >
                                <Icon name="material-symbols:filter-list" />
                            </button>
                        </div>
                    </div>

                    <div class="quick-filters">
                        <select v-model="typeFilter">
                            <option value="all">全部审批单</option>
                            <option value="sales-order">订单审批</option>
                            <option value="borrow">借用审批</option>
                            <option value="receipt">回款单审批</option>
                            <option value="purchase-request">采购申请</option>
                        </select>
                        <select v-if="activeView === 'pending'" v-model="sortOrder">
                            <option value="asc">按时间正序</option>
                            <option value="desc">按时间倒序</option>
                        </select>
                        <select
                            v-else-if="activeView === 'processed' || activeView === 'all'"
                            v-model="statusFilter"
                        >
                            <option value="all">全部状态</option>
                            <option value="pending">审核中</option>
                            <option value="approved">审核通过</option>
                            <option value="rejected">已驳回</option>
                            <option value="cancelled">已撤销</option>
                        </select>
                        <select v-else v-model="unreadFilter">
                            <option value="all">显示全部</option>
                            <option value="unread">仅显示未读</option>
                        </select>
                    </div>

                    <FilterDialog
                        v-if="showFilterDialog"
                        v-model="advancedFilters"
                        :applicants="applicantOptions"
                        @close="showFilterDialog = false"
                        @apply="showFilterDialog = false"
                    />
                </div>

                <div
                    ref="approvalList"
                    class="approval-list"
                    :class="{ empty: listItems.length === 0 }"
                    @scroll.passive="handleListScroll"
                >
                    <Card
                        v-for="item in listItems"
                        :key="item.id"
                        :item="item"
                        :selected="selectedId === item.id"
                        @select="selectApproval"
                    />
                    <div v-if="listItems.length === 0" class="empty-state">
                        <Icon name="lucide:inbox" />
                        <span>暂无内容</span>
                    </div>
                </div>
            </aside>

            <Detail
                v-if="selectedId && selectedApproval && !detailLoading"
                :approval="selectedApproval"
                :action-loading="actionLoading"
                :can-delete="canDeleteApproval"
                :can-reapply="activeView === 'mine'"
                :is-processed-view="activeView === 'processed'"
                @approve="handleApprove"
                @confirm-payment="handleConfirmPayment"
                @reject="openRejectDialog"
                @cancel="handleCancel"
                @delete="handleDelete"
                @reapply="handleReapply"
            />
            <div v-else class="detail-empty">
                <Icon name="lucide:clipboard-check" />
                <strong>{{ listItems.length ? "选择一条审批单查看详情" : "暂无内容" }}</strong>
            </div>
        </div>

        <div v-if="showRejectDialog" class="erp-dialog-mask" @click.self="closeRejectDialog">
            <ErpDialogFrame
                title="驳回申请"
                width="600px"
                height="384px"
                @close="closeRejectDialog"
                @submit.prevent="confirmReject"
            >
                <label class="reject-field">
                    <span>驳回原因</span>
                    <textarea
                        v-model="rejectReason"
                        maxlength="200"
                        placeholder="请输入驳回原因"
                    ></textarea>
                </label>
                <template #footer>
                    <button class="dialog-button cancel" type="button" @click="closeRejectDialog">取消</button>
                    <button class="dialog-button confirm" type="submit" :disabled="actionLoading">确认驳回</button>
                </template>
            </ErpDialogFrame>
        </div>
    </div>
</template>

<script setup lang="ts">
import Card from "~/components/approval/Card.vue";
import Detail from "~/components/approval/Detail.vue";
import FilterDialog from "~/components/approval/FilterDialog.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import {
    getApprovalErrorMessage,
    useApproval,
} from "~/composables/useApproval";
import { erpMessageBox } from "~/utils/erpMessageBox";
import type {
    ApprovalAdvancedFilters,
    ApprovalStatus,
    ApprovalType,
    ApprovalView,
} from "~/types/approval";
import { ADMIN_ROLE } from "~~/shared/enums";
definePageMeta({
    layout: "approval",
});

const route = useRoute();
const router = useRouter();
const {
    approve,
    confirmPayment,
    cancel,
    deleteApproval,
    applicantOptions,
    clearDetail,
    detail: selectedApproval,
    detailLoading,
    listData,
    listLoading,
    loadApplicantOptions,
    loadDetail,
    loadList,
    reject,
    pendingCount,
    unreadCounts,
} = useApproval();

const adminInfo = useState<{ role?: number }>("admin_info", () => ({}));
const isSuperAdmin = computed(() => Number(adminInfo.value?.role) === ADMIN_ROLE.SUPER);

const defaultTabs: Array<{ value: ApprovalView; label: string }> = [
    { value: "pending", label: "待处理" },
    { value: "processed", label: "已处理" },
    { value: "mine", label: "我发起的" },
    { value: "cc", label: "抄送我的" },
];
const tabs = computed<Array<{ value: ApprovalView; label: string }>>(() =>
    isSuperAdmin.value
        ? [...defaultTabs, { value: "all", label: "全部审批单" }]
        : defaultTabs,
);
const validViews = new Set<ApprovalView>([...defaultTabs.map((tab) => tab.value), "all"]);
const resolveRouteView = (value: unknown): ApprovalView => {
    const routeValue = Array.isArray(value) ? value[0] : value;
    if (routeValue === "all" && !isSuperAdmin.value) return "pending";
    const view = validViews.has(routeValue as ApprovalView)
        ? routeValue as ApprovalView
        : "pending";
    return view;
};

const activeView = ref<ApprovalView>(resolveRouteView(route.query.view));
const canDeleteApproval = computed(() =>
    isSuperAdmin.value
        && activeView.value === "all"
        && Boolean(selectedApproval.value),
);
const selectedId = ref<string | null>(null);
const searchText = ref("");
const appliedSearch = ref("");
const typeFilter = ref<ApprovalType | "all">("all");
const statusFilter = ref<ApprovalStatus | "all">("all");
const sortOrder = ref<"asc" | "desc">("asc");
const unreadFilter = ref<"all" | "unread">("all");
const showFilterDialog = ref(false);
const showRejectDialog = ref(false);
const rejectingId = ref("");
const rejectReason = ref("");
const actionLoading = ref(false);
const pageSize = 20;
const mounted = ref(false);
const approvalList = ref<HTMLElement | null>(null);
const advancedFilters = ref<ApprovalAdvancedFilters>({
    applicantId: "",
    submittedStart: "",
    submittedEnd: "",
    completedStart: "",
    completedEnd: "",
});

const listQuery = computed(() => ({
    view: activeView.value,
    keyword: appliedSearch.value,
    type: typeFilter.value,
    status: ["processed", "all"].includes(activeView.value)
        ? statusFilter.value
        : "all",
    unreadOnly: ["mine", "cc"].includes(activeView.value)
        && unreadFilter.value === "unread",
    sort: activeView.value === "pending" ? sortOrder.value : "desc",
    ...advancedFilters.value,
    pageSize,
}));
const listItems = computed(() => listData.value.items);
const pagination = computed(() => listData.value.pagination);
const hasAdvancedFilters = computed(() =>
    Object.values(advancedFilters.value).some(Boolean),
);
const getTabCount = (view: ApprovalView) =>
    view === "pending" ? pendingCount.value : unreadCounts.value[view];

const updateRouteView = () => {
    void router.replace({
        query: {
            view: activeView.value,
        },
    });
};

const refreshList = async () => {
    if (approvalList.value) approvalList.value.scrollTop = 0;
    try {
        await loadList(listQuery.value);
    } catch (error) {
        ElMessage.error(getApprovalErrorMessage(error, "获取审批列表失败"));
        return;
    }
    if (!selectedId.value) return;
    if (!listItems.value.some((item) => item.id === selectedId.value)) {
        selectedId.value = null;
        clearDetail();
    }
};

const loadMore = async () => {
    const cursor = pagination.value.nextCursor;
    if (listLoading.value || !pagination.value.hasMore || !cursor) return;
    try {
        await loadList({
            ...listQuery.value,
            cursor,
        }, true);
    } catch (error) {
        ElMessage.error(getApprovalErrorMessage(error, "加载更多审批单失败"));
    }
};

const handleListScroll = (event: Event) => {
    const element = event.currentTarget as HTMLElement;
    const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distanceToBottom <= 80) void loadMore();
};

onMounted(() => {
    mounted.value = true;
    updateRouteView();
    void refreshList();
    void loadApplicantOptions().catch((error) => {
        ElMessage.error(getApprovalErrorMessage(error, "获取申请人列表失败"));
    });
});

const applySearch = () => {
    appliedSearch.value = searchText.value.trim();
};

const switchView = (view: ApprovalView) => {
    if (activeView.value === view) return;
    activeView.value = view;
    unreadFilter.value = "all";
    selectedId.value = null;
    clearDetail();
    updateRouteView();
};

const selectApproval = async (id: string) => {
    selectedId.value = id;
    try {
        await loadDetail(id, true);
    } catch (error) {
        if (selectedId.value === id) {
            selectedId.value = null;
            clearDetail();
        }
        ElMessage.error(getApprovalErrorMessage(error, "获取审批详情失败"));
    }
};

const handleReapply = async (id: string) => {
    if (actionLoading.value || activeView.value !== "mine"
        || selectedApproval.value?.id !== id || selectedApproval.value.canReapply !== true) return;
    await router.push({
        path: "/configuration/approval/initiate",
        query: { reapply: id },
    });
};

const refreshAfterAction = async (id: string) => {
    await refreshList();
    if (selectedId.value !== id) return;
    if (!listItems.value.some((item) => item.id === id)) return;
    try {
        await loadDetail(id);
    } catch {
        clearDetail();
    }
};

const handleApprove = async (id: string) => {
    if (actionLoading.value) return;
    actionLoading.value = true;
    try {
        await approve(id);
        ElMessage.success("已同意申请");
        await refreshAfterAction(id);
    } catch (error) {
        ElMessage.error(getApprovalErrorMessage(error, "同意申请失败"));
    } finally {
        actionLoading.value = false;
    }
};

const handleConfirmPayment = async (id: string) => {
    if (actionLoading.value) return;
    actionLoading.value = true;
    try {
        await confirmPayment(id);
        ElMessage.success("已确认用户打款");
        await refreshAfterAction(id);
    } catch (error) {
        ElMessage.error(getApprovalErrorMessage(error, "确认用户打款失败"));
    } finally {
        actionLoading.value = false;
    }
};

const openRejectDialog = (id: string) => {
    rejectingId.value = id;
    rejectReason.value = "";
    showRejectDialog.value = true;
};

const closeRejectDialog = () => {
    showRejectDialog.value = false;
    rejectingId.value = "";
    rejectReason.value = "";
};

const confirmReject = async () => {
    if (!rejectReason.value.trim()) {
        ElMessage.warning("请输入驳回原因");
        return;
    }
    if (actionLoading.value) return;
    actionLoading.value = true;
    const id = rejectingId.value;
    try {
        await reject(id, rejectReason.value.trim());
        ElMessage.success("已驳回申请");
        closeRejectDialog();
        await refreshAfterAction(id);
    } catch (error) {
        ElMessage.error(getApprovalErrorMessage(error, "驳回申请失败"));
    } finally {
        actionLoading.value = false;
    }
};

const handleCancel = async (id: string) => {
    if (actionLoading.value) return;
    try {
        await erpMessageBox.confirm(
            "撤销后审批流程将立即停止，是否继续？",
            "撤销审批",
            {
                confirmButtonText: "确认撤销",
                cancelButtonText: "取消",
                type: "warning",
            },
        );
    } catch {
        return;
    }

    actionLoading.value = true;
    try {
        await cancel(id);
        ElMessage.success("审批单已撤销");
        await refreshAfterAction(id);
    } catch (error) {
        ElMessage.error(getApprovalErrorMessage(error, "撤销审批失败"));
    } finally {
        actionLoading.value = false;
    }
};

const handleDelete = async (id: string) => {
    if (!canDeleteApproval.value || actionLoading.value) return;
    const requiresReason = selectedApproval.value?.type === "sales-order"
        && selectedApproval.value.status === "pending";
    let deletionReason = "";
    try {
        if (requiresReason) {
            const { value } = await erpMessageBox.prompt(
                "删除后审批单记录将无法恢复，关联销售订单将变为已驳回。请输入删除理由。",
                "删除审批单",
                {
                    confirmButtonText: "确认删除",
                    cancelButtonText: "取消",
                    type: "warning",
                    inputPlaceholder: "请输入删除理由",
                    inputValidator: (value) => String(value || "").trim()
                        ? true
                        : "请填写删除理由",
                },
            );
            deletionReason = String(value || "").trim();
        } else {
            await erpMessageBox.confirm(
                "删除后审批单记录将无法恢复，是否继续？",
                "删除审批单",
                {
                    confirmButtonText: "确认删除",
                    cancelButtonText: "取消",
                    type: "warning",
                },
            );
        }
    } catch {
        return;
    }

    actionLoading.value = true;
    try {
        await deleteApproval(id, deletionReason);
        ElMessage.success("审批单已删除");
        selectedId.value = null;
        clearDetail();
        await refreshList();
    } catch (error) {
        ElMessage.error(getApprovalErrorMessage(error, "删除审批单失败"));
    } finally {
        actionLoading.value = false;
    }
};

watch(
    () => route.query.view,
    (value) => {
        const routeValue = Array.isArray(value) ? value[0] : value;
        if (routeValue === "all" && !isSuperAdmin.value) {
            if (activeView.value !== "pending") {
                activeView.value = "pending";
                unreadFilter.value = "all";
                selectedId.value = null;
                clearDetail();
            }
            updateRouteView();
            return;
        }
        const view = resolveRouteView(value);
        if (activeView.value === view) return;
        activeView.value = view;
        unreadFilter.value = "all";
        selectedId.value = null;
        clearDetail();
    },
);

watch(
    isSuperAdmin,
    (canViewAll) => {
        const routeView = Array.isArray(route.query.view)
            ? route.query.view[0]
            : route.query.view;
        if (!canViewAll && activeView.value === "all") {
            activeView.value = "pending";
            selectedId.value = null;
            clearDetail();
            updateRouteView();
            return;
        }
        if (canViewAll && routeView === "all" && activeView.value !== "all") {
            activeView.value = "all";
            selectedId.value = null;
            clearDetail();
        }
    },
    { immediate: true },
);

watch(
    listQuery,
    () => {
        if (mounted.value) void refreshList();
    },
    { deep: true },
);
</script>

<style scoped>
.approval-workbench {
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: 52px minmax(0, 1fr);
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
}

.view-tabs {
    min-width: 0;
    display: flex;
    align-items: stretch;
    gap: var(--erp-spacing-20);
    padding: 0 var(--erp-spacing-12);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.view-tab {
    position: relative;
    min-width: 64px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    padding: 0;
    border: 0;
    color: var(--erp-color-text-secondary);
    background: transparent;
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
    cursor: pointer;
}

.view-tab::after {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 2px;
    border-radius: var(--erp-radius-control-pill);
    background: transparent;
    content: "";
}

.view-tab.active {
    color: var(--erp-color-text-brand);
}

.view-tab.active::after {
    background: var(--erp-color-action-primary);
}

.tab-count {
    min-width: 18px;
    height: 18px;
    display: inline-grid;
    place-items: center;
    padding: 0 var(--erp-spacing-4);
    border-radius: var(--erp-radius-control-pill);
    color: var(--erp-color-text-white);
    background: var(--erp-color-function-red-500);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.workbench-content {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-columns: 340px minmax(0, 1fr);
    gap: var(--erp-spacing-12);
    overflow: hidden;
}

.approval-list-panel {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--erp-spacing-12);
    overflow: visible;
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-bg-page);
}

.list-toolbar {
    position: relative;
    display: grid;
    gap: var(--erp-spacing-12);
    padding: var(--erp-spacing-12);
    background: var(--erp-color-fill-default);
}

.search-row,
.quick-filters {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-8);
}

.list-search {
    width: auto;
    min-width: 0;
    flex: 1;
    box-shadow: none;
    border: 1px solid var(--erp-color-border-muted);
}

.filter-anchor {
    position: relative;
    flex: 0 0 var(--erp-size-control-height-md);
}

.filter-trigger {
    width: var(--erp-size-control-height-md);
    height: var(--erp-size-control-height-md);
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-icon-default);
    background: var(--erp-color-fill-default);
    cursor: pointer;
}

.filter-trigger.active {
    border-color: var(--erp-color-border-brand);
    color: var(--erp-color-icon-brand);
    background: var(--erp-color-fill-nav-selected);
}

.filter-trigger :deep(svg) {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.quick-filters select {
    min-width: 0;
    height: var(--erp-size-control-height-sm);
    flex: 1;
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content2-font-size);
}

.approval-list {
    min-width: 0;
    min-height: 0;
    display: grid;
    align-content: start;
    gap: var(--erp-spacing-12);
    padding: var(--erp-spacing-12);
    overflow-x: hidden;
    overflow-y: auto;
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.approval-list.empty {
    align-content: stretch;
}

.empty-state,
.detail-empty {
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: var(--erp-spacing-8);
    color: var(--erp-color-text-tertiary);
}

.empty-state :deep(svg),
.detail-empty :deep(svg) {
    width: var(--erp-spacing-40);
    height: var(--erp-spacing-40);
}

.detail-empty {
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.detail-empty strong {
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
}

.reject-field {
    width: 384px;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: start;
    gap: var(--erp-spacing-12);
    margin: 0 auto;
}

.reject-field > span {
    line-height: var(--erp-size-control-height-sm);
}

.reject-field > span::after {
    color: var(--erp-color-text-required);
    content: "*";
}

.reject-field textarea {
    min-height: 96px;
    padding: var(--erp-spacing-8) var(--erp-spacing-12);
    resize: none;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
}

.reject-field textarea:focus {
    border-color: var(--erp-color-border-brand);
}

@media (max-width: 1050px) {
    .workbench-content {
        grid-template-columns: 300px minmax(0, 1fr);
    }
}
</style>
