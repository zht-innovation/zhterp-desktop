<template>
    <div
        ref="rootRef"
        class="searchable-select"
        :class="[attrs.class, {
            open: isOpen,
            disabled,
            empty: !selectedLabel,
        }]"
        :style="attrs.style"
    >
        <input
            ref="inputRef"
            v-bind="inputAttrs"
            class="searchable-select-input"
            type="text"
            :value="inputText"
            :placeholder="activePlaceholder"
            :disabled="disabled"
            :aria-label="inputAriaLabel"
            autocomplete="off"
            @focus="openPanel"
            @input="handleInput"
            @keydown.down.prevent="moveActive(1)"
            @keydown.up.prevent="moveActive(-1)"
            @keydown.enter.prevent="selectActiveOption"
            @keydown.esc.prevent="closePanel"
        >
        <button
            v-if="clearable && selectedLabel && !disabled"
            class="searchable-select-clear"
            type="button"
            aria-label="清空选择"
            @mousedown.prevent
            @click="clearSelection"
        >
            <Icon name="lucide:x" />
        </button>
        <Icon name="lucide:chevron-down" class="searchable-select-arrow" />

        <div v-if="isOpen" class="searchable-select-panel">
            <button
                v-for="(option, index) in filteredOptions"
                :key="`${String(option.value)}-${option.label}`"
                class="searchable-select-option"
                :class="{
                    selected: isSelected(option),
                    active: index === activeIndex,
                }"
                type="button"
                :disabled="option.disabled"
                @mouseenter="activeIndex = index"
                @mousedown.prevent="selectOption(option)"
            >
                {{ option.label }}
            </button>
            <div v-if="filteredOptions.length === 0" class="searchable-select-empty">
                暂无匹配选项
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
defineOptions({
    inheritAttrs: false,
});

type SelectValue = string | number;

interface SearchableSelectOption {
    label: string;
    value: SelectValue;
    disabled?: boolean;
}

const props = withDefaults(defineProps<{
    modelValue?: SelectValue | null;
    options: SearchableSelectOption[];
    placeholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    ariaLabel?: string;
}>(), {
    modelValue: "",
    placeholder: "请选择",
    disabled: false,
    clearable: true,
    ariaLabel: "",
});

const emit = defineEmits<{
    "update:modelValue": [value: SelectValue | ""];
    change: [value: SelectValue | ""];
}>();

const attrs = useAttrs();
const rootRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const isOpen = ref(false);
const inputText = ref("");
const activeIndex = ref(0);

const inputAttrs = computed(() => {
    const {
        class: _class,
        style: _style,
        "aria-label": _ariaLabel,
        ...rest
    } = attrs;

    return rest;
});

const inputAriaLabel = computed(() =>
    props.ariaLabel || String(attrs["aria-label"] || props.placeholder),
);

const normalizedValue = computed(() => String(props.modelValue ?? ""));

const selectedOption = computed(() =>
    props.options.find((option) => String(option.value) === normalizedValue.value),
);

const selectedLabel = computed(() => selectedOption.value?.label || "");

const activePlaceholder = computed(() =>
    isOpen.value && selectedLabel.value ? selectedLabel.value : props.placeholder,
);

const filteredOptions = computed(() => {
    const keyword = inputText.value.trim().toLowerCase();

    if (!keyword) {
        return props.options;
    }

    return props.options.filter((option) => {
        const label = option.label.toLowerCase();
        const value = String(option.value).toLowerCase();

        return label.includes(keyword) || value.includes(keyword);
    });
});

const syncInputText = () => {
    inputText.value = selectedLabel.value;
};

const closePanel = () => {
    isOpen.value = false;
    syncInputText();
};

const openPanel = async () => {
    if (props.disabled) {
        return;
    }

    isOpen.value = true;
    inputText.value = "";
    activeIndex.value = 0;

    await nextTick();
    inputRef.value?.select();
};

const handleInput = (event: Event) => {
    inputText.value = (event.target as HTMLInputElement).value;
    isOpen.value = true;
    activeIndex.value = 0;
};

const isSelected = (option: SearchableSelectOption) =>
    String(option.value) === normalizedValue.value;

const emitValue = (value: SelectValue | "") => {
    emit("update:modelValue", value);
    emit("change", value);
};

const selectOption = (option: SearchableSelectOption) => {
    if (option.disabled) {
        return;
    }

    emitValue(option.value);
    isOpen.value = false;
    inputText.value = option.label;
};

const clearSelection = () => {
    emitValue("");
    inputText.value = "";
    activeIndex.value = 0;
    inputRef.value?.focus();
};

const moveActive = (step: number) => {
    if (!isOpen.value) {
        void openPanel();
        return;
    }

    const enabledIndexes = filteredOptions.value
        .map((option, index) => option.disabled ? -1 : index)
        .filter((index) => index >= 0);

    if (enabledIndexes.length === 0) {
        activeIndex.value = 0;
        return;
    }

    const currentPosition = enabledIndexes.indexOf(activeIndex.value);
    const nextPosition = currentPosition === -1
        ? 0
        : (currentPosition + step + enabledIndexes.length) % enabledIndexes.length;

    activeIndex.value = enabledIndexes[nextPosition] ?? 0;
};

const selectActiveOption = () => {
    const option = filteredOptions.value[activeIndex.value];

    if (option) {
        selectOption(option);
    }
};

const handleDocumentPointerDown = (event: PointerEvent) => {
    if (!rootRef.value?.contains(event.target as Node)) {
        closePanel();
    }
};

watch(selectedLabel, () => {
    if (!isOpen.value) {
        syncInputText();
    }
}, { immediate: true });

watch(() => props.options, () => {
    if (!isOpen.value) {
        syncInputText();
    }
});

onMounted(() => {
    document.addEventListener("pointerdown", handleDocumentPointerDown);
});

onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", handleDocumentPointerDown);
});
</script>

<style scoped>
.searchable-select {
    position: relative;
    width: 100%;
    min-width: 0;
}

.searchable-select-input {
    width: 100%;
    min-width: 0;
    height: var(--searchable-select-height, 36px);
    box-sizing: border-box;
    padding: 0 34px 0 12px;
    border: 1px solid var(--searchable-select-border, #d9d9d9);
    border-radius: var(--searchable-select-radius, 6px);
    color: var(--searchable-select-text, #262626);
    background: var(--searchable-select-bg, #ffffff);
    font-size: var(--searchable-select-font-size, 14px);
    line-height: var(--searchable-select-height, 36px);
    outline: 0;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.searchable-select-input::placeholder {
    color: var(--searchable-select-placeholder, #9ca3af);
}

.searchable-select-input:focus {
    border-color: var(--searchable-select-active-border, #4e8af4);
    box-shadow: 0 0 0 2px rgb(78 138 244 / 12%);
}

.searchable-select.disabled .searchable-select-input {
    color: var(--searchable-select-disabled-text, #8c8c8c);
    background: var(--searchable-select-disabled-bg, #f5f5f5);
    cursor: not-allowed;
}

.searchable-select-arrow,
.searchable-select-clear {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
}

.searchable-select-arrow {
    right: 10px;
    width: 16px;
    height: 16px;
    color: var(--searchable-select-icon, #8c8c8c);
    pointer-events: none;
}

.searchable-select.open .searchable-select-arrow {
    transform: translateY(-50%) rotate(180deg);
}

.searchable-select-clear {
    right: 30px;
    display: inline-flex;
    width: 18px;
    height: 18px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    color: #9ca3af;
    background: transparent;
    cursor: pointer;
}

.searchable-select-clear:hover {
    color: #4b5563;
    background: #f3f4f6;
}

.searchable-select-panel {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 60;
    max-height: 220px;
    overflow: auto;
    padding: 4px;
    border: 1px solid var(--searchable-select-panel-border, #d9d9d9);
    border-radius: 6px;
    background: #ffffff;
    box-shadow: 0 10px 24px rgb(15 23 42 / 16%);
}

.searchable-select-option {
    display: block;
    width: 100%;
    min-width: 0;
    height: 32px;
    overflow: hidden;
    padding: 0 8px;
    border: 0;
    border-radius: 4px;
    color: #262626;
    background: transparent;
    font-size: 13px;
    line-height: 32px;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
}

.searchable-select-option:hover,
.searchable-select-option.active {
    background: #e6f4ff;
}

.searchable-select-option.selected {
    color: #2563eb;
    font-weight: 600;
}

.searchable-select-option:disabled {
    color: #bfbfbf;
    cursor: not-allowed;
    background: transparent;
}

.searchable-select-empty {
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #8c8c8c;
    font-size: 13px;
}
</style>
