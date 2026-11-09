<template>
    <div class="receipt-page" :class="{ 'approval-page': isApprovalPage }">
        <header class="page-header">
            <ErpBreadcrumb icon="lucide:circle-dollar-sign" :items="receiptBreadcrumbItems" />
            <ErpSearchBox
                v-model="filters.keyword"
                placeholder="搜索回款单号、订单号或操作人"
                :disabled="isLoading"
                @search="handleSearch"
            />
        </header>

        <div class="filter-row">
            <label class="filter-field">
                <span>审核状态</span>
                <select v-model="filters.status">
                    <option value="">请选择</option>
                    <option value="待审核">待审核</option>
                    <option value="已通过">已通过</option>
                </select>
            </label>
            <div class="filter-actions">
                <button class="outline-button" type="button" @click="resetFilters">
                    <Icon name="lucide:refresh-cw" class="button-icon" />
                    <span>重置</span>
                </button>
                <button class="muted-button" :class="{ active: hasPendingFilters }" type="button" @click="applyFilters">
                    <Icon name="lucide:sliders-horizontal" class="button-icon" />
                    <span>筛选</span>
                </button>
            </div>
        </div>

        <div v-if="!isApprovalPage" class="action-row">
            <button class="secondary-action" disabled>
                <Icon name="lucide:upload" class="button-icon" />
                导入
            </button>
            <button class="secondary-action" disabled>
                <Icon name="lucide:download" class="button-icon" />
                导出
            </button>
        </div>

        <ErpTableFrame
            class="receipt-table-frame"
            :columns="receiptTableColumns"
            :minimum-width="receiptTableMinimumWidth"
            :loading="isLoading"
            :empty="receipts.length === 0"
            :empty-text="emptyText"
            scroll-x
        >
            <template #header>
                <div class="table-row table-head">
                    <div class="table-cell">回款单号</div>
                    <div class="table-cell">回款金额</div>
                    <div class="table-cell">币种</div>
                    <div class="table-cell">关联订单号</div>
                    <div class="table-cell">回款日期</div>
                    <div class="table-cell">备注</div>
                    <div class="table-cell">附件</div>
                    <div class="table-cell">对应回款进度</div>
                    <div class="table-cell">对应应收单</div>
                    <div class="table-cell">操作人</div>
                    <div class="table-cell erp-table-fixed-end">操作</div>
                </div>
            </template>

            <div v-for="receipt in receipts" :key="receipt._id" class="table-row data-row">
                <div class="table-cell mono">{{ receipt.receiptNo || "--" }}</div>
                <div class="table-cell amount">{{ formatAmount(receipt.amount) }}</div>
                <div class="table-cell">{{ formatCurrency(receipt.currency) }}</div>
                <div class="table-cell mono">{{ receipt.orderNo || "--" }}</div>
                <div class="table-cell">{{ formatDate(receipt.paymentDate) }}</div>
                <div class="table-cell" :title="receipt.remark || ''">{{ receipt.remark || "--" }}</div>
                <div class="table-cell">
                    <button class="link-button" :disabled="getReceiptAttachments(receipt).length === 0" @click="handleViewAttachments(receipt)">
                        {{ getReceiptAttachments(receipt).length > 0 ? `查看(${getReceiptAttachments(receipt).length})` : "无" }}
                    </button>
                </div>
                <div class="table-cell progress-cell">
                    <div class="payment-progress">
                        <div class="progress-bar">
                            <span :style="{ width: `${getPaymentProgressPercent(receipt)}%` }"></span>
                        </div>
                        <div class="progress-text">(实收/应收)</div>
                    </div>
                </div>
                <div class="table-cell">
                    <button class="link-button" :disabled="!receipt.hasReceivableOrder">
                        {{ receipt.hasReceivableOrder ? "有" : "无" }}
                    </button>
                </div>
                <div class="table-cell">{{ receipt.creator || receipt.createdBy || "--" }}</div>
                <div class="table-cell erp-table-fixed-end">
                    <button
                        v-if='receipt.status !== "已通过"'
                        class="audit-link"
                        :disabled="auditingId === receipt._id"
                        @click="handleAudit(receipt)"
                    >
                        {{ auditingId === receipt._id ? "审核中..." : "审核通过" }}
                    </button>
                    <span v-else class="passed-text">通过</span>
                </div>
            </div>
        </ErpTableFrame>

        <InventoryPagination
            v-model:page-size="pageSize"
            v-model:jump-page-input="jumpPageInput"
            :total="totalItems"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="handlePageChange"
            @jump="handleJumpPage"
        />
    </div>
</template>

<script setup lang="ts">
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import { erpMessageBox } from "~/utils/erpMessageBox";
import { getErpTableGridColumn, getErpTableMinimumWidth } from "~/utils/inventory/erpTableColumns";
import {
    downloadAttachmentFile,
    getAttachmentFileName,
    getAttachmentPath,
    isImageAttachment,
    toAbsoluteAttachmentUrl,
} from "~/utils/attachmentPreview";
import {
    auditSalesOrderReceipt,
    retrieveSalesOrderReceipts,
} from "~/composables/api/useCustomerApi";

definePageMeta({
    layout: "sales",
});

type SalesOrderReceipt = {
    _id?: string;
    receiptNo?: string;
    amount?: number;
    currency?: string;
    orderNo?: string;
    paymentDate?: string;
    remark?: string;
    attachments?: any[];
    paymentProgress?: number;
    hasReceivableOrder?: boolean;
    creator?: string;
    createdBy?: string;
    status?: string;
};

const userInfo = useState<any>("admin_info", () => ({}));
const route = useRoute();
const router = useRouter();

const receipts = ref<SalesOrderReceipt[]>([]);
const isLoading = ref(false);
const auditingId = ref("");

const canViewPage = computed(() => Boolean(userInfo.value?.canAuditSalesReceipt));
const isApprovalPage = computed(() => route.path.startsWith("/configuration/approval/receipt"));
const receiptBreadcrumbItems = computed(() => isApprovalPage.value
    ? [{ label: "审批管理" }, { label: "回款审批" }]
    : [{ label: "销售管理" }, { label: "回款单表" }]);
const emptyText = computed(() => isApprovalPage.value ? "暂无待审批回款单" : "暂无回款单记录");
const receiptTableColumnDefinitions = [
    { width: 160, grow: true },
    { width: 140 },
    { width: 110 },
    { width: 180, grow: true },
    { width: 180, widthVar: "--erp-table-col-date" },
    { width: 180, widthVar: "--erp-table-col-remark", grow: true },
    { width: 110 },
    { width: 180 },
    { width: 110 },
    { width: 150, widthVar: "--erp-table-col-operator" },
];
const receiptTableColumns = [
    ...receiptTableColumnDefinitions.map(getErpTableGridColumn),
    "var(--erp-table-col-action, 150px)",
].join(" ");
const receiptTableMinimumWidth = getErpTableMinimumWidth(
    receiptTableColumnDefinitions,
    [],
    ["var(--erp-table-col-action, 150px)"],
);
const {
    pageSizeOptions,
    pageSize,
    pageNumbers,
    totalPages,
    currentPage,
    jumpPageInput,
    totalItems,
    setTotalItems,
    goToPage,
    jumpToInputPage,
} = useInventoryPagination({ pageSizeOptions: [10, 20, 50] });
const filters = reactive({
    keyword: "",
    status: isApprovalPage.value ? "待审核" : "",
});
const appliedFilters = reactive({ ...filters });
const hasPendingFilters = computed(() =>
    Object.entries(filters).some(([key, value]) => value !== appliedFilters[key as keyof typeof appliedFilters]),
);

const formatAmount = (value?: number) =>
    Number(value || 0).toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })

const formatCurrency = (value?: string) => {
    const code = String(value || '').trim().toUpperCase()
    const map: Record<string, string> = {
        CNY: '人民币CNY',
        USD: '美元USD',
        EUR: '欧元EUR',
    }
    return map[code] || code || '--'
}

const formatDate = (value?: string) => {
    if (!value) return '--'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '--'
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

const getPaymentProgressPercent = (receipt: SalesOrderReceipt) => {
    const progress = Number(receipt.paymentProgress || 0)
    if (!Number.isFinite(progress)) return 0
    return Math.max(0, Math.min(100, progress))
}

const getReceiptAttachments = (receipt: SalesOrderReceipt) =>
    Array.isArray(receipt.attachments) ? receipt.attachments.filter(Boolean) : []

const escapeHtml = (value: string) =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')

const previewAttachment = (attachment: any) => {
    const path = getAttachmentPath(attachment)
    if (!path) return
    if (isImageAttachment(attachment)) {
        window.open(toAbsoluteAttachmentUrl(path, window.location.origin), '_blank', 'noopener,noreferrer')
        return
    }
    void downloadAttachmentFile(path, getAttachmentFileName(attachment)).catch(() => {
        ElMessage.error('附件下载失败，请稍后重试')
    })
}

const handleViewAttachments = async (receipt: SalesOrderReceipt) => {
    const attachments = getReceiptAttachments(receipt)
    if (attachments.length === 0) return
    if (attachments.length === 1) {
        previewAttachment(attachments[0])
        return
    }

    const attachmentList = attachments
        .map((attachment, index) => `${index + 1}. ${escapeHtml(getAttachmentFileName(attachment) || '附件')}`)
        .join('<br>')

    try {
        await erpMessageBox.alert(attachmentList, "回款单附件", {
            confirmButtonText: "关闭",
            dangerouslyUseHTMLString: true,
        })
    } catch {
        return
    }
}

const buildQuery = () => ({
    keyword: filters.keyword.trim(),
    status: filters.status,
})

const handlePermissionDenied = () => {
    userInfo.value = {
        ...userInfo.value,
        canAuditSalesReceipt: false,
    }
    ElMessage.warning('仅回款单审核人可查看回款单表')
    router.replace(
        isApprovalPage.value
            ? (userInfo.value?.canAuditSalesOrder ? '/configuration/approval/order' : '/configuration')
            : (userInfo.value?.canAuditSalesOrder ? '/configuration/sales/order' : '/configuration'),
    )
}

const loadReceipts = async (page = currentPage.value) => {
    if (!canViewPage.value) return
    isLoading.value = true
    try {
        const res: any = await retrieveSalesOrderReceipts()({
            page,
            limit: pageSize.value,
            ...buildQuery(),
        })
        receipts.value = Array.isArray(res?.data?.list) ? res.data.list : []
        const pageInfo = res?.data?.pagination || {}
        goToPage(Number(pageInfo.page || page));
        setTotalItems(Number(pageInfo.total || receipts.value.length));
    } catch (err: any) {
        if (err?.status === 403 || err?.statusCode === 403 || err?.data?.code === 403) {
            handlePermissionDenied()
            return
        }
        ElMessage.error(err?.data?.msg || err?.message || '获取回款单表失败')
    } finally {
        isLoading.value = false
    }
}

const applyFilters = () => {
    Object.assign(appliedFilters, filters);
    void loadReceipts(1);
};

const resetFilters = () => {
    filters.keyword = "";
    filters.status = isApprovalPage.value ? "待审核" : "";
    applyFilters();
};

const handleSearch = () => {
    applyFilters();
};

const handlePageChange = (page: number) => {
    goToPage(page);
    void loadReceipts(page);
};

const handleJumpPage = () => {
    jumpToInputPage();
    void loadReceipts(currentPage.value);
};

watch(pageSize, () => {
    void loadReceipts(1);
});

const handleAudit = async (receipt: SalesOrderReceipt) => {
    const id = receipt._id
    if (!id || auditingId.value) return
    try {
        await erpMessageBox.confirm(
            `确认审核通过回款单「${receipt.receiptNo || id}」吗？`,
            '审核通过',
            {
                type: 'warning',
                confirmButtonText: '审核通过',
                cancelButtonText: '取消',
            },
        )
    } catch {
        return
    }

    auditingId.value = id
    try {
        const res: any = await auditSalesOrderReceipt()({ id })
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '回款单审核失败')
            return
        }
        ElMessage.success('回款单已通过')
        receipt.status = '已通过'
    } catch (err: any) {
        if (err?.status === 403 || err?.statusCode === 403 || err?.data?.code === 403) {
            handlePermissionDenied()
            return
        }
        ElMessage.error(err?.data?.msg || err?.message || '回款单审核失败')
    } finally {
        auditingId.value = ''
    }
}

onMounted(() => {
    if (!canViewPage.value) {
        handlePermissionDenied()
        return
    }
    void loadReceipts(1)
})
</script>

<style scoped>
.receipt-page {
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: 40px 32px minmax(0, 1fr) 52px;
    gap: 12px;
    color: var(--erp-color-text-primary);
}

.receipt-page:not(.approval-page) {
    grid-template-rows: 40px 32px 32px minmax(0, 1fr) 52px;
}

.page-header,
.filter-row,
.action-row {
    min-width: 0;
    display: flex;
    align-items: center;
}

.page-header {
    justify-content: space-between;
}

.filter-row,
.action-row {
    gap: var(--erp-spacing-8);
}

.filter-actions {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-12);
    margin-left: auto;
}

.filter-field {
    display: inline-grid;
    grid-template-columns: auto 200px;
    align-items: center;
    gap: var(--erp-spacing-8);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.filter-field select {
    width: 200px;
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    background: var(--erp-color-fill-default);
    color: var(--erp-color-text-primary);
    font: inherit;
}

.filter-field select:focus {
    border-color: var(--erp-color-border-brand);
}

.outline-button,
.muted-button,
.secondary-action,
.link-button,
.audit-link {
    border: 0;
    font: inherit;
    cursor: pointer;
}

.outline-button,
.muted-button,
.secondary-action {
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    padding: 4px 8px;
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
}

.outline-button {
    border: 1px solid var(--erp-color-border-default);
    background: var(--erp-color-fill-default);
    color: var(--erp-color-text-secondary-strong);
}

.muted-button {
    border: 0;
    background: var(--erp-color-fill-disabled);
    color: var(--erp-color-text-disabled);
}

.muted-button.active {
    background: var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
}

.secondary-action {
    border: 1px solid var(--erp-color-border-default);
    background: var(--erp-color-fill-default);
    color: var(--erp-color-text-secondary-strong);
}

.secondary-action:disabled {
    border-color: var(--erp-color-border-muted);
    background: var(--erp-color-fill-disabled);
    color: var(--erp-color-text-disabled);
    cursor: not-allowed;
}

.button-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.receipt-table-frame {
    min-width: 0;
    min-height: 0;
}

.table-cell {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mono,
.amount {
    font-variant-numeric: tabular-nums;
}

.receipt-table-frame .erp-table-fixed-end {
    position: sticky;
    right: 0;
    z-index: 5;
    align-self: stretch;
    background: var(--erp-color-fill-default);
}

.receipt-table-frame .table-head .erp-table-fixed-end {
    z-index: 25;
    background: var(--erp-color-fill-table-header);
}

.receipt-table-frame .data-row:hover .erp-table-fixed-end {
    background: var(--erp-color-fill-hover);
}

.link-button,
.audit-link {
    padding: 0;
    background: transparent;
    color: var(--erp-color-action-primary);
    line-height: inherit;
}

.link-button:hover:not(:disabled),
.audit-link:hover:not(:disabled) {
    color: var(--erp-color-action-primary-pressed);
}

.link-button:disabled,
.audit-link:disabled,
.passed-text {
    color: var(--erp-color-text-disabled);
    cursor: not-allowed;
}

.payment-progress {
    width: 140px;
    display: grid;
    justify-items: center;
    gap: var(--erp-spacing-4);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.progress-bar {
    width: 132px;
    height: 8px;
    overflow: hidden;
    border-radius: var(--erp-radius-control-pill);
    background: var(--erp-color-fill-disabled);
}

.progress-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--erp-color-action-primary);
}

.progress-text {
    white-space: nowrap;
}

</style>
