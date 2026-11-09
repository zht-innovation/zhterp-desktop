<template>
    <Teleport to="body">
        <div class="erp-app erp-dialog-mask" @click.self="emit('close')">
            <ErpDialogFrame
                class="cost-detail-dialog"
                :title="`${productName}的成本`"
                width="1240px"
                height="760px"
                :form="false"
                :show-footer="false"
                @close="emit('close')"
            >
                <div class="cost-detail-body">
                    <div v-if="loading" class="loading-state">加载中...</div>
                    <CostTreeTable v-else-if="costTree" :tree="costTree" />
                    <div v-else class="empty-state">暂无成本数据</div>
                </div>
            </ErpDialogFrame>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import CostTreeTable from "~/components/configuration/finance/CostTreeTable.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import { getCostDetail } from "~/composables/api/useFinanceApi";
import type { FinanceCostTreeNode } from "~~/shared/types/finance";

const props = defineProps<{
    productId: string;
    productName: string;
}>();

const emit = defineEmits<{
    close: [];
}>();

const loading = ref(false);
const costTree = ref<FinanceCostTreeNode | null>(null);

const loadCostDetail = async () => {
    loading.value = true;
    try {
        const res = await getCostDetail(props.productId);
        if (res.code === 200 && res.data) {
            costTree.value = res.data.tree;
        }
    } catch {
        costTree.value = null;
    } finally {
        loading.value = false;
    }
};

onMounted(() => {
    void loadCostDetail();
});
</script>

<style scoped>
.cost-detail-dialog {
    height: 760px;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-dialog);
    background: var(--erp-color-fill-default);
    box-shadow: none;
}

.cost-detail-dialog :deep(.erp-dialog-frame__body) {
    display: block;
    min-height: 0;
    overflow: auto;
    padding: var(--erp-spacing-20);
}

.cost-detail-body {
    min-width: 0;
    min-height: 0;
    height: 100%;
}

.loading-state,
.empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--erp-color-text-placeholder);
    font-size: var(--erp-typography-content1-font-size);
}
</style>
