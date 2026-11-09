<template>
    <div class="inventory-inline-scanner">
        <button
            class="scan-mode-button"
            :class="{ active: scanMode === 'location' }"
            type="button"
            :disabled="loading"
            @click="activateMode('location')"
        >
            <Icon name="lucide:map-pin" class="button-icon" />
            <span>扫描仓位</span>
        </button>
        <button
            class="scan-mode-button"
            :class="{ active: scanMode === 'product' }"
            type="button"
            :disabled="loading"
            @click="activateMode('product')"
        >
            <Icon name="lucide:scan-line" class="button-icon" />
            <span>扫码添加</span>
        </button>
        <div class="scan-input-form">
            <Icon name="lucide:scan-line" class="scan-input-icon" />
            <input
                ref="scanInputRef"
                v-model="scanCode"
                type="text"
                autocomplete="off"
                :disabled="loading"
                :placeholder="scanPlaceholder"
                @keydown.enter.stop.prevent="submitScanCode"
            >
            <span v-if="loading" class="scan-loading">识别中</span>
        </div>
    </div>
</template>

<script setup lang="ts">
type ScanMode = "product" | "location";

const props = withDefaults(defineProps<{
    loading?: boolean;
    clearSignal?: number;
    autoFocus?: boolean;
}>(), {
    loading: false,
    clearSignal: 0,
    autoFocus: true,
});

const emit = defineEmits<{
    "scan-product": [code: string];
    "scan-location": [code: string];
}>();

const scanInputRef = ref<HTMLInputElement | null>(null);
const scanCode = ref("");
const scanMode = ref<ScanMode>("product");
const scanPlaceholder = computed(() =>
    scanMode.value === "location" ? "请扫描仓位码并回车" : "请扫描产品条码/编号并回车",
);

const focusInput = async () => {
    if (!props.autoFocus) {
        return;
    }

    await nextTick();
    if (props.autoFocus) {
        scanInputRef.value?.focus();
    }
};

const activateMode = (mode: ScanMode) => {
    if (props.loading) {
        return;
    }

    scanMode.value = mode;
    scanCode.value = "";
    focusInput();
};

const submitScanCode = () => {
    if (props.loading) {
        return;
    }

    const code = scanCode.value.trim();
    if (!code) {
        ElMessage.warning(scanMode.value === "location" ? "请扫描或输入仓位码" : "请扫描或输入产品条码/编号");
        focusInput();
        return;
    }

    if (scanMode.value === "location") {
        emit("scan-location", code);
        return;
    }

    emit("scan-product", code);
};

watch(
    () => props.clearSignal,
    () => {
        scanCode.value = "";
        focusInput();
    },
);

watch(
    () => props.loading,
    (loading) => {
        if (!loading) {
            focusInput();
        }
    },
);

watch(
    () => props.autoFocus,
    (autoFocus) => {
        if (!autoFocus) {
            scanInputRef.value?.blur();
        }
    },
);

onMounted(focusInput);
</script>

<style scoped>
.inventory-inline-scanner {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-8);
}

.scan-mode-button {
    flex: 0 0 auto;
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-brand);
    background: transparent;
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
    cursor: pointer;
}

.scan-mode-button.active {
    background: var(--erp-color-fill-hover);
}

.scan-mode-button:disabled {
    color: var(--erp-color-text-disabled);
    cursor: not-allowed;
}

.button-icon,
.scan-input-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.scan-input-form {
    position: relative;
    width: min(260px, 24vw);
    min-width: 190px;
    height: var(--erp-size-control-height-sm);
}

.scan-input-icon {
    position: absolute;
    left: var(--erp-spacing-8);
    top: 50%;
    z-index: 1;
    color: var(--erp-color-icon-secondary);
    transform: translateY(-50%);
    pointer-events: none;
}

.scan-input-form input {
    width: 100%;
    height: 100%;
    padding: 0 58px 0 32px;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    outline: 0;
    box-sizing: border-box;
}

.scan-input-form input:focus {
    border-color: var(--erp-color-border-brand);
}

.scan-loading {
    position: absolute;
    right: var(--erp-spacing-8);
    top: 50%;
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content2-font-size);
    transform: translateY(-50%);
}
</style>
