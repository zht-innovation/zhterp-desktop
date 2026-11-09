<template>
    <div class="erp-dialog-mask inventory-draft-panel" role="presentation" @click.self="emit('close')">
        <ErpDialogFrame title="草稿箱" width="600px" @close="emit('close')">
            <div class="draft-list">
                <div v-if="drafts.length === 0" class="draft-empty">暂无草稿</div>
                <div v-else class="draft-items">
                    <div v-for="draft in drafts" :key="draft.id" class="draft-item">
                        <div class="draft-info">
                            <div class="draft-title">{{ draft.title }}</div>
                            <div class="draft-time">
                                <Icon name="material-symbols:schedule" class="draft-time-icon" />
                                <span>{{ formatInventoryDraftTime(draft.updatedAt) }}</span>
                            </div>
                        </div>
                        <div class="draft-actions">
                            <button class="draft-action apply" type="button" @click="emit('apply', draft)">
                                <Icon name="material-symbols:check-circle-outline" />
                                <span>使用</span>
                            </button>
                            <button class="draft-action remove" type="button" @click="emit('remove', draft.id)">
                                <Icon name="material-symbols:delete-outline" />
                                <span>删除</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <template #footer>
                <button class="dialog-button cancel" type="button" @click="emit('close')">关闭</button>
            </template>
        </ErpDialogFrame>
    </div>
</template>

<script setup lang="ts">
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import {
    formatInventoryDraftTime,
    type InventoryDraftRecord,
} from "~/composables/inventory/useInventoryDraftStorage";

defineProps<{
    drafts: InventoryDraftRecord[];
}>();

const emit = defineEmits<{
    close: [];
    apply: [draft: InventoryDraftRecord];
    remove: [id: string];
}>();
</script>

<style scoped>
.inventory-draft-panel {
    z-index: 120;
}

.draft-item,
.draft-time,
.draft-actions,
.draft-action {
    display: flex;
    align-items: center;
}

.draft-list {
    padding: var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-control-secondary);
}

.draft-items {
    display: flex;
    flex-direction: column;
    gap: var(--erp-spacing-12);
}

.draft-item {
    justify-content: space-between;
    gap: var(--erp-spacing-12);
    padding: var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.draft-info {
    min-width: 0;
}

.draft-title {
    overflow: hidden;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.draft-time {
    gap: var(--erp-spacing-4);
    margin-top: var(--erp-spacing-4);
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.draft-actions {
    flex-shrink: 0;
    gap: var(--erp-spacing-8);
}

.draft-action {
    gap: var(--erp-spacing-4);
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
    cursor: pointer;
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
}

.draft-action.apply {
    border-color: var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.draft-action.remove:hover {
    border-color: var(--erp-color-border-error);
    color: var(--erp-color-text-status-error);
}

.draft-empty {
    padding: var(--erp-spacing-24) 0;
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    text-align: center;
}
</style>
