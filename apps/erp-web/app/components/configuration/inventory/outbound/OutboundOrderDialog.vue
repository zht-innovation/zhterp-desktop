<template>
    <div class="erp-dialog-mask inventory-responsive-dialog-mask" @click.self="emit('close')">
        <ErpDialogFrame
            class="outbound-order-dialog"
            :class="{ readonly: fieldsReadonly }"
            :title="title"
			width="min(1240px, calc(100vw - 32px))"
			height="min(760px, calc(100vh - 32px))"
            :show-footer="!viewMode"
            @close="emit('close')"
            @submit.prevent="handleSubmit"
        >
            <div class="outbound-dialog-body">
                    <section class="form-section basic-section" aria-label="基本信息">
                        <h3>基本信息</h3>
                        <div class="basic-form-grid">
                            <label class="outbound-form-row">
                                <span class="field-label">出库编号</span>
                                <div class="field-control">
                                    <input
                                        v-model="form.outboundNo"
                                        type="text"
                                        disabled
                                        aria-label="出库编号"
                                    >
                                </div>
                            </label>

                            <label class="outbound-form-row">
                                <span class="field-label">出库类型<i>*</i></span>
                                <div class="field-control">
                                    <SearchableSelect
                                        v-model="form.outboundType"
                                        :options="outboundTypeSelectOptions"
                                        :disabled="fieldsReadonly"
                                        placeholder="请选择"
                                        aria-label="出库类型"
                                        @change="handleOutboundTypeChange"
                                    />
                                    <p v-if="formErrors.outboundType" class="field-error">
                                        {{ formErrors.outboundType }}
                                    </p>
                                </div>
                            </label>

                            <template v-if="isOrderOutbound">
                                <label class="outbound-form-row">
                                    <span class="field-label">关联订单号</span>
                                    <div class="field-control">
                                        <RemoteSelect
                                            v-model:id="selectedSalesOrderId"
                                            v-model:label="form.contractOrderNo"
                                            :fetch-options="fetchSalesOrderOptions"
                                            :disabled="fieldsReadonly"
                                            placeholder="请选择销售订单"
                                            aria-label="关联订单号"
                                        />
                                    </div>
                                </label>

                                <label class="outbound-form-row">
                                    <span class="field-label">快递公司</span>
                                    <div class="field-control">
                                        <SearchableSelect
                                            v-model="form.expressCompany"
                                            :options="expressCompanySelectOptions"
                                            :disabled="fieldsReadonly"
                                            clearable
                                            placeholder="请选择"
                                            aria-label="快递公司"
                                            @change="clearFieldError('expressCompany')"
                                        />
                                        <p v-if="formErrors.expressCompany" class="field-error">
                                            {{ formErrors.expressCompany }}
                                        </p>
                                    </div>
                                </label>

                                <label class="outbound-form-row">
                                    <span class="field-label">运单号</span>
                                    <div class="field-control">
                                        <input
                                            v-model="form.waybillNo"
                                            type="text"
                                            :readonly="fieldsReadonly"
                                            placeholder="快递单号"
                                            aria-label="运单号"
                                        >
                                    </div>
                                </label>

                                <label class="outbound-form-row outbound-date-row">
                                    <span class="field-label">出库日期<i>*</i></span>
                                    <div class="field-control">
                                        <InventoryDatePicker
                                            v-model="form.outboundDate"
                                            placeholder="请选择"
                                            :disabled="fieldsReadonly"
                                            aria-label-text="选择出库日期"
                                            initial-month="2026-05-01"
                                            @change="clearFieldError('outboundDate')"
                                        />
                                        <p v-if="formErrors.outboundDate" class="field-error">
                                            {{ formErrors.outboundDate }}
                                        </p>
                                    </div>
                                </label>

                                <label class="outbound-form-row">
                                    <span class="field-label">操作人</span>
                                    <div class="field-control">
                                        <input
                                            v-model="form.operator"
                                            type="text"
                                            disabled
                                            aria-label="操作人"
                                        >
                                    </div>
                                </label>

                                <label class="outbound-form-row">
                                    <span class="field-label">备注</span>
                                    <div class="field-control">
                                        <input
                                            v-model="form.remark"
                                            type="text"
                                            :readonly="viewMode"
                                            aria-label="备注"
                                        >
                                    </div>
                                </label>

                                <div class="outbound-form-row image-upload-row">
                                    <span class="field-label">订单照片</span>
                                    <div class="field-control">
                                        <input
                                            ref="imageInput"
                                            class="image-upload-input"
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            :disabled="fieldsReadonly || isUploadingImages"
                                            @change="handleImageFileChange"
                                        >
                                        <div class="image-upload-panel">
                                            <button
                                                class="image-upload-button"
                                                type="button"
                                                :disabled="fieldsReadonly || isUploadingImages"
                                                @click="triggerImageUpload"
                                            >
                                                <Icon name="lucide:upload" class="button-icon" />
                                                <span>{{ isUploadingImages ? "上传中..." : "上传照片" }}</span>
                                            </button>
                                            <div
                                                v-if="form.images.length"
                                                class="uploaded-image-list"
                                            >
                                                <div
                                                    v-for="(image, index) in form.images"
                                                    :key="`${image.url}-${index}`"
                                                    class="uploaded-image-item"
                                                >
                                                    <img
                                                        :src="image.url"
                                                        :alt="image.name"
                                                        class="uploaded-image-thumbnail clickable-image"
                                                        @click="openImagePreview(image.url, image.name || '订单照片')"
                                                    >
                                                    <button
                                                        v-if="!fieldsReadonly"
                                                        class="uploaded-image-remove"
                                                        type="button"
                                                        :aria-label="`删除${image.name || '订单照片'}`"
                                                        @click="removeImage(index)"
                                                    >
                                                        <Icon name="lucide:x" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <span class="form-grid-spacer" aria-hidden="true" />
                            </template>

                            <template v-else-if="isLoanOutbound">
                                <label class="outbound-form-row">
                                    <span class="field-label">借出人</span>
                                    <div class="field-control">
                                        <input
                                            v-model="form.borrower"
                                            type="text"
                                            :readonly="fieldsReadonly"
                                            aria-label="借出人"
                                        >
                                    </div>
                                </label>

                                <label class="outbound-form-row">
                                    <span class="field-label">借货方</span>
                                    <div class="field-control">
                                        <input
                                            v-model="form.borrowingParty"
                                            type="text"
                                            :readonly="fieldsReadonly"
                                            aria-label="借货方"
                                        >
                                    </div>
                                </label>

                                <label class="outbound-form-row">
                                    <span class="field-label">押金</span>
                                    <div class="field-control">
                                        <input
                                            v-model="form.deposit"
                                            type="text"
                                            :readonly="fieldsReadonly"
                                            aria-label="押金"
                                        >
                                    </div>
                                </label>

                                <label class="outbound-form-row outbound-date-row">
                                    <span class="field-label">归还日期<i>*</i></span>
                                    <div class="field-control">
                                        <InventoryDatePicker
                                            v-model="form.returnDate"
                                            placeholder="请选择"
                                            :disabled="fieldsReadonly"
                                            aria-label-text="选择归还日期"
                                            initial-month="2026-05-01"
                                            @change="clearFieldError('returnDate')"
                                        />
                                        <p v-if="formErrors.returnDate" class="field-error">
                                            {{ formErrors.returnDate }}
                                        </p>
                                    </div>
                                </label>

                                <label class="outbound-form-row outbound-date-row">
                                    <span class="field-label">出库日期<i>*</i></span>
                                    <div class="field-control">
                                        <InventoryDatePicker
                                            v-model="form.outboundDate"
                                            placeholder="请选择"
                                            :disabled="fieldsReadonly"
                                            aria-label-text="选择出库日期"
                                            initial-month="2026-05-01"
                                            @change="clearFieldError('outboundDate')"
                                        />
                                        <p v-if="formErrors.outboundDate" class="field-error">
                                            {{ formErrors.outboundDate }}
                                        </p>
                                    </div>
                                </label>

                                <label class="outbound-form-row">
                                    <span class="field-label">操作人</span>
                                    <div class="field-control">
                                        <input
                                            v-model="form.operator"
                                            type="text"
                                            disabled
                                            aria-label="操作人"
                                        >
                                    </div>
                                </label>

                                <label class="outbound-form-row">
                                    <span class="field-label">备注</span>
                                    <div class="field-control">
                                        <input
                                            v-model="form.remark"
                                            type="text"
                                            :readonly="viewMode"
                                            aria-label="备注"
                                        >
                                    </div>
                                </label>
                            </template>

                            <template v-else-if="isResearchOutbound">
                                <label class="outbound-form-row">
                                    <span class="field-label">项目</span>
                                    <div class="field-control">
                                        <input
                                            v-model="form.project"
                                            type="text"
                                            :readonly="fieldsReadonly"
                                            aria-label="项目"
                                        >
                                    </div>
                                </label>

                                <label class="outbound-form-row outbound-date-row">
                                    <span class="field-label">出库日期<i>*</i></span>
                                    <div class="field-control">
                                        <InventoryDatePicker
                                            v-model="form.outboundDate"
                                            placeholder="请选择"
                                            :disabled="fieldsReadonly"
                                            aria-label-text="选择出库日期"
                                            initial-month="2026-05-01"
                                            @change="clearFieldError('outboundDate')"
                                        />
                                        <p v-if="formErrors.outboundDate" class="field-error">
                                            {{ formErrors.outboundDate }}
                                        </p>
                                    </div>
                                </label>

                                <label class="outbound-form-row">
                                    <span class="field-label">操作人</span>
                                    <div class="field-control">
                                        <input
                                            v-model="form.operator"
                                            type="text"
                                            disabled
                                            aria-label="操作人"
                                        >
                                    </div>
                                </label>

                                <label class="outbound-form-row">
                                    <span class="field-label">备注</span>
                                    <div class="field-control">
                                        <input
                                            v-model="form.remark"
                                            type="text"
                                            :readonly="viewMode"
                                            aria-label="备注"
                                        >
                                    </div>
                                </label>
                            </template>

                            <template v-else>
                                <span class="form-grid-spacer" aria-hidden="true" />

                                <label class="outbound-form-row outbound-date-row">
                                    <span class="field-label">出库日期<i>*</i></span>
                                    <div class="field-control">
                                        <InventoryDatePicker
                                            v-model="form.outboundDate"
                                            placeholder="请选择"
                                            :disabled="fieldsReadonly"
                                            aria-label-text="选择出库日期"
                                            initial-month="2026-05-01"
                                            @change="clearFieldError('outboundDate')"
                                        />
                                        <p v-if="formErrors.outboundDate" class="field-error">
                                            {{ formErrors.outboundDate }}
                                        </p>
                                    </div>
                                </label>

                                <label class="outbound-form-row">
                                    <span class="field-label">操作人</span>
                                    <div class="field-control">
                                        <input
                                            v-model="form.operator"
                                            type="text"
                                            disabled
                                            aria-label="操作人"
                                        >
                                    </div>
                                </label>

                                <label class="outbound-form-row">
                                    <span class="field-label">备注</span>
                                    <div class="field-control">
                                        <input
                                            v-model="form.remark"
                                            type="text"
                                            :readonly="viewMode"
                                            aria-label="备注"
                                        >
                                    </div>
                                </label>
                            </template>
                        </div>
                    </section>

                    <section class="form-section detail-section">
                        <div v-if="!fieldsReadonly" class="detail-toolbar">
                            <div class="detail-toolbar-left">
                                <button
                                    class="detail-primary-button"
                                    type="button"
                                    @click="emit('select-bom')"
                                >
                                    <Icon name="lucide:search" class="button-icon" />
                                    <span>搜索BOM</span>
                                </button>
                                <button
                                    class="detail-text-button"
                                    type="button"
                                    @click="emit('select-product')"
                                >
                                    <Icon name="lucide:package-search" class="button-icon" />
                                    <span>直接选产品</span>
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
                                class="detail-danger-button"
                                type="button"
                                @click="emit('clear-details')"
                            >
                                <Icon name="lucide:trash-2" class="button-icon" />
                                <span>清空</span>
                            </button>
                        </div>

                        <ErpTableFrame
                            class="detail-table"
                            :columns="detailColumnTemplate"
                            :empty="details.length === 0"
                            empty-text="暂未选择产品"
                            scroll-x
                            embedded
                        >
                            <template #header>
                                <div class="table-row table-head detail-row">
                                    <div
                                        v-for="column in effectiveDetailColumns"
                                        :key="column.key"
                                        class="table-cell detail-cell"
                                        :class="{ 'action-cell erp-table-fixed-end': column.key === 'actions' }"
                                    >
                                        {{ column.label }}
                                    </div>
                                </div>
                            </template>

                            <div
                                v-for="item in details"
                                :key="item.rowId"
                                class="table-row data-row detail-row detail-data-row"
                            >
                                <div class="table-cell detail-cell">{{ item.productNo }}</div>
                                <div class="table-cell detail-cell">{{ item.model }}</div>
                                <div class="table-cell detail-cell">{{ item.category }}</div>
                                <div class="table-cell detail-cell image-cell">
                                    <img
                                        v-if="item.image"
                                        :src="item.image"
                                        :alt="item.model"
                                        class="clickable-image"
                                        @click.stop="openImagePreview(item.image, item.model || item.productNo || '产品图片')"
                                    >
                                    <span v-else>--</span>
                                </div>
                                <div class="table-cell detail-cell quantity-cell">
                                    <input
                                        :value="item.quantity"
                                        class="quantity-input"
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        :readonly="fieldsReadonly"
                                        aria-label="出库数量"
                                        @input="handleQuantityInput(item.rowId, $event)"
                                        @blur="emit('format-quantity', item.rowId)"
                                    >
                                </div>
                                <div class="table-cell detail-cell">{{ item.unit }}</div>
                                <div class="table-cell detail-cell warehouse-cell">
                                    <InventoryWarehouseCascader
                                        :warehouse-options="warehouseOptions"
                                        :warehouse-id="item.warehouseId"
                                        :location-id="item.locationId"
                                        :label="item.targetWarehouse"
                                        :disabled="fieldsReadonly"
                                        aria-label="选择目标仓库"
                                        @select="(warehouseId, locationId, label) =>
                                            emit('update-warehouse', item.rowId, warehouseId, locationId, label)"
                                    />
                                </div>
                                <div v-if="!fieldsReadonly" class="table-cell detail-cell action-cell erp-table-fixed-end">
                                    <button
                                        class="icon-button delete"
                                        type="button"
                                        :aria-label="`删除${item.productNo}`"
                                        @click="emit('remove-detail', item.rowId)"
                                    >
                                        <Icon name="lucide:trash-2" />
                                    </button>
                                </div>
                            </div>

                        </ErpTableFrame>
                    </section>
            </div>

            <template v-if="!viewMode" #footer>
                    <button class="dialog-button cancel" type="button" @click="emit('close')">
                        取消
                    </button>
                    <button class="dialog-button confirm" type="submit" :disabled="isUploadingImages">
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
import InventoryDatePicker from "~/components/configuration/inventory/InventoryDatePicker.vue";
import InventoryInlineScanner from "~/components/configuration/inventory/InventoryInlineScanner.vue";
import InventoryWarehouseCascader from "~/components/configuration/inventory/InventoryWarehouseCascader.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import RemoteSelect from "~/components/configuration/RemoteSelect.vue";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { InventoryWaybillAttachment } from "~~/shared/types/inventory";
import { uploadImage } from "~/composables/api/useIndicesApi";
import { retrieveSalesOrderList } from "~/composables/api/useCustomerApi";
import type { InboundWarehouseOption } from "~/utils/inventory/inboundFrontendMapping";
import { logisticsCompanyOptions } from "~/utils/logisticsCompanyOptions";

type ValidationField = "outboundType" | "outboundDate" | "expressCompany" | "returnDate";

interface ValidationRule {
    required: boolean;
    message: string;
}

interface OutboundOrderForm {
    outboundNo: string;
    outboundType: string;
    contractOrderNo: string;
    expressCompany: string;
    waybillNo: string;
    borrower: string;
    borrowingParty: string;
    deposit: string;
    returnDate: string;
    project: string;
    outboundDate: string;
    operator: string;
    remark: string;
    images: InventoryWaybillAttachment[];
}

interface OutboundDetailItem {
    rowId: string;
    productNo: string;
    model: string;
    category: string;
    image: string;
    quantity: string;
    unit: string;
    warehouseId: string;
    locationId: string;
    targetWarehouse: string;
}

interface DetailColumn {
    key: string;
    label: string;
    width: number;
}

const props = withDefaults(defineProps<{
    title?: string;
    form: OutboundOrderForm;
    details: OutboundDetailItem[];
    outboundTypeOptions: string[];
    warehouseOptions?: InboundWarehouseOption[];
    viewMode?: boolean;
    remarkOnly?: boolean;
    scanLoading?: boolean;
    scanClearSignal?: number;
    scanAutoFocus?: boolean;
}>(), {
    title: "新建出库单",
    warehouseOptions: () => [],
    viewMode: false,
    remarkOnly: false,
    scanLoading: false,
    scanClearSignal: 0,
    scanAutoFocus: true,
});

const emit = defineEmits<{
    close: [];
    confirm: [];
    "type-change": [type: string];
    "select-bom": [];
    "select-product": [];
    "scan-product": [code: string];
    "scan-location": [code: string];
    "clear-details": [];
    "remove-detail": [rowId: string];
    "update-quantity": [rowId: string, value: string];
    "update-warehouse": [rowId: string, warehouseId: string, locationId: string, label: string];
    "format-quantity": [rowId: string];
}>();

const fieldsReadonly = computed(() => props.viewMode || props.remarkOnly);

const validationRules = {
    outboundType: [{ required: true, message: "请选择出库类型" }],
    outboundDate: [{ required: true, message: "请选择出库日期" }],
    expressCompany: [],
    returnDate: [{ required: true, message: "请选择归还日期" }],
} satisfies Record<ValidationField, ValidationRule[]>;

const formErrors = reactive<Record<ValidationField, string>>({
    outboundType: "",
    outboundDate: "",
    expressCompany: "",
    returnDate: "",
});
const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");
const imageInput = ref<HTMLInputElement | null>(null);
const isUploadingImages = ref(false);

const outboundTypeSelectOptions = computed(() =>
    props.outboundTypeOptions.map((type) => ({ label: type, value: type })),
);
const expressCompanySelectOptions = logisticsCompanyOptions.map((company) => ({
    label: company,
    value: company,
}));

const detailColumns: DetailColumn[] = [
    { key: "productNo", label: "产品编号", width: 150 },
    { key: "model", label: "型号", width: 200 },
    { key: "category", label: "分类", width: 130 },
    { key: "image", label: "产品图片", width: 140 },
    { key: "quantity", label: "数量", width: 140 },
    { key: "unit", label: "单位", width: 90 },
    { key: "targetWarehouse", label: "仓库 / 库位", width: 260 },
    { key: "actions", label: "操作", width: 120 },
];

const effectiveDetailColumns = computed(() =>
    fieldsReadonly.value
        ? detailColumns.filter((column) => column.key !== "actions")
        : detailColumns,
);
const detailColumnTemplate = computed(() =>
    effectiveDetailColumns.value.map((column) =>
        fieldsReadonly.value && column.key === "targetWarehouse"
            ? `${column.width + 120}px`
            : `${column.width}px`,
    ).join(" "),
);

const openImagePreview = (url: string, title: string) => {
    previewImages.value = [{ url, alt: title }];
    previewTitle.value = title;
    showImagePreview.value = true;
};

const isOrderOutbound = computed(() => props.form.outboundType === "订单");
const selectedSalesOrderId = ref("");

const fetchSalesOrderOptions = async (keyword: string) => {
    try {
        const response: any = await retrieveSalesOrderList()({
            keyword: keyword.trim() || undefined,
            page: 1,
            limit: 30,
        });
        const list = Array.isArray(response?.data?.list) ? response.data.list : [];
        const options: Array<{ id: string; label: string }> = [];

        for (const order of list) {
            const id = String(order?._id || order?.id || order?.orderNo || "");
            const label = String(order?.orderNo || "").trim();
            if (id && label) {
                options.push({ id, label });
            }
        }

        return options;
    } catch {
        return [];
    }
};
const isLoanOutbound = computed(() => props.form.outboundType === "借给客户");
const isResearchOutbound = computed(() => props.form.outboundType === "研发");
const activeValidationFields = computed<ValidationField[]>(() => {
    const fields: ValidationField[] = ["outboundType", "outboundDate"];

    if (isLoanOutbound.value) {
        fields.push("returnDate");
    }

    return fields;
});

const validateField = (field: ValidationField) => {
    const value = props.form[field]?.trim();
    const failedRule = validationRules[field].find((rule) => rule.required && !value);

    formErrors[field] = failedRule?.message ?? "";
    return !failedRule;
};

const clearFieldError = (field: ValidationField) => {
    if (props.form[field]?.trim()) {
        formErrors[field] = "";
    }
};

const validateForm = () => {
    resetInactiveFieldErrors();

    return activeValidationFields.value
        .map(validateField)
        .every(Boolean);
};

const handleSubmit = () => {
    if (isUploadingImages.value) {
        return;
    }

    if (!props.viewMode && (props.remarkOnly || validateForm())) {
        emit("confirm");
    }
};

const triggerImageUpload = () => {
    if (!fieldsReadonly.value && !isUploadingImages.value) {
        imageInput.value?.click();
    }
};

const readImageFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (!imageFiles.length) {
        ElMessage.warning("请选择图片文件");
        return;
    }

    isUploadingImages.value = true;
    ElMessage.info("正在上传订单照片...");

    for (const file of imageFiles) {
        const formData = new FormData();
        formData.append("image", file);

        try {
            const res: any = await uploadImage(formData);

            if (res.code === 200 && res.data?.path) {
                props.form.images.push({
                    name: file.name,
                    url: res.data.path,
                    size: file.size,
                    type: file.type,
                });
            } else {
                ElMessage.error(`照片 ${file.name} 上传失败`);
            }
        } catch {
            ElMessage.error(`照片 ${file.name} 上传失败`);
        }
    }

    isUploadingImages.value = false;
    ElMessage.success("订单照片上传完成");
};

const handleImageFileChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    void readImageFiles(Array.from(input.files || []));
    input.value = "";
};

const removeImage = (index: number) => {
    props.form.images.splice(index, 1);
};

const handleQuantityInput = (rowId: string, event: Event) => {
    emit("update-quantity", rowId, (event.target as HTMLInputElement).value);
};

const resetInactiveFieldErrors = () => {
    (Object.keys(validationRules) as ValidationField[]).forEach((field) => {
        if (!activeValidationFields.value.includes(field)) {
            formErrors[field] = "";
        }
    });
};

const handleOutboundTypeChange = () => {
    selectedSalesOrderId.value = "";
    clearFieldError("outboundType");
    resetInactiveFieldErrors();
    emit("type-change", props.form.outboundType);
};

watch(
    () => [
        props.form.outboundType,
        props.form.outboundDate,
        props.form.expressCompany,
        props.form.returnDate,
    ],
    () => {
        (Object.keys(formErrors) as ValidationField[]).forEach(clearFieldError);
        resetInactiveFieldErrors();
    },
);
</script>

<style scoped>
.outbound-order-dialog {
    --inventory-date-picker-panel-width: 288px;

    min-width: 0;
    max-width: 95vw;
    max-height: calc(100vh - 32px);
}

@supports (height: 100dvh) {
    .outbound-order-dialog {
        height: min(760px, calc(100dvh - 32px)) !important;
        max-height: calc(100dvh - 32px);
    }
}

.outbound-order-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
    overflow: hidden;
}

.detail-toolbar,
.detail-toolbar-left {
    display: flex;
    align-items: center;
}

.outbound-dialog-body {
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

.basic-form-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--erp-spacing-20);
    align-items: start;
    margin-top: var(--erp-spacing-20);
}

.outbound-form-row {
    min-width: 0;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: start;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.field-label {
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    white-space: nowrap;
}

.field-label i {
    color: var(--erp-color-text-required);
    font-style: normal;
}

.field-control {
    min-width: 0;
}

.image-upload-row {
    grid-column: 1 / -1;
}

.image-upload-input {
    display: none;
}

.image-upload-panel {
    min-height: var(--erp-size-control-height-sm);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--erp-spacing-8);
}

.image-upload-button {
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    padding: 0 var(--erp-spacing-12);
    border: 1px dashed var(--erp-color-border-brand);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-brand);
    background: var(--erp-color-fill-nav-selected);
    cursor: pointer;
}

.image-upload-button:disabled {
    color: var(--erp-color-text-disabled);
    border-color: var(--erp-color-border-muted);
    background: var(--erp-color-fill-disabled);
    cursor: not-allowed;
}

.uploaded-image-list {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--erp-spacing-8);
}

.uploaded-image-item {
    position: relative;
    width: 56px;
    height: 40px;
}

.uploaded-image-thumbnail {
    width: 56px;
    height: 40px;
    display: block;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    object-fit: contain;
    background: var(--erp-color-fill-control-secondary);
}

.uploaded-image-remove {
    position: absolute;
    top: -7px;
    right: -7px;
    width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: var(--erp-color-text-white);
    background: var(--erp-color-function-red-500);
    cursor: pointer;
}

.uploaded-image-remove :deep(svg) {
    width: 12px;
    height: 12px;
}

.outbound-form-row input,
.outbound-form-row select {
    width: 100%;
    min-width: 0;
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    outline: 0;
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
    box-sizing: border-box;
}

.outbound-form-row input:disabled {
    border-color: var(--erp-color-border-muted);
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
    cursor: not-allowed;
}

.outbound-form-row select {
    padding-right: 36px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23505050' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    background-size: 16px 16px;
    appearance: none;
}

.outbound-form-row select.placeholder {
    color: var(--erp-color-text-placeholder);
}

.outbound-form-row :deep(.searchable-select) {
    --searchable-select-height: var(--erp-size-control-height-sm);
    --searchable-select-border: var(--erp-color-border-default);
    --searchable-select-radius: var(--erp-radius-control-default);
    --searchable-select-font-size: var(--erp-typography-content1-font-size);
    --searchable-select-active-border: var(--erp-color-border-brand);

    width: 100%;
}

.outbound-form-row :deep(.searchable-select-input) {
    padding: 0 34px 0 12px;
}

.outbound-date-row :deep(.inventory-date-picker) {
    width: 100%;
    max-width: none;
    flex: 1 1 auto;
}

.outbound-date-row :deep(.date-trigger) {
    height: var(--erp-size-control-height-sm);
}

.outbound-date-row :deep(.date-panel) {
    z-index: 60;
}

.field-error {
    min-height: 18px;
    margin: var(--erp-spacing-4) 0 0;
    color: var(--erp-color-text-required);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.detail-section {
    min-height: 0;
    display: grid;
    grid-template-rows: 32px minmax(0, 1fr);
    gap: var(--erp-spacing-12);
}

.outbound-order-dialog.readonly .detail-section {
    grid-template-rows: minmax(0, 1fr);
}

.detail-toolbar {
    justify-content: space-between;
    gap: var(--erp-spacing-12);
}

.detail-toolbar-left {
    gap: var(--erp-spacing-8);
}

.detail-primary-button,
.detail-text-button,
.detail-danger-button {
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

.detail-primary-button {
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.detail-primary-button:not(:disabled):active {
    background: var(--erp-color-action-primary-pressed);
}

.detail-text-button {
    color: var(--erp-color-text-brand);
}

.detail-danger-button {
    color: var(--erp-color-text-status-error);
}

.button-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.detail-table {
    min-height: 0;
    height: 100%;
}

.detail-row {
    width: max-content;
    min-width: 100%;
    display: grid;
    align-items: center;
}

.detail-data-row {
    min-height: 80px;
    height: auto;
}

.detail-cell {
    overflow: hidden;
    text-overflow: ellipsis;
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

.image-cell img {
    width: 90px;
    height: 58px;
    object-fit: contain;
}

.clickable-image {
    cursor: pointer;
}

.quantity-input {
    width: 68px;
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    text-align: center;
    outline: 0;
    font-size: var(--erp-typography-content1-font-size);
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
    background: transparent;
    cursor: pointer;
}

.icon-button.delete {
    color: var(--erp-color-icon-error);
}

.icon-button :deep(svg) {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

@media (max-width: 1280px) {
    .basic-form-grid {
        grid-template-columns: repeat(2, minmax(300px, 1fr));
    }

    .form-grid-spacer {
        display: none;
    }
}

@media (max-width: 860px) {
    .basic-form-grid {
        grid-template-columns: 1fr;
        gap: var(--erp-spacing-20);
        padding: 0;
    }

    .outbound-form-row {
        grid-template-columns: 92px minmax(0, 1fr);
    }

    .detail-toolbar {
        align-items: flex-start;
    }

    .detail-toolbar-left {
        flex-wrap: wrap;
        gap: var(--erp-spacing-12) 18px;
    }
}
</style>
