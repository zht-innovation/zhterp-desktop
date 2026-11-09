<template>
    <div class="stocktake-page" :class="{ 'finance-readonly': isFinanceReadonly }">
        <header class="topbar">
            <ErpBreadcrumb icon="lucide:clipboard-list" :items="stocktakeBreadcrumbItems" />
            <ErpSearchBox v-model="searchText" :disabled="isLoading" @search="applySearch" />
        </header>

        <div class="filter-row">
            <div class="filter-field">
                <span>创建日期</span>
                <InventoryDatePicker v-model="filterDate" aria-label-text="选择创建日期" />
            </div>

            <label class="filter-field">
                <span>目标仓库</span>
                <select v-model="filterWarehouseId" class="filter-select" aria-label="筛选目标仓库">
                    <option value="">请选择</option>
                    <option v-for="w in warehouses" :key="w._id" :value="w._id">{{ w.name }}</option>
                </select>
            </label>

            <div class="filter-actions">
                <button class="outline-button" type="button" @click="resetFilters">
                    <Icon name="lucide:refresh-cw" class="button-icon" />
                    <span>重置</span>
                </button>
                <button
                    class="muted-button"
                    :class="{ active: hasPendingFilters }"
                    type="button"
                    @click="applyFilters"
                >
                    <Icon name="lucide:sliders-horizontal" class="button-icon" />
                    <span>筛选</span>
                </button>
            </div>
        </div>

        <div v-if="!isFinanceReadonly" class="toolbar">
            <div class="toolbar-left">
                <button class="primary-button" type="button" @click="openCreateDialog">
                    <Icon name="lucide:circle-plus" class="button-icon" />
                    <span>新建</span>
                </button>
                <button
                    class="outline-button danger-button"
                    type="button"
                    :disabled="selectedIds.length === 0"
                    @click="batchDelete"
                >
                    <Icon name="lucide:trash-2" class="button-icon" />
                    <span>批量删除</span>
                </button>
            </div>
        </div>

        <ErpTableFrame
            data-inventory-copy-table
            :columns="stocktakeTableColumnTemplate"
            :minimum-width="stocktakeTableMinimumWidth"
            :loading="isLoading"
            :empty="!isLoading && stocktakes.length === 0"
            loading-text="正在加载盘点单..."
            empty-text="暂无匹配盘点单"
            scroll-x
        >
            <template #header>
                <div class="table-row table-head">
                    <div v-if="!isFinanceReadonly" class="selection-head checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                class="row-checkbox"
                                type="checkbox"
                                :checked="allRowsSelected"
                                :disabled="stocktakes.length === 0"
                                aria-label="选择全部盘点单"
                                @change="toggleSelectAll"
                            >
                        </label>
                    </div>
                    <div v-for="column in stocktakeColumns" :key="column.key" class="table-cell">
                        {{ column.label }}
                    </div>
                    <div class="actions-head erp-table-fixed-end">操作</div>
                </div>
            </template>

            <template v-for="item in stocktakes" :key="item._id">
                <div class="table-row data-row">
                    <div v-if="!isFinanceReadonly" class="selection-row checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                class="row-checkbox"
                                type="checkbox"
                                :checked="selectedIds.includes(item._id)"
                                :aria-label="`选择${item.code}`"
                                @change="toggleSelect(item._id)"
                            >
                        </label>
                    </div>
                    <div class="table-cell">{{ item.code || "--" }}</div>
                    <div class="table-cell">{{ getStocktakeWarehouseName(item) }}</div>
                    <div class="table-cell">{{ getStocktakeItemCount(item) }}</div>
                    <div class="table-cell">{{ item.operator || "--" }}</div>
                    <div class="table-cell">{{ formatLocalDateTime(item.createTime, true) || "--" }}</div>
                    <div class="table-cell">{{ item.updatedBy || "--" }}</div>
                    <div class="table-cell">{{ formatLocalDateTime(item.updateTime, true) || "--" }}</div>
                    <div class="actions-cell erp-table-fixed-end">
                        <button class="icon-button blue" type="button" :aria-label="`查看${item.code}`" @click="viewDetail(item._id)">
                            <Icon name="lucide:list" />
                        </button>
                        <button
                            v-if="!isFinanceReadonly && item.status !== 'completed'"
                            class="icon-button green"
                            type="button"
                            :aria-label="`完成${item.code}`"
                            @click="completeStocktake(item._id)"
                        >
                            <Icon name="lucide:check-circle" />
                        </button>
                        <button v-if="!isFinanceReadonly" class="icon-button blue" type="button" :aria-label="`编辑${item.code}`" @click="editStocktake(item._id)">
                            <Icon name="lucide:square-pen" />
                        </button>
                        <button v-if="!isFinanceReadonly" class="icon-button delete" type="button" :aria-label="`删除${item.code}`" @click="deleteStocktake(item._id)">
                            <Icon name="lucide:trash-2" />
                        </button>
                    </div>
                </div>
            </template>
        </ErpTableFrame>

        <InventoryPagination
            :total="total"
            :page-size="pageSize"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            :jump-page-input="jumpPageInput"
            @update:page-size="changePageSize"
            @update:jump-page-input="jumpPageInput = $event"
            @page-change="goToPage"
            @jump="jumpToInputPage"
        />

        <div v-if="showDialog" class="erp-dialog-mask inventory-responsive-dialog-mask" @click.self="closeDialog">
            <ErpDialogFrame
                class="stocktake-dialog"
                :title="stocktakeDialogTitle"
                width="min(1440px, calc(100vw - 32px))"
                height="min(660px, calc(100vh - 32px))"
                :form="false"
                @close="closeDialog"
            >
                <div class="stocktake-dialog-body">
                    <section class="form-section">
                        <h3>基本信息</h3>
                        <div class="stocktake-form-grid">
                            <label class="stocktake-form-row">
                                <span>盘点单号</span>
                                <input :value="form.code || '系统自动生成'" class="dialog-input readonly" type="text" readonly>
                            </label>
                            <div class="stocktake-form-row">
                                <span>目标仓库<i>*</i></span>
                                <InventoryWarehouseCascader
                                    :warehouse-options="warehouseOptions"
                                    :warehouse-id="form.warehouseId"
                                    :location-id="form.locationId"
                                    :label="form.targetWarehouse"
                                    :disabled="dialogMode !== 'create'"
                                    :max-location-level="1"
                                    :allow-warehouse-select="true"
                                    aria-label="选择目标仓库"
                                    @select="onWarehouseSelect"
                                />
                            </div>
                            <label class="stocktake-form-row">
                                <span>盘点日期</span>
                                <InventoryDatePicker v-model="form.stocktakeDate" aria-label-text="盘点日期" disabled />
                            </label>
                        </div>
                    </section>

                    <section v-if="form.warehouseId || form.items.length > 0" class="form-section stocktake-items-section">
                        <ErpTableFrame
                            class="stocktake-items-table"
                            :columns="stocktakeItemColumnTemplate"
                            :empty="form.items.length === 0"
                            empty-text="暂无盘点产品"
                            scroll-x
                            embedded
                        >
                            <template #header>
                                <div class="table-row table-head stocktake-item-row">
                                    <div v-for="column in stocktakeItemColumns" :key="column.key" class="table-cell stocktake-item-cell">
                                        {{ column.label }}
                                    </div>
                                </div>
                            </template>

                            <div v-for="(item, index) in form.items" :key="index" class="table-row data-row stocktake-item-row stocktake-item-data-row">
                                <div class="table-cell stocktake-item-cell">{{ item.productCode || "--" }}</div>
                                <div class="table-cell stocktake-item-cell">{{ item.productModel || "--" }}</div>
                                <div class="table-cell stocktake-item-cell location-cell">
                                    {{ item.locationName || item.locationCode || "--" }}
                                </div>
                                <div class="table-cell stocktake-item-cell">{{ item.categoryName || "--" }}</div>
                                <div class="table-cell stocktake-item-cell image-cell">
                                    <img
                                        v-if="item.productImage"
                                        :src="resolveErpImageUrl(item.productImage)"
                                        class="clickable-image"
                                        :alt="item.productModel || item.productCode || '产品图片'"
                                        @click.stop="openImagePreview(item.productImage, item.productModel || item.productCode || '产品图片')"
                                    >
                                    <span v-else>--</span>
                                </div>
                                <div class="table-cell stocktake-item-cell">{{ item.systemQuantity }}</div>
                                <div class="table-cell stocktake-item-cell">{{ item.unitName || "--" }}</div>
                                <div class="table-cell stocktake-item-cell">
                                    <input
                                        v-model.number="item.actualQuantity"
                                        class="dialog-input quantity-input"
                                        type="number"
                                        :readonly="dialogMode === 'view'"
                                        :disabled="dialogMode === 'view'"
                                        :aria-label="`设置${item.productCode || item.productModel || '产品'}实盘数量`"
                                        @input="onActualQuantityChange(index)"
                                    >
                                </div>
                                <div class="table-cell stocktake-item-cell">
                                    <span :class="{ positive: item.difference > 0, negative: item.difference < 0 }">
                                        {{ item.difference !== null ? item.difference : "--" }}
                                    </span>
                                </div>
                                <div class="table-cell stocktake-item-cell">
                                    <input
                                        v-model="item.remark"
                                        class="dialog-input remark-input"
                                        type="text"
                                        placeholder="备注"
                                        :readonly="dialogMode === 'view'"
                                        :disabled="dialogMode === 'view'"
                                    >
                                </div>
                            </div>
                        </ErpTableFrame>
                    </section>
                </div>

                <template #footer>
                    <button class="dialog-button cancel" type="button" @click="closeDialog">
                        {{ dialogMode === "view" ? "关闭" : "取消" }}
                    </button>
                    <button
                        v-if="dialogMode !== 'view'"
                        class="dialog-button confirm"
                        type="button"
                        :disabled="!form.warehouseId || isSubmitting"
                        @click="saveStocktake"
                    >
                        {{ isSubmitting ? "保存中..." : "确认" }}
                    </button>
                </template>
            </ErpDialogFrame>
        </div>

        <ImagePreviewDialog
            v-model="showImagePreview"
            :title="previewTitle"
            :images="previewImages"
        />
    </div>
</template>

<script setup lang="ts">
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import { ADMIN_ROLE } from "~~/shared/enums";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import InventoryDatePicker from "~/components/configuration/inventory/InventoryDatePicker.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import InventoryWarehouseCascader from "~/components/configuration/inventory/InventoryWarehouseCascader.vue";
import { erpMessageBox } from "~/utils/erpMessageBox";
import { getErpTableGridColumn, getErpTableMinimumWidth } from "~/utils/inventory/erpTableColumns";
import {
    addInventoryStocktake,
    completeInventoryStocktake,
    deleteInventoryStocktake,
    getInventoryStocktakeDetail,
    retrieveInventoryStocktakes,
    updateInventoryStocktake,
    retrieveInventoryLocations,
    retrieveInventoryWarehouses,
    retrieveInventoryStocks,
    type InventoryStocktake,
} from "~/composables/api/useInventoryApi";
import type { InventoryLocation, InventoryWarehouse } from "~~/shared/types/inventory";
import {
    buildInboundLocationTree,
    formatInboundWarehouseDisplayName,
    type InboundWarehouseOption,
} from "~/utils/inventory/inboundFrontendMapping";
import { formatLocalDate, formatLocalDateTime } from "~/utils/time";

definePageMeta({
    layout: "inventory",
});

interface StocktakeColumn {
    key: string;
    label: string;
    width: number;
    widthVar?: string;
    grow?: boolean;
}

const stocktakeBreadcrumbItems = [
    { label: "仓储管理" },
    { label: "盘点单" },
];

const stocktakeColumns: StocktakeColumn[] = [
    { key: "code", label: "盘点单号", width: 220 },
    { key: "warehouse", label: "目标仓库", width: 240, grow: true},
    { key: "itemCount", label: "盘点产品数量", width: 200 },
    { key: "operator", label: "操作人", width: 240, widthVar: "--erp-table-col-operator", grow: true},
    { key: "createTime", label: "创建日期", width: 260, widthVar: "--erp-table-col-date", grow: true},
    { key: "updatedBy", label: "修改人", width: 240, widthVar: "--erp-table-col-operator", grow: true },
    { key: "updateTime", label: "修改日期", width: 260, widthVar: "--erp-table-col-date", grow: true },
];

const adminInfo = useState<any>("admin_info", () => ({}));
const isFinanceReadonly = computed(() => Number(adminInfo.value?.role) === ADMIN_ROLE.FINANCE_MANAGER);
const stocktakeTableColumnTemplate = computed(() => [
    ...(isFinanceReadonly.value ? [] : ["58px"]),
    ...stocktakeColumns.map(getErpTableGridColumn),
    "var(--erp-table-col-action)",
].join(" "));
const stocktakeTableMinimumWidth = computed(() => getErpTableMinimumWidth(
    stocktakeColumns,
    isFinanceReadonly.value ? [] : ["58px"],
    ["var(--erp-table-col-action)"],
));

const stocktakeItemColumns: StocktakeColumn[] = [
    { key: "productCode", label: "产品编号", width: 160 },
    { key: "model", label: "型号", width: 180 },
    { key: "location", label: "库位", width: 120 },
    { key: "category", label: "分类", width: 120 },
    { key: "image", label: "产品图片", width: 160 },
    { key: "systemQuantity", label: "账面", width: 100 },
    { key: "unit", label: "单位", width: 90 },
    { key: "actualQuantity", label: "实盘", width: 100 },
    { key: "difference", label: "差异", width: 100 },
    { key: "remark", label: "备注", width: 200 },
];

const stocktakeItemColumnTemplate = stocktakeItemColumns
    .map((column) => `${column.width}px`)
    .join(" ");

const searchText = ref("");
const filterDate = ref("");
const filterWarehouseId = ref("");
const appliedSearchText = ref("");
const appliedFilterDate = ref("");
const appliedFilterWarehouseId = ref("");
const stocktakes = ref<InventoryStocktake[]>([]);
const warehouses = ref<InventoryWarehouse[]>([]);
const warehouseOptions = ref<InboundWarehouseOption[]>([]);
const isLoading = ref(false);
const isSubmitting = ref(false);
const selectedIds = ref<string[]>([]);
const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);
const jumpPageInput = ref("1");
const pageSizeOptions = [10, 20, 50];
const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");

const toEntityId = (value: any) =>
    value?.$oid || value?._id || (value ? String(value) : "");

const normalizeWarehouse = (item: InventoryWarehouse | InventoryLocation) => ({
    id: item._id || "",
    code: item.code || "",
    name: item.name || "",
});

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

const hasPendingFilters = computed(() =>
    searchText.value.trim() !== appliedSearchText.value ||
    filterDate.value !== appliedFilterDate.value ||
    filterWarehouseId.value !== appliedFilterWarehouseId.value
);

const pageNumbers = computed(() => {
    const pages: number[] = [];
    const start = Math.max(1, currentPage.value - 2);
    const end = Math.min(totalPages.value, currentPage.value + 2);
    for (let i = start; i <= end; i++) {
        pages.push(i);
    }
    return pages;
});

const openImagePreview = (url: string, title: string) => {
    previewImages.value = [{ url, alt: title }];
    previewTitle.value = title;
    showImagePreview.value = true;
};

const showDialog = ref(false);
const dialogMode = ref<"create" | "edit" | "view">("create");
const editingId = ref("");
const stocktakeDialogTitle = computed(() => {
    if (dialogMode.value === "view") return "查看盘点单";
    return dialogMode.value === "create" ? "新建盘点单" : "编辑盘点单";
});

const form = ref({
    code: "",
    warehouseId: "",
    locationId: "",
    targetWarehouse: "",
    stocktakeDate: formatLocalDate(new Date()),
    remark: "",
    items: [] as any[],
});

const loadLocationsByWarehouse = async (warehouse: InventoryWarehouse) => {
    const warehouseId = warehouse._id || "";
    if (!warehouseId || warehouse.enableLocation !== true) {
        return [];
    }

    const res = await retrieveInventoryLocations({ warehouseId });
    if (res.code !== 200) {
        ElMessage.error(res.msg || "获取仓位选项失败");
        return [];
    }

    return Array.isArray(res.data?.list)
        ? buildInboundLocationTree(res.data.list)
        : [];
};

// 加载仓库列表
const loadWarehouses = async () => {
    try {
        const res = await retrieveInventoryWarehouses();
        if (res.code === 200) {
            const list = Array.isArray(res.data?.list) ? res.data.list : [];
            const locationGroups = await Promise.all(
                list.map((warehouse) => loadLocationsByWarehouse(warehouse)),
            );

            warehouses.value = list;
            warehouseOptions.value = list.map((warehouse, index) => ({
                ...normalizeWarehouse(warehouse),
                enableLocation: warehouse.enableLocation === true,
                children: locationGroups[index],
            }));
        }
    } catch (err) {
        console.error("加载仓库失败", err);
    }
};

// 加载盘点单列表
const loadStocktakes = async () => {
    isLoading.value = true;
    try {
        const res = await retrieveInventoryStocktakes({
            keyword: searchText.value.trim() || undefined,
            createDate: filterDate.value || undefined,
            warehouseId: filterWarehouseId.value || undefined,
            page: currentPage.value,
            limit: pageSize.value,
        });
        if (res.code === 200) {
            stocktakes.value = res.data.list;
            total.value = res.data.pagination.total;
            // 记录已应用的筛选条件
            appliedSearchText.value = searchText.value.trim();
            appliedFilterDate.value = filterDate.value;
            appliedFilterWarehouseId.value = filterWarehouseId.value;
        }
    } catch (err) {
        console.error("加载盘点单失败", err);
    } finally {
        isLoading.value = false;
    }
};

const applySearch = () => {
    currentPage.value = 1;
    loadStocktakes();
};

const applyFilters = () => {
    currentPage.value = 1;
    loadStocktakes();
};

// 重置筛选
const resetFilters = () => {
    searchText.value = "";
    filterDate.value = "";
    filterWarehouseId.value = "";
    currentPage.value = 1;
    loadStocktakes();
};

// 分页
const goToPage = (page: number) => {
    if (page < 1 || page > totalPages.value) return;
    currentPage.value = page;
    jumpPageInput.value = String(page);
    loadStocktakes();
};

const changePageSize = (size: number) => {
    pageSize.value = size;
    currentPage.value = 1;
    jumpPageInput.value = "1";
    loadStocktakes();
};

const jumpToInputPage = () => {
    const page = Number(jumpPageInput.value);

    if (!Number.isFinite(page) || page < 1) {
        jumpPageInput.value = String(currentPage.value);
        return;
    }

    goToPage(Math.min(Math.trunc(page), totalPages.value));
};

// 选择
const allRowsSelected = computed(() =>
    stocktakes.value.length > 0 && selectedIds.value.length === stocktakes.value.length
);

const toggleSelectAll = () => {
    if (allRowsSelected.value) {
        selectedIds.value = [];
    } else {
        selectedIds.value = stocktakes.value.map((item) => item._id);
    }
};

const toggleSelect = (id: string) => {
    const index = selectedIds.value.indexOf(id);
    if (index === -1) {
        selectedIds.value.push(id);
    } else {
        selectedIds.value.splice(index, 1);
    }
};

// 获取盘点单产品数量
const getStocktakeItemCount = (item: InventoryStocktake) => {
    return item.items?.length || 0;
};

const getStocktakeWarehouseName = (item: InventoryStocktake) =>
    formatInboundWarehouseDisplayName(item.warehouseName, item.locationName);

// 打开创建对话框
const openCreateDialog = () => {
    dialogMode.value = "create";
    editingId.value = "";
    form.value = {
        code: "",
        warehouseId: "",
        locationId: "",
        targetWarehouse: "",
        stocktakeDate: formatLocalDate(new Date()),
        remark: "",
        items: [],
    };
    showDialog.value = true;
};

// 编辑盘点单
const editStocktake = async (id: string) => {
    dialogMode.value = "edit";
    editingId.value = id;
    try {
        const res = await getInventoryStocktakeDetail(id);
        if (res.code === 200) {
            const detail = res.data.detail;
            const wid = toEntityId(detail.warehouseId);
            const lid = toEntityId(detail.locationId);
            form.value = {
                code: detail.code,
                warehouseId: wid,
                locationId: lid,
                targetWarehouse: formatInboundWarehouseDisplayName(detail.warehouseName, detail.locationName),
                stocktakeDate: formatLocalDate(detail.stocktakeDate),
                remark: detail.remark || "",
                items: detail.items || [],
            };
            showDialog.value = true;
        }
    } catch (err) {
        console.error("获取盘点单详情失败", err);
    }
};

// 关闭对话框
const closeDialog = () => {
    showDialog.value = false;
    editingId.value = "";
};

// 仓库变更 - 加载该仓库/一级仓位的产品和库存数量
const onWarehouseSelect = async (warehouseId: string, locationId: string, label: string) => {
    form.value.warehouseId = warehouseId;
    form.value.locationId = locationId;
    form.value.targetWarehouse = label || "";
    await loadStockItems();
};

const loadStockItems = async () => {
    if (!form.value.warehouseId) {
        form.value.items = [];
        return;
    }

    try {
        // 加载归属于所选仓库/仓位的全部产品，并合并当前库存数量
        const stockRes = await retrieveInventoryStocks({
            warehouseId: form.value.warehouseId,
            locationId: form.value.locationId || undefined,
            includeAssignedProducts: true,
            includeDescendantLocations: true,
        });

        if (stockRes.code === 200 && stockRes.data?.list) {
            form.value.items = stockRes.data.list.map((stock: any) => {
                const detail = Array.isArray(stock.details) ? stock.details[0] : null;

                return {
                    productId: stock.productId || "",
                    productCode: stock.productCode || "",
                    productName: stock.productName || "",
                    productModel: stock.model || "",
                    productImage: stock.image || "",
                    locationId: stock.locationId || detail?.locationId || "",
                    locationCode: stock.locationCode || detail?.locationCode || "",
                    locationName: stock.locationName || detail?.locationName || "",
                    categoryName: stock.categoryName || "",
                    systemQuantity: stock.totalQuantity || 0,
                    actualQuantity: null,
                    difference: null,
                    unitName: stock.unitName || "",
                    remark: "",
                };
            });
        }
    } catch (err) {
        console.error("加载产品失败", err);
    }
};

// 实际盘点数量变更
const onActualQuantityChange = (index: number) => {
    const item = form.value.items[index];
    if (item.actualQuantity !== null && item.actualQuantity !== undefined) {
        item.difference = item.actualQuantity - item.systemQuantity;
    } else {
        item.difference = null;
    }
};

// 保存盘点单
const saveStocktake = async () => {
    if (!form.value.warehouseId) {
        ElMessage.warning("请选择仓库");
        return;
    }

    isSubmitting.value = true;
    try {
        if (dialogMode.value === "create") {
            const payload = {
                warehouseId: form.value.warehouseId,
                locationId: form.value.locationId || undefined,
                stocktakeDate: form.value.stocktakeDate,
                remark: form.value.remark,
                items: form.value.items,
            };
            console.log('创建盘点单，items数量:', form.value.items.length);
            console.log('创建盘点单，第一个item:', form.value.items[0]);
            const res = await addInventoryStocktake(payload);
            console.log('创建盘点单，响应:', res);
            if (res.code === 200) {
                ElMessage.success("创建盘点单成功");
                closeDialog();
                loadStocktakes();
            } else {
                ElMessage.error(res.msg || "创建失败");
            }
        } else {
            const res = await updateInventoryStocktake({
                id: editingId.value,
                stocktakeDate: form.value.stocktakeDate,
                remark: form.value.remark,
                items: form.value.items,
            });
            if (res.code === 200) {
                ElMessage.success("更新盘点单成功");
                closeDialog();
                loadStocktakes();
            }
        }
    } catch (err: any) {
        console.error('保存盘点单失败:', err);
        ElMessage.error(err.message || "保存失败");
    } finally {
        isSubmitting.value = false;
    }
};

// 完成盘点单
const completeStocktake = async (id: string) => {
    try {
        await erpMessageBox.confirm("完成盘点单后将自动生成盘盈入库单或盘亏出库单，是否继续？", "完成盘点", {
            type: "warning",
            confirmButtonText: "确认完成",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const res = await completeInventoryStocktake(id);
        if (res.code === 200) {
            const data = res.data;
            let message = "盘点单已完成";
            if (data.inboundOrderCode) {
                message += `，已生成盘盈入库单：${data.inboundOrderCode}`;
            }
            if (data.outboundOrderCode) {
                message += `，已生成盘亏出库单：${data.outboundOrderCode}`;
            }
            ElMessage.success(message);
            loadStocktakes();
        }
    } catch (err: any) {
        ElMessage.error(err.message || "完成盘点失败");
    } finally {
        isSubmitting.value = false;
    }
};

// 删除盘点单
const deleteStocktake = async (id: string) => {
    try {
        await erpMessageBox.confirm("确定要删除这条盘点单吗？", "删除确认", {
            type: "warning",
            confirmButtonText: "确认删除",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        await deleteInventoryStocktake({ id });
        ElMessage.success("删除成功");
        loadStocktakes();
    } catch (err: any) {
        ElMessage.error(err.message || "删除失败");
    } finally {
        isSubmitting.value = false;
    }
};

// 批量删除
const batchDelete = async () => {
    if (selectedIds.value.length === 0) return;

    try {
        await erpMessageBox.confirm(`确定要删除选中的 ${selectedIds.value.length} 条盘点单吗？`, "批量删除", {
            type: "warning",
            confirmButtonText: "确认删除",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        await deleteInventoryStocktake({ ids: selectedIds.value });
        ElMessage.success("批量删除成功");
        selectedIds.value = [];
        loadStocktakes();
    } catch (err: any) {
        ElMessage.error(err.message || "批量删除失败");
    } finally {
        isSubmitting.value = false;
    }
};

// 查看详情（只读）
const viewDetail = async (id: string) => {
    dialogMode.value = "view";
    editingId.value = id;
    try {
        const res = await getInventoryStocktakeDetail(id);
        console.log('API响应:', res);
        if (res.code === 200) {
            const detail = res.data.detail;
            console.log('详情:', detail);
            console.log('warehouseId类型:', typeof detail.warehouseId, detail.warehouseId);
            console.log('items:', detail.items);
            const wid = toEntityId(detail.warehouseId);
            const lid = toEntityId(detail.locationId);
            console.log('处理后warehouseId:', wid);
            form.value = {
                code: detail.code,
                warehouseId: wid,
                locationId: lid,
                targetWarehouse: formatInboundWarehouseDisplayName(detail.warehouseName, detail.locationName),
                stocktakeDate: formatLocalDate(detail.stocktakeDate),
                remark: detail.remark || "",
                items: detail.items || [],
            };
            console.log('form.value:', form.value);
            showDialog.value = true;
        }
    } catch (err) {
        console.error("获取盘点单详情失败", err);
    }
};

onMounted(() => {
    loadWarehouses();
    loadStocktakes();
});
</script>

<style scoped>
.stocktake-page {
    --inventory-date-picker-panel-width: 288px;

    height: 100%;
    display: grid;
    grid-template-rows: 40px 56px 32px minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-container-gap);
    color: var(--erp-color-text-primary);
    background: transparent;
}

.stocktake-page.finance-readonly {
    grid-template-rows: 40px 56px minmax(0, 1fr) 52px;
}

.topbar,
.filter-row,
.toolbar,
.toolbar-left,
.filter-actions {
    display: flex;
    align-items: center;
}

.topbar,
.toolbar {
    justify-content: space-between;
}

.filter-row {
    gap: var(--erp-spacing-40);
    padding: var(--erp-spacing-12);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.filter-field {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.filter-field > span {
    white-space: nowrap;
}

.filter-select {
    width: 200px;
    height: var(--erp-size-control-height-sm);
    padding: 0 34px 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background-color: var(--erp-color-fill-default);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23505050' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    background-size: 16px;
    font: inherit;
    appearance: none;
}

.filter-select:focus {
    border-color: var(--erp-color-border-brand);
    outline: 0;
}

.filter-field :deep(.inventory-date-picker) {
    width: 200px;
    max-width: 200px;
    flex-basis: 200px;
}

.filter-actions {
    gap: var(--erp-spacing-12);
    margin-left: auto;
}

.primary-button,
.outline-button,
.muted-button {
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

.primary-button {
    border: 0;
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.outline-button {
    border: 1px solid var(--erp-color-border-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
}

.outline-button:disabled {
    color: var(--erp-color-text-disabled);
    cursor: not-allowed;
    opacity: 1;
}

.danger-button {
    border-color: var(--erp-color-border-error);
    color: var(--erp-color-text-status-error);
}

.danger-button:not(:disabled):hover {
    border-color: var(--erp-color-border-error);
    background: var(--erp-color-bg-status-error);
}

.danger-button:disabled {
    border-color: color-mix(in srgb, var(--erp-color-border-error) 70%, transparent);
    color: color-mix(in srgb, var(--erp-color-text-status-error) 70%, transparent);
    background: var(--erp-color-fill-default);
}

.muted-button {
    border: 0;
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

.muted-button.active {
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.button-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.toolbar-left {
    gap: var(--erp-spacing-12);
}

.stocktake-page :deep(.erp-table-frame .table-row) {
    display: grid;
    padding: 0;
}

.stocktake-page :deep(.erp-table-frame .data-row) {
    min-height: 64px;
    border-bottom-color: var(--erp-color-divider-default);
    background: var(--erp-color-fill-default);
}

.stocktake-page :deep(.erp-table-frame .data-row:hover) {
    background: var(--erp-color-fill-hover);
}

.stocktake-page :deep(.erp-table-frame .checkbox-cell) {
    width: auto;
    align-self: stretch;
    padding: 0;
}

.actions-head,
.actions-cell {
    position: sticky;
    right: 0;
    z-index: 4;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-12);
    padding: 0 var(--erp-spacing-20);
    background: var(--erp-color-fill-default);
}

.actions-head {
    z-index: 21;
    background: var(--erp-color-fill-table-header);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.stocktake-page :deep(.data-row:hover .actions-cell) {
    background: var(--erp-color-fill-hover);
}

.icon-button.green {
    color: var(--erp-color-text-status-complete);
}

.stocktake-dialog {
    min-width: 0;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    display: grid;
    flex-direction: initial;
}

@supports (height: 100dvh) {
    .stocktake-dialog,
    .stocktake-dialog :deep(.erp-dialog-frame) {
        height: min(660px, calc(100dvh - 32px)) !important;
        max-height: calc(100dvh - 32px);
    }
}

.stocktake-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
    overflow: hidden;
}

.stocktake-dialog :deep(.erp-dialog-frame) {
    min-width: 0;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
}

.stocktake-dialog-body {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--erp-spacing-12);
}

.stocktake-dialog .form-section {
    min-width: 0;
    display: block;
    padding: var(--erp-spacing-12);
    margin: 0;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.stocktake-dialog .form-section h3 {
    margin: 0;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.stocktake-form-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--erp-spacing-20);
    margin-top: var(--erp-spacing-20);
}

.stocktake-form-row {
    min-width: 0;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.stocktake-form-row > span {
    min-height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    white-space: nowrap;
}

.stocktake-form-row i {
    color: var(--erp-color-text-required);
    font-style: normal;
}

.stocktake-form-row :deep(.inventory-date-picker),
.stocktake-form-row :deep(.inventory-warehouse-cascader),
.stocktake-form-row :deep(.warehouse-readonly) {
    width: 100%;
    max-width: none;
}

.stocktake-form-row :deep(.warehouse-trigger),
.stocktake-form-row :deep(.date-trigger) {
    height: var(--erp-size-control-height-sm);
    border-color: var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
}

.stocktake-form-row :deep(.warehouse-readonly) {
    min-height: var(--erp-size-control-height-sm);
    display: flex;
    align-items: center;
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: anywhere;
}

.stocktake-form-row :deep(.warehouse-trigger) {
    min-height: var(--erp-size-control-height-sm);
    height: auto;
}

.stocktake-form-row :deep(.warehouse-trigger span) {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: anywhere;
}

.stocktake-form-row :deep(.date-panel) {
    z-index: 60;
}

.stocktake-items-section {
    min-height: 0;
    overflow: hidden;
}

.stocktake-items-table {
    min-height: 0;
    height: 100%;
}

.stocktake-items-table :deep(.stocktake-item-row) {
    width: 100%;
    min-width: 0;
    display: grid;
}

.stocktake-items-table :deep(.stocktake-item-data-row) {
    min-height: 80px;
    height: auto;
}

.stocktake-item-cell {
    overflow: hidden;
    text-overflow: ellipsis;
}

.stocktake-item-cell.location-cell {
    overflow: visible;
    text-align: center;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: anywhere;
}

.stocktake-items-table .image-cell img {
    width: 90px;
    height: 58px;
    object-fit: contain;
}

.clickable-image {
    cursor: pointer;
}

.stocktake-items-table .quantity-input {
    width: 68px;
    text-align: center;
}

.stocktake-items-table .remark-input {
    width: 160px;
}

.positive {
    color: var(--erp-color-text-status-complete);
}

.negative {
    color: var(--erp-color-text-status-error);
}

@media (max-width: 1280px) {
    .stocktake-form-grid {
        grid-template-columns: repeat(2, minmax(300px, 1fr));
    }
}

@media (max-width: 860px) {
    .filter-row {
        flex-wrap: wrap;
        gap: var(--erp-spacing-12) var(--erp-spacing-20);
    }

    .filter-actions {
        width: 100%;
        margin-left: 0;
    }

    .stocktake-form-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
