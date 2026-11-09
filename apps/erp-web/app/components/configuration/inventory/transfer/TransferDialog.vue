<template>
    <div class="erp-dialog-mask inventory-responsive-dialog-mask" @click.self="emit('close')">
        <ErpDialogFrame
            class="transfer-dialog"
            :title="title"
			width="min(1240px, calc(100vw - 32px))"
			height="min(760px, calc(100vh - 32px))"
            @close="emit('close')"
            @submit.prevent="emit('confirm')"
        >
            <div class="transfer-form-body">
                <section class="form-section basic-info-section">
                    <h3>基本信息</h3>

                    <div class="form-grid">
                        <label class="transfer-form-row">
                            <span>单据编号</span>
                            <input v-model="form.code" type="text" disabled>
                        </label>

                        <label class="transfer-form-row">
                            <span>调拨日期<i>*</i></span>
                            <InventoryDatePicker
                                v-model="form.transferDate"
                                aria-label-text="选择调拨日期"
                            />
                        </label>

                        <label class="transfer-form-row">
                            <span>经办人<i>*</i></span>
                            <input v-model="form.handler" type="text" placeholder="请填写" required>
                        </label>
                    </div>

                    <div class="form-grid">
                        <label class="transfer-form-row">
                            <span>借用人<i>*</i></span>
                            <input v-model="form.borrower" type="text" placeholder="请填写" required>
                        </label>

                        <label class="transfer-form-row">
                            <span>预计归还日期<i>*</i></span>
                            <InventoryDatePicker
                                v-model="form.expectedReturnDate"
                                aria-label-text="选择预计归还日期"
                            />
                        </label>

                        <label class="transfer-form-row">
                            <span>实际归库时间</span>
                            <InventoryDatePicker
                                v-model="form.actualReturnTime"
                                aria-label-text="实际归库时间"
                                disabled
                            />
                        </label>

                        <label class="transfer-form-row">
                            <span>快递公司</span>
                            <input v-model="form.courierCompany" type="text" placeholder="选填">
                        </label>

                        <label class="transfer-form-row">
                            <span>快递单号</span>
                            <input v-model="form.trackingNo" type="text" placeholder="选填">
                        </label>

                        <label class="transfer-form-row">
                            <span>备注</span>
                            <input v-model="form.remark" type="text" placeholder="选填">
                        </label>
                    </div>
                </section>

                <section class="form-section product-section">
                    <div class="product-actions">
                        <div class="product-action-left">
                            <button class="primary-button" type="button" @click="emit('select-products')">
                                <Icon name="lucide:circle-plus" class="button-icon" />
                                <span>选择产品</span>
                            </button>
                            <InventoryInlineScanner
                                :loading="scanLoading"
                                :clear-signal="scanClearSignal"
                                :auto-focus="scanAutoFocus"
                                @scan-product="(code) => emit('scan-product', code)"
                                @scan-location="(code) => emit('scan-location', code)"
                            />
                        </div>
                        <button class="danger-text-button" type="button" @click="emit('clear-items')">
                            <Icon name="lucide:trash-2" class="button-icon" />
                            <span>清空</span>
                        </button>
                    </div>

                    <ErpTableFrame
                        class="product-table"
                        :columns="productColumnTemplate"
                        :empty="form.items.length === 0"
                        empty-text="暂未选择产品"
                        scroll-x
                        embedded
                    >
                        <template #header>
                            <div class="table-row table-head product-row">
                                <div
                                    v-for="column in productColumns"
                                    :key="column.key"
                                    class="table-cell product-cell"
                                    :class="{
                                        'action-cell erp-table-fixed-end': column.key === 'actions',
                                    }"
                                >
                                    {{ column.label }}
                                </div>
                            </div>
                        </template>

                        <div
                            v-for="(item, index) in form.items"
                            :key="index"
                            class="table-row data-row product-row product-data-row"
                        >
                            <div class="table-cell product-cell" :title="item.productCode || '--'">
                                {{ item.productCode || "--" }}
                            </div>
                            <div class="table-cell product-cell" :title="item.model || '--'">
                                {{ item.model || "--" }}
                            </div>
                            <div class="table-cell product-cell" :title="item.category || '--'">
                                {{ item.category || "--" }}
                            </div>
                            <div class="table-cell product-cell image-cell">
                                <img
                                    v-if="item.image"
                                    :src="item.image"
                                    class="clickable-image"
                                    :alt="item.model || item.productCode || '产品图片'"
                                    role="button"
                                    tabindex="0"
                                    :aria-label="`预览${item.model || item.productCode || '产品'}图片`"
                                    @click.stop="openImagePreview(item.image, item.model || item.productCode || '产品图片')"
                                    @keydown.enter.prevent="openImagePreview(item.image, item.model || item.productCode || '产品图片')"
                                    @keydown.space.prevent="openImagePreview(item.image, item.model || item.productCode || '产品图片')"
                                >
                                <span v-else>--</span>
                            </div>
                            <div class="table-cell product-cell">
                                <input
                                    v-model.number="item.quantity"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    class="quantity-input"
                                    :aria-label="`设置${item.productCode || item.model || '产品'}数量`"
                                >
                            </div>
                            <div class="table-cell product-cell" :title="item.unit || '--'">
                                {{ item.unit || "--" }}
                            </div>
                            <div class="table-cell product-cell warehouse-cell">
                                <InventoryWarehouseCascader
                                    :warehouse-options="warehouseOptions"
                                    :warehouse-id="item.warehouseId || ''"
                                    :location-id="item.locationId || ''"
                                    :label="formatWarehouseLabel(item.warehouseName, item.locationName)"
                                    aria-label="选择转出仓库"
                                    @select="(warehouseId, locationId, label) =>
                                        emit('update-item-warehouse', index, warehouseId, locationId, label)"
                                />
                            </div>
                            <div class="table-cell product-cell action-cell erp-table-fixed-end">
                                <button
                                    class="icon-button delete"
                                    type="button"
                                    :aria-label="`删除${item.productCode || item.model || '产品'}`"
                                    title="删除产品"
                                    @click="emit('remove-item', index)"
                                >
                                    <Icon name="lucide:trash-2" />
                                </button>
                            </div>
                        </div>
                    </ErpTableFrame>
                </section>
            </div>

            <template #footer>
                <button class="dialog-button cancel" type="button" @click="emit('close')">
                    取消
                </button>
                <button class="dialog-button confirm" type="submit">
                    确认
                </button>
            </template>
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
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InventoryDatePicker from "~/components/configuration/inventory/InventoryDatePicker.vue";
import InventoryInlineScanner from "~/components/configuration/inventory/InventoryInlineScanner.vue";
import InventoryWarehouseCascader from "~/components/configuration/inventory/InventoryWarehouseCascader.vue";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { InventoryTransferItem } from "~~/shared/types/inventory";
import type { InboundWarehouseOption } from "~/utils/inventory/inboundFrontendMapping";

interface TransferForm {
    code: string;
    transferDate: string;
    handler: string;
    borrower: string;
    expectedReturnDate: string;
    actualReturnTime: string;
    courierCompany: string;
    trackingNo: string;
    remark: string;
    items: InventoryTransferItem[];
}

interface ProductColumn {
    key: string;
    label: string;
    width: number;
}

defineProps<{
    title: string;
    form: TransferForm;
    warehouseOptions: InboundWarehouseOption[];
    scanLoading?: boolean;
    scanClearSignal?: number;
    scanAutoFocus?: boolean;
}>();

const emit = defineEmits<{
    close: [];
    confirm: [];
    "select-products": [];
    "scan-product": [code: string];
    "scan-location": [code: string];
    "clear-items": [];
    "remove-item": [index: number];
    "update-item-warehouse": [index: number, warehouseId: string, locationId: string, label: string];
}>();

const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");

const productColumns: ProductColumn[] = [
    { key: "productCode", label: "产品编号", width: 150 },
    { key: "model", label: "型号", width: 200 },
    { key: "category", label: "分类", width: 130 },
    { key: "image", label: "产品图片", width: 140 },
    { key: "quantity", label: "数量", width: 140 },
    { key: "unit", label: "单位", width: 90 },
    { key: "sourceWarehouse", label: "转出仓库", width: 170 },
    { key: "actions", label: "操作", width: 120 },
];

const productColumnTemplate = productColumns.map((column) => `${column.width}px`).join(" ");

const formatWarehouseLabel = (warehouseName?: string, locationName?: string) => {
    const parts = [warehouseName, locationName].filter(Boolean);

    return parts.length ? parts.join(" / ") : "";
};

const openImagePreview = (url: string, title: string) => {
    previewImages.value = [{ url, alt: title }];
    previewTitle.value = title;
    showImagePreview.value = true;
};
</script>

<style scoped>
.transfer-dialog {
    min-width: 0;
    max-width: 95vw;
    max-height: calc(100vh - 32px);
}

@supports (height: 100dvh) {
    .transfer-dialog {
        height: min(760px, calc(100dvh - 32px)) !important;
        max-height: calc(100dvh - 32px);
    }
}

.transfer-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
    overflow: hidden;
}

.transfer-form-body {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--erp-spacing-12);
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

.form-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--erp-spacing-20);
}

.form-section h3 + .form-grid {
    margin-top: var(--erp-spacing-20);
}

.form-grid + .form-grid {
    margin-top: var(--erp-spacing-20);
}

.transfer-form-row {
    min-width: 0;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: var(--erp-spacing-12);
    margin: 0;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.transfer-form-row > span {
    min-height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    white-space: nowrap;
}

.transfer-form-row > span i {
    color: var(--erp-color-text-required);
    font-style: normal;
}

.transfer-form-row input,
.transfer-form-row select {
    width: 100%;
    min-width: 0;
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font: inherit;
    outline: 0;
    box-sizing: border-box;
}

.transfer-form-row input:focus,
.transfer-form-row select:focus {
    border-color: var(--erp-color-border-brand);
}

.transfer-form-row input:disabled {
    border-color: var(--erp-color-border-muted);
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
    cursor: not-allowed;
}

.transfer-form-row :deep(.inventory-date-picker) {
    width: 100%;
    max-width: none;
    flex: 1 1 auto;
}

.transfer-form-row :deep(.date-trigger) {
    height: var(--erp-size-control-height-sm);
}

.transfer-form-row :deep(.date-panel) {
    z-index: 60;
}

.transfer-form-row select {
    padding-right: var(--erp-spacing-24);
    appearance: none;
}

.product-section {
    min-height: 0;
    display: grid;
    grid-template-rows: 32px minmax(0, 1fr);
    gap: var(--erp-spacing-12);
}

.product-actions,
.product-action-left {
    display: flex;
    align-items: center;
}

.product-actions {
    justify-content: space-between;
}

.product-action-left {
    display: flex;
    gap: var(--erp-spacing-8);
}

.primary-button,
.text-button,
.danger-text-button {
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    gap: var(--erp-spacing-4);
    justify-content: center;
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    border: 0;
    border-radius: var(--erp-radius-control-default);
    background: transparent;
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
    cursor: pointer;
}

.primary-button {
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.primary-button:not(:disabled):active {
    background: var(--erp-color-action-primary-pressed);
}

.text-button {
    color: var(--erp-color-text-brand);
}

.danger-text-button {
    color: var(--erp-color-text-status-error);
}

.button-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.product-table {
    min-height: 0;
    height: 100%;
}

.product-table .product-row {
    width: max-content;
    min-width: 100%;
}

.product-table .product-data-row {
    height: 80px;
}

.product-cell {
    overflow: hidden;
    text-overflow: ellipsis;
}

.image-cell img {
    width: 90px;
    height: 58px;
    object-fit: contain;
}

.clickable-image {
    cursor: pointer;
}

.clickable-image:focus-visible {
    outline: 2px solid var(--erp-color-border-brand);
    outline-offset: 2px;
}

.warehouse-cell {
    overflow: visible;
}

.quantity-input {
    width: 68px;
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-4);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    text-align: center;
    font: inherit;
    font-size: var(--erp-typography-content1-font-size);
    box-sizing: border-box;
}

.quantity-input:focus {
    border-color: var(--erp-color-border-brand);
}

.action-cell {
    position: sticky;
    right: 0;
    z-index: 4;
    height: 100%;
    background: var(--erp-color-fill-default);
}

.table-head .action-cell {
    z-index: 21;
    background: var(--erp-color-fill-table-header);
}

.data-row:hover .action-cell {
    background: var(--erp-color-fill-hover);
}

.icon-button {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    background: transparent;
    cursor: pointer;
}

.icon-button:hover {
    background: var(--erp-color-fill-hover);
}

.icon-button.delete {
    color: var(--erp-color-icon-error);
}

@media (max-width: 1280px) {
    .form-grid {
        grid-template-columns: repeat(2, minmax(300px, 1fr));
    }
}

@media (max-width: 860px) {
    .form-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
