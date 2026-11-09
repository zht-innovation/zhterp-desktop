<template>
    <div class="borrow-page">
        <header class="page-header">
            <ErpBreadcrumb icon="lucide:package-open" :items="borrowBreadcrumbItems" />
            <ErpSearchBox
                v-model="filters.keyword"
                placeholder="搜索申请人、借用人或物料"
                :disabled="isLoading"
                @search="handleSearch"
            />
        </header>

        <div class="page-toolbar">
            <button class="primary-action" @click="openRequestDialog">
                <Icon name="lucide:circle-plus" class="button-icon" />
                <span>发起申请</span>
            </button>
            <button v-if="isSuperAdmin" class="secondary-action" @click="openFlowDialog">
                <Icon name="lucide:git-branch" class="button-icon" />
                <span>流程设置</span>
            </button>
        </div>

        <ErpTableFrame
            class="borrow-table-frame"
            :columns="borrowTableColumns"
            :minimum-width="borrowTableMinimumWidth"
            :loading="isLoading"
            :empty="requests.length === 0"
            empty-text="暂无借用申请"
            scroll-x
        >
            <template #header>
                <div class="table-row table-head">
                    <div class="table-cell">申请人</div>
                    <div class="table-cell">借用人</div>
                    <div class="table-cell">借用物料</div>
                    <div class="table-cell">数量</div>
                    <div class="table-cell">预计归还日期</div>
                    <div class="table-cell">借用事由</div>
                    <div class="table-cell erp-table-fixed-end">操作</div>
                </div>
            </template>

            <div
                v-for="request in requests"
                :key="request._id"
                class="table-row data-row"
            >
                <div class="table-cell">{{ request.applicantName || request.applicantUsername || "--" }}</div>
                <div class="table-cell">{{ request.borrower || "--" }}</div>
                <div class="table-cell" :title="formatMaterialName(request)">
                    {{ formatMaterialName(request) }}
                </div>
                <div class="table-cell mono">
                    {{ formatQuantity(getRequestTotalQuantity(request)) }}{{ getRequestUnit(request) }}
                </div>
                <div class="table-cell">{{ formatDate(request.expectedReturnDate) }}</div>
                <div class="table-cell" :title="request.reason || ''">{{ request.reason || "--" }}</div>
                <div class="table-cell erp-table-fixed-end">
                    <button class="audit-link" @click="openAuditDialog(request)">
                        {{ request.canAudit ? "审核通过" : "审批详情" }}
                    </button>
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

        <div v-if="showRequestDialog" class="erp-dialog-mask" @click.self="closeRequestDialog">
            <ErpDialogFrame
                class="borrow-request-dialog"
                title="发起借用申请"
                width="600px"
                height="560px"
                :form="false"
                :close-disabled="isSubmitting"
                @close="closeRequestDialog"
            >
                <el-form
                    ref="requestFormRef"
                    class="borrow-request-form"
                    :model="requestForm"
                    :rules="requestRules"
                    label-width="92px"
                >
                    <el-form-item label="借用人" prop="borrower">
                        <el-input v-model="requestForm.borrower" placeholder="请输入借用人" />
                    </el-form-item>
                    <el-form-item label="借用物料" prop="materialId">
                        <el-select
                            v-model="requestForm.materialId"
                            filterable
                            remote
                            clearable
                            reserve-keyword
                            placeholder="搜索物料名称/编码/型号"
                            :remote-method="loadProductOptions"
                            :loading="productLoading"
                            @visible-change="handleProductSelectVisible"
                        >
                            <el-option
                                v-for="product in productOptions"
                                :key="product._id"
                                :label="formatProductOption(product)"
                                :value="product._id"
                            />
                        </el-select>
                    </el-form-item>
                    <el-form-item label="数量" prop="quantity">
                        <el-input-number v-model="requestForm.quantity" :min="1" :precision="0" controls />
                    </el-form-item>
                    <el-form-item label="预计归还日期" prop="expectedReturnDate">
                        <InventoryDatePicker v-model="requestForm.expectedReturnDate" placeholder="请选择日期" />
                    </el-form-item>
                    <el-form-item label="借用事由" prop="reason">
                        <el-input
                            v-model="requestForm.reason"
                            type="textarea"
                            :rows="4"
                            maxlength="200"
                            show-word-limit
                            placeholder="请输入借用事由"
                        />
                    </el-form-item>
                </el-form>
                <template #footer>
                    <button type="button" class="dialog-button cancel" :disabled="isSubmitting" @click="closeRequestDialog">
                        取消
                    </button>
                    <button type="button" class="dialog-button confirm" :disabled="isSubmitting" @click="submitRequestForm">
                        {{ isSubmitting ? "提交中..." : "提交" }}
                    </button>
                </template>
            </ErpDialogFrame>
        </div>

        <div v-if="showAuditDialog" class="erp-dialog-mask" @click.self="closeAuditDialog">
            <div class="borrow-audit-dialog">
                <div class="audit-dialog-body">
                    <button class="audit-close" type="button" :disabled="isAuditing || isRejecting" @click="closeAuditDialog">
                        <Icon name="lucide:x" />
                    </button>
                    <section class="audit-section">
                        <h3>审批详情</h3>
                        <div class="audit-detail-grid">
                            <div class="audit-detail-item">
                                <span>申请编号</span>
                                <strong>{{ auditingRequest?.requestNo || "--" }}</strong>
                            </div>
                            <div class="audit-detail-item">
                                <span>申请人</span>
                                <strong>{{ auditingRequest?.applicantName || auditingRequest?.applicantUsername || "--" }}</strong>
                            </div>
                            <div class="audit-detail-item">
                                <span>借用人</span>
                                <strong>{{ auditingRequest?.borrower || "--" }}</strong>
                            </div>
                            <div class="audit-detail-item">
                                <span>借用物料</span>
                                <strong>{{ auditingRequest ? formatMaterialName(auditingRequest) : "--" }}</strong>
                            </div>
                            <div class="audit-detail-item">
                                <span>数量</span>
                                <strong>{{ formatQuantity(getRequestTotalQuantity(auditingRequest)) }}{{ getRequestUnit(auditingRequest) }}</strong>
                            </div>
                            <div v-if="auditRequestItems.length > 1" class="audit-detail-item audit-detail-wide">
                                <span>物料明细</span>
                                <div class="audit-items-list">
                                    <div
                                        v-for="(item, index) in auditRequestItems"
                                        :key="`${item.materialId || index}`"
                                        class="audit-item-line"
                                    >
                                        {{ formatItemLine(item) }}
                                    </div>
                                </div>
                            </div>
                            <div class="audit-detail-item">
                                <span>预计归还日期</span>
                                <strong>{{ formatDate(auditingRequest?.expectedReturnDate) }}</strong>
                            </div>
                            <div class="audit-detail-item">
                                <span>当前状态</span>
                                <strong>{{ auditingRequest?.status || "--" }}</strong>
                            </div>
                            <div class="audit-detail-item audit-detail-wide">
                                <span>审批流程</span>
                                <strong>{{ auditingRequest?.flowText || "--" }}</strong>
                            </div>
                            <div class="audit-detail-item audit-detail-wide">
                                <span>借用事由</span>
                                <strong>{{ auditingRequest?.reason || "--" }}</strong>
                            </div>
                        </div>
                    </section>

                    <section class="audit-section">
                        <h3>审批记录</h3>
                        <div class="audit-record-table">
                            <div class="audit-record-header audit-record-grid">
                                <div>节点名称</div>
                                <div>审批人</div>
                                <div>审批结果</div>
                            </div>
                            <div
                                v-for="(row, index) in auditRecordRows"
                                :key="`${row.nodeName}-${index}`"
                                class="audit-record-row audit-record-grid"
                            >
                                <div>{{ row.nodeName }}</div>
                                <div class="audit-approver">
                                    <span class="audit-avatar">{{ row.avatarText }}</span>
                                    <span>{{ row.approver }}</span>
                                </div>
                                <div>
                                    <span class="audit-result-pill" :class="row.resultClass">{{ row.result }}</span>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <div class="audit-dialog-footer">
                    <template v-if="auditingRequest?.canAudit">
                        <button class="audit-reject" :disabled="isAuditing || isRejecting" @click="openRejectDialog">
                            驳回
                        </button>
                        <button class="audit-agree" :disabled="isAuditing || isRejecting" @click="submitAudit">
                            {{ isAuditing ? "提交中..." : "同意" }}
                        </button>
                    </template>
                    <button v-else class="audit-readonly" disabled>
                        <Icon name="lucide:eye" />
                        {{ auditReadOnlyButtonText }}
                    </button>
                </div>
            </div>
        </div>

        <div v-if="showRejectDialog" class="erp-dialog-mask" @click.self="closeRejectDialog">
            <ErpDialogFrame
                class="borrow-reject-dialog"
                title="驳回申请"
                width="600px"
                height="384px"
                :close-disabled="isRejecting"
                @close="closeRejectDialog"
                @submit.prevent="submitReject"
            >
                <label class="reject-reason-field">
                    <span class="required">驳回原因</span>
                    <textarea v-model="rejectReason" :disabled="isRejecting" maxlength="200" placeholder="请输入驳回原因" />
                </label>
                <template #footer>
                    <button type="button" class="dialog-button cancel" :disabled="isRejecting" @click="closeRejectDialog">取消</button>
                    <button type="submit" class="dialog-button danger" :disabled="isRejecting">
                        {{ isRejecting ? "提交中..." : "确认驳回" }}
                    </button>
                </template>
            </ErpDialogFrame>
        </div>

        <div v-if="showFlowDialog" class="erp-dialog-mask" @click.self="closeFlowDialog">
            <ErpDialogFrame
                class="borrow-flow-dialog"
                title="借用审批流程设置"
                width="960px"
                height="640px"
                :form="false"
                :close-disabled="flowSaving"
                @close="closeFlowDialog"
            >
                <div class="flow-body">
                    <div class="fixed-node">
                        <div>
                            <span>第一审批人</span>
                            <strong>仓库管理员</strong>
                        </div>
                        <p>库管角色中拥有借用审核权限的人员；未单独授权时使用库管角色人员。</p>
                    </div>

                    <div class="flow-rule-toolbar">
                        <strong>第二审批人分支</strong>
                        <button type="button" @click="addFlowRule">
                            <Icon name="material-symbols:add" />
                            新增规则
                        </button>
                    </div>

                    <div class="flow-rule-table">
                    <div class="flow-rule-head flow-rule-grid">
                        <div>申请人角色</div>
                        <div>第二审批人</div>
                        <div>启用</div>
                        <div>操作</div>
                    </div>
                    <div v-if="flowLoading" class="flow-empty">加载中...</div>
                    <div v-else-if="flowRules.length === 0" class="flow-empty">暂无分支规则</div>
                    <div
                        v-else
                        v-for="(rule, index) in flowRules"
                        :key="rule.localId"
                        class="flow-rule-row flow-rule-grid"
                    >
                        <div>
                            <el-select v-model="rule.applicantRole" placeholder="请选择">
                                <el-option label="全部角色" :value="DEFAULT_ROLE_VALUE" />
                                <el-option
                                    v-for="role in roleOptions"
                                    :key="role.value"
                                    :label="role.label"
                                    :value="role.value"
                                />
                            </el-select>
                        </div>
                        <div>
                            <el-select
                                v-model="rule.approverIds"
                                class="approver-select"
                                multiple
                                filterable
                                placeholder="请选择审批人"
                            >
                                <el-option
                                    v-for="admin in adminOptions"
                                    :key="admin._id"
                                    :label="admin.label"
                                    :value="admin._id"
                                />
                            </el-select>
                        </div>
                        <div class="switch-cell">
                            <el-switch v-model="rule.enabled" />
                        </div>
                        <div class="rule-actions">
                            <button type="button" :disabled="index === 0" @click="moveFlowRule(index, -1)">
                                <Icon name="material-symbols:arrow-upward-rounded" />
                            </button>
                            <button type="button" :disabled="index === flowRules.length - 1" @click="moveFlowRule(index, 1)">
                                <Icon name="material-symbols:arrow-downward-rounded" />
                            </button>
                            <button type="button" class="danger" @click="removeFlowRule(index)">
                                <Icon name="material-symbols:delete-outline" />
                            </button>
                        </div>
                    </div>
                    </div>
                </div>
                <template #footer>
                    <button type="button" class="dialog-button cancel" :disabled="flowSaving" @click="closeFlowDialog">取消</button>
                    <button type="button" class="dialog-button confirm" :disabled="flowSaving" @click="saveFlowRules">
                        {{ flowSaving ? "保存中..." : "保存" }}
                    </button>
                </template>
            </ErpDialogFrame>
        </div>
    </div>
</template>

<script setup lang="ts">
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InventoryDatePicker from "~/components/configuration/inventory/InventoryDatePicker.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import { erpMessageBox } from "~/utils/erpMessageBox";
import { getErpTableGridColumn, getErpTableMinimumWidth } from "~/utils/inventory/erpTableColumns";
import { ADMIN_ROLE_NAME, APPROVAL_APPLICANT_ROLES } from "~~/shared/enums";
import { retrieveAdminList } from "~/composables/api/useAdminApi";
import { retrieveInventoryProducts } from "~/composables/api/useInventoryApi";
import {
    addBorrowRequest,
    auditBorrowRequest,
    previewBorrowRequestFlow,
    rejectBorrowRequest,
    retrieveBorrowApprovalFlow,
    retrieveBorrowRequests,
    updateBorrowApprovalFlow,
} from "~/composables/api/useBorrowRequestApi";

definePageMeta({
    layout: "approval",
});

type ProductOption = {
    _id: string;
    code?: string;
    name?: string;
    model?: string;
    unitName?: string;
};

type ApproverSnapshot = {
    adminId?: string;
    username?: string;
    nickname?: string;
    role?: number;
};

type BorrowApprovalRecord = {
    nodeKey?: string;
    nodeName?: string;
    approverLabel?: string;
    approverIds?: string[];
    approverSnapshots?: ApproverSnapshot[];
    approved?: boolean;
    approvedByName?: string;
    approvedAt?: string;
    rejected?: boolean;
    rejectedByName?: string;
    rejectedAt?: string;
    rejectReason?: string;
};

type BorrowRequestLineItem = {
    materialId?: string;
    materialCode?: string;
    materialName?: string;
    materialModel?: string;
    materialUnitName?: string;
    quantity?: number;
};

type BorrowRequestItem = {
    _id: string;
    requestNo?: string;
    applicantName?: string;
    applicantUsername?: string;
    borrower?: string;
    items?: BorrowRequestLineItem[];
    materialCode?: string;
    materialName?: string;
    materialModel?: string;
    materialUnitName?: string;
    quantity?: number;
    expectedReturnDate?: string;
    reason?: string;
    status?: string;
    flowText?: string;
    canAudit?: boolean;
    approvalRecords?: BorrowApprovalRecord[];
};

type FlowRule = {
    localId: string;
    applicantRole: number | string;
    approverIds: string[];
    enabled: boolean;
};

type AdminOption = {
    _id: string;
    username?: string;
    nickname?: string;
    role?: number;
    label: string;
};

const userInfo = useState<any>("admin_info", () => ({}));

const requests = ref<BorrowRequestItem[]>([]);
const isLoading = ref(false);
const isSubmitting = ref(false);
const isAuditing = ref(false);
const isRejecting = ref(false);
const showRequestDialog = ref(false);
const showAuditDialog = ref(false);
const showRejectDialog = ref(false);
const showFlowDialog = ref(false);
const flowLoading = ref(false);
const flowSaving = ref(false);
const productLoading = ref(false);
const productOptions = ref<ProductOption[]>([]);
const auditingRequest = ref<BorrowRequestItem | null>(null);
const rejectReason = ref("");
const requestFormRef = ref();
const DEFAULT_ROLE_VALUE = "all";

const filters = reactive({
    keyword: "",
});
const borrowBreadcrumbItems = [
    { label: "审批管理" },
    { label: "借用审核" },
];
const borrowTableColumnDefinitions = [
    { width: 150, widthVar: "--erp-table-col-operator" },
    { width: 150, widthVar: "--erp-table-col-operator" },
    { width: 220, grow: true },
    { width: 140 },
    { width: 180, widthVar: "--erp-table-col-date" },
    { width: 240, grow: true },
];
const borrowTableColumns = [
    ...borrowTableColumnDefinitions.map(getErpTableGridColumn),
    "var(--erp-table-col-action, 150px)",
].join(" ");
const borrowTableMinimumWidth = getErpTableMinimumWidth(
    borrowTableColumnDefinitions,
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
const requestForm = reactive({
    borrower: "",
    materialId: "",
    quantity: 1,
    expectedReturnDate: "",
    reason: "",
});
const flowRules = ref<FlowRule[]>([]);
const adminOptions = ref<AdminOption[]>([]);

const isSuperAdmin = computed(() => Number(userInfo.value?.role) === 0);
const applicantRoleSet = new Set<number>(APPROVAL_APPLICANT_ROLES as readonly number[]);
const roleOptions = computed(() =>
    Object.entries(ADMIN_ROLE_NAME)
        .filter(([value]) => applicantRoleSet.has(Number(value)))
        .map(([value, label]) => ({
            value: Number(value),
            label,
        })),
);

const requestRules = {
    borrower: [{ required: true, message: "请输入借用人", trigger: "blur" }],
    materialId: [{ required: true, message: "请选择借用物料", trigger: "change" }],
    quantity: [{ required: true, message: "请输入数量", trigger: "change" }],
    expectedReturnDate: [{ required: true, message: "请选择预计归还日期", trigger: "change" }],
    reason: [{ required: true, message: "请输入借用事由", trigger: "blur" }],
};

const formatDate = (value?: string) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const formatQuantity = (value?: number) => {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "0";
    return Number.isInteger(num) ? String(num) : String(num.toFixed(2)).replace(/\.?0+$/, "");
};

const getRequestItems = (request?: BorrowRequestItem | null): BorrowRequestLineItem[] => {
    if (!request) return [];
    if (Array.isArray(request.items) && request.items.length) return request.items;
    if (request.materialCode || request.materialName || request.materialModel || request.quantity) {
        return [{
            materialCode: request.materialCode,
            materialName: request.materialName,
            materialModel: request.materialModel,
            materialUnitName: request.materialUnitName,
            quantity: request.quantity,
        }];
    }
    return [];
};

const formatItemMaterial = (item: BorrowRequestLineItem) => {
    const parts = [item.materialCode, item.materialName || item.materialModel]
        .map((value) => String(value || "").trim())
        .filter(Boolean);
    return parts.length ? parts.join(" / ") : "--";
};

const getRequestTotalQuantity = (request?: BorrowRequestItem | null) =>
    getRequestItems(request).reduce((sum, item) => sum + Number(item.quantity || 0), 0);

const getRequestUnit = (request?: BorrowRequestItem | null) =>
    String(getRequestItems(request)[0]?.materialUnitName || "");

const formatMaterialName = (request: BorrowRequestItem) => {
    const items = getRequestItems(request);
    if (!items.length) return "--";
    if (items.length === 1) return formatItemMaterial(items[0]);
    return `${formatItemMaterial(items[0])} 等${items.length}项`;
};

const auditRequestItems = computed(() => getRequestItems(auditingRequest.value));

const formatItemLine = (item: BorrowRequestLineItem) =>
    `${formatItemMaterial(item)} × ${formatQuantity(item.quantity)}${item.materialUnitName || ""}`;

const formatProductOption = (product: ProductOption) => {
    const parts = [product.code, product.name || product.model]
        .map((item) => String(item || "").trim())
        .filter(Boolean);
    return parts.length ? parts.join(" / ") : "未命名物料";
};

const formatApproverNames = (record?: BorrowApprovalRecord) => {
    if (record?.approvedByName) return record.approvedByName;
    if (record?.rejectedByName) return record.rejectedByName;
    const snapshots = Array.isArray(record?.approverSnapshots) ? record?.approverSnapshots : [];
    const names = snapshots
        .map((approver) => approver.nickname || approver.username)
        .filter(Boolean)
        .join("、");
    return names || record?.approverLabel || "审批人";
};

const getCurrentRecord = (request?: BorrowRequestItem | null) =>
    (request?.approvalRecords || []).find((record) => !record.approved && !record.rejected);

const auditRecordRows = computed(() => {
    const request = auditingRequest.value;
    if (!request) return [];
    const rows: Array<{
        nodeName: string;
        approver: string;
        avatarText: string;
        result: string;
        resultClass: string;
    }> = [
        {
            nodeName: "提交",
            approver: request.applicantName || request.applicantUsername || "提交人",
            avatarText: "提",
            result: "已提交",
            resultClass: "submitted",
        },
    ];
    const currentRecord = getCurrentRecord(request);

    (request.approvalRecords || []).forEach((record) => {
        const approver = formatApproverNames(record);
        const isCurrent = currentRecord === record;
        const rejected = Boolean(record.rejected);
        rows.push({
            nodeName: record.nodeName || "审批",
            approver,
            avatarText: approver.slice(0, 1),
            result: rejected ? "已驳回" : (record.approved ? "已同意" : (isCurrent ? "审批中" : "等待前序")),
            resultClass: rejected ? "rejected" : (record.approved ? "approved" : (isCurrent ? "processing" : "default")),
        });
    });

    rows.push({
        nodeName: "结束",
        approver: "系统",
        avatarText: "系",
        result: ["已通过", "已驳回"].includes(request.status || "") ? "已结束" : "未结束",
        resultClass: ["已通过", "已驳回"].includes(request.status || "") ? "finished" : "default",
    });

    return rows;
});

const auditReadOnlyButtonText = computed(() => {
    const request = auditingRequest.value;
    if (!request || ["已通过", "已驳回"].includes(request.status || "")) return "仅查看";
    const current = getCurrentRecord(request);
    const names = formatApproverNames(current);
    return names ? `等待${names}` : "等待审批";
});

const loadRequests = async (page = currentPage.value) => {
    isLoading.value = true;
    try {
        const res: any = await retrieveBorrowRequests({
            page,
            limit: pageSize.value,
            keyword: filters.keyword.trim(),
        });
        requests.value = Array.isArray(res?.data?.list) ? res.data.list : [];
        const pageInfo = res?.data?.pagination || {};
        goToPage(Number(pageInfo.page || page));
        setTotalItems(Number(pageInfo.total || requests.value.length));
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "获取借用申请失败");
    } finally {
        isLoading.value = false;
    }
};

const handleSearch = () => {
    void loadRequests(1);
};

const handlePageChange = (page: number) => {
    goToPage(page);
    void loadRequests(page);
};

const handleJumpPage = () => {
    jumpToInputPage();
    void loadRequests(currentPage.value);
};

watch(pageSize, () => {
    void loadRequests(1);
});

const resetRequestForm = () => {
    requestForm.borrower = userInfo.value?.nickname || userInfo.value?.username || "";
    requestForm.materialId = "";
    requestForm.quantity = 1;
    requestForm.expectedReturnDate = "";
    requestForm.reason = "";
};

const openRequestDialog = () => {
    resetRequestForm();
    showRequestDialog.value = true;
    void loadProductOptions("");
    nextTick(() => {
        requestFormRef.value?.clearValidate();
    });
};

const closeRequestDialog = () => {
    if (isSubmitting.value) return;
    showRequestDialog.value = false;
};

const handleProductSelectVisible = (visible: boolean) => {
    if (visible && productOptions.value.length === 0) {
        void loadProductOptions("");
    }
};

const loadProductOptions = async (keyword: string) => {
    productLoading.value = true;
    try {
        const res: any = await retrieveInventoryProducts({
            keyword,
            includeStock: true,
            page: 1,
            limit: 20,
        });
        productOptions.value = Array.isArray(res?.data?.list) ? res.data.list : [];
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "获取物料列表失败");
    } finally {
        productLoading.value = false;
    }
};

const submitRequestForm = async () => {
    try {
        await requestFormRef.value?.validate();
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const flowRes: any = await previewBorrowRequestFlow();
        const flow = flowRes?.data || {};
        const warehouseLabel = flow.warehouseLabel || "仓库管理员";
        const departmentLabel = flow.departmentLabel || "部门主管";
        try {
            await erpMessageBox.confirm(
                `该申请将提交至 [${warehouseLabel}] -> [${departmentLabel}] 进行审批`,
                "确认提交借用申请",
                {
                    confirmButtonText: "提交",
                    cancelButtonText: "取消",
                    type: "warning",
                },
            );
        } catch {
            return;
        }

        const res: any = await addBorrowRequest({
            borrower: requestForm.borrower.trim(),
            items: [{
                materialId: requestForm.materialId,
                quantity: Number(requestForm.quantity),
            }],
            expectedReturnDate: requestForm.expectedReturnDate,
            reason: requestForm.reason.trim(),
        });
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || "借用申请提交失败");
            return;
        }
        ElMessage.success("借用申请已提交");
        showRequestDialog.value = false;
        await loadRequests(1);
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "借用申请提交失败");
    } finally {
        isSubmitting.value = false;
    }
};

const openAuditDialog = (request: BorrowRequestItem) => {
    auditingRequest.value = request;
    showAuditDialog.value = true;
};

const closeAuditDialog = () => {
    if (isAuditing.value || isRejecting.value) return;
    showAuditDialog.value = false;
    auditingRequest.value = null;
};

const patchRequest = (detail: BorrowRequestItem) => {
    const index = requests.value.findIndex((item) => item._id === detail._id);
    if (index >= 0) {
        requests.value[index] = detail;
    }
    auditingRequest.value = detail;
};

const submitAudit = async () => {
    const id = auditingRequest.value?._id;
    if (!id) return;
    isAuditing.value = true;
    try {
        const res: any = await auditBorrowRequest({ id });
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || "借用申请审核失败");
            return;
        }
        ElMessage.success("审核已通过");
        if (res?.data?.detail) {
            patchRequest(res.data.detail);
        }
        await loadRequests(currentPage.value);
        showAuditDialog.value = false;
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "借用申请审核失败");
    } finally {
        isAuditing.value = false;
    }
};

const openRejectDialog = () => {
    rejectReason.value = "";
    showRejectDialog.value = true;
};

const closeRejectDialog = () => {
    if (isRejecting.value) return;
    showRejectDialog.value = false;
};

const submitReject = async () => {
    const id = auditingRequest.value?._id;
    const reason = rejectReason.value.trim();
    if (!id) return;
    if (!reason) {
        ElMessage.warning("请填写驳回原因");
        return;
    }

    isRejecting.value = true;
    try {
        const res: any = await rejectBorrowRequest({ id, reason });
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || "驳回申请失败");
            return;
        }
        ElMessage.success("已驳回申请");
        if (res?.data?.detail) {
            patchRequest(res.data.detail);
        }
        await loadRequests(currentPage.value);
        showRejectDialog.value = false;
        showAuditDialog.value = false;
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "驳回申请失败");
    } finally {
        isRejecting.value = false;
    }
};

const buildRuleId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const loadAdminOptions = async () => {
    const res: any = await retrieveAdminList()();
    const admins = Array.isArray(res?.data?.admins) ? res.data.admins : [];
    adminOptions.value = admins.map((admin: any) => ({
        _id: admin._id,
        username: admin.username,
        nickname: admin.nickname,
        role: Number(admin.role),
        label: `${admin.nickname || admin.username}（${ADMIN_ROLE_NAME[Number(admin.role)] || "未知角色"}）`,
    }));
};

const openFlowDialog = async () => {
    if (!isSuperAdmin.value) return;
    showFlowDialog.value = true;
    flowLoading.value = true;
    try {
        await loadAdminOptions();
        const res: any = await retrieveBorrowApprovalFlow();
        const rules = Array.isArray(res?.data?.config?.rules) ? res.data.config.rules : [];
        flowRules.value = rules.map((rule: any) => ({
            localId: rule._id || buildRuleId(),
            applicantRole: rule.applicantRole === null || rule.applicantRole === undefined
                ? DEFAULT_ROLE_VALUE
                : Number(rule.applicantRole),
            approverIds: Array.isArray(rule.approverIds) ? rule.approverIds : [],
            enabled: rule.enabled !== false,
        }));
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "获取审批流程失败");
    } finally {
        flowLoading.value = false;
    }
};

const closeFlowDialog = () => {
    if (flowSaving.value) return;
    showFlowDialog.value = false;
};

const addFlowRule = () => {
    flowRules.value.push({
        localId: buildRuleId(),
        applicantRole: DEFAULT_ROLE_VALUE,
        approverIds: [],
        enabled: true,
    });
};

const removeFlowRule = (index: number) => {
    flowRules.value.splice(index, 1);
};

const moveFlowRule = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= flowRules.value.length) return;
    const next = [...flowRules.value];
    const [item] = next.splice(index, 1);
    next.splice(nextIndex, 0, item);
    flowRules.value = next;
};

const saveFlowRules = async () => {
    const invalidRule = flowRules.value.find((rule) => rule.approverIds.length === 0);
    if (invalidRule) {
        ElMessage.warning("请选择第二审批人");
        return;
    }

    flowSaving.value = true;
    try {
        const res: any = await updateBorrowApprovalFlow({
            rules: flowRules.value.map((rule, index) => ({
                applicantRole: rule.applicantRole === DEFAULT_ROLE_VALUE ? null : Number(rule.applicantRole),
                approverIds: rule.approverIds,
                enabled: rule.enabled,
                sort: index,
            })),
        });
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || "保存审批流程失败");
            return;
        }
        ElMessage.success("审批流程已保存");
        showFlowDialog.value = false;
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "保存审批流程失败");
    } finally {
        flowSaving.value = false;
    }
};

onMounted(() => {
    void loadRequests(1);
});
</script>

<style scoped>
.borrow-page {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: 40px 32px minmax(0, 1fr) 52px;
    gap: 12px;
    color: var(--erp-color-text-primary);
}

.page-header,
.page-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
}

.page-toolbar {
    justify-content: flex-start;
    gap: 8px;
}

.primary-action,
.secondary-action,
.audit-link,
.flow-rule-toolbar button,
.rule-actions button {
    border: 0;
    font: inherit;
    cursor: pointer;
}

.primary-action,
.secondary-action {
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
}

.primary-action {
    background: var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
}

.primary-action:hover {
    background: var(--erp-color-action-primary);
}

.primary-action:active {
    background: var(--erp-color-action-primary-pressed);
}

.primary-action:disabled {
    background: var(--erp-color-fill-disabled);
    color: var(--erp-color-text-disabled);
    cursor: not-allowed;
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

.borrow-table-frame {
    min-width: 0;
    min-height: 0;
}

.table-cell {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mono {
    font-variant-numeric: tabular-nums;
}

.borrow-table-frame .erp-table-fixed-end {
    position: sticky;
    right: 0;
    z-index: 5;
    align-self: stretch;
    background: var(--erp-color-fill-default);
}

.borrow-table-frame .table-head .erp-table-fixed-end {
    z-index: 25;
    background: var(--erp-color-fill-table-header);
}

.borrow-table-frame .data-row:hover .erp-table-fixed-end {
    background: var(--erp-color-fill-hover);
}

.audit-link {
    padding: 0;
    background: transparent;
    color: var(--erp-color-action-primary);
    font-size: inherit;
    line-height: inherit;
}

.audit-link:hover {
    color: var(--erp-color-action-primary-pressed);
}

.dialog-button.danger {
    border: 1px solid var(--erp-color-border-error);
    color: var(--erp-color-text-status-error);
    background: var(--erp-color-fill-default);
}

.dialog-button.danger:not(:disabled):hover {
    background: var(--erp-color-bg-status-error-subtle);
}

.erp-dialog-mask {
    position: fixed;
    inset: 0;
    z-index: 2100;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--erp-color-bg-overlay);
}

.borrow-request-dialog,
.borrow-audit-dialog,
.borrow-reject-dialog,
.borrow-flow-dialog {
    min-width: 0;
    max-width: 95vw;
    max-height: 90vh;
}

.borrow-flow-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
    overflow: hidden;
}

.borrow-request-form {
    width: 384px;
    margin: 0 auto;
}

.borrow-request-form :deep(.el-form-item) {
    margin-bottom: 16px;
}

.borrow-request-form :deep(.el-form-item__label) {
    padding-right: 12px;
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: 32px;
}

.borrow-request-form :deep(.el-input),
.borrow-request-form :deep(.el-select),
.borrow-request-form :deep(.el-input-number),
.borrow-request-form :deep(.inventory-date-picker) {
    width: 280px;
}

.borrow-request-form :deep(.el-input__wrapper),
.borrow-request-form :deep(.el-select__wrapper),
.borrow-request-form :deep(.el-input-number) {
    min-height: 32px;
    border-radius: var(--erp-radius-control-default);
    box-shadow: 0 0 0 1px var(--erp-color-border-default) inset;
}

.borrow-request-form :deep(.el-textarea__inner) {
    min-height: 88px !important;
    resize: none;
    border-radius: var(--erp-radius-control-default);
    box-shadow: 0 0 0 1px var(--erp-color-border-default) inset;
}

.flow-body {
    height: 100%;
    min-height: 0;
    overflow: auto;
}

.borrow-audit-dialog {
    width: min(840px, calc(100vw - 48px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-dialog);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.audit-dialog-body {
    flex: 1;
    position: relative;
    min-width: 0;
    min-height: 0;
    padding: var(--erp-spacing-20) var(--erp-spacing-20) var(--erp-spacing-12);
    overflow: auto;
}

.audit-close {
    position: absolute;
    top: var(--erp-spacing-12);
    right: var(--erp-spacing-12);
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    background: transparent;
    color: var(--erp-color-icon-default);
    font-size: var(--erp-size-icon-default);
    cursor: pointer;
}

.audit-close:not(:disabled):hover {
    background: var(--erp-color-fill-hover);
}

.audit-close:disabled {
    color: var(--erp-color-icon-disabled);
    cursor: not-allowed;
}

.audit-section {
    margin-bottom: var(--erp-spacing-12);
}

.audit-section h3 {
    margin: 0 0 var(--erp-spacing-12);
    padding-left: var(--erp-spacing-8);
    border-left: 3px solid var(--erp-color-text-primary);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
}

.audit-detail-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--erp-spacing-12) var(--erp-spacing-20);
}

.audit-detail-item {
    min-width: 0;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    min-height: var(--erp-size-control-height-sm);
    column-gap: var(--erp-spacing-12);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.audit-detail-item > span {
    color: var(--erp-color-text-secondary);
}

.audit-detail-item strong {
    overflow: hidden;
    color: var(--erp-color-text-primary);
    font-weight: var(--erp-typography-title3-font-weight);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.audit-detail-wide {
    grid-column: span 3;
}

.audit-items-list {
    min-width: 0;
    display: grid;
    gap: var(--erp-spacing-4);
}

.audit-item-line {
    min-width: 0;
    overflow: hidden;
    color: var(--erp-color-text-primary);
    font-weight: var(--erp-typography-title3-font-weight);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.audit-record-table {
    overflow: auto;
    border-top: 1px solid var(--erp-color-divider-default);
    border-bottom: 1px solid var(--erp-color-divider-default);
}

.flow-rule-table {
    overflow: auto;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
}

.audit-record-grid {
    display: grid;
    grid-template-columns: 150px minmax(180px, 1fr) 150px;
    min-width: 0;
    gap: var(--erp-spacing-12);
    padding: 0 var(--erp-spacing-12);
}

.audit-record-header {
    min-height: 48px;
    align-items: center;
    border-bottom: 1px solid var(--erp-color-divider-default);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.flow-rule-head {
    min-height: 48px;
    align-items: center;
    background: var(--erp-color-fill-table-header);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.audit-record-header > div,
.audit-record-row > div {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.flow-rule-head > div,
.flow-rule-row > div {
    min-width: 0;
    padding: 0 16px;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.audit-record-row {
    min-height: 64px;
    align-items: center;
    border-bottom: 1px solid var(--erp-color-divider-default);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.audit-approver {
    display: inline-flex;
    align-items: center;
    gap: var(--erp-spacing-8);
}

.audit-avatar {
    width: 24px;
    height: 24px;
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    background: var(--erp-color-bg-status-review);
    color: var(--erp-color-text-status-review);
    font-size: var(--erp-typography-note-font-size);
}

.audit-result-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 64px;
    height: 24px;
    padding: 0 8px;
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-fill-control-secondary);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-note-font-size);
}

.audit-result-pill.submitted,
.audit-result-pill.approved {
    background: var(--erp-color-bg-status-complete);
    color: var(--erp-color-text-status-complete);
}

.audit-result-pill.processing {
    background: var(--erp-color-bg-status-review);
    color: var(--erp-color-text-status-review);
}

.audit-result-pill.finished {
    background: var(--erp-color-fill-control-secondary);
    color: var(--erp-color-text-secondary-strong);
}

.audit-result-pill.rejected {
    background: var(--erp-color-bg-status-error-subtle);
    color: var(--erp-color-text-status-error);
}

.audit-result-pill.default {
    background: transparent;
    color: var(--erp-color-text-secondary);
}

.audit-record-row:last-child {
    border-bottom: 0;
}

.audit-dialog-footer {
    min-height: 64px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--erp-spacing-12);
    padding: var(--erp-spacing-12) var(--erp-spacing-20);
    border-top: 1px solid var(--erp-color-divider-default);
    background: var(--erp-color-fill-default);
}

.audit-agree,
.audit-reject,
.audit-readonly {
    width: 112px;
    height: var(--erp-size-control-height-md);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
    cursor: pointer;
}

.audit-agree {
    border: 1px solid var(--erp-color-action-primary);
    background: var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
}

.audit-reject {
    border: 1px solid var(--erp-color-border-error);
    background: var(--erp-color-fill-default);
    color: var(--erp-color-text-status-error);
}

.audit-reject:not(:disabled):hover {
    background: var(--erp-color-bg-status-error-subtle);
}

.audit-readonly {
    border: 1px solid var(--erp-color-border-muted);
    background: var(--erp-color-fill-disabled);
    color: var(--erp-color-text-disabled);
    cursor: not-allowed;
}

.audit-readonly :deep(.iconify) {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.reject-reason-field {
    width: 384px;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: start;
    gap: 12px;
    margin: 0 auto;
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: 32px;
}

.reject-reason-field .required::before {
    margin-right: 4px;
    color: var(--erp-color-text-status-error);
    content: "*";
}

.reject-reason-field textarea {
    min-height: 96px;
    padding: 7px 12px;
    resize: none;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    font: inherit;
    line-height: 20px;
    outline: none;
}

.reject-reason-field textarea:focus {
    border-color: var(--erp-color-action-primary);
}

.flow-body {
    display: grid;
    align-content: start;
    gap: 16px;
}

.fixed-node {
    padding: 16px;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-fill-control-secondary);
}

.fixed-node > div,
.flow-rule-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.fixed-node span,
.fixed-node p {
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.fixed-node strong,
.flow-rule-toolbar strong {
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
}

.fixed-node p {
    margin: 8px 0 0;
}

.flow-rule-toolbar button {
    height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
}

.flow-rule-toolbar button .icon {
    font-size: 20px;
}

.flow-rule-grid {
    display: grid;
    grid-template-columns: 180px minmax(300px, 1fr) 96px 132px;
    min-width: 760px;
}

.flow-rule-row {
    min-height: 64px;
    align-items: center;
    border-top: 1px solid var(--erp-color-border-default);
}

.flow-rule-row :deep(.el-select) {
    width: 100%;
}

.switch-cell,
.rule-actions {
    display: flex;
    align-items: center;
    justify-content: center;
}

.rule-actions {
    gap: 4px;
}

.rule-actions button {
    width: 24px;
    height: 24px;
    display: inline-grid;
    place-items: center;
    border-radius: var(--erp-radius-control-default);
    background: transparent;
    color: var(--erp-color-text-secondary);
}

.rule-actions button:hover:not(:disabled) {
    background: var(--erp-color-fill-hover);
    color: var(--erp-color-action-primary);
}

.rule-actions button.danger:hover:not(:disabled) {
    color: var(--erp-color-text-status-error);
}

.rule-actions button:disabled {
    color: var(--erp-color-text-disabled);
    cursor: not-allowed;
}

.flow-empty {
    min-height: 120px;
    display: grid;
    place-items: center;
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}
</style>
