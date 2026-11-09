<template>
    <div class="classification-page">
        <header class="topbar">
            <ErpBreadcrumb
                icon="lucide:warehouse"
                :items="classificationBreadcrumbItems"
            />

            <ErpSearchBox v-model="searchText" @search="loadCategories" />
        </header>

        <div class="toolbar">
            <button
                class="primary-button"
                type="button"
                :disabled="isLoading || isSubmitting"
                @click="openCreateCategoryDialog"
            >
                <Icon name="lucide:circle-plus" class="button-icon" />
                <span>新建分类</span>
            </button>
            <button
                class="outline-button danger-button"
                type="button"
                :disabled="isSubmitting || selectedCategoryIds.length === 0"
                @click="batchDeleteCategories"
            >
                <Icon name="lucide:trash-2" class="button-icon" />
                <span>批量删除</span>
            </button>
        </div>

        <ErpTableFrame
            data-inventory-copy-table
            :columns="tableCols"
            :loading="isLoading"
            :empty="visibleCategoryRows.length === 0"
            loading-text="正在加载分类数据..."
            empty-text="暂无匹配分类"
        >
            <template #header>
                <div class="table-row table-head">
                    <div class="table-cell checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                class="row-checkbox"
                                type="checkbox"
                                :checked="allRowsSelected"
                                :disabled="paginatedCategoryRows.length === 0 || isSubmitting"
                                aria-label="选择全部分类"
                                @change="toggleSelectAll"
                            >
                        </label>
                    </div>
                    <div class="table-cell drag-cell">排序</div>
                    <div
                        v-for="column in inventoryCategoryColumns"
                        :key="column.key"
                        class="table-cell"
                    >
                        {{ column.label }}
                    </div>
                </div>
            </template>

            <div
                v-for="row in paginatedCategoryRows"
                :key="row.rowKey"
                class="row-shell"
            >
                <div
                    class="table-row data-row"
                    :class="{
                        'dragging-row': draggingCategoryRowKey === row.rowKey,
                        'drag-over-row': dragOverCategoryRowKey === row.rowKey,
                    }"
                    @dragover.prevent="handleCategoryDragOver(row)"
                    @dragleave="handleCategoryDragLeave(row)"
                    @drop.prevent="handleCategoryDrop(row)"
                    @dragend="handleCategoryDragEnd"
                >
                    <div class="table-cell checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                v-model="selectedCategoryIds"
                                class="row-checkbox"
                                type="checkbox"
                                :value="row.backendId"
                                :disabled="isSubmitting"
                                :aria-label="`选择${row.name}`"
                            >
                        </label>
                    </div>
                    <div class="table-cell drag-cell">
                        <button
                            class="drag-handle"
                            type="button"
                            :disabled="!canDragSortCategories || isSubmitting"
                            :draggable="canDragSortCategories && !isSubmitting"
                            aria-label="拖拽排序"
                            data-icon-tooltip="拖拽排序"
                            @dragstart.stop="handleCategoryDragStart(row, $event)"
                        >
                            <Icon name="lucide:grip-vertical" />
                        </button>
                    </div>
                    <div class="table-cell id-cell">
                        <span>{{ getCategoryDisplayCode(row) }}</span>
                    </div>
                    <div class="table-cell">{{ row.name }}</div>
                    <div class="table-cell">{{ row.updatedAt }}</div>
                    <div class="table-cell actions-cell">
                        <button
                            class="icon-button blue"
                            type="button"
                            :disabled="isSubmitting"
                            :aria-label="`编辑${row.name}`"
                            @click="openEditCategoryDialog(row)"
                        >
                            <Icon name="lucide:square-pen" />
                        </button>
                        <button
                            class="icon-button delete"
                            type="button"
                            :disabled="isSubmitting"
                            :aria-label="`删除${row.name}`"
                            @click="deleteCategory(row)"
                        >
                            <Icon name="lucide:trash-2" />
                        </button>
                    </div>
                </div>
            </div>
        </ErpTableFrame>

        <InventoryPagination
            v-model:page-size="pageSize"
            v-model:jump-page-input="jumpPageInput"
            :total="totalCategoryRows"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="goToPage"
            @jump="jumpToInputPage"
        />

        <div
            v-if="showCategoryDialog"
            class="erp-dialog-mask"
            role="presentation"
            @click.self="closeCategoryDialog"
        >
            <ErpDialogFrame
                :title="categoryDialogTitle"
                :close-disabled="isSubmitting"
                @close="closeCategoryDialog"
                @submit.prevent="submitCategoryDialog"
            >
                <label class="form-row">
                    <span class="field-label">分类编号</span>
                    <input
                        v-model="categoryForm.id"
                        class="dialog-input"
                        :class="{ readonly: categoryDialogMode === 'edit' }"
                        type="text"
                        aria-label="分类编号"
                        placeholder="未填写则自动生成"
                        :readonly="categoryDialogMode === 'edit'"
                    >
                </label>

                <label class="form-row">
                    <span class="field-label required">分类名称</span>
                    <input
                        v-model="categoryForm.name"
                        class="dialog-input"
                        type="text"
                        aria-label="分类名称"
                        required
                    >
                </label>

                <template #footer>
                    <button
                        class="dialog-button cancel"
                        type="button"
                        :disabled="isSubmitting"
                        @click="closeCategoryDialog"
                    >
                        取消
                    </button>
                    <button
                        class="dialog-button confirm"
                        type="submit"
                        :disabled="isSubmitting"
                    >
                        {{ isSubmitting ? "提交中" : "确认" }}
                    </button>
                </template>
            </ErpDialogFrame>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { InventoryCategory as InventoryCategoryEntity } from "~~/shared/types/inventory";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import {
    addInventoryCategory,
    deleteInventoryCategory,
    retrieveInventoryCategoryTree,
    updateInventoryCategory,
} from "~/composables/api/useInventoryApi";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import { erpMessageBox } from "~/utils/erpMessageBox";
definePageMeta({
    layout: "inventory",
});

interface InventoryCategory {
    backendId: string;
    id: string;
    name: string;
    updatedAt: string;
    remark: string;
    sort: number;
}

interface InventoryCategoryColumn {
    key: "id" | "name" | "updatedAt" | "actions";
    label: string;
}

interface VisibleCategoryRow extends InventoryCategory {
    rowKey: string;
    rootIndex: number;
}

type DialogMode = "create" | "edit";

const classificationBreadcrumbItems = [
    { label: "仓储管理" },
    { label: "基础数据" },
    { label: "分类管理" },
];

const inventoryCategoryColumns: InventoryCategoryColumn[] = [
    {
        key: "id",
        label: "分类编号",
    },
    {
        key: "name",
        label: "分类名称",
    },
    {
        key: "updatedAt",
        label: "修改时间",
    },
    {
        key: "actions",
        label: "操作",
    },
];

const tableCols = "58px 48px minmax(170px, 1fr) minmax(240px, 1.45fr) minmax(var(--erp-table-col-date), 1.45fr) var(--erp-table-col-action)";

const searchText = ref("");
const inventoryCategories = ref<InventoryCategory[]>([]);
const selectedCategoryIds = ref<string[]>([]);
const loadedCategoryKeyword = ref("");
const draggingCategoryRow = ref<VisibleCategoryRow | null>(null);
const draggingCategoryRowKey = ref("");
const dragOverCategoryRowKey = ref("");
const {
    pageSizeOptions,
    pageSize,
    pageNumbers,
    totalPages,
    currentPage,
    jumpPageInput,
    setTotalItems,
    getPageItems,
    goToPage,
    jumpToInputPage,
} = useInventoryPagination();
const showCategoryDialog = ref(false);
const isLoading = ref(false);
const isSubmitting = ref(false);
const categoryDialogMode = ref<DialogMode>("create");
const categoryForm = reactive({
    backendId: "",
    rootIndex: 0,
    id: "",
    name: "",
    remark: "",
    sort: 0,
});

const isSearching = computed(() => Boolean(searchText.value.trim()));
const canDragSortCategories = computed(() =>
    !isSearching.value && !loadedCategoryKeyword.value && !isLoading.value && !isSubmitting.value,
);

const categoryMatchesSearch = (category: InventoryCategory, keyword: string) => {
    return [category.id, category.name, category.updatedAt, category.remark].some((value) =>
        value.toLocaleLowerCase().includes(keyword),
    );
};

const filteredCategories = computed(() => {
    const keyword = searchText.value.trim().toLocaleLowerCase();

    if (!keyword) {
        return inventoryCategories.value;
    }

    return inventoryCategories.value.filter((category) => categoryMatchesSearch(category, keyword));
});

const flatVisibleCategoryRows = computed<VisibleCategoryRow[]>(() => {
    return paginatedCategories.value.map((category) => {
        const rootIndex = inventoryCategories.value.findIndex((item) =>
            item.backendId === category.backendId,
        );

        return {
            ...category,
            rowKey: `root-${category.backendId || category.id}-${rootIndex}`,
            rootIndex,
        };
    });
});
const totalCategoryRows = computed(() => filteredCategories.value.length);
const paginatedCategories = computed(() => getPageItems(filteredCategories.value));
const visibleCategoryRows = flatVisibleCategoryRows;
const paginatedCategoryRows = visibleCategoryRows;
const allRowsSelected = computed(() =>
    paginatedCategoryRows.value.length > 0 &&
    paginatedCategoryRows.value.every((row) =>
        row.backendId && selectedCategoryIds.value.includes(row.backendId),
    ),
);

const formatCategorySequence = (index: number) => {
    return String(index + 1).padStart(2, "0");
};

const getCategoryDisplayCode = (row: VisibleCategoryRow) => {
    const rootIndex = inventoryCategories.value.findIndex((category) => category.backendId === row.backendId);

    if (rootIndex < 0) {
        return row.id;
    }

    return `FL${formatCategorySequence(rootIndex)}`;
};

const toggleSelectAll = () => {
    const pageIds = paginatedCategoryRows.value
        .map((row) => row.backendId)
        .filter(Boolean);

    if (allRowsSelected.value) {
        selectedCategoryIds.value = selectedCategoryIds.value.filter((id) => !pageIds.includes(id));
        return;
    }

    selectedCategoryIds.value = [...new Set([...selectedCategoryIds.value, ...pageIds])];
};

const getAllCategoryBackendIds = (categories: InventoryCategory[]): string[] =>
    categories.map((category) => category.backendId).filter(Boolean);

watch(totalCategoryRows, (total) => setTotalItems(total), {
    immediate: true,
});

const findCategoryIndexByBackendId = (
    categories: InventoryCategory[] | undefined,
    backendId: string,
) => {
    return categories?.findIndex((category) => category.backendId === backendId) ?? -1;
};

const reorderCategoryGroup = async (
    categories: InventoryCategory[] | undefined,
    currentIndex: number,
    targetIndex: number,
) => {
    if (!categories?.length) {
        return;
    }

    const [category] = categories.splice(currentIndex, 1);
    categories.splice(targetIndex, 0, category);

    await Promise.all(
        categories.map((item, index) =>
            updateInventoryCategory({
                id: item.backendId,
                sort: index,
            }),
        ),
    );
};

const clearCategoryDragState = () => {
    draggingCategoryRow.value = null;
    draggingCategoryRowKey.value = "";
    dragOverCategoryRowKey.value = "";
};

const handleCategoryDragStart = (row: VisibleCategoryRow, event: DragEvent) => {
    if (!canDragSortCategories.value) {
        event.preventDefault();
        ElMessage.warning("请先清空搜索并加载完整列表后再拖拽排序");
        return;
    }

    if (!row.backendId) {
        event.preventDefault();
        return;
    }

    draggingCategoryRow.value = row;
    draggingCategoryRowKey.value = row.rowKey;
    event.dataTransfer?.setData("text/plain", row.rowKey);

    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
    }
};

const handleCategoryDragOver = (row: VisibleCategoryRow) => {
    const sourceRow = draggingCategoryRow.value;

    if (!sourceRow || sourceRow.rowKey === row.rowKey) {
        dragOverCategoryRowKey.value = "";
        return;
    }

    dragOverCategoryRowKey.value = row.rowKey;
};

const handleCategoryDragLeave = (row: VisibleCategoryRow) => {
    if (dragOverCategoryRowKey.value === row.rowKey) {
        dragOverCategoryRowKey.value = "";
    }
};

const handleCategoryDrop = async (targetRow: VisibleCategoryRow) => {
    const sourceRow = draggingCategoryRow.value;

    if (!sourceRow || sourceRow.rowKey === targetRow.rowKey || isSubmitting.value) {
        clearCategoryDragState();
        return;
    }

    const siblings = inventoryCategories.value;
    const currentIndex = findCategoryIndexByBackendId(siblings, sourceRow.backendId);
    const targetIndex = findCategoryIndexByBackendId(siblings, targetRow.backendId);

    if (!siblings?.length || currentIndex < 0 || targetIndex < 0) {
        clearCategoryDragState();
        return;
    }

    clearCategoryDragState();
    isSubmitting.value = true;
    try {
        await reorderCategoryGroup(siblings, currentIndex, targetIndex);
        ElMessage.success("分类排序已更新");
        await loadCategories(false);
    } catch (err: any) {
        handleApiError(err, "调整分类排序失败");
        await loadCategories(false);
    } finally {
        isSubmitting.value = false;
    }
};

const handleCategoryDragEnd = () => {
    clearCategoryDragState();
};

const deleteCategory = async (row: VisibleCategoryRow) => {
    if (!row.backendId || isSubmitting.value) {
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除分类 ${row.name}`, "删除分类", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const res = await deleteInventoryCategory({ id: row.backendId });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "删除分类失败");
            return;
        }

        ElMessage.success("删除分类成功");
        selectedCategoryIds.value = selectedCategoryIds.value.filter((id) => id !== row.backendId);
        await loadCategories(false);
    } catch (err: any) {
        handleApiError(err, "删除分类失败");
    } finally {
        isSubmitting.value = false;
    }
};

const batchDeleteCategories = async () => {
    const ids = selectedCategoryIds.value.filter(Boolean);

    if (!ids.length || isSubmitting.value) {
        ElMessage.warning("请先选择需要删除的分类");
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除选中的 ${ids.length} 个分类？`, "批量删除分类", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const res = await deleteInventoryCategory({ ids });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "批量删除分类失败");
            return;
        }

        selectedCategoryIds.value = [];
        ElMessage.success("批量删除分类成功");
        await loadCategories(false);
    } catch (err: any) {
        handleApiError(err, "批量删除分类失败");
    } finally {
        isSubmitting.value = false;
    }
};

const formatDateTime = (value?: string | Date) => {
    if (!value) {
        return "--";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    const pad = (item: number) => String(item).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const normalizeCategory = (category: InventoryCategoryEntity): InventoryCategory => ({
    backendId: category._id || "",
    id: category.code || "",
    name: category.name || "",
    updatedAt: formatDateTime(category.updateTime),
    remark: category.remark || "",
    sort: Number(category.sort || 0),
});

const handleApiError = (err: any, fallbackMessage: string) => {
    ElMessage.error(err?.data?.msg || err?.message || fallbackMessage);
};

const loadCategories = async (resetPage = true) => {
    if (isLoading.value) {
        return;
    }

    isLoading.value = true;
    const keyword = searchText.value.trim();
    try {
        const res = await retrieveInventoryCategoryTree({
            keyword: keyword || undefined,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取分类列表失败");
            inventoryCategories.value = [];
            return;
        }

        inventoryCategories.value = Array.isArray(res.data?.tree)
            ? res.data.tree
                .filter((category) => !category.parentId)
                .map(normalizeCategory)
            : [];
        loadedCategoryKeyword.value = keyword;
        const validIds = getAllCategoryBackendIds(inventoryCategories.value);
        selectedCategoryIds.value = selectedCategoryIds.value.filter((id) => validIds.includes(id));

        if (resetPage) {
            goToPage(1);
        } else {
            goToPage(currentPage.value);
        }
    } catch (err: any) {
        inventoryCategories.value = [];
        handleApiError(err, "获取分类列表失败");
    } finally {
        isLoading.value = false;
    }
};

const categoryDialogTitle = computed(() => {
    return categoryDialogMode.value === "create" ? "新建分类" : "编辑分类";
});

const openCreateCategoryDialog = () => {
    categoryDialogMode.value = "create";
    categoryForm.backendId = "";
    categoryForm.rootIndex = 0;
    categoryForm.id = "";
    categoryForm.name = "";
    categoryForm.remark = "";
    categoryForm.sort = inventoryCategories.value.length;
    showCategoryDialog.value = true;
};

const openEditCategoryDialog = (row: VisibleCategoryRow) => {
    categoryDialogMode.value = "edit";
    categoryForm.backendId = row.backendId;
    categoryForm.rootIndex = row.rootIndex;
    categoryForm.id = getCategoryDisplayCode(row);
    categoryForm.name = row.name;
    categoryForm.remark = row.remark;
    categoryForm.sort = row.sort;
    showCategoryDialog.value = true;
};

const closeCategoryDialog = () => {
    if (isSubmitting.value) {
        return;
    }

    showCategoryDialog.value = false;
};

const submitCategoryDialog = async () => {
    const name = categoryForm.name.trim();
    if (!name) {
        ElMessage.warning("请输入分类名称");
        return;
    }

    if (isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    try {
        if (categoryDialogMode.value === "create") {
            const res = await addInventoryCategory({
                code: categoryForm.id.trim(),
                name,
                parentId: null,
                remark: categoryForm.remark,
                sort: categoryForm.sort,
            });

            if (res.code !== 200) {
                ElMessage.error(res.msg || "新增分类失败");
                return;
            }

            ElMessage.success("新增分类成功");
            showCategoryDialog.value = false;
            await loadCategories();
            return;
        }

        const res = await updateInventoryCategory({
            id: categoryForm.backendId,
            name,
            remark: categoryForm.remark,
            sort: categoryForm.sort,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "修改分类失败");
            return;
        }

        ElMessage.success("修改分类成功");
        showCategoryDialog.value = false;
        await loadCategories(false);
    } catch (err: any) {
        handleApiError(err, categoryDialogMode.value === "create" ? "新增分类失败" : "修改分类失败");
    } finally {
        isSubmitting.value = false;
    }
};

watch(pageSize, () => {
    goToPage(1);
});

watch(searchText, (value) => {
    goToPage(1);

    if (!value.trim() && loadedCategoryKeyword.value && !isLoading.value) {
        loadCategories(false);
    }
});

onMounted(() => {
    loadCategories();
});
</script>

<style scoped>
.classification-page {
    height: 100%;
    display: grid;
    grid-template-rows: 40px 32px minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-container-gap);
    color: var(--erp-color-text-primary);
}

button,
input {
    font: inherit;
}

.topbar,
.toolbar {
    display: flex;
    align-items: center;
}

.topbar {
    justify-content: space-between;
}

.primary-button {
    border: 0;
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
    cursor: pointer;
}

.primary-button:not(:disabled):active {
    background: var(--erp-color-action-primary-pressed);
}

.toolbar {
    justify-content: flex-start;
    gap: 12px;
}

.primary-button,
.outline-button {
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
}

.outline-button {
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
    cursor: pointer;
}

.danger-button {
    border-color: var(--erp-color-border-error);
    color: var(--erp-color-text-status-error);
}

.danger-button:not(:disabled):hover {
    background: var(--erp-color-bg-status-error);
}

button:disabled,
input:disabled {
    cursor: not-allowed;
}

.primary-button:disabled {
    border-color: var(--erp-color-border-muted);
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

.outline-button:disabled {
    border-color: var(--erp-color-border-muted);
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

.danger-button:disabled {
    border-color: color-mix(in srgb, var(--erp-color-border-error) 70%, transparent);
    color: color-mix(in srgb, var(--erp-color-text-status-error) 70%, transparent);
    background: var(--erp-color-fill-default);
}

.button-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.row-shell {
    box-sizing: border-box;
    width: 100%;
}

.drag-handle :deep(svg) {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.id-cell {
    justify-content: center;
}

.icon-button :deep(svg) {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

@media (max-width: 1200px) {
    .classification-page {
        min-width: 760px;
    }
}
</style>
