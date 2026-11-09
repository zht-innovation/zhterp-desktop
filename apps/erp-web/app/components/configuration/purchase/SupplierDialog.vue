<template>
    <div
        v-if="modelValue"
        class="erp-app erp-dialog-mask"
        :style="{ zIndex: maskZIndex }"
        @click.self="handleCancel"
    >
        <ErpDialogFrame
            class="supplier-dialog"
            :title="dialogTitle"
            width="600px"
            height="640px"
            @close="handleCancel"
            @submit.prevent="handleSubmit"
        >
            <div class="supplier-form-grid">
                <label class="supplier-form-row">
                    <span>供应商编号</span>
                    <input
                        v-model="form.code"
                        class="dialog-input readonly"
                        type="text"
                        placeholder="保存后自动生成"
                        readonly
                    >
                </label>

                <label class="supplier-form-row">
                    <span>供应商名称<i>*</i></span>
                    <input v-model="form.name" class="dialog-input" type="text" required>
                </label>

                <label class="supplier-form-row">
                    <span>联系人<i>*</i></span>
                    <input v-model="form.contact" class="dialog-input" type="text" required>
                </label>

                <label class="supplier-form-row">
                    <span>联系电话<i>*</i></span>
                    <input v-model="form.phone" class="dialog-input" type="tel" required>
                </label>

                <label class="supplier-form-row">
                    <span>地址<i>*</i></span>
                    <input v-model="form.address" class="dialog-input" type="text" required>
                </label>

                <label class="supplier-form-row">
                    <span>详细地址</span>
                    <input v-model="form.detailedAddress" class="dialog-input" type="text">
                </label>

                <label class="supplier-form-row">
                    <span>备注</span>
                    <input v-model="form.remark" class="dialog-input" type="text">
                </label>

                <div class="supplier-form-row attachment-row">
                    <span>附件</span>
                    <div class="attachment-field">
                        <FileUploader v-model="form.attachments" :max-size="10" />
                        <p>单个文件不超过 10MB</p>
                    </div>
                </div>
            </div>

            <template #footer>
                <button class="dialog-button cancel" type="button" @click="handleCancel">
                    取消
                </button>
                <button class="dialog-button confirm" type="submit">
                    确认
                </button>
            </template>
        </ErpDialogFrame>
    </div>
</template>

<script setup lang="ts">
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import FileUploader from "~/components/configuration/sales/FileUploader.vue";
import type { PurchaseSupplierAttachment } from "~~/shared/types/purchase";

type SupplierDialogAttachment = File | PurchaseSupplierAttachment;

interface SupplierDialogForm {
    id: string;
    code: string;
    name: string;
    contact: string;
    phone: string;
    address: string;
    detailedAddress: string;
    remark: string;
    enabled: boolean;
    attachments: SupplierDialogAttachment[];
    operator: string;
    updatedAt: string;
}

type SupplierDialogMode = "create" | "edit";

const props = withDefaults(defineProps<{
    modelValue: boolean;
    mode?: SupplierDialogMode;
    supplier?: SupplierDialogForm | null;
    maskZIndex?: number;
}>(), {
    mode: "create",
    supplier: null,
    maskZIndex: 30,
});

const emit = defineEmits<{
    "update:modelValue": [value: boolean];
    submit: [value: SupplierDialogForm];
}>();

const createEmptyForm = (): SupplierDialogForm => ({
    id: "",
    code: "",
    name: "",
    contact: "",
    phone: "",
    address: "",
    detailedAddress: "",
    remark: "",
    enabled: true,
    attachments: [],
    operator: "",
    updatedAt: "",
});

const form = reactive<SupplierDialogForm>(createEmptyForm());
const dialogTitle = computed(() => props.mode === "edit" ? "编辑供应商" : "新建供应商");

const syncForm = () => {
    const supplier = props.supplier || createEmptyForm();

    Object.assign(form, {
        ...createEmptyForm(),
        ...supplier,
        attachments: Array.isArray(supplier.attachments) ? [...supplier.attachments] : [],
    });
};

const handleCancel = () => {
    emit("update:modelValue", false);
};

const handleSubmit = () => {
    if (!form.name.trim()) {
        ElMessage.warning("请输入供应商名称");
        return;
    }

    if (!form.contact.trim()) {
        ElMessage.warning("请输入联系人");
        return;
    }

    if (!form.phone.trim()) {
        ElMessage.warning("请输入联系电话");
        return;
    }

    if (!form.address.trim()) {
        ElMessage.warning("请选择地址");
        return;
    }

    emit("submit", {
        ...form,
        name: form.name.trim(),
        contact: form.contact.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        detailedAddress: form.detailedAddress.trim(),
        remark: form.remark.trim(),
        attachments: [...form.attachments],
    });
};

watch(() => props.modelValue, (visible) => {
    if (visible) {
        syncForm();
    }
}, { immediate: true });

watch(() => props.supplier, () => {
    if (props.modelValue) {
        syncForm();
    }
});
</script>

<style scoped>
.supplier-dialog :deep(.erp-dialog-frame__body) {
    align-content: start;
}

.supplier-form-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--erp-spacing-12);
}

.supplier-form-row {
    width: 384px;
    min-width: 0;
    min-height: var(--erp-size-control-height-sm);
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: var(--erp-spacing-12);
    margin: 0 auto;
}

.supplier-form-row > span {
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    text-align: right;
    white-space: nowrap;
}

.supplier-form-row i {
    color: var(--erp-color-text-required);
    font-style: normal;
}

.attachment-row {
    align-items: start;
}

.attachment-field {
    min-width: 0;
}

.attachment-field :deep(.upload-area) {
    min-height: 108px;
    padding: var(--erp-spacing-16);
    border: 1px dashed var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
}

.attachment-field :deep(.upload-content h4) {
    display: none;
}

.attachment-field :deep(.upload-content p),
.attachment-field > p {
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.attachment-field > p {
    margin: var(--erp-spacing-8) 0 0;
}

</style>
