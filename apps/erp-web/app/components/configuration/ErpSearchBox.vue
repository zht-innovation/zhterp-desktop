<template>
    <form class="erp-search-box" @submit.prevent="emit('search')">
        <Icon name="lucide:search" class="erp-search-box-icon" />
        <input
            class="erp-search-box-input"
            type="search"
            :value="modelValue"
            :placeholder="placeholder"
            :disabled="disabled"
            @input="updateValue"
        >
        <button
            class="erp-search-box-button"
            type="submit"
            :disabled="disabled"
        >
            {{ buttonText }}
        </button>
    </form>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
    modelValue: string;
    placeholder?: string;
    buttonText?: string;
    disabled?: boolean;
}>(), {
    placeholder: "输入你想要寻找的内容",
    buttonText: "搜索",
    disabled: false,
});

const emit = defineEmits<{
    "update:modelValue": [value: string];
    search: [];
}>();

const updateValue = (event: Event) => {
    emit("update:modelValue", (event.target as HTMLInputElement).value);
};
</script>

<style scoped>
.erp-search-box {
    width: 460px;
    height: 40px;
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-8);
    padding: var(--erp-spacing-8) var(--erp-spacing-4) var(--erp-spacing-8) var(--erp-spacing-12);
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.erp-search-box-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
    flex: 0 0 var(--erp-size-icon-default);
    color: var(--erp-color-icon-secondary);
}

.erp-search-box-input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    color: var(--erp-color-text-primary);
    background: transparent;
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.erp-search-box-input::placeholder {
    color: var(--erp-color-text-placeholder);
}

.erp-search-box-button {
    width: 60px;
    height: var(--erp-size-control-height-sm);
    flex: 0 0 60px;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
    cursor: pointer;
}

.erp-search-box-button:not(:disabled):active {
    background: var(--erp-color-action-primary-pressed);
}

.erp-search-box-input:disabled,
.erp-search-box-button:disabled {
    cursor: not-allowed;
}

.erp-search-box-button:disabled {
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

@media (max-width: 1200px) {
    .erp-search-box {
        width: 360px;
    }
}
</style>
