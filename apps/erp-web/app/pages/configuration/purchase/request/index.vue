<template>
    <div class="purchase-request-page">
        <header class="topbar">
            <ErpBreadcrumb icon="lucide:clipboard-list" :items="breadcrumbItems" />
        </header>

        <section class="filter-panel" aria-label="采购申请筛选">
            <div class="filter-grid">
                <label class="filter-field">
                    <span>发起人</span>
                    <input
                        v-if="canViewAll"
                        v-model.trim="filterForm.applicant"
                        :disabled="loading || draftMode"
                        placeholder="请填写"
                        @keyup.enter="applyFilters"
                    >
                    <input v-else :value="currentUserName" disabled>
                </label>
                <label class="filter-field">
                    <span>采购类别</span>
                    <select v-model="filterForm.category" :disabled="loading">
                        <option value="">请选择</option>
                        <option v-for="category in PURCHASE_REQUEST_CATEGORIES" :key="category" :value="category">
                            {{ category }}
                        </option>
                    </select>
                </label>
                <label class="filter-field">
                    <span>部门</span>
                    <select v-model="filterForm.department" :disabled="loading">
                        <option value="">请选择</option>
                        <option v-for="department in PURCHASE_REQUEST_DEPARTMENTS" :key="department" :value="department">
                            {{ department }}
                        </option>
                    </select>
                </label>
                <label class="filter-field">
                    <span>审批状态</span>
                    <select v-model="filterForm.status" :disabled="loading || draftMode">
                        <option value="">请选择</option>
                        <option value="pending">审核中</option>
                        <option value="approved">审核通过</option>
                        <option value="partially_ordered">部分下单</option>
                        <option value="ordered">已下单</option>
                        <option value="rejected">已驳回</option>
                    </select>
                </label>
                <label class="filter-field">
                    <span>审批编号</span>
                    <input
                        v-model.trim="filterForm.approvalNo"
                        :disabled="loading || draftMode"
                        placeholder="请填写"
                        @keyup.enter="applyFilters"
                    >
                </label>
                <template v-if="filtersExpanded">
                    <div class="filter-field date-field">
                        <span>{{ draftMode ? "保存时间" : "发起时间" }}</span>
                        <div class="date-range">
                            <input v-model="filterForm.startDate" type="date" :disabled="loading">
                            <span>至</span>
                            <input v-model="filterForm.endDate" type="date" :disabled="loading">
                        </div>
                    </div>
                </template>
            </div>
            <div class="filter-actions">
                <button class="text-button" type="button" @click="filtersExpanded = !filtersExpanded">
                    <Icon :name="filtersExpanded ? 'lucide:chevron-up' : 'lucide:chevron-down'" />
                    <span>{{ filtersExpanded ? "收起" : "展开" }}</span>
                </button>
                <button class="primary-button" type="button" :disabled="loading" @click="applyFilters">
                    <Icon name="lucide:list-filter" />
                    <span>筛选</span>
                </button>
                <button class="icon-button" type="button" :disabled="loading" title="重置" @click="resetFilters">
                    <Icon name="lucide:rotate-cw" />
                </button>
            </div>
        </section>

        <div class="toolbar">
            <div class="toolbar-left">
                <button class="primary-button" type="button" @click="openCreateDialog">
                    <Icon name="lucide:circle-plus" />
                    <span>发起采购申请</span>
                </button>
                <button
                    v-if="canManagePurchaseOrder"
                    class="primary-button"
                    type="button"
                    :disabled="selectedRequestIds.size === 0"
                    @click="showOrderDialog = true"
                >
                    <Icon name="lucide:shopping-cart" />
                    <span>生成采购单</span>
                </button>
                <button
                    class="outline-button"
                    :class="{ active: draftMode }"
                    type="button"
                    @click="toggleDraftMode"
                >
                    <Icon name="lucide:archive" />
                    <span>草稿箱</span>
                    <b v-if="draftCount">{{ draftCount }}</b>
                </button>
            </div>
            <button class="icon-button" type="button" :disabled="loading" title="刷新" @click="loadRequests">
                <Icon name="lucide:refresh-cw" :class="{ spinning: loading }" />
            </button>
        </div>

        <section class="table-wrap" aria-label="采购申请列表">
            <ErpTableFrame
                :columns="tableColumns"
                minimum-width="2008px"
                :loading="loading"
                :empty="rows.length === 0"
                loading-text="加载中..."
                :empty-text="draftMode ? '暂无采购申请草稿' : '暂无匹配采购申请'"
                scroll-x
            >
                <template #header>
                    <div class="table-row table-head">
                        <div class="table-cell selection-cell">
                            <input
                                type="checkbox"
                                :checked="rows.length > 0 && rows.every((row) => selectedRequestIds.has(row.id))"
                                aria-label="全选当前页采购申请"
                                @change="toggleCurrentPageSelection"
                            >
                        </div>
                        <div class="table-cell">申请编号</div>
                        <div class="table-cell">审批编号</div>
                        <div class="table-cell">发起人</div>
                        <div class="table-cell">采购类别</div>
                        <div class="table-cell">部门</div>
                        <div class="table-cell">关联单号</div>
                        <div class="table-cell">采购明细</div>
                        <div class="table-cell">总数量</div>
                        <div class="table-cell">单位</div>
                        <div class="table-cell">审批状态</div>
                        <div class="table-cell">当前节点</div>
                        <div class="table-cell">{{ draftMode ? "保存时间" : "发起时间" }}</div>
                        <div class="table-cell action-column erp-table-fixed-end">操作</div>
                    </div>
                </template>
                <div v-for="row in rows" :key="`${row.status}-${row.id}`" class="table-row data-row">
                    <div class="table-cell selection-cell">
                        <input
                            type="checkbox"
                            :checked="selectedRequestIds.has(row.id)"
                            :aria-label="`选择采购申请${row.requestNo}`"
                            @change="toggleRequestSelection(row.id)"
                        >
                    </div>
                    <div class="table-cell" :title="row.requestNo">{{ row.requestNo }}</div>
                    <div class="table-cell" :title="row.approvalNo || '--'">{{ row.approvalNo || "--" }}</div>
                    <div class="table-cell" :title="row.applicant.name">{{ row.applicant.name }}</div>
                    <div class="table-cell" :title="row.category || '--'">{{ row.category || "--" }}</div>
                    <div class="table-cell" :title="row.department || '--'">{{ row.department || "--" }}</div>
                    <div class="table-cell" :title="formatRelatedOrderNo(row)">{{ formatRelatedOrderNo(row) }}</div>
                    <div class="table-cell" :title="formatItemSummary(row)">{{ formatItemSummary(row) }}</div>
                    <div class="table-cell">{{ formatQuantity(row.totalQuantity) }}</div>
                    <div class="table-cell" :title="formatUnits(row)">{{ formatUnits(row) }}</div>
                    <div class="table-cell">
                        <span class="status-tag" :class="`status-${row.displayStatus || row.status}`">
                            {{ statusLabels[row.displayStatus || row.status] }}
                        </span>
                    </div>
                    <div class="table-cell">{{ row.currentStep || "--" }}</div>
                    <div class="table-cell">{{ formatDateTime(draftMode ? row.updateTime : row.createTime) }}</div>
                    <div class="table-cell action-cell action-column erp-table-fixed-end">
                        <template v-if="row.status === 'draft'">
                            <button class="row-action" type="button" title="编辑草稿" :disabled="actionLoading" @click="editDraft(row)">
                                <Icon name="lucide:square-pen" />
                            </button>
                            <button class="row-action" type="button" title="提交审批" :disabled="actionLoading" @click="submitDraft(row)">
                                <Icon name="lucide:send" />
                            </button>
                            <button class="row-action danger" type="button" title="删除草稿" :disabled="actionLoading" @click="deleteDraft(row)">
                                <Icon name="lucide:trash-2" />
                            </button>
                        </template>
                        <template v-else>
                            <button
                                v-if="canResubmitRequest(row)"
                                class="row-action"
                                type="button"
                                title="修改后重新提交"
                                :disabled="actionLoading"
                                @click="editDraft(row)"
                            >
                                <Icon name="lucide:square-pen" />
                            </button>
                            <button
                                v-if="canWithdrawRequest(row)"
                                class="row-action"
                                type="button"
                                title="撤回申请"
                                :disabled="actionLoading"
                                @click="withdrawRequest(row)"
                            >
                                <Icon name="lucide:undo-2" />
                            </button>
                            <button class="row-action" type="button" title="查看详情" :disabled="actionLoading" @click="openDetail(row)">
                                <Icon name="lucide:eye" />
                            </button>
                            <button
                                v-if="canDeleteSubmitted"
                                class="row-action danger"
                                type="button"
                                title="删除申请"
                                :disabled="actionLoading"
                                @click="deleteSubmitted(row)"
                            >
                                <Icon name="lucide:trash-2" />
                            </button>
                        </template>
                    </div>
                </div>
            </ErpTableFrame>
        </section>

        <InventoryPagination
            v-model:page-size="pageSize"
            v-model:jump-page-input="jumpPageInput"
            :total="totalRows"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="changePage"
            @jump="jumpPage"
        />

        <PurchaseRequestDialog
            v-if="showRequestDialog"
            :initial-draft="editingDraft"
            @close="closeRequestDialog"
            @saved="handleDialogComplete(true)"
            @submitted="handleDialogComplete(false)"
        />

        <PurchaseRequestOrderDialog
            v-if="showOrderDialog"
            :submitting="orderSubmitting"
            :selected-request-ids="selectedRequestIdList"
            :selected-requests="selectedRequestList"
            @close="showOrderDialog = false"
            @confirm="createPurchaseOrder"
        />

        <div v-if="showDetailDialog" class="erp-dialog-mask" @click.self="closeDetail">
            <div class="request-detail-modal">
                <button class="detail-close" type="button" title="关闭" @click="closeDetail">
                    <Icon name="lucide:x" />
                </button>
                <Detail
                    v-if="selectedDetail"
                    :approval="selectedDetail"
                    :action-loading="actionLoading"
                    :action-mode="canReviewPurchaseRequest ? 'all' : 'none'"
                    @approve="approveRequest"
                    @reject="rejectRequest"
                    @cancel="cancelRequestDetail"
                />
                <div v-else class="detail-loading">
                    <Icon name="lucide:loader-circle" class="spinning" />
                    <span>加载中...</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import Detail from "~/components/approval/Detail.vue";
import PurchaseRequestDialog from "~/components/approval/PurchaseRequestDialog.vue";
import PurchaseRequestOrderDialog from "~/components/configuration/purchase/PurchaseRequestOrderDialog.vue";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import {
    approveApproval,
    cancelApproval,
    deletePurchaseRequestDraft,
    deleteSubmittedPurchaseRequest,
    retrievePurchaseRequestDetail,
    retrievePurchaseRequestDraft,
    retrievePurchaseRequestPage,
    rejectApproval,
    submitPurchaseRequest,
} from "~/composables/api/useApprovalApi";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import { addPurchaseOrder } from "~/composables/api/usePurchaseOrderApi";
import type {
    ApprovalDetailItem,
    PurchaseRequestDisplayStatus,
    PurchaseRequestListItem,
} from "~/types/approval";
import { erpMessageBox } from "~/utils/erpMessageBox";
import type { PurchaseOrderMutationPayload } from "~~/shared/types/purchase";
import {
    canManagePurchaseOrder as canManagePurchaseOrderByRole,
    canSubmitPurchaseRequest,
    isElectronicsWarehouseKeeper,
} from "~~/shared/utils/adminPermission";
import {
    PURCHASE_REQUEST_CATEGORIES,
    PURCHASE_REQUEST_DEPARTMENTS,
    type PurchaseRequestCategory,
    type PurchaseRequestDepartment,
} from "~~/shared/types/approval";

definePageMeta({
    layout: "purchase",
});

useHead({ title: "采购申请" });

const breadcrumbItems = [
    { label: "采购管理" },
    { label: "采购申请" },
];
const tableColumns = "48px 160px 170px 130px 150px 110px 170px minmax(230px, 1fr) 110px 110px 120px 130px 190px 180px";
const statusLabels: Record<PurchaseRequestDisplayStatus, string> = {
    draft: "草稿",
    pending: "审核中",
    approved: "审核通过",
    partially_ordered: "部分下单",
    ordered: "已下单",
    rejected: "已驳回",
    cancelled: "已撤销",
};

const adminInfo = useState<any>("admin_info", () => ({}));
const canManagePurchaseOrder = computed(() =>
    canManagePurchaseOrderByRole(Number(adminInfo.value?.role)),
);
const canReviewPurchaseRequest = computed(() =>
    isElectronicsWarehouseKeeper(Number(adminInfo.value?.role)),
);
const currentUserName = computed(() =>
    String(adminInfo.value?.nickname || adminInfo.value?.username || "当前用户"),
);
const rows = ref<PurchaseRequestListItem[]>([]);
const selectedRequestIds = ref<Set<string>>(new Set());
const selectedRequests = ref<Map<string, PurchaseRequestListItem>>(new Map());
const selectedRequestIdList = computed(() => [...selectedRequestIds.value]);
const selectedRequestList = computed(() => {
    const selectedMap = new Map(selectedRequests.value);
    rows.value.forEach((row) => {
        if (selectedRequestIds.value.has(row.id)) selectedMap.set(row.id, row);
    });
    return [...selectedMap.values()];
});
const totalRows = ref(0);
const draftCount = ref(0);
const canViewAll = ref(false);
const canDeleteSubmitted = ref(false);
const loading = ref(false);
const actionLoading = ref(false);
const draftMode = ref(false);
const filtersExpanded = ref(true);
const showRequestDialog = ref(false);
const showOrderDialog = ref(false);
const orderSubmitting = ref(false);
const editingDraft = ref<PurchaseRequestListItem | null>(null);
const showDetailDialog = ref(false);
const selectedDetail = ref<ApprovalDetailItem | null>(null);
const filterForm = reactive({
    category: "",
    department: "" as PurchaseRequestDepartment | "",
    status: "" as Exclude<PurchaseRequestDisplayStatus, "draft"> | "",
    approvalNo: "",
    applicant: "",
    startDate: "",
    endDate: "",
});
const appliedFilters = reactive({ ...filterForm });
const {
    pageSizeOptions,
    pageSize,
    pageNumbers,
    totalPages,
    currentPage,
    jumpPageInput,
    setTotalItems,
    goToPage,
    jumpToInputPage,
} = useInventoryPagination({
    pageSizeOptions: [10, 15, 20, 50],
    initialPageSize: 15,
});

const getErrorMessage = (error: any, fallback: string) =>
    error?.data?.msg || error?.message || fallback;

const loadRequests = async () => {
    if (loading.value) return;
    loading.value = true;
    try {
        const response = await retrievePurchaseRequestPage({
            page: currentPage.value,
            limit: pageSize.value,
            drafts: draftMode.value,
            category: appliedFilters.category as PurchaseRequestCategory | "",
            department: appliedFilters.department,
            status: draftMode.value ? "" : appliedFilters.status,
            approvalNo: draftMode.value ? "" : appliedFilters.approvalNo,
            applicant: draftMode.value ? "" : appliedFilters.applicant,
            startDate: appliedFilters.startDate,
            endDate: appliedFilters.endDate,
        });
        if (response.code !== 200 || !response.data) {
            throw new Error(response.msg || "获取采购申请失败");
        }
        rows.value = response.data.list || [];
        const nextSelectedRequests = new Map(selectedRequests.value);
        rows.value.forEach((row) => {
            if (selectedRequestIds.value.has(row.id)) nextSelectedRequests.set(row.id, row);
        });
        selectedRequests.value = nextSelectedRequests;
        totalRows.value = response.data.pagination.total || 0;
        draftCount.value = response.data.draftCount || 0;
        canViewAll.value = Boolean(response.data.canViewAll);
        canDeleteSubmitted.value = Boolean(response.data.canDeleteSubmitted);
        setTotalItems(totalRows.value);
    } catch (error: any) {
        rows.value = [];
        totalRows.value = 0;
        canDeleteSubmitted.value = false;
        setTotalItems(0);
        ElMessage.error(getErrorMessage(error, "获取采购申请失败"));
    } finally {
        loading.value = false;
    }
};

const toggleRequestSelection = (id: string) => {
    const next = new Set(selectedRequestIds.value);
    const selectedMap = new Map(selectedRequests.value);
    if (next.has(id)) next.delete(id);
    else {
        next.add(id);
        const row = rows.value.find((item) => item.id === id);
        if (row) selectedMap.set(id, row);
    }
    if (!next.has(id)) selectedMap.delete(id);
    selectedRequestIds.value = next;
    selectedRequests.value = selectedMap;
};

const toggleCurrentPageSelection = (event: Event) => {
    const checked = (event.target as HTMLInputElement).checked;
    const next = new Set(selectedRequestIds.value);
    const selectedMap = new Map(selectedRequests.value);
    rows.value.forEach((row) => checked ? next.add(row.id) : next.delete(row.id));
    rows.value.forEach((row) => checked ? selectedMap.set(row.id, row) : selectedMap.delete(row.id));
    selectedRequestIds.value = next;
    selectedRequests.value = selectedMap;
};

const validateDateRange = () => {
    if (
        filterForm.startDate
        && filterForm.endDate
        && filterForm.startDate > filterForm.endDate
    ) {
        ElMessage.warning("开始日期不能晚于结束日期");
        return false;
    }
    return true;
};

const applyFilters = () => {
    if (!validateDateRange()) return;
    Object.assign(appliedFilters, filterForm);
    goToPage(1);
    void loadRequests();
};

const resetFilters = () => {
    Object.assign(filterForm, {
        category: "",
        department: "",
        status: "",
        approvalNo: "",
        applicant: "",
        startDate: "",
        endDate: "",
    });
    applyFilters();
};

const toggleDraftMode = () => {
    draftMode.value = !draftMode.value;
    filterForm.status = "";
    filterForm.approvalNo = "";
    filterForm.applicant = "";
    Object.assign(appliedFilters, filterForm);
    goToPage(1);
    void loadRequests();
};

const changePage = (page: number) => {
    goToPage(page);
    void loadRequests();
};

const jumpPage = () => {
    jumpToInputPage();
    void loadRequests();
};

const openCreateDialog = () => {
    editingDraft.value = null;
    showRequestDialog.value = true;
};

const createPurchaseOrder = async (payload: PurchaseOrderMutationPayload) => {
    if (orderSubmitting.value) return;
    orderSubmitting.value = true;
    try {
        const response = await addPurchaseOrder(payload);
        if (response.code !== 200) throw new Error(response.msg || "生成采购单失败");
        const createdId = response.data?.id || response.data?.detail?._id || response.data?.detail?.id || "";
        const orderNo = response.data?.detail?.orderNo || "";
        showOrderDialog.value = false;
        if (!createdId || !orderNo) {
            ElMessage.error("采购单已生成，但返回数据不完整，请到采购单列表核对");
            await loadRequests();
            return;
        }
        ElMessage.success(`采购单 ${orderNo} 生成成功`);
        try {
            await navigateTo({
                path: "/configuration/purchase/order",
                query: { createdOrderId: createdId, orderNo },
            });
        } catch {
            ElMessage.warning(`采购单 ${orderNo} 已生成，请前往采购单列表查看`);
            await loadRequests();
        }
    } catch (error: any) {
        ElMessage.error(getErrorMessage(error, "生成采购单失败"));
    } finally {
        orderSubmitting.value = false;
    }
};

const closeRequestDialog = () => {
    showRequestDialog.value = false;
    editingDraft.value = null;
};

const editDraft = async (row: PurchaseRequestListItem) => {
    if (actionLoading.value) return;
    try {
        const response = await retrievePurchaseRequestDraft(row.id);
        if (response.code !== 200 || !response.data?.detail) {
            throw new Error(response.msg || "获取采购申请失败");
        }
        editingDraft.value = response.data.detail;
        showRequestDialog.value = true;
    } catch (error: any) {
        ElMessage.error(getErrorMessage(error, "获取采购申请失败"));
    }
};

const handleDialogComplete = (savedAsDraft: boolean) => {
    closeRequestDialog();
    if (savedAsDraft) draftMode.value = true;
    goToPage(1);
    void loadRequests();
};

const buildDraftSubmitForm = (row: PurchaseRequestListItem) => {
    const formData = new FormData();
    formData.append("resource", "purchase-request");
    formData.append("action", "submit");
    formData.append("requestId", row.id);
    formData.append("expectedUpdateTime", row.updateTime);
    formData.append("category", row.category);
    formData.append("department", row.department || "");
    if (row.productionOrderId) {
        formData.append("productionOrderId", row.productionOrderId);
        formData.append("productionOrderNo", row.productionOrderNo || "");
    }
    if (row.salesOrderId) {
        formData.append("salesOrderId", row.salesOrderId);
        formData.append("salesOrderNo", row.salesOrderNo || "");
    }
    formData.append("items", JSON.stringify(row.items));
    formData.append("attachmentText", row.attachmentText ?? "");
    formData.append("remark", row.remark || "");
    formData.append("imagesExisting", JSON.stringify(row.images || []));
    formData.append("attachmentsExisting", JSON.stringify(row.attachments || []));
    return formData;
};

const reloadAfterRowRemoval = async () => {
    if (rows.value.length === 1 && currentPage.value > 1) {
        goToPage(currentPage.value - 1);
    }
    await loadRequests();
};

const submitDraft = async (row: PurchaseRequestListItem) => {
    if (actionLoading.value) return;
    if (!row.department) {
        ElMessage.warning("请先选择部门后提交采购申请");
        await editDraft(row);
        return;
    }
    try {
        await erpMessageBox.confirm(
            `确认提交采购申请草稿 ${row.requestNo}？`,
            "提交采购申请",
            { confirmButtonText: "提交", cancelButtonText: "取消", type: "warning" },
        );
    } catch {
        return;
    }
    actionLoading.value = true;
    try {
        const response = await submitPurchaseRequest(buildDraftSubmitForm(row));
        if (response.code !== 200) throw new Error(response.msg || "采购申请提交失败");
        ElMessage.success("采购申请已提交");
        await reloadAfterRowRemoval();
    } catch (error: any) {
        ElMessage.error(getErrorMessage(error, "采购申请提交失败"));
    } finally {
        actionLoading.value = false;
    }
};

const deleteDraft = async (row: PurchaseRequestListItem) => {
    if (actionLoading.value) return;
    try {
        await erpMessageBox.confirm(
            `确认删除采购申请草稿 ${row.requestNo}？`,
            "删除草稿",
            { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" },
        );
    } catch {
        return;
    }
    actionLoading.value = true;
    try {
        const response = await deletePurchaseRequestDraft(row.id);
        if (response.code !== 200) throw new Error(response.msg || "草稿删除失败");
        ElMessage.success("采购申请草稿已删除");
        await reloadAfterRowRemoval();
    } catch (error: any) {
        ElMessage.error(getErrorMessage(error, "草稿删除失败"));
    } finally {
        actionLoading.value = false;
    }
};

const openDetail = async (row: PurchaseRequestListItem) => {
    if (actionLoading.value) return;
    showDetailDialog.value = true;
    selectedDetail.value = null;
    try {
        const response = await retrievePurchaseRequestDetail(row.approvalId);
        if (response.code !== 200 || !response.data?.detail) {
            throw new Error(response.msg || "获取采购申请详情失败");
        }
        selectedDetail.value = response.data.detail;
    } catch (error: any) {
        showDetailDialog.value = false;
        ElMessage.error(getErrorMessage(error, "获取采购申请详情失败"));
    }
};

const closeDetail = () => {
    if (actionLoading.value) return;
    showDetailDialog.value = false;
    selectedDetail.value = null;
};

const refreshDetailAfterReview = async (id: string) => {
    const response = await retrievePurchaseRequestDetail(id);
    if (response.code !== 200 || !response.data?.detail) {
        throw new Error(response.msg || "获取采购申请详情失败");
    }
    selectedDetail.value = response.data.detail;
    await loadRequests();
};

const approveRequest = async (id: string) => {
    if (actionLoading.value || !canReviewPurchaseRequest.value || !selectedDetail.value?.canApprove) return;
    actionLoading.value = true;
    try {
        const response = await approveApproval(id);
        if (response.code !== 200) throw new Error(response.msg || "同意申请失败");
        ElMessage.success("已同意申请");
        await refreshDetailAfterReview(id);
    } catch (error: any) {
        ElMessage.error(getErrorMessage(error, "同意申请失败"));
    } finally {
        actionLoading.value = false;
    }
};

const rejectRequest = async (id: string) => {
    if (actionLoading.value || !canReviewPurchaseRequest.value || !selectedDetail.value?.canReject) return;
    let reason = "";
    try {
        const result = await erpMessageBox.prompt("请输入驳回原因", "驳回采购申请", {
            inputType: "textarea",
            inputValidator: (value) => Boolean(value?.trim()) || "请输入驳回原因",
            confirmButtonText: "驳回",
            cancelButtonText: "取消",
        });
        reason = typeof result === "object" ? result.value.trim() : "";
    } catch {
        return;
    }
    if (!reason) return;
    actionLoading.value = true;
    try {
        const response = await rejectApproval(id, reason);
        if (response.code !== 200) throw new Error(response.msg || "驳回申请失败");
        ElMessage.success("已驳回申请");
        await refreshDetailAfterReview(id);
    } catch (error: any) {
        ElMessage.error(getErrorMessage(error, "驳回申请失败"));
    } finally {
        actionLoading.value = false;
    }
};

const cancelRequestDetail = async (id: string) => {
    if (actionLoading.value || !canReviewPurchaseRequest.value || !selectedDetail.value?.canCancel) return;
    actionLoading.value = true;
    try {
        const response = await cancelApproval(id);
        if (response.code !== 200) throw new Error(response.msg || "撤回申请失败");
        ElMessage.success("采购申请已撤回至草稿箱");
        showDetailDialog.value = false;
        selectedDetail.value = null;
        await loadRequests();
    } catch (error: any) {
        ElMessage.error(getErrorMessage(error, "撤回申请失败"));
    } finally {
        actionLoading.value = false;
    }
};

const canResubmitRequest = (row: PurchaseRequestListItem) =>
    row.status === "rejected"
    && canSubmitPurchaseRequest(Number(adminInfo.value?.role))
    && Boolean(adminInfo.value?.username)
    && row.applicant.username === adminInfo.value?.username;

const canWithdrawRequest = (row: PurchaseRequestListItem) =>
    !canDeleteSubmitted.value
    && row.status === "pending"
    && Boolean(adminInfo.value?.username)
    && row.applicant.username === adminInfo.value?.username;

const withdrawRequest = async (row: PurchaseRequestListItem) => {
    if (actionLoading.value || !canWithdrawRequest(row)) return;
    try {
        await erpMessageBox.confirm(
            "撤回后申请将进入草稿箱，可编辑后重新提交。是否继续？",
            "撤回采购申请",
            { confirmButtonText: "撤回", cancelButtonText: "取消", type: "warning" },
        );
    } catch {
        return;
    }
    actionLoading.value = true;
    try {
        const response = await cancelApproval(row.approvalId);
        if (response.code !== 200) throw new Error(response.msg || "采购申请撤回失败");
        ElMessage.success("采购申请已撤回至草稿箱");
        draftMode.value = true;
        filterForm.status = "";
        filterForm.approvalNo = "";
        filterForm.applicant = "";
        Object.assign(appliedFilters, filterForm);
        goToPage(1);
        await loadRequests();
    } catch (error: any) {
        ElMessage.error(getErrorMessage(error, "采购申请撤回失败"));
    } finally {
        actionLoading.value = false;
    }
};

const deleteSubmitted = async (row: PurchaseRequestListItem) => {
    if (actionLoading.value || !canDeleteSubmitted.value) return;
    try {
        await erpMessageBox.confirm(
            `删除后将同时清除采购申请 ${row.requestNo} 的全部审批历史和文件，是否继续？`,
            "删除采购申请",
            { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" },
        );
    } catch {
        return;
    }
    actionLoading.value = true;
    try {
        const response = await deleteSubmittedPurchaseRequest(row.id);
        if (response.code !== 200) throw new Error(response.msg || "采购申请删除失败");
        ElMessage.success("采购申请已删除");
        await reloadAfterRowRemoval();
    } catch (error: any) {
        ElMessage.error(getErrorMessage(error, "采购申请删除失败"));
    } finally {
        actionLoading.value = false;
    }
};

const formatQuantity = (value: number) => Number(value || 0).toLocaleString("zh-CN", {
    maximumFractionDigits: 3,
});

const formatRelatedOrderNo = (row: PurchaseRequestListItem) => {
    if (row.productionOrderId) return row.productionOrderNo || "--";
    return row.category === "销售订单采购" ? row.salesOrderNo || "--" : "--";
};

const formatItemSummary = (row: PurchaseRequestListItem) => {
    const names = row.items
        .map((item) => item.name || item.model)
        .filter(Boolean)
        .slice(0, 2);
    const summary = names.join("、") || "--";
    return row.items.length > 2 ? `${summary} 等${row.items.length}项` : summary;
};

const formatUnits = (row: PurchaseRequestListItem) => {
    const units = [...new Set(
        row.items
            .map((item) => item.unit?.trim() || "")
            .filter(Boolean),
    )];
    return units.join("、") || "--";
};

const formatDateTime = (value: string) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString("zh-CN", { hour12: false });
};

watch(pageSize, () => {
    void loadRequests();
});

onMounted(() => {
    void loadRequests();
});
</script>

<style scoped>
.purchase-request-page {
    box-sizing: border-box;
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
}

.topbar,
.toolbar,
.toolbar-left,
.filter-actions,
.date-range,
.action-cell {
    display: flex;
    align-items: center;
}

.topbar,
.toolbar {
    justify-content: space-between;
    flex-shrink: 0;
}

.topbar {
    min-height: 40px;
}

.filter-panel {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: end;
    gap: var(--erp-spacing-16);
    padding: var(--erp-spacing-12);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
    flex-shrink: 0;
}

.filter-grid {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--erp-spacing-12);
}

.filter-field {
    min-width: 0;
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: center;
    gap: var(--erp-spacing-8);
}

.filter-field > span {
    white-space: nowrap;
}

.filter-field input,
.filter-field select {
    width: 100%;
    min-width: 0;
    height: var(--erp-size-control-height-sm);
    box-sizing: border-box;
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
}

.filter-field input:focus,
.filter-field select:focus {
    border-color: var(--erp-color-border-brand);
}

.date-field {
    grid-column: span 2;
}

.date-range {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: var(--erp-spacing-8);
}

.date-range input {
    min-width: 0;
}

.filter-actions,
.toolbar-left,
.action-cell {
    gap: var(--erp-spacing-8);
}

.primary-button,
.outline-button,
.text-button,
.icon-button,
.row-action {
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    padding: 0 var(--erp-spacing-12);
    border-radius: var(--erp-radius-control-default);
    cursor: pointer;
    white-space: nowrap;
}

.primary-button {
    border: 1px solid var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.outline-button,
.icon-button,
.row-action {
    border: 1px solid var(--erp-color-border-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
}

.outline-button.active {
    border-color: var(--erp-color-border-brand);
    color: var(--erp-color-text-brand);
    background: var(--erp-color-fill-nav-selected);
}

.outline-button b {
    min-width: 18px;
    height: 18px;
    display: inline-grid;
    place-items: center;
    border-radius: 9px;
    color: var(--erp-color-text-white);
    background: var(--erp-color-function-red-500);
    font-size: 11px;
}

.text-button {
    padding: 0 var(--erp-spacing-4);
    border: 0;
    color: var(--erp-color-text-secondary);
    background: transparent;
}

.icon-button,
.row-action {
    width: var(--erp-size-control-height-sm);
    padding: 0;
}

.primary-button:disabled,
.outline-button:disabled,
.icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
}

.button-icon,
.primary-button :deep(svg),
.outline-button :deep(svg),
.text-button :deep(svg),
.icon-button :deep(svg),
.row-action :deep(svg) {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.table-wrap {
    min-width: 0;
    min-height: 320px;
    flex: 1 0 320px;
    overflow: hidden;
}

.table-row {
    grid-template-columns: var(--erp-table-columns);
}

.table-cell {
    overflow: hidden;
    text-overflow: ellipsis;
}

.action-cell {
    justify-content: center;
}

.action-column {
    position: sticky;
    right: 0;
    z-index: 2;
    align-self: stretch;
    background: #ffffff;
}

.table-head .action-column {
    background: #f2f6fa;
}

.data-row:hover .action-column {
    background: #f8fbfd;
}

.row-action {
    border: 0;
    color: var(--erp-color-text-brand);
}

.row-action.danger {
    color: var(--erp-color-text-status-error);
}

.row-action:disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

.status-tag {
    padding: 2px var(--erp-spacing-8);
    border-radius: var(--erp-radius-control-pill);
    color: var(--erp-color-text-status-review);
    background: var(--erp-color-bg-status-review);
}

.status-draft,
.status-cancelled {
    color: var(--erp-color-text-secondary);
    background: var(--erp-color-fill-disabled);
}

.status-approved {
    color: var(--erp-color-text-status-complete);
    background: var(--erp-color-bg-status-complete);
}

.status-rejected {
    color: var(--erp-color-text-status-error);
    background: var(--erp-color-bg-status-error-subtle);
}

.request-detail-modal {
    position: relative;
    width: min(1180px, calc(100vw - 48px));
    height: min(820px, calc(100vh - 48px));
    overflow: hidden;
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-bg-page);
    box-shadow: var(--erp-shadow-surface);
}

.request-detail-modal :deep(.approval-detail) {
    height: 100%;
}

.request-detail-modal :deep(.detail-header) {
    padding-right: 64px;
}

.detail-close {
    position: absolute;
    top: var(--erp-spacing-12);
    right: var(--erp-spacing-12);
    z-index: 5;
    width: var(--erp-size-control-height-sm);
    height: var(--erp-size-control-height-sm);
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-secondary);
    background: transparent;
    cursor: pointer;
}

.detail-loading {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-8);
    color: var(--erp-color-text-tertiary);
}

.spinning {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

/* Screenshot-aligned purchase request surface refinements. */
.purchase-request-page {
    gap: 16px;
}

.filter-panel {
    align-items: center;
    padding: 16px;
    border: 1px solid #e5eaf0;
    border-radius: 6px;
    background: #ffffff;
    box-shadow: 0 2px 8px rgb(31 45 61 / 5%);
}

.filter-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    column-gap: 18px;
    row-gap: 10px;
}

.filter-field {
    grid-template-columns: 68px minmax(0, 1fr);
    gap: 8px;
    color: #343b45;
    font-size: 13px;
}

.filter-field input,
.filter-field select {
    height: 32px;
    padding: 0 10px;
    border-color: #dfe4ea;
    border-radius: 5px;
    color: #3e4650;
    background: #ffffff;
    font-size: 13px;
}

.filter-field input::placeholder {
    color: #b7bec8;
}

.filter-field input:focus,
.filter-field select:focus {
    border-color: #3da9e9;
    box-shadow: 0 0 0 2px rgb(61 169 233 / 10%);
}

.filter-actions {
    gap: 8px;
    justify-content: flex-end;
    padding-top: 12px;
    border-top: 1px solid #edf0f3;
}

.primary-button,
.outline-button,
.icon-button,
.row-action {
    height: 32px;
    border-radius: 5px;
    font-size: 13px;
}

.primary-button {
    border-color: #3da9e9;
    background: #3da9e9;
    box-shadow: 0 2px 4px rgb(61 169 233 / 18%);
}

.primary-button:not(:disabled):hover {
    border-color: #2b96d8;
    background: #2b96d8;
}

.outline-button,
.icon-button {
    border-color: #d9e0e7;
    color: #59636f;
    background: #ffffff;
}

.outline-button.active {
    border-color: #3da9e9;
    color: #258bc8;
    background: #edf8ff;
}

.text-button {
    height: 32px;
    color: #68727d;
}

.toolbar {
    min-height: 56px;
    box-sizing: border-box;
    gap: 12px;
    padding: 12px;
    border: 1px solid #e5eaf0;
    border-radius: 6px;
    background: #ffffff;
}

.toolbar-left {
    gap: 10px;
    flex-wrap: wrap;
}

.toolbar > .icon-button {
    flex-shrink: 0;
}

.table-wrap {
    border: 1px solid #e5eaf0;
    border-radius: 6px;
    background: #ffffff;
    box-shadow: 0 2px 8px rgb(31 45 61 / 4%);
}

.table-wrap :deep(.erp-table-frame) {
    box-sizing: border-box;
    height: 100%;
    padding: 0;
    border-radius: 6px;
    box-shadow: none;
}

.table-wrap :deep(.erp-table-frame__head) {
    border-radius: 4px 4px 0 0;
    background: #f2f6fa;
}

.table-wrap :deep(.erp-table-frame__scroll) {
    scrollbar-gutter: stable;
}

.table-wrap :deep(.erp-table-frame .table-head) {
    height: 44px;
    color: #38414c;
    font-size: 13px;
    font-weight: 600;
}

.table-wrap :deep(.erp-table-frame .data-row) {
    height: 70px;
    color: #4b5560;
    font-size: 13px;
}

.table-wrap :deep(.erp-table-frame .table-cell) {
    padding: 0 14px;
}

.table-wrap :deep(.erp-table-frame .data-row:hover) {
    background: #f8fbfd;
}

.status-tag {
    min-width: 52px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 20px;
}

.status-pending {
    color: #2f9ad6;
    background: #e4f5ff;
}

.status-approved {
    color: #35a36d;
    background: #e5f7ee;
}

.status-partially_ordered {
    color: var(--erp-color-text-status-producing);
    background: var(--erp-color-bg-status-producing);
}

.status-ordered {
    color: var(--erp-color-text-status-complete);
    background: var(--erp-color-bg-status-complete);
}

.status-rejected {
    color: #e05252;
    background: #fff0f0;
}

.status-draft,
.status-cancelled {
    color: #74808c;
    background: #f0f2f4;
}

.row-action:not(:disabled):hover {
    background: #ecf5ff;
}

.row-action.danger:not(:disabled):hover {
    background: #fff0f0;
}

.primary-button:focus-visible,
.outline-button:focus-visible,
.text-button:focus-visible,
.icon-button:focus-visible,
.row-action:focus-visible {
    outline: 2px solid #409eff;
    outline-offset: 2px;
}

.purchase-request-page :deep(.inventory-pagination) {
    flex-shrink: 0;
}

.purchase-request-page :deep(.pagination-inner) {
    box-sizing: border-box;
    height: auto;
    min-height: 52px;
    gap: 12px;
    padding: 12px;
    border: 1px solid #e5eaf0;
    border-radius: 6px;
}

.purchase-request-page :deep(.pager-controls) {
    min-width: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 12px;
}

.request-detail-modal {
    width: min(1180px, calc(100vw - 56px));
    height: min(820px, calc(100vh - 56px));
    border: 1px solid #e1e6eb;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 18px 46px rgb(31 45 61 / 16%);
}

@media (max-width: 1280px) {
    .filter-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 760px) {
    .filter-panel {
        padding: 12px;
    }

    .filter-grid {
        grid-template-columns: minmax(0, 1fr);
    }

    .filter-field {
        grid-template-columns: minmax(0, 1fr);
        gap: 6px;
    }

    .date-field {
        grid-column: auto;
    }

    .toolbar {
        align-items: flex-start;
    }

    .purchase-request-page :deep(.pagination-inner) {
        flex-wrap: wrap;
    }

    .purchase-request-page :deep(.pager-controls) {
        justify-content: flex-start;
    }

    .purchase-request-page :deep(.page-number-group) {
        flex-wrap: wrap;
        row-gap: 6px;
    }
}

@media (max-width: 480px) {
    .date-range {
        grid-template-columns: minmax(0, 1fr);
    }

    .date-range > span {
        text-align: center;
    }
}
</style>
