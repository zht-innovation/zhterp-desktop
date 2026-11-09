<template>
    <div v-if="modelValue" class="erp-dialog-mask" @click.self="handleCancel">
        <ErpDialogFrame
            class="supplier-product-dialog"
            title="关联产品"
            width="1240px"
            height="760px"
            :form="false"
            :close-disabled="isSavingProducts"
            @close="handleCancel"
        >
            <div class="dialog-toolbar">
                <button class="primary-button" type="button" @click="openProductPicker">
                    <Icon name="lucide:package-plus" class="button-icon" />
                    <span>选择产品</span>
                </button>
            </div>

            <ErpTableFrame
                class="product-table"
                :columns="tableColumnTemplate"
                :minimum-width="tableMinimumWidth"
                :loading="isLoadingProducts"
                :empty="selectedProducts.length === 0"
                loading-text="加载中..."
                empty-text="暂未选择产品"
                scroll-x
                embedded
            >
                <template #header>
                    <div class="table-row table-head">
                        <div
                            v-for="column in productColumns"
                            :key="column.key"
                            class="table-cell"
                        >
                            {{ column.label }}
                        </div>
                    </div>
                </template>

                <div
                    v-for="product in selectedProducts"
                    :key="product.id"
                    class="table-row data-row"
                >
                    <div
                        v-for="column in productColumns"
                        :key="product.id + '-' + column.key"
                        class="table-cell"
                        :class="{ 'image-cell': column.key === 'image' }"
                    >
                        <template v-if="column.key === 'image'">
                            <img
                                v-if="product.image"
                                :src="product.image"
                                :alt="product.model || product.id"
                                class="clickable-image"
                                @click.stop="openImagePreview(product.image, product.model || product.id)"
                            >
                            <span v-else>--</span>
                        </template>
                        <span v-else>{{ getProductCellValue(product, column.key) }}</span>
                    </div>
                </div>
            </ErpTableFrame>

            <template #footer>
                <button
                    class="dialog-button cancel"
                    type="button"
                    :disabled="isSavingProducts"
                    @click="handleCancel"
                >
                    取消
                </button>
                <button
                    class="dialog-button confirm"
                    type="button"
                    :disabled="isSavingProducts || isLoadingProducts"
                    @click="saveRelatedProducts"
                >
                    确认
                </button>
            </template>
        </ErpDialogFrame>

        <ProductPickerDialog
            v-if="showProductPickerDialog"
            selection-mode="multiple"
            :selected-product-ids="selectedProductIds"
            :selected-products="selectedProducts"
            :show-quick-create-product="allowQuickCreateProduct"
            @close="closeProductPicker"
            @confirm="confirmProductSelection"
        />

        <ImagePreviewDialog
            v-model="showImagePreview"
            :title="previewTitle"
            :images="previewImages"
        />
    </div>
</template>

<script setup lang="ts">
import type { InventoryProduct } from "~~/shared/types/inventory";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import ProductPickerDialog from "~/components/configuration/inventory/ProductPickerDialog.vue";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import {
    normalizeProductPickerItem,
    type ProductPickerItem,
} from "~/composables/inventory/useInventoryProductPickerData";
import {
    retrievePurchaseSupplierProducts,
    savePurchaseSupplierProducts,
} from "~/composables/api/usePurchaseSupplierApi";
import {
    getErpTableGridColumn,
    getErpTableMinimumWidth,
} from "~/utils/inventory/erpTableColumns";

interface SupplierProductColumn {
    key:
        | "id"
        | "model"
        | "category"
        | "image"
        | "totalQuantity"
        | "availableQuantity"
        | "unit"
        | "source";
    label: string;
    width: number;
    grow?: boolean;
}

const props = withDefaults(defineProps<{
    modelValue: boolean;
    supplierId?: string;
    allowQuickCreateProduct?: boolean;
}>(), {
    supplierId: "",
    allowQuickCreateProduct: false,
});

const emit = defineEmits<{
    "update:modelValue": [value: boolean];
    saved: [];
}>();

const productColumns: SupplierProductColumn[] = [
    { key: "id", label: "产品编号", width: 180 },
    { key: "model", label: "型号", width: 180, grow: true },
    { key: "category", label: "分类", width: 160, grow: true },
    { key: "image", label: "产品图片", width: 160 },
    { key: "totalQuantity", label: "全部数量", width: 120 },
    { key: "availableQuantity", label: "可用数量", width: 120 },
    { key: "unit", label: "单位", width: 100 },
    { key: "source", label: "来源", width: 120 },
];

const selectedProducts = ref<ProductPickerItem[]>([]);
const showProductPickerDialog = ref(false);
const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");
const isLoadingProducts = ref(false);
const isSavingProducts = ref(false);

const tableColumnTemplate = computed(() => productColumns.map(getErpTableGridColumn).join(" "));
const tableMinimumWidth = getErpTableMinimumWidth(productColumns);
const selectedProductIds = computed(() => selectedProducts.value.map((product) => product.id));

const closeDialog = () => {
    emit("update:modelValue", false);
};

const handleCancel = () => {
    if (!isSavingProducts.value) {
        closeDialog();
    }
};

const openProductPicker = () => {
    showProductPickerDialog.value = true;
};

const closeProductPicker = () => {
    showProductPickerDialog.value = false;
};

const openImagePreview = (url: string, title: string) => {
    previewImages.value = [{ url, alt: title }];
    previewTitle.value = title;
    showImagePreview.value = true;
};

const confirmProductSelection = (products: ProductPickerItem[]) => {
    selectedProducts.value = [...products];
    closeProductPicker();
};

const loadRelatedProducts = async () => {
    if (!props.supplierId) {
        selectedProducts.value = [];
        return;
    }

    isLoadingProducts.value = true;
    try {
        const res = await retrievePurchaseSupplierProducts(props.supplierId);
        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取供应商关联产品失败");
            selectedProducts.value = [];
            return;
        }

        selectedProducts.value = Array.isArray(res.data?.list)
            ? res.data.list.map((product) => normalizeProductPickerItem(product as InventoryProduct))
            : [];
    } catch (err: any) {
        selectedProducts.value = [];
        ElMessage.error(err?.data?.msg || err?.message || "获取供应商关联产品失败");
    } finally {
        isLoadingProducts.value = false;
    }
};

const saveRelatedProducts = async () => {
    if (!props.supplierId || isSavingProducts.value) {
        return;
    }

    const productIds = selectedProducts.value
        .map((product) => product.backendId)
        .filter(Boolean);

    isSavingProducts.value = true;
    try {
        const res = await savePurchaseSupplierProducts({
            supplierId: props.supplierId,
            productIds,
        });
        if (res.code !== 200) {
            ElMessage.error(res.msg || "保存关联产品失败");
            return;
        }

        ElMessage.success("保存关联产品成功");
        emit("saved");
        closeDialog();
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "保存关联产品失败");
    } finally {
        isSavingProducts.value = false;
    }
};

const getProductCellValue = (
    product: ProductPickerItem,
    key: SupplierProductColumn["key"],
) => product[key] || "--";

watch(() => props.modelValue, (visible) => {
    if (!visible) {
        closeProductPicker();
        return;
    }

    loadRelatedProducts();
});
</script>

<style scoped>
.supplier-product-dialog :deep(.erp-dialog-frame__body) {
    display: grid;
    grid-template-rows: 32px minmax(0, 1fr);
}

.dialog-toolbar {
    display: flex;
    align-items: center;
}

.primary-button {
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
}

.button-icon {
    width: 18px;
    height: 18px;
}

.product-table {
    min-height: 0;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
}

.table-row {
    display: grid;
    grid-template-columns: var(--erp-table-columns);
    align-items: center;
}

.table-head {
    height: 48px;
}

.data-row {
    height: 64px;
}

.image-cell img {
    width: 58px;
    height: 42px;
    display: block;
    object-fit: contain;
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-fill-control-secondary);
}

.clickable-image {
    cursor: pointer;
}
</style>
