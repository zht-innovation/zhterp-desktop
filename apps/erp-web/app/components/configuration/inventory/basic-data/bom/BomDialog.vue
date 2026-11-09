<template>
    <div class="erp-dialog-mask" @click.self="handleClose">
        <ErpDialogFrame
            class="bom-dialog"
            :title="title"
            width="min(1240px, calc(100vw - 32px))"
            height="min(760px, calc(100vh - 32px))"
            :show-footer="!isReadonly || showReadonlyActions"
            :close-disabled="confirmLoading"
            @close="handleClose"
            @submit.prevent="handleSubmit"
        >
            <div class="bom-dialog-body">
                <section class="form-section">
                    <h3>基本信息</h3>
                    <div class="bom-form-grid">
                        <label class="bom-form-row">
                            <span>BOM编号</span>
                            <input
                                v-model="form.id"
                                class="dialog-input readonly"
                                type="text"
                                readonly
                            >
                        </label>
                        <label class="bom-form-row">
                            <span><i>*</i>BOM名称</span>
                            <input
                                v-model="form.name"
                                class="dialog-input"
                                :class="{ readonly: isReadonly }"
                                type="text"
                                required
                                :readonly="isReadonly"
                            >
                        </label>
                        <div class="bom-form-row">
                            <span><i>*</i>产品</span>
                            <div class="product-select-field" :class="{ readonly: isReadonly }">
                                <input
                                    class="dialog-input"
                                    :class="{ readonly: isReadonly }"
                                    :value="selectedProductLabel"
                                    type="text"
                                    readonly
                                    placeholder="请选择产品"
                                >
                                <button
                                    v-if="!isReadonly"
                                    class="primary-button select-product-button"
                                    type="button"
                                    @click="emit('open-product-picker', 'main')"
                                >
                                    <Icon name="lucide:mouse-pointer-2" />
                                    选择
                                </button>
                            </div>
                        </div>
                        <label class="bom-form-row remark-row">
                            <span>备注</span>
                            <input
                                v-model="form.remark"
                                class="dialog-input"
                                :class="{ readonly: isReadonly }"
                                type="text"
                                :readonly="isReadonly"
                            >
                        </label>
                    </div>
                    <p v-if="formError" class="form-error">{{ formError }}</p>
                </section>

                <section class="form-section bom-structure-section">
                    <div class="section-head">
                        <h3>BOM结构</h3>
                        <div v-if="!isReadonly" class="structure-actions">
                            <button
                                class="primary-button"
                                type="button"
                                @click="emit('open-product-picker', 'child')"
                            >
                                <Icon name="lucide:circle-plus" class="button-icon" />
                                <span>选择产品</span>
                            </button>
                            <button
                                class="text-button"
                                type="button"
                                @click="emit('open-column-config')"
                            >
                                <Icon name="lucide:columns-3" class="button-icon" />
                                <span>配置列</span>
                            </button>
                            <button
                                class="danger-text-button"
                                type="button"
                                @click="emit('clear-structure')"
                            >
                                <Icon name="lucide:trash-2" class="button-icon" />
                                <span>清空</span>
                            </button>
                        </div>
                    </div>

                    <ErpTableFrame
                        class="structure-table"
                        :columns="effectiveStructureColumnTemplate"
                        :empty="structureItems.length === 0"
                        empty-text="暂未选择子项物料"
                        scroll-x
                        embedded
                    >
                        <template #header>
                            <div class="table-row table-head structure-row">
                                <div
                                    v-for="column in effectiveStructureColumns"
                                    :key="column.key"
                                    class="table-cell structure-cell"
                                    :class="{
                                        'structure-action-cell erp-table-fixed-end': column.key === 'actions',
                                    }"
                                >
                                    {{ column.label }}
                                </div>
                            </div>
                        </template>

                        <div
                            v-for="item in structureItems"
                            :key="item.rowId"
                            class="table-row data-row structure-row"
                        >
                            <div
                                v-for="column in effectiveStructureColumns"
                                :key="item.rowId + '-' + column.key"
                                class="table-cell structure-cell"
                                :class="{
                                    'image-cell': column.key === 'image',
                                    'structure-action-cell erp-table-fixed-end': column.key === 'actions',
                                }"
                            >
                                <span v-if="column.key === 'materialNo'">{{ item.product.id }}</span>
                                <span v-else-if="column.key === 'materialName'">{{ item.product.model }}</span>
                                <span v-else-if="column.key === 'material'">{{ item.product.material || "--" }}</span>
                                <template v-else-if="column.key === 'image'">
                                    <img
                                        v-if="item.product.image"
                                        :src="item.product.image"
                                        :alt="item.product.model || item.product.id"
                                        class="clickable-image"
                                        @click.stop="openImagePreview(item.product.image, item.product.model || item.product.id)"
                                    >
                                    <span v-else>--</span>
                                </template>
                                <span v-else-if="column.key === 'category'">{{ item.product.category }}</span>
                                <input
                                    v-else-if="column.key === 'quantity'"
                                    :value="formatStructureQuantity(item.quantity)"
                                    class="dialog-input quantity-input"
                                    :class="{ readonly: isReadonly }"
                                    type="number"
                                    min="1"
                                    step="0.1"
                                    :readonly="isReadonly"
                                    @change="handleQuantityChange(item, $event)"
                                >
                                <span v-else-if="column.key === 'unit'">{{ item.product.unit }}</span>
                                <div v-else-if="column.key === 'actions' && !isReadonly" class="item-actions">
                                    <button
                                        class="text-button"
                                        type="button"
                                        :aria-label="`替换产品${item.product.id}`"
                                        :disabled="confirmLoading"
                                        @click="emit('replace-structure-item', item.rowId)"
                                    >
                                        <Icon name="lucide:replace" />
                                        替换
                                    </button>
                                    <button
                                        class="icon-button delete"
                                        type="button"
                                        :aria-label="`删除产品${item.product.id}`"
                                        :disabled="confirmLoading"
                                        @click="emit('remove-structure-item', item.rowId)"
                                    >
                                        <Icon name="lucide:trash-2" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </ErpTableFrame>
                </section>
            </div>

            <template #footer>
                <button
                    v-if="showDraftActions"
                    class="dialog-button cancel"
                    type="button"
                    @click="emit('open-drafts')"
                >
                    草稿箱
                </button>
                <button
                    v-if="showDraftActions"
                    class="dialog-button cancel"
                    type="button"
                    @click="emit('save-draft')"
                >
                    保存草稿
                </button>
                <button class="dialog-button cancel" type="button" :disabled="confirmLoading" @click="handleClose">
                    {{ cancelText }}
                </button>
                <button
                    v-if="!isReadonly || showReadonlyActions"
                    class="dialog-button confirm"
                    type="submit"
                    :disabled="confirmDisabled || confirmLoading"
                >
                    {{ confirmLoading ? "处理中" : confirmText }}
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
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";

type ProductPickerContext = "main" | "child";
type StructureColumnKey =
    | "materialNo"
    | "materialName"
    | "material"
    | "image"
    | "category"
    | "quantity"
    | "unit"
    | "actions";

interface ProductItem {
    id: string;
    model: string;
    material?: string;
    category: string;
    image: string;
    totalQuantity: string;
    availableQuantity: string;
    unit: string;
    source: string;
    finishedCount: string;
}

interface BomStructureItem {
    rowId: string;
    product: ProductItem;
    quantity: number;
}

interface BomForm {
    id: string;
    name: string;
    remark: string;
    product: ProductItem | null;
}

interface StructureColumn {
    key: StructureColumnKey;
    label: string;
    width: number;
    visible: boolean;
    locked: boolean;
}

const props = withDefaults(defineProps<{
    title: string;
    form: BomForm;
    formError: string;
    selectedProductLabel: string;
    structureItems: BomStructureItem[];
    visibleStructureColumns: StructureColumn[];
    readonly?: boolean;
    showDraftActions?: boolean;
    showReadonlyActions?: boolean;
    cancelText?: string;
    confirmText?: string;
    confirmDisabled?: boolean;
    confirmLoading?: boolean;
}>(), {
    readonly: false,
    showDraftActions: false,
    showReadonlyActions: false,
    cancelText: "取消",
    confirmText: "确认",
    confirmDisabled: false,
    confirmLoading: false,
});

const emit = defineEmits<{
    close: [];
    confirm: [];
    "open-drafts": [];
    "save-draft": [];
    "open-product-picker": [context: ProductPickerContext];
    "open-column-config": [];
    "clear-structure": [];
    "replace-structure-item": [rowId: string];
    "remove-structure-item": [rowId: string];
    "update-quantity": [item: BomStructureItem, event: Event];
}>();

const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");

const formatStructureQuantity = (quantity: number) => {
    return (Number.isFinite(quantity) ? quantity : 1).toFixed(1);
};

const openImagePreview = (url: string, title: string) => {
    previewImages.value = [{ url, alt: title }];
    previewTitle.value = title;
    showImagePreview.value = true;
};

const isReadonly = computed(() => props.readonly);

const effectiveStructureColumns = computed(() =>
    isReadonly.value
        ? props.visibleStructureColumns.filter((column) => column.key !== "actions")
        : props.visibleStructureColumns,
);

const effectiveStructureColumnTemplate = computed(() =>
    effectiveStructureColumns.value.map((column) => `${column.width}px`).join(" "),
);

const handleSubmit = () => {
    if (
        (!isReadonly.value || props.showReadonlyActions)
        && !props.confirmDisabled
        && !props.confirmLoading
    ) {
        emit("confirm");
    }
};

const handleClose = () => {
    if (!props.confirmLoading) {
        emit("close");
    }
};

const handleQuantityChange = (item: BomStructureItem, event: Event) => {
    if (!isReadonly.value) {
        emit("update-quantity", item, event);
    }
};
</script>

<style scoped>
.bom-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
    overflow: hidden;
}

.bom-dialog :deep(.erp-dialog-frame) {
    min-width: 0;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
}

.bom-dialog-body {
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

.form-section h3,
.section-head h3 {
    margin: 0;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.bom-form-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
    gap: var(--erp-spacing-12) var(--erp-spacing-20);
    margin-top: var(--erp-spacing-12);
}

.bom-form-row {
    min-width: 0;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.bom-form-row > span {
    min-height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
}

.bom-form-row i {
    color: var(--erp-color-text-required);
    font-style: normal;
}

.product-select-field {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 80px;
    gap: var(--erp-spacing-8);
}

.product-select-field.readonly {
    grid-template-columns: minmax(0, 1fr);
}

.select-product-button {
    width: 80px;
}

.form-error {
    margin: var(--erp-spacing-8) 0 0 86px;
    color: var(--erp-color-text-status-error);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.bom-structure-section {
    min-height: 0;
    display: grid;
    grid-template-rows: 32px minmax(0, 1fr);
    gap: var(--erp-spacing-12);
}

.section-head,
.structure-actions {
    display: flex;
    align-items: center;
}

.section-head {
    justify-content: space-between;
    gap: var(--erp-spacing-16);
}

.structure-actions {
    flex: 1;
    gap: var(--erp-spacing-8);
}

.structure-actions .primary-button {
    margin-right: auto;
}

.primary-button,
.text-button,
.danger-text-button {
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
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

.structure-table {
    min-height: 0;
    height: 100%;
}

.structure-table .structure-row {
    width: max-content;
    min-width: 100%;
}

.structure-table .data-row {
    height: 80px;
}

.structure-table .structure-cell {
    overflow: hidden;
    text-overflow: ellipsis;
}

.structure-action-cell {
    position: sticky;
    right: 0;
    z-index: 4;
    height: 100%;
}

.item-actions {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-8);
}

.table-head .structure-action-cell {
    z-index: 21;
    background: var(--erp-color-fill-table-header);
}

.data-row .structure-action-cell {
    background: var(--erp-color-fill-default);
}

.data-row:hover .structure-action-cell {
    background: var(--erp-color-fill-hover);
}

.quantity-input {
    width: 68px;
    text-align: center;
}

.image-cell img {
    width: 90px;
    height: 58px;
    object-fit: contain;
}

.clickable-image {
    cursor: pointer;
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

@media (max-width: 900px) {
    .bom-form-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
