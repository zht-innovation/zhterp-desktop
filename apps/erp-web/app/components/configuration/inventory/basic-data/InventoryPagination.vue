<template>
    <footer class="inventory-pagination" :class="{ 'inventory-pagination--compact': compact }">
        <div class="pagination-inner">
            <span class="total">共{{ total }}条<span v-if="compact"> · 已选择 {{ selectedCount }} 项</span></span>

            <div class="pager-controls">
                <label class="page-size-wrap">
                    <select
                        :value="pageSize"
                        class="page-size"
                        aria-label="每页条数"
                        @change="emit('update:pageSize', Number(($event.target as HTMLSelectElement).value))"
                    >
                        <option
                            v-for="option in pageSizeOptions"
                            :key="option"
                            :value="option"
                        >
                            {{ option }}条/页
                        </option>
                    </select>
                    <Icon name="lucide:chevron-down" class="page-size-icon" />
                </label>

                <div class="page-number-group" aria-label="分页">
                    <button
                        class="page-arrow"
                        type="button"
                        aria-label="上一页"
                        :disabled="currentPage <= 1"
                        @click="emit('page-change', currentPage - 1)"
                    >
                        <span v-if="compact">上一页</span>
                        <Icon v-else name="lucide:chevron-left" class="page-arrow-icon" />
                    </button>
                    <span v-if="compact" class="compact-page-status" aria-live="polite">{{ currentPage }} / {{ totalPages }}</span>
                    <template v-else>
                        <template v-for="(page, index) in boundedPageNumbers" :key="page">
                            <span
                                v-if="index > 0 && page - boundedPageNumbers[index - 1] > 1"
                                class="page-ellipsis"
                                aria-hidden="true"
                            >
                                ...
                            </span>
                            <button
                                class="page-number"
                                :class="{ active: page === currentPage }"
                                type="button"
                                @click="emit('page-change', page)"
                            >
                                {{ page }}
                            </button>
                        </template>
                    </template>
                    <button
                        class="page-arrow"
                        type="button"
                        aria-label="下一页"
                        :disabled="currentPage >= totalPages"
                        @click="emit('page-change', currentPage + 1)"
                    >
                        <span v-if="compact">下一页</span>
                        <Icon v-else name="lucide:chevron-right" class="page-arrow-icon" />
                    </button>
                </div>

                <div v-if="!compact" class="jump">
                    <span>跳转到</span>
                    <input
                        :value="jumpPageInput"
                        type="text"
                        aria-label="跳转页码"
                        @input="emit('update:jumpPageInput', ($event.target as HTMLInputElement).value)"
                        @keyup.enter="emit('jump')"
                        @blur="emit('jump')"
                    >
                    <span>页</span>
                </div>
            </div>
        </div>
    </footer>
</template>

<script setup lang="ts">
import { getPaginationPageNumbers } from "~/composables/inventory/useInventoryPagination";

const props = withDefaults(defineProps<{
    total?: number;
    pageSize?: number;
    pageSizeOptions?: number[];
    pageNumbers?: number[];
    totalPages?: number;
    currentPage?: number;
    jumpPageInput?: string;
    compact?: boolean;
    selectedCount?: number;
}>(), {
    total: 0,
    pageSize: 10,
    pageSizeOptions: () => [],
    pageNumbers: () => [],
    totalPages: 1,
    currentPage: 1,
    jumpPageInput: "",
    compact: false,
    selectedCount: 0,
});

const boundedPageNumbers = computed(() => {
    if (props.pageNumbers.length > 0 && props.pageNumbers.length <= 7) {
        return props.pageNumbers;
    }

    return getPaginationPageNumbers(props.totalPages, props.currentPage);
});

const emit = defineEmits<{
    "update:pageSize": [pageSize: number];
    "update:jumpPageInput": [value: string];
    "page-change": [page: number];
    jump: [];
}>();
</script>

<style scoped>
.inventory-pagination {
    position: relative;
}

.pagination-inner {
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--erp-spacing-8) var(--erp-spacing-12);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.total,
.jump {
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.pager-controls,
.page-number-group,
.jump {
    display: flex;
    align-items: center;
}

.pager-controls {
    gap: var(--erp-spacing-20);
}

.page-number-group,
.jump {
    gap: var(--erp-spacing-8);
}

.page-size-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
}

.page-size {
    height: var(--erp-size-control-height-sm);
    padding: var(--erp-spacing-4) 34px var(--erp-spacing-4) var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
    appearance: none;
}

.page-size-icon {
    position: absolute;
    right: 8px;
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
    color: var(--erp-color-icon-default);
    pointer-events: none;
}

.page-arrow,
.page-number {
    min-width: var(--erp-size-control-height-sm);
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: transparent;
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
    cursor: pointer;
}

.page-ellipsis {
    width: 20px;
    flex: 0 0 20px;
    color: var(--inventory-pagination-muted, #b3b3b3);
    text-align: center;
    user-select: none;
}

.page-arrow {
    background: var(--erp-color-fill-control-secondary);
}

.page-arrow-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
    flex: 0 0 auto;
    font-size: var(--erp-size-icon-default);
}

.page-arrow:disabled {
    cursor: not-allowed;
}

.page-arrow:disabled {
    color: var(--erp-color-icon-disabled);
    background: var(--erp-color-fill-disabled);
}

.page-number.active {
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.page-number.active:active {
    background: var(--erp-color-action-primary-pressed);
}

.jump input {
    width: 40px;
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    text-align: center;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
}

.page-size:focus,
.jump input:focus {
    border-color: var(--erp-color-border-brand);
    outline: 0;
}

.inventory-pagination--compact .pagination-inner {
    height: 44px;
    padding: 0;
    gap: 12px;
    border-radius: 0;
}

.inventory-pagination--compact .total,
.inventory-pagination--compact .compact-page-status {
    color: #7a8eab;
    font-size: 12px;
    line-height: 20px;
    white-space: nowrap;
}

.inventory-pagination--compact .pager-controls {
    gap: 10px;
}

.inventory-pagination--compact .page-size,
.inventory-pagination--compact .page-arrow {
    height: 34px;
    border: 1px solid #c5cedb;
    border-radius: 5px;
    color: #16345a;
    background: #fff;
    font-size: 12px;
    font-weight: 400;
    line-height: 20px;
}

.inventory-pagination--compact .page-size {
    min-width: 100px;
}

.inventory-pagination--compact .page-arrow {
    padding: 0 12px;
    white-space: nowrap;
}

.inventory-pagination--compact .page-arrow:disabled {
    color: #a3afbf;
    border-color: #e1e6ee;
}

.inventory-pagination--compact .page-arrow:not(:disabled):hover {
    color: #2788ee;
    border-color: #2788ee;
}

@media (max-width: 760px) {
    .inventory-pagination--compact .pagination-inner {
        height: auto;
        min-height: 44px;
        flex-wrap: wrap;
    }
}
</style>
