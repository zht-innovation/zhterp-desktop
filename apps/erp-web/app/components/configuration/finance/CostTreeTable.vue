<template>
    <div class="cost-tree-table">
        <div class="tree-header" :style="{ gridTemplateColumns: columnTemplate }">
            <div class="tree-cell">
                <span class="header-icon-placeholder" />
                <span>级别</span>
            </div>
            <div class="tree-cell">产品编号</div>
            <div class="tree-cell">产品名称</div>
            <div class="tree-cell">数量</div>
            <div class="tree-cell">成本</div>
        </div>

        <div class="tree-body">
            <template v-if="flatNodes.length">
                <div
                    v-for="node in flatNodes"
                    :key="node.productId + '-' + node.level"
                    class="tree-row"
                    :style="{ gridTemplateColumns: columnTemplate }"
                >
                    <div class="tree-cell level-cell">
                        <div
                            class="tree-indent"
                            :style="{ paddingLeft: (node.level - 1) * 28 + 'px' }"
                        >
                            <span
                                v-if="node.level > 1"
                                class="tree-line"
                            />
                            <span
                                v-if="node.hasChildren"
                                class="expand-toggle"
                                @click="toggleExpand(node.productId)"
                            >
                                <Icon
                                    :name="isExpanded(node.productId) ? 'lucide:chevron-down' : 'lucide:chevron-right'"
                                    class="toggle-icon"
                                />
                            </span>
                            <span v-else class="leaf-spacer" />
                            <span class="level-badge">{{ node.level }}级</span>
                        </div>
                    </div>
                    <div class="tree-cell">{{ node.productCode }}</div>
                    <div class="tree-cell">{{ node.productName }}</div>
                    <div class="tree-cell">
                        <span class="quantity-value">{{ formatQuantity(node.quantity) }}</span>
                        <span v-if="node.unitName" class="quantity-unit">{{ node.unitName }}</span>
                    </div>
                    <div class="tree-cell">
                        <span class="cost-value">{{ formatCost(node.cost) }}</span>
                        <span class="cost-unit">人民币</span>
                    </div>
                </div>
            </template>
            <div v-else class="empty-row">
                暂无数据
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { FinanceCostTreeNode } from "~~/shared/types/finance";

const props = defineProps<{
    tree: FinanceCostTreeNode;
}>();

const columnTemplate = "0.8fr 1fr 1fr 0.8fr 1fr";

const expandedSet = ref<Set<string>>(new Set());

interface FlatNode {
    level: number;
    productId: string;
    productCode: string;
    productName: string;
    quantity: number;
    unitName?: string;
    cost: number;
    hasChildren: boolean;
}

// 初始化：展开所有节点
const initExpanded = (node: FinanceCostTreeNode) => {
    if (node.children?.length) {
        expandedSet.value.add(node.productId);
        for (const child of node.children) {
            initExpanded(child);
        }
    }
};

const isExpanded = (productId: string) => expandedSet.value.has(productId);

const toggleExpand = (productId: string) => {
    const newSet = new Set(expandedSet.value);
    if (newSet.has(productId)) {
        newSet.delete(productId);
    } else {
        newSet.add(productId);
    }
    expandedSet.value = newSet;
};

const flattenTree = (node: FinanceCostTreeNode, result: FlatNode[] = []): FlatNode[] => {
    result.push({
        level: node.level,
        productId: node.productId,
        productCode: node.productCode,
        productName: node.circular ? `${node.productName}（循环引用）` : node.productName,
        quantity: node.quantity,
        unitName: node.unitName,
        cost: node.cost,
        hasChildren: Boolean(node.children?.length),
    });

    if (node.children?.length && isExpanded(node.productId)) {
        for (const child of node.children) {
            flattenTree(child, result);
        }
    }

    return result;
};

const flatNodes = computed(() => flattenTree(props.tree));

const formatCost = (cost: number) => {
    if (!cost || cost === 0) return "--";
    return cost.toFixed(2);
};

const formatQuantity = (quantity: number) => {
    const value = Number(quantity);
    if (!Number.isFinite(value)) return "--";
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
};

onMounted(() => {
    initExpanded(props.tree);
});
</script>

<style scoped>
.cost-tree-table {
    min-width: 900px;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    overflow: hidden;
}

.tree-header {
    display: grid;
    align-items: center;
    height: 48px;
    background: var(--erp-color-fill-table-header);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.tree-cell {
    padding: 0 var(--erp-spacing-20);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.header-icon-placeholder {
    display: inline-block;
    width: var(--erp-size-icon-default);
    margin-right: var(--erp-spacing-4);
}

.tree-row {
    display: grid;
    align-items: center;
    min-height: 64px;
    border-bottom: 1px solid var(--erp-color-divider-default);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
    transition: background 0.15s;
}

.tree-row:hover {
    background: var(--erp-color-fill-hover);
}

.tree-row:last-child {
    border-bottom: 0;
}

.level-cell {
    overflow: visible;
}

.tree-indent {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-4);
    position: relative;
}

.tree-line {
    position: absolute;
    left: -14px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--erp-color-border-default);
}

.tree-line::before {
    content: "";
    position: absolute;
    left: 0;
    top: 50%;
    width: 12px;
    height: 1px;
    background: var(--erp-color-border-default);
}

.expand-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    cursor: pointer;
    color: var(--erp-color-icon-secondary);
    transition: color 0.2s;
}

.expand-toggle:hover {
    color: var(--erp-color-icon-brand);
}

.toggle-icon {
    width: 16px;
    height: 16px;
}

.leaf-spacer {
    display: inline-block;
    width: 20px;
}

.level-badge {
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.quantity-value {
    margin-right: var(--erp-spacing-8);
    font-weight: var(--erp-typography-title3-font-weight);
}

.quantity-unit {
    color: var(--erp-color-text-placeholder);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.cost-value {
    margin-right: var(--erp-spacing-8);
    font-weight: var(--erp-typography-title3-font-weight);
}

.cost-unit {
    color: var(--erp-color-text-placeholder);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.empty-row {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 64px;
    color: var(--erp-color-text-placeholder);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}
</style>
