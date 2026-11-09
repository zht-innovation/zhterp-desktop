<template>
    <div class="realtime-inventory-page">
        <header class="topbar">
            <ErpBreadcrumb icon="lucide:warehouse" :items="inventoryBreadcrumbItems" />

            <ErpSearchBox
                v-model="searchText"
                :disabled="isLoadingInventoryRecords"
                @search="applySearch"
            />
        </header>

        <div class="filter-row">
            <div class="filter-field">
                <span>产品分类</span>
                <div
                    class="category-cascader"
                    :class="{ open: isDraftCategoryMenuOpen }"
                >
                    <button
                        class="category-trigger"
                        type="button"
                        @click="toggleDraftCategoryMenu"
                    >
                        <span>{{ draftSelectedCategory || "请选择" }}</span>
                    </button>
                    <div
                        class="category-menu"
                        :class="{ 'single-column': activeDraftCategoryOptions.length === 0 }"
                    >
                        <div class="category-primary-list">
                            <button
                                v-for="group in categoryGroups"
                                :key="group.id"
                                class="category-primary-option"
                                :class="{ active: activeDraftCategoryGroup === group.id }"
                                type="button"
                                @click="handleDraftCategoryGroupClick(group)"
                                @mouseenter="activeDraftCategoryGroup = group.id"
                            >
                                <span>{{ group.name }}</span>
                                <Icon v-if="group.children.length" name="lucide:chevron-right" />
                            </button>
                        </div>
                        <div v-if="activeDraftCategoryOptions.length" class="category-secondary-list">
                            <button
                                v-for="category in activeDraftCategoryOptions"
                                :key="category.id"
                                class="category-secondary-option"
                                type="button"
                                @click="selectDraftCategory(category)"
                            >
                                {{ category.name }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="filter-field">
                <span>仓库</span>
                <InventoryWarehouseCascader
                    class="warehouse-filter"
                    :warehouse-options="warehouseOptions"
                    :warehouse-id="draftSelectedWarehouse"
                    :location-id="draftSelectedLocation"
                    allow-warehouse-select
                    allow-non-leaf-location-select
                    @select="selectDraftWarehouse"
                />
            </div>

            <label class="filter-field">
                <span>库存状态</span>
                <select v-model="draftSelectedStatus" aria-label="筛选库存状态">
                    <option value="">请选择</option>
                    <option
                        v-for="status in statusOptions"
                        :key="status"
                        :value="status"
                    >
                        {{ status }}
                    </option>
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
                <button class="text-button" type="button" @click="openColumnConfigDialog">
                    <Icon name="lucide:columns-3" class="button-icon" />
                    <span>配置列</span>
                </button>
            </div>
        </div>

        <ErpTableFrame
            data-inventory-copy-table
            :columns="inventoryTableColumnTemplate"
            :minimum-width="inventoryTableMinimumWidth"
            :loading="isLoadingInventoryRecords"
            :empty="!isLoadingInventoryRecords && visibleInventoryRows.length === 0"
            loading-text="正在加载实时库存..."
            empty-text="暂无匹配库存"
            scroll-x
        >
            <template #header>
                <div class="table-row table-head">
                    <div class="selection-head checkbox-cell" />

                    <div
                        v-for="(column, index) in lockedColumns"
                        :key="'locked-head-' + column.key"
                        class="table-cell locked-table-cell"
                        :class="{ 'erp-table-fixed-start': index === lockedColumns.length - 1 }"
                        :style="{ left: getLockedColumnLeft(index) }"
                    >
                        {{ column.label }}
                    </div>

                    <div
                        v-for="column in scrollColumns"
                        :key="column.key"
                        class="table-cell"
                    >
                        {{ column.label }}
                    </div>
                </div>
            </template>

            <template v-for="row in visibleInventoryRows" :key="row.rowKey">
                <div
                    class="table-row data-row"
                    :class="{ child: row.level > 0 }"
                >
                        <div class="selection-row checkbox-cell">
                            <button
                                v-if="row.level === 0 && row.details?.length"
                                class="tree-toggle"
                                type="button"
                                :aria-label="(isInventoryExpanded(row.id) ? '收起' : '展开') + row.productCode"
                                @click="toggleInventory(row.id)"
                            >
                                <Icon
                                    :name="
                                        isInventoryExpanded(row.id)
                                            ? 'lucide:square-minus'
                                            : 'lucide:square-plus'
                                    "
                                />
                            </button>
                            <span v-else class="tree-spacer" />
                        </div>

                        <div
                            v-for="(column, index) in lockedColumns"
                            :key="'locked-' + row.rowKey + '-' + column.key"
                            class="table-cell locked-table-cell"
                            :class="{
                                'image-cell': column.key === 'image',
                                'erp-table-fixed-start': index === lockedColumns.length - 1,
                            }"
                            :style="{ left: getLockedColumnLeft(index) }"
                        >
                            <OverflowTooltip
                                v-if="column.key === 'warehouse'"
                                :text="String(getInventoryCellValue(row, column.key))"
                            />
                            <el-popover
                                v-else-if="column.key === 'description' && shouldShowInventoryDescriptionPopover(row)"
                                trigger="hover"
                                placement="top"
                                :width="260"
                                popper-class="erp-app inventory-description-popover"
                            >
                                <div class="description-popover-content">{{ getInventoryCellValue(row, column.key) }}</div>
                                <template #reference>
                                    <span class="description-cell-text">{{ getInventoryCellValue(row, column.key) }}</span>
                                </template>
                            </el-popover>
                            <span v-else-if="column.key === 'description'">{{ getInventoryCellValue(row, column.key) }}</span>
                            <InventoryCell
                                v-else
                                :row="row"
                                :column-key="column.key"
                            />
                        </div>

                        <div
                            v-for="column in scrollColumns"
                            :key="row.rowKey + '-' + column.key"
                            class="table-cell"
                            :class="{ 'image-cell': column.key === 'image' }"
                        >
                            <OverflowTooltip
                                v-if="column.key === 'warehouse'"
                                :text="String(getInventoryCellValue(row, column.key))"
                            />
                            <el-popover
                                v-else-if="column.key === 'description' && shouldShowInventoryDescriptionPopover(row)"
                                trigger="hover"
                                placement="top"
                                :width="260"
                                popper-class="erp-app inventory-description-popover"
                            >
                                <div class="description-popover-content">{{ getInventoryCellValue(row, column.key) }}</div>
                                <template #reference>
                                    <span class="description-cell-text">{{ getInventoryCellValue(row, column.key) }}</span>
                                </template>
                            </el-popover>
                            <span v-else-if="column.key === 'description'">{{ getInventoryCellValue(row, column.key) }}</span>
                            <InventoryCell
                                v-else
                                :row="row"
                                :column-key="column.key"
                            />
                        </div>
                </div>
            </template>
        </ErpTableFrame>

        <InventoryPagination
            v-model:page-size="pageSize"
            v-model:jump-page-input="jumpPageInput"
            :total="totalInventoryRows"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="goToInventoryPage"
            @jump="jumpToInventoryInputPage"
        />

        <InventoryLedgerDialog
            v-if="selectedInventoryLedgerProduct"
            v-model:page-size="inventoryLedgerPageSize"
            v-model:jump-page-input="inventoryLedgerJumpPageInput"
            :records="selectedInventoryLedgerRecords"
            :loading="isLoadingInventoryLedger"
            :total="totalInventoryLedgerRecords"
            :page-size-options="inventoryLedgerPageSizeOptions"
            :page-numbers="inventoryLedgerPageNumbers"
            :total-pages="inventoryLedgerTotalPages"
            :current-page="inventoryLedgerCurrentPage"
            @close="closeInventoryLedgerDialog"
            @page-change="goToInventoryLedgerPage"
            @jump="jumpToInventoryLedgerInputPage"
        />

        <InventoryRestrictionDialog
            v-if="selectedInventoryRestriction"
            :product-code="selectedInventoryRestriction.productCode"
            :model="selectedInventoryRestriction.model"
            :unit-name="selectedInventoryRestriction.unitName"
            :expected-quantity="selectedInventoryRestriction.expectedQuantity"
            :details="inventoryRestrictionDetails"
            :loading="isLoadingInventoryRestrictions"
            :error="inventoryRestrictionError"
            @close="closeInventoryRestrictionDialog"
            @retry="loadInventoryRestrictionDetails"
        />

        <div
            v-if="showBomDialog"
            class="erp-dialog-mask bom-structure-mask"
            role="presentation"
            @click.self="closeBomDialog"
        >
            <section class="bom-structure-dialog" :aria-label="bomDialogTitle">
                <header class="bom-structure-header">
                    <h2>{{ bomDialogTitle }}</h2>
                    <button
                        class="dialog-close"
                        type="button"
                        :aria-label="`关闭${bomDialogTitle}`"
                        @click="closeBomDialog"
                    >
                        <Icon name="lucide:x" />
                    </button>
                </header>

                <div class="bom-structure-body" :aria-busy="isLoadingBomStructure">
                    <p v-if="isLoadingBomStructure" class="bom-structure-state" role="status">
                        正在加载 BOM 结构...
                    </p>
                    <p v-else-if="bomStructureError" class="bom-structure-state error" role="alert">
                        {{ bomStructureError }}
                    </p>
                    <BomTreeTable
                        v-if="!isLoadingBomStructure"
                        :root="selectedBomStructure"
                        show-available-quantity
                    />
                </div>
            </section>
        </div>

        <div
            v-if="showOrderCheckDialog"
            class="erp-dialog-mask order-check-mask"
            role="presentation"
            @click.self="closeOrderCheckDialog"
        >
            <section class="order-check-dialog" aria-label="订单所需产品">
                <header class="order-check-header">
                    <div>
                        <h2>订单所需产品</h2>
                        <p>{{ orderCheckTitle }}</p>
                    </div>
                    <button
                        class="dialog-close"
                        type="button"
                        aria-label="关闭订单所需产品"
                        @click="closeOrderCheckDialog"
                    >
                        <Icon name="lucide:x" />
                    </button>
                </header>

                <div v-if="isLoadingOrderCheck" class="order-check-state">正在加载订单所需产品...</div>
                <div v-else-if="orderCheckError" class="order-check-state error">{{ orderCheckError }}</div>
                <div v-else-if="!orderCheckRows.length" class="order-check-state">暂无订单库存核对产品</div>
                <div v-else class="order-check-table-wrap">
                    <div class="order-check-table">
                        <div class="order-check-row order-check-head">
                            <span>产品编号</span>
                            <span>型号</span>
                            <span>分类</span>
                            <span>产品图片</span>
                            <span>库存状态</span>
                            <span>订单需求量</span>
                            <span>单位</span>
                            <span>订单备注</span>
                        </div>
                        <div
                            v-for="row in orderCheckRows"
                            :key="row.productId"
                            class="order-check-row"
                        >
                            <span>{{ row.productCode || '--' }}</span>
                            <span>{{ row.model || '--' }}</span>
                            <span>{{ row.category || '--' }}</span>
                            <span class="order-check-image-cell">
                                <img
                                    v-if="row.image"
                                    :src="row.image"
                                    :alt="row.productCode || row.model || '产品图片'"
                                    class="clickable-image"
                                    @click="openImagePreview(row.image, row.productCode || row.model || '产品图片')"
                                >
                                <template v-else>--</template>
                            </span>
                            <span><em class="status-tag" :class="getOrderCheckStatusClass(row.status)">{{ row.status }}</em></span>
                            <span>{{ formatNumber(row.requiredQuantity) }}</span>
                            <span>{{ row.unit || '--' }}</span>
                            <span :title="orderCheckRemark">{{ orderCheckRemark || '--' }}</span>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        <ColumnConfigDialog
            v-if="showColumnConfigDialog"
            :column-configs="columnConfigs"
            :all-columns-visible="allColumnsVisible"
            @close="closeColumnConfigDialog"
            @confirm="confirmColumnConfig"
            @toggle-all-visible="toggleAllColumnsVisible"
            @toggle-visible="toggleColumnVisible"
            @toggle-locked="toggleColumnLocked"
            @drag-start="startColumnDrag"
            @drop="dropColumn"
        />

        <ImagePreviewDialog
            v-model="showImagePreview"
            :title="previewTitle"
            :images="previewImages"
        />
    </div>
</template>

<script setup lang="ts">
import type { PropType } from "vue";
import type {
    InventoryCategory,
    InventoryLocation,
    InventoryStock,
    InventoryStockLedger,
    InventoryStockRestrictionDetails,
    InventoryStockRestrictionRetrieveParams,
    InventoryWarehouse,
} from "~~/shared/types/inventory";
import {
    getInventoryProductDetail,
    retrieveInventoryCategoryTree,
    retrieveInventoryLocations,
    retrieveInventoryStocks,
    retrieveInventoryStockLedgers,
    retrieveInventoryStockRestrictions,
    retrieveInventoryWarehouses,
    retrieveSalesOrderStockReservations,
    type InventoryBomStructureNode,
} from "~/composables/api/useInventoryApi";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import OverflowTooltip from "~/components/configuration/OverflowTooltip.vue";
import ColumnConfigDialog from "~/components/configuration/inventory/basic-data/ColumnConfigDialog.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import BomTreeTable from "~/components/configuration/inventory/basic-data/product/BomTreeTable.vue";
import InventoryLedgerDialog from "~/components/configuration/inventory/basic-data/product/InventoryLedgerDialog.vue";
import InventoryRestrictionDialog from "~/components/configuration/inventory/InventoryRestrictionDialog.vue";
import InventoryWarehouseCascader from "~/components/configuration/inventory/InventoryWarehouseCascader.vue";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import { getErpTableGridColumn, getErpTableMinimumWidth } from "~/utils/inventory/erpTableColumns";
import {
    normalizeRealtimeInventoryLedger,
    normalizeRealtimeInventoryStock,
} from "~/utils/inventory/realtimeFrontendMapping";
import {
    buildInboundLocationTree,
    type InboundWarehouseOption,
} from "~/utils/inventory/inboundFrontendMapping";

definePageMeta({
    layout: "inventory",
});

const route = useRoute();

const inventoryBreadcrumbItems = [
    { label: "仓储管理" },
    { label: "实时库存" },
];

type InventoryStatus = "正常" | "过低" | "过高";

type InventoryColumnKey =
    | "productCode"
    | "model"
    | "category"
    | "image"
    | "status"
    | "totalQuantity"
    | "availableQuantity"
    | "unavailableQuantity"
    | "inTransitQuantity"
    | "unit"
    | "warehouse"
    | "finishedCount"
    | "stockUpper"
    | "stockLower"
    | "bom"
    | "description"
    | "ledger";

interface InventoryColumn {
    key: InventoryColumnKey;
    label: string;
    width: number;
    grow?: boolean;
}

interface InventoryColumnConfig extends InventoryColumn {
    visible: boolean;
    locked: boolean;
}

interface InventoryRecord {
    id: string;
    productId?: string;
    productCode: string;
    model: string;
    material: string;
    category: string;
    categoryId: string;
    parentCategoryId: string;
    image: string;
    status: InventoryStatus;
    totalQuantity: number | null;
    availableQuantity: number | null;
    unavailableQuantity: number | null;
    inTransitQuantity: number | null;
    allocatedInTransitQuantity: number | null;
    unit: string;
    warehouse: string;
    finishedCount: number | null;
    stockUpper: number | null;
    stockLower: number | null;
    bom: string;
    description: string;
    details?: InventoryRecord[];
}

interface VisibleInventoryRow extends InventoryRecord {
    level: number;
    rowKey: string;
}

interface BomTreeNode {
    productCode: string;
    productName: string;
    model: string;
    material?: string;
    image?: string;
    quantity?: number | null;
    availableQuantity?: number | null;
    unit: string;
    children?: BomTreeNode[];
}

interface InventoryLedgerProduct {
    id: string;
    model: string;
    unit?: string;
    defaultWarehouse?: string;
}

interface InventoryRestrictionSelection {
    params: InventoryStockRestrictionRetrieveParams;
    productCode: string;
    model: string;
    unitName: string;
    expectedQuantity: number;
}

interface InventoryLedgerRecord {
    id: string;
    changedAt: string;
    relatedOrderNo: string;
    businessType: string;
    quantity: string;
    unit: string;
    outboundWarehouse: string;
    inboundWarehouse: string;
    remark: string;
}

interface CategoryOption {
    id: string;
    code: string;
    name: string;
    parentId: string;
    children: CategoryOption[];
}

const statusOptions: InventoryStatus[] = ["正常", "过低", "过高"];

const categoryGroups = ref<CategoryOption[]>([]);

const columnConfigs = reactive<InventoryColumnConfig[]>([
    { key: "productCode", label: "产品编号", width: 180, visible: true, locked: false },
    { key: "model", label: "型号", width: 190, grow: true, visible: true, locked: false },
    { key: "category", label: "分类", width: 180, grow: true, visible: true, locked: false },
    { key: "image", label: "产品图片", width: 150, visible: true, locked: false },
    { key: "status", label: "库存状态", width: 130, visible: true, locked: false },
    { key: "totalQuantity", label: "库存总量", width: 120, visible: true, locked: false },
    { key: "availableQuantity", label: "可用数量", width: 120, visible: true, locked: false },
    { key: "unavailableQuantity", label: "受限数量", width: 120, visible: true, locked: false },
    { key: "inTransitQuantity", label: "在途数量", width: 170, visible: true, locked: false },
    { key: "unit", label: "单位", width: 80, visible: true, locked: false },
    { key: "warehouse", label: "仓库", width: 170, grow: true, visible: true, locked: false },
    { key: "finishedCount", label: "成套数量", width: 120, visible: false, locked: false },
    { key: "stockUpper", label: "库存上限", width: 120, visible: true, locked: false },
    { key: "stockLower", label: "库存下限", width: 120, visible: true, locked: false },
    { key: "bom", label: "BOM 结构", width: 140, visible: true, locked: false },
    { key: "description", label: "简介", width: 220, grow: true, visible: true, locked: false },
    { key: "ledger", label: "库存流水账", width: 140, visible: true, locked: false },
]);

const searchText = ref("");
const draftSelectedCategory = ref("");
const draftSelectedCategoryId = ref("");
const draftSelectedWarehouse = ref("");
const draftSelectedLocation = ref("");
const draftSelectedStatus = ref("");
const appliedSearchText = ref("");
const appliedCategoryId = ref("");
const appliedWarehouse = ref("");
const appliedLocation = ref("");
const appliedStatus = ref("");
const inventoryRecords = ref<InventoryRecord[]>([]);
const warehouseOptions = ref<InboundWarehouseOption[]>([]);
const totalInventoryRows = ref(0);
const expandedInventoryIds = ref<string[]>([]);
const showColumnConfigDialog = ref(false);
const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");
const showBomDialog = ref(false);
const selectedBomInventory = ref<VisibleInventoryRow | null>(null);
const selectedBomStructure = ref<BomTreeNode | null>(null);
const isLoadingBomStructure = ref(false);
const bomStructureError = ref("");
let bomStructureRequestId = 0;
const selectedInventoryLedgerProduct = ref<InventoryLedgerProduct | null>(null);
const selectedInventoryRestriction = ref<InventoryRestrictionSelection | null>(null);
const inventoryRestrictionDetails = ref<InventoryStockRestrictionDetails | null>(null);
const isLoadingInventoryRestrictions = ref(false);
const inventoryRestrictionError = ref("");
let inventoryRestrictionRequestId = 0;
const selectedInventoryLedgerRecords = ref<InventoryLedgerRecord[]>([]);
const totalInventoryLedgerRecords = ref(0);
const draggingColumnKey = ref<InventoryColumnKey | null>(null);
const isDraftCategoryMenuOpen = ref(false);
const activeDraftCategoryGroup = ref("");
const isLoadingInventoryRecords = ref(false);
const isLoadingInventoryLedger = ref(false);
const showOrderCheckDialog = ref(false);
const isLoadingOrderCheck = ref(false);
const orderCheckError = ref("");
const orderCheckRows = ref<any[]>([]);
const orderCheckRemark = ref("");
const orderCheckTitle = ref("销售订单");

const {
    pageSizeOptions,
    pageSize,
    pageNumbers,
    totalPages,
    currentPage,
    jumpPageInput,
    setTotalItems,
    goToPage,
} = useInventoryPagination();

const {
    pageSizeOptions: inventoryLedgerPageSizeOptions,
    pageSize: inventoryLedgerPageSize,
    pageNumbers: inventoryLedgerPageNumbers,
    totalPages: inventoryLedgerTotalPages,
    currentPage: inventoryLedgerCurrentPage,
    jumpPageInput: inventoryLedgerJumpPageInput,
    setTotalItems: setTotalInventoryLedgerRecords,
    goToPage: goToInventoryLedgerPageNumber,
} = useInventoryPagination();

const activeDraftCategoryOptions = computed(() => {
    const group = categoryGroups.value.find((category) => category.id === activeDraftCategoryGroup.value);

    return group?.children ?? [];
});

const selectedCategoryIds = computed(() => {
    if (!appliedCategoryId.value) {
        return [];
    }

    const category = findCategoryById(appliedCategoryId.value);
    if (!category) {
        return [appliedCategoryId.value];
    }

    return [
        category.id,
        ...category.children.map((child) => child.id),
    ];
});

const flattenCategories = (categories: CategoryOption[]): CategoryOption[] =>
    categories.flatMap((category) => [
        category,
        ...flattenCategories(category.children),
    ]);

const flatCategories = computed(() => flattenCategories(categoryGroups.value));

const findCategoryById = (categoryId: string) =>
    flatCategories.value.find((category) => category.id === categoryId);

const isRecordInSelectedCategory = (record: InventoryRecord) => {
    if (!selectedCategoryIds.value.length) {
        return true;
    }

    return selectedCategoryIds.value.includes(record.categoryId);
};

const toggleDraftCategoryMenu = () => {
    isDraftCategoryMenuOpen.value = !isDraftCategoryMenuOpen.value;
};

const selectDraftCategory = (category: CategoryOption) => {
    draftSelectedCategory.value = category.name;
    draftSelectedCategoryId.value = category.id;
    isDraftCategoryMenuOpen.value = false;
};

const selectDraftWarehouse = (warehouseId: string, locationId: string) => {
    draftSelectedWarehouse.value = warehouseId;
    draftSelectedLocation.value = locationId;
};

const handleDraftCategoryGroupClick = (group: CategoryOption) => {
    activeDraftCategoryGroup.value = group.id;
    selectDraftCategory(group);
};

const handleCategoryOutsideClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;

    if (target?.closest(".category-cascader")) {
        return;
    }

    isDraftCategoryMenuOpen.value = false;
};

onMounted(() => {
    document.addEventListener("click", handleCategoryOutsideClick);
    applyStoredColumnConfigs();
    void loadFilterOptions();
    void loadInventoryRecords();
    if (route.query.orderCheck === "1") {
        void openOrderCheckDialog();
    }
});

const closeOrderCheckDialog = () => {
    showOrderCheckDialog.value = false;
};

const getOrderCheckStatusClass = (status: string) => ({
    normal: status === "正常",
    low: status === "过低",
    high: status === "过高",
});

const openOrderCheckDialog = async () => {
    showOrderCheckDialog.value = true;
    isLoadingOrderCheck.value = true;
    orderCheckError.value = "";
    orderCheckRows.value = [];
    orderCheckRemark.value = "";
    const salesOrderId = String(route.query.salesOrderId || "").trim();
    const salesOrderNo = String(route.query.salesOrderNo || "").trim();
    orderCheckTitle.value = salesOrderNo || salesOrderId || "销售订单";
    try {
        const reservationRes = await retrieveSalesOrderStockReservations({
            salesOrderId: salesOrderId || undefined,
            salesOrderNo: salesOrderNo || undefined,
        });
        if (reservationRes.code !== 200) {
            throw new Error(reservationRes.msg || "获取订单库存需求失败");
        }
        orderCheckRemark.value = reservationRes.data?.orderRemark || "";
        const reservations = reservationRes.data?.list || [];
        const grouped = new Map<string, any>();
        reservations.forEach((item: any) => {
            const productId = String(item.stockProductId || item.demandProductId || "").trim();
            if (!productId) return;
            const row = grouped.get(productId) || {
                productId,
                requiredQuantity: 0,
                reservedQuantity: 0,
            };
            row.requiredQuantity += Number(item.requiredQuantity || 0);
            row.reservedQuantity += Math.max(Number(item.reservedQuantity || 0) - Number(item.consumedQuantity || 0) - Number(item.releasedQuantity || 0), 0);
            grouped.set(productId, row);
        });
        const productIds = [...grouped.keys()];
        if (!productIds.length) return;
        const stockRes = await retrieveInventoryStocks({
            productIds,
            includeInTransit: true,
            page: 1,
            limit: productIds.length,
        });
        if (stockRes.code !== 200) {
            throw new Error(stockRes.msg || "获取订单产品库存失败");
        }
        const stocks = new Map((stockRes.data?.list || []).map((item: any) => [String(item.productId || item._id), item]));
        orderCheckRows.value = productIds.map((productId) => {
            const row = grouped.get(productId);
            const stock = stocks.get(productId) || {};
            return {
                ...row,
                productCode: stock.productCode || "",
                model: stock.model || "",
                category: stock.categoryPath || stock.categoryName || "",
                image: stock.image || "",
                status: stock.stockStatus || "正常",
                totalQuantity: Number(stock.totalQuantity || 0),
                availableQuantity: Number(stock.availableQuantity || 0),
                unavailableQuantity: Number(stock.unavailableQuantity || 0),
                unit: stock.unitName || "",
            };
        });
    } catch (error: any) {
        orderCheckError.value = error?.message || "获取订单所需产品失败";
    } finally {
        isLoadingOrderCheck.value = false;
    }
};

onBeforeUnmount(() => {
    document.removeEventListener("click", handleCategoryOutsideClick);
    inventoryRestrictionRequestId += 1;
    bomStructureRequestId += 1;
    isLoadingBomStructure.value = false;
});

const handleApiError = (err: any, fallbackMessage: string) => {
    ElMessage.error(err?.data?.msg || err?.message || fallbackMessage);
};

const normalizeWarehouseOption = (item: InventoryWarehouse) => ({
    id: item._id || "",
    code: item.code || "",
    name: item.name || "",
    enableLocation: item.enableLocation === true,
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
        ? buildInboundLocationTree(res.data.list as InventoryLocation[])
        : [];
};

const normalizeCategoryOption = (category: InventoryCategory): CategoryOption => ({
    id: category._id || "",
    code: category.code || "",
    name: category.name || "",
    parentId: category.parentId ? String(category.parentId) : "",
    children: Array.isArray(category.children)
        ? category.children.map((child) => normalizeCategoryOption(child as InventoryCategory))
        : [],
});

const loadFilterOptions = async () => {
    try {
        const [categoryRes, warehouseRes] = await Promise.all([
            retrieveInventoryCategoryTree(),
            retrieveInventoryWarehouses(),
        ]);

        if (categoryRes.code === 200) {
            categoryGroups.value = Array.isArray(categoryRes.data?.tree)
                ? categoryRes.data.tree.map(normalizeCategoryOption)
                : [];
            activeDraftCategoryGroup.value = categoryGroups.value[0]?.id || "";
        } else {
            ElMessage.error(categoryRes.msg || "获取产品分类失败");
        }

        if (warehouseRes.code === 200) {
            const warehouses = Array.isArray(warehouseRes.data?.list)
                ? warehouseRes.data.list
                : [];
            const locationGroups = await Promise.all(
                warehouses.map((warehouse) => loadLocationsByWarehouse(warehouse)),
            );

            warehouseOptions.value = warehouses.map((warehouse, index) => ({
                ...normalizeWarehouseOption(warehouse),
                children: locationGroups[index],
            }));
        } else {
            ElMessage.error(warehouseRes.msg || "获取仓库选项失败");
        }
    } catch (err: any) {
        handleApiError(err, "获取库存筛选选项失败");
    }
};

const loadInventoryRecords = async () => {
    if (isLoadingInventoryRecords.value) {
        return;
    }

    isLoadingInventoryRecords.value = true;
    try {
        const res = await retrieveInventoryStocks({
            keyword: appliedSearchText.value || undefined,
            categoryId: appliedCategoryId.value || undefined,
            warehouseId: appliedWarehouse.value || undefined,
            locationId: appliedLocation.value || undefined,
            stockStatus: appliedStatus.value || undefined,
            includeAssignedProducts: true,
            paginateAssignedProducts: true,
            includeDescendantLocations: true,
            includeInTransit: true,
            page: currentPage.value,
            limit: pageSize.value,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取实时库存失败");
            inventoryRecords.value = [];
            totalInventoryRows.value = 0;
            setTotalItems(0);
            return;
        }

        inventoryRecords.value = Array.isArray(res.data?.list)
            ? res.data.list.map((item: InventoryStock) => normalizeRealtimeInventoryStock(item as Record<string, any>))
            : [];
        totalInventoryRows.value = Number(res.data?.pagination?.total || 0);
        setTotalItems(totalInventoryRows.value);
        goToPage(Number(res.data?.pagination?.page || currentPage.value));
    } catch (err: any) {
        inventoryRecords.value = [];
        totalInventoryRows.value = 0;
        setTotalItems(0);
        handleApiError(err, "获取实时库存失败");
    } finally {
        isLoadingInventoryRecords.value = false;
    }
};

const hasPendingFilters = computed(() =>
    searchText.value.trim() !== appliedSearchText.value ||
    draftSelectedCategoryId.value !== appliedCategoryId.value ||
    draftSelectedWarehouse.value !== appliedWarehouse.value ||
    draftSelectedLocation.value !== appliedLocation.value ||
    draftSelectedStatus.value !== appliedStatus.value,
);

const displayedColumns = computed(() => columnConfigs.filter((column) => column.visible));
const lockedColumns = computed(() => displayedColumns.value.filter((column) => column.locked));
const scrollColumns = computed(() => displayedColumns.value.filter((column) => !column.locked));
const allColumnsVisible = computed(() => columnConfigs.every((column) => column.visible));

const inventoryTableColumnTemplate = computed(() => [
    "var(--inventory-selection-width)",
    ...lockedColumns.value.map(getErpTableGridColumn),
    ...scrollColumns.value.map(getErpTableGridColumn),
].join(" "));
const inventoryTableMinimumWidth = computed(() =>
    getErpTableMinimumWidth(displayedColumns.value, ["var(--inventory-selection-width)"]),
);

const bomDialogTitle = computed(() => {
    const inventory = selectedBomInventory.value;

    if (!inventory) {
        return "BOM结构";
    }

    return `${inventory.model || inventory.productCode || "--"} BOM结构`;
});

const getLockedColumnLeft = (columnIndex: number) => {
    const previousLockedWidth = lockedColumns.value
        .slice(0, columnIndex)
        .reduce((total, column) => total + column.width, 0);

    return "calc(var(--inventory-selection-width) + " + previousLockedWidth + "px)";
};

const numberColumnKeys = new Set<InventoryColumnKey>([
    "totalQuantity",
    "availableQuantity",
    "unavailableQuantity",
    "inTransitQuantity",
    "finishedCount",
    "stockUpper",
    "stockLower",
]);

const formatNumber = (value: number | null) => {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return "--";
    }

    return Number(value).toFixed(1);
};

const getInventoryCellValue = (row: InventoryRecord, columnKey: InventoryColumnKey) => {
    if (columnKey === "ledger") {
        return "--";
    }

    if (columnKey === "inTransitQuantity") {
        const inTransitQuantity = formatNumber(row.inTransitQuantity);
        if (row.allocatedInTransitQuantity === null || row.allocatedInTransitQuantity === undefined) {
            return inTransitQuantity;
        }

        return `${inTransitQuantity}（已分配：${formatNumber(row.allocatedInTransitQuantity)}）`;
    }

    if (numberColumnKeys.has(columnKey)) {
        return formatNumber(row[columnKey] as number | null);
    }

    return row[columnKey] || "--";
};

const shouldShowInventoryDescriptionPopover = (row: InventoryRecord) => {
    const description = String(getInventoryCellValue(row, "description"));

    return description !== "--" && description.length > 12;
};

const inventoryMatchesSearch = (record: InventoryRecord, keyword: string) => {
    const values = [
        record.productCode,
        record.model,
        record.category,
        record.status,
        record.unit,
        record.warehouse,
        record.bom,
        record.description,
        ...(record.details?.flatMap((detail) => [
            detail.model,
            detail.warehouse,
            detail.unit,
        ]) ?? []),
    ];

    return values.some((value) => value.toLocaleLowerCase().includes(keyword));
};

const inventoryMatchesWarehouse = (record: InventoryRecord, warehouse: string) => {
    return record.warehouse === warehouse || record.details?.some((detail) =>
        detail.warehouse === warehouse,
    );
};

const visibleInventoryRows = computed<VisibleInventoryRow[]>(() => {
    const rows: VisibleInventoryRow[] = [];

    inventoryRecords.value.forEach((record) => {
        rows.push({
            ...record,
            level: 0,
            rowKey: record.id,
        });

        if (!record.details?.length || !isInventoryExpanded(record.id)) {
            return;
        }

        record.details.forEach((detail) => {
            rows.push({
                ...detail,
                level: 1,
                rowKey: detail.id,
            });
        });
    });

    return rows;
});

const isInventoryExpanded = (inventoryId: string) => {
    return expandedInventoryIds.value.includes(inventoryId);
};

const toggleInventory = (inventoryId: string) => {
    if (isInventoryExpanded(inventoryId)) {
        expandedInventoryIds.value = expandedInventoryIds.value.filter(
            (id) => id !== inventoryId,
        );
        return;
    }

    expandedInventoryIds.value = [...expandedInventoryIds.value, inventoryId];
};

const createBomNodeFromInventory = (inventory: VisibleInventoryRow): BomTreeNode => ({
    productCode: inventory.productCode,
    productName: inventory.model,
    model: inventory.model,
    material: inventory.material,
    image: inventory.image,
    quantity: 1,
    availableQuantity: inventory.availableQuantity,
    unit: inventory.unit,
    children: [],
});

const normalizeBomTreeNode = (node: InventoryBomStructureNode): BomTreeNode => ({
    productCode: node.productCode || "--",
    productName: node.productName || "",
    model: node.model || "--",
    material: node.material || "",
    image: node.image || "",
    quantity: node.quantity,
    unit: node.unitName || "--",
    children: Array.isArray(node.children)
        ? node.children.map((child) => normalizeBomTreeNode(child))
        : [],
});

const openBomDialog = async (inventory: VisibleInventoryRow) => {
    const requestId = ++bomStructureRequestId;
    selectedBomInventory.value = inventory;
    selectedBomStructure.value = createBomNodeFromInventory(inventory);
    bomStructureError.value = "";
    isLoadingBomStructure.value = false;
    showBomDialog.value = true;

    if (!inventory.productId) {
        bomStructureError.value = "缺少产品 ID，无法获取 BOM 结构";
        return;
    }

    isLoadingBomStructure.value = true;
    try {
        const res = await getInventoryProductDetail({ id: inventory.productId, includeBom: true });
        if (requestId !== bomStructureRequestId) return;
        if (res.code !== 200) {
            throw new Error(res.msg || "获取 BOM 结构失败");
        }

        if (res.data?.bomStructure) {
            selectedBomStructure.value = {
                ...normalizeBomTreeNode(res.data.bomStructure),
                availableQuantity: inventory.availableQuantity,
            };
        }
    } catch (err: any) {
        if (requestId !== bomStructureRequestId) return;
        bomStructureError.value = err?.data?.msg || err?.message || "获取 BOM 结构失败";
    } finally {
        if (requestId === bomStructureRequestId) {
            isLoadingBomStructure.value = false;
        }
    }
};

const closeBomDialog = () => {
    bomStructureRequestId += 1;
    showBomDialog.value = false;
    selectedBomInventory.value = null;
    selectedBomStructure.value = null;
    isLoadingBomStructure.value = false;
    bomStructureError.value = "";
};

const loadInventoryRestrictionDetails = async () => {
    const selection = selectedInventoryRestriction.value;
    if (!selection) return;

    const requestId = ++inventoryRestrictionRequestId;
    inventoryRestrictionDetails.value = null;
    inventoryRestrictionError.value = "";
    isLoadingInventoryRestrictions.value = true;
    try {
        const res = await retrieveInventoryStockRestrictions(selection.params);
        if (requestId !== inventoryRestrictionRequestId) return;
        if (res.code !== 200 || !res.data) {
            throw new Error(res.msg || "获取受限数量明细失败");
        }
        inventoryRestrictionDetails.value = res.data;
    } catch (err: any) {
        if (requestId !== inventoryRestrictionRequestId) return;
        inventoryRestrictionError.value = err?.data?.msg || err?.message || "获取受限数量明细失败";
    } finally {
        if (requestId === inventoryRestrictionRequestId) {
            isLoadingInventoryRestrictions.value = false;
        }
    }
};

const openInventoryRestrictionDialog = (inventory: VisibleInventoryRow) => {
    if (Number(inventory.unavailableQuantity || 0) <= 0) return;

    const productId = inventory.productId || inventory.id;
    const product = inventoryRecords.value.find((row) => row.id === productId);
    selectedInventoryRestriction.value = {
        params: {
            productId,
            stockId: inventory.level > 0 ? inventory.id : undefined,
            warehouseId: appliedWarehouse.value || undefined,
            locationId: appliedLocation.value || undefined,
            includeDescendantLocations: true,
        },
        productCode: product?.productCode || inventory.productCode,
        model: product?.model || inventory.model,
        unitName: inventory.unit,
        expectedQuantity: Number(inventory.unavailableQuantity || 0),
    };
    void loadInventoryRestrictionDetails();
};

const closeInventoryRestrictionDialog = () => {
    inventoryRestrictionRequestId += 1;
    selectedInventoryRestriction.value = null;
    inventoryRestrictionDetails.value = null;
    inventoryRestrictionError.value = "";
    isLoadingInventoryRestrictions.value = false;
};

const loadInventoryLedgerRecords = async () => {
    const product = selectedInventoryLedgerProduct.value;

    if (!product?.id || isLoadingInventoryLedger.value) {
        return;
    }

    isLoadingInventoryLedger.value = true;
    try {
        const res = await retrieveInventoryStockLedgers({
            productId: product.id,
            page: inventoryLedgerCurrentPage.value,
            limit: inventoryLedgerPageSize.value,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取库存流水失败");
            selectedInventoryLedgerRecords.value = [];
            totalInventoryLedgerRecords.value = 0;
            setTotalInventoryLedgerRecords(0);
            return;
        }

        selectedInventoryLedgerRecords.value = Array.isArray(res.data?.list)
            ? res.data.list.map((item: InventoryStockLedger) =>
                normalizeRealtimeInventoryLedger(item as Record<string, any>),
            )
            : [];
        totalInventoryLedgerRecords.value = Number(res.data?.pagination?.total || 0);
        setTotalInventoryLedgerRecords(totalInventoryLedgerRecords.value);
        goToInventoryLedgerPageNumber(Number(res.data?.pagination?.page || inventoryLedgerCurrentPage.value));
    } catch (err: any) {
        selectedInventoryLedgerRecords.value = [];
        totalInventoryLedgerRecords.value = 0;
        setTotalInventoryLedgerRecords(0);
        handleApiError(err, "获取库存流水失败");
    } finally {
        isLoadingInventoryLedger.value = false;
    }
};

const openInventoryLedgerDialog = async (inventory: VisibleInventoryRow) => {
    const product = {
        id: inventory.productId || inventory.id,
        model: inventory.model,
        unit: inventory.unit,
        defaultWarehouse: inventory.warehouse,
    };

    selectedInventoryLedgerProduct.value = product;
    selectedInventoryLedgerRecords.value = [];
    totalInventoryLedgerRecords.value = 0;
    setTotalInventoryLedgerRecords(0);
    goToInventoryLedgerPageNumber(1);

    await loadInventoryLedgerRecords();
};

const closeInventoryLedgerDialog = () => {
    selectedInventoryLedgerProduct.value = null;
    selectedInventoryLedgerRecords.value = [];
    totalInventoryLedgerRecords.value = 0;
    setTotalInventoryLedgerRecords(0);
    goToInventoryLedgerPageNumber(1);
};

const goToInventoryLedgerPage = (page: number) => {
    goToInventoryLedgerPageNumber(page);
    void loadInventoryLedgerRecords();
};

const jumpToInventoryLedgerInputPage = () => {
    goToInventoryLedgerPageNumber(Number(inventoryLedgerJumpPageInput.value.trim()));
    void loadInventoryLedgerRecords();
};

const applySearch = () => {
    appliedSearchText.value = searchText.value.trim();
    goToPage(1);
    void loadInventoryRecords();
};

const applyFilters = () => {
    appliedSearchText.value = searchText.value.trim();
    appliedCategoryId.value = draftSelectedCategoryId.value;
    appliedWarehouse.value = draftSelectedWarehouse.value;
    appliedLocation.value = draftSelectedLocation.value;
    appliedStatus.value = draftSelectedStatus.value;
    goToPage(1);
    void loadInventoryRecords();
};

const resetFilters = () => {
    searchText.value = "";
    draftSelectedCategory.value = "";
    draftSelectedCategoryId.value = "";
    draftSelectedWarehouse.value = "";
    draftSelectedLocation.value = "";
    draftSelectedStatus.value = "";
    appliedSearchText.value = "";
    appliedCategoryId.value = "";
    appliedWarehouse.value = "";
    appliedLocation.value = "";
    appliedStatus.value = "";
    goToPage(1);
    void loadInventoryRecords();
};

const goToInventoryPage = (page: number) => {
    goToPage(page);
    void loadInventoryRecords();
};

const jumpToInventoryInputPage = () => {
    goToPage(Number(jumpPageInput.value.trim()));
    void loadInventoryRecords();
};

const openColumnConfigDialog = () => {
    showColumnConfigDialog.value = true;
};

const closeColumnConfigDialog = () => {
    showColumnConfigDialog.value = false;
};

const INVENTORY_COLUMN_CONFIG_STORAGE_KEY = "inventory.realtime.columnConfigs";

const confirmColumnConfig = () => {
    persistColumnConfigs();
    closeColumnConfigDialog();
};

const persistColumnConfigs = () => {
    const configs = columnConfigs.map((column) => ({
        key: column.key,
        visible: column.visible,
        locked: column.locked,
    }));
    localStorage.setItem(INVENTORY_COLUMN_CONFIG_STORAGE_KEY, JSON.stringify(configs));
};

const applyStoredColumnConfigs = () => {
    const rawConfigs = localStorage.getItem(INVENTORY_COLUMN_CONFIG_STORAGE_KEY);
    if (!rawConfigs) {
        return;
    }

    try {
        const configs = JSON.parse(rawConfigs) as Array<{ key: string; visible: boolean; locked: boolean }>;
        const configMap = new Map(configs.map((c) => [c.key, c]));

        columnConfigs.forEach((column) => {
            const stored = configMap.get(column.key);
            if (stored) {
                column.visible = stored.visible;
                column.locked = stored.locked;
            }
        });

        const orderedKeys = configs.map((c) => c.key);
        columnConfigs.sort((a, b) => {
            const indexA = orderedKeys.indexOf(a.key);
            const indexB = orderedKeys.indexOf(b.key);
            const orderA = indexA >= 0 ? indexA : 999;
            const orderB = indexB >= 0 ? indexB : 999;
            return orderA - orderB;
        });
    } catch {
        localStorage.removeItem(INVENTORY_COLUMN_CONFIG_STORAGE_KEY);
    }
};

const toggleColumnVisible = (columnKey: InventoryColumnKey) => {
    const column = columnConfigs.find((config) => config.key === columnKey);

    if (column) {
        column.visible = !column.visible;
    }
};

const toggleAllColumnsVisible = () => {
    const nextVisible = !allColumnsVisible.value;
    columnConfigs.forEach((column) => {
        column.visible = nextVisible;
    });
};

const moveColumnConfig = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
        return;
    }

    const movingColumn = columnConfigs[fromIndex];
    const targetColumn = columnConfigs[toIndex];

    if (movingColumn.locked !== targetColumn.locked) {
        return;
    }

    const [column] = columnConfigs.splice(fromIndex, 1);
    columnConfigs.splice(toIndex, 0, column);
};

const sortLockedColumnsFirst = () => {
    const locked = columnConfigs.filter((column) => column.locked);
    const unlocked = columnConfigs.filter((column) => !column.locked);
    columnConfigs.splice(0, columnConfigs.length, ...locked, ...unlocked);
};

const toggleColumnLocked = (columnKey: InventoryColumnKey) => {
    const column = columnConfigs.find((config) => config.key === columnKey);

    if (!column) {
        return;
    }

    column.locked = !column.locked;
    sortLockedColumnsFirst();
};

const startColumnDrag = (columnKey: InventoryColumnKey) => {
    draggingColumnKey.value = columnKey;
};

const dropColumn = (targetColumnKey: InventoryColumnKey) => {
    if (!draggingColumnKey.value || draggingColumnKey.value === targetColumnKey) {
        return;
    }

    const fromIndex = columnConfigs.findIndex(
        (column) => column.key === draggingColumnKey.value,
    );
    const toIndex = columnConfigs.findIndex(
        (column) => column.key === targetColumnKey,
    );

    moveColumnConfig(fromIndex, toIndex);
    draggingColumnKey.value = null;
};

watch(totalInventoryRows, (total) => setTotalItems(total), {
    immediate: true,
});

watch(pageSize, () => {
    goToPage(1);
    void loadInventoryRecords();
});

watch(inventoryLedgerPageSize, () => {
    if (!selectedInventoryLedgerProduct.value) {
        return;
    }

    goToInventoryLedgerPageNumber(1);
    void loadInventoryLedgerRecords();
});

const openImagePreview = (url: string, title: string) => {
    previewImages.value = [{ url, alt: title }];
    previewTitle.value = title;
    showImagePreview.value = true;
};

const InventoryCell = defineComponent({
    props: {
        row: {
            type: Object as PropType<VisibleInventoryRow>,
            required: true,
        },
        columnKey: {
            type: String as PropType<InventoryColumnKey>,
            required: true,
        },
    },
    setup(props) {
        return () => {
            if (props.columnKey === "image") {
                return props.row.image
                    ? h("img", {
                        src: props.row.image,
                        alt: props.row.productCode || props.row.model || "产品图片",
                        class: "clickable-image",
                        onClick: (event: MouseEvent) => {
                            event.stopPropagation();
                            openImagePreview(props.row.image, props.row.productCode || props.row.model || "产品图片");
                        },
                    })
                    : "--";
            }

            if (props.columnKey === "status") {
                return h("span", {
                    class: [
                        "status-tag",
                        props.row.status === "正常" && "normal",
                        props.row.status === "过低" && "low",
                        props.row.status === "过高" && "high",
                    ],
                }, props.row.status);
            }

            if (props.columnKey === "bom" && props.row.bom) {
                return h("button", {
                    class: "bom-link",
                    type: "button",
                    onClick: () => openBomDialog(props.row),
                }, props.row.bom);
            }

            if (props.columnKey === "unavailableQuantity" && Number(props.row.unavailableQuantity || 0) > 0) {
                return h("button", {
                    class: "bom-link",
                    type: "button",
                    "aria-label": "查看受限数量明细",
                    onClick: () => openInventoryRestrictionDialog(props.row),
                }, formatNumber(props.row.unavailableQuantity));
            }

            if (props.columnKey === "ledger") {
                return props.row.level === 0
                    ? h("button", {
                        class: "bom-link",
                        type: "button",
                        onClick: () => openInventoryLedgerDialog(props.row),
                    }, "查看流水账")
                    : "--";
            }

            const value = getInventoryCellValue(props.row, props.columnKey);

            return value;
        };
    },
});
</script>

<style scoped>
button,
input,
select {
    font: inherit;
}

.topbar,
.filter-row,
.filter-actions {
    display: flex;
    align-items: center;
}

.topbar {
    justify-content: space-between;
}

.category-cascader {
    position: relative;
}

.category-trigger::after {
    width: 12px;
    height: 12px;
    flex: 0 0 12px;
    content: "";
    background-image: var(--inventory-select-arrow);
    background-repeat: no-repeat;
    background-position: center;
    background-size: 12px 12px;
}

.category-cascader.open .category-menu {
    display: grid;
}

.category-primary-list,
.category-secondary-list {
    min-height: 0;
    max-height: min(280px, calc(100dvh - 160px));
    padding: 4px 6px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
}

.category-primary-list::-webkit-scrollbar,
.category-secondary-list::-webkit-scrollbar {
    width: 6px;
}

.category-primary-list::-webkit-scrollbar-thumb,
.category-secondary-list::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: #c7d1dc;
}

.category-primary-list::-webkit-scrollbar-track,
.category-secondary-list::-webkit-scrollbar-track {
    background: transparent;
}

.category-primary-option :deep(svg) {
    width: 18px;
    height: 18px;
}

.category-secondary-option {
    justify-content: flex-start;
}

.checkbox-cell {
    padding: 0;
}

.tree-toggle,
.tree-spacer {
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
}

.tree-toggle :deep(svg) {
    width: 20px;
    height: 20px;
}

.image-cell img {
    width: 90px;
    height: 58px;
    object-fit: contain;
}

.clickable-image {
    cursor: pointer;
}

.description-cell-text {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
}

.realtime-inventory-page {
    --inventory-selection-width: 58px;
    --inventory-select-arrow: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23262626' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");

    height: 100%;
    display: grid;
    grid-template-rows: 40px 56px minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-container-gap);
    color: var(--erp-color-text-primary);
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

.filter-field select,
.category-cascader,
.category-trigger,
.warehouse-filter {
    width: 200px;
}

.filter-field select,
.category-trigger {
    height: var(--erp-size-control-height-sm);
    padding: 0 32px 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background-color: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.filter-field select {
    width: 200px;
    height: var(--erp-size-control-height-sm);
    padding: 0 32px 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-primary);
    background-color: var(--erp-color-fill-default);
    background-image: var(--inventory-select-arrow);
    background-repeat: no-repeat;
    background-size: 12px 12px;
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
    appearance: none;
    background-position: right var(--erp-spacing-12) center;
}

.category-trigger {
    width: 200px;
    height: var(--erp-size-control-height-sm);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
}

.category-menu {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    min-height: 124px;
    display: none;
    overflow: hidden;
    border: 1px solid var(--erp-color-border-muted);
    box-shadow: var(--erp-shadow-surface);
    z-index: 21;
    width: 376px;
    grid-template-columns: 174px 1fr;
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.category-menu.single-column {
    width: 176px;
    grid-template-columns: 174px;
}

.category-primary-list {
    border-right: 1px solid var(--erp-color-divider-subtle);
}

.category-menu.single-column .category-primary-list {
    border-right-color: transparent;
}

.category-primary-option,
.category-secondary-option {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    border: 0;
    background: transparent;
    cursor: pointer;
    height: var(--erp-size-control-height-sm);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.category-primary-option.active,
.category-primary-option:hover,
.category-secondary-option:hover {
    background: var(--erp-color-fill-hover);
}

.filter-actions {
    margin-left: auto;
    gap: var(--erp-spacing-12);
}

.outline-button,
.muted-button,
.text-button {
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
    cursor: pointer;
}

.outline-button {
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
}

.muted-button {
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

.muted-button.active {
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.text-button {
    border: 0;
    background: transparent;
    color: var(--erp-color-text-primary);
}

.button-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.table-row {
    display: grid;
    align-items: center;
    width: 100%;
    min-width: 0;
    padding-right: var(--erp-spacing-8);
}

.locked-table-cell {
    position: sticky;
    z-index: 4;
    height: 100%;
    background: inherit;
}

.table-head {
    height: 48px;
    border-radius: 0;
    background: var(--erp-color-fill-table-header);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.data-row {
    height: 80px;
    margin-top: 0;
    border-bottom: 1px solid var(--erp-color-divider-default);
    border-radius: 0;
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.data-row:hover {
    background: var(--erp-color-fill-hover);
}

.data-row.child {
    background: var(--erp-color-fill-table-child);
}

.data-row.child:hover {
    background: var(--erp-color-fill-hover);
}

.selection-head,
.selection-row {
    position: sticky;
    left: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    border-radius: 0;
    background: inherit;
}

.table-cell {
    min-width: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    padding: 0 var(--erp-spacing-20);
}

.tree-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    color: var(--erp-color-icon-default);
    border-radius: var(--erp-radius-control-default);
}

.tree-toggle:hover {
    background: var(--erp-color-fill-hover);
}

.status-tag {
    min-width: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 9px;
    border-radius: 14px;
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-content2-line-height);
}

.status-tag.normal {
    color: var(--erp-color-text-status-complete);
    background: var(--erp-color-bg-status-complete);
}

.status-tag.low {
    color: var(--erp-color-text-status-error);
    background: var(--erp-color-bg-status-error);
}

.status-tag.high {
    color: var(--erp-color-text-status-producing);
    background: var(--erp-color-bg-status-producing);
}

.bom-link {
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    color: var(--erp-color-text-brand);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

:global(.inventory-description-popover) {
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
}

:global(.inventory-description-popover .description-popover-content) {
    word-break: break-word;
    white-space: normal;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.bom-structure-mask {
    z-index: 60;
}

.dialog-close {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-icon-default);
}

.dialog-close:hover {
    background: var(--erp-color-fill-hover);
}

.bom-structure-dialog {
    display: grid;
    width: 1240px;
    min-width: 600px;
    max-width: 1240px;
    min-height: 300px;
    max-height: 800px;
    grid-template-rows: 52px minmax(0, 1fr);
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-dialog);
    background: var(--erp-color-fill-default);
    box-shadow: none;
}

.bom-structure-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--erp-spacing-12);
    border-bottom: 1px solid var(--erp-color-divider-subtle);
}

.bom-structure-header h2 {
    margin: 0;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
}

.bom-structure-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding: var(--erp-spacing-20);
}

.bom-structure-state {
    flex-shrink: 0;
    margin: 0;
    padding: var(--erp-spacing-12);
    color: var(--erp-color-text-secondary);
    text-align: center;
}

.bom-structure-state.error {
    color: var(--erp-color-function-red-500);
}

.order-check-mask {
    z-index: 60;
}

.order-check-dialog {
    display: grid;
    width: 1240px;
    min-width: 600px;
    max-width: 1240px;
    min-height: 300px;
    max-height: 800px;
    grid-template-rows: 52px minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-dialog);
    background: var(--erp-color-fill-default);
}

.order-check-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--erp-spacing-12);
    border-bottom: 1px solid var(--erp-color-divider-subtle);
}

.order-check-header h2 {
    margin: 0;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
}

.order-check-header p {
    margin: 0;
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.order-check-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--erp-spacing-20);
    color: var(--erp-color-text-secondary);
}

.order-check-state.error {
    color: var(--erp-color-function-red-500);
}

.order-check-table-wrap {
    min-height: 0;
    overflow: auto;
    padding: var(--erp-spacing-12);
}

.order-check-table {
    min-width: 1040px;
}

.order-check-row {
    display: grid;
    min-height: 56px;
    grid-template-columns: 1.2fr 1.2fr 1.4fr 80px 0.9fr 1fr 0.7fr 1.6fr;
    align-items: center;
    border-bottom: 1px solid var(--erp-color-divider-subtle);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content2-font-size);
}

.order-check-image-cell {
    display: flex;
    align-items: center;
    justify-content: center;
}

.order-check-image-cell img {
    width: 44px;
    height: 44px;
    object-fit: contain;
}

.order-check-row > span {
    padding: 0 var(--erp-spacing-8);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.order-check-head {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--erp-color-fill-table-header);
    color: var(--erp-color-text-secondary);
    font-weight: var(--erp-typography-content2-font-weight);
}
</style>
