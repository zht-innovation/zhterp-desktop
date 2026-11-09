<template>
    <button
        class="approval-card"
        :class="{ selected }"
        type="button"
        @click="emit('select', item.id)"
    >
        <span class="card-heading">
            <span class="card-title">{{ item.title }}</span>
            <span v-if="item.unread" class="unread-label">
                <span class="unread-dot" />
                未读
            </span>
        </span>

        <span class="card-summary">
            <span v-for="row in item.summary" :key="row.label" class="summary-row">
                <span>{{ row.label }}</span>
                <strong :title="row.value">{{ row.value }}</strong>
            </span>
        </span>

        <span class="card-footer">
            <span class="status-label" :class="`status-${item.status}`">
                {{ statusLabels[item.status] }}
            </span>
            <time :datetime="item.createTime">{{ formatDate(item.createTime) }} 发起</time>
        </span>
    </button>
</template>

<script setup lang="ts">
import type { ApprovalListItem, ApprovalStatus } from "~/types/approval";

defineProps<{
    item: ApprovalListItem;
    selected: boolean;
}>();

const emit = defineEmits<{
    select: [id: string];
}>();

const statusLabels: Record<ApprovalStatus, string> = {
    pending: "审核中",
    approved: "审核通过",
    rejected: "已驳回",
    cancelled: "已撤销",
};

const formatDate = (value: string) => {
    const date = new Date(value);
    return `${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`;
};
</script>

<style scoped>
.approval-card {
    width: 100%;
    min-width: 0;
    display: grid;
    gap: var(--erp-spacing-12);
    padding: var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    text-align: left;
    cursor: pointer;
    transition: border-color 0.16s ease, background-color 0.16s ease;
}

.approval-card:hover {
    background: var(--erp-color-fill-hover);
}

.approval-card.selected {
    border-color: var(--erp-color-border-brand);
    background: var(--erp-color-fill-nav-selected);
}

.card-heading,
.card-footer,
.summary-row,
.unread-label {
    min-width: 0;
    display: flex;
    align-items: center;
}

.card-heading,
.card-footer {
    justify-content: space-between;
    gap: var(--erp-spacing-8);
}

.card-title {
    min-width: 0;
    overflow: hidden;
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.unread-label {
    flex: 0 0 auto;
    gap: var(--erp-spacing-4);
    color: var(--erp-color-text-status-error);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.unread-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--erp-color-function-red-500);
}

.card-summary {
    min-width: 0;
    display: grid;
    gap: var(--erp-spacing-4);
}

.summary-row {
    gap: var(--erp-spacing-8);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.summary-row > span {
    width: 76px;
    flex: 0 0 76px;
}

.summary-row strong {
    min-width: 0;
    overflow: hidden;
    color: var(--erp-color-text-primary);
    font-weight: var(--erp-typography-content2-font-weight);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.card-footer {
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.status-label {
    color: var(--erp-color-text-status-review);
}

.status-approved {
    color: var(--erp-color-text-status-complete);
}

.status-rejected {
    color: var(--erp-color-text-status-error);
}

.status-cancelled {
    color: var(--erp-color-text-tertiary);
}
</style>
