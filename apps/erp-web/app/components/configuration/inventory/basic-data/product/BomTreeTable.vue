<template>
    <div class="bom-tree-table">
        <ErpTableFrame
            class="bom-tree-frame"
            :class="{ 'bom-tree-frame--stock': showAvailableQuantity }"
            :columns="columnTemplate"
            :empty="visibleRows.length === 0"
            empty-text="暂无 BOM 结构数据"
            scroll-x
            embedded
        >
            <template #header>
                <div class="table-row table-head bom-tree-row">
                    <div class="table-cell">级别</div>
                    <div class="table-cell">产品编号</div>
                    <div class="table-cell">型号</div>
                    <div class="table-cell">材质</div>
                    <div class="table-cell">产品图片</div>
                    <div class="table-cell">数量</div>
                    <div v-if="showAvailableQuantity" class="table-cell">库存可用数量</div>
                    <div class="table-cell">单位</div>
                </div>
            </template>

            <div
                v-for="row in visibleRows"
                :key="row.nodeKey"
                class="table-row data-row bom-tree-row"
            >
                <div class="table-cell bom-level-cell">
                    <div class="bom-level-tree">
                        <span
                            v-for="guideLevel in row.throughGuideLevels"
                            :key="`through-${row.nodeKey}-${guideLevel}`"
                            class="bom-guide bom-guide-through"
                            :style="getVerticalGuideStyle(guideLevel)"
                        ></span>

                        <template v-if="row.level > 1">
                            <span
                                class="bom-guide bom-guide-parent"
                                :class="{ 'extends-down': !row.isLastSibling }"
                                :style="getVerticalGuideStyle(row.level - 1)"
                            ></span>
                            <span
                                class="bom-guide bom-guide-horizontal"
                                :style="getHorizontalGuideStyle(row.level)"
                            ></span>
                        </template>

                        <span
                            v-if="row.hasChildren && row.isExpanded"
                            class="bom-guide bom-guide-children"
                            :style="getVerticalGuideStyle(row.level)"
                        ></span>
                        <span
                            class="bom-level-content"
                            :style="{ left: `${getLevelContentLeft(row)}px` }"
                        >
                            <button
                                v-if="row.hasChildren"
                                class="bom-toggle-button"
                                :class="{ expanded: row.isExpanded }"
                                type="button"
                                :aria-label="`${row.isExpanded ? '收起' : '展开'}${row.model}`"
                                @click="toggleNode(row.nodeKey)"
                            >
                                <Icon v-if="row.isExpanded" name="lucide:minus" />
                                <Icon v-else name="lucide:plus" />
                            </button>
                            <span v-else-if="row.level > 1" class="bom-toggle-placeholder"></span>
                            <span class="bom-level-text">{{ row.level }}级</span>
                        </span>
                    </div>
                </div>
                <div class="table-cell">{{ row.productCode || "--" }}</div>
                <div class="table-cell">{{ row.model || "--" }}</div>
                <div class="table-cell">{{ row.material || "--" }}</div>
                <div class="table-cell image-cell">
                    <img
                        v-if="row.image"
                        :src="resolveErpImageUrl(row.image)"
                        :alt="row.model || row.productCode || '产品图片'"
                        class="clickable-image"
                        @click.stop="openImagePreview(row.image, row.model || row.productCode || '产品图片')"
                    >
                    <span v-else>--</span>
                </div>
                <div class="table-cell">{{ formatQuantity(row.quantity) }}</div>
                <div v-if="showAvailableQuantity" class="table-cell">{{ formatQuantity(row.availableQuantity) }}</div>
                <div class="table-cell">{{ row.unitName || row.unit || "--" }}</div>
            </div>
        </ErpTableFrame>

        <ImagePreviewDialog
            v-model="showImagePreview"
            :title="previewTitle"
            :images="previewImages"
        />
    </div>
</template>

<script setup lang="ts">
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";

interface BomTreeNode {
    productCode: string;
    productName?: string;
    model?: string;
    material?: string;
    image?: string;
    quantity?: number | null;
    availableQuantity?: number | null;
    unit?: string;
    unitName?: string;
    children?: BomTreeNode[];
}

interface VisibleBomRow extends BomTreeNode {
    nodeKey: string;
    parentKey: string;
    level: number;
    hasChildren: boolean;
    isExpanded: boolean;
    isLastSibling: boolean;
    throughGuideLevels: number[];
}

const props = defineProps<{
    root: BomTreeNode | null;
    showAvailableQuantity?: boolean;
}>();

const levelColumnWidth = 260;

const columnTemplate = computed(() => [
    `${levelColumnWidth}px`,
    "minmax(190px, 1fr)",
    "minmax(260px, 1.25fr)",
    "140px",
    "140px",
    "140px",
    ...(props.showAvailableQuantity ? ["160px"] : []),
    "140px",
].join(" "));
const levelIndent = 38;
const toggleSize = 18;
const levelContentGap = 10;
const levelTextWidth = 32;
const rootParentKey = "bom";

const expandedNodeKeys = ref<Set<string>>(new Set());
const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");

const openImagePreview = (url: string, title: string) => {
    previewImages.value = [{ url, alt: title }];
    previewTitle.value = title;
    showImagePreview.value = true;
};

const getNodeKey = (parentKey: string, node: BomTreeNode, index: number) =>
    `${parentKey}/${node.productCode || "node"}-${index}`;

const collectExpandableNodeKeys = (
    nodes: BomTreeNode[],
    parentKey: string,
    keys = new Set<string>(),
) => {
    nodes.forEach((node, index) => {
        const nodeKey = getNodeKey(parentKey, node, index);
        const children = node.children || [];

        if (children.length > 0) {
            keys.add(nodeKey);
            collectExpandableNodeKeys(children, nodeKey, keys);
        }
    });

    return keys;
};

watch(
    () => props.root,
    (root) => {
        expandedNodeKeys.value = root ? collectExpandableNodeKeys([root], rootParentKey) : new Set();
    },
    { immediate: true },
);

const visibleRows = computed<VisibleBomRow[]>(() => {
    if (!props.root) {
        return [];
    }

    const rows: VisibleBomRow[] = [];
    const walk = (
        nodes: BomTreeNode[],
        level: number,
        parentKey: string,
        throughGuideLevels: number[],
    ) => {
        nodes.forEach((node, index) => {
            const nodeKey = getNodeKey(parentKey, node, index);
            const children = node.children || [];
            const isExpanded = expandedNodeKeys.value.has(nodeKey);
            const isLastSibling = index === nodes.length - 1;

            rows.push({
                ...node,
                nodeKey,
                parentKey,
                level,
                hasChildren: children.length > 0,
                isExpanded,
                isLastSibling,
                throughGuideLevels,
            });

            if (children.length > 0 && isExpanded) {
                const nextThroughGuideLevels = level > 1 && !isLastSibling
                    ? [...throughGuideLevels, level - 1]
                    : throughGuideLevels;

                walk(children, level + 1, nodeKey, nextThroughGuideLevels);
            }
        });
    };

    walk([props.root], 1, rootParentKey, []);

    return rows;
});

const maxVisibleLevel = computed(() =>
    Math.max(1, ...visibleRows.value.map((row) => row.level)),
);

const visibleLevelTreeWidth = computed(() =>
    (maxVisibleLevel.value - 1) * levelIndent + toggleSize + levelContentGap + levelTextWidth,
);

const visibleLevelTreeStartX = computed(() =>
    Math.max((levelColumnWidth - visibleLevelTreeWidth.value) / 2, 0),
);

const getLevelLeft = (level: number) =>
    visibleLevelTreeStartX.value + (level - 1) * levelIndent;

const getLevelContentLeft = (row: VisibleBomRow) => {
    if (row.level === 1 && !row.hasChildren) {
        return (levelColumnWidth - levelTextWidth) / 2;
    }

    return getLevelLeft(row.level);
};

const getToggleCenterX = (level: number) =>
    getLevelLeft(level) + toggleSize / 2;

const getVerticalGuideStyle = (level: number) => ({
    left: `${getToggleCenterX(level)}px`,
});

const getHorizontalGuideStyle = (level: number) => {
    const parentX = getToggleCenterX(level - 1);
    const currentX = getToggleCenterX(level);

    return {
        left: `${parentX}px`,
        width: `${currentX - parentX}px`,
    };
};

const toggleNode = (nodeKey: string) => {
    const nextExpandedKeys = new Set(expandedNodeKeys.value);

    if (nextExpandedKeys.has(nodeKey)) {
        nextExpandedKeys.delete(nodeKey);
        Array.from(nextExpandedKeys).forEach((key) => {
            if (key.startsWith(`${nodeKey}/`)) {
                nextExpandedKeys.delete(key);
            }
        });
    } else {
        nextExpandedKeys.add(nodeKey);
    }

    expandedNodeKeys.value = nextExpandedKeys;
};

const formatQuantity = (value?: number | null) => {
    if (value === undefined || value === null) {
        return "--";
    }

    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(1) : "--";
};
</script>

<style scoped>
.bom-tree-table {
    width: 100%;
    height: 100%;
    min-height: 0;
}

.bom-tree-frame {
    --bom-tree-width: 1340px;

    height: 100%;
}

.bom-tree-frame--stock {
    --bom-tree-width: 1430px;
}

.bom-tree-table .bom-tree-row {
    width: var(--bom-tree-width);
    min-width: 100%;
}

.image-cell img {
    width: 84px;
    height: 52px;
    object-fit: contain;
}

.clickable-image {
    cursor: pointer;
}

.bom-level-cell {
    position: relative;
    height: 100%;
    justify-content: flex-start;
    padding: 0;
}

.bom-level-tree {
    position: relative;
    width: 100%;
    height: 100%;
}

.bom-level-text {
    min-width: 32px;
    text-align: center;
}

.bom-guide {
    position: absolute;
    z-index: 0;
    display: block;
    background: var(--erp-color-border-brand);
    pointer-events: none;
}

.bom-guide-through {
    top: 0;
    bottom: 0;
    width: 1px;
    transform: translateX(-0.5px);
}

.bom-guide-parent {
    top: 0;
    height: 50%;
    width: 1px;
    transform: translateX(-0.5px);
}

.bom-guide-parent.extends-down {
    height: 100%;
}

.bom-guide-horizontal {
    top: 50%;
    height: 1px;
    transform: translateY(-0.5px);
}

.bom-guide-children {
    top: 50%;
    bottom: 0;
    width: 1px;
    transform: translateX(-0.5px);
}

.bom-level-content {
    position: absolute;
    top: 50%;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: var(--erp-spacing-10);
    transform: translateY(-50%);
}

.bom-toggle-button,
.bom-toggle-placeholder {
    position: relative;
    z-index: 2;
    width: 18px;
    height: 18px;
    box-sizing: border-box;
    flex: 0 0 18px;
}

.bom-toggle-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--erp-color-border-brand);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-icon-brand);
    background: var(--erp-color-fill-default);
    cursor: pointer;
}

.bom-toggle-button :deep(svg) {
    width: 14px;
    height: 14px;
    stroke-width: 2.4;
}
</style>
