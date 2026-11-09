<template>
    <div class="erp-dialog-mask inventory-responsive-dialog-mask" @click.self="emit('close')">
        <ErpDialogFrame
            class="inbound-dialog"
            :class="{ readonly: isReadonly }"
            :title="title"
			width="min(1240px, calc(100vw - 32px))"
			height="min(760px, calc(100vh - 32px))"
            :show-footer="!isReadonly"
            @close="emit('close')"
            @submit.prevent="emit('confirm')"
        >
            <div class="dialog-body">
                <section class="form-section">
                    <h3>基本信息</h3>
                    <div
                        class="info-grid"
                        :class="{
                            'initial-info-grid': isInitialInfoType,
                            'purchase-info-grid': form.type === '采购',
                            'production-info-grid': form.type === '生产',
                        }"
                    >
                        <label class="inbound-form-row id-row">
                            <span>入库编号</span>
                            <input
                                :value="form.id"
                                type="text"
                                readonly
                                aria-label="入库编号"
                            >
                        </label>

                        <label class="inbound-form-row type-row">
                            <span>入库类型<i>*</i></span>
                            <SearchableSelect
                                :model-value="form.type"
                                :options="inboundTypeSelectOptions"
                                :disabled="isReadonly"
                                aria-label="入库类型"
                                placeholder="请选择"
                                @update:model-value="updateSelectField('type', $event)"
                            />
                        </label>

                        <template v-if="form.type === '采购'">
                            <label class="inbound-form-row dynamic-top-row">
                                <span>快递公司<i>*</i></span>
                                <SearchableSelect
                                    class="courier-company-select"
                                    :model-value="form.courierCompany"
                                    :options="courierCompanySelectOptions"
                                    :disabled="isReadonly"
                                    placeholder="请选择"
                                    aria-label="快递公司"
                                    @update:model-value="updateSelectField('courierCompany', $event)"
                                />
                            </label>

                            <label class="inbound-form-row dynamic-left-row">
                                <span>物流运单号<i>*</i></span>
                                <input
                                    :value="form.trackingNo"
                                    type="text"
                                    placeholder="快递单号"
                                    :readonly="isReadonly"
                                    aria-label="物流运单号"
                                    @input="updateField('trackingNo', $event)"
                                >
                            </label>

                            <label class="inbound-form-row purchase-order-row">
                                <span>采购单号<i>*</i></span>
                                <RemoteSelect
                                    v-model:id="selectedPurchaseOrderId"
                                    v-model:label="purchaseOrderNo"
                                    :fetch-options="fetchPurchaseOrderOptions"
                                    required
                                    placeholder="请输入采购单号"
                                    :disabled="isReadonly"
                                >
                                    <template #option="{ option }">
                                        <span class="purchase-order-option">
                                            <span class="purchase-order-option__number">{{ option.label }}</span>
                                            <span
                                                v-if="getPurchaseOrderPreviewProducts(option.id).length"
                                                class="purchase-order-option__products"
                                            >
                                                <span
                                                    v-for="product in getPurchaseOrderPreviewProducts(option.id)"
                                                    :key="product.productId"
                                                    class="purchase-order-option__product"
                                                >
                                                    <img
                                                        v-if="product.image"
                                                        :src="resolveErpImageUrl(product.image)"
                                                        :alt="product.productName"
                                                    >
                                                    <span v-else class="purchase-order-option__image-placeholder">
                                                        暂无图片
                                                    </span>
                                                    <span>{{ product.productName }}</span>
                                                </span>
                                            </span>
                                        </span>
                                    </template>
                                </RemoteSelect>
                            </label>
                        </template>

                        <template v-else-if="form.type === '生产'">
                            <label class="inbound-form-row dynamic-top-row">
                                <span>加工单号</span>
                                <input
                                    :value="form.processingOrderNo"
                                    type="text"
                                    :readonly="isReadonly"
                                    aria-label="加工单号"
                                    @input="updateField('processingOrderNo', $event)"
                                >
                            </label>

                            <label class="inbound-form-row dynamic-left-row">
                                <span>生产负责人</span>
                                <input
                                    :value="form.productionOwner"
                                    type="text"
                                    :readonly="isReadonly"
                                    aria-label="生产负责人"
                                    @input="updateField('productionOwner', $event)"
                                >
                            </label>

                            <label class="inbound-form-row sales-order-row">
                                <span>销售订单</span>
                                <RemoteSelect
                                    v-model:id="salesOrderId"
                                    v-model:label="salesOrderLabel"
                                    :fetch-options="fetchSalesOrderOptions"
                                    placeholder="请选择待生产订单"
                                    :disabled="isReadonly"
                                />
                            </label>
                        </template>

                        <template v-else-if="form.type === '售出退货'">
                            <label class="inbound-form-row dynamic-top-row">
                                <span>订单号</span>
                                <input
                                    :value="form.orderNo"
                                    type="text"
                                    :readonly="isReadonly"
                                    aria-label="订单号"
                                    @input="updateField('orderNo', $event)"
                                >
                            </label>

                            <label class="inbound-form-row dynamic-left-row">
                                <span>退货原因</span>
                                <input
                                    :value="form.returnReason"
                                    type="text"
                                    :readonly="isReadonly"
                                    aria-label="退货原因"
                                    @input="updateField('returnReason', $event)"
                                >
                            </label>
                        </template>

                        <label class="inbound-form-row date-row">
                            <span>入库日期<i>*</i></span>
                            <InventoryDatePicker
                                v-model="dialogDate"
                                :disabled="isReadonly"
                                aria-label-text="选择入库日期"
                                initial-month="2026-05-01"
                            />
                        </label>

                        <label v-if="isInitialInfoType" class="inbound-form-row operator-row">
                            <span>操作人</span>
                            <input
                                :value="form.operator"
                                type="text"
                                readonly
                                aria-label="操作人"
                            >
                        </label>

                        <label class="inbound-form-row remark-row">
                            <span>备注</span>
                            <input
                                :value="form.remark"
                                type="text"
                                :readonly="isReadonly"
                                aria-label="备注"
                                @input="updateField('remark', $event)"
                            >
                        </label>
                    </div>
                </section>

                <section class="form-section product-section" :class="{ readonly: isReadonly }">
                    <div v-if="!isReadonly" class="product-actions">
                        <div class="product-action-left">
                            <button
                                class="primary-button"
                                type="button"
                                @click="emit('open-product-picker')"
                            >
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
                        <button
                            class="danger-text-button"
                            type="button"
                            @click="emit('clear-products')"
                        >
                            <Icon name="lucide:trash-2" class="button-icon" />
                            <span>清空</span>
                        </button>
                    </div>

                    <ErpTableFrame
                        class="product-table"
                        :columns="productColumnTemplate"
                        :empty="products.length === 0"
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
                            v-for="product in products"
                            :key="product.rowId"
                            class="table-row data-row product-row product-data-row"
                        >
                            <div class="table-cell product-cell">{{ product.productCode }}</div>
                            <div class="table-cell product-cell">{{ product.model || "--" }}</div>
                            <div class="table-cell product-cell">{{ product.categoryName }}</div>
                            <div class="table-cell product-cell image-cell">
                                <img
                                    v-if="product.image"
                                    :src="resolveErpImageUrl(product.image)"
                                    :alt="product.model"
                                    class="clickable-image"
                                    @click.stop="openImagePreview(product.image, product.model || product.productCode)"
                                >
                                <span v-else>--</span>
                            </div>
                            <div class="table-cell product-cell">
                                <input
                                    :value="formatQuantity(product.quantity)"
                                    class="dialog-input quantity-input"
                                    type="number"
                                    min="0"
                                    step="0.001"
                                    :readonly="isReadonly"
                                    @change="updateQuantity(product.rowId, $event)"
                                >
                            </div>
                            <div class="table-cell product-cell">{{ product.unitName }}</div>
                            <div class="table-cell product-cell warehouse-cell">
                                <InventoryWarehouseCascader
                                    :warehouse-options="warehouseOptions"
                                    :warehouse-id="product.warehouseId"
                                    :location-id="product.locationId"
                                    :label="product.targetWarehouse"
                                    :disabled="isReadonly"
                                    @select="(warehouseId, locationId, label) =>
                                        emit('update-warehouse', product.rowId, warehouseId, locationId, label)"
                                />
                            </div>
                            <div v-if="!isReadonly" class="table-cell product-cell action-cell erp-table-fixed-end">
                                <button
                                    class="icon-button delete"
                                    type="button"
                                    @click="emit('remove-product', product.rowId)"
                                >
                                    <Icon name="lucide:trash-2" />
                                </button>
                            </div>
                        </div>

                    </ErpTableFrame>
                </section>
            </div>

            <template v-if="!isReadonly" #footer>
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
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InventoryDatePicker from "~/components/configuration/inventory/InventoryDatePicker.vue";
import InventoryInlineScanner from "~/components/configuration/inventory/InventoryInlineScanner.vue";
import InventoryWarehouseCascader from "~/components/configuration/inventory/InventoryWarehouseCascader.vue";
import RemoteSelect from "~/components/configuration/RemoteSelect.vue";
import { retrievePurchaseOrderInboundCandidates } from "~/composables/api/usePurchaseOrderApi";
import { retrieveProductionInboundSalesOrderCandidates } from "~/composables/api/useInventoryApi";
import type { InboundWarehouseOption } from "~/utils/inventory/inboundFrontendMapping";
import { logisticsCompanyOptions } from "~/utils/logisticsCompanyOptions";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";

type InboundDialogField =
    | "type"
    | "date"
    | "remark"
    | "courierCompany"
    | "trackingNo"
    | "purchaseOrderNo"
    | "processingOrderNo"
    | "productionOwner"
    | "salesOrderId"
    | "salesOrderNo"
    | "orderNo"
    | "returnReason";

interface InboundDialogForm {
    id: string;
    type: string;
    date: string;
    operator: string;
    remark: string;
    courierCompany: string;
    trackingNo: string;
    purchaseOrderNo: string;
    processingOrderNo: string;
    productionOwner: string;
    salesOrderId: string;
    salesOrderNo: string;
    orderNo: string;
    returnReason: string;
}

interface InboundDialogProduct {
    rowId: string;
    productId: string;
    productCode: string;
    productName: string;
    model: string;
    categoryId: string;
    categoryName: string;
    image: string;
    quantity: number;
    unitId: string;
    unitName: string;
    targetWarehouse: string;
    warehouseId: string;
    locationId: string;
}

interface ProductColumn {
    key: string;
    label: string;
    width: number;
}

interface PurchaseOrderPreviewProduct {
    productId: string;
    productName: string;
    image: string;
}

interface PurchaseOrderOption {
    id: string;
    label: string;
}

interface SalesOrderOption {
    id: string;
    label: string;
}

const props = defineProps<{
    title?: string;
    readonly?: boolean;
    form: InboundDialogForm;
    typeOptions: string[];
    products: InboundDialogProduct[];
    warehouseOptions: InboundWarehouseOption[];
    scanLoading?: boolean;
    scanClearSignal?: number;
    scanAutoFocus?: boolean;
}>();

const emit = defineEmits<{
    close: [];
    confirm: [];
    "update-field": [field: InboundDialogField, value: string];
    "update-quantity": [rowId: string, value: number];
    "update-warehouse": [rowId: string, warehouseId: string, locationId: string, label: string];
    "remove-product": [rowId: string];
    "clear-products": [];
    "open-product-picker": [];
    "scan-product": [code: string];
    "scan-location": [code: string];
    "select-purchase-order": [orderNo: string];
}>();

const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");

const productColumns = computed<ProductColumn[]>(() => [
    { key: "productCode", label: "产品编号", width: 150 },
    { key: "model", label: "型号", width: 200 },
    { key: "category", label: "分类", width: 130 },
    { key: "image", label: "产品图片", width: 140 },
    { key: "quantity", label: "数量", width: 140 },
    { key: "unit", label: "单位", width: 90 },
    { key: "targetWarehouse", label: "仓库 / 库位", width: isReadonly.value ? 380 : 260 },
    ...(isReadonly.value ? [] : [{ key: "actions", label: "操作", width: 120 }]),
]);

const productColumnTemplate = computed(() =>
    productColumns.value.map((column) => `${column.width}px`).join(" "),
);

const openImagePreview = (url: string, title: string) => {
    previewImages.value = [{ url, alt: title }];
    previewTitle.value = title;
    showImagePreview.value = true;
};

const inboundTypeSelectOptions = computed(() =>
    props.typeOptions.map((type) => ({ label: type, value: type })),
);
const courierCompanySelectOptions = logisticsCompanyOptions.map((company) => ({
    label: company,
    value: company,
}));

const isInitialInfoType = computed(() => !props.form.type || props.form.type === "期初建账");
const title = computed(() => props.title || "新建入库单");
const isReadonly = computed(() => Boolean(props.readonly));
const selectedPurchaseOrderId = ref("");
const lastSelectedPurchaseOrderNo = ref("");
const purchaseOrderPreviewProducts = ref<Record<string, PurchaseOrderPreviewProduct[]>>({});
const purchaseOrderNo = computed({
    get: () => props.form.purchaseOrderNo,
    set: (value: string) => {
        if (isReadonly.value) {
            return;
        }

        emit("update-field", "purchaseOrderNo", value);
    },
});
const salesOrderId = computed({
    get: () => props.form.salesOrderId,
    set: (value: string) => {
        if (!isReadonly.value) emit("update-field", "salesOrderId", value);
    },
});
const salesOrderLabel = computed({
    get: () => props.form.salesOrderNo,
    set: (value: string) => {
        if (!isReadonly.value) emit("update-field", "salesOrderNo", value);
    },
});
const dialogDate = computed({
    get: () => props.form.date,
    set: (value: string) => {
        if (isReadonly.value) {
            return;
        }

        emit("update-field", "date", value);
    },
});

const getInputValue = (event: Event) => {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
};

const updateField = (field: InboundDialogField, event: Event) => {
    if (isReadonly.value) {
        return;
    }

    emit("update-field", field, getInputValue(event));
};

const updateSelectField = (field: InboundDialogField, value: string | number) => {
    if (isReadonly.value) {
        return;
    }

    emit("update-field", field, String(value));
};

const fetchPurchaseOrderOptions = async (keyword: string): Promise<PurchaseOrderOption[]> => {
    try {
        const res = await retrievePurchaseOrderInboundCandidates({
            keyword,
            limit: 30,
        }, {
            skipLoading: true,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取采购单号失败");
            return [];
        }

        const candidates = (res.data?.list || [])
            .filter((order) => order.orderNo)
            .map((order) => ({
                orderNo: order.orderNo,
                products: (order.products || [])
                    .map((product) => ({
                        productId: product.productId,
                        productName: product.productName,
                        image: product.image || "",
                    }))
                    .filter((product) => product.productId && product.productName),
            }));

        purchaseOrderPreviewProducts.value = Object.fromEntries(
            candidates.map((candidate) => [candidate.orderNo, candidate.products]),
        );

        return candidates.map((candidate) => ({
            id: candidate.orderNo,
            label: candidate.orderNo,
        }));
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "获取采购单号失败");
        return [];
    }
};

const getPurchaseOrderPreviewProducts = (orderNo: string) =>
    purchaseOrderPreviewProducts.value[orderNo] || [];

const fetchSalesOrderOptions = async (keyword: string): Promise<SalesOrderOption[]> => {
    try {
        const res = await retrieveProductionInboundSalesOrderCandidates({ keyword, limit: 30 });
        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取销售订单失败");
            return [];
        }

        return (res.data?.list || []).map((order) => ({
            id: order.id,
            label: [order.orderNo, order.customerName, order.salespersonName, order.status]
                .filter(Boolean)
                .join(" | "),
        }));
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "获取销售订单失败");
        return [];
    }
};

const formatQuantity = (quantity: number) => {
    return String(Number((Number.isFinite(quantity) ? quantity : 0).toFixed(3)));
};

const updateQuantity = (rowId: string, event: Event) => {
    if (isReadonly.value) {
        return;
    }

    const input = event.target as HTMLInputElement;
    const nextQuantity = Number(input.value);
    const safeQuantity = Number.isFinite(nextQuantity) && nextQuantity >= 0
        ? Number(nextQuantity.toFixed(3))
        : 0;

    input.value = formatQuantity(safeQuantity);
    emit("update-quantity", rowId, safeQuantity);
};

watch(selectedPurchaseOrderId, (orderNo) => {
    if (!orderNo) {
        lastSelectedPurchaseOrderNo.value = "";
        return;
    }

    if (isReadonly.value || props.form.type !== "采购") {
        return;
    }

    if (lastSelectedPurchaseOrderNo.value === orderNo) {
        return;
    }

    lastSelectedPurchaseOrderNo.value = orderNo;
    emit("select-purchase-order", orderNo);
});

</script>

<style scoped>
.inbound-dialog {
    min-width: 0;
    max-width: 95vw;
    max-height: calc(100vh - 32px);
}

@supports (height: 100dvh) {
    .inbound-dialog {
        height: min(760px, calc(100dvh - 32px)) !important;
        max-height: calc(100dvh - 32px);
    }
}

.inbound-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
    overflow: hidden;
}

.dialog-body {
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

.info-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-areas:
        "id type dynamicTop"
        "dynamicLeft date remark";
    gap: var(--erp-spacing-20);
    align-items: center;
    margin-top: var(--erp-spacing-20);
}

.info-grid.initial-info-grid {
    grid-template-areas:
        "id type ."
        "date operator remark";
}

.info-grid.purchase-info-grid {
    grid-template-areas:
        "id type dynamicTop"
        "dynamicLeft purchaseOrder date"
        "remark . .";
}

.info-grid.production-info-grid {
    grid-template-areas:
        "id type dynamicTop"
        "dynamicLeft salesOrder date"
        "remark . .";
}

.id-row { grid-area: id; }
.type-row { grid-area: type; }
.date-row { grid-area: date; }
.operator-row { grid-area: operator; }
.dynamic-top-row { grid-area: dynamicTop; }
.dynamic-left-row { grid-area: dynamicLeft; }
.purchase-order-row { grid-area: purchaseOrder; }
.sales-order-row { grid-area: salesOrder; }
.remark-row { grid-area: remark; }

.purchase-order-row :deep(.remote-select-panel) {
    width: min(440px, calc(100vw - 48px));
}

.purchase-order-row :deep(.purchase-order-option) {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: var(--erp-spacing-12);
}

.purchase-order-row :deep(.purchase-order-option__number) {
    min-width: 142px;
    overflow: hidden;
    color: var(--erp-color-text-primary);
    line-height: 30px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.purchase-order-row :deep(.purchase-order-option__products) {
    min-width: 0;
    display: none;
    flex: 1;
    flex-wrap: wrap;
    gap: var(--erp-spacing-8);
    padding: var(--erp-spacing-4) 0;
}

.purchase-order-row :deep(.remote-select-option:hover .purchase-order-option__products) {
    display: flex;
}

.purchase-order-row :deep(.purchase-order-option__product) {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--erp-spacing-4);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content2-font-size);
    line-height: 22px;
}

.purchase-order-row :deep(.purchase-order-option__product img),
.purchase-order-row :deep(.purchase-order-option__image-placeholder) {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-control-default);
    object-fit: cover;
}

.purchase-order-row :deep(.purchase-order-option__image-placeholder) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--erp-color-text-tertiary);
    font-size: 10px;
    white-space: nowrap;
}

.inbound-form-row {
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

.inbound-form-row > span {
    min-height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    white-space: nowrap;
}

.inbound-form-row i {
    color: var(--erp-color-text-required);
    font-style: normal;
}

.inbound-form-row input {
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
    font: inherit;
}

.inbound-form-row input:focus {
    border-color: var(--erp-color-border-brand);
}

.inbound-form-row input[readonly] {
    border-color: var(--erp-color-border-muted);
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

.inbound-form-row :deep(.searchable-select) {
    --searchable-select-height: var(--erp-size-control-height-sm);
    --searchable-select-border: var(--erp-color-border-default);
    --searchable-select-radius: var(--erp-radius-control-default);
    --searchable-select-font-size: var(--erp-typography-content1-font-size);
    --searchable-select-active-border: var(--erp-color-border-brand);
    --searchable-select-text: var(--erp-color-text-primary);

    width: 100%;
}

.inbound-form-row :deep(.searchable-select-input) {
    padding: 0 30px 0 var(--erp-spacing-8);
    font-weight: var(--erp-typography-content1-font-weight);
}

.inbound-form-row :deep(.searchable-select.courier-company-select) {
    width: 100%;
    max-width: none;
}

.inbound-form-row :deep(.inventory-date-picker) {
    width: 100%;
    max-width: none;
    flex-basis: auto;
}

.inbound-form-row :deep(.date-trigger) {
    height: var(--erp-size-control-height-sm);
    border-color: var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
}

.product-section {
    min-height: 0;
    display: grid;
    grid-template-rows: 32px minmax(0, 1fr);
    gap: var(--erp-spacing-12);
}

.product-section.readonly {
    grid-template-rows: minmax(0, 1fr);
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
    gap: var(--erp-spacing-8);
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

.product-table {
    min-height: 0;
    height: 100%;
}

.product-table .product-row {
    width: max-content;
    min-width: 100%;
}

.product-table .product-data-row {
    min-height: 80px;
    height: auto;
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

.inbound-dialog .quantity-input {
    width: 68px;
    text-align: center;
}

.warehouse-cell {
    overflow: visible;
    white-space: normal;
    min-width: 0;
}

.warehouse-cell :deep(.warehouse-readonly) {
    width: 100%;
    overflow: visible;
    text-align: center;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
}

.warehouse-cell :deep(.warehouse-trigger) {
    min-height: var(--erp-size-control-height-sm);
    height: auto;
}

.warehouse-cell :deep(.warehouse-trigger span) {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
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

.icon-button.delete {
    color: var(--erp-color-icon-error);
}

@media (max-width: 1280px) {
    .info-grid {
        grid-template-columns: repeat(2, minmax(300px, 1fr));
    }

    .info-grid,
    .info-grid.initial-info-grid,
    .info-grid.purchase-info-grid,
    .info-grid.production-info-grid {
        grid-template-areas: none;
    }

    .id-row,
    .type-row,
    .date-row,
    .operator-row,
    .dynamic-top-row,
    .dynamic-left-row,
    .purchase-order-row,
    .sales-order-row,
    .remark-row {
        grid-area: auto;
    }
}

@media (max-width: 860px) {
    .info-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
