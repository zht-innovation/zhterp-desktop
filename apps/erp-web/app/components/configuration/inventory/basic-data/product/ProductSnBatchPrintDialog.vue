<template>
    <div class="erp-dialog-mask sn-print-mask" role="presentation" @click.self="emit('close')">
        <ErpDialogFrame
            class="sn-print-dialog"
            title="批量打印SN码"
            @close="emit('close')"
        >
            <div class="sn-print-body">
                <div class="sn-print-form">
                    <label class="sn-form-field">
                        <span>产品编号</span>
                        <input :value="productCode || '--'" type="text" disabled>
                    </label>
                    <label class="sn-form-field">
                        <span>SN首段</span>
                        <select v-model="selectedSnPrefix">
                            <option :value="cleanProductCode">SKU：{{ cleanProductCode || '--' }}</option>
                            <option
                                v-for="prefix in normalizedSnPrefixes"
                                :key="prefix"
                                :value="prefix"
                            >
                                前缀：{{ prefix }}
                            </option>
                        </select>
                    </label>
                    <label class="sn-form-field">
                        <span>日期</span>
                        <input :value="dateText" type="text" disabled>
                    </label>
                    <label class="sn-form-field">
                        <span>打印数量</span>
                        <input
                            v-model.number="quantity"
                            type="number"
                            min="1"
                            step="1"
                            @blur="normalizeQuantity"
                        >
                    </label>
                    <label class="sn-form-field">
                        <span>起始流水号</span>
                        <input
                            v-model="startSerial"
                            type="text"
                            inputmode="numeric"
                            @blur="normalizeStartSerial"
                        >
                        <small class="sn-print-hint">当月延顺号打印至：{{ currentMonthLastSerialText }}</small>
                    </label>
                    <label class="sn-form-field">
                        <span>标签宽度</span>
                        <div class="sn-size-input">
                            <input
                                v-model.number="labelWidthMm"
                                type="number"
                                min="10"
                                step="1"
                                @blur="normalizeLabelSize"
                            >
                            <span>mm</span>
                        </div>
                    </label>
                    <label class="sn-form-field">
                        <span>标签高度</span>
                        <div class="sn-size-input">
                            <input
                                v-model.number="labelHeightMm"
                                type="number"
                                min="10"
                                step="1"
                                @blur="normalizeLabelSize"
                            >
                            <span>mm</span>
                        </div>
                    </label>
                </div>

                <div class="sn-label-preview-list">
                    <div
                        v-for="(snCode, index) in snCodes"
                        :key="snCode"
                        class="sn-label"
                        :style="labelStyle"
                    >
                        <div class="sn-product-model">{{ productModel || productCode || '--' }}</div>
                        <svg
                            :ref="(el) => setBarcodeSvgRef(el, index)"
                            class="sn-barcode-svg"
                            role="img"
                        />
                        <div class="sn-code-text">{{ snCode }}</div>
                    </div>
                </div>

                <p v-if="validationMessage" class="sn-print-error">{{ validationMessage }}</p>
                <p v-else-if="renderError" class="sn-print-error">部分SN码生成失败。</p>
            </div>

            <template #footer>
                <button class="dialog-button cancel" type="button" @click="emit('close')">
                    取消
                </button>
                <button
                    class="dialog-button confirm"
                    type="button"
                    :disabled="!canPrint"
                    @click="printSnCodes"
                >
                    {{ isRecordingPrint ? "记录中..." : "打印" }}
                </button>
            </template>
        </ErpDialogFrame>
    </div>
</template>

<script setup lang="ts">
import type { ComponentPublicInstance } from "vue";
import JsBarcode from "jsbarcode";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import { updateInventoryProductSnPrintState } from "~/composables/api/useInventoryApi";

interface SnPrintState {
    monthKey: string;
    lastSerial: number;
    updatedAt?: string | Date;
    updatedBy?: string;
}

const props = withDefaults(defineProps<{
    productId: string;
    productModel: string;
    productCode: string;
    snPrefixes?: string[];
    snPrintState?: SnPrintState | null;
}>(), {
    snPrefixes: () => [],
    snPrintState: null,
});

const emit = defineEmits<{
    close: [];
    "state-updated": [state: SnPrintState];
}>();

const quantity = ref(1);
const startSerial = ref("0001");
const labelWidthMm = ref(50);
const labelHeightMm = ref(30);
const renderError = ref(false);
const isRecordingPrint = ref(false);
const barcodeSvgRefs = ref<SVGSVGElement[]>([]);

const formatLocalDate = (date: Date) => {
    const pad = (value: number) => String(value).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);

    return `${year}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
};

const dateText = formatLocalDate(new Date());
const monthKey = (() => {
    const date = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
})();
const productCode = computed(() => props.productCode.trim());
const cleanProductCode = computed(() => productCode.value.replace(/-/g, ""));
const normalizedSnPrefixes = computed(() => {
    return (props.snPrefixes || [])
        .map((prefix) => prefix.trim().toUpperCase().replace(/-/g, ""))
        .filter(Boolean);
});
const defaultSnPrefix = computed(() => normalizedSnPrefixes.value[0] || cleanProductCode.value);
const selectedSnPrefix = ref<string>(defaultSnPrefix.value);

watch(
    defaultSnPrefix,
    (value) => {
        if (!selectedSnPrefix.value || selectedSnPrefix.value === cleanProductCode.value || normalizedSnPrefixes.value.includes(selectedSnPrefix.value)) {
            selectedSnPrefix.value = value;
        }
    },
);
const normalizedQuantity = computed(() => {
    const value = Number(quantity.value);

    return Number.isInteger(value) && value > 0 ? value : 0;
});
const serialDigits = computed(() => startSerial.value.replace(/\D/g, ""));
const normalizedSerialText = computed(() => {
    return serialDigits.value ? serialDigits.value.padStart(3, "0") : "";
});
const startSerialNumber = computed(() => {
    return normalizedSerialText.value ? Number.parseInt(normalizedSerialText.value, 10) : 0;
});
const serialWidth = computed(() => Math.max(4, normalizedSerialText.value.length));
const currentMonthLastSerial = computed(() => {
    if (props.snPrintState?.monthKey !== monthKey) {
        return 0;
    }

    const value = Number(props.snPrintState.lastSerial || 0);
    return Number.isInteger(value) && value > 0 ? value : 0;
});
const currentMonthLastSerialText = computed(() =>
    String(currentMonthLastSerial.value).padStart(serialWidth.value, "0"),
);
const endSerialNumber = computed(() =>
    normalizedQuantity.value && startSerialNumber.value
        ? startSerialNumber.value + normalizedQuantity.value - 1
        : 0,
);
const normalizedLabelWidthMm = computed(() => {
    const value = Number(labelWidthMm.value);

    return Number.isFinite(value) && value >= 10 ? value : 0;
});
const normalizedLabelHeightMm = computed(() => {
    const value = Number(labelHeightMm.value);

    return Number.isFinite(value) && value >= 10 ? value : 0;
});
const labelStyle = computed(() => ({
    "--sn-label-width": `${normalizedLabelWidthMm.value || 50}mm`,
    "--sn-label-height": `${normalizedLabelHeightMm.value || 30}mm`,
}));

const validationMessage = computed(() => {
    if (!selectedSnPrefix.value) {
        return "产品编号和SN前缀为空，无法生成SN码。";
    }

    if (!normalizedQuantity.value) {
        return "请输入大于0的打印数量。";
    }

    if (!startSerialNumber.value) {
        return "请输入大于0的起始流水号。";
    }

    if (startSerialNumber.value <= currentMonthLastSerial.value) {
        return "起始流水号需大于当月已打印流水号。";
    }

    if (!normalizedLabelWidthMm.value || !normalizedLabelHeightMm.value) {
        return "标签宽高不能小于10mm。";
    }

    return "";
});

const snCodes = computed(() => {
    if (validationMessage.value) {
        return [];
    }

    return Array.from({ length: normalizedQuantity.value }, (_, index) => {
        const serial = String(startSerialNumber.value + index).padStart(serialWidth.value, "0");

        return `${selectedSnPrefix.value}${dateText}${serial}`;
    });
});

const canPrint = computed(() =>
    !validationMessage.value &&
    !renderError.value &&
    !isRecordingPrint.value &&
    snCodes.value.length > 0,
);

const normalizeQuantity = () => {
    const value = Number(quantity.value);
    quantity.value = Number.isInteger(value) && value > 0 ? value : 1;
};

const normalizeStartSerial = () => {
    startSerial.value = normalizedSerialText.value || String(currentMonthLastSerial.value + 1).padStart(4, "0");
};

const normalizeLabelSize = () => {
    const width = Number(labelWidthMm.value);
    const height = Number(labelHeightMm.value);

    labelWidthMm.value = Number.isFinite(width) && width >= 10 ? width : 50;
    labelHeightMm.value = Number.isFinite(height) && height >= 10 ? height : 30;
};

const setBarcodeSvgRef = (el: Element | ComponentPublicInstance | null, index: number) => {
    if (el instanceof SVGSVGElement) {
        barcodeSvgRefs.value[index] = el;
    }
};

const renderCodes = async () => {
    await nextTick();

    renderError.value = false;

    if (validationMessage.value) {
        return;
    }

    try {
        snCodes.value.forEach((value, index) => {
            const svg = barcodeSvgRefs.value[index];

            if (!svg) {
                throw new Error("missing barcode svg");
            }

            svg.innerHTML = "";
            JsBarcode(svg, value, {
                format: "CODE128",
                displayValue: false,
                margin: 0,
                width: 1.35,
                height: 42,
            });
        });
    } catch {
        renderError.value = true;
    }
};

const syncStartSerialWithState = () => {
    const nextSerial = Math.max(currentMonthLastSerial.value + 1, 1);
    startSerial.value = String(nextSerial).padStart(4, "0");
};

const printSnCodes = async () => {
    if (!canPrint.value) {
        return;
    }

    if (!props.productId) {
        ElMessage.warning("缺少产品ID，无法记录SN打印流水号");
        return;
    }

    isRecordingPrint.value = true;
    try {
        const res = await updateInventoryProductSnPrintState({
            id: props.productId,
            monthKey,
            lastSerial: endSerialNumber.value,
        });

        if (res.code !== 200 || !res.data?.snPrintState) {
            ElMessage.error(res.msg || "记录SN打印流水号失败");
            return;
        }

        emit("state-updated", res.data.snPrintState);
        window.print();
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "记录SN打印流水号失败");
    } finally {
        isRecordingPrint.value = false;
    }
};

onBeforeUpdate(() => {
    barcodeSvgRefs.value = [];
});

watch(
    snCodes,
    renderCodes,
    { immediate: true },
);

watch(
    () => props.snPrintState,
    () => {
        syncStartSerialWithState();
    },
    { immediate: true },
);
</script>

<style scoped>
.sn-print-dialog {
    width: 760px;
}

.sn-print-body {
    min-height: 0;
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: var(--erp-spacing-12);
    overflow: hidden;
}

.sn-print-form {
    align-self: start;
    display: grid;
    gap: var(--erp-spacing-10);
    padding: var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-control-secondary);
}

.sn-form-field {
    display: grid;
    gap: var(--erp-spacing-4);
    color: var(--erp-color-text-secondary-strong);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.sn-print-hint {
    color: var(--erp-color-text-brand);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.sn-form-field input,
.sn-form-field select,
.sn-size-input input {
    min-width: 0;
    height: 32px;
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.sn-form-field input:disabled {
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

.sn-size-input {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--erp-spacing-8);
}

.sn-size-input span {
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.sn-label-preview-list {
    min-height: 0;
    display: flex;
    align-content: flex-start;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: var(--erp-spacing-10);
    overflow: auto;
    padding: var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.sn-label {
    width: var(--sn-label-width);
    height: var(--sn-label-height);
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    align-items: center;
    justify-items: center;
    padding: 2.5mm 3mm;
    border: 1px dashed #cbd5e1;
    border-radius: 4px;
    overflow: hidden;
    color: #262626;
    background: #ffffff;
    text-align: center;
}

.sn-product-model {
    max-width: 100%;
    overflow: hidden;
    color: #262626;
    font-size: 10px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sn-barcode-svg {
    width: 100%;
    max-height: 13mm;
    display: block;
}

.sn-code-text {
    max-width: 100%;
    overflow: hidden;
    color: #262626;
    font-size: 9px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sn-print-error {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--erp-color-text-status-error);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

@media print {
    body * {
        visibility: hidden !important;
    }

    .sn-print-mask,
    .sn-print-mask * {
        visibility: visible !important;
    }

    .sn-print-mask {
        position: fixed;
        inset: 0;
        display: block;
        overflow: visible;
        background: #ffffff;
    }

    .sn-print-dialog {
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

    .sn-print-dialog :deep(.erp-dialog-frame__header),
    .sn-print-form,
    .sn-print-dialog :deep(.erp-dialog-frame__actions),
    .sn-print-error {
        display: none !important;
    }

    .sn-print-body {
        display: block;
        overflow: visible;
        padding: 0;
    }

    .sn-label-preview-list {
        display: flex;
        align-content: flex-start;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 0;
        overflow: visible;
        padding: 0;
        border: 0;
        border-radius: 0;
    }

    .sn-label {
        break-inside: avoid;
        page-break-inside: avoid;
        margin: 0;
        border: 0;
        border-radius: 0;
    }
}
</style>
