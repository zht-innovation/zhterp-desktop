<template>
    <div
        class="erp-dialog-mask inventory-restriction-mask"
        role="dialog"
        aria-modal="true"
        :aria-label="dialogTitle"
        @click.self="emit('close')"
    >
        <ErpDialogFrame
            class="inventory-restriction-dialog"
            :title="dialogTitle"
            width="1000px"
            height="680px"
            :form="false"
            :show-footer="false"
            @close="emit('close')"
        >
            <div class="inventory-restriction-content">
                <div class="inventory-restriction-summary">
                    <div class="inventory-restriction-product">
                        <span>产品编号：{{ displayDetails?.productCode || productCode || "--" }}</span>
                        <span>型号：{{ displayDetails?.model || model || "--" }}</span>
                        <span>
                            {{ isReviewSnapshot ? "锁定合计" : "受限合计" }}：
                            <strong>{{ formatQuantity(displayQuantity) }}</strong>
                            {{ displayDetails?.unitName || unitName }}
                        </span>
                        <span v-if="isReviewSnapshot && reviewSnapshot?.capturedAt">快照时间：{{ formatCapturedAt(reviewSnapshot.capturedAt) }}</span>
                    </div>
                    <p v-if="isReviewSnapshot" class="inventory-restriction-notice">
                        复核完成、重新预占后的锁定快照
                    </p>
                    <p
                        v-if="!isReviewSnapshot && !loading && !error && details && hasQuantityChanged"
                        class="inventory-restriction-notice"
                        role="status"
                    >
                        库存已变化，以本次查询为准
                    </p>
                </div>

                <ErpTableFrame
                    class="inventory-restriction-table"
                    columns="minmax(220px, 1.1fr) minmax(180px, 1fr) 150px minmax(220px, 1.1fr)"
                    minimum-width="800px"
                    :loading="loading"
                    :empty="records.length === 0"
                    :loading-text="isReviewSnapshot ? '正在查询锁定明细...' : '正在查询受限明细...'"
                    scroll-x
                    embedded
                >
                    <template #header>
                        <div class="table-row table-head">
                            <div class="table-cell">{{ isReviewSnapshot ? "锁定原因" : "受限原因" }}</div>
                            <div class="table-cell">订单号</div>
                            <div class="table-cell">{{ isReviewSnapshot ? "复核后锁定数量" : "当前受限数量" }}</div>
                            <div class="table-cell">仓库／库位</div>
                        </div>
                    </template>

                    <div v-for="record in records" :key="record.id" class="table-row data-row">
                        <div class="table-cell inventory-restriction-text" :title="reasonLabels[record.reason]">
                            {{ reasonLabels[record.reason] }}
                        </div>
                        <div class="table-cell inventory-restriction-text" :title="record.salesOrderNo">
                            {{ record.salesOrderNo || "--" }}
                        </div>
                        <div class="table-cell">{{ formatQuantity(record.quantity) }}</div>
                        <div class="table-cell inventory-restriction-text" :title="record.warehouseDisplayName">
                            {{ record.warehouseDisplayName || "--" }}
                        </div>
                    </div>

                    <template #empty>
                        <div v-if="error" class="inventory-restriction-error" role="alert">
                            <span>{{ error }}</span>
                            <button type="button" class="dialog-button confirm" @click="emit('retry')">
                                重试
                            </button>
                        </div>
                        <span v-else>{{ emptyText }}</span>
                    </template>
                </ErpTableFrame>

                <div class="inventory-restriction-pagination">
                    <InventoryPagination
                        v-model:page-size="pageSize"
                        v-model:jump-page-input="jumpPageInput"
                        :total="totalItems"
                        :page-size-options="pageSizeOptions"
                        :page-numbers="pageNumbers"
                        :total-pages="totalPages"
                        :current-page="currentPage"
                        @page-change="goToPage"
                        @jump="jumpToInputPage"
                    />
                </div>
            </div>
        </ErpDialogFrame>
    </div>
</template>

<script setup lang="ts">
import type {
    InventoryStockRestrictionDetails,
    InventoryStockRestrictionReason,
} from "~~/shared/types/inventory";
import type { InventoryReviewLockDetails } from "~~/shared/types/inventoryReview";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";

const props = withDefaults(defineProps<{
    productCode: string;
    model: string;
    unitName: string;
    expectedQuantity: number;
    details: InventoryStockRestrictionDetails | null;
    loading: boolean;
    error: string;
    mode?: "realtime" | "review-snapshot";
    reviewSnapshot?: InventoryReviewLockDetails | null;
}>(), {
    mode: "realtime",
    reviewSnapshot: null,
});

const emit = defineEmits<{
    close: [];
    retry: [];
}>();

const isReviewSnapshot = computed(() => props.mode === "review-snapshot");
const dialogTitle = computed(() => isReviewSnapshot.value ? "锁定数量明细" : "受限数量明细");
const displayDetails = computed(() => isReviewSnapshot.value ? props.reviewSnapshot : props.details);
const displayQuantity = computed(() => isReviewSnapshot.value
    ? props.reviewSnapshot?.lockedQuantity ?? props.expectedQuantity
    : props.details?.unavailableQuantity ?? props.expectedQuantity);
const emptyText = computed(() => {
    if (!isReviewSnapshot.value) return "暂无受限明细";
    return props.reviewSnapshot?.snapshotAvailable === false
        ? "该历史复核未保存锁定明细"
        : "暂无锁定明细";
});

const formatCapturedAt = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
};

const reasonLabels: Record<InventoryStockRestrictionReason, string> = {
    "order-finished-product": "订单留货",
    "order-production-material": "订单生产用料",
    "warehouse-excluded": "仓库未计入可用库存",
    "other-order": "其他订单占用（无查看权限）",
    "other-lock": "其他锁定／暂无对应订单记录",
    "inconsistent-lock": "记录不一致，暂无法准确拆分",
};

const {
    pageSizeOptions,
    pageSize,
    pageNumbers,
    totalPages,
    currentPage,
    jumpPageInput,
    totalItems,
    setTotalItems,
    getPageItems,
    goToPage,
    jumpToInputPage,
} = useInventoryPagination();

const records = computed(() => {
    if (props.loading || props.error) {
        return [];
    }

    return getPageItems(displayDetails.value?.list ?? []);
});

const normalizeQuantity = (quantity: number) => {
    return Number.isFinite(quantity) ? Number(quantity.toFixed(3)) : 0;
};

const formatQuantity = (quantity: number) => String(normalizeQuantity(quantity));

const hasQuantityChanged = computed(() => {
    return props.details !== null
        && normalizeQuantity(props.details.unavailableQuantity) !== normalizeQuantity(props.expectedQuantity);
});

watch(displayDetails, (details) => {
    setTotalItems(details?.list.length ?? 0);
    goToPage(1);
}, { immediate: true });
</script>

<style scoped>
.inventory-restriction-mask {
    z-index: 60;
}

.inventory-restriction-dialog {
    max-width: calc(100vw - 32px);
}

.inventory-restriction-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
    min-height: 0;
    overflow: hidden;
}

.inventory-restriction-content {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: var(--erp-spacing-12);
}

.inventory-restriction-product {
    display: flex;
    flex-wrap: wrap;
    gap: var(--erp-spacing-8) var(--erp-spacing-20);
    overflow-wrap: anywhere;
}

.inventory-restriction-notice {
    margin: var(--erp-spacing-8) 0 0;
    color: var(--erp-color-text-secondary-strong);
}

.inventory-restriction-table {
    min-height: 0;
    height: 100%;
}

.inventory-restriction-table .data-row {
    height: auto;
    min-height: 64px;
}

.inventory-restriction-table :deep(.empty-row) {
    height: auto;
    min-height: 144px;
}

.inventory-restriction-table .inventory-restriction-text {
    padding-top: var(--erp-spacing-12);
    padding-bottom: var(--erp-spacing-12);
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: center;
}

.inventory-restriction-error {
    display: grid;
    justify-items: center;
    gap: var(--erp-spacing-12);
    padding: var(--erp-spacing-12);
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: center;
}

.inventory-restriction-pagination {
    min-width: 0;
    overflow-x: auto;
}

.inventory-restriction-pagination :deep(.inventory-pagination) {
    min-width: 680px;
}
</style>
