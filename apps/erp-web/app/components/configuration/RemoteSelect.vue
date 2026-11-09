<template>
    <div class="remote-select">
        <input
            v-bind="$attrs"
            class="remote-select-input"
            :value="label"
            type="text"
            @focus="handleFocus"
            @input="handleInput"
            @blur="handleBlur"
        >
        <div v-if="isOpen" class="remote-select-panel">
            <button
                v-for="option in options"
                :key="option.id"
                class="remote-select-option"
                :class="{ 'has-option-slot': Boolean(slots.option) }"
                type="button"
                @mousedown.prevent="selectOption(option)"
            >
                <slot name="option" :option="option">
                    {{ option.label }}
                </slot>
            </button>
            <div v-if="options.length === 0" class="remote-select-empty">
                暂无数据
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
defineOptions({
    inheritAttrs: false,
});

interface RemoteSelectOption {
    id: string;
    label: string;
}

const props = defineProps<{
    id: string;
    label: string;
    fetchOptions: (keyword: string) => RemoteSelectOption[] | Promise<RemoteSelectOption[]>;
}>();

const emit = defineEmits<{
    "update:id": [value: string];
    "update:label": [value: string];
    "options-change": [options: RemoteSelectOption[]];
}>();

const options = ref<RemoteSelectOption[]>([]);
const isOpen = ref(false);
const slots = useSlots();
const searchDebounceMs = 250;
let requestSeq = 0;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

const clearSearchTimer = () => {
    if (searchTimer) {
        clearTimeout(searchTimer);
        searchTimer = null;
    }
};

const clearCloseTimer = () => {
    if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
    }
};

const emitOptionsChange = () => {
    emit("options-change", [...options.value]);
};

const syncExactOption = (label: string, list = options.value) => {
    const exactOption = list.find((option) => option.label === label);

    if (!exactOption) {
        return false;
    }

    if (props.id !== exactOption.id) {
        emit("update:id", exactOption.id);
    }

    if (props.label !== exactOption.label) {
        emit("update:label", exactOption.label);
    }

    return true;
};

const applyOptions = (nextOptions: RemoteSelectOption[]) => {
    options.value = nextOptions;
    emitOptionsChange();
    syncExactOption(props.label, nextOptions);
};

const loadOptions = async (keyword = props.label) => {
    const currentRequestSeq = ++requestSeq;

    try {
        const nextOptions = await props.fetchOptions(keyword);

        if (currentRequestSeq !== requestSeq) {
            return;
        }

        applyOptions(Array.isArray(nextOptions) ? nextOptions : []);
    } catch {
        if (currentRequestSeq !== requestSeq) {
            return;
        }

        applyOptions([]);
    }
};

const selectOption = (option: RemoteSelectOption) => {
    clearSearchTimer();
    clearCloseTimer();
    emit("update:id", option.id);
    emit("update:label", option.label);
    isOpen.value = false;
};

const handleFocus = async () => {
    clearCloseTimer();
    isOpen.value = true;

    if (options.value.length === 0) {
        await loadOptions();
        return;
    }

    syncExactOption(props.label);
};

const handleInput = (event: Event) => {
    const nextLabel = (event.target as HTMLInputElement).value;
    emit("update:label", nextLabel);

    const exactOption = options.value.find((option) => option.label === nextLabel);
    emit("update:id", exactOption?.id || "");

    isOpen.value = true;
    requestSeq += 1;
    clearSearchTimer();
    searchTimer = setTimeout(() => {
        void loadOptions(nextLabel);
    }, searchDebounceMs);
};

const handleBlur = () => {
    clearCloseTimer();
    closeTimer = setTimeout(() => {
        isOpen.value = false;
        syncExactOption(props.label);
    }, 120);
};

watch(() => props.label, (label) => {
    if (!label && props.id) {
        emit("update:id", "");
        return;
    }

    syncExactOption(label);
});

onUnmounted(() => {
    requestSeq += 1;
    clearSearchTimer();
    clearCloseTimer();
});
</script>

<style scoped lang="less">
.remote-select {
    position: relative;
    min-width: 0;

    &-input {
        width: 100%;
        min-width: 0;
        height: 32px;
        padding: 0 10px;
        border: 1px solid var(--remote-select-border, #cfcfcf);
        border-radius: 6px;
        color: var(--remote-select-text, #262626);
        background: var(--remote-select-bg, #ffffff);
        outline: 0;
        font-size: 13px;
    }

    &-panel {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        z-index: 60;
        max-height: 180px;
        overflow: auto;
        padding: 4px;
        border: 1px solid var(--remote-select-panel-border, #d9d9d9);
        border-radius: 6px;
        background: var(--remote-select-bg, #ffffff);
        box-shadow: 0 8px 20px rgb(0 0 0 / 12%);
    }

    &-option {
        width: 100%;
        min-width: 0;
        height: 30px;
        display: block;
        overflow: hidden;
        padding: 0 8px;
        border: 0;
        border-radius: 4px;
        color: var(--remote-select-text, #262626);
        background: transparent;
        font-size: 13px;
        text-align: left;
        text-overflow: ellipsis;
        white-space: nowrap;
        cursor: pointer;

        &.has-option-slot {
            height: auto;
            min-height: 30px;
            white-space: normal;
        }

        &:hover {
            background: var(--remote-select-hover-bg, #e6f4ff);
        }
    }

    &-empty {
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--remote-select-muted, #888888);
        font-size: 13px;
    }
}
</style>
