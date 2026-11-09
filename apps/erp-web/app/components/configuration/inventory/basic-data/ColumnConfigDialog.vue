<template>
    <div class="erp-dialog-mask" role="presentation" @click.self="emit('close')">
        <ErpDialogFrame
            title="配置列"
            width="600px"
            height="620px"
            @close="emit('close')"
            @submit.prevent="emit('confirm')"
        >
            <ErpTableFrame
                class="column-config-table"
                columns="46px 120px minmax(0, 1fr) 78px"
                :empty="columnConfigs.length === 0"
                empty-text="暂无可配置列"
                embedded
            >
                <template #header>
                    <div class="table-row table-head">
                        <div class="table-cell checkbox-cell">
                            <label class="checkbox-control">
                                <input
                                    class="row-checkbox"
                                    type="checkbox"
                                    :checked="allColumnsVisible"
                                    aria-label="显示全部列"
                                    @change="emit('toggle-all-visible')"
                                >
                            </label>
                        </div>
                        <div class="table-cell">锁定</div>
                        <div class="table-cell">列名</div>
                        <div class="table-cell drag-cell">排序</div>
                    </div>
                </template>

                <div
                    v-for="config in columnConfigs"
                    :key="config.key"
                    class="table-row data-row column-config-row"
                    draggable="true"
                    @dragstart="emit('drag-start', config.key)"
                    @dragover.prevent
                    @drop.prevent="emit('drop', config.key)"
                >
                    <div class="table-cell checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                class="row-checkbox"
                                type="checkbox"
                                :checked="config.visible"
                                :aria-label="`显示${config.label}`"
                                @change="emit('toggle-visible', config.key)"
                            >
                        </label>
                    </div>
                    <button
                        class="icon-button lock-button"
                        :class="{ active: config.locked }"
                        type="button"
                        :aria-label="`${config.locked ? '取消锁定' : '锁定'}${config.label}`"
                        @click="emit('toggle-locked', config.key)"
                    >
                        <Icon :name="config.locked ? 'lucide:lock' : 'lucide:lock-open'" />
                    </button>
                    <div class="table-cell">{{ config.label }}</div>
                    <button
                        class="drag-handle"
                        type="button"
                        draggable="true"
                        :aria-label="`拖动${config.label}`"
                        @dragstart="emit('drag-start', config.key)"
                    >
                        <Icon name="lucide:menu" />
                    </button>
                </div>
            </ErpTableFrame>

            <template #footer>
                <button class="dialog-button cancel" type="button" @click="emit('close')">
                    取消
                </button>
                <button class="dialog-button confirm" type="submit">
                    确认
                </button>
            </template>
        </ErpDialogFrame>
    </div>
</template>

<script setup lang="ts">
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";

interface ColumnConfig {
    key: string;
    label: string;
    width: number;
    visible: boolean;
    locked: boolean;
}

defineProps<{
    columnConfigs: ColumnConfig[];
    allColumnsVisible: boolean;
}>();

const emit = defineEmits<{
    close: [];
    confirm: [];
    "toggle-all-visible": [];
    "toggle-visible": [columnKey: string];
    "toggle-locked": [columnKey: string];
    "drag-start": [columnKey: string];
    drop: [columnKey: string];
}>();
</script>

<style scoped>
.column-config-table {
    height: 100%;
    min-height: 0;
}

.column-config-row {
    color: var(--erp-color-text-primary);
}

.lock-button {
    justify-self: center;
    color: var(--erp-color-icon-secondary);
}

.lock-button.active,
.column-config-table .drag-handle {
    color: var(--erp-color-icon-brand);
}
</style>
