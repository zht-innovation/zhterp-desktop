<template>
    <div
        v-if="product"
        class="product-detail-mask"
        role="presentation"
        @click.self="emit('close')"
    >
        <aside class="product-detail-panel" aria-label="产品全部信息">
            <header class="product-detail-header">
                <div class="product-detail-title-actions">
                    <h2>全部信息</h2>
                </div>
                <button class="dialog-close" type="button" @click="emit('close')">
                    <Icon name="lucide:x" />
                </button>
            </header>

            <div class="product-detail-list">
                <div
                    v-for="row in productDetailRows"
                    :key="row.label"
                    class="product-detail-row"
                >
                    <span class="detail-label">{{ row.label }}</span>
                    <button
                        v-if="row.label === 'BOM结构'"
                        class="detail-link-button"
                        type="button"
                        @click="product && emit('open-bom', product)"
                    >
                        {{ row.value }}
                    </button>
                    <span v-else class="detail-value">{{ row.value }}</span>
                </div>

                <div class="product-detail-row product-detail-image-row">
                    <span class="detail-label">产品图片</span>
                    <div class="detail-image-wrap">
                        <img
                            :src="resolveErpImageUrl(product.image || '')"
                            :alt="product.model || product.id || '产品图片'"
                        >
                    </div>
                </div>

                <div class="product-detail-row">
                    <span class="detail-label">条码/二维码</span>
                    <button class="detail-print-button" type="button" @click="showBarcodePrintDialog = true">打印</button>
                </div>

                <div class="product-detail-row">
                    <span class="detail-label">SN码</span>
                    <button class="detail-print-button" type="button" @click="showSnPrintDialog = true">批量打印</button>
                </div>

                <div class="product-detail-row">
                    <span class="detail-label">产品简介</span>
                    <el-popover
                        v-if="shouldShowProductTextPopover(descriptionText)"
                        trigger="hover"
                        placement="top"
                        :width="280"
                        popper-class="erp-app product-text-popover"
                    >
                        <div class="product-popover-content">{{ descriptionText }}</div>
                        <template #reference>
                            <span class="detail-value product-detail-text">{{ descriptionText }}</span>
                        </template>
                    </el-popover>
                    <span v-else class="detail-value">{{ descriptionText }}</span>
                </div>

            </div>
        </aside>

        <ProductBarcodePrintDialog
            v-if="showBarcodePrintDialog"
            :product-model="product.model || '--'"
            :product-code="product.id || ''"
            @close="showBarcodePrintDialog = false"
        />

        <ProductSnBatchPrintDialog
            v-if="showSnPrintDialog"
            :product-id="product.backendId || ''"
            :product-model="product.model || '--'"
            :product-code="product.id || ''"
            :sn-prefixes="product.snPrefixes || []"
            :sn-print-state="product.snPrintState || null"
            @close="showSnPrintDialog = false"
            @state-updated="handleSnPrintStateUpdated"
        />
    </div>
</template>

<script setup lang="ts">
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import ProductBarcodePrintDialog from "./ProductBarcodePrintDialog.vue";
import ProductSnBatchPrintDialog from "./ProductSnBatchPrintDialog.vue";

interface ProductDetailItem {
    backendId: string;
    id: string;
    model: string;
    modelCode: string;
    category: string;
    categoryId: string;
    image: string;
    unit: string;
    unitId: string;
    material: string;
    source: string;
    standardPrice: string;
    averagePrice: string;
    stockUpper: string;
    stockLower: string;
    defaultWarehouse: string;
    warehouseId: string;
    locationId: string;
    barcode: string;
    snPrefixes?: string[];
    snPrintState?: {
        monthKey: string;
        lastSerial: number;
        updatedAt?: string | Date;
        updatedBy?: string;
    };
    description: string;
    updatedBy?: string;
    updatedAt?: string;
}

const props = defineProps<{
    product: ProductDetailItem | null;
    canViewStandardPrice?: boolean;
}>();

const emit = defineEmits<{
    close: [];
    "open-bom": [product: ProductDetailItem];
    "sn-print-state-updated": [state: NonNullable<ProductDetailItem["snPrintState"]>];
}>();

const getText = (value: string | undefined, fallback = "--") => value || fallback;
const showBarcodePrintDialog = ref(false);
const showSnPrintDialog = ref(false);

const handleSnPrintStateUpdated = (state: NonNullable<ProductDetailItem["snPrintState"]>) => {
    emit("sn-print-state-updated", state);
};

const productDetailRows = computed(() => {
    const product = props.product;

    if (!product) {
        return [];
    }

    const rows = [
        { label: "产品编号", value: product.id },
        { label: "型号", value: getText(product.model) },
        { label: "分类", value: getText(product.category) },
        { label: "单位", value: getText(product.unit) },
        { label: "材质", value: getText(product.material) },
        { label: "来源", value: getText(product.source) },
        ...(props.canViewStandardPrice ? [{ label: "标准价", value: getText(product.standardPrice) }] : []),
        { label: "库存上限", value: getText(product.stockUpper) },
        { label: "库存下限", value: getText(product.stockLower) },
        { label: "默认仓库", value: getText(product.defaultWarehouse) },
        { label: "SN前缀参数", value: product.snPrefixes?.join("，") || "--" },
        { label: "BOM结构", value: "查看BOM结构" },
    ];

    return rows;
});

const descriptionText = computed(() => getText(props.product?.description, "无"));
const shouldShowProductTextPopover = (text: string) => {
    return text !== "--" && text !== "无" && text.length > 12;
};
</script>

<style scoped>
.product-detail-mask {
    position: fixed;
    inset: 0;
    z-index: 45;
    display: flex;
    justify-content: flex-end;
    background: var(--erp-color-bg-overlay);
}

.product-detail-panel {
    width: 560px;
    height: 100%;
    display: grid;
    grid-template-rows: 52px minmax(0, 1fr);
    overflow: hidden;
    background: var(--erp-color-fill-default);
    box-shadow: -8px 0 24px rgb(0 0 0 / 10%);
}

.product-detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--erp-spacing-12);
    border-bottom: 1px solid var(--erp-color-divider-subtle);
}

.product-detail-header h2 {
    margin: 0;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
}

.product-detail-title-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.dialog-close {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-icon-default);
    background: transparent;
    cursor: pointer;
}

.dialog-close:hover {
    background: var(--erp-color-fill-hover);
}

.product-detail-list {
    min-height: 0;
    display: grid;
    align-content: start;
    gap: 0;
    padding: var(--erp-spacing-20);
    overflow-y: auto;
}

.product-detail-row {
    min-height: 48px;
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    align-items: center;
    padding: 0 var(--erp-spacing-20);
    border-bottom: 1px solid var(--erp-color-divider-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-table-child);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.product-detail-row:nth-child(even) {
    background: var(--erp-color-fill-default);
}

.detail-label,
.detail-value {
    min-width: 0;
}

.detail-value {
    overflow-wrap: anywhere;
}

.detail-link-button {
    width: fit-content;
    min-width: 0;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-brand);
    background: transparent;
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
}

.detail-link-button:hover {
    text-decoration: underline;
}

.product-detail-text {
    max-width: 100%;
    display: block;
    overflow: hidden;
    overflow-wrap: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
}

.product-detail-image-row {
    min-height: 100px;
    align-items: center;
}

.detail-image-wrap {
    width: 108px;
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--erp-color-fill-default);
}

.detail-image-wrap img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
}

.detail-print-button {
    width: fit-content;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-brand);
    background: transparent;
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
}

:global(.product-text-popover .product-popover-content) {
    line-height: var(--erp-typography-content1-line-height);
    word-break: break-word;
    white-space: normal;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
}

:global(.product-text-popover) {
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
}
</style>
