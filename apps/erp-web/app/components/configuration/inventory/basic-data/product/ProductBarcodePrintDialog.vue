<template>
    <div class="erp-dialog-mask barcode-print-mask" role="presentation" @click.self="emit('close')">
        <ErpDialogFrame
            class="barcode-print-dialog"
            title="打印条码"
            @close="emit('close')"
        >
            <div class="barcode-print-body">
                <div class="barcode-label-preview">
                    <div class="barcode-product-model">{{ productModel }}</div>
                    <svg
                        ref="barcodeSvgRef"
                        class="barcode-svg"
                        role="img"
                    />
                    <div class="barcode-product-code">{{ productCode || "--" }}</div>
                </div>
                <p v-if="barcodeError" class="barcode-error">不支持生成条码。</p>
            </div>

            <template #footer>
                <button class="dialog-button cancel" type="button" @click="emit('close')">
                    取消
                </button>
                <button
                    class="dialog-button confirm"
                    type="button"
                    :disabled="barcodeError"
                    @click="printBarcode"
                >
                    打印
                </button>
            </template>
        </ErpDialogFrame>
    </div>
</template>

<script setup lang="ts">
import JsBarcode from "jsbarcode";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";

const props = defineProps<{
    productModel: string;
    productCode: string;
}>();

const emit = defineEmits<{
    close: [];
}>();

const barcodeSvgRef = ref<SVGSVGElement | null>(null);
const barcodeError = ref(false);

const renderBarcode = async () => {
    await nextTick();

    const svg = barcodeSvgRef.value;
    const value = props.productCode.trim();

    if (!svg || !value) {
        barcodeError.value = true;
        return;
    }

    try {
        JsBarcode(svg, value, {
            format: "CODE128",
            displayValue: false,
            margin: 0,
            width: 2,
            height: 72,
        });
        barcodeError.value = false;
    } catch {
        barcodeError.value = true;
    }
};

const printBarcode = () => {
    if (barcodeError.value) {
        return;
    }

    window.print();
};

watch(
    () => props.productCode,
    renderBarcode,
    { immediate: true },
);
</script>

<style scoped>
.barcode-print-body {
    display: grid;
    justify-items: center;
    gap: var(--erp-spacing-10);
}

.barcode-label-preview {
    width: 320px;
    padding: 18px 16px 16px;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    text-align: center;
    background: var(--erp-color-fill-default);
}

.barcode-product-model {
    margin-bottom: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    word-break: break-word;
}

.barcode-svg {
    width: 100%;
    height: auto;
    display: block;
    margin: 0 auto 8px;
}

.barcode-product-code {
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    letter-spacing: 0.08em;
}

.barcode-error {
    margin: 0;
    color: var(--erp-color-text-status-error);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

@media print {
    body * {
        visibility: hidden !important;
    }

    .barcode-print-mask,
    .barcode-print-mask * {
        visibility: visible !important;
    }

    .barcode-print-mask {
        position: fixed;
        inset: 0;
        display: block;
        background: #ffffff;
    }

    .barcode-print-dialog {
        width: auto;
        min-width: 0;
        max-width: none;
        min-height: 0;
        max-height: none;
        display: block;
        padding: 0;
        border: 0;
        box-shadow: none;
    }

    .barcode-print-dialog :deep(.erp-dialog-frame__header),
    .barcode-print-dialog :deep(.erp-dialog-frame__actions),
    .barcode-error {
        display: none !important;
    }

    .barcode-print-body {
        display: block;
        padding: 0;
    }

    .barcode-label-preview {
        width: 320px;
        margin: 0 auto;
        padding: 0;
        border: 0;
        border-radius: 0;
    }
}
</style>
