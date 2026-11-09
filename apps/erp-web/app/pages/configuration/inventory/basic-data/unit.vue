<template>
    <div class="unit-page">
        <header class="topbar">
            <ErpBreadcrumb
                icon="lucide:warehouse"
                :items="unitBreadcrumbItems"
            />

            <ErpSearchBox v-model="searchText" @search="loadUnits" />
        </header>

        <div class="toolbar">
            <button
                class="primary-button"
                type="button"
                :disabled="isLoading || isSubmitting"
                @click="openCreateUnitDialog"
            >
                <Icon name="lucide:circle-plus" class="button-icon" />
                <span>新建单位</span>
            </button>
            <button
                class="outline-button danger-button"
                type="button"
                :disabled="isSubmitting || selectedUnitIds.length === 0"
                @click="batchDeleteUnits"
            >
                <Icon name="lucide:trash-2" class="button-icon" />
                <span>批量删除</span>
            </button>
        </div>

        <ErpTableFrame
            data-inventory-copy-table
            :columns="tableCols"
            :loading="isLoading"
            :empty="filteredUnits.length === 0"
            loading-text="正在加载单位数据..."
            empty-text="暂无匹配单位"
        >
            <template #header>
                <div class="table-row table-head">
                    <div class="table-cell checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                class="row-checkbox"
                                type="checkbox"
                                :checked="allRowsSelected"
                                :disabled="paginatedUnits.length === 0 || isSubmitting"
                                aria-label="选择全部单位"
                                @change="toggleSelectAll"
                            >
                        </label>
                    </div>
                    <div class="table-cell drag-cell">排序</div>
                    <div
                        v-for="column in inventoryUnitColumns"
                        :key="column.key"
                        class="table-cell"
                    >
                        {{ column.label }}
                    </div>
                </div>
            </template>

            <div
                v-for="unit in paginatedUnits"
                :key="unit.backendId || unit.id"
                class="table-row data-row"
                :class="{
                    'dragging-row': draggingUnitId === unit.backendId,
                    'drag-over-row': dragOverUnitId === unit.backendId,
                }"
                @dragover.prevent="handleUnitDragOver(unit)"
                @dragleave="handleUnitDragLeave(unit)"
                @drop.prevent="handleUnitDrop(unit)"
                @dragend="handleUnitDragEnd"
            >
                <div class="table-cell checkbox-cell">
                    <label class="checkbox-control">
                        <input
                            v-model="selectedUnitIds"
                            class="row-checkbox"
                            type="checkbox"
                            :value="unit.backendId"
                            :disabled="isSubmitting"
                            :aria-label="`选择${getUnitDisplayCode(unit)}`"
                        >
                    </label>
                </div>
                <div class="table-cell drag-cell">
                    <button
                        class="drag-handle"
                        type="button"
                        :disabled="!canDragSortUnits || isSubmitting"
                        :draggable="canDragSortUnits && !isSubmitting"
                        aria-label="拖拽排序"
                        data-icon-tooltip="拖拽排序"
                        @dragstart.stop="handleUnitDragStart(unit, $event)"
                    >
                        <Icon name="lucide:grip-vertical" />
                    </button>
                </div>
                <div class="table-cell">{{ getUnitDisplayCode(unit) }}</div>
                <div class="table-cell">{{ unit.name }}</div>
                <div class="table-cell">{{ unit.updatedAt }}</div>
                <div class="table-cell actions-cell">
                    <button
                        class="icon-button edit"
                        type="button"
                        :disabled="isSubmitting"
                        :aria-label="`编辑${getUnitDisplayCode(unit)}`"
                        @click="openEditUnitDialog(unit)"
                    >
                        <Icon name="lucide:square-pen" />
                    </button>
                    <button
                        class="icon-button delete"
                        type="button"
                        :disabled="isSubmitting"
                        :aria-label="`删除${getUnitDisplayCode(unit)}`"
                        @click="deleteUnit(unit)"
                    >
                        <Icon name="lucide:trash-2" />
                    </button>
                </div>
            </div>
        </ErpTableFrame>

        <InventoryPagination
            v-model:page-size="pageSize"
            v-model:jump-page-input="jumpPageInput"
            :total="totalUnits"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="goToPage"
            @jump="jumpToInputPage"
        />

        <div
            v-if="showCreateUnitDialog"
            class="erp-dialog-mask"
            role="presentation"
            @click.self="closeCreateUnitDialog"
        >
            <ErpDialogFrame
                :title="unitDialogTitle"
                :close-disabled="isSubmitting"
                @close="closeCreateUnitDialog"
                @submit.prevent="submitCreateUnit"
            >
                <label class="form-row">
                    <span class="field-label">单位编号</span>
                    <input
                        v-model="createUnitForm.id"
                        class="dialog-input readonly"
                        type="text"
                        aria-label="单位编号"
                        placeholder="保存后自动生成"
                        readonly
                    >
                </label>

                <label class="form-row">
                    <span class="field-label required">单位名称</span>
                    <input
                        v-model="createUnitForm.name"
                        class="dialog-input"
                        type="text"
                        aria-label="单位名称"
                        required
                    >
                </label>

                <template #footer>
                    <button
                        class="dialog-button cancel"
                        type="button"
                        :disabled="isSubmitting"
                        @click="closeCreateUnitDialog"
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
import type { InventoryUnit as InventoryUnitEntity } from "~~/shared/types/inventory";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import {
    addInventoryUnit,
    deleteInventoryUnit,
    retrieveInventoryUnits,
    updateInventoryUnit,
} from "~/composables/api/useInventoryApi";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import { erpMessageBox } from "~/utils/erpMessageBox";
definePageMeta({
    layout: "inventory",
});

interface InventoryUnit {
    backendId: string;
    id: string;
    name: string;
    updatedAt: string;
    remark: string;
    sort: number;
    isEnabled: boolean;
}

interface InventoryUnitColumn {
    key: "id" | "name" | "updatedAt" | "actions";
    label: string;
}

const unitBreadcrumbItems = [
    { label: "仓储管理" },
    { label: "基础数据" },
    { label: "单位管理" },
];

const inventoryUnitColumns: InventoryUnitColumn[] = [
    {
        key: "id",
        label: "编号",
    },
    {
        key: "name",
        label: "名称",
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

const tableCols = "58px 48px minmax(160px, 1fr) minmax(220px, 1.45fr) minmax(var(--erp-table-col-date), 1.45fr) var(--erp-table-col-action)";

const filterInventoryUnits = (
    units: InventoryUnit[],
    searchText: string,
) => {
    const keyword = searchText.trim().toLocaleLowerCase();

    if (!keyword) {
        return units;
    }

    return units.filter((unit) => {
        return [unit.id, unit.name, unit.updatedAt, unit.remark].some((value) =>
            value.toLocaleLowerCase().includes(keyword),
        );
    });
};

const searchText = ref("");
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
const showCreateUnitDialog = ref(false);
const unitDialogMode = ref<"create" | "edit">("create");
const isLoading = ref(false);
const isSubmitting = ref(false);
const inventoryUnits = ref<InventoryUnit[]>([]);
const selectedUnitIds = ref<string[]>([]);
const loadedUnitKeyword = ref("");
const draggingUnitId = ref("");
const dragOverUnitId = ref("");
const createUnitForm = reactive({
    backendId: "",
    id: "",
    name: "",
    remark: "",
    sort: 0,
    isEnabled: true,
});

const filteredUnits = computed(() =>
    filterInventoryUnits(inventoryUnits.value, searchText.value),
);
const totalUnits = computed(() => filteredUnits.value.length);
const paginatedUnits = computed(() => getPageItems(filteredUnits.value));
const allRowsSelected = computed(() =>
    paginatedUnits.value.length > 0 &&
    paginatedUnits.value.every((unit) => unit.backendId && selectedUnitIds.value.includes(unit.backendId)),
);
const canDragSortUnits = computed(() =>
    !searchText.value.trim() && !loadedUnitKeyword.value && !isLoading.value && !isSubmitting.value,
);

const formatSequenceCode = (prefix: string, width: number, index: number) => {
    return `${prefix}${String(index + 1).padStart(width, "0")}`;
};

const getUnitDisplayCode = (unit: InventoryUnit) => {
    const index = inventoryUnits.value.findIndex((item) => item.backendId === unit.backendId);

    if (index < 0) {
        return unit.id;
    }

    return formatSequenceCode("DW", 2, index);
};

const toggleSelectAll = () => {
    const pageIds = paginatedUnits.value
        .map((unit) => unit.backendId)
        .filter(Boolean);

    if (allRowsSelected.value) {
        selectedUnitIds.value = selectedUnitIds.value.filter((id) => !pageIds.includes(id));
        return;
    }

    selectedUnitIds.value = [...new Set([...selectedUnitIds.value, ...pageIds])];
};

watch(totalUnits, (total) => setTotalItems(total), {
    immediate: true,
});

const unitDialogTitle = computed(() =>
    unitDialogMode.value === "edit" ? "编辑单位" : "新建单位",
);

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

const normalizeUnit = (unit: InventoryUnitEntity): InventoryUnit => ({
    backendId: unit._id || "",
    id: unit.code || "",
    name: unit.name || "",
    updatedAt: formatDateTime(unit.updateTime),
    remark: unit.remark || "",
    sort: Number(unit.sort || 0),
    isEnabled: unit.isEnabled !== false,
});

const handleApiError = (err: any, fallbackMessage: string) => {
    ElMessage.error(err?.data?.msg || err?.message || fallbackMessage);
};

const clearDragState = () => {
    draggingUnitId.value = "";
    dragOverUnitId.value = "";
};

const persistUnitOrder = async () => {
    await Promise.all(
        inventoryUnits.value.map((unit, index) =>
            updateInventoryUnit({
                id: unit.backendId,
                sort: index,
            }),
        ),
    );

    inventoryUnits.value.forEach((unit, index) => {
        unit.sort = index;
    });
};

const handleUnitDragStart = (unit: InventoryUnit, event: DragEvent) => {
    if (!canDragSortUnits.value) {
        event.preventDefault();
        ElMessage.warning("请先清空搜索并加载完整列表后再拖拽排序");
        return;
    }

    if (!unit.backendId) {
        event.preventDefault();
        return;
    }

    draggingUnitId.value = unit.backendId;
    event.dataTransfer?.setData("text/plain", unit.backendId);

    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
    }
};

const handleUnitDragOver = (unit: InventoryUnit) => {
    if (!draggingUnitId.value || draggingUnitId.value === unit.backendId) {
        dragOverUnitId.value = "";
        return;
    }

    dragOverUnitId.value = unit.backendId;
};

const handleUnitDragLeave = (unit: InventoryUnit) => {
    if (dragOverUnitId.value === unit.backendId) {
        dragOverUnitId.value = "";
    }
};

const handleUnitDrop = async (targetUnit: InventoryUnit) => {
    const sourceId = draggingUnitId.value;

    if (!sourceId || sourceId === targetUnit.backendId || isSubmitting.value) {
        clearDragState();
        return;
    }

    const sourceIndex = inventoryUnits.value.findIndex((unit) => unit.backendId === sourceId);
    const targetIndex = inventoryUnits.value.findIndex((unit) => unit.backendId === targetUnit.backendId);

    if (sourceIndex < 0 || targetIndex < 0) {
        clearDragState();
        return;
    }

    const [movingUnit] = inventoryUnits.value.splice(sourceIndex, 1);
    inventoryUnits.value.splice(targetIndex, 0, movingUnit);
    clearDragState();

    isSubmitting.value = true;
    try {
        await persistUnitOrder();
        ElMessage.success("单位排序已更新");
    } catch (err: any) {
        handleApiError(err, "调整单位排序失败");
        await loadUnits();
    } finally {
        isSubmitting.value = false;
    }
};

const handleUnitDragEnd = () => {
    clearDragState();
};

const loadUnits = async () => {
    if (isLoading.value) {
        return;
    }

    isLoading.value = true;
    const keyword = searchText.value.trim();
    try {
        const res = await retrieveInventoryUnits({
            keyword: keyword || undefined,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取单位列表失败");
            inventoryUnits.value = [];
            return;
        }

        inventoryUnits.value = Array.isArray(res.data?.list)
            ? res.data.list.map(normalizeUnit)
            : [];
        loadedUnitKeyword.value = keyword;
        selectedUnitIds.value = selectedUnitIds.value.filter((id) =>
            inventoryUnits.value.some((unit) => unit.backendId === id),
        );
        goToPage(1);
    } catch (err: any) {
        inventoryUnits.value = [];
        handleApiError(err, "获取单位列表失败");
    } finally {
        isLoading.value = false;
    }
};

const openCreateUnitDialog = () => {
    unitDialogMode.value = "create";
    createUnitForm.backendId = "";
    createUnitForm.id = "";
    createUnitForm.name = "";
    createUnitForm.remark = "";
    createUnitForm.sort = 0;
    createUnitForm.isEnabled = true;
    showCreateUnitDialog.value = true;
};

const openEditUnitDialog = (unit: InventoryUnit) => {
    unitDialogMode.value = "edit";
    createUnitForm.backendId = unit.backendId;
    createUnitForm.id = unit.id;
    createUnitForm.name = unit.name;
    createUnitForm.remark = unit.remark;
    createUnitForm.sort = unit.sort;
    createUnitForm.isEnabled = unit.isEnabled;
    showCreateUnitDialog.value = true;
};

const closeCreateUnitDialog = () => {
    if (isSubmitting.value) {
        return;
    }

    showCreateUnitDialog.value = false;
};

const submitCreateUnit = async () => {
    const name = createUnitForm.name.trim();
    if (!name) {
        ElMessage.warning("请输入单位名称");
        return;
    }

    if (isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    try {
        if (unitDialogMode.value === "create") {
            const res = await addInventoryUnit({
                name,
                remark: createUnitForm.remark,
                sort: createUnitForm.sort,
                isEnabled: createUnitForm.isEnabled,
            });

            if (res.code !== 200) {
                ElMessage.error(res.msg || "新增单位失败");
                return;
            }

            ElMessage.success("新增单位成功");
            showCreateUnitDialog.value = false;
            await loadUnits();
            return;
        }

        const res = await updateInventoryUnit({
            id: createUnitForm.backendId,
            code: createUnitForm.id,
            name,
            remark: createUnitForm.remark,
            sort: createUnitForm.sort,
            isEnabled: createUnitForm.isEnabled,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "修改单位失败");
            return;
        }

        ElMessage.success("修改单位成功");
        showCreateUnitDialog.value = false;
        await loadUnits();
    } catch (err: any) {
        handleApiError(err, unitDialogMode.value === "create" ? "新增单位失败" : "修改单位失败");
    } finally {
        isSubmitting.value = false;
    }
};

const deleteUnit = async (unit: InventoryUnit) => {
    if (!unit.backendId || isSubmitting.value) {
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除单位 ${unit.name}`, "删除单位", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const res = await deleteInventoryUnit({ id: unit.backendId });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "删除单位失败");
            return;
        }

        ElMessage.success("删除单位成功");
        selectedUnitIds.value = selectedUnitIds.value.filter((id) => id !== unit.backendId);
        await loadUnits();
    } catch (err: any) {
        handleApiError(err, "删除单位失败");
    } finally {
        isSubmitting.value = false;
    }
};

const batchDeleteUnits = async () => {
    const ids = selectedUnitIds.value.filter(Boolean);

    if (!ids.length || isSubmitting.value) {
        ElMessage.warning("请先选择需要删除的单位");
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除选中的 ${ids.length} 个单位？`, "批量删除单位", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const res = await deleteInventoryUnit({ ids });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "批量删除单位失败");
            return;
        }

        selectedUnitIds.value = [];
        ElMessage.success("批量删除单位成功");
        await loadUnits();
    } catch (err: any) {
        handleApiError(err, "批量删除单位失败");
    } finally {
        isSubmitting.value = false;
    }
};

watch(pageSize, () => {
    goToPage(1);
});

watch(searchText, (value) => {
    goToPage(1);

    if (!value.trim() && loadedUnitKeyword.value && !isLoading.value) {
        loadUnits();
    }
});

onMounted(() => {
    loadUnits();
});
</script>

<style scoped>
.unit-page {
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
    gap: var(--erp-spacing-12);
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

.drag-handle :deep(svg) {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

@media (max-width: 1200px) {
    .unit-page {
        min-width: 760px;
    }
}

</style>
