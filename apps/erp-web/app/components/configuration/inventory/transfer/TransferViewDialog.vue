<template>
    <div class="erp-dialog-mask inventory-responsive-dialog-mask" @click.self="emit('close')">
        <ErpDialogFrame
            class="transfer-view-dialog"
            title="全部信息"
			width="min(1240px, calc(100vw - 32px))"
			height="min(760px, calc(100vh - 32px))"
            :show-footer="false"
            @close="emit('close')"
        >
            <div class="transfer-view-body">
                <section class="form-section basic-info-section">
                    <h3>基本信息</h3>

                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">单据编号</span>
                            <span class="info-value">{{ order.code }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">调拨日期</span>
                            <span class="info-value">{{ order.transferDate }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">经办人</span>
                            <span class="info-value">{{ order.handler }}</span>
                        </div>
                    </div>

                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">借用人</span>
                            <span class="info-value">{{ order.borrower || "--" }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">预计归还</span>
                            <span class="info-value">{{ order.expectedReturnDate || "--" }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">实际归库</span>
                            <span class="info-value">{{ order.actualReturnTime || "--" }}</span>
                        </div>
                    </div>

                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">归还状态</span>
                            <span
                                class="status-tag"
                                :class="getTransferStatusClass(order)"
                            >
                                {{ order.returned ? "已归还" : "未归还" }}
                            </span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">快递公司</span>
                            <span class="info-value">{{ order.courierCompany || "--" }}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">快递单号</span>
                            <span class="info-value">{{ order.trackingNo || "--" }}</span>
                        </div>
                    </div>

                    <div class="info-grid">
                        <div class="info-item">
                            <span class="info-label">备注</span>
                            <span class="info-value">{{ order.remark || "--" }}</span>
                        </div>
                    </div>
                </section>

                <section class="form-section product-section">
                    <div class="items-table-wrap">
                        <div class="items-table">
                            <div class="items-table-head">
                                <div class="items-cell col-product-code">产品编号</div>
                                <div class="items-cell col-model">型号</div>
                                <div class="items-cell col-category">分类</div>
                                <div class="items-cell col-image">产品图片</div>
                                <div class="items-cell col-quantity">数量</div>
                                <div class="items-cell col-unit">单位</div>
                                <div class="items-cell col-source-warehouse">转出仓库</div>
                            </div>

                            <div
                                v-for="(item, index) in order.items"
                                :key="index"
                                class="items-table-row"
                            >
                                <div
                                    class="items-cell col-product-code"
                                    :title="item.productCode || '--'"
                                >
                                    {{ item.productCode || "--" }}
                                </div>
                                <div
                                    class="items-cell col-model"
                                    :title="item.model || '--'"
                                >
                                    {{ item.model || "--" }}
                                </div>
                                <div
                                    class="items-cell col-category"
                                    :title="item.category || '--'"
                                >
                                    {{ item.category || "--" }}
                                </div>
                                <div class="items-cell col-image">
                                    <img
                                        v-if="item.image"
                                        :src="item.image"
                                        class="product-thumb"
                                        :alt="item.model || item.productCode || '产品图片'"
                                        role="button"
                                        tabindex="0"
                                        :aria-label="`预览${item.model || item.productCode || '产品'}图片`"
                                        @click.stop="openImagePreview(item.image, item.model || item.productCode || '产品图片')"
                                        @keydown.enter.prevent="openImagePreview(item.image, item.model || item.productCode || '产品图片')"
                                        @keydown.space.prevent="openImagePreview(item.image, item.model || item.productCode || '产品图片')"
                                    >
                                    <span v-else class="no-image">-</span>
                                </div>
                                <div class="items-cell col-quantity">{{ item.quantity ?? "--" }}</div>
                                <div class="items-cell col-unit" :title="item.unit || '--'">
                                    {{ item.unit || "--" }}
                                </div>
                                <div class="items-cell col-source-warehouse">
                                    <span
                                        class="warehouse-label"
                                        :title="formatWarehouseLabel(item.warehouseName, item.locationName)"
                                    >
                                        {{ formatWarehouseLabel(item.warehouseName, item.locationName) }}
                                    </span>
                                </div>
                            </div>

                            <div v-if="order.items.length === 0" class="empty-items">
                                暂无产品数据
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </ErpDialogFrame>

        <ImagePreviewDialog
            v-model="showImagePreview"
            :title="previewTitle"
            :images="previewImages"
        />
    </div>
</template>

<script setup lang="ts">
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { InventoryTransferOrder } from "~~/shared/types/inventory";

defineProps<{
    order: InventoryTransferOrder;
}>();

const emit = defineEmits<{
    close: [];
}>();

const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");

const formatWarehouseLabel = (warehouseName?: string, locationName?: string) => {
    const parts = [warehouseName, locationName].filter(Boolean);

    return parts.length ? parts.join(" / ") : "--";
};

const getTransferStatusClass = (order: InventoryTransferOrder) =>
    order.returned ? "status-complete" : "status-review";

const openImagePreview = (url: string, title: string) => {
    previewImages.value = [{ url, alt: title }];
    previewTitle.value = title;
    showImagePreview.value = true;
};
</script>

<style scoped>
.transfer-view-dialog {
    min-width: 0;
    max-width: 95vw;
    max-height: calc(100vh - 32px);
}

@supports (height: 100dvh) {
    .transfer-view-dialog {
        height: min(760px, calc(100dvh - 32px)) !important;
        max-height: calc(100dvh - 32px);
    }
}

.transfer-view-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
    overflow: hidden;
}

.transfer-view-body {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--erp-spacing-12);
    overflow: hidden;
}

.form-section {
    min-width: 0;
    padding: var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.form-section h3 {
    margin: 0;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.product-section {
    min-height: 0;
    overflow: hidden;
}

.info-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--erp-spacing-20);
    margin-top: var(--erp-spacing-20);
}

.info-item {
    min-width: 0;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.info-label {
    min-height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    color: var(--erp-color-text-secondary);
    white-space: nowrap;
}

.info-value {
    flex: 1;
    min-width: 0;
    color: var(--erp-color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.status-tag {
    width: 56px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    border-radius: var(--erp-radius-control-pill);
    font-size: var(--erp-typography-content2-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-content2-line-height);
    white-space: nowrap;
}

.status-tag.status-review {
    color: var(--erp-color-text-status-review);
    background: var(--erp-color-bg-status-review);
}

.status-tag.status-complete {
    color: var(--erp-color-text-status-complete);
    background: var(--erp-color-bg-status-complete);
}

.items-table-wrap {
    min-height: 0;
    height: 100%;
    overflow: auto;
}

.items-table {
    width: max-content;
    min-width: 100%;
}

.items-table-head {
    display: flex;
    background: var(--erp-color-fill-table-header);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.items-table-row {
    display: flex;
    border-top: 1px solid var(--erp-color-divider-default);
    color: var(--erp-color-text-secondary-strong);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.items-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: var(--erp-spacing-12) var(--erp-spacing-8);
    min-height: 60px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.col-product-code {
    flex: 1 1 120px;
    min-width: 120px;
}

.col-model {
    flex: 1 1 150px;
    min-width: 150px;
}

.col-category {
    flex: 1 1 120px;
    min-width: 120px;
}

.col-image {
    flex: 0 0 80px;
    min-width: 80px;
}

.col-quantity {
    flex: 0 0 100px;
    min-width: 100px;
}

.col-unit {
    flex: 0 0 80px;
    min-width: 80px;
}

.col-source-warehouse {
    flex: 0 0 170px;
    min-width: 170px;
    white-space: normal;
}

.warehouse-label {
    min-width: 0;
    overflow: visible;
    text-align: center;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: anywhere;
}

.items-table-head .items-cell {
    min-height: 40px;
    color: var(--erp-color-text-primary);
}

.product-thumb {
    width: 40px;
    height: 40px;
    object-fit: cover;
    border-radius: var(--erp-radius-surface-small);
    cursor: pointer;
}

.product-thumb:focus-visible {
    outline: 2px solid var(--erp-color-border-brand);
    outline-offset: 2px;
}

.no-image {
    color: var(--erp-color-text-tertiary);
}

.empty-items {
    padding: var(--erp-spacing-40);
    text-align: center;
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

@media (max-width: 860px) {
    .info-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
