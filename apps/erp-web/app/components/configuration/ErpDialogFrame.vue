<template>
    <component
        :is="form ? 'form' : 'div'"
        class="erp-dialog-frame"
        :class="{
            'erp-dialog-frame--no-footer': showFooter === false,
        }"
        :style="{
            width,
            height,
            '--erp-dialog-form-width': formWidth,
        }"
    >
        <div class="erp-dialog-frame__header">
            <h2 class="erp-dialog-frame__title">{{ title }}</h2>
            <button
                class="erp-dialog-frame__close"
                type="button"
                :disabled="closeDisabled"
                @click="emit('close')"
            >
                <Icon name="lucide:x" />
            </button>
        </div>

        <div class="erp-dialog-frame__body">
            <slot />
        </div>

        <div v-if="showFooter !== false" class="erp-dialog-frame__actions">
            <slot name="footer" />
        </div>
    </component>
</template>

<script setup lang="ts">
withDefaults(
    defineProps<{
        title: string;
        width?: string;
        height?: string;
        formWidth?: string;
        closeDisabled?: boolean;
        form?: boolean;
        showFooter?: boolean;
    }>(),
    {
        formWidth: "384px",
        closeDisabled: false,
        form: true,
        showFooter: true,
    },
);

const emit = defineEmits<{
    close: [];
}>();
</script>
