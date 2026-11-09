<template>
    <div class="bom-page">
        <header class="topbar">
            <ErpBreadcrumb icon="lucide:warehouse" :items="bomBreadcrumbItems" />

            <ErpSearchBox v-model="searchText" @search="loadBoms" />
        </header>

        <div class="filter-row">
            <label class="filter-field enabled-field">
                <span>是否启用</span>
                <input
                    v-model="draftEnabledOnly"
                    class="filter-checkbox"
                    type="checkbox"
                    aria-label="仅显示已启用BOM"
                >
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

        <div class="toolbar">
            <div class="toolbar-left">
                <button class="primary-button" type="button" @click="createBom">
                    <Icon name="lucide:circle-plus" class="button-icon" />
                    <span>新建</span>
                </button>
                <button
                    class="outline-button"
                    type="button"
                    :disabled="isImportingBom"
                    @click="openImportDialog"
                >
                    <Icon name="lucide:download" class="button-icon" />
                    <span>{{ isImportingBom ? "导入中" : "导入" }}</span>
                </button>
                <button
                    class="outline-button"
                    :class="{ disabled: isExportingBom }"
                    type="button"
                    :disabled="isExportingBom"
                    @click="exportBoms"
                >
                    <Icon name="lucide:upload" class="button-icon" />
                    <span>导出</span>
                </button>
                <button
                    class="outline-button danger-button"
                    type="button"
                    :disabled="isSubmittingBom || selectedBomIds.length === 0"
                    @click="batchDeleteBoms"
                >
                    <Icon name="lucide:trash-2" class="button-icon" />
                    <span>批量删除</span>
                </button>
            </div>
        </div>

        <ErpTableFrame
            data-inventory-copy-table
            :columns="bomTableColumnTemplate"
            :minimum-width="bomTableMinimumWidth"
            :loading="isLoadingBoms"
            :empty="!isLoadingBoms && paginatedBoms.length === 0"
            loading-text="正在加载BOM数据..."
            empty-text="暂无匹配BOM"
            scroll-x
        >
            <template #header>
                <div
                    class="table-row table-head"
                >
                    <div class="selection-head checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                class="row-checkbox"
                                type="checkbox"
                                :checked="allRowsSelected"
                                aria-label="选择全部BOM"
                                @change="toggleSelectAll"
                            >
                        </label>
                    </div>

                    <div
                        v-for="column in bomColumns"
                        :key="column.key"
                        class="table-cell"
                    >
                        {{ column.label }}
                    </div>

                    <div class="action-head erp-table-fixed-end">操作</div>
                </div>
            </template>

            <template v-for="bom in paginatedBoms" :key="bom.id">
                <div class="table-row data-row">
                        <div class="selection-row checkbox-cell">
                            <label class="checkbox-control">
                                <input
                                    v-model="selectedBomIds"
                                    class="row-checkbox"
                                    type="checkbox"
                                    :value="bom.id"
                                    :aria-label="`选择${bom.id}`"
                                >
                            </label>
                        </div>

                        <div
                            v-for="column in bomColumns"
                            :key="`${bom.id}-${column.key}`"
                            class="table-cell"
                        >
                            <button
                                v-if="column.key === 'enabled'"
                                class="switch"
                                :class="{ active: bom.enabled }"
                                type="button"
                                :aria-label="`${bom.name}是否启用`"
                                @click="toggleBomEnabled(bom.id)"
                            >
                                <span />
                            </button>
                            <el-popover
                                v-else-if="column.key === 'remark' && shouldShowBomRemarkPopover(bom)"
                                trigger="hover"
                                placement="top"
                                :width="280"
                                popper-class="erp-app bom-remark-popover"
                            >
                                <div class="remark-popover-content">{{ getBomCellValue(bom, column.key) }}</div>
                                <template #reference>
                                    <span class="remark-cell-text">{{ getBomCellValue(bom, column.key) }}</span>
                                </template>
                            </el-popover>
                            <span v-else>{{ getBomCellValue(bom, column.key) }}</span>
                        </div>

                        <div class="action-row actions-cell erp-table-fixed-end">
                            <button
                                class="icon-button blue"
                                type="button"
                                :aria-label="`查看${bom.id}历史记录`"
                                title="历史记录"
                                @click="historyBom = bom"
                            >
                                <Icon name="lucide:history" />
                            </button>
                            <button
                                class="icon-button blue"
                                type="button"
                                :aria-label="`查看${bom.id}`"
                                @click="openBomProductDetail(bom)"
                            >
                                <Icon name="lucide:list" />
                            </button>
                            <button
                                class="icon-button blue"
                                type="button"
                                :aria-label="`编辑${bom.id}`"
                                @click="openEditBomDialog(bom)"
                            >
                                <Icon name="lucide:square-pen" />
                            </button>
                            <button
                                class="icon-button delete"
                                type="button"
                                :aria-label="`删除${bom.id}`"
                                @click="deleteBom(bom.id)"
                            >
                                <Icon name="lucide:trash-2" />
                            </button>
                        </div>
                </div>
            </template>
        </ErpTableFrame>

        <InventoryPagination
            v-model:page-size="pageSize"
            v-model:jump-page-input="jumpPageInput"
            :total="bomTotal"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="handleBomPageChange"
            @jump="handleBomJump"
        />

        <!-- 导入对话框 -->
        <div
            v-if="showImportDialog"
            class="erp-dialog-mask"
            role="presentation"
            @click.self="closeImportDialog"
        >
            <ErpDialogFrame
                title="批量导入BOM"
                width="600px"
                :close-disabled="isImportingBom"
                @close="closeImportDialog"
                @submit.prevent="confirmImportBoms"
            >
                <div class="import-dialog-body">
                    <div class="import-section-title">上传 Excel</div>
                    <div v-if="importFileName" class="uploaded-image-attachment import-file-attachment">
                        <div class="uploaded-image-info">
                            <Icon name="lucide:file-text" class="uploaded-image-icon" />
                            <span>{{ importFileName }}</span>
                        </div>
                        <button
                            class="uploaded-image-remove"
                            type="button"
                            :disabled="isImportingBom"
                            @click="removeImportFile"
                        >
                            删除
                        </button>
                    </div>
                    <label
                        v-else
                        class="import-upload-box"
                        :class="{ disabled: isImportingBom, 'is-dragover': isImportDragover }"
                        @dragover.prevent="handleImportDragover"
                        @dragleave.prevent="handleImportDragleave"
                        @drop.prevent="handleImportDrop"
                    >
                        <Icon name="lucide:upload" class="upload-icon" />
                        <span>选择或拖拽 Excel 文件到此处</span>
                        <input
                            type="file"
                            accept=".xlsx"
                            :disabled="isImportingBom"
                            @click="openDesktopFileInput($event, INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES, (files) => setImportFile(files[0]))"
                            @change="handleImportFileChange"
                        >
                    </label>
                    <p class="import-hint">支持 .xlsx，单个文件不超过 {{ INVENTORY_IMPORT_MAX_FILE_SIZE_MB }}MB。</p>
                    <button
                        class="import-template-button"
                        type="button"
                        :disabled="isImportingBom"
                        @click="downloadBomImportTemplate"
                    >
                        下载模板（Excel）
                    </button>

                    <div class="import-section-title">字段说明</div>
                    <div class="import-hint-list">
                        <p><strong>必填字段：</strong>BOM名称、主产品型号、子项产品型号、子项产品数量</p>
                        <p><strong>可选字段：</strong>是否启用（填"是"或"否"）、备注、子项产品序号</p>
                        <p class="warning"><strong>注意事项：</strong>BOM编号由系统自动生成；产品型号需匹配已有且唯一的产品，主信息留空表示继续追加上一条 BOM 的子项，子项数量必须大于0。</p>
                    </div>
                </div>

                <template #footer>
                    <button
                        class="dialog-button cancel"
                        type="button"
                        :disabled="isImportingBom"
                        @click="closeImportDialog"
                    >
                        取消
                    </button>
                    <button
                        class="dialog-button confirm"
                        type="submit"
                        :disabled="!importFile || isImportingBom"
                    >
                        {{ isImportingBom ? "导入中" : "开始导入" }}
                    </button>
                </template>
            </ErpDialogFrame>
        </div>

        <BomDialog
            v-if="showBomDialog"
            :title="bomDialogTitle"
            :form="bomForm"
            :form-error="bomFormError"
            :selected-product-label="selectedMainProductLabel"
            :structure-items="bomStructureItems"
            :visible-structure-columns="visibleStructureColumns"
            :readonly="isBomDialogReadonly"
            :show-draft-actions="bomShowDraftActions"
            @close="closeBomDialog"
            @confirm="confirmBomDialog"
            @open-drafts="openBomDrafts"
            @save-draft="saveBomDraft"
            @open-product-picker="openProductPicker"
            @open-column-config="openStructureColumnConfigDialog"
            @clear-structure="clearBomStructure"
            @remove-structure-item="removeBomStructureItem"
            @replace-structure-item="replaceBomStructureItem"
            @update-quantity="updateStructureQuantity"
        />

        <BomHistoryDialog
            v-if="historyBom"
            :key="historyBom.backendId"
            :bom-id="historyBom.backendId"
            :bom-code="historyBom.id"
            @close="historyBom = null"
        />

        <InventoryDraftPanel
            v-if="showBomDialog && showBomDrafts"
            :drafts="bomDrafts"
            @close="showBomDrafts = false"
            @apply="applyBomDraft"
            @remove="removeBomDraft"
        />

        <ProductPickerDialog
            v-if="showProductPickerDialog"
            :selection-mode="pickerContext === 'child' ? 'multiple' : 'single'"
            :selected-product-ids="selectedProductPickerIds"
            :selected-products="selectedProductPickerProducts"
            @close="closeProductPicker"
            @confirm="confirmProductSelection"
        />

        <ColumnConfigDialog
            v-if="showStructureColumnConfigDialog"
            :column-configs="structureColumnConfigs"
            :all-columns-visible="allStructureColumnsVisible"
            @close="closeStructureColumnConfigDialog"
            @confirm="confirmStructureColumnConfig"
            @toggle-all-visible="toggleAllStructureColumnsVisible"
            @toggle-visible="toggleStructureColumnVisibleByKey"
            @toggle-locked="toggleStructureColumnLockedByKey"
            @drag-start="startStructureColumnDragByKey"
            @drop="dropStructureColumnByKey"
        />
    </div>
</template>

<script setup lang="ts">
import { escapeHtml } from "~/utils/highlightText";
import { downloadBlob, downloadWorkbook, openDesktopFileInput } from "~/utils/fileActions";
import type {
    InventoryBom,
    InventoryProduct,
} from "~~/shared/types/inventory";
import {
    INVENTORY_IMPORT_FILE_SIZE_MESSAGE,
    INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES,
    INVENTORY_IMPORT_MAX_FILE_SIZE_MB,
} from "~~/shared/utils/inventoryImport";
import {
    addInventoryBom,
    deleteInventoryBom,
    exportInventoryBoms,
    getInventoryBomDetail,
    getInventoryProductDetail,
    importInventoryBoms,
    retrieveInventoryBoms,
    type InventoryBomMutationPayload,
    updateInventoryBom,
} from "~/composables/api/useInventoryApi";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import ColumnConfigDialog from "~/components/configuration/inventory/basic-data/ColumnConfigDialog.vue";
import BomDialog from "~/components/configuration/inventory/basic-data/bom/BomDialog.vue";
import BomHistoryDialog from "~/components/configuration/inventory/basic-data/bom/BomHistoryDialog.vue";
import ProductPickerDialog from "~/components/configuration/inventory/ProductPickerDialog.vue";
import InventoryDraftPanel from "~/components/configuration/inventory/InventoryDraftPanel.vue";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import {
    createInventoryDraftId,
    deleteInventoryDraft,
    listInventoryDrafts,
    saveInventoryDraft,
    shouldShowInventoryDraftActions,
    type InventoryDraftRecord,
} from "~/composables/inventory/useInventoryDraftStorage";
import type { ProductPickerItem } from "~/composables/inventory/useInventoryProductPickerData";
import { toInventoryEntityId } from "~/composables/inventory/useInventoryProductPickerData";
import { formatOneDecimalText } from "~/utils/inventoryNumberFormat";
import { getErpTableGridColumn, getErpTableMinimumWidth } from "~/utils/inventory/erpTableColumns";
import { erpMessageBox } from "~/utils/erpMessageBox";
definePageMeta({
    layout: "inventory",
});

const bomBreadcrumbItems = [
    { label: "仓储管理" },
    { label: "基础数据" },
    { label: "BOM管理" },
];

type ProductItem = ProductPickerItem;

interface BomStructureItem {
    rowId: string;
    lineId?: string;
    product: ProductItem;
    quantity: number;
    unitId?: string | null;
    lossRate?: number;
    remark?: string;
    sort?: number;
}

interface BomItem {
    backendId: string;
    revision: number;
    productId: string;
    id: string;
    name: string;
    sku: string;
    model: string;
    enabled: boolean;
    remark: string;
    updatedBy: string;
    updatedAt: string;
    items: BomStructureItem[];
}

interface BomForm {
    id: string;
    name: string;
    remark: string;
    product: ProductItem | null;
}

interface BomDraftData {
    sourceBomId?: string;
    baseRevision?: number;
    name: string;
    remark: string;
    product: ProductItem | null;
    structureItems: BomStructureItem[];
}

interface BomColumn {
    key:
        | "id"
        | "name"
        | "sku"
        | "model"
        | "revision"
        | "enabled"
        | "remark"
        | "updatedBy"
        | "updatedAt";
    label: string;
    width: number;
    widthVar?: string;
    grow?: boolean;
}

interface StructureColumnConfig {
    key:
        | "materialNo"
        | "materialName"
        | "material"
        | "image"
        | "category"
        | "quantity"
        | "unit"
        | "actions";
    label: string;
    width: number;
    visible: boolean;
    locked: boolean;
}

const bomColumns: BomColumn[] = [
    { key: "id", label: "BOM编码", width: 180 },
    { key: "name", label: "BOM名称", width: 180, grow: true },
    { key: "sku", label: "产品编码（SKU）", width: 180, grow: true },
    { key: "model", label: "型号", width: 150 },
    { key: "revision", label: "历史版本", width: 110 },
    { key: "enabled", label: "是否启用", width: 150 },
    { key: "remark", label: "备注", width: 180, widthVar: "--erp-table-col-remark", grow: true },
    { key: "updatedBy", label: "修改人", width: 150, widthVar: "--erp-table-col-operator" },
    { key: "updatedAt", label: "修改时间", width: 180, widthVar: "--erp-table-col-date" },
];

const structureColumnConfigs = reactive<StructureColumnConfig[]>([
    { key: "materialNo", label: "产品编号", width: 180, visible: true, locked: false },
    { key: "materialName", label: "产品型号", width: 220, visible: true, locked: false },
    { key: "material", label: "材质", width: 140, visible: true, locked: false },
    { key: "image", label: "产品图片", width: 170, visible: true, locked: false },
    { key: "category", label: "分类", width: 180, visible: true, locked: false },
    { key: "quantity", label: "数量", width: 130, visible: true, locked: false },
    { key: "unit", label: "单位", width: 120, visible: true, locked: false },
    { key: "actions", label: "操作", width: 150, visible: true, locked: false },
]);

let structureRowSequence = 0;
const createStructureItem = (product: ProductItem): BomStructureItem => {
    let nextSort = 0;
    for (const [index, item] of bomStructureItems.entries()) {
        nextSort = Math.max(nextSort, (item.sort ?? index) + 1);
    }
    return {
        rowId: `new-${Date.now()}-${++structureRowSequence}`,
        product,
        quantity: 1,
        unitId: product.unitId || null,
        lossRate: 0,
        remark: "",
        sort: nextSort,
    };
};

const searchText = ref("");
const draftEnabledOnly = ref(false);
const appliedEnabledOnly = ref(false);
const selectedBomIds = ref<string[]>([]);
const boms = ref<BomItem[]>([]);
type BomDialogMode = "create" | "edit" | "view";
const bomDialogMode = ref<BomDialogMode>("create");
const editingBomId = ref("");
const editingRevision = ref(1);
const loadedRevision = ref(1);
const editingBomEnabled = ref(true);
const editingSourceItems = ref<BomStructureItem[]>([]);
const historyBom = ref<BomItem | null>(null);
const showBomDialog = ref(false);
const showBomDrafts = ref(false);
const showProductPickerDialog = ref(false);
const showStructureColumnConfigDialog = ref(false);
const pickerContext = ref<"main" | "child" | "replace">("main");
const replacingRowId = ref("");
const selectedProductPickerIds = ref<string[]>([]);
const draggingStructureColumnKey = ref<StructureColumnConfig["key"] | null>(null);
const bomFormError = ref("");
const isLoadingBoms = ref(false);
const isSubmittingBom = ref(false);
const isExportingBom = ref(false);
const isImportingBom = ref(false);
const showImportDialog = ref(false);
const importFile = ref<File | null>(null);
const isImportDragover = ref(false);
const {
    pageSizeOptions,
    pageSize,
    pageNumbers,
    totalPages,
    currentPage,
    jumpPageInput,
    setTotalItems,
    goToPage,
    jumpToInputPage,
} = useInventoryPagination();
const bomForm = reactive<BomForm>(createEmptyBomForm());
const bomStructureItems = reactive<BomStructureItem[]>([]);
const productDetailCache = new Map<string, InventoryProduct>();
const bomTableColumnTemplate = computed(() => [
    "var(--bom-selection-width)",
    ...bomColumns.map(getErpTableGridColumn),
    "var(--bom-action-width)",
].join(" "));
const bomTableMinimumWidth = computed(() =>
    getErpTableMinimumWidth(
        bomColumns,
        ["var(--bom-selection-width)"],
        ["var(--bom-action-width)"],
    ),
);
const visibleStructureColumns = computed(() =>
    structureColumnConfigs.filter((column) => column.visible),
);
const allStructureColumnsVisible = computed(() =>
    structureColumnConfigs.every((column) => column.visible),
);
const hasPendingFilters = computed(() =>
    draftEnabledOnly.value !== appliedEnabledOnly.value,
);
const bomTotal = ref(0);
const bomDrafts = ref<InventoryDraftRecord<BomDraftData>[]>([]);
const paginatedBoms = computed(() => boms.value);

const allRowsSelected = computed(() =>
    paginatedBoms.value.length > 0 &&
    paginatedBoms.value.every((bom) => selectedBomIds.value.includes(bom.id)),
);
const bomDialogTitle = computed(() =>
    bomDialogMode.value === "view"
        ? "查看BOM"
        : bomDialogMode.value === "edit"
            ? "编辑BOM"
            : "新建BOM",
);
const isBomDialogReadonly = computed(() => bomDialogMode.value === "view");
const bomShowDraftActions = computed(() =>
    shouldShowInventoryDraftActions(bomDialogMode.value),
);
const selectedMainProductLabel = computed(() =>
    bomForm.product ? `${bomForm.product.id} / ${bomForm.product.model}` : "",
);
const selectedProductPickerProducts = computed(() => {
    if (pickerContext.value === "main" && bomForm.product) return [bomForm.product];
    if (pickerContext.value === "replace") {
        const item = bomStructureItems.find((row) => row.rowId === replacingRowId.value);
        return item ? [item.product] : [];
    }
    return [];
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

const createProductFromBomItem = (item: any): ProductItem => ({
    backendId: toInventoryEntityId(item.productId),
    id: item.productCode || "",
    model: item.model || "",
    material: item.material || "",
    category: item.categoryName || "未分类",
    categoryId: toInventoryEntityId(item.categoryId),
    image: "",
    totalQuantity: "--",
    availableQuantity: "--",
    unit: item.unitName || "--",
    unitId: toInventoryEntityId(item.unitId),
    source: "--",
    barcode: "",
    modelCode: "",
    snPrefixes: [],
    finishedCount: "--",
    warehouseId: "",
    warehouseName: "",
    locationId: "",
    locationName: "",
});

const createProductFromBomDetail = (bom: BomItem): ProductItem => ({
    backendId: bom.productId,
    id: bom.sku,
    model: bom.model,
    material: "",
    category: "",
    categoryId: "",
    image: "",
    totalQuantity: "--",
    availableQuantity: "--",
    unit: "--",
    unitId: "",
    source: "--",
    barcode: "",
    modelCode: "",
    snPrefixes: [],
    finishedCount: "--",
    warehouseId: "",
    warehouseName: "",
    locationId: "",
    locationName: "",
});

const mergeProductDetail = (fallback: ProductItem, detail?: InventoryProduct): ProductItem => {
    if (!detail) {
        return fallback;
    }

    return {
        ...fallback,
        backendId: detail._id || fallback.backendId,
        id: detail.code || fallback.id,
        model: detail.model || fallback.model,
        material: detail.material || fallback.material,
        category: detail.categoryPath || detail.categoryName || fallback.category,
        categoryId: toInventoryEntityId(detail.categoryId) || fallback.categoryId,
        image: detail.image || fallback.image,
        unit: detail.unitName || fallback.unit,
        unitId: toInventoryEntityId(detail.unitId) || fallback.unitId,
        source: detail.source || fallback.source,
        finishedCount: formatOneDecimalText(detail.kitQuantity, fallback.finishedCount),
        warehouseName: detail.warehouseName || fallback.warehouseName,
        locationName: detail.locationName || fallback.locationName,
    };
};

const fetchProductDetailForBom = async (fallback: ProductItem) => {
    if (!fallback.backendId) {
        return fallback;
    }

    const cached = productDetailCache.get(fallback.backendId);
    if (cached) {
        return mergeProductDetail(fallback, cached);
    }

    try {
        const res = await getInventoryProductDetail({ id: fallback.backendId });
        if (res.code === 200 && res.data?.detail) {
            productDetailCache.set(fallback.backendId, res.data.detail);
            return mergeProductDetail(fallback, res.data.detail);
        }
    } catch {
        // Keep BOM snapshot data when live product detail is unavailable.
    }

    return fallback;
};

const normalizeBom = (bom: InventoryBom): BomItem => ({
    backendId: bom._id || "",
    revision: bom.revision || 1,
    productId: toInventoryEntityId(bom.productId),
    id: bom.code || "",
    name: bom.name || "",
    sku: bom.productCode || "",
    model: bom.model || "",
    enabled: Boolean(bom.isEnabled),
    remark: bom.remark || "--",
    updatedBy: bom.updatedBy || bom.operator || "--",
    updatedAt: formatDateTime(bom.updateTime),
    items: Array.isArray(bom.items)
        ? bom.items.map((item, index) => ({
            rowId: item.lineId || `legacy-${toInventoryEntityId(item.productId)}`,
            lineId: item.lineId || `legacy-${toInventoryEntityId(item.productId)}`,
            product: createProductFromBomItem(item),
            quantity: Number(item.quantity || 1),
            unitId: toInventoryEntityId(item.unitId) || null,
            lossRate: item.lossRate ?? 0,
            remark: item.remark || "",
            sort: item.sort ?? index,
        }))
        : [],
});

const handleApiError = (err: any, fallbackMessage: string) => {
    ElMessage.error(err?.data?.msg || err?.message || fallbackMessage);
};

const loadBoms = async (resetPage = true) => {
    if (isLoadingBoms.value) {
        return;
    }

    if (resetPage) {
        goToPage(1);
    }

    isLoadingBoms.value = true;
    let shouldReloadAdjustedPage = false;
    try {
        const requestedPage = currentPage.value;
        const res = await retrieveInventoryBoms({
            keyword: searchText.value.trim() || undefined,
            isEnabled: appliedEnabledOnly.value ? true : undefined,
            page: currentPage.value,
            limit: pageSize.value,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取BOM列表失败");
            boms.value = [];
            bomTotal.value = 0;
            setTotalItems(0);
            return;
        }

        boms.value = Array.isArray(res.data?.list)
            ? res.data.list.map(normalizeBom)
            : [];
        bomTotal.value = Number(res.data?.pagination?.total || 0);
        setTotalItems(bomTotal.value);
        shouldReloadAdjustedPage = requestedPage !== currentPage.value;
    } catch (err: any) {
        boms.value = [];
        bomTotal.value = 0;
        setTotalItems(0);
        handleApiError(err, "获取BOM列表失败");
    } finally {
        isLoadingBoms.value = false;
    }

    if (shouldReloadAdjustedPage) {
        await loadBoms(false);
    }
};

function createEmptyBomForm(): BomForm {
    return {
        id: "",
        name: "",
        remark: "",
        product: null,
    };
}

const resetFilters = () => {
    searchText.value = "";
    draftEnabledOnly.value = false;
    appliedEnabledOnly.value = false;
    loadBoms();
};

const applyFilters = () => {
    appliedEnabledOnly.value = draftEnabledOnly.value;
    loadBoms();
};

const handleBomPageChange = (page: number) => {
    if (isLoadingBoms.value) {
        return;
    }

    const previousPage = currentPage.value;
    goToPage(page);

    if (currentPage.value !== previousPage) {
        loadBoms(false);
    }
};

const handleBomJump = () => {
    if (isLoadingBoms.value) {
        return;
    }

    const previousPage = currentPage.value;
    jumpToInputPage();

    if (currentPage.value !== previousPage) {
        loadBoms(false);
    }
};

const toggleSelectAll = () => {
    if (allRowsSelected.value) {
        selectedBomIds.value = selectedBomIds.value.filter(
            (id) => !paginatedBoms.value.some((bom) => bom.id === id),
        );
        return;
    }

    selectedBomIds.value = [
        ...new Set([
            ...selectedBomIds.value,
            ...paginatedBoms.value.map((bom) => bom.id),
        ]),
    ];
};

const openBomProductDetail = async (bom: BomItem) => {
    bomDialogMode.value = "view";
    if (await loadBomDialogForm(bom)) showBomDialog.value = true;
};

const resetBomDialog = () => {
    Object.assign(bomForm, createEmptyBomForm());
    bomStructureItems.splice(0, bomStructureItems.length);
    editingRevision.value = 1;
    loadedRevision.value = 1;
    editingBomEnabled.value = true;
    editingSourceItems.value = [];
    replacingRowId.value = "";
    bomFormError.value = "";
};

const normalizeDraftProduct = (product?: Partial<ProductItem> | null): ProductItem | null => {
    if (!product) {
        return null;
    }

    return {
        backendId: product.backendId || "",
        id: product.id || "",
        model: product.model || "",
        material: product.material || "",
        category: product.category || "未分类",
        categoryId: product.categoryId || "",
        image: product.image || "",
        totalQuantity: product.totalQuantity || "--",
        availableQuantity: product.availableQuantity || "--",
        unit: product.unit || "--",
        unitId: product.unitId || "",
        source: product.source || "--",
        barcode: product.barcode || "",
        modelCode: product.modelCode || "",
        snPrefixes: Array.isArray(product.snPrefixes) ? [...product.snPrefixes] : [],
        finishedCount: product.finishedCount || "--",
        warehouseId: product.warehouseId || "",
        warehouseName: product.warehouseName || "",
        locationId: product.locationId || "",
        locationName: product.locationName || "",
    };
};

const toBomDraftData = (): BomDraftData => ({
    sourceBomId: bomDialogMode.value === "edit" ? editingBomId.value : undefined,
    baseRevision: bomDialogMode.value === "edit" ? editingRevision.value : undefined,
    name: bomForm.name,
    remark: bomForm.remark,
    product: normalizeDraftProduct(bomForm.product),
    structureItems: bomStructureItems
        .map((item): BomStructureItem | null => {
            const product = normalizeDraftProduct(item.product);
            if (!product) {
                return null;
            }

            return {
                rowId: item.rowId,
                lineId: item.lineId,
                product,
                quantity: Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
                    ? Number(item.quantity)
                    : 1,
                unitId: item.unitId,
                lossRate: item.lossRate,
                remark: item.remark,
                sort: item.sort,
            };
        })
        .filter((item): item is BomStructureItem => Boolean(item)),
});

const loadBomDrafts = async () => {
    try {
        bomDrafts.value = await listInventoryDrafts<BomDraftData>("bom");
    } catch (err: any) {
        bomDrafts.value = [];
        handleApiError(err, "读取BOM草稿失败");
    }
};

const saveBomDraft = async () => {
    const now = Date.now();
    const title = bomForm.name.trim() || bomForm.product?.model || "未命名BOM草稿";

    try {
        await saveInventoryDraft<BomDraftData>({
            id: createInventoryDraftId("bom"),
            type: "bom",
            title,
            data: toBomDraftData(),
            files: [],
            createdAt: now,
            updatedAt: now,
        });
        await loadBomDrafts();
        ElMessage.success("草稿已保存");
    } catch (err: any) {
        handleApiError(err, "保存BOM草稿失败");
    }
};

const openBomDrafts = async () => {
    await loadBomDrafts();
    showBomDrafts.value = true;
};

const applyBomDraft = (draft: InventoryDraftRecord) => {
    const bomDraft = draft as InventoryDraftRecord<BomDraftData>;
    const data = bomDraft.data || {
        name: "",
        remark: "",
        product: null,
        structureItems: [],
    };
    const currentBomCode = bomForm.id;
    const product = normalizeDraftProduct(data.product);
    const sameBom = bomDialogMode.value === "edit"
        && data.sourceBomId === editingBomId.value
        && Number.isInteger(data.baseRevision) && Number(data.baseRevision) > 0;
    const sourceByProduct = new Map(editingSourceItems.value.map((item) => [item.product.backendId, item]));
    const sourceByLine = new Map(editingSourceItems.value.map((item) => [item.lineId, item]));
    let nextSort = 0;
    for (const item of editingSourceItems.value) nextSort = Math.max(nextSort, (item.sort ?? 0) + 1);
    const structureItems = Array.isArray(data.structureItems)
        ? data.structureItems
            .map((item, index): BomStructureItem | null => {
                const itemProduct = normalizeDraftProduct(item.product);
                if (!itemProduct) {
                    return null;
                }

                const source = sameBom && item.lineId
                    ? sourceByLine.get(item.lineId)
                    : sourceByProduct.get(itemProduct.backendId);
                const lineId = sameBom ? item.lineId : source?.lineId;
                return {
                    rowId: lineId || `new-${Date.now()}-${++structureRowSequence}`,
                    lineId,
                    product: itemProduct,
                    quantity: Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
                        ? Number(item.quantity)
                        : 1,
                    unitId: item.unitId !== undefined ? item.unitId : source?.unitId ?? (itemProduct.unitId || null),
                    lossRate: item.lossRate ?? source?.lossRate ?? 0,
                    remark: item.remark ?? source?.remark ?? "",
                    sort: sameBom ? item.sort ?? source?.sort ?? index : source?.sort ?? nextSort++,
                };
            })
            .filter((item): item is BomStructureItem => Boolean(item))
        : [];

    bomFormError.value = "";
    editingRevision.value = sameBom ? Number(data.baseRevision) : loadedRevision.value;
    Object.assign(bomForm, {
        id: bomDialogMode.value === "edit" ? currentBomCode : "",
        name: data.name || "",
        remark: data.remark || "",
        product,
    });
    bomStructureItems.splice(0, bomStructureItems.length, ...structureItems);
    showBomDrafts.value = false;
};

const removeBomDraft = async (id: string) => {
    try {
        await deleteInventoryDraft(id);
        bomDrafts.value = bomDrafts.value.filter((draft) => draft.id !== id);
        ElMessage.success("草稿已删除");
    } catch (err: any) {
        handleApiError(err, "删除BOM草稿失败");
    }
};

const createBom = () => {
    bomDialogMode.value = "create";
    editingBomId.value = "";
    resetBomDialog();
    void loadBomDrafts();
    showBomDialog.value = true;
};

const loadBomDialogForm = async (bom: BomItem) => {
    if (!bom.backendId) {
        ElMessage.error("当前BOM缺少后端ID，无法读取");
        return false;
    }
    let detail: BomItem;
    try {
        const res = await getInventoryBomDetail({ id: bom.backendId });
        if (res.code !== 200 || !res.data?.detail) {
            ElMessage.error(res.msg || "获取BOM详情失败");
            return false;
        }
        detail = normalizeBom(res.data.detail);
    } catch (err: any) {
        handleApiError(err, "获取BOM详情失败");
        return false;
    }

    editingBomId.value = detail.backendId;
    editingRevision.value = detail.revision;
    loadedRevision.value = detail.revision;
    editingBomEnabled.value = detail.enabled;
    editingSourceItems.value = detail.items.map((item) => ({ ...item }));
    bomFormError.value = "";
    bomForm.id = detail.id;
    bomForm.name = detail.name;
    bomForm.remark = detail.remark === "--" ? "" : detail.remark;
    const mainProduct = await fetchProductDetailForBom(
        createProductFromBomDetail(detail),
    );
    const structureItems = await Promise.all(
        detail.items.map(async (item) => ({
            ...item,
            product: {
                ...await fetchProductDetailForBom(item.product),
                unitId: item.unitId || "",
                unit: item.product.unit,
            },
        })),
    );

    bomForm.product = mainProduct;
    bomStructureItems.splice(
        0,
        bomStructureItems.length,
        ...structureItems,
    );
    return true;
};

const openEditBomDialog = async (bom: BomItem) => {
    bomDialogMode.value = "edit";
    if (!await loadBomDialogForm(bom)) return;
    void loadBomDrafts();
    showBomDialog.value = true;
};

const closeBomDialog = () => {
    showBomDialog.value = false;
    showBomDrafts.value = false;
};

const openProductPicker = async (context: "main" | "child") => {
    if (isBomDialogReadonly.value) {
        return;
    }

    pickerContext.value = context;
    replacingRowId.value = "";
    selectedProductPickerIds.value = context === "main" && bomForm.product
        ? [bomForm.product.id]
        : [];
    showProductPickerDialog.value = true;
};

const closeProductPicker = () => {
    showProductPickerDialog.value = false;
    replacingRowId.value = "";
};

const replaceBomStructureItem = (rowId: string) => {
    if (isBomDialogReadonly.value) return;
    const item = bomStructureItems.find((row) => row.rowId === rowId);
    if (!item) return;
    pickerContext.value = "replace";
    replacingRowId.value = rowId;
    selectedProductPickerIds.value = [item.product.id];
    showProductPickerDialog.value = true;
};

const confirmProductSelection = (selectedProducts: ProductItem[]) => {
    if (!selectedProducts.length) {
        return;
    }

    if (pickerContext.value === "main") {
        if (bomStructureItems.some((item) => item.product.backendId === selectedProducts[0]?.backendId)) {
            ElMessage.warning("主产品不能作为自己的子项，请先移除对应子项");
            return;
        }
        bomForm.product = selectedProducts[0];
        bomFormError.value = "";
    } else {
        const replacing = pickerContext.value === "replace"
            ? bomStructureItems.find((item) => item.rowId === replacingRowId.value)
            : undefined;
        if (pickerContext.value === "replace" && !replacing) return;
        const selected = pickerContext.value === "replace" ? selectedProducts.slice(0, 1) : selectedProducts;
        const existingIds = new Set(bomStructureItems
            .filter((item) => item !== replacing)
            .map((item) => item.product.backendId));
        for (const product of selected) {
            if (!product.backendId || product.backendId === bomForm.product?.backendId) {
                ElMessage.warning("请选择有效子项，主产品不能作为自己的子项");
                return;
            }
            if (existingIds.has(product.backendId)) {
                ElMessage.warning(`产品 ${product.id} 已在BOM中，不能重复选择`);
                return;
            }
            existingIds.add(product.backendId);
        }
        if (replacing) {
            const product = selected[0];
            if (!product) return;
            if (product.backendId !== replacing.product.backendId) {
                replacing.product = product;
                replacing.unitId = product.unitId || null;
            }
        } else {
            for (const product of selected) bomStructureItems.push(createStructureItem(product));
        }
    }

    closeProductPicker();
};

const clearBomStructure = () => {
    if (isBomDialogReadonly.value) {
        return;
    }

    bomStructureItems.splice(0, bomStructureItems.length);
};

const removeBomStructureItem = (rowId: string) => {
    if (isBomDialogReadonly.value) {
        return;
    }

    const itemIndex = bomStructureItems.findIndex((item) => item.rowId === rowId);

    if (itemIndex >= 0) {
        bomStructureItems.splice(itemIndex, 1);
    }
};

const formatStructureQuantity = (quantity: number) => {
    return (Number.isFinite(quantity) ? quantity : 1).toFixed(1);
};

const updateStructureQuantity = (item: BomStructureItem, event: Event) => {
    if (isBomDialogReadonly.value) {
        return;
    }

    const input = event.target as HTMLInputElement;
    const nextQuantity = Number(input.value);

    item.quantity = Number.isFinite(nextQuantity) && nextQuantity >= 1
        ? Number(nextQuantity.toFixed(1))
        : 1;
    input.value = formatStructureQuantity(item.quantity);
};

const buildBomPayload = (enabled = true): InventoryBomMutationPayload | null => {
    if (!bomForm.name.trim() || !bomForm.product) {
        bomFormError.value = "请填写BOM名称并选择产品";
        return null;
    }

    if (!bomForm.product.backendId) {
        bomFormError.value = "请选择有效的主产品";
        return null;
    }

    const items = bomStructureItems
        .filter((item) => item.product.backendId)
        .map((item, index) => ({
            lineId: item.lineId,
            productId: item.product.backendId,
            quantity: Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
                ? Number(item.quantity)
                : 1,
            unitId: item.unitId !== undefined ? item.unitId : item.product.unitId || null,
            lossRate: item.lossRate ?? 0,
            remark: item.remark || "",
            sort: item.sort ?? index,
        }));

    return {
        name: bomForm.name.trim(),
        productId: bomForm.product.backendId,
        isEnabled: enabled,
        remark: bomForm.remark.trim(),
        items,
    };
};

const confirmBomDialog = async () => {
    if (isSubmittingBom.value) {
        return;
    }

    const payload = buildBomPayload(
        bomDialogMode.value === "edit" ? editingBomEnabled.value : true,
    );
    if (!payload) {
        return;
    }
    if (bomDialogMode.value === "edit" && !editingBomId.value) {
        bomFormError.value = "当前BOM缺少后端ID，无法编辑";
        return;
    }

    isSubmittingBom.value = true;
    try {
        const res = bomDialogMode.value === "edit"
            ? await updateInventoryBom({ ...payload, id: editingBomId.value, expectedRevision: editingRevision.value })
            : await addInventoryBom(payload);
        const actionLabel = bomDialogMode.value === "edit" ? "编辑" : "新增";

        if (res.code !== 200) {
            ElMessage.error(res.msg || `${actionLabel}BOM失败`);
            return;
        }

        ElMessage.success(`${actionLabel}BOM成功`);
        closeBomDialog();
        await loadBoms(bomDialogMode.value === "create");
    } catch (err: any) {
        if (err?.statusCode === 409 || err?.response?.status === 409) {
            bomFormError.value = err?.data?.msg || "BOM已被修改，请重新打开后编辑；当前内容已保留，可先保存草稿";
        }
        handleApiError(err, bomDialogMode.value === "edit" ? "编辑BOM失败" : "新增BOM失败");
    } finally {
        isSubmittingBom.value = false;
    }
};

const deleteBom = async (bomId: string) => {
    const bom = boms.value.find((item) => item.id === bomId);
    if (!bom?.backendId || isSubmittingBom.value) {
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除BOM ${bom.name || bom.id}`, "删除BOM", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmittingBom.value = true;
    try {
        const res = await deleteInventoryBom({ ids: [bom.backendId] });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "删除BOM失败");
            return;
        }

        ElMessage.success("删除BOM成功");
        selectedBomIds.value = selectedBomIds.value.filter((id) => id !== bomId);
        await loadBoms(false);
    } catch (err: any) {
        handleApiError(err, "删除BOM失败");
    } finally {
        isSubmittingBom.value = false;
    }
};

const batchDeleteBoms = async () => {
    const selectedBoms = boms.value.filter((bom) =>
        selectedBomIds.value.includes(bom.id) && bom.backendId,
    );
    const ids = selectedBoms.map((bom) => bom.backendId);

    if (!ids.length || isSubmittingBom.value) {
        ElMessage.warning("请先选择需要删除的BOM");
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除选中的 ${ids.length} 个BOM？`, "批量删除BOM", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmittingBom.value = true;
    try {
        const res = await deleteInventoryBom({ ids });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "批量删除BOM失败");
            return;
        }

        selectedBomIds.value = [];
        ElMessage.success("批量删除BOM成功");
        await loadBoms(false);
    } catch (err: any) {
        handleApiError(err, "批量删除BOM失败");
    } finally {
        isSubmittingBom.value = false;
    }
};

const toggleBomEnabled = async (bomId: string) => {
    const bom = boms.value.find((item) => item.id === bomId);
    if (!bom?.backendId || isSubmittingBom.value) {
        return;
    }

    isSubmittingBom.value = true;
    try {
        const res = await updateInventoryBom({
            id: bom.backendId,
            expectedRevision: bom.revision,
            isEnabled: !bom.enabled,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "更新BOM状态失败");
            return;
        }

        ElMessage.success(`${bom.enabled ? "停用" : "启用"}BOM成功`);
        await loadBoms(false);
    } catch (err: any) {
        handleApiError(err, "更新BOM状态失败");
    } finally {
        isSubmittingBom.value = false;
    }
};

const exportBoms = async () => {
    if (isExportingBom.value) {
        return;
    }

    isExportingBom.value = true;
    try {
        const params = selectedBomIds.value.length
            ? { codes: [...selectedBomIds.value] }
            : {
                keyword: searchText.value.trim() || undefined,
                isEnabled: appliedEnabledOnly.value ? true : undefined,
            };
        const blob = await exportInventoryBoms(params);

        if (await downloadBlob(blob, `BOM导出_${new Date().toISOString().slice(0, 10)}.xlsx`)) {
            ElMessage.success("导出BOM成功");
        }
    } catch (err: any) {
        handleApiError(err, "导出BOM失败");
    } finally {
        isExportingBom.value = false;
    }
};

// 导入相关函数
const importFileName = computed(() => importFile.value?.name || "");

const openImportDialog = () => {
    if (isImportingBom.value) {
        return;
    }

    showImportDialog.value = true;
};

const closeImportDialog = () => {
    if (isImportingBom.value) {
        return;
    }

    showImportDialog.value = false;
    importFile.value = null;
};

const removeImportFile = () => {
    if (isImportingBom.value) {
        return;
    }

    importFile.value = null;
};

const setImportFile = (file: File) => {
    if (!file) {
        return;
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
        ElMessage.warning("请上传 Excel 文件（.xlsx）");
        return;
    }

    if (file.size > INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES) {
        ElMessage.warning(INVENTORY_IMPORT_FILE_SIZE_MESSAGE);
        return;
    }

    importFile.value = file;
};

const handleImportFileChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
        return;
    }

    setImportFile(file);
    input.value = "";
};

const handleImportDragover = () => {
    if (isImportingBom.value) {
        return;
    }

    isImportDragover.value = true;
};

const handleImportDragleave = () => {
    isImportDragover.value = false;
};

const handleImportDrop = (event: DragEvent) => {
    if (isImportingBom.value) {
        return;
    }

    isImportDragover.value = false;
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    droppedFiles.forEach(setImportFile);
};

const downloadBomImportTemplate = async () => {
    const XLSX = await import("xlsx");
    const headers = [
        "BOM名称",
        "主产品型号",
        "是否启用",
        "备注",
        "子项产品序号",
        "子项产品型号",
        "子项产品数量",
    ];
    const examples = [
        ["示例BOM1", "通用脚架1", "是", "示例备注", 1, "TG-C-1816-333", 1],
        ["", "", "", "", 2, "PETG-XN-1", 1],
        ["", "", "", "", 3, "LHJ-L-XN", 1],
        ["", "", "", "", 4, "TPU-JD-18", 1],
        ["", "", "", "", 5, "PETG-JJ-18", 1],
        ["", "", "", "", 6, "热熔螺母M3-6-4.2", 1],
        ["", "", "", "", 7, "杯头内六角螺丝M3-18", 1],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);

    // 设置列宽
    ws["!cols"] = [
        { wch: 18 },
        { wch: 18 },
        { wch: 12 },
        { wch: 16 },
        { wch: 14 },
        { wch: 24 },
        { wch: 14 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOM导入模板");
    await downloadWorkbook(wb, "BOM导入模板.xlsx");
};

const confirmImportBoms = async () => {
    if (!importFile.value || isImportingBom.value) {
        return;
    }

    try {
        await erpMessageBox.confirm("是否确认导入文件 " + importFile.value.name + "？", "导入BOM", {
            type: "warning",
            confirmButtonText: "确认导入",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    const formData = new FormData();
    formData.append("file", importFile.value);

    isImportingBom.value = true;
    try {
        const res = await importInventoryBoms(formData);

        if (res.code !== 200) {
            ElMessage.error(res.msg || "导入BOM失败");
            return;
        }

        const data = res.data;
        if (!data) {
            ElMessage.error("导入BOM失败");
            return;
        }

        if (data.errorCount > 0) {
            const errorMessages = data.errors.slice(0, 5).map((e) => `第${e.row}行: ${e.message}`).join("\n");
            erpMessageBox.alert(
                `<div>成功导入 ${Number(data.successCount)} 条，失败 ${Number(data.errorCount)} 条</div><div style="margin-top:8px;font-size:12px;color:var(--erp-color-text-secondary);white-space:pre-line;">${escapeHtml(errorMessages)}</div>`,
                "导入结果",
                { dangerouslyUseHTMLString: true, confirmButtonText: "确定" },
            );
        } else {
            ElMessage.success(`成功导入 ${data.successCount} 条BOM`);
        }

        closeImportDialog();
        loadBoms();
    } catch (err: any) {
        handleApiError(err, "导入BOM失败");
    } finally {
        isImportingBom.value = false;
    }
};

const getBomCellValue = (bom: BomItem, key: BomColumn["key"]) => {
    if (key === "revision") return `V${bom.revision}`;
    if (key === "enabled") {
        return bom.enabled ? "启用" : "停用";
    }

    return bom[key] || "--";
};

const shouldShowBomRemarkPopover = (bom: BomItem) => {
    const remark = getBomCellValue(bom, "remark");

    return remark !== "--" && remark.length > 12;
};

const openStructureColumnConfigDialog = () => {
    showStructureColumnConfigDialog.value = true;
};

const closeStructureColumnConfigDialog = () => {
    showStructureColumnConfigDialog.value = false;
};

const BOM_STRUCTURE_COLUMN_CONFIG_STORAGE_KEY = "inventory.bom.structureColumnConfigs";

const confirmStructureColumnConfig = () => {
    persistStructureColumnConfigs();
    closeStructureColumnConfigDialog();
};

const persistStructureColumnConfigs = () => {
    const configs = structureColumnConfigs.map((column) => ({
        key: column.key,
        visible: column.visible,
        locked: column.locked,
    }));
    localStorage.setItem(BOM_STRUCTURE_COLUMN_CONFIG_STORAGE_KEY, JSON.stringify(configs));
};

const applyStoredStructureColumnConfigs = () => {
    const rawConfigs = localStorage.getItem(BOM_STRUCTURE_COLUMN_CONFIG_STORAGE_KEY);
    if (!rawConfigs) {
        return;
    }

    try {
        const configs = JSON.parse(rawConfigs) as Array<{ key: string; visible: boolean; locked: boolean }>;
        const configMap = new Map(configs.map((c) => [c.key, c]));

        structureColumnConfigs.forEach((column) => {
            const stored = configMap.get(column.key);
            if (stored) {
                column.visible = stored.visible;
                column.locked = stored.locked;
            }
        });

        const orderedKeys = configs.map((c) => c.key);
        structureColumnConfigs.sort((a, b) => {
            const indexA = orderedKeys.indexOf(a.key);
            const indexB = orderedKeys.indexOf(b.key);
            const orderA = indexA >= 0 ? indexA : 999;
            const orderB = indexB >= 0 ? indexB : 999;
            return orderA - orderB;
        });
    } catch {
        localStorage.removeItem(BOM_STRUCTURE_COLUMN_CONFIG_STORAGE_KEY);
    }
};

const toggleStructureColumnVisible = (columnKey: StructureColumnConfig["key"]) => {
    const column = structureColumnConfigs.find((config) => config.key === columnKey);

    if (column) {
        column.visible = !column.visible;
    }
};

const toggleStructureColumnVisibleByKey = (columnKey: string) => {
    toggleStructureColumnVisible(columnKey as StructureColumnConfig["key"]);
};

const toggleAllStructureColumnsVisible = () => {
    const nextVisible = !allStructureColumnsVisible.value;
    structureColumnConfigs.forEach((column) => {
        column.visible = nextVisible;
    });
};

const sortLockedStructureColumnsFirst = () => {
    const locked = structureColumnConfigs.filter((column) => column.locked);
    const unlocked = structureColumnConfigs.filter((column) => !column.locked);
    structureColumnConfigs.splice(0, structureColumnConfigs.length, ...locked, ...unlocked);
};

const toggleStructureColumnLocked = (columnKey: StructureColumnConfig["key"]) => {
    const column = structureColumnConfigs.find((config) => config.key === columnKey);

    if (!column) {
        return;
    }

    column.locked = !column.locked;
    sortLockedStructureColumnsFirst();
};

const toggleStructureColumnLockedByKey = (columnKey: string) => {
    toggleStructureColumnLocked(columnKey as StructureColumnConfig["key"]);
};

const moveStructureColumnConfig = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
        return;
    }

    const movingColumn = structureColumnConfigs[fromIndex];
    const targetColumn = structureColumnConfigs[toIndex];

    if (movingColumn.locked !== targetColumn.locked) {
        return;
    }

    const [column] = structureColumnConfigs.splice(fromIndex, 1);
    structureColumnConfigs.splice(toIndex, 0, column);
};

const startStructureColumnDrag = (columnKey: StructureColumnConfig["key"]) => {
    draggingStructureColumnKey.value = columnKey;
};

const startStructureColumnDragByKey = (columnKey: string) => {
    startStructureColumnDrag(columnKey as StructureColumnConfig["key"]);
};

const dropStructureColumn = (targetColumnKey: StructureColumnConfig["key"]) => {
    if (!draggingStructureColumnKey.value || draggingStructureColumnKey.value === targetColumnKey) {
        return;
    }

    const fromIndex = structureColumnConfigs.findIndex(
        (column) => column.key === draggingStructureColumnKey.value,
    );
    const toIndex = structureColumnConfigs.findIndex(
        (column) => column.key === targetColumnKey,
    );

    moveStructureColumnConfig(fromIndex, toIndex);
    draggingStructureColumnKey.value = null;
};

const dropStructureColumnByKey = (targetColumnKey: string) => {
    dropStructureColumn(targetColumnKey as StructureColumnConfig["key"]);
};

watch(pageSize, () => {
    loadBoms();
});

onMounted(async () => {
    applyStoredStructureColumnConfigs();
    await loadBoms();
});
</script>

<style scoped>
button,
input,
select,
textarea {
    font: inherit;
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

.selection-head,
.selection-row,
.action-head,
.action-row {
    display: flex;
    align-items: center;
    justify-content: center;
}

.remark-cell-text {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
}

.checkbox-cell {
    padding: 0;
}

.switch.active span {
    transform: translateX(20px);
}

.import-upload-box.disabled {
    cursor: not-allowed;
    opacity: 0.65;
}

.import-upload-box input {
    display: none;
}

.import-file-attachment {
    width: 100%;
    margin-bottom: 0;
}

.import-template-button:hover {
    text-decoration: underline;
}

.import-hint-list p {
    margin: 0;
}

.bom-page {
    --bom-selection-width: 58px;
    --bom-action-width: max(156px, var(--erp-table-col-action));

    height: 100%;
    display: grid;
    grid-template-rows: 40px 56px 32px minmax(0, 1fr) 52px;
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

.enabled-field {
    gap: var(--erp-spacing-12);
}

.filter-checkbox {
    margin: 0;
    cursor: pointer;
    width: 18px;
    height: 18px;
    accent-color: var(--erp-color-action-primary);
}

.filter-actions {
    margin-left: auto;
    gap: var(--erp-spacing-12);
}

.toolbar-left {
    gap: var(--erp-spacing-12);
}

.primary-button,
.outline-button,
.muted-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    height: var(--erp-size-control-height-sm);
    gap: var(--erp-spacing-4);
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
}

.primary-button {
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.primary-button:not(:disabled):active {
    background: var(--erp-color-action-primary-pressed);
}

.outline-button {
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
}

.danger-button {
    border-color: var(--erp-color-border-error);
    color: var(--erp-color-text-status-error);
}

.danger-button:not(:disabled):hover {
    border-color: var(--erp-color-border-error);
    background: var(--erp-color-bg-status-error);
}

.primary-button:disabled,
.outline-button:disabled,
.muted-button:disabled {
    border-color: var(--erp-color-border-muted);
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

.danger-button:disabled {
    border-color: color-mix(in srgb, var(--erp-color-border-error) 70%, transparent);
    color: color-mix(in srgb, var(--erp-color-text-status-error) 70%, transparent);
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

.button-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.table-row {
    display: grid;
    align-items: center;
    width: max-content;
    min-width: 100%;
    padding-right: var(--erp-spacing-8);
}

.selection-head,
.selection-row {
    position: sticky;
    z-index: 5;
    left: 0;
}

.action-head,
.action-row {
    position: sticky;
    z-index: 5;
    right: 0;
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

.selection-head,
.action-head {
    height: 100%;
    border-radius: 0;
    background: var(--erp-color-fill-table-header);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.selection-row,
.action-row {
    height: 80px;
    border-radius: 0;
    background: inherit;
    font-size: var(--erp-typography-content1-font-size);
}

.table-cell {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 0 var(--erp-spacing-20);
}

.checkbox-control {
    width: 100%;
    height: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.row-checkbox {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--erp-color-action-primary);
}

:global(.bom-remark-popover) {
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
}

:global(.bom-remark-popover .remark-popover-content) {
    word-break: break-word;
    white-space: normal;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.switch {
    width: 40px;
    height: 20px;
    position: relative;
    padding: 0;
    border: 0;
    border-radius: 999px;
    cursor: pointer;
    background: var(--erp-color-fill-disabled);
}

.switch span {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    box-shadow: var(--erp-shadow-surface);
    transition: transform 0.16s ease;
    background: var(--erp-color-fill-default);
}

.switch.active {
    background: var(--erp-color-action-primary);
}

.actions-cell {
    gap: var(--erp-spacing-12);
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
    border-radius: var(--erp-radius-control-default);
}

.icon-button.blue {
    color: var(--erp-color-icon-brand);
}

.icon-button.delete {
    color: var(--erp-color-icon-error);
}

.icon-button:hover {
    background: var(--erp-color-fill-hover);
}

.import-dialog-body {
    padding: 0 4px;
    color: var(--erp-color-text-primary);
}

.import-section-title {
    border-bottom: 1px solid var(--erp-color-divider-subtle);
    margin: var(--erp-spacing-8) 0 var(--erp-spacing-12);
    padding-bottom: var(--erp-spacing-8);
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.import-upload-box {
    height: 118px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--erp-color-border-default);
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    gap: var(--erp-spacing-10);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.import-upload-box:hover,
.import-upload-box.is-dragover {
    border-color: var(--erp-color-border-brand);
    background: var(--erp-color-fill-hover);
}

.import-hint {
    margin: 8px 0 0;
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.import-template-button {
    margin-top: 10px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    color: var(--erp-color-text-brand);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.import-hint-list {
    display: grid;
    gap: var(--erp-spacing-8);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.import-hint-list strong {
    color: var(--erp-color-text-secondary-strong);
}

.import-hint-list .warning {
    padding: 8px 12px;
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-bg-status-producing);
}

.uploaded-image-attachment {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-fill-control-secondary);
}

.uploaded-image-info {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.uploaded-image-icon {
    color: var(--erp-color-icon-secondary);
}

.uploaded-image-remove {
    padding: 4px 8px;
    border: 1px solid var(--erp-color-border-default);
    cursor: pointer;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-status-error);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.uploaded-image-remove:hover {
    background: var(--erp-color-bg-status-error);
}
</style>
