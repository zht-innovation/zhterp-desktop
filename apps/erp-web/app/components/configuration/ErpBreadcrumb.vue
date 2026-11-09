<template>
    <div class="erp-breadcrumb">
        <div
            v-for="(item, index) in items"
            :key="`${item.label}-${index}`"
            class="erp-breadcrumb-item"
        >
            <span
                class="erp-breadcrumb-section"
                :class="{ 'erp-breadcrumb-section--primary': index === 0 }"
            >
                <Icon
                    v-if="index === 0"
                    :name="icon"
                    class="erp-breadcrumb-leading-icon"
                />
                <span>{{ item.label }}</span>
            </span>

            <Icon
                v-if="index < items.length - 1"
                name="lucide:chevron-right"
                class="erp-breadcrumb-separator"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
interface ErpBreadcrumbItem {
    label: string;
}

defineProps<{
    icon: string;
    items: ErpBreadcrumbItem[];
}>();
</script>

<style scoped>
.erp-breadcrumb {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-20);
    white-space: nowrap;
}

.erp-breadcrumb-item {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-20);
}

.erp-breadcrumb-section {
    display: inline-flex;
    align-items: center;
    gap: var(--erp-spacing-8);
    color: var(--erp-color-text-placeholder);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.erp-breadcrumb-section--primary {
    color: var(--erp-color-text-secondary-strong);
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
}

.erp-breadcrumb-leading-icon,
.erp-breadcrumb-separator {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
    flex: 0 0 var(--erp-size-icon-default);
}

.erp-breadcrumb-leading-icon {
    color: var(--erp-color-icon-control-secondary);
}

.erp-breadcrumb-separator {
    color: var(--erp-color-icon-disabled);
}
</style>
