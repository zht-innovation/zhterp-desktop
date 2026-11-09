<template>
    <article class="approval-detail">
        <header class="detail-header">
            <div>
                <span class="approval-no">审批编号：{{ approval.approvalNo }}</span>
                <h2>{{ approval.title }}</h2>
            </div>
            <span class="approval-status" :class="`status-${approval.status}`">
                {{ statusLabels[approval.status] }}
            </span>
        </header>

        <div class="detail-scroll">
            <section class="approval-business">
                <div v-if="showRejectReason" class="reject-reason-panel">
                    <Icon name="lucide:circle-alert" />
                    <div>
                        <strong>驳回原因</strong>
                        <p>{{ approval.rejectReason }}</p>
                    </div>
                </div>

                <header class="section-title">
                    <span />
                    <h3>审批详情</h3>
                </header>

                <OrderDetailComponent
                    v-if="approval.business.kind === 'sales-order'"
                    :detail="approval.business"
                    :approval-id="approval.id"
                    :allow-product-excel-download="canDownloadProductExcel"
                    :sn-export-unavailable-reason="isProcessedView ? approval.productSnExportUnavailableReason : ''"
                />
                <BorrowDetailComponent
                    v-else-if="approval.business.kind === 'borrow'"
                    :detail="approval.business"
                />
                <ReceiptDetailComponent
                    v-else-if="approval.business.kind === 'receipt'"
                    :detail="approval.business"
                />
                <PurchaseRequestDetailComponent
                    v-else-if="approval.business.kind === 'purchase-request'"
                    :detail="approval.business"
                    :approval-id="approval.id"
                />
            </section>

            <Flow
                :steps="approval.steps"
                :applicant="approval.applicant"
                :create-time="approval.createTime"
            />
        </div>

        <footer
            v-if="showReviewActions || showCancelAction || showDeleteAction || showReapplyAction"
            class="detail-actions"
        >
            <template v-if="showReviewActions">
                <button
                    v-if="approval.canConfirmPayment"
                    class="action-button approve"
                    type="button"
                    :disabled="actionLoading || approval.paymentConfirmed"
                    @click="emit('confirm-payment', approval.id)"
                >
                    <Icon name="lucide:badge-check" />
                    {{ approval.paymentConfirmed ? "已确认用户打款" : "确认用户已打款" }}
                </button>
                <button
                    v-if="approval.canApprove"
                    class="action-button approve"
                    type="button"
                    :disabled="actionLoading || paymentConfirmationPending"
                    :title="paymentConfirmationPending ? '请先确认用户已打款' : ''"
                    @click="emit('approve', approval.id)"
                >
                    <Icon name="lucide:check" />
                    同意
                </button>
                <button
                    v-if="approval.canReject"
                    class="action-button reject"
                    type="button"
                    :disabled="actionLoading"
                    @click="emit('reject', approval.id)"
                >
                    <Icon name="lucide:x" />
                    驳回
                </button>
            </template>
            <button
                v-if="showCancelAction"
                class="action-button reject"
                type="button"
                :disabled="actionLoading"
                @click="emit('cancel', approval.id)"
            >
                <Icon name="lucide:undo-2" />
                撤销
            </button>
            <button
                v-if="showDeleteAction"
                class="action-button delete"
                type="button"
                :disabled="actionLoading"
                @click="emit('delete', approval.id)"
            >
                <Icon name="lucide:trash-2" />
                删除
            </button>
            <button
                v-if="showReapplyAction"
                class="action-button approve"
                type="button"
                :disabled="actionLoading"
                @click="emit('reapply', approval.id)"
            >
                <Icon name="lucide:rotate-ccw" />
                重新申请
            </button>
        </footer>
    </article>
</template>

<script setup lang="ts">
import type {
    ApprovalDetailItem,
    ApprovalStatus,
} from "~/types/approval";
import Flow from "~/components/approval/Flow.vue";
import OrderDetailComponent from "~/components/approval/detail/OrderDetail.vue";
import BorrowDetailComponent from "~/components/approval/detail/BorrowDetail.vue";
import ReceiptDetailComponent from "~/components/approval/detail/ReceiptDetail.vue";
import PurchaseRequestDetailComponent from "~/components/approval/detail/PurchaseRequestDetail.vue";
import { isReadonlyProductionRole } from "~~/shared/utils/adminPermission";

const props = withDefaults(defineProps<{
    approval: ApprovalDetailItem;
    actionLoading?: boolean;
    canDelete?: boolean;
    canReapply?: boolean;
    isProcessedView?: boolean;
    actionMode?: "all" | "cancel-only" | "none";
}>(), {
    actionMode: "all",
    isProcessedView: false,
});

const adminInfo = useState<{ role?: number }>("admin_info", () => ({}));
const paymentConfirmationPending = computed(() =>
    (props.approval.paymentConfirmationRequired ?? props.approval.canConfirmPayment ?? false)
    && !props.approval.paymentConfirmed,
);
const canDownloadProductExcel = computed(() =>
    props.isProcessedView
    && props.approval.status === "approved"
    && props.approval.business.kind === "sales-order"
    && props.approval.productSnExportEligible === true
    && isReadonlyProductionRole(Number(adminInfo.value?.role)),
);

const emit = defineEmits<{
    approve: [id: string];
    "confirm-payment": [id: string];
    reject: [id: string];
    cancel: [id: string];
    delete: [id: string];
    reapply: [id: string];
}>();

const statusLabels: Record<ApprovalStatus, string> = {
    pending: "审核中",
    approved: "审核通过",
    rejected: "已驳回",
    cancelled: "已撤销",
};

const showRejectReason = computed(() =>
    props.approval.status === "rejected" && Boolean(props.approval.rejectReason?.trim()),
);
const showReviewActions = computed(() =>
    props.actionMode === "all"
    && (props.approval.canApprove || props.approval.canReject),
);
const showCancelAction = computed(() =>
    props.actionMode !== "none" && props.approval.canCancel,
);
const showDeleteAction = computed(() =>
    props.actionMode === "all" && Boolean(props.canDelete),
);
const showReapplyAction = computed(() =>
    props.actionMode === "all" && Boolean(props.canReapply) && props.approval.canReapply === true,
);

</script>

<style scoped>
.approval-detail {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-bg-page);
}

.detail-header {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--erp-spacing-20);
    padding: var(--erp-spacing-20);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.detail-header > div {
    min-width: 0;
}

.approval-no {
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.detail-header h2 {
    margin: var(--erp-spacing-4) 0 0;
    overflow: hidden;
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.approval-status {
    flex: 0 0 auto;
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    border-radius: var(--erp-radius-control-pill);
    color: var(--erp-color-text-status-review);
    background: var(--erp-color-bg-status-review);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.approval-status.status-approved {
    color: var(--erp-color-text-status-complete);
    background: var(--erp-color-bg-status-complete);
}

.approval-status.status-rejected {
    color: var(--erp-color-text-status-error);
    background: var(--erp-color-bg-status-error-subtle);
}

.approval-status.status-cancelled {
    color: var(--erp-color-text-secondary);
    background: var(--erp-color-fill-disabled);
}

.detail-scroll {
    min-width: 0;
    min-height: 0;
    display: grid;
    align-content: start;
    gap: var(--erp-spacing-12);
    margin-top: var(--erp-spacing-12);
    padding: 0 0 var(--erp-spacing-12);
    overflow-x: hidden;
    overflow-y: auto;
}

.reject-reason-panel {
    min-width: 0;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    align-items: start;
    gap: var(--erp-spacing-8);
    margin-bottom: var(--erp-spacing-20);
    padding: var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-error);
    border-radius: var(--erp-radius-surface-default);
    color: var(--erp-color-text-status-error);
    background: var(--erp-color-bg-status-error-subtle);
}

.reject-reason-panel > :deep(svg) {
    width: 18px;
    height: 18px;
    margin-top: 2px;
}

.reject-reason-panel strong,
.reject-reason-panel p {
    display: block;
    margin: 0;
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.reject-reason-panel strong {
    font-weight: var(--erp-typography-title3-font-weight);
}

.reject-reason-panel p {
    margin-top: var(--erp-spacing-4);
    color: inherit;
    white-space: pre-wrap;
}

.approval-business {
    min-width: 0;
    padding: var(--erp-spacing-20);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.section-title {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-8);
    margin-bottom: var(--erp-spacing-20);
}

.section-title > span {
    width: 2px;
    height: 20px;
    background: var(--erp-color-text-primary);
}

.section-title h3 {
    margin: 0;
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
}

.approval-business :deep(.business-detail) {
    min-width: 0;
    display: grid;
    gap: var(--erp-spacing-20);
}

.approval-business :deep(.business-section) {
    min-width: 0;
    padding: var(--erp-spacing-20);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
}

.approval-business :deep(.business-section h4) {
    margin: 0 0 var(--erp-spacing-20);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.approval-business :deep(.detail-grid) {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--erp-spacing-16) var(--erp-spacing-20);
    margin: 0;
}

.approval-business :deep(.detail-grid > div) {
    min-width: 0;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: var(--erp-spacing-12);
}

.approval-business :deep(.detail-grid-wide) {
    grid-column: 1 / -1;
}

.approval-business :deep(dt),
.approval-business :deep(dd) {
    min-width: 0;
    margin: 0;
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.approval-business :deep(dt) {
    color: var(--erp-color-text-secondary);
}

.approval-business :deep(dd) {
    overflow-wrap: anywhere;
    color: var(--erp-color-text-primary);
}

.approval-business :deep(.approval-attachment-field) {
    min-height: 44px;
    align-items: start;
}

.approval-business :deep(.approval-attachment-field dd),
.approval-business :deep(.approval-attachment-field .file-uploader),
.approval-business :deep(.approval-attachment-field .file-list) {
    width: 100%;
    min-width: 0;
}

.approval-business :deep(.approval-attachment-field .file-item) {
    width: 100%;
    min-height: var(--erp-size-control-height-sm);
    box-sizing: border-box;
}

.detail-actions {
    min-height: 57px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--erp-spacing-12);
    padding: var(--erp-spacing-12) var(--erp-spacing-20);
    border-top: 1px solid var(--erp-color-divider-subtle);
    background: var(--erp-color-fill-default);
}

.action-button {
    min-width: 80px;
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    padding: 0 var(--erp-spacing-12);
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
    cursor: pointer;
}

.action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.action-button :deep(svg) {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.action-button.approve {
    border: 1px solid var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.action-button.reject {
    border: 1px solid var(--erp-color-border-error);
    color: var(--erp-color-text-status-error);
    background: var(--erp-color-fill-default);
}

.action-button.reject:hover {
    background: var(--erp-color-bg-status-error-subtle);
}

.action-button.delete {
    border: 1px solid var(--erp-color-border-error);
    color: var(--erp-color-text-status-error);
    background: var(--erp-color-bg-status-error-subtle);
}

.action-button.delete:hover {
    background: var(--erp-color-fill-default);
}

@media (max-width: 1100px) {
    .approval-business :deep(.detail-grid) {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
