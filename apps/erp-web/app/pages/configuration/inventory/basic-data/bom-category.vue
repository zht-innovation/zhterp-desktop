<template>
    <div class="bom-category-page">
        <header class="topbar">
            <div class="breadcrumb">
                <Icon name="lucide:layers-3" class="breadcrumb-icon" />
                <span class="breadcrumb-main">基本数据</span>
                <Icon name="lucide:chevron-right" class="breadcrumb-separator" />
                <span class="breadcrumb-current">BOM类别</span>
            </div>

            <form class="search-box" @submit.prevent="loadCategories">
                <Icon name="lucide:search" class="search-icon" />
                <input
                    v-model="searchText"
                    class="search-input"
                    type="search"
                    placeholder="输入你想要寻找的内容"
                    aria-label="搜索BOM类别"
                >
                <button class="search-button" type="submit">搜索</button>
            </form>
        </header>

        <div class="toolbar">
            <button
                class="primary-button"
                type="button"
                :disabled="isLoading || isSubmitting"
                @click="openCreateCategoryDialog"
            >
                <Icon name="lucide:circle-plus" class="button-icon" />
                <span>新建BOM类别</span>
            </button>
            <button
                class="outline-button"
                type="button"
                :disabled="isLoading"
                @click="expandAllCategories"
            >
                <Icon name="lucide:chevrons-down" class="button-icon" />
                <span>全部展开</span>
            </button>
            <button
                class="outline-button"
                type="button"
                :disabled="isLoading"
                @click="collapseAllCategories"
            >
                <Icon name="lucide:chevrons-up" class="button-icon" />
                <span>全部折叠</span>
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

        <section class="table-wrap" data-inventory-copy-table aria-label="BOM类别列表">
            <div class="table-row table-head">
                <div class="table-cell checkbox-cell">
                    <input
                        class="row-checkbox"
                        type="checkbox"
                        :checked="allRowsSelected"
                        :disabled="paginatedCategoryRows.length === 0 || isSubmitting"
                        aria-label="选择全部BOM类别"
                        @change="toggleSelectAll"
                    >
                </div>
                <div
                    v-for="column in inventoryCategoryColumns"
                    :key="column.key"
                    class="table-cell"
                >
                    {{ column.label }}
                </div>
            </div>

            <div class="table-body">
                <div
                    v-for="row in paginatedCategoryRows"
                    :key="row.rowKey"
                    class="row-shell"
                    :class="{ child: row.level > 0 }"
                >
                    <div class="table-row data-row" :class="{ child: row.level > 0 }">
                        <div class="table-cell checkbox-cell">
                            <input
                                v-model="selectedCategoryIds"
                                class="row-checkbox"
                                type="checkbox"
                                :value="row.backendId"
                                :disabled="isSubmitting"
                                :aria-label="`选择${row.name}`"
                            >
                        </div>
                        <div class="table-cell id-cell">
                            <button
                                v-if="row.children?.length"
                                class="tree-toggle"
                                type="button"
                                :disabled="isSubmitting"
                                :aria-label="`${isCategoryExpanded(row.id) ? '收起' : '展开'}${row.name}`"
                                @click="toggleCategory(row.id)"
                            >
                                <Icon
                                    :name="
                                        isCategoryExpanded(row.id)
                                            ? 'lucide:square-minus'
                                            : 'lucide:square-plus'
                                    "
                                />
                            </button>
                            <span v-else class="tree-spacer" />
                            <span>{{ row.id }}</span>
                        </div>
                        <div class="table-cell">{{ row.name }}</div>
                        <div class="table-cell">{{ row.updatedAt }}</div>
                        <div class="table-cell actions-cell">
                            <button
                                v-if="canMoveDown(row)"
                                class="icon-button blue"
                                type="button"
                                :disabled="isSubmitting"
                                :aria-label="`下移${row.name}`"
                                @click="moveCategoryDown(row)"
                            >
                                <Icon name="lucide:arrow-down" />
                            </button>
                            <button
                                v-if="canMoveUp(row)"
                                class="icon-button blue"
                                type="button"
                                :disabled="isSubmitting"
                                :aria-label="`上移${row.name}`"
                                @click="moveCategoryUp(row)"
                            >
                                <Icon name="lucide:arrow-up" />
                            </button>
                            <button
                                v-if="row.level === 0"
                                class="icon-button blue"
                                type="button"
                                :disabled="isSubmitting"
                                :aria-label="`新增${row.name}子BOM类别`"
                                @click="openCreateChildCategoryDialog(row)"
                            >
                                <Icon name="lucide:circle-plus" />
                            </button>
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

                <div v-if="isLoading" class="empty-row">
                    正在加载BOM类别数据...
                </div>

                <div v-else-if="visibleCategoryRows.length === 0" class="empty-row">
                    暂无匹配BOM类别
                </div>
            </div>
        </section>

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
            class="dialog-mask"
            role="presentation"
            @click.self="closeCategoryDialog"
        >
            <form
                class="create-category-dialog"
                :aria-label="categoryDialogTitle"
                @submit.prevent="submitCategoryDialog"
            >
                <div class="dialog-header">
                    <h2 class="dialog-title">{{ categoryDialogTitle }}</h2>
                    <button
                        class="dialog-close"
                        type="button"
                        :disabled="isSubmitting"
                        :aria-label="`关闭${categoryDialogTitle}弹窗`"
                        @click="closeCategoryDialog"
                    >
                        <Icon name="lucide:x" />
                    </button>
                </div>

                <div class="dialog-body">
                    <label class="form-row">
                        <span class="field-label">类别编号</span>
                        <input
                            v-model="categoryForm.id"
                            class="dialog-input readonly"
                            type="text"
                            aria-label="类别编号"
                            placeholder="保存后自动生成"
                            readonly
                        >
                    </label>

                    <label class="form-row">
                        <span class="field-label required">类别名称</span>
                        <input
                            v-model="categoryForm.name"
                            class="dialog-input"
                            type="text"
                            aria-label="类别名称"
                            required
                        >
                    </label>
                </div>

                <div class="dialog-actions">
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
                </div>
            </form>
        </div>

        <div
            v-if="showChildCategoryDialog"
            class="dialog-mask"
            role="presentation"
            @click.self="closeChildCategoryDialog"
        >
            <form
                class="create-category-dialog"
                :aria-label="childCategoryDialogTitle"
                @submit.prevent="submitChildCategoryDialog"
            >
                <div class="dialog-header">
                    <h2 class="dialog-title">{{ childCategoryDialogTitle }}</h2>
                    <button
                        class="dialog-close"
                        type="button"
                        :disabled="isSubmitting"
                        :aria-label="`关闭${childCategoryDialogTitle}弹窗`"
                        @click="closeChildCategoryDialog"
                    >
                        <Icon name="lucide:x" />
                    </button>
                </div>

                <div class="dialog-body">
                    <div class="form-row">
                        <span class="field-label">父分类</span>
                        <span class="parent-category-name">{{ childCategoryForm.parentName }}</span>
                    </div>

                    <label class="form-row">
                        <span class="field-label">子类别编号</span>
                        <input
                            v-model="childCategoryForm.id"
                            class="dialog-input readonly"
                            type="text"
                            aria-label="子类别编号"
                            placeholder="保存后自动生成"
                            readonly
                        >
                    </label>

                    <label class="form-row">
                        <span class="field-label required">类别名称</span>
                        <input
                            v-model="childCategoryForm.name"
                            class="dialog-input"
                            type="text"
                            aria-label="子类别名称"
                            required
                        >
                    </label>
                </div>

                <div class="dialog-actions">
                    <button
                        class="dialog-button cancel"
                        type="button"
                        :disabled="isSubmitting"
                        @click="closeChildCategoryDialog"
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
                </div>
            </form>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { InventoryBomCategory as InventoryBomCategoryEntity } from "~~/shared/types/inventory";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import {
    addInventoryBomCategory,
    deleteInventoryBomCategory,
    retrieveInventoryBomCategoryTree,
    updateInventoryBomCategory,
} from "~/composables/api/useInventoryApi";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
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
    parentBackendId: string;
    children?: InventoryCategory[];
}

interface InventoryCategoryColumn {
    key: "id" | "name" | "updatedAt" | "actions";
    label: string;
}

interface VisibleCategoryRow extends InventoryCategory {
    level: number;
    rowKey: string;
    rootIndex: number;
    siblingIndex: number;
}

type DialogMode = "create" | "edit";

const inventoryCategoryColumns: InventoryCategoryColumn[] = [
    {
        key: "id",
        label: "类别编号",
    },
    {
        key: "name",
        label: "类别名称",
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

const searchText = ref("");
const inventoryCategories = ref<InventoryCategory[]>([]);
const expandedCategoryIds = ref<string[]>([]);
const selectedCategoryIds = ref<string[]>([]);
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
const showChildCategoryDialog = ref(false);
const isLoading = ref(false);
const isSubmitting = ref(false);
const categoryDialogMode = ref<DialogMode>("create");
const childCategoryDialogMode = ref<DialogMode>("create");
const categoryForm = reactive({
    backendId: "",
    rootIndex: 0,
    id: "",
    name: "",
    remark: "",
    sort: 0,
});
const childCategoryForm = reactive({
    backendId: "",
    rootIndex: 0,
    siblingIndex: 0,
    parentId: "",
    parentBackendId: "",
    parentName: "",
    id: "",
    name: "",
    remark: "",
    sort: 0,
});

const isSearching = computed(() => Boolean(searchText.value.trim()));

const allExpandableCategoryIds = computed(() =>
    inventoryCategories.value
        .filter((category) => category.children?.length)
        .map((category) => category.id),
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

    return inventoryCategories.value
        .map((category) => {
            const children = category.children?.filter((child) =>
                categoryMatchesSearch(child, keyword),
            );

            if (categoryMatchesSearch(category, keyword) || children?.length) {
                return {
                    ...category,
                    children,
                };
            }

            return null;
        })
        .filter((category): category is InventoryCategory => Boolean(category));
});

const flatVisibleCategoryRows = computed<VisibleCategoryRow[]>(() => {
    const rows: VisibleCategoryRow[] = [];

    paginatedCategories.value.forEach((category) => {
        const rootIndex = inventoryCategories.value.findIndex((item) =>
            item.backendId === category.backendId,
        );

        rows.push({
            ...category,
            level: 0,
            rowKey: `root-${category.backendId || category.id}-${rootIndex}`,
            rootIndex,
            siblingIndex: rootIndex,
        });

        if (!category.children?.length) {
            return;
        }

        if (!isSearching.value && !isCategoryExpanded(category.id)) {
            return;
        }

        category.children.forEach((child, childIndex) => {
            rows.push({
                ...child,
                level: 1,
                rowKey: `${rootIndex}-${category.backendId || category.id}-${child.backendId || child.id}-${childIndex}`,
                rootIndex,
                siblingIndex: childIndex,
            });
        });
    });

    return rows;
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
    categories.flatMap((category) => [
        category.backendId,
        ...getAllCategoryBackendIds(category.children || []),
    ]).filter(Boolean);

watch(totalCategoryRows, (total) => setTotalItems(total), {
    immediate: true,
});

const isCategoryExpanded = (categoryId: string) => {
    return expandedCategoryIds.value.includes(categoryId);
};

const toggleCategory = (categoryId: string) => {
    if (isCategoryExpanded(categoryId)) {
        expandedCategoryIds.value = expandedCategoryIds.value.filter(
            (id) => id !== categoryId,
        );
        return;
    }

    expandedCategoryIds.value = [...expandedCategoryIds.value, categoryId];
};

const expandAllCategories = () => {
    expandedCategoryIds.value = allExpandableCategoryIds.value;
};

const collapseAllCategories = () => {
    expandedCategoryIds.value = [];
};

const canMoveUp = (row: VisibleCategoryRow) => {
    if (isSearching.value) {
        return false;
    }

    return row.level === 0 ? row.rootIndex > 0 : row.siblingIndex > 0;
};

const canMoveDown = (row: VisibleCategoryRow) => {
    if (isSearching.value) {
        return false;
    }

    if (row.level === 0) {
        return row.rootIndex < inventoryCategories.value.length - 1;
    }

    const parentCategory = inventoryCategories.value[row.rootIndex];
    return row.siblingIndex < (parentCategory.children?.length ?? 0) - 1;
};

const findParentCategoryByBackendId = (parentBackendId: string) => {
    return inventoryCategories.value.find((category) => category.backendId === parentBackendId);
};

const findSiblingCategories = (row: VisibleCategoryRow) => {
    if (row.level === 0) {
        return inventoryCategories.value;
    }

    return findParentCategoryByBackendId(row.parentBackendId)?.children;
};

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
            updateInventoryBomCategory({
                id: item.backendId,
                sort: index,
            }),
        ),
    );
};

const moveCategoryUp = async (row: VisibleCategoryRow) => {
    if (!canMoveUp(row) || isSubmitting.value) {
        return;
    }

    const siblings = findSiblingCategories(row);
    const currentIndex = findCategoryIndexByBackendId(siblings, row.backendId);
    if (currentIndex <= 0) {
        return;
    }

    isSubmitting.value = true;
    try {
        await reorderCategoryGroup(siblings, currentIndex, currentIndex - 1);
        await loadCategories(false);
    } catch (err: any) {
        handleApiError(err, "调整BOM类别排序失败");
        await loadCategories(false);
    } finally {
        isSubmitting.value = false;
    }
};

const moveCategoryDown = async (row: VisibleCategoryRow) => {
    if (!canMoveDown(row) || isSubmitting.value) {
        return;
    }

    const siblings = findSiblingCategories(row);
    const currentIndex = findCategoryIndexByBackendId(siblings, row.backendId);
    if (!siblings?.length || currentIndex < 0 || currentIndex >= siblings.length - 1) {
        return;
    }

    isSubmitting.value = true;
    try {
        await reorderCategoryGroup(siblings, currentIndex, currentIndex + 1);
        await loadCategories(false);
    } catch (err: any) {
        handleApiError(err, "调整BOM类别排序失败");
        await loadCategories(false);
    } finally {
        isSubmitting.value = false;
    }
};

const deleteCategory = async (row: VisibleCategoryRow) => {
    if (!row.backendId || isSubmitting.value) {
        return;
    }

    try {
        await ElMessageBox.confirm(`是否确认删除BOM类别 ${row.name}`, "删除BOM类别", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const res = await deleteInventoryBomCategory({ id: row.backendId });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "删除BOM类别失败");
            return;
        }

        ElMessage.success("删除BOM类别成功");
        expandedCategoryIds.value = expandedCategoryIds.value.filter((id) => id !== row.id);
        selectedCategoryIds.value = selectedCategoryIds.value.filter((id) => id !== row.backendId);
        await loadCategories(false);
    } catch (err: any) {
        handleApiError(err, "删除BOM类别失败");
    } finally {
        isSubmitting.value = false;
    }
};

const batchDeleteCategories = async () => {
    const ids = selectedCategoryIds.value.filter(Boolean);

    if (!ids.length || isSubmitting.value) {
        ElMessage.warning("请先选择需要删除的BOM类别");
        return;
    }

    try {
        await ElMessageBox.confirm(`是否确认删除选中的 ${ids.length} 个BOM类别？`, "批量删除BOM类别", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const res = await deleteInventoryBomCategory({ ids });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "批量删除BOM类别失败");
            return;
        }

        const selectedRows = visibleCategoryRows.value.filter((row) => ids.includes(row.backendId));
        expandedCategoryIds.value = expandedCategoryIds.value.filter((id) =>
            !selectedRows.some((row) => row.id === id),
        );
        selectedCategoryIds.value = [];
        ElMessage.success("批量删除BOM类别成功");
        await loadCategories(false);
    } catch (err: any) {
        handleApiError(err, "批量删除BOM类别失败");
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

const normalizeCategory = (category: InventoryBomCategoryEntity): InventoryCategory => ({
    backendId: category._id || "",
    id: category.code || "",
    name: category.name || "",
    updatedAt: formatDateTime(category.updateTime),
    remark: category.remark || "",
    sort: Number(category.sort || 0),
    parentBackendId: category.parentId ? String(category.parentId) : "",
    children: Array.isArray(category.children)
        ? category.children.map((child) => normalizeCategory(child as InventoryBomCategoryEntity))
        : [],
});

const handleApiError = (err: any, fallbackMessage: string) => {
    ElMessage.error(err?.data?.msg || err?.message || fallbackMessage);
};

const loadCategories = async (resetPage = true) => {
    if (isLoading.value) {
        return;
    }

    isLoading.value = true;
    try {
        const res = await retrieveInventoryBomCategoryTree({
            keyword: searchText.value.trim() || undefined,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取BOM类别列表失败");
            inventoryCategories.value = [];
            return;
        }

        inventoryCategories.value = Array.isArray(res.data?.tree)
            ? res.data.tree.map(normalizeCategory)
            : [];
        const validIds = getAllCategoryBackendIds(inventoryCategories.value);
        selectedCategoryIds.value = selectedCategoryIds.value.filter((id) => validIds.includes(id));

        if (!expandedCategoryIds.value.length) {
            expandAllCategories();
        }

        if (resetPage) {
            goToPage(1);
        } else {
            goToPage(currentPage.value);
        }
    } catch (err: any) {
        inventoryCategories.value = [];
        handleApiError(err, "获取BOM类别列表失败");
    } finally {
        isLoading.value = false;
    }
};

const categoryDialogTitle = computed(() => {
    return categoryDialogMode.value === "create" ? "新建BOM类别" : "编辑BOM类别";
});

const childCategoryDialogTitle = computed(() => {
    return childCategoryDialogMode.value === "create" ? "新建子BOM类别" : "编辑子BOM类别";
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

const openCreateChildCategoryDialog = (row: VisibleCategoryRow) => {
    const parentCategory = inventoryCategories.value.find((category) => category.id === row.id);

    if (!parentCategory) {
        return;
    }

    childCategoryDialogMode.value = "create";
    childCategoryForm.backendId = "";
    childCategoryForm.rootIndex = row.rootIndex;
    childCategoryForm.siblingIndex = 0;
    childCategoryForm.parentId = parentCategory.id;
    childCategoryForm.parentBackendId = parentCategory.backendId;
    childCategoryForm.parentName = parentCategory.name;
    childCategoryForm.id = "";
    childCategoryForm.name = "";
    childCategoryForm.remark = "";
    childCategoryForm.sort = parentCategory.children?.length ?? 0;
    showChildCategoryDialog.value = true;
};

const openEditCategoryDialog = (row: VisibleCategoryRow) => {
    if (row.level === 0) {
        categoryDialogMode.value = "edit";
        categoryForm.backendId = row.backendId;
        categoryForm.rootIndex = row.rootIndex;
        categoryForm.id = row.id;
        categoryForm.name = row.name;
        categoryForm.remark = row.remark;
        categoryForm.sort = row.sort;
        showCategoryDialog.value = true;
        return;
    }

    childCategoryDialogMode.value = "edit";
    const parentCategory = findParentCategoryByBackendId(row.parentBackendId);
    childCategoryForm.backendId = row.backendId;
    childCategoryForm.rootIndex = row.rootIndex;
    childCategoryForm.siblingIndex = row.siblingIndex;
    childCategoryForm.parentId = parentCategory?.id ?? "";
    childCategoryForm.parentBackendId = parentCategory?.backendId ?? row.parentBackendId;
    childCategoryForm.parentName = parentCategory?.name ?? "";
    childCategoryForm.id = row.id;
    childCategoryForm.name = row.name;
    childCategoryForm.remark = row.remark;
    childCategoryForm.sort = row.sort;
    showChildCategoryDialog.value = true;
};

const closeCategoryDialog = () => {
    showCategoryDialog.value = false;
};

const closeChildCategoryDialog = () => {
    showChildCategoryDialog.value = false;
};

const submitCategoryDialog = async () => {
    const name = categoryForm.name.trim();
    if (!name) {
        ElMessage.warning("请输入BOM类别名称");
        return;
    }

    if (isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    try {
        if (categoryDialogMode.value === "create") {
            const res = await addInventoryBomCategory({
                name,
                parentId: null,
                remark: categoryForm.remark,
                sort: categoryForm.sort,
            });

            if (res.code !== 200) {
                ElMessage.error(res.msg || "新增BOM类别失败");
                return;
            }

            ElMessage.success("新增BOM类别成功");
            closeCategoryDialog();
            await loadCategories();
            return;
        }

        const res = await updateInventoryBomCategory({
            id: categoryForm.backendId,
            code: categoryForm.id,
            name,
            remark: categoryForm.remark,
            sort: categoryForm.sort,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "修改BOM类别失败");
            return;
        }

        ElMessage.success("修改BOM类别成功");
        closeCategoryDialog();
        await loadCategories(false);
    } catch (err: any) {
        handleApiError(
            err,
            categoryDialogMode.value === "create" ? "新增BOM类别失败" : "修改BOM类别失败",
        );
    } finally {
        isSubmitting.value = false;
    }
};

const submitChildCategoryDialog = async () => {
    const name = childCategoryForm.name.trim();
    if (!name) {
        ElMessage.warning("请输入BOM类别名称");
        return;
    }

    if (isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    try {
        if (childCategoryDialogMode.value === "edit") {
            const res = await updateInventoryBomCategory({
                id: childCategoryForm.backendId,
                code: childCategoryForm.id,
                name,
                parentId: childCategoryForm.parentBackendId,
                remark: childCategoryForm.remark,
                sort: childCategoryForm.sort,
            });

            if (res.code !== 200) {
                ElMessage.error(res.msg || "修改子BOM类别失败");
                return;
            }

            ElMessage.success("修改子BOM类别成功");
            closeChildCategoryDialog();
            await loadCategories(false);
            return;
        }

        const res = await addInventoryBomCategory({
            name,
            parentId: childCategoryForm.parentBackendId,
            remark: childCategoryForm.remark,
            sort: childCategoryForm.sort,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "新增子BOM类别失败");
            return;
        }

        ElMessage.success("新增子BOM类别成功");
        expandedCategoryIds.value = [
            ...new Set([...expandedCategoryIds.value, childCategoryForm.parentId]),
        ];
        closeChildCategoryDialog();
        await loadCategories(false);
    } catch (err: any) {
        handleApiError(
            err,
            childCategoryDialogMode.value === "create"
                ? "新增子BOM类别失败"
                : "修改子BOM类别失败",
        );
    } finally {
        isSubmitting.value = false;
    }
};

watch(pageSize, () => {
    goToPage(1);
});

watch(searchText, () => {
    goToPage(1);
});

onMounted(() => {
    loadCategories();
});
</script>

<style scoped>
.bom-category-page {
    --category-blue: #3dabee;
    --category-blue-light: #e6f7ff;
    --category-bg: #f5f7fa;
    --category-table-bg: #e6edf5;
    --category-text: #262626;
    --category-muted: #b3b3b3;
    --category-row-soft: #eef2f6;

    height: 100%;
    display: grid;
    grid-template-rows: 40px 40px minmax(0, 1fr) 92px;
    gap: 12px;
    color: var(--category-text);
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

.breadcrumb {
    display: flex;
    align-items: center;
    gap: 21px;
    white-space: nowrap;
}

.breadcrumb-icon,
.breadcrumb-separator {
    width: 24px;
    height: 24px;
}

.breadcrumb-main {
    margin-left: -13px;
    font-size: 18px;
    font-weight: 500;
}

.breadcrumb-current {
    color: var(--category-muted);
    font-size: 18px;
    font-weight: 500;
}

.search-box {
    width: 460px;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 12px;
    border-radius: 10px;
    background: #ffffff;
}

.search-icon {
    width: 24px;
    height: 24px;
    color: var(--category-muted);
}

.search-input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    color: var(--category-text);
    background: transparent;
    font-size: 14px;
}

.search-input::placeholder {
    color: var(--category-muted);
}

.search-button,
.primary-button {
    border: 0;
    border-radius: 10px;
    background: var(--category-blue);
    color: #ffffff;
    cursor: pointer;
}

.search-button {
    width: 60px;
    height: 32px;
    font-size: 14px;
    font-weight: 500;
}

.toolbar {
    justify-content: flex-start;
    gap: 12px;
}

.primary-button,
.outline-button {
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 16px;
    font-weight: 600;
}

.outline-button {
    border: 1px solid var(--category-muted);
    border-radius: 10px;
    color: var(--category-text);
    background: #ffffff;
    cursor: pointer;
}

.danger-button {
    border-color: #fca5a5;
    color: #ef4444;
}

.danger-button:not(:disabled):hover {
    border-color: #ef4444;
    background: #fff5f5;
}

button:disabled,
input:disabled {
    cursor: not-allowed;
    opacity: 0.65;
}

.button-icon {
    width: 24px;
    height: 24px;
}

.table-wrap {
    min-height: 0;
    display: grid;
    grid-template-rows: 46px minmax(0, 1fr);
}

.table-body {
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
}

.table-row {
    display: grid;
    grid-template-columns: 58px minmax(170px, 1fr) minmax(240px, 1.45fr) minmax(var(--erp-table-col-date), 1.45fr) var(--erp-table-col-action);
    align-items: center;
    width: 100%;
}

.table-head {
    height: 46px;
    border-radius: 10px;
    background: var(--category-table-bg);
    font-size: 16px;
    font-weight: 600;
}

.row-shell {
    box-sizing: border-box;
    width: 100%;
    margin-top: 15px;
}

.row-shell.child {
    padding-left: 64px;
}

.data-row {
    height: 80px;
    border-radius: 10px;
    background: #ffffff;
    font-size: 16px;
    font-weight: 400;
}

.data-row.child {
    height: 64px;
    background: var(--category-row-soft);
}

.table-cell {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 20px;
    white-space: nowrap;
}

.checkbox-cell {
    padding: 0;
}

.row-checkbox {
    width: 16px;
    height: 16px;
    accent-color: var(--category-blue);
}

.id-cell {
    gap: 138px;
    justify-content: flex-start;
}

.tree-toggle,
.tree-spacer {
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
}

.tree-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    color: var(--category-text);
    background: transparent;
    cursor: pointer;
}

.tree-toggle :deep(svg),
.icon-button :deep(svg) {
    width: 20px;
    height: 20px;
}

.actions-cell {
    gap: 12px;
}

.icon-button {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
}

.icon-button.blue {
    color: var(--category-blue);
}

.icon-button.delete {
    color: #ff4d4f;
}

.empty-row {
    height: 80px;
    margin-top: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    color: var(--category-muted);
    background: #ffffff;
    font-size: 16px;
}

.dialog-mask {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 28%);
}

.create-category-dialog {
    width: 580px;
    height: 320px;
    display: grid;
    grid-template-rows: auto 1fr auto;
    padding: 16px;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 16px 36px rgb(0 0 0 / 12%);
}

.dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.dialog-title {
    margin: 0;
    color: var(--category-text);
    font-size: 16px;
    font-weight: 600;
}

.dialog-close {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    color: var(--category-text);
    background: transparent;
    cursor: pointer;
}

.dialog-close :deep(svg) {
    width: 16px;
    height: 16px;
}

.dialog-body {
    display: grid;
    align-content: center;
    gap: 25px;
    padding: 32px 92px 28px;
}

.form-row {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: center;
    gap: 16px;
}

.field-label {
    justify-self: center;
    color: var(--category-text);
    font-size: 14px;
    white-space: nowrap;
}

.field-label.required::after {
    content: "*";
    color: #ff4d4f;
}

.parent-category-name {
    color: var(--category-text);
    font-size: 14px;
}

.dialog-input {
    width: 100%;
    height: 30px;
    box-sizing: border-box;
    padding: 0 8px;
    border: 1px solid #d9d9d9;
    border-radius: 8px;
    outline: 0;
    color: var(--category-text);
    background: #ffffff;
    font-size: 14px;
}

.dialog-input:focus {
    border-color: var(--category-blue);
}

.dialog-input.readonly {
    background: #f2f2f2;
    cursor: not-allowed;
}

.dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 14px;
}

.dialog-button {
    width: 70px;
    height: 28px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
}

.dialog-button.cancel {
    border: 1px solid #d9d9d9;
    color: #b3b3b3;
    background: #ffffff;
}

.dialog-button.confirm {
    border: 1px solid var(--category-blue);
    color: #ffffff;
    background: var(--category-blue);
}

@media (max-width: 1200px) {
    .search-box {
        width: 360px;
    }

    .row-shell.child {
        padding-left: 48px;
    }

    .id-cell {
        gap: 90px;
    }
}
</style>
