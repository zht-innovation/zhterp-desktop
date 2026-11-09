<template>
    <div class="finance-cost-page">
        <header class="topbar">
            <ErpBreadcrumb icon="lucide:calculator" :items="costBreadcrumbItems" />
            <ErpSearchBox
                v-model="searchText"
                :disabled="loading"
                placeholder="搜索产品编号或型号"
                @search="applySearch"
            />
        </header>

        <nav class="tab-bar">
            <div
                class="tab-active-wrap"
                :class="{ active: activeTab === 'accessory' }"
            >
                <button
                    class="tab-item"
                    type="button"
                    @click="switchTab('accessory')"
                >
                    <Icon name="lucide:package" class="tab-icon" />
                    <span>原料资产与单价低表</span>
                </button>
            </div>
            <div
                class="tab-active-wrap"
                :class="{ active: activeTab === 'machine' }"
            >
                <button
                    class="tab-item"
                    type="button"
                    @click="switchTab('machine')"
                >
                    <Icon name="lucide:boxes" class="tab-icon" />
                    <span>整机与组装件标准成本</span>
                </button>
            </div>
        </nav>

        <div class="filter-row">
            <label class="filter-field">
                <span>分类</span>
                <select v-model="categoryFilter" class="filter-select">
                    <option value="">请选择</option>
                    <option
                        v-for="cat in categoryOptions"
                        :key="cat.value"
                        :value="cat.value"
                    >
                        {{ cat.label }}
                    </option>
                </select>
            </label>
            <label v-if="activeTab === 'machine'" class="filter-field">
                <span>来源</span>
                <select v-model="sourceFilter" class="filter-select">
                    <option value="">请选择</option>
                    <option value="自组装">自组装</option>
                    <option value="外包组装">外包组装</option>
                </select>
            </label>
            <div class="filter-actions">
                <button class="reset-button" type="button" @click="resetFilters">
                    <Icon name="lucide:refresh-cw" class="button-icon" />
                    <span>重置</span>
                </button>
                <button
                    class="filter-button"
                    :class="{ active: hasPendingFilters }"
                    type="button"
                    @click="applyFilters"
                >
                    <Icon name="lucide:sliders-horizontal" class="button-icon" />
                    <span>筛选</span>
                </button>
            </div>
        </div>

        <!-- ==================== 原料资产与单价低表 ==================== -->
        <section v-if="activeTab === 'accessory'" class="table-wrap">
            <ErpTableFrame
                :columns="accessoryCostTableColumnTemplate"
                :minimum-width="accessoryCostTableMinimumWidth"
                :loading="loading"
                :empty="accessoryItems.length === 0"
                loading-text="加载中..."
                empty-text="暂无匹配数据"
                scroll-x
            >
                <template #header>
                    <div class="table-row table-head">
                    <div class="selection-head checkbox-cell cost-selection-cell">
                        <input
                            type="checkbox"
                            class="row-checkbox"
                            :checked="isAllAccessorySelected"
                            @change="toggleAllAccessory"
                        >
                    </div>
                    <div v-for="column in accessoryCostColumns" :key="column.key" class="table-cell">
                        <span>{{ column.label }}</span>
                        <button
                            v-if="column.key === 'standardPrice'"
                            class="sync-settings-button"
                            type="button"
                            aria-label="设置标准价同步时间"
                            title="设置标准价同步时间"
                            @click.stop="showStandardPriceSyncDialog = true"
                        >
                            <Icon name="lucide:circle-help" />
                        </button>
                    </div>
                    <div class="action-head erp-table-fixed-end">操作</div>
                </div>
                </template>

                <div
                    v-for="item in accessoryItems"
                    :key="item._id"
                    class="table-row data-row"
                >
                    <div class="selection-row checkbox-cell cost-selection-cell">
                        <input
                            v-model="selectedAccessoryIds"
                            type="checkbox"
                            class="row-checkbox"
                            :value="item._id"
                        >
                    </div>
                    <div class="table-cell">{{ item.code }}</div>
                    <div class="table-cell">{{ item.model || '--' }}</div>
                    <div class="table-cell">{{ item.categoryName || '--' }}</div>
                    <div class="table-cell image-cell">
                        <img
                            v-if="item.image"
                            :src="resolveErpImageUrl(item.image)"
                            :alt="item.name"
                            class="clickable-image"
                            @click.stop="openImagePreview(item.image, item.model || item.code)"
                        >
                        <span v-else>--</span>
                    </div>
                    <div class="table-cell">
                        <span class="cell-bold">{{ item.availableQuantity ?? '--' }}</span>
                        <span class="cell-unit" v-if="item.unitName">{{ item.unitName }}</span>
                    </div>
                    <div class="table-cell">
                        <span class="cell-bold">{{ item.lockedQuantity ?? '--' }}</span>
                        <span class="cell-unit" v-if="item.unitName">{{ item.unitName }}</span>
                    </div>
                    <div class="table-cell">
                        <span class="cell-bold">{{ formatPrice(item.standardPrice) }}</span>
                        <span class="cell-unit">人民币</span>
                    </div>
                    <div class="table-cell">
                        <span class="cell-bold">{{ formatAveragePrice(item.averagePrice) }}</span>
                        <span class="cell-unit">人民币</span>
                    </div>
                    <div class="action-row erp-table-fixed-end">
                        <button class="action-link" type="button" @click="editStandardPrice(item)">
                            编辑标准价
                        </button>
                    </div>
                </div>

            </ErpTableFrame>
        </section>

        <!-- ==================== 整机与组装件标准成本 ==================== -->
        <section v-if="activeTab === 'machine'" class="table-wrap">
            <ErpTableFrame
                :columns="machineCostTableColumnTemplate"
                :minimum-width="machineCostTableMinimumWidth"
                :loading="loading"
                :empty="machineItems.length === 0"
                loading-text="加载中..."
                empty-text="暂无匹配数据"
                scroll-x
            >
                <template #header>
                    <div class="table-row table-head">
                    <div class="selection-head checkbox-cell cost-selection-cell">
                        <input
                            type="checkbox"
                            class="row-checkbox"
                            :checked="isAllMachineSelected"
                            @change="toggleAllMachine"
                        >
                    </div>
                    <div v-for="column in machineCostColumns" :key="column.key" class="table-cell">
                        {{ column.label }}
                    </div>
                    <div class="action-head erp-table-fixed-end">操作</div>
                </div>
                </template>

                <div
                    v-for="item in machineItems"
                    :key="item._id"
                    class="table-row data-row"
                >
                    <div class="selection-row checkbox-cell cost-selection-cell">
                        <input
                            v-model="selectedMachineIds"
                            type="checkbox"
                            class="row-checkbox"
                            :value="item._id"
                        >
                    </div>
                    <div class="table-cell">{{ item.code }}</div>
                    <div class="table-cell">{{ item.model || '--' }}</div>
                    <div class="table-cell">{{ item.categoryName || '--' }}</div>
                    <div class="table-cell image-cell">
                        <img
                            v-if="item.image"
                            :src="resolveErpImageUrl(item.image)"
                            :alt="item.name"
                            class="clickable-image"
                            @click.stop="openImagePreview(item.image, item.model || item.code)"
                        >
                        <span v-else>--</span>
                    </div>
                    <div class="table-cell">{{ item.source || '--' }}</div>
                    <div class="table-cell">
                        <span class="cell-bold">{{ item.availableQuantity ?? '--' }}</span>
                        <span class="cell-unit" v-if="item.unitName">{{ item.unitName }}</span>
                    </div>
                    <div class="table-cell">
                        <span class="cell-bold">{{ item.lockedQuantity ?? '--' }}</span>
                        <span class="cell-unit" v-if="item.unitName">{{ item.unitName }}</span>
                    </div>
                    <div class="table-cell">
                        <span class="cell-bold">{{ formatCost(item.bomCost) }}</span>
                        <span class="cell-unit">人民币</span>
                    </div>
                    <div class="action-row erp-table-fixed-end">
                        <button class="action-link" type="button" @click="openCostDetail(item)">
                            查看成本详情
                        </button>
                    </div>
                </div>

            </ErpTableFrame>
        </section>

        <InventoryPagination
            v-model:page-size="pageSize"
            v-model:jump-page-input="jumpPageInput"
            :total="totalItems"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="handlePageChange"
            @jump="handleJumpPage"
        />

        <CostDetailDialog
            v-if="showDetailDialog"
            :product-id="selectedProductId"
            :product-name="selectedProductName"
            @close="showDetailDialog = false"
        />

        <StandardPriceSyncDialog
            v-if="showStandardPriceSyncDialog"
            @close="showStandardPriceSyncDialog = false"
            @saved="loadData"
        />

        <ImagePreviewDialog
            v-model="showImagePreview"
            :title="previewTitle"
            :images="previewImages"
        />
    </div>
</template>

<script setup lang="ts">
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import CostDetailDialog from "~/components/configuration/finance/CostDetailDialog.vue";
import StandardPriceSyncDialog from "~/components/configuration/finance/StandardPriceSyncDialog.vue";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import { retrieveAccessoryCost, retrieveMachineCost, updateStandardPrice } from "~/composables/api/useFinanceApi";
import { retrieveInventoryCategoryTree } from "~/composables/api/useInventoryApi";
import {
    getErpTableGridColumn,
    getErpTableMinimumWidth,
} from "~/utils/inventory/erpTableColumns";
import { erpMessageBox } from "~/utils/erpMessageBox";
import type { FinanceAccessoryCostItem, FinanceMachineCostItem } from "~~/shared/types/finance";

definePageMeta({
    layout: "finance",
});

const {
    pageSizeOptions,
    pageSize,
    pageNumbers,
    totalPages,
    currentPage,
    jumpPageInput,
    totalItems,
    setTotalItems,
    goToPage,
    jumpToInputPage,
} = useInventoryPagination({ pageSizeOptions: [20, 50, 100], initialPageSize: 20 });

// ── Tab ──
const activeTab = ref<"accessory" | "machine">("accessory");

interface CostColumn {
    key: string;
    label: string;
    width: number;
    grow?: boolean;
}

const costBreadcrumbItems = [
    { label: "财务管理" },
    { label: "成本核算" },
];
const costSelectionColumn = { width: 58 };
const costActionColumn = { width: 150, widthVar: "--erp-table-col-action" };
const accessoryCostColumns: CostColumn[] = [
    { key: "code", label: "产品编号", width: 150, grow: true },
    { key: "model", label: "型号", width: 180, grow: true },
    { key: "category", label: "分类", width: 140 },
    { key: "image", label: "产品图片", width: 120 },
    { key: "availableQuantity", label: "可用数量", width: 150 },
    { key: "lockedQuantity", label: "锁定数量", width: 150 },
    { key: "standardPrice", label: "标准价", width: 180 },
    { key: "averagePrice", label: "最新平均价", width: 180 },
];
const machineCostColumns: CostColumn[] = [
    { key: "code", label: "产品编号", width: 150, grow: true },
    { key: "model", label: "型号", width: 180, grow: true },
    { key: "category", label: "分类", width: 140 },
    { key: "image", label: "产品图片", width: 120 },
    { key: "source", label: "来源", width: 150 },
    { key: "availableQuantity", label: "可用数量", width: 150 },
    { key: "lockedQuantity", label: "锁定数量", width: 150 },
    { key: "bomCost", label: "材料总成本", width: 180 },
];
const createCostTableColumns = (columns: CostColumn[]) => [
    getErpTableGridColumn(costSelectionColumn),
    ...columns.map(getErpTableGridColumn),
    getErpTableGridColumn(costActionColumn),
].join(" ");
const createCostTableMinimumWidth = (columns: CostColumn[]) => getErpTableMinimumWidth(
    columns,
    [getErpTableGridColumn(costSelectionColumn)],
    [getErpTableGridColumn(costActionColumn)],
);
const accessoryCostTableColumnTemplate = createCostTableColumns(accessoryCostColumns);
const accessoryCostTableMinimumWidth = createCostTableMinimumWidth(accessoryCostColumns);
const machineCostTableColumnTemplate = createCostTableColumns(machineCostColumns);
const machineCostTableMinimumWidth = createCostTableMinimumWidth(machineCostColumns);

// ── 筛选状态 ──
const searchText = ref("");
const categoryFilter = ref("");
const sourceFilter = ref("");
const appliedKeyword = ref("");
const appliedCategory = ref("");
const appliedSource = ref("");
const loading = ref(false);
const categoryOptions = ref<Array<{ value: string; label: string }>>([]);

// 加载分类选项
const loadCategories = async () => {
    try {
        const res = await retrieveInventoryCategoryTree();
        if (res.code === 200 && Array.isArray(res.data?.tree)) {
            const flat: Array<{ value: string; label: string }> = [];
            const walk = (nodes: any[], prefix = "") => {
                for (const node of nodes) {
                    const label = prefix ? `${prefix} / ${node.name}` : node.name;
                    const categoryId = String(node._id || "").trim();
                    if (categoryId) {
                        flat.push({ value: categoryId, label });
                    }
                    if (node.children?.length) walk(node.children, label);
                }
            };
            walk(res.data.tree);
            categoryOptions.value = flat;
        }
    } catch {
        // 静默失败，下拉保持空
    }
};

// ── 原料表数据 ──
const accessoryItems = ref<FinanceAccessoryCostItem[]>([]);
const selectedAccessoryIds = ref<string[]>([]);

// ── 整机表数据 ──
const machineItems = ref<FinanceMachineCostItem[]>([]);
const selectedMachineIds = ref<string[]>([]);

// ── 成本明细弹窗 ──
const showDetailDialog = ref(false);
const selectedProductId = ref("");
const selectedProductName = ref("");
const showStandardPriceSyncDialog = ref(false);

// ── 产品图片预览 ──
const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");

// ── 计算属性 ──
const isAllAccessorySelected = computed(() =>
    accessoryItems.value.length > 0 && accessoryItems.value.every((i) => selectedAccessoryIds.value.includes(i._id)),
);
const isAllMachineSelected = computed(() =>
    machineItems.value.length > 0 && machineItems.value.every((i) => selectedMachineIds.value.includes(i._id)),
);
const hasPendingFilters = computed(() =>
    searchText.value.trim() !== appliedKeyword.value ||
    categoryFilter.value !== appliedCategory.value ||
    sourceFilter.value !== appliedSource.value,
);

const formatPrice = (v?: number) => v == null ? "--" : v.toLocaleString("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
});
const formatAveragePrice = (v?: number) => v == null ? "--" : v.toLocaleString("zh-CN", {
    useGrouping: false,
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
});
const formatCost = (v?: number) => (v == null || v === 0 ? "--" : v.toFixed(2));

const toggleAllAccessory = () => {
    selectedAccessoryIds.value = isAllAccessorySelected.value ? [] : accessoryItems.value.map((i) => i._id);
};
const toggleAllMachine = () => {
    selectedMachineIds.value = isAllMachineSelected.value ? [] : machineItems.value.map((i) => i._id);
};

// ── Tab 切换 ──
const switchTab = (tab: "accessory" | "machine") => {
    if (activeTab.value === tab) return;
    activeTab.value = tab;
    goToPage(1);
    searchText.value = "";
    categoryFilter.value = "";
    sourceFilter.value = "";
    appliedKeyword.value = "";
    appliedCategory.value = "";
    appliedSource.value = "";
    void loadData();
};

// ── 数据加载 ──
const loadData = async () => {
    loading.value = true;
    try {
        if (activeTab.value === "accessory") {
            const res = await retrieveAccessoryCost({
                keyword: appliedKeyword.value || undefined,
                category: appliedCategory.value || undefined,
                page: currentPage.value,
                limit: pageSize.value,
            });
            accessoryItems.value = res.code === 200 && res.data ? res.data.list : [];
            setTotalItems(res.data?.pagination?.total ?? 0);
        } else {
            const res = await retrieveMachineCost({
                keyword: appliedKeyword.value || undefined,
                category: appliedCategory.value || undefined,
                source: appliedSource.value || undefined,
                page: currentPage.value,
                limit: pageSize.value,
            });
            machineItems.value = res.code === 200 && res.data ? res.data.list : [];
            setTotalItems(res.data?.pagination?.total ?? 0);
        }
    } catch {
        accessoryItems.value = [];
        machineItems.value = [];
        setTotalItems(0);
    } finally {
        loading.value = false;
    }
};

// ── 筛选操作 ──
const applySearch = () => {
    appliedKeyword.value = searchText.value;
    appliedCategory.value = categoryFilter.value;
    appliedSource.value = sourceFilter.value;
    goToPage(1);
    void loadData();
};
const applyFilters = () => {
    appliedKeyword.value = searchText.value;
    appliedCategory.value = categoryFilter.value;
    appliedSource.value = sourceFilter.value;
    goToPage(1);
    void loadData();
};
const resetFilters = () => {
    searchText.value = "";
    categoryFilter.value = "";
    sourceFilter.value = "";
    appliedKeyword.value = "";
    appliedCategory.value = "";
    appliedSource.value = "";
    goToPage(1);
    void loadData();
};

// ── 操作 ──
const editStandardPrice = async (item: FinanceAccessoryCostItem) => {
    try {
        const { value } = await erpMessageBox.prompt(
            `请输入 ${item.name} 的新标准价`,
            "编辑标准价",
            {
                confirmButtonText: "确定",
                cancelButtonText: "取消",
                inputValue: String(item.standardPrice ?? 0),
                inputPattern: /^\d+(\.\d{1,3})?$/,
                inputErrorMessage: "请输入有效的价格（最多三位小数）",
            },
        );
        const newPrice = Number(value);
        const res = await updateStandardPrice(item._id, newPrice);
        if (res.code === 200) {
            ElMessage.success("标准价更新成功");
            void loadData();
        } else {
            ElMessage.error(res.msg || "更新失败");
        }
    } catch {
        // 用户取消
    }
};
const openCostDetail = (item: FinanceMachineCostItem) => {
    selectedProductId.value = item._id;
    selectedProductName.value = item.name;
    showDetailDialog.value = true;
};
const openImagePreview = (url: string, title: string) => {
    previewImages.value = [{ url, alt: title }];
    previewTitle.value = title;
    showImagePreview.value = true;
};

// ── 分页 ──
const handlePageChange = (page: number) => { goToPage(page); void loadData(); };
const handleJumpPage = () => { jumpToInputPage(); void loadData(); };
watch(pageSize, () => { goToPage(1); void loadData(); });
onMounted(() => {
    void loadData();
    void loadCategories();
});
</script>

<style scoped>
.finance-cost-page {
    height: 100%;
    display: grid;
    grid-template-rows: 40px 52px 32px minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-container-gap);
    color: var(--erp-color-text-primary);
}

.finance-cost-page .topbar,
.finance-cost-page .filter-row,
.finance-cost-page .filter-actions {
    display: flex;
    align-items: center;
}

.finance-cost-page .topbar {
    justify-content: space-between;
}

.finance-cost-page .tab-bar {
    height: 52px;
    display: flex;
    align-items: stretch;
    gap: var(--erp-spacing-20);
    padding: 0 var(--erp-spacing-20);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.finance-cost-page .tab-active-wrap {
    height: 100%;
    display: flex;
    align-items: center;
    border-bottom: 2px solid transparent;
}

.finance-cost-page .tab-active-wrap.active {
    border-bottom-color: var(--erp-color-action-primary);
}

.finance-cost-page .tab-item {
    display: inline-flex;
    align-items: center;
    gap: var(--erp-spacing-8);
    padding: 0;
    border: 0;
    border-radius: 0;
    color: var(--erp-color-text-secondary);
    background: transparent;
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
}

.finance-cost-page .tab-active-wrap.active .tab-item {
    color: var(--erp-color-text-brand);
}

.finance-cost-page .tab-item:hover {
    color: var(--erp-color-text-primary);
}

.finance-cost-page .tab-icon,
.finance-cost-page .button-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.finance-cost-page .filter-row {
    gap: var(--erp-spacing-12);
}

.finance-cost-page .filter-field {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.finance-cost-page .filter-field > span {
    white-space: nowrap;
}

.finance-cost-page .filter-select {
    width: 200px;
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
}

.finance-cost-page .filter-select:focus {
    border-color: var(--erp-color-border-brand);
}

.finance-cost-page .filter-actions {
    gap: var(--erp-spacing-12);
    margin-left: auto;
}

.finance-cost-page .reset-button,
.finance-cost-page .filter-button {
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
    cursor: pointer;
}

.finance-cost-page .reset-button {
    border: 1px solid var(--erp-color-border-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
}

.finance-cost-page .reset-button:not(:disabled):hover {
    border-color: var(--erp-color-border-brand);
    color: var(--erp-color-text-brand);
}

.finance-cost-page .filter-button {
    border: 0;
    color: var(--erp-color-text-white);
    background: var(--erp-color-neutral-400);
}

.finance-cost-page .filter-button.active {
    background: var(--erp-color-action-primary);
}

.finance-cost-page .filter-button:not(:disabled):hover {
    background: var(--erp-color-action-primary);
}

.finance-cost-page .table-wrap {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}

.finance-cost-page .cost-selection-cell,
.finance-cost-page .action-head,
.finance-cost-page .action-row {
    position: sticky;
    z-index: 5;
}

.finance-cost-page .cost-selection-cell {
    left: 0;
}

.finance-cost-page .action-head,
.finance-cost-page .action-row {
    right: 0;
}

.finance-cost-page .selection-head,
.finance-cost-page .selection-row,
.finance-cost-page .action-head,
.finance-cost-page .action-row {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: inherit;
}

.finance-cost-page .selection-head,
.finance-cost-page .action-head {
    background: var(--erp-color-fill-table-header);
}

.finance-cost-page .selection-row,
.finance-cost-page .action-row {
    background: var(--erp-color-fill-default);
}

.finance-cost-page .data-row:hover .selection-row,
.finance-cost-page .data-row:hover .action-row {
    background: var(--erp-color-fill-hover);
}

.finance-cost-page .row-checkbox {
    cursor: pointer;
}

.finance-cost-page .table-cell {
    overflow: hidden;
    text-overflow: ellipsis;
}

.finance-cost-page .image-cell img {
    width: 40px;
    height: 40px;
    border-radius: var(--erp-radius-control-default);
    object-fit: cover;
}

.finance-cost-page .clickable-image {
    cursor: pointer;
}

.finance-cost-page .cell-bold {
    margin-right: var(--erp-spacing-8);
    font-weight: var(--erp-typography-title3-font-weight);
}

.finance-cost-page .sync-settings-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    margin-left: 4px;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-secondary);
    background: transparent;
    vertical-align: middle;
    cursor: pointer;
}

.finance-cost-page .sync-settings-button:hover {
    color: var(--erp-color-text-brand);
}

.finance-cost-page .sync-settings-button :deep(svg) {
    width: 16px;
    height: 16px;
}

.finance-cost-page .cell-unit {
    font-weight: var(--erp-typography-content1-font-weight);
}

.finance-cost-page .action-link {
    padding: 0;
    border: 0;
    color: var(--erp-color-text-brand);
    background: transparent;
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
}

.finance-cost-page .action-link:not(:disabled):hover {
    opacity: 0.8;
}

.finance-cost-page :deep(.erp-table-frame) {
    height: 100%;
}
</style>
