<template>
    <div class="warehouse-page">
        <header class="topbar">
            <ErpBreadcrumb
                icon="lucide:warehouse"
                :items="warehouseBreadcrumbItems"
            />

            <ErpSearchBox v-model="searchText" @search="loadWarehouses" />
        </header>

        <div class="toolbar">
            <button
                class="primary-button"
                type="button"
                :disabled="isLoading || isSubmitting"
                @click="openCreateWarehouseDialog"
            >
                <Icon name="lucide:circle-plus" class="button-icon" />
                <span>新建仓库</span>
            </button>
            <button
                class="outline-button danger-button"
                type="button"
                :disabled="isSubmitting || selectedWarehouseRowKeys.length === 0"
                @click="batchDeleteWarehouseRows"
            >
                <Icon name="lucide:trash-2" class="button-icon" />
                <span>批量删除</span>
            </button>
        </div>

        <ErpTableFrame
            data-inventory-copy-table
            :columns="tableCols"
            :loading="isLoading"
            :empty="filteredWarehouseRows.length === 0"
            loading-text="正在加载仓库数据..."
            empty-text="暂无匹配仓库"
        >
            <template #header>
                <div class="table-row table-head">
                    <div class="table-cell checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                class="row-checkbox"
                                type="checkbox"
                                :checked="allRowsSelected"
                                :disabled="paginatedWarehouseRows.length === 0 || isSubmitting"
                                aria-label="选择全部仓库"
                                @change="toggleSelectAll"
                            >
                        </label>
                    </div>
                    <div
                        v-for="column in warehouseColumns"
                        :key="column.key"
                        class="table-cell"
                    >
                        {{ column.label }}
                    </div>
                </div>
            </template>

            <div
                v-for="row in paginatedWarehouseRows"
                :key="row.rowKey"
                class="row-shell"
                :class="{ child: row.level > 0 }"
                :style="getRowStyle(row)"
            >
                <div class="table-row data-row" :class="{ child: row.level > 0 }">
                    <div class="table-cell checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                v-model="selectedWarehouseRowKeys"
                                class="row-checkbox"
                                type="checkbox"
                                :value="getWarehouseRowSelectionKey(row)"
                                :disabled="isSubmitting || !row.backendId"
                                :aria-label="`选择${row.name}`"
                            >
                        </label>
                    </div>
                    <div class="table-cell id-cell">
                        <button
                            v-if="row.children?.length"
                            class="tree-toggle"
                            type="button"
                            :disabled="isSubmitting"
                            :aria-label="`${isWarehouseExpanded(row.rowKey) ? '收起' : '展开'}${row.name}`"
                            @click="toggleExpand(row.rowKey)"
                        >
                            <Icon
                                :name="
                                    isWarehouseExpanded(row.rowKey)
                                        ? 'lucide:square-minus'
                                        : 'lucide:square-plus'
                                "
                            />
                        </button>
                        <span v-else class="tree-spacer" />
                        <span>{{ row.id }}</span>
                    </div>
                    <div class="table-cell">{{ row.name }}</div>
                    <div class="table-cell">
                        <button
                            v-if="row.level === 0"
                            class="switch"
                            :class="{ active: row.countsAvailable }"
                            type="button"
                            :disabled="isSubmitting"
                            :aria-label="`${row.name}计入可用库存`"
                            @click="toggleWarehouse(row.id, 'countsAvailable')"
                        >
                            <span />
                        </button>
                    </div>
                    <div class="table-cell">
                        <button
                            v-if="row.level === 0"
                            class="switch"
                            :class="{ active: row.usesLocation }"
                            type="button"
                            :disabled="isSubmitting"
                            :aria-label="`${row.name}是否启用仓位`"
                            @click="toggleWarehouse(row.id, 'usesLocation')"
                        >
                            <span />
                        </button>
                    </div>
                    <div class="table-cell">
                        <el-popover
                            v-if="shouldShowWarehouseNotePopover(row)"
                            trigger="hover"
                            placement="top"
                            :width="280"
                            popper-class="erp-app warehouse-note-popover"
                        >
                            <div class="note-popover-content">{{ getWarehouseNoteText(row) }}</div>
                            <template #reference>
                                <span class="note-cell-text">{{ getWarehouseNoteText(row) }}</span>
                            </template>
                        </el-popover>
                        <span v-else>{{ getWarehouseNoteText(row) }}</span>
                    </div>
                    <div class="table-cell">{{ row.manager }}</div>
                    <div class="table-cell">{{ row.updatedAt }}</div>
                    <div class="table-cell actions-cell">
                        <button
                            v-if="canCreateChildLocation(row)"
                            class="icon-button blue"
                            type="button"
                            :disabled="isSubmitting"
                            :aria-label="`新增${row.name}仓位`"
                            @click="openCreateLocationDialog(row)"
                        >
                            <Icon name="lucide:circle-plus" />
                        </button>
                        <button
                            class="icon-button blue"
                            type="button"
                            :disabled="isSubmitting"
                            :aria-label="`编辑${row.name}`"
                            @click="openEditWarehouseDialog(row)"
                        >
                            <Icon name="lucide:square-pen" />
                        </button>
                        <button
                            class="icon-button delete"
                            type="button"
                            :disabled="isSubmitting"
                            :aria-label="`删除${row.name}`"
                            @click="deleteWarehouseRow(row)"
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
            :total="totalWarehouseRows"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="goToPage"
            @jump="jumpToInputPage"
        />

        <div
            v-if="showWarehouseDialog"
            class="erp-dialog-mask"
            role="presentation"
            @click.self="closeWarehouseDialog"
        >
            <ErpDialogFrame
                :title="warehouseDialogTitle"
                :close-disabled="isSubmitting"
                @close="closeWarehouseDialog"
                @submit.prevent="submitWarehouseDialog"
            >
                <label class="form-row">
                    <span class="field-label">仓库编号</span>
                    <input
                        v-model="warehouseForm.id"
                        class="dialog-input readonly"
                        type="text"
                        aria-label="仓库编号"
                        placeholder="保存后自动生成"
                        readonly
                    >
                </label>

                <label class="form-row">
                    <span class="field-label required">仓库名称</span>
                    <input
                        v-model="warehouseForm.name"
                        class="dialog-input"
                        type="text"
                        aria-label="仓库名称"
                        required
                    >
                </label>

                <label class="form-row">
                    <span class="field-label required">管理员</span>
                    <input
                        v-model="warehouseForm.manager"
                        class="dialog-input"
                        type="text"
                        aria-label="管理员"
                    >
                </label>

                <div class="form-row">
                    <span class="field-label required">计入可用库存</span>
                    <div class="radio-group">
                        <label class="radio-option">
                            <input
                                v-model="warehouseForm.countsAvailable"
                                type="radio"
                                :value="true"
                            >
                            <span>是</span>
                        </label>
                        <label class="radio-option">
                            <input
                                v-model="warehouseForm.countsAvailable"
                                type="radio"
                                :value="false"
                            >
                            <span>否</span>
                        </label>
                    </div>
                </div>

                <div class="form-row">
                    <span class="field-label required">含有仓位</span>
                    <div class="radio-group">
                        <label class="radio-option">
                            <input
                                v-model="warehouseForm.usesLocation"
                                type="radio"
                                :value="true"
                            >
                            <span>是</span>
                        </label>
                        <label class="radio-option">
                            <input
                                v-model="warehouseForm.usesLocation"
                                type="radio"
                                :value="false"
                            >
                            <span>否</span>
                        </label>
                    </div>
                </div>

                <label class="form-row">
                    <span class="field-label">备注</span>
                    <input
                        v-model="warehouseForm.note"
                        class="dialog-input"
                        type="text"
                        aria-label="备注"
                    >
                </label>

                <template #footer>
                    <button
                        class="dialog-button cancel"
                        type="button"
                        :disabled="isSubmitting"
                        @click="closeWarehouseDialog"
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

        <div
            v-if="showLocationDialog"
            class="erp-dialog-mask"
            role="presentation"
            @click.self="closeLocationDialog"
        >
            <ErpDialogFrame
                :title="locationDialogTitle"
                :close-disabled="isSubmitting"
                @close="closeLocationDialog"
                @submit.prevent="submitLocationDialog"
            >
                <div class="form-row">
                    <span class="field-label">仓库</span>
                    <span class="parent-warehouse-name">{{ locationForm.parentName }}</span>
                </div>

                <label class="form-row">
                    <span class="field-label">仓位编号</span>
                    <input
                        v-model="locationForm.id"
                        class="dialog-input readonly"
                        type="text"
                        aria-label="仓位编号"
                        placeholder="保存后自动生成"
                        readonly
                    >
                </label>

                <label class="form-row">
                    <span class="field-label required">仓位名称</span>
                    <input
                        v-model="locationForm.name"
                        class="dialog-input"
                        type="text"
                        aria-label="仓位名称"
                        required
                    >
                </label>

                <label class="form-row">
                    <span class="field-label required">管理员</span>
                    <input
                        v-model="locationForm.manager"
                        class="dialog-input"
                        type="text"
                        aria-label="管理员"
                    >
                </label>

                <label class="form-row">
                    <span class="field-label">备注</span>
                    <input
                        v-model="locationForm.note"
                        class="dialog-input"
                        type="text"
                        aria-label="备注"
                    >
                </label>

                <template #footer>
                    <button
                        class="dialog-button cancel"
                        type="button"
                        :disabled="isSubmitting"
                        @click="closeLocationDialog"
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
import type {
    InventoryLocation as InventoryLocationEntity,
    InventoryWarehouse as InventoryWarehouseEntity,
} from "~~/shared/types/inventory";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import {
    addInventoryLocation,
    addInventoryWarehouse,
    deleteInventoryLocation,
    deleteInventoryWarehouse,
    retrieveInventoryLocations,
    retrieveInventoryWarehouses,
    updateInventoryLocation,
    updateInventoryWarehouse,
} from "~/composables/api/useInventoryApi";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import { erpMessageBox } from "~/utils/erpMessageBox";
definePageMeta({
    layout: "inventory",
});

interface WarehouseLocation {
    backendId: string;
    id: string;
    name: string;
    note: string;
    manager: string;
    updatedAt: string;
    sort: number;
    level: number;
    warehouseBackendId: string;
    warehouseId: string;
    warehouseName: string;
    parentBackendId?: string;
    parentId?: string;
    parentName?: string;
    children: WarehouseLocation[];
}

interface Warehouse extends WarehouseLocation {
    countsAvailable: boolean;
    usesLocation: boolean;
    children?: WarehouseLocation[];
}

interface WarehouseColumn {
    key: "id" | "name" | "countsAvailable" | "usesLocation" | "note" | "manager" | "updatedAt" | "actions";
    label: string;
}

interface VisibleWarehouseRow extends Warehouse {
    level: number;
    rowKey: string;
    warehouseBackendId: string;
    warehouseId: string;
    warehouseName: string;
    parentBackendId?: string;
    parentId?: string;
    parentName?: string;
}

type DialogMode = "create" | "edit";

const warehouseBreadcrumbItems = [
    { label: "仓储管理" },
    { label: "基础数据" },
    { label: "仓库管理" },
];

const warehouseColumns: WarehouseColumn[] = [
    {
        key: "id",
        label: "编号",
    },
    {
        key: "name",
        label: "名称",
    },
    {
        key: "countsAvailable",
        label: "计入可用库存",
    },
    {
        key: "usesLocation",
        label: "是否启用仓位",
    },
    {
        key: "note",
        label: "备注",
    },
    {
        key: "manager",
        label: "管理员",
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

const tableCols = [
    "var(--warehouse-checkbox-column-width)",
    "minmax(var(--warehouse-id-column-width), 0.7fr)",
    "minmax(150px, 1.25fr)",
    "minmax(150px, 1fr)",
    "minmax(150px, 1fr)",
    "minmax(var(--erp-table-col-remark), 0.9fr)",
    "minmax(100px, 0.85fr)",
    "minmax(var(--erp-table-col-date), 1.15fr)",
    "var(--erp-table-col-action)",
].join(" ");

const searchText = ref("");
const warehouses = ref<Warehouse[]>([]);
const expandedWarehouseIds = ref<string[]>([]);
const selectedWarehouseRowKeys = ref<string[]>([]);
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
const showWarehouseDialog = ref(false);
const showLocationDialog = ref(false);
const isLoading = ref(false);
const isSubmitting = ref(false);
const warehouseDialogMode = ref<DialogMode>("create");
const locationDialogMode = ref<DialogMode>("create");
const warehouseForm = reactive({
    backendId: "",
    id: "",
    name: "",
    manager: "",
    countsAvailable: true,
    usesLocation: true,
    note: "",
    sort: 0,
});
const locationForm = reactive({
    backendId: "",
    warehouseBackendId: "",
    parentLocationBackendId: "",
    parentId: "",
    parentBackendId: "",
    parentName: "",
    id: "",
    name: "",
    manager: "",
    note: "",
    sort: 0,
});

const isWarehouseExpanded = (id: string) => {
    return expandedWarehouseIds.value.includes(id);
};

const toggleExpand = (id: string) => {
    if (isWarehouseExpanded(id)) {
        expandedWarehouseIds.value = expandedWarehouseIds.value.filter(
            (item) => item !== id,
        );
        return;
    }

    expandedWarehouseIds.value = [...expandedWarehouseIds.value, id];
};

const toggleWarehouse = (
    id: string,
    field: "countsAvailable" | "usesLocation",
) => {
    const warehouse = warehouses.value.find((item) => item.id === id);

    if (!warehouse || isSubmitting.value) {
        return;
    }

    const nextValue = !warehouse[field];
    isSubmitting.value = true;

    updateWarehouseSwitch(warehouse, field, nextValue);
};

const updateWarehouseSwitch = async (
    warehouse: Warehouse,
    field: "countsAvailable" | "usesLocation",
    nextValue: boolean,
) => {
    try {
        const res = await updateInventoryWarehouse({
            id: warehouse.backendId,
            [field === "countsAvailable" ? "includeInAvailable" : "enableLocation"]: nextValue,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "修改仓库配置失败");
            return;
        }

        warehouse[field] = nextValue;
        if (field === "usesLocation" && nextValue) {
            expandedWarehouseIds.value = [...new Set([
                ...expandedWarehouseIds.value,
                warehouse.backendId || warehouse.id,
            ])];
        }
        ElMessage.success("修改仓库配置成功");
        await loadWarehouses(false);
    } catch (err: any) {
        handleApiError(err, "修改仓库配置失败");
    } finally {
        isSubmitting.value = false;
    }
};

const warehouseMatchesSearch = (
    warehouse: Warehouse | WarehouseLocation,
    keyword: string,
) => {
    return [
        warehouse.id,
        warehouse.name,
        warehouse.note,
        warehouse.manager,
        warehouse.updatedAt,
    ].some((value) => value.toLocaleLowerCase().includes(keyword));
};

const locationTreeMatches = (location: WarehouseLocation, keyword: string): boolean => {
    return warehouseMatchesSearch(location, keyword)
        || location.children.some((child) => locationTreeMatches(child, keyword));
};

const flattenLocationKeys = (locations: WarehouseLocation[]): string[] =>
    locations.flatMap((location) => [
        `location:${location.backendId}`,
        ...flattenLocationKeys(location.children),
    ]);

const getExpandableRowKeys = (items: Warehouse[]) => {
    const keys: string[] = [];

    const collectLocationKeys = (locations: WarehouseLocation[]) => {
        locations.forEach((location) => {
            if (location.children.length) {
                keys.push(location.backendId || location.id);
                collectLocationKeys(location.children);
            }
        });
    };

    items.forEach((warehouse) => {
        if (warehouse.children?.length) {
            keys.push(warehouse.backendId || warehouse.id);
            collectLocationKeys(warehouse.children);
        }
    });

    return keys;
};

const findLocationByBackendId = (
    locations: WarehouseLocation[],
    backendId: string,
): WarehouseLocation | null => {
    for (const location of locations) {
        if (location.backendId === backendId) {
            return location;
        }
        const child = findLocationByBackendId(location.children, backendId);
        if (child) {
            return child;
        }
    }

    return null;
};

const findWarehouseByBackendId = (backendId: string) =>
    warehouses.value.find((warehouse) => warehouse.backendId === backendId) || null;

const findLocationWarehouse = (location: WarehouseLocation) =>
    findWarehouseByBackendId(location.warehouseBackendId);

const getLocationPathName = (location: WarehouseLocation) => {
    const warehouse = findLocationWarehouse(location);
    const names = [warehouse?.name || location.warehouseName];

    const addPath = (
        items: WarehouseLocation[],
        targetId: string,
        parents: string[] = [],
    ): string[] => {
        for (const item of items) {
            const path = [...parents, item.name];
            if (item.backendId === targetId) {
                return path;
            }
            const childPath = addPath(item.children, targetId, path);
            if (childPath.length) {
                return childPath;
            }
        }

        return [];
    };

    return [...names, ...addPath(warehouse?.children || [], location.backendId)]
        .filter(Boolean)
        .join(" / ");
};

const getRowStyle = (row: VisibleWarehouseRow) => {
    if (row.level <= 0) {
        return {};
    }

    return {
        paddingLeft: `${ row.level * 10}px`,
    };
};

const getWarehouseNoteText = (warehouse: Warehouse | WarehouseLocation) => {
    return warehouse.note || "--";
};

const shouldShowWarehouseNotePopover = (warehouse: Warehouse | WarehouseLocation) => {
    return getWarehouseNoteText(warehouse).length > 12;
};

const filteredWarehouses = computed(() => {
    const keyword = searchText.value.trim().toLocaleLowerCase();

    if (!keyword) {
        return warehouses.value;
    }

    return warehouses.value.filter((warehouse) => {
        const matchingChildren = warehouse.children?.some((child) => locationTreeMatches(child, keyword));

        return warehouseMatchesSearch(warehouse, keyword) || Boolean(matchingChildren);
    });
});

const filteredWarehouseRows = computed<VisibleWarehouseRow[]>(() => {
    const keyword = searchText.value.trim().toLocaleLowerCase();
    const rows: VisibleWarehouseRow[] = [];

    const pushLocationRows = (warehouse: Warehouse, locations: WarehouseLocation[]) => {
        locations.forEach((location) => {
            const showLocation = !keyword || locationTreeMatches(location, keyword);
            if (!showLocation) {
                return;
            }

            const rowKey = location.backendId || location.id;
            rows.push({
                ...warehouse,
                ...location,
                rowKey,
                children: location.children,
            });

            if (!location.children.length) {
                return;
            }

            if (!keyword && !isWarehouseExpanded(rowKey)) {
                return;
            }

            pushLocationRows(warehouse, location.children);
        });
    };

    paginatedWarehouses.value.forEach((warehouse) => {
        const matchingChildren = warehouse.children?.filter((child) => locationTreeMatches(child, keyword));
        const showWarehouse = !keyword
            || warehouseMatchesSearch(warehouse, keyword)
            || Boolean(matchingChildren?.length);

        if (!showWarehouse) {
            return;
        }

        rows.push({
            ...warehouse,
            level: 0,
            rowKey: warehouse.backendId || warehouse.id,
        });

        if (!warehouse.children?.length) {
            return;
        }

        if (!keyword && !isWarehouseExpanded(warehouse.backendId || warehouse.id)) {
            return;
        }

        const children = keyword ? matchingChildren : warehouse.children;
        pushLocationRows(warehouse, children || []);
    });

    return rows;
});
const totalWarehouseRows = computed(() => filteredWarehouses.value.length);
const paginatedWarehouses = computed(() => getPageItems(filteredWarehouses.value));
const paginatedWarehouseRows = filteredWarehouseRows;

const getWarehouseRowSelectionKey = (row: VisibleWarehouseRow) =>
    `${row.level > 0 ? "location" : "warehouse"}:${row.backendId}`;

const allRowsSelected = computed(() =>
    paginatedWarehouseRows.value.length > 0 &&
    paginatedWarehouseRows.value.every((row) =>
        row.backendId && selectedWarehouseRowKeys.value.includes(getWarehouseRowSelectionKey(row)),
    ),
);

const toggleSelectAll = () => {
    const pageKeys = paginatedWarehouseRows.value
        .filter((row) => row.backendId)
        .map(getWarehouseRowSelectionKey);

    if (allRowsSelected.value) {
        selectedWarehouseRowKeys.value = selectedWarehouseRowKeys.value.filter((key) => !pageKeys.includes(key));
        return;
    }

    selectedWarehouseRowKeys.value = [...new Set([...selectedWarehouseRowKeys.value, ...pageKeys])];
};

const getAllWarehouseRowSelectionKeys = () =>
    warehouses.value.flatMap((warehouse) => [
        `warehouse:${warehouse.backendId}`,
        ...flattenLocationKeys(warehouse.children || []),
    ]).filter((key) => !key.endsWith(":"));

watch(totalWarehouseRows, (total) => setTotalItems(total), {
    immediate: true,
});

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

const normalizeLocation = (location: InventoryLocationEntity): WarehouseLocation => ({
    backendId: location._id || "",
    id: location.code || "",
    name: location.name || "",
    note: location.remark || "",
    manager: location.manager || "",
    updatedAt: formatDateTime(location.updateTime),
    sort: Number(location.sort || 0),
    level: Number(location.level || 1),
    warehouseBackendId: location.warehouseId ? String(location.warehouseId) : "",
    warehouseId: location.warehouseCode || "",
    warehouseName: location.warehouseName || "",
    parentBackendId: location.parentId ? String(location.parentId) : "",
    parentId: "",
    parentName: "",
    children: [],
});

const sortLocationTree = (items: WarehouseLocation[]) => {
    items.sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id, "zh-CN", { numeric: true }));
    items.forEach((item) => sortLocationTree(item.children));
    return items;
};

const buildLocationTree = (
    locations: WarehouseLocation[],
    warehouse: InventoryWarehouseEntity,
) => {
    const nodeMap = new Map<string, WarehouseLocation>();
    const roots: WarehouseLocation[] = [];

    locations.forEach((location) => {
        nodeMap.set(location.backendId, {
            ...location,
            warehouseBackendId: warehouse._id || location.warehouseBackendId,
            warehouseId: warehouse.code || location.warehouseId,
            warehouseName: warehouse.name || location.warehouseName,
            children: [],
        });
    });

    nodeMap.forEach((location) => {
        const parent = location.parentBackendId ? nodeMap.get(location.parentBackendId) : null;
        if (parent) {
            location.parentId = parent.id;
            location.parentName = parent.name;
            parent.children.push(location);
        } else {
            location.parentBackendId = warehouse._id || "";
            location.parentId = warehouse.code || "";
            location.parentName = warehouse.name || "";
            roots.push(location);
        }
    });

    return sortLocationTree(roots);
};

const normalizeWarehouse = (
    warehouse: InventoryWarehouseEntity,
    children: WarehouseLocation[] = [],
): Warehouse => ({
    backendId: warehouse._id || "",
    id: warehouse.code || "",
    name: warehouse.name || "",
    note: warehouse.remark || "",
    manager: warehouse.manager || "",
    updatedAt: formatDateTime(warehouse.updateTime),
    sort: Number(warehouse.sort || 0),
    level: 0,
    warehouseBackendId: warehouse._id || "",
    warehouseId: warehouse.code || "",
    warehouseName: warehouse.name || "",
    parentBackendId: "",
    parentId: "",
    parentName: "",
    countsAvailable: warehouse.includeInAvailable !== false,
    usesLocation: warehouse.enableLocation === true,
    children: buildLocationTree(children, warehouse),
});

const handleApiError = (err: any, fallbackMessage: string) => {
    ElMessage.error(err?.data?.msg || err?.message || fallbackMessage);
};

const loadLocationsByWarehouse = async (warehouse: InventoryWarehouseEntity) => {
    const warehouseId = warehouse._id || "";

    if (!warehouseId || warehouse.enableLocation !== true) {
        return [];
    }

    const res = await retrieveInventoryLocations({
        warehouseId,
    });

    if (res.code !== 200) {
        ElMessage.error(res.msg || "获取仓位列表失败");
        return [];
    }

    return Array.isArray(res.data?.list)
        ? res.data.list.map(normalizeLocation)
        : [];
};

const loadWarehouses = async (resetPage = true) => {
    if (isLoading.value) {
        return;
    }

    isLoading.value = true;
    try {
        const res = await retrieveInventoryWarehouses();

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取仓库列表失败");
            warehouses.value = [];
            return;
        }

        const warehouseList = Array.isArray(res.data?.list) ? res.data.list : [];
        const locationGroups = await Promise.all(
            warehouseList.map((warehouse) => loadLocationsByWarehouse(warehouse)),
        );

        warehouses.value = warehouseList.map((warehouse, index) =>
            normalizeWarehouse(warehouse, locationGroups[index]),
        );
        const validKeys = getAllWarehouseRowSelectionKeys();
        selectedWarehouseRowKeys.value = selectedWarehouseRowKeys.value.filter((key) => validKeys.includes(key));
        expandedWarehouseIds.value = getExpandableRowKeys(warehouses.value);

        if (resetPage) {
            goToPage(1);
        } else {
            goToPage(currentPage.value);
        }
    } catch (err: any) {
        warehouses.value = [];
        handleApiError(err, "获取仓库列表失败");
    } finally {
        isLoading.value = false;
    }
};

const warehouseDialogTitle = computed(() => {
    return warehouseDialogMode.value === "create" ? "新建仓库" : "编辑仓库";
});

const locationDialogTitle = computed(() => {
    return locationDialogMode.value === "create" ? "新建仓位" : "编辑仓位";
});

const canCreateChildLocation = (row: VisibleWarehouseRow) => {
    if (row.level === 0) {
        return row.usesLocation;
    }

    return row.level < 3;
};

const openCreateWarehouseDialog = () => {
    warehouseDialogMode.value = "create";
    warehouseForm.backendId = "";
    warehouseForm.id = "";
    warehouseForm.name = "";
    warehouseForm.manager = "";
    warehouseForm.countsAvailable = true;
    warehouseForm.usesLocation = true;
    warehouseForm.note = "";
    warehouseForm.sort = warehouses.value.length;
    showWarehouseDialog.value = true;
};

const openCreateLocationDialog = (row: VisibleWarehouseRow) => {
    const warehouse = row.level === 0
        ? findWarehouseByBackendId(row.backendId)
        : findWarehouseByBackendId(row.warehouseBackendId);

    if (!warehouse) {
        return;
    }

    const parentLocation = row.level > 0
        ? findLocationByBackendId(warehouse.children || [], row.backendId)
        : null;

    locationDialogMode.value = "create";
    locationForm.backendId = "";
    locationForm.warehouseBackendId = warehouse.backendId;
    locationForm.parentLocationBackendId = parentLocation?.backendId || "";
    locationForm.parentId = parentLocation?.id || warehouse.id;
    locationForm.parentBackendId = parentLocation?.backendId || warehouse.backendId;
    locationForm.parentName = parentLocation ? getLocationPathName(parentLocation) : warehouse.name;
    locationForm.id = "";
    locationForm.name = "";
    locationForm.manager = "";
    locationForm.note = "";
    locationForm.sort = parentLocation?.children.length ?? warehouse.children?.length ?? 0;
    showLocationDialog.value = true;
};

const openEditWarehouseDialog = (row: VisibleWarehouseRow) => {
    if (row.level === 0) {
        warehouseDialogMode.value = "edit";
        warehouseForm.backendId = row.backendId;
        warehouseForm.id = row.id;
        warehouseForm.name = row.name;
        warehouseForm.manager = row.manager;
        warehouseForm.countsAvailable = row.countsAvailable;
        warehouseForm.usesLocation = row.usesLocation;
        warehouseForm.note = row.note;
        warehouseForm.sort = row.sort;
        showWarehouseDialog.value = true;
        return;
    }

    const warehouse = findWarehouseByBackendId(row.warehouseBackendId);
    const location = warehouse ? findLocationByBackendId(warehouse.children || [], row.backendId) : null;
    const parent = location?.parentBackendId
        ? findLocationByBackendId(warehouse?.children || [], location.parentBackendId)
        : null;

    locationDialogMode.value = "edit";
    locationForm.backendId = row.backendId;
    locationForm.warehouseBackendId = warehouse?.backendId ?? row.warehouseBackendId ?? "";
    locationForm.parentLocationBackendId = parent?.backendId || "";
    locationForm.parentId = parent?.id ?? warehouse?.id ?? "";
    locationForm.parentBackendId = parent?.backendId ?? warehouse?.backendId ?? "";
    locationForm.parentName = parent ? getLocationPathName(parent) : warehouse?.name ?? "";
    locationForm.id = row.id;
    locationForm.name = row.name;
    locationForm.manager = row.manager;
    locationForm.note = row.note;
    locationForm.sort = row.sort;
    showLocationDialog.value = true;
};

const closeWarehouseDialog = () => {
    if (isSubmitting.value) {
        return;
    }

    showWarehouseDialog.value = false;
};

const closeLocationDialog = () => {
    if (isSubmitting.value) {
        return;
    }

    showLocationDialog.value = false;
};

const submitWarehouseDialog = async () => {
    const name = warehouseForm.name.trim();
    if (!name) {
        ElMessage.warning("请输入仓库名称");
        return;
    }

    if (isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    try {
        if (warehouseDialogMode.value === "create") {
            const res = await addInventoryWarehouse({
                name,
                manager: warehouseForm.manager,
                includeInAvailable: warehouseForm.countsAvailable,
                enableLocation: warehouseForm.usesLocation,
                remark: warehouseForm.note,
                sort: warehouseForm.sort,
            });

            if (res.code !== 200) {
                ElMessage.error(res.msg || "新增仓库失败");
                return;
            }

            ElMessage.success("新增仓库成功");
            showWarehouseDialog.value = false;
            await loadWarehouses();
            return;
        }

        const res = await updateInventoryWarehouse({
            id: warehouseForm.backendId,
            code: warehouseForm.id,
            name,
            manager: warehouseForm.manager,
            includeInAvailable: warehouseForm.countsAvailable,
            enableLocation: warehouseForm.usesLocation,
            remark: warehouseForm.note,
            sort: warehouseForm.sort,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "修改仓库失败");
            return;
        }

        ElMessage.success("修改仓库成功");
        showWarehouseDialog.value = false;
        await loadWarehouses(false);
    } catch (err: any) {
        handleApiError(err, warehouseDialogMode.value === "create" ? "新增仓库失败" : "修改仓库失败");
    } finally {
        isSubmitting.value = false;
    }
};

const submitLocationDialog = async () => {
    const name = locationForm.name.trim();
    if (!name) {
        ElMessage.warning("请输入仓位名称");
        return;
    }

    if (isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    try {
        if (locationDialogMode.value === "create") {
            const res = await addInventoryLocation({
                warehouseId: locationForm.warehouseBackendId,
                parentId: locationForm.parentLocationBackendId || null,
                name,
                manager: locationForm.manager,
                remark: locationForm.note,
                sort: locationForm.sort,
            });

            if (res.code !== 200) {
                ElMessage.error(res.msg || "新增仓位失败");
                return;
            }

            ElMessage.success("新增仓位成功");
            expandedWarehouseIds.value = [
                ...new Set([...expandedWarehouseIds.value, locationForm.parentBackendId]),
            ];
            showLocationDialog.value = false;
            await loadWarehouses(false);
            return;
        }

        const res = await updateInventoryLocation({
            id: locationForm.backendId,
            code: locationForm.id,
            warehouseId: locationForm.warehouseBackendId,
            parentId: locationForm.parentLocationBackendId || null,
            name,
            manager: locationForm.manager,
            remark: locationForm.note,
            sort: locationForm.sort,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "修改仓位失败");
            return;
        }

        ElMessage.success("修改仓位成功");
        showLocationDialog.value = false;
        await loadWarehouses(false);
    } catch (err: any) {
        handleApiError(err, locationDialogMode.value === "create" ? "新增仓位失败" : "修改仓位失败");
    } finally {
        isSubmitting.value = false;
    }
};

const deleteWarehouseRow = async (row: VisibleWarehouseRow) => {
    if (!row.backendId || isSubmitting.value) {
        return;
    }

    const isLocation = row.level > 0;
    try {
        await erpMessageBox.confirm(
            `是否确认删除${isLocation ? "仓位" : "仓库"} ${row.name}`,
            isLocation ? "删除仓位" : "删除仓库",
            {
                type: "warning",
                confirmButtonText: "确认",
                cancelButtonText: "取消",
            },
        );
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const res = isLocation
            ? await deleteInventoryLocation({ id: row.backendId })
            : await deleteInventoryWarehouse({ id: row.backendId });

        if (res.code !== 200) {
            ElMessage.error(res.msg || `删除${isLocation ? "仓位" : "仓库"}失败`);
            return;
        }

        ElMessage.success(`删除${isLocation ? "仓位" : "仓库"}成功`);
        selectedWarehouseRowKeys.value = selectedWarehouseRowKeys.value.filter(
            (key) => key !== getWarehouseRowSelectionKey(row),
        );
        await loadWarehouses(false);
    } catch (err: any) {
        handleApiError(err, `删除${isLocation ? "仓位" : "仓库"}失败`);
    } finally {
        isSubmitting.value = false;
    }
};

const batchDeleteWarehouseRows = async () => {
    const locationIds = selectedWarehouseRowKeys.value
        .filter((key) => key.startsWith("location:"))
        .map((key) => key.slice("location:".length))
        .filter(Boolean);
    const warehouseIds = selectedWarehouseRowKeys.value
        .filter((key) => key.startsWith("warehouse:"))
        .map((key) => key.slice("warehouse:".length))
        .filter(Boolean);
    const totalCount = locationIds.length + warehouseIds.length;

    if (!totalCount || isSubmitting.value) {
        ElMessage.warning("请先选择需要删除的仓库或仓位");
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除选中的 ${totalCount} 条仓库数据？`, "批量删除仓库数据", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        if (locationIds.length) {
            const locationRes = await deleteInventoryLocation({ ids: locationIds });
            if (locationRes.code !== 200) {
                ElMessage.error(locationRes.msg || "批量删除仓位失败");
                return;
            }
        }

        if (warehouseIds.length) {
            const warehouseRes = await deleteInventoryWarehouse({ ids: warehouseIds });
            if (warehouseRes.code !== 200) {
                ElMessage.error(warehouseRes.msg || "批量删除仓库失败");
                return;
            }
        }

        selectedWarehouseRowKeys.value = [];
        ElMessage.success("批量删除仓库数据成功");
        await loadWarehouses(false);
    } catch (err: any) {
        handleApiError(err, "批量删除仓库数据失败");
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
    loadWarehouses();
});
</script>

<style scoped>
.warehouse-page {
    --warehouse-checkbox-column-width: 58px;
    --warehouse-id-column-width: 48px;
    --warehouse-checkbox-size: 18px;
    --warehouse-tree-toggle-width: var(--erp-size-icon-default);
    --warehouse-tree-icon-size: var(--erp-size-icon-default);
    --warehouse-action-icon-size: var(--erp-size-icon-default);
    --warehouse-id-cell-gap: var(--erp-spacing-12);

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

.row-shell {
    box-sizing: border-box;
    width: 100%;
}

.row-shell.child {
    padding-left: 64px;
}

.data-row.child {
    background: var(--erp-color-fill-table-child);
}

.table-cell {
    padding: 0 8px;
}

.row-checkbox {
    width: var(--warehouse-checkbox-size);
    height: var(--warehouse-checkbox-size);
}

.note-cell-text {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
}

:global(.warehouse-note-popover .note-popover-content) {
    line-height: 1.4;
    word-break: break-word;
    white-space: normal;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
}

.id-cell {
    gap: var(--warehouse-id-cell-gap);
    justify-content: flex-start;
}

.tree-toggle,
.tree-spacer {
    width: var(--warehouse-tree-toggle-width);
    height: var(--warehouse-tree-toggle-width);
    flex: 0 0 var(--warehouse-tree-toggle-width);
}

.tree-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    color: var(--erp-color-icon-default);
    background: transparent;
    cursor: pointer;
}

.tree-toggle :deep(svg) {
    width: var(--warehouse-tree-icon-size);
    height: var(--warehouse-tree-icon-size);
}

.icon-button :deep(svg) {
    width: var(--warehouse-action-icon-size);
    height: var(--warehouse-action-icon-size);
}

.switch {
    width: 40px;
    height: 20px;
    position: relative;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: var(--erp-color-fill-disabled);
    cursor: pointer;
}

.switch span {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
    transition: transform 0.16s ease;
}

.switch.active {
    background: var(--erp-color-action-primary);
}

.switch.active span {
    transform: translateX(20px);
}

.tree-toggle:not(:disabled):hover {
    background: var(--erp-color-fill-hover);
}

.tree-toggle:disabled {
    color: var(--erp-color-icon-disabled);
}

.parent-warehouse-name {
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.radio-group {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-12);
}

.radio-option {
    display: inline-flex;
    align-items: center;
    gap: var(--erp-spacing-8);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
}

.radio-option input {
    width: 18px;
    height: 18px;
    accent-color: var(--erp-color-action-primary);
    cursor: pointer;
}

@media (max-width: 1200px) {
    .warehouse-page {
        min-width: 900px;
    }

    .row-shell.child {
        padding-left: 48px;
    }
}
</style>
