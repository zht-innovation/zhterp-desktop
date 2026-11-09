<template>
    <div class="outbound-page" :class="{ 'seller-readonly': isSellerReadonly }">
        <header class="topbar">
            <ErpBreadcrumb icon="lucide:package-minus" :items="outboundBreadcrumbItems" />

            <ErpSearchBox
                v-model="searchText"
                :disabled="loading"
                @search="applySearch"
            />
        </header>

        <div class="filter-row">
            <div class="filter-field date-field">
                <span>出库日期</span>
                <InventoryDatePicker
                    ref="datePickerRef"
                    v-model="draftOutboundDate"
                    aria-label-text="选择出库日期"
                    initial-month="2027-05-01"
                />
            </div>

            <label class="filter-field">
                <span>出库类型</span>
                <select v-model="draftOutboundType" :disabled="isSellerReadonly" aria-label="筛选出库类型">
                    <option v-if="!isSellerReadonly" value="">请选择</option>
                    <option
                        v-for="type in outboundFilterTypeOptions"
                        :key="type"
                        :value="type"
                    >
                        {{ type }}
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
            </div>
        </div>

        <div v-if="!isSellerReadonly" class="toolbar">
            <div class="toolbar-left">
                <button class="primary-button" type="button" @click="openCreateDialog">
                    <Icon name="lucide:circle-plus" class="button-icon" />
                    <span>新建</span>
                </button>
                <button class="outline-button" type="button" @click="openImportDialog">
                    <Icon name="lucide:download" class="button-icon" />
                    <span>导入</span>
                </button>
                <button class="outline-button" type="button" @click="exportOutboundOrders">
                    <Icon name="lucide:upload" class="button-icon" />
                    <span>{{ selectedOrderIds.length ? '导出选中' : '导出' }}</span>
                </button>
                <button
                    v-if="canDeleteOutbound"
                    class="outline-button danger-button"
                    type="button"
                    :disabled="selectedOrderIds.length === 0"
                    @click="batchDeleteOutboundOrders"
                >
                    <Icon name="lucide:trash-2" class="button-icon" />
                    <span>批量删除</span>
                </button>
            </div>
        </div>

        <ErpTableFrame
            data-inventory-copy-table
            :columns="outboundTableColumnTemplate"
            :minimum-width="outboundTableMinimumWidth"
            :loading="loading"
            :empty="!loading && outboundOrders.length === 0"
            loading-text="正在加载出库单..."
            empty-text="暂无匹配出库单"
            scroll-x
        >
            <template #header>
                <div class="table-row table-head">
                    <div v-if="!isSellerReadonly" class="selection-head checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                class="row-checkbox"
                                type="checkbox"
                                :checked="allRowsSelected"
                                :disabled="outboundOrders.length === 0"
                                @change="toggleSelectAll"
                            >
                        </label>
                    </div>
                    <div
                        v-for="column in outboundColumns"
                        :key="column.key"
                        class="table-cell"
                    >
                        {{ column.label }}
                    </div>
                    <div class="action-head erp-table-fixed-end">操作</div>
                </div>
            </template>

            <template v-for="order in outboundOrders" :key="order._id">
                <div class="table-row data-row">
                    <div v-if="!isSellerReadonly" class="selection-row checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                v-model="selectedOrderIds"
                                class="row-checkbox"
                                type="checkbox"
                                :value="order._id"
                            >
                        </label>
                    </div>
                    <div
                        v-for="column in outboundColumns"
                        :key="`${order._id}-${column.key}`"
                        class="table-cell"
                        :class="{ 'remark-cell': column.key === 'remark' }"
                    >
                        <ProductImageCell v-if="column.key === 'image'" :items="order.items" />
                        <span v-else class="ellipsis-text">{{ getOutboundCellValue(order, column.key) }}</span>
                    </div>
                    <div class="action-row actions-cell erp-table-fixed-end">
                        <button
                            class="icon-button blue"
                            type="button"
                            @click="openViewDialog(order)"
                        >
                            <Icon name="lucide:list" />
                        </button>
                        <button
                            v-if="!isSellerReadonly"
                            class="icon-button blue"
                            type="button"
                            @click="openEditDialog(order)"
                        >
                            <Icon name="lucide:square-pen" />
                        </button>
                        <button
                            v-if="canDeleteOutbound"
                            class="icon-button delete"
                            type="button"
                            @click="deleteOutboundOrder(order)"
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
            :total="totalCount"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="goToPage"
            @jump="jumpToInputPage"
        />

        <!-- 新建/编辑出库单弹窗 -->
        <OutboundOrderDialog
            v-if="showFormDialog"
            :title="dialogTitle"
            :form="outboundForm"
            :details="outboundDetailItems"
            :outbound-type-options="isViewMode ? outboundTypeOptions : outboundTypeOptions.filter(type => type !== '生产领料')"
            :warehouse-options="warehouseOptions"
            :view-mode="isViewMode || isSellerReadonly"
            :remark-only="isRemarkOnlyEdit"
            :scan-loading="isOutboundScanAdding"
            :scan-clear-signal="outboundScanClearSignal"
            :scan-auto-focus="!showProductPicker && !showBomPreview"
            @close="closeFormDialog"
            @confirm="confirmSubmit"
            @select-bom="handleSelectBoms"
            @select-product="handleSelectProducts"
            @scan-product="handleOutboundScanAdd"
            @scan-location="handleOutboundLocationScan"
            @clear-details="clearOutboundDetails"
            @remove-detail="removeOutboundDetail"
            @type-change="handleOutboundTypeChange"
            @update-quantity="updateOutboundDetailQuantity"
            @update-warehouse="updateOutboundDetailWarehouse"
            @format-quantity="formatOutboundDetailQuantity"
        />

        <!-- 产品选择弹窗 -->
        <ProductPickerDialog
            v-if="showProductPicker"
            :title="productPickerTitle"
            :selection-mode="productPickerSelectionMode"
            :selected-product-ids="selectedPickerProductIds"
            :selected-products="selectedPickerProducts"
            :columns="productPickerColumns"
            :product-loader="outboundProductPickerLoader"
            :show-category-filter="activeProductPickerMode !== 'bom'"
            :search-placeholder="productPickerSearchPlaceholder"
            :empty-text="productPickerEmptyText"
            :confirm-loading="isBomDetailLoading"
            @close="closeProductPicker"
            @confirm="handleProductPickerSelection"
        />

        <BomDialog
            v-if="showBomPreview"
            class="outbound-bom-preview"
            title="查看BOM"
            :form="bomPreviewForm"
            :form-error="bomPreviewError"
            :selected-product-label="bomPreviewProductLabel"
            :structure-items="bomPreviewStructureItems"
            :visible-structure-columns="bomPreviewColumns"
            readonly
            show-readonly-actions
            cancel-text="返回选择"
            confirm-text="确认加入"
            :confirm-disabled="!bomPreviewMainProduct"
            :confirm-loading="isBomAdding"
            @close="returnToBomPicker"
            @confirm="confirmBomPreview"
        />

        <!-- 导入弹窗 -->
        <div v-if="showImportDialog" class="erp-dialog-mask" @click.self="closeImportDialog">
            <ErpDialogFrame
                class="import-dialog"
                title="批量导入出库单"
                width="600px"
                height="700px"
                :form="false"
                :close-disabled="isImporting"
                @close="closeImportDialog"
            >
                <div class="import-dialog-body">
                    <div class="import-section-title">上传 Excel</div>
                    <div v-if="importFileName" class="import-file-attachment">
                        <div class="import-file-info">
                            <Icon name="lucide:file-text" class="import-file-icon" />
                            <span>{{ importFileName }}</span>
                        </div>
                        <button
                            class="import-file-remove"
                            type="button"
                            :disabled="isImporting"
                            @click="removeImportFile"
                        >
                            删除
                        </button>
                    </div>
                    <label
                        v-else
                        class="import-upload-box"
                        :class="{ disabled: isImporting, 'is-dragover': isImportDragover }"
                        @dragover.prevent="handleImportDragover"
                        @dragleave.prevent="handleImportDragleave"
                        @drop.prevent="handleImportDrop"
                    >
                        <Icon name="lucide:upload" class="upload-icon" />
                        <span>选择或拖拽 Excel 文件到此处</span>
                        <input
                            type="file"
                            accept=".xlsx"
                            :disabled="isImporting"
                            @click="openDesktopFileInput($event, INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES, (files) => setImportFile(files[0]))"
                            @change="handleImportFileChange"
                        >
                    </label>
                    <p class="import-hint">支持 .xlsx，单个文件不超过 {{ INVENTORY_IMPORT_MAX_FILE_SIZE_MB }}MB。</p>
                    <button
                        class="import-template-button"
                        type="button"
                        :disabled="isImporting"
                        @click="downloadOutboundImportTemplate"
                    >
                        下载模板（Excel）
                    </button>

                    <div class="import-section-title">字段说明</div>
                    <div class="import-hint-list">
                        <p><strong>必填字段：</strong>出库类型、出库日期、产品编号（或型号）、数量</p>
                        <p><strong>出库类型：</strong>订单、借给客户、备货、维修、外包、其他</p>
                        <p><strong>关联单号：</strong>根据类型自动对应（订单→关联订单号，借给客户→借用人，其余类型默认回填出库单号）</p>
                    </div>
                    <div v-if="importResult" class="import-result">
                        <p>导入完成：成功 {{ importResult.successCount }} 条，失败 {{ importResult.failCount }} 条</p>
                        <div v-if="importResult.errors.length" class="import-errors">
                            <p v-for="err in importResult.errors" :key="err.row">
                                第 {{ err.row }} 行：{{ err.message }}
                            </p>
                        </div>
                    </div>
                </div>
                <template #footer>
                    <button class="dialog-button cancel" type="button" :disabled="isImporting" @click="closeImportDialog">取消</button>
                    <button class="dialog-button confirm" type="button" :disabled="!importFile || isImporting" @click="confirmImport">
                        {{ isImporting ? "导入中" : "开始导入" }}
                    </button>
                </template>
            </ErpDialogFrame>
        </div>
    </div>
</template>

<script setup lang="ts">
import { downloadBlob, downloadWorkbook, openDesktopFileInput } from "~/utils/fileActions";
import InventoryDatePicker from "~/components/configuration/inventory/InventoryDatePicker.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import { getPaginationPageNumbers } from "~/composables/inventory/useInventoryPagination";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import OutboundOrderDialog from "~/components/configuration/inventory/outbound/OutboundOrderDialog.vue";
import ProductImageCell from "~/components/configuration/inventory/ProductImageCell.vue";
import BomDialog from "~/components/configuration/inventory/basic-data/bom/BomDialog.vue";
import ProductPickerDialog, {
    type ProductPickerColumn,
    type ProductPickerLoadParams,
    type ProductPickerLoadResult,
} from "~/components/configuration/inventory/ProductPickerDialog.vue";
import type {
    InventoryBom,
    InventoryLocation,
    InventoryOutboundOrder,
    InventoryProduct,
    InventoryStockDetail,
    InventoryWarehouse,
    InventoryWaybillAttachment,
} from "~~/shared/types/inventory";
import {
    buildInboundLocationTree,
    formatInboundWarehouseDisplayName,
    getInboundWarehouseSelection,
    type InboundWarehouseOption,
} from "~/utils/inventory/inboundFrontendMapping";
import {
    lookupInventoryProductByScanCode,
    normalizeProductPickerItem,
    toInventoryEntityId,
    type ProductPickerItem,
} from "~/composables/inventory/useInventoryProductPickerData";
import {
    getInventoryItemLocationKey,
    loadInventoryLocationProducts,
    lookupInventoryLocationByScanCode,
    type ScannedInventoryLocation,
} from "~/composables/inventory/useInventoryLocationScan";
import {
    retrieveInventoryOutboundOrders,
    getInventoryOutboundDetail,
    addInventoryOutboundOrder,
    updateInventoryOutboundOrder,
    retrieveInventoryWarehouses,
    retrieveInventoryLocations,
    retrieveInventoryStocks,
    retrieveInventoryBoms,
    getInventoryBomDetail,
    getInventoryProductDetail,
    importInventoryOutboundOrders,
    exportInventoryOutboundOrders,
    deleteInventoryOutboundOrder,
} from "~/composables/api/useInventoryApi";
import { formatLocalDate, formatLocalDateTime } from "~/utils/time";
import { canEditInventoryOutboundRemark, canManageInventory, isSellerInventoryReadonly } from "~~/shared/utils/adminPermission";
import {
    INVENTORY_IMPORT_FILE_SIZE_MESSAGE,
    INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES,
    INVENTORY_IMPORT_MAX_FILE_SIZE_MB,
} from "~~/shared/utils/inventoryImport";
import { erpMessageBox } from "~/utils/erpMessageBox";
import { getErpTableGridColumn, getErpTableMinimumWidth } from "~/utils/inventory/erpTableColumns";

definePageMeta({
    layout: "inventory",
});

const outboundBreadcrumbItems = [
    { label: "仓储管理" },
    { label: "出库管理" },
];

type OutboundColumnKey =
    | "outboundNo"
    | "outboundType"
    | "relatedBusinessNo"
    | "image"
    | "totalQuantity"
    | "outboundDate"
    | "operator"
    | "remark"
    | "createdAt"
    | "updatedBy"
    | "updatedAt";

interface OutboundColumn {
    key: OutboundColumnKey;
    label: string;
    width: number;
    widthVar?: string;
    grow?: boolean;
}

interface OutboundOrderForm {
    outboundNo: string;
    outboundType: string;
    contractOrderNo: string;
    expressCompany: string;
    waybillNo: string;
    borrower: string;
    borrowingParty: string;
    deposit: string;
    returnDate: string;
    project: string;
    outboundDate: string;
    operator: string;
    remark: string;
    images: InventoryWaybillAttachment[];
}

interface OutboundDetailItem {
    rowId: string;
    productId: string;
    productNo: string;
    model: string;
    category: string;
    image: string;
    quantity: string;
    unit: string;
    unitId: string;
    warehouseId: string;
    locationId: string;
    targetWarehouse: string;
}

type OutboundWarehouseSelection = Pick<
    OutboundDetailItem,
    "warehouseId" | "locationId" | "targetWarehouse"
>;

type OutboundBomPickerItem = ProductPickerItem & {
    bomId: string;
};

interface BomPreviewStructureItem {
    rowId: string;
    product: ProductPickerItem;
    quantity: number;
}

interface BomPreviewForm {
    id: string;
    name: string;
    remark: string;
    product: ProductPickerItem | null;
}

interface BomPreviewColumn {
    key: "materialNo" | "materialName" | "material" | "image" | "category" | "quantity" | "unit" | "actions";
    label: string;
    width: number;
    visible: boolean;
    locked: boolean;
}

// 状态
const loading = ref(false);
const outboundOrders = ref<InventoryOutboundOrder[]>([]);
const totalCount = ref(0);
const warehouseOptions = ref<InboundWarehouseOption[]>([]);
const adminInfo = useState<{ nickname?: string; role?: number }>("admin_info", () => ({}));
const isSellerReadonly = computed(() => isSellerInventoryReadonly(Number(adminInfo.value?.role)));

// 弹窗状态
const showFormDialog = ref(false);
const showProductPicker = ref(false);
type ProductPickerMode = "bom" | "product" | "location";
const activeProductPickerMode = ref<ProductPickerMode>("bom");
const showBomPreview = ref(false);
const isBomDetailLoading = ref(false);
const isBomAdding = ref(false);
const pendingBomSelection = ref<OutboundBomPickerItem | null>(null);
const bomPreviewMainProduct = ref<ProductPickerItem | null>(null);
const bomPreviewError = ref("");
const isOutboundScanAdding = ref(false);
const outboundScanClearSignal = ref(0);
const outboundProductPickerLocation = ref<ScannedInventoryLocation | null>(null);
const editingOrder = ref<InventoryOutboundOrder | null>(null);
const isViewMode = ref(false);

const outboundTypeOptions = ["订单", "生产领料", "备货", "维修", "外包", "其他", "盘亏出库"];
const outboundFilterTypeOptions = computed(() => isSellerReadonly.value ? ["订单"] : outboundTypeOptions);
const outboundBomPickerColumns: ProductPickerColumn[] = [
    { key: "category", label: "BOM编码", width: 180 },
    { key: "name", label: "BOM名称", width: 220 },
    { key: "id", label: "产品编号", width: 180 },
    { key: "model", label: "主产品型号", width: 220 },
];
const bomPreviewColumns: BomPreviewColumn[] = [
    { key: "materialNo", label: "产品编号", width: 180, visible: true, locked: false },
    { key: "materialName", label: "产品型号", width: 220, visible: true, locked: false },
    { key: "material", label: "材质", width: 140, visible: true, locked: false },
    { key: "image", label: "产品图片", width: 170, visible: true, locked: false },
    { key: "category", label: "分类", width: 180, visible: true, locked: false },
    { key: "quantity", label: "数量", width: 130, visible: true, locked: false },
    { key: "unit", label: "单位", width: 120, visible: true, locked: false },
];

const outboundColumns: OutboundColumn[] = [
    { key: "outboundNo", label: "出库编号", width: 220 },
    { key: "outboundType", label: "出库类型", width: 150 },
    { key: "relatedBusinessNo", label: "关联业务号 / 凭证", width: 300, grow: true },
    { key: "image", label: "产品图片", width: 140 },
    { key: "totalQuantity", label: "出库总数量", width: 210 },
    { key: "outboundDate", label: "出库日期", width: 180, widthVar: "--erp-table-col-date" },
    { key: "operator", label: "经办人", width: 150, widthVar: "--erp-table-col-operator" },
    { key: "remark", label: "备注", width: 180, widthVar: "--erp-table-col-remark", grow: true },
    { key: "createdAt", label: "创建日期", width: 180, widthVar: "--erp-table-col-date" },
    { key: "updatedBy", label: "修改人", width: 150, widthVar: "--erp-table-col-operator" },
    { key: "updatedAt", label: "修改日期", width: 180, widthVar: "--erp-table-col-date" },
];

const outboundTableColumnTemplate = computed(() => [
    ...(isSellerReadonly.value ? [] : ["var(--outbound-selection-width)"]),
    ...outboundColumns.map(getErpTableGridColumn),
    "var(--outbound-action-width)",
].join(" "));
const outboundTableMinimumWidth = computed(() =>
    getErpTableMinimumWidth(
        outboundColumns,
        isSellerReadonly.value ? [] : ["var(--outbound-selection-width)"],
        ["var(--outbound-action-width)"],
    ),
);
const productPickerTitle = computed(() =>
    activeProductPickerMode.value === "bom"
        ? "搜索BOM"
        : activeProductPickerMode.value === "location"
            ? `选择仓位产品：${outboundProductPickerLocation.value?.code || ""}`
            : "选择产品",
);
const productPickerColumns = computed<ProductPickerColumn[] | undefined>(() =>
    activeProductPickerMode.value === "bom" ? outboundBomPickerColumns : undefined,
);
const productPickerSelectionMode = computed(() =>
    activeProductPickerMode.value === "bom" ? "single" : "multiple",
);
const selectedPickerProductIds = computed(() =>
    activeProductPickerMode.value === "bom" && pendingBomSelection.value
        ? [pendingBomSelection.value.selectionKey || pendingBomSelection.value.id]
        : [],
);
const selectedPickerProducts = computed(() =>
    activeProductPickerMode.value === "bom" && pendingBomSelection.value
        ? [pendingBomSelection.value]
        : [],
);
const productPickerSearchPlaceholder = computed(() =>
    activeProductPickerMode.value === "bom"
        ? "搜索BOM编码、名称、产品编号或型号"
        : "输入你想要寻找的内容",
);
const productPickerEmptyText = computed(() =>
    activeProductPickerMode.value === "bom"
        ? "暂无匹配BOM"
        : activeProductPickerMode.value === "location"
            ? "该仓位暂无可用库存产品"
            : "暂无匹配产品",
);
const outboundProductPickerLoader = computed(() => {
    if (activeProductPickerMode.value === "bom") {
        return loadOutboundBomProducts;
    }

    if (activeProductPickerMode.value === "location") {
        return loadOutboundLocationPickerProducts;
    }

    return undefined;
});

// 表单状态
const outboundForm = reactive<OutboundOrderForm>({
    outboundNo: "",
    outboundType: "订单",
    contractOrderNo: "",
    expressCompany: "",
    waybillNo: "",
    borrower: "",
    borrowingParty: "",
    deposit: "",
    returnDate: "",
    project: "",
    outboundDate: "",
    operator: "",
    remark: "",
    images: [],
});
const outboundDetailItems = ref<OutboundDetailItem[]>([]);
const bomPreviewForm = reactive<BomPreviewForm>({
    id: "",
    name: "",
    remark: "",
    product: null,
});
const bomPreviewStructureItems = ref<BomPreviewStructureItem[]>([]);
const bomPreviewProductLabel = computed(() =>
    bomPreviewForm.product
        ? `${bomPreviewForm.product.id} / ${bomPreviewForm.product.model}`
        : "",
);

// 搜索和筛选
const datePickerRef = ref<InstanceType<typeof InventoryDatePicker> | null>(null);
const searchText = ref("");
const appliedSearchText = ref("");
const draftOutboundDate = ref("");
const draftOutboundType = ref(isSellerReadonly.value ? "订单" : "");
const appliedOutboundDate = ref("");
const appliedOutboundType = ref(isSellerReadonly.value ? "订单" : "");
const selectedOrderIds = ref<string[]>([]);
const canDeleteOutbound = computed(() => canManageInventory(Number(adminInfo.value?.role)));
const isRemarkOnlyEdit = computed(() =>
    Boolean(editingOrder.value) && canEditInventoryOutboundRemark(Number(adminInfo.value?.role)),
);

// 导入相关状态
const showImportDialog = ref(false);
const importFile = ref<File | null>(null);
const isImporting = ref(false);
const isImportDragover = ref(false);
const importResult = ref<{ successCount: number; failCount: number; errors: Array<{ row: number; message: string }> } | null>(null);
const importFileName = computed(() => importFile.value?.name || "");

const pageSizeOptions = [10, 20, 50];
const pageSize = ref(10);
const currentPage = ref(1);
const jumpPageInput = ref("1");

const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)));
const pageNumbers = computed(() =>
    getPaginationPageNumbers(totalPages.value, currentPage.value),
);

const hasPendingFilters = computed(() =>
    draftOutboundDate.value !== appliedOutboundDate.value
    || draftOutboundType.value !== appliedOutboundType.value,
);

const dialogTitle = computed(() => {
    if (isViewMode.value) return "查看出库单";
    return editingOrder.value ? "编辑出库单" : "新建出库单";
});

// 导入相关函数
const openImportDialog = () => {
    importFile.value = null;
    importResult.value = null;
    showImportDialog.value = true;
};

const closeImportDialog = () => {
    if (isImporting.value) return;
    showImportDialog.value = false;
    importFile.value = null;
    importResult.value = null;
    isImportDragover.value = false;
};

const removeImportFile = () => {
    if (isImporting.value) return;
    importFile.value = null;
    importResult.value = null;
};

const setImportFile = (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
        ElMessage.warning("请上传 Excel 文件（.xlsx）");
        return;
    }
    if (file.size > INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES) {
        ElMessage.warning(INVENTORY_IMPORT_FILE_SIZE_MESSAGE);
        return;
    }

    importFile.value = file;
    importResult.value = null;
};

const handleImportFileChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setImportFile(file);
    input.value = "";
};

const handleImportDragover = () => {
    if (isImporting.value) return;
    isImportDragover.value = true;
};

const handleImportDragleave = () => {
    isImportDragover.value = false;
};

const handleImportDrop = (event: DragEvent) => {
    if (isImporting.value) return;
    isImportDragover.value = false;
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    droppedFiles.forEach(setImportFile);
};

const downloadOutboundImportTemplate = async () => {
    const XLSX = await import("xlsx");
    const headers = [
        "出库类型",
        "出库日期",
        "产品编号",
        "型号",
        "数量",
        "关联订单号",
        "合同订单号",
        "快递公司",
        "运单号",
        "借用人",
        "借用方",
        "押金",
        "预计归还日期",
        "项目",
        "备注",
    ];
    const example = [
        "外包",
        "2026-06-30",
        "PROD-DEMO-001",
        "M-100",
        "5",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "示例：外包出库",
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws["!cols"] = headers.map(() => ({ wch: 16 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "出库单导入模板");
    await downloadWorkbook(wb, "出库单导入模板.xlsx");
};

const exportOutboundOrders = async () => {
    try {
        const blob = await exportInventoryOutboundOrders({
            keyword: selectedOrderIds.value.length ? undefined : appliedSearchText.value || undefined,
            type: selectedOrderIds.value.length ? undefined : appliedOutboundType.value || undefined,
            outboundDate: selectedOrderIds.value.length ? undefined : appliedOutboundDate.value || undefined,
            ids: selectedOrderIds.value.length ? selectedOrderIds.value.join(",") : undefined,
        });
        await downloadBlob(blob, selectedOrderIds.value.length ? "选中出库单.xlsx" : "出库单.xlsx");
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "导出出库单失败");
    }
};

const batchDeleteOutboundOrders = async () => {
    const ids = selectedOrderIds.value.filter(Boolean);

    if (!ids.length) {
        ElMessage.warning("请先选择需要删除的出库单");
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除选中的 ${ids.length} 个出库单？`, "批量删除出库单", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    try {
        const res = await deleteInventoryOutboundOrder({ ids });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "批量删除出库单失败");
            return;
        }

        selectedOrderIds.value = selectedOrderIds.value.filter((id) => !ids.includes(id));
        ElMessage.success("批量删除出库单成功");
        await fetchOutboundOrders();
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "批量删除出库单失败");
    }
};

const deleteOutboundOrder = async (order: InventoryOutboundOrder) => {
    if (!order._id) return;

    try {
        await erpMessageBox.confirm(`是否确认删除出库单 ${order.outboundNo}`, "删除出库单", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    try {
        const res = await deleteInventoryOutboundOrder({ id: order._id });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "删除出库单失败");
            return;
        }

        selectedOrderIds.value = selectedOrderIds.value.filter((id) => id !== order._id);
        ElMessage.success("删除出库单成功");
        await fetchOutboundOrders();
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "删除出库单失败");
    }
};

const confirmImport = async () => {
    if (!importFile.value || isImporting.value) return;
    isImporting.value = true;
    try {
        const res = await importInventoryOutboundOrders(importFile.value);
        if (res.code !== 200) {
            ElMessage.error(res.msg || "导入失败");
            return;
        }
        importResult.value = res.data;
        if (res.data.failCount === 0) {
            ElMessage.success(`导入成功，共 ${res.data.successCount} 条`);
            await fetchOutboundOrders();
        } else {
            ElMessage.warning(`导入完成：成功 ${res.data.successCount} 条，失败 ${res.data.failCount} 条`);
        }
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "导入失败");
    } finally {
        isImporting.value = false;
    }
};

// 数据获取
const fetchOutboundOrders = async () => {
    loading.value = true;
    try {
        const res = await retrieveInventoryOutboundOrders({
            keyword: appliedSearchText.value || undefined,
            type: isSellerReadonly.value ? "订单" : appliedOutboundType.value || undefined,
            outboundDate: appliedOutboundDate.value || undefined,
            page: currentPage.value,
            limit: pageSize.value,
        });
        if (res.code === 200 && res.data) {
            outboundOrders.value = res.data.list || [];
            totalCount.value = res.data.pagination?.total || 0;
        }
    } catch (err) {
        console.error("获取出库单列表失败", err);
    } finally {
        loading.value = false;
    }
};

const normalizeWarehouseBaseOption = (item: InventoryWarehouse | InventoryLocation) => ({
    id: item._id || "",
    code: item.code || "",
    name: item.name || "",
});

const loadLocationsByWarehouse = async (warehouse: InventoryWarehouse) => {
    const warehouseId = warehouse._id || "";
    if (!warehouseId || warehouse.enableLocation !== true) {
        return [];
    }

    const res = await retrieveInventoryLocations({ warehouseId });
    if (res.code !== 200) {
        console.error("获取仓位列表失败", res.msg);
        return [];
    }

    return Array.isArray(res.data?.list)
        ? buildInboundLocationTree(res.data.list)
        : [];
};

const fetchWarehouses = async () => {
    try {
        const res = await retrieveInventoryWarehouses();
        if (res.code === 200) {
            const warehouses = Array.isArray(res.data?.list) ? res.data.list : [];
            const locationGroups = await Promise.all(
                warehouses.map((warehouse) => loadLocationsByWarehouse(warehouse)),
            );

            warehouseOptions.value = warehouses.map((warehouse, index) => ({
                ...normalizeWarehouseBaseOption(warehouse),
                enableLocation: warehouse.enableLocation === true,
                children: locationGroups[index],
            }));
        }
    } catch (err) {
        console.error("获取仓库列表失败", err);
    }
};

const toEntityId = (value: unknown) => {
    if (!value) {
        return "";
    }

    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "object" && value !== null && "toString" in value) {
        return String(value);
    }

    return "";
};

const createOutboundWarehouseSelection = (params: {
    warehouseId?: unknown;
    locationId?: unknown;
    warehouseName?: string;
    locationName?: string;
}): OutboundWarehouseSelection => {
    const warehouseId = toEntityId(params.warehouseId);
    const locationId = toEntityId(params.locationId);
    const fallbackLabel = formatInboundWarehouseDisplayName(
        params.warehouseName || "",
        params.locationName || "",
    );
    const optionSelection = warehouseId
        ? getInboundWarehouseSelection(warehouseOptions.value, warehouseId, locationId)
        : null;
    const optionLabel = optionSelection?.label && optionSelection.label !== "--"
        ? optionSelection.label
        : "";

    return {
        warehouseId,
        locationId,
        targetWarehouse: fallbackLabel !== "--" ? fallbackLabel : optionLabel || "--",
    };
};

const getStockDetailQuantity = (
    detail: InventoryStockDetail,
    key: "availableQuantity" | "totalQuantity",
) => {
    const quantity = Number(detail[key] ?? detail.quantity ?? 0);

    return Number.isFinite(quantity) ? quantity : 0;
};

const pickOutboundStockDetail = (
    details: InventoryStockDetail[],
    preferredWarehouseId = "",
) => {
    const pickFromDetails = (items: InventoryStockDetail[]) =>
        items.find((detail) =>
            toEntityId(detail.warehouseId)
            && toEntityId(detail.locationId)
            && getStockDetailQuantity(detail, "availableQuantity") > 0,
        )
        || items.find((detail) =>
            toEntityId(detail.warehouseId)
            && getStockDetailQuantity(detail, "availableQuantity") > 0,
        )
        || items.find((detail) =>
            toEntityId(detail.warehouseId)
            && toEntityId(detail.locationId)
            && getStockDetailQuantity(detail, "totalQuantity") > 0,
        )
        || items.find((detail) =>
            toEntityId(detail.warehouseId)
            && getStockDetailQuantity(detail, "totalQuantity") > 0,
        )
        || items.find((detail) => toEntityId(detail.warehouseId));

    const preferredDetails = preferredWarehouseId
        ? details.filter((detail) => toEntityId(detail.warehouseId) === preferredWarehouseId)
        : [];

    return pickFromDetails(preferredDetails) || pickFromDetails(details) || null;
};

const resolveOutboundProductWarehouse = async (
    product: ProductPickerItem,
): Promise<OutboundWarehouseSelection> => {
    const productSelection = createOutboundWarehouseSelection({
        warehouseId: product.warehouseId,
        locationId: product.locationId,
        warehouseName: product.warehouseName,
        locationName: product.locationName,
    });
    const productId = product.backendId || "";

    if (!productId || productSelection.locationId) {
        return productSelection;
    }

    try {
        const res = await retrieveInventoryStocks({
            productId,
            page: 1,
            limit: 1,
        });
        const stock = res.code === 200 && Array.isArray(res.data?.list)
            ? res.data.list[0]
            : null;
        const detail = stock?.details
            ? pickOutboundStockDetail(stock.details, productSelection.warehouseId)
            : null;

        if (!detail) {
            return productSelection;
        }

        return createOutboundWarehouseSelection({
            warehouseId: detail.warehouseId,
            locationId: detail.locationId,
            warehouseName: detail.warehouseName || "",
            locationName: detail.locationName || "",
        });
    } catch (err) {
        console.error("获取产品库存所在位失败", err);
        return productSelection;
    }
};

// 弹窗操作
const resetForm = () => {
    outboundForm.outboundNo = "";
    outboundForm.outboundType = "订单";
    outboundForm.contractOrderNo = "";
    outboundForm.expressCompany = "";
    outboundForm.waybillNo = "";
    outboundForm.borrower = "";
    outboundForm.borrowingParty = "";
    outboundForm.deposit = "";
    outboundForm.returnDate = "";
    outboundForm.project = "";
    outboundForm.outboundDate = formatLocalDate(new Date());
    outboundForm.operator = "";
    outboundForm.remark = "";
    outboundForm.images = [];
    outboundDetailItems.value = [];
};

const openCreateDialog = () => {
    if (isSellerReadonly.value) return;
    editingOrder.value = null;
    isViewMode.value = false;
    resetForm();
    showFormDialog.value = true;
};

const openEditDialog = async (order: InventoryOutboundOrder) => {
    if (isSellerReadonly.value) return;
    try {
        const res = await getInventoryOutboundDetail(order._id!);
        if (res.code === 200 && res.data?.detail) {
            const detail = res.data.detail;
            editingOrder.value = detail;
            isViewMode.value = false;
            outboundForm.outboundNo = detail.outboundNo || "";
            outboundForm.outboundType = detail.type || "订单";
            outboundForm.contractOrderNo = detail.contractOrderNo || "";
            outboundForm.expressCompany = detail.expressCompany || "";
            outboundForm.waybillNo = detail.waybillNo || "";
            outboundForm.borrower = detail.borrower || "";
            outboundForm.borrowingParty = detail.borrowingParty || "";
            outboundForm.deposit = detail.deposit || "";
            outboundForm.returnDate = formatLocalDate(detail.returnDate);
            outboundForm.project = detail.project || "";
            outboundForm.outboundDate = formatLocalDate(detail.outboundDate);
            outboundForm.operator = detail.handler || "";
            outboundForm.remark = detail.remark || "";
            outboundForm.images = Array.isArray(detail.images)
                ? detail.images.map((image) => ({ ...image }))
                : [];
            outboundDetailItems.value = (detail.items || []).map((item: any, index: number) => ({
                rowId: `${item.productId || "item"}-${index}`,
                productId: item.productId || "",
                productNo: item.productCode || "",
                model: item.model || "",
                category: item.categoryPath || item.categoryName || "",
                image: item.image || "",
                quantity: String(item.quantity || 0),
                unit: item.unitName || "",
                unitId: item.unitId || "",
                warehouseId: item.warehouseId || "",
                locationId: item.locationId || "",
                targetWarehouse: formatInboundWarehouseDisplayName(
                    item.warehouseName || "",
                    item.locationName || "",
                ),
            }));
            showFormDialog.value = true;
        }
    } catch (err) {
        console.error("获取出库单详情失败", err);
        ElMessage.error("获取出库单详情失败");
    }
};

const openViewDialog = async (order: InventoryOutboundOrder) => {
    try {
        const res = await getInventoryOutboundDetail(order._id!);
        if (res.code === 200 && res.data?.detail) {
            const detail = res.data.detail;
            editingOrder.value = detail;
            isViewMode.value = true;
            outboundForm.outboundNo = detail.outboundNo || "";
            outboundForm.outboundType = detail.type || "订单";
            outboundForm.contractOrderNo = detail.contractOrderNo || "";
            outboundForm.expressCompany = detail.expressCompany || "";
            outboundForm.waybillNo = detail.waybillNo || "";
            outboundForm.borrower = detail.borrower || "";
            outboundForm.borrowingParty = detail.borrowingParty || "";
            outboundForm.deposit = detail.deposit || "";
            outboundForm.returnDate = formatLocalDate(detail.returnDate);
            outboundForm.project = detail.project || "";
            outboundForm.outboundDate = formatLocalDate(detail.outboundDate);
            outboundForm.operator = detail.handler || "";
            outboundForm.remark = detail.remark || "";
            outboundForm.images = Array.isArray(detail.images)
                ? detail.images.map((image) => ({ ...image }))
                : [];
            outboundDetailItems.value = (detail.items || []).map((item: any, index: number) => ({
                rowId: `${item.productId || "item"}-${index}`,
                productId: item.productId || "",
                productNo: item.productCode || "",
                model: item.model || "",
                category: item.categoryPath || item.categoryName || "",
                image: item.image || "",
                quantity: String(item.quantity || 0),
                unit: item.unitName || "",
                unitId: item.unitId || "",
                warehouseId: item.warehouseId || "",
                locationId: item.locationId || "",
                targetWarehouse: formatInboundWarehouseDisplayName(
                    item.warehouseName || "",
                    item.locationName || "",
                ),
            }));
            showFormDialog.value = true;
        }
    } catch (err) {
        console.error("获取出库单详情失败", err);
        ElMessage.error("获取出库单详情失败");
    }
};

const closeFormDialog = () => {
    showFormDialog.value = false;
    showProductPicker.value = false;
    outboundProductPickerLocation.value = null;
    resetBomPreview();
    editingOrder.value = null;
    isViewMode.value = false;
};

// 提交表单
const confirmSubmit = async () => {
    if (isSellerReadonly.value) return;
    const form = outboundForm;
    if (isRemarkOnlyEdit.value && editingOrder.value) {
        try {
            await updateInventoryOutboundOrder({
                id: editingOrder.value._id!,
                remark: form.remark,
            });
            ElMessage.success("出库单备注更新成功");
            closeFormDialog();
            fetchOutboundOrders();
        } catch (err: any) {
            ElMessage.error(err?.data?.msg || err?.message || "备注更新失败");
        }
        return;
    }
    if (!form.outboundType) {
        ElMessage.warning("请选择出库类型");
        return;
    }
    if (!form.outboundDate) {
        ElMessage.warning("请选择出库日期");
        return;
    }
    if (!outboundDetailItems.value.length) {
        ElMessage.warning("请添加出库产品");
        return;
    }

    const payload = {
        type: form.outboundType,
        outboundDate: form.outboundDate,
        handler: form.operator,
        remark: form.remark,
        contractOrderNo: form.contractOrderNo,
        expressCompany: form.expressCompany,
        waybillNo: form.waybillNo,
        borrower: form.borrower,
        borrowingParty: form.borrowingParty,
        deposit: form.deposit,
        returnDate: form.returnDate || undefined,
        project: form.project,
        images: form.outboundType === "订单" ? form.images : [],
        items: outboundDetailItems.value.map((item) => ({
            productId: item.productId,
            quantity: Number(item.quantity) || 0,
            unitId: item.unitId || undefined,
            warehouseId: item.warehouseId || undefined,
            locationId: item.locationId || undefined,
        })),
    };

    try {
        if (editingOrder.value) {
            await updateInventoryOutboundOrder({ id: editingOrder.value._id!, ...payload });
            ElMessage.success("出库单更新成功");
        } else {
            await addInventoryOutboundOrder(payload);
            ElMessage.success("出库单创建成功");
        }
        closeFormDialog();
        fetchOutboundOrders();
    } catch (err: any) {
        const msg = err?.data?.msg || err?.message || "操作失败";
        ElMessage.error(msg);
    }
};

// 产品选择
const handleSelectBoms = () => {
    resetBomPreview();
    activeProductPickerMode.value = "bom";
    outboundProductPickerLocation.value = null;
    showProductPicker.value = true;
};

const handleSelectProducts = () => {
    resetBomPreview();
    activeProductPickerMode.value = "product";
    outboundProductPickerLocation.value = null;
    showProductPicker.value = true;
};

const createEmptyProductPickerLoadResult = (
    params: ProductPickerLoadParams,
): ProductPickerLoadResult => ({
    list: [],
    pagination: {
        page: params.page,
        limit: params.limit,
        total: 0,
        hasMore: false,
    },
});

const normalizeBomProductPickerItem = (bom: InventoryBom): OutboundBomPickerItem => ({
    bomId: bom._id || "",
    selectionKey: bom._id || bom.code,
    backendId: bom.productId ? String(bom.productId) : "",
    id: bom.productCode || bom._id || "",
    name: bom.name || "",
    model: bom.model || "",
    material: "",
    category: bom.code || "",
    categoryId: "",
    image: "",
    totalQuantity: "--",
    availableQuantity: "--",
    unit: "--",
    unitId: "",
    source: "--",
    kitQuantity: "--",
    standardPrice: 0,
    averagePrice: 0,
    machineNo: "",
    barcode: "",
    modelCode: "",
    snPrefixes: [],
    finishedCount: "--",
    warehouseId: "",
    warehouseName: "",
    locationId: "",
    locationName: "",
});

interface BomSnapshotProductInput {
    backendId?: unknown;
    id?: string;
    name?: string;
    model?: string;
    category?: string;
    unit?: string;
    unitId?: unknown;
}

const createBomSnapshotProduct = (
    input: BomSnapshotProductInput,
): ProductPickerItem => ({
    backendId: toInventoryEntityId(input.backendId),
    id: input.id || "",
    name: input.name || input.model || "",
    model: input.model || "",
    material: "",
    category: input.category || "未分类",
    categoryId: "",
    image: "",
    totalQuantity: "--",
    availableQuantity: "--",
    unit: input.unit || "--",
    unitId: toInventoryEntityId(input.unitId),
    source: "--",
    kitQuantity: "--",
    standardPrice: 0,
    averagePrice: 0,
    machineNo: "",
    barcode: "",
    modelCode: "",
    snPrefixes: [],
    finishedCount: "--",
    warehouseId: "",
    warehouseName: "",
    locationId: "",
    locationName: "",
});

const loadLiveBomProduct = async (
    fallback: ProductPickerItem,
): Promise<ProductPickerItem | null> => {
    if (!fallback.backendId) {
        return null;
    }

    try {
        const res = await getInventoryProductDetail({ id: fallback.backendId });
        return res.code === 200 && res.data?.detail
            ? normalizeProductPickerItem(res.data.detail as InventoryProduct)
            : null;
    } catch {
        return null;
    }
};

const loadBomPreview = async (selection: OutboundBomPickerItem) => {
    const res = await getInventoryBomDetail({ id: selection.bomId });
    if (res.code !== 200 || !res.data?.detail) {
        throw new Error(res.msg || "获取BOM详情失败");
    }

    const detail = res.data.detail;
    const mainSnapshot = createBomSnapshotProduct({
        backendId: detail.productId || selection.backendId,
        id: detail.productCode || selection.id,
        name: detail.productName || selection.name,
        model: detail.model || selection.model,
    });
    const [mainProduct, structureItems] = await Promise.all([
        loadLiveBomProduct(mainSnapshot),
        Promise.all((detail.items || []).map(async (item, index) => {
            const snapshot = createBomSnapshotProduct({
                backendId: item.productId,
                id: item.productCode,
                name: item.productName,
                model: item.model,
                category: item.categoryName,
                unit: item.unitName,
                unitId: item.unitId,
            });
            const product = await loadLiveBomProduct(snapshot);
            return {
                rowId: `${snapshot.backendId || snapshot.id || "bom-item"}-${index}`,
                product: product || snapshot,
                quantity: Number(item.quantity || 1),
            };
        })),
    ]);

    Object.assign(bomPreviewForm, {
        id: detail.code || "",
        name: detail.name || "",
        remark: detail.remark || "",
        product: mainProduct || mainSnapshot,
    });
    bomPreviewStructureItems.value = structureItems;
    bomPreviewMainProduct.value = mainProduct;
    bomPreviewError.value = mainProduct
        ? ""
        : "BOM主产品不存在或已删除，无法加入出库单。";
};

const loadOutboundBomProducts = async (
    params: ProductPickerLoadParams,
): Promise<ProductPickerLoadResult> => {
    try {
        const res = await retrieveInventoryBoms({
            keyword: params.keyword,
            isEnabled: true,
            page: params.page,
            limit: params.limit,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取BOM列表失败");
            return createEmptyProductPickerLoadResult(params);
        }

        return {
            list: Array.isArray(res.data?.list)
                ? res.data.list.map(normalizeBomProductPickerItem)
                : [],
            pagination: res.data?.pagination || createEmptyProductPickerLoadResult(params).pagination,
        };
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "获取BOM列表失败");
        return createEmptyProductPickerLoadResult(params);
    }
};

const loadOutboundLocationPickerProducts = async (
    params: ProductPickerLoadParams,
): Promise<ProductPickerLoadResult> => {
    const location = outboundProductPickerLocation.value;
    if (!location) {
        return createEmptyProductPickerLoadResult(params);
    }

    return await loadInventoryLocationProducts(location, params, {
        availableOnly: true,
    });
};

const handleProductsSelected = async (selectedProducts: ProductPickerItem[]) => {
    for (const product of selectedProducts) {
        await addOutboundProduct(product);
    }
    closeProductPicker();
};

const handleBomProductsSelected = async (selectedBomProducts: ProductPickerItem[]) => {
    const selection = selectedBomProducts[0] as OutboundBomPickerItem | undefined;
    if (!selection || isBomDetailLoading.value) {
        return;
    }

    if (!selection.bomId) {
        ElMessage.warning("当前BOM缺少有效ID，无法查看详情");
        return;
    }

    pendingBomSelection.value = selection;
    isBomDetailLoading.value = true;
    try {
        await loadBomPreview(selection);
        showProductPicker.value = false;
        showBomPreview.value = true;
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "获取BOM详情失败");
    } finally {
        isBomDetailLoading.value = false;
    }
};

const handleProductPickerSelection = async (selectedProducts: ProductPickerItem[]) => {
    if (activeProductPickerMode.value === "bom") {
        await handleBomProductsSelected(selectedProducts);
        return;
    }

    await handleProductsSelected(selectedProducts);
};

const closeProductPicker = () => {
    showProductPicker.value = false;
    activeProductPickerMode.value = "bom";
    outboundProductPickerLocation.value = null;
    resetBomPreview();
};

const resetBomPreview = () => {
    showBomPreview.value = false;
    pendingBomSelection.value = null;
    bomPreviewMainProduct.value = null;
    bomPreviewError.value = "";
    Object.assign(bomPreviewForm, {
        id: "",
        name: "",
        remark: "",
        product: null,
    });
    bomPreviewStructureItems.value = [];
};

const returnToBomPicker = () => {
    if (isBomAdding.value) {
        return;
    }

    showBomPreview.value = false;
    activeProductPickerMode.value = "bom";
    outboundProductPickerLocation.value = null;
    showProductPicker.value = true;
};

const confirmBomPreview = async () => {
    const product = bomPreviewMainProduct.value;
    if (!product || isBomAdding.value) {
        return;
    }

    isBomAdding.value = true;
    try {
        const added = await addOutboundProduct(product);
        if (added) {
            ElMessage.success(`已添加${product.id || product.model || "BOM主产品"}`);
        } else {
            ElMessage.warning("该产品在相同仓库和库位中已存在");
        }
        resetBomPreview();
        showProductPicker.value = false;
        activeProductPickerMode.value = "bom";
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "添加BOM主产品失败");
    } finally {
        isBomAdding.value = false;
    }
};

const appendOutboundProduct = (
    product: ProductPickerItem,
    warehouseSelection: OutboundWarehouseSelection,
) => {
    outboundDetailItems.value.push({
        rowId: `${product.backendId}-${Date.now()}`,
        productId: product.backendId || "",
        productNo: product.id || "",
        model: product.model || "",
        category: product.category || "",
        image: product.image || "",
        quantity: "1.0",
        unit: product.unit || "",
        unitId: product.unitId || "",
        ...warehouseSelection,
    });
};

const findOutboundProduct = (
    productId: string,
    warehouseSelection: OutboundWarehouseSelection,
) => {
    const productKey = getInventoryItemLocationKey(
        productId,
        warehouseSelection.warehouseId,
        warehouseSelection.locationId,
    );

    return outboundDetailItems.value.find((item) =>
        getInventoryItemLocationKey(item.productId, item.warehouseId, item.locationId) === productKey,
    );
};

const addOutboundProduct = async (product: ProductPickerItem) => {
    const productId = product.backendId || product.id;
    if (!productId) {
        return false;
    }

    const warehouseSelection = await resolveOutboundProductWarehouse(product);
    if (findOutboundProduct(productId, warehouseSelection)) {
        return false;
    }

    appendOutboundProduct(product, warehouseSelection);
    return true;
};

const handleOutboundLocationScan = async (scanCode: string) => {
    if (isViewMode.value || isOutboundScanAdding.value) {
        return;
    }

    isOutboundScanAdding.value = true;
    try {
        const location = await lookupInventoryLocationByScanCode(scanCode);
        resetBomPreview();
        outboundProductPickerLocation.value = location;
        activeProductPickerMode.value = "location";
        outboundScanClearSignal.value += 1;
        showProductPicker.value = true;
        ElMessage.success(`已识别仓位：${location.warehouseName || location.warehouseCode} / ${location.name}`);
    } catch (err: any) {
        ElMessage.warning(err?.message || "扫码查询仓位失败");
    } finally {
        isOutboundScanAdding.value = false;
    }
};

const handleOutboundScanAdd = async (scanCode: string) => {
    if (isViewMode.value || isOutboundScanAdding.value) {
        return;
    }

    isOutboundScanAdding.value = true;
    try {
        const product = await lookupInventoryProductByScanCode(scanCode);
        const productId = product.backendId || product.id;
        const warehouseSelection = await resolveOutboundProductWarehouse(product);
        const existingProduct = findOutboundProduct(productId, warehouseSelection);

        if (existingProduct) {
            const quantity = Number(existingProduct.quantity);
            existingProduct.quantity = (Number.isFinite(quantity) ? quantity + 1 : 1).toFixed(1);
        } else {
            appendOutboundProduct(product, warehouseSelection);
        }

        outboundScanClearSignal.value += 1;
        ElMessage.success(`已添加${product.id || product.model || "产品"}`);
    } catch (err: any) {
        ElMessage.warning(err?.message || "扫码查询产品失败");
    } finally {
        isOutboundScanAdding.value = false;
    }
};

const handleOutboundTypeChange = () => {
    outboundForm.contractOrderNo = "";
    outboundForm.expressCompany = "";
    outboundForm.waybillNo = "";
    outboundForm.borrower = "";
    outboundForm.borrowingParty = "";
    outboundForm.deposit = "";
    outboundForm.returnDate = "";
    outboundForm.project = "";
    outboundForm.images = [];
};

const clearOutboundDetails = () => {
    outboundDetailItems.value = [];
};

const removeOutboundDetail = (rowId: string) => {
    outboundDetailItems.value = outboundDetailItems.value.filter((item) => item.rowId !== rowId);
};

const updateOutboundDetailQuantity = (rowId: string, value: string) => {
    outboundDetailItems.value = outboundDetailItems.value.map((item) =>
        item.rowId === rowId
            ? { ...item, quantity: value }
            : item,
    );
};

const updateOutboundDetailWarehouse = (rowId: string, warehouseId: string, locationId: string, label: string) => {
    outboundDetailItems.value = outboundDetailItems.value.map((item) =>
        item.rowId === rowId
            ? {
                ...item,
                warehouseId,
                locationId,
                targetWarehouse: label,
            }
            : item,
    );
};

const formatOutboundDetailQuantity = (rowId: string) => {
    outboundDetailItems.value = outboundDetailItems.value.map((item) => {
        if (item.rowId !== rowId) return item;
        const quantity = Number(item.quantity);
        return {
            ...item,
            quantity: Number.isFinite(quantity) && quantity >= 0 ? quantity.toFixed(1) : "0.0",
        };
    });
};

// 搜索和筛选
const applySearch = () => {
    appliedSearchText.value = searchText.value;
    currentPage.value = 1;
    fetchOutboundOrders();
};

const applyFilters = () => {
    appliedOutboundDate.value = draftOutboundDate.value;
    appliedOutboundType.value = isSellerReadonly.value ? "订单" : draftOutboundType.value;
    currentPage.value = 1;
    fetchOutboundOrders();
};

const resetFilters = () => {
    searchText.value = "";
    appliedSearchText.value = "";
    draftOutboundDate.value = "";
    draftOutboundType.value = isSellerReadonly.value ? "订单" : "";
    appliedOutboundDate.value = "";
    appliedOutboundType.value = isSellerReadonly.value ? "订单" : "";
    selectedOrderIds.value = [];
    datePickerRef.value?.close();
    currentPage.value = 1;
    fetchOutboundOrders();
};

// 分页
const syncJumpInput = () => {
    jumpPageInput.value = String(currentPage.value);
};

const normalizePage = (page: number) => {
    if (!Number.isFinite(page)) return currentPage.value;
    return Math.min(Math.max(1, Math.trunc(page)), totalPages.value);
};

const goToPage = (page: number) => {
    currentPage.value = normalizePage(page);
    syncJumpInput();
    fetchOutboundOrders();
};

const jumpToInputPage = () => {
    goToPage(Number(jumpPageInput.value.trim()));
};

// 选择
const allRowsSelected = computed(() =>
    outboundOrders.value.length > 0
    && outboundOrders.value.every((order) => order._id && selectedOrderIds.value.includes(order._id)),
);

const toggleSelectAll = () => {
    const pageIds = outboundOrders.value.map((order) => order._id).filter(Boolean) as string[];
    if (allRowsSelected.value) {
        selectedOrderIds.value = selectedOrderIds.value.filter((id) => !pageIds.includes(id));
        return;
    }
    selectedOrderIds.value = [...new Set([...selectedOrderIds.value, ...pageIds])];
};

// 单元格显示
const getOutboundCellValue = (order: InventoryOutboundOrder, key: OutboundColumnKey) => {
    switch (key) {
        case "outboundNo":
            return order.outboundNo || "--";
        case "outboundType":
            return order.type || "--";
        case "relatedBusinessNo":
            return order.relatedNo || "--";
        case "totalQuantity":
            return String(order.totalQuantity ?? "--");
        case "outboundDate":
            return formatLocalDate(order.outboundDate) || "--";
        case "operator":
            return order.handler || "--";
        case "remark":
            return order.remark || "--";
        case "createdAt":
            return formatLocalDateTime(order.createTime) || "--";
        case "updatedBy":
            return order.updatedBy || "--";
        case "updatedAt":
            return formatLocalDateTime(order.updateTime) || "--";
        default:
            return "--";
    }
};

// 初始化
onMounted(() => {
    fetchOutboundOrders();
    if (!isSellerReadonly.value) {
        fetchWarehouses();
    }
});
</script>

<style scoped>
.outbound-page {
    --outbound-selection-width: 58px;
    --outbound-action-width: var(--erp-table-col-action);

    height: 100%;
    display: grid;
    grid-template-rows: 40px 56px 32px minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-container-gap);
    color: var(--erp-color-text-primary);
}

.outbound-page.seller-readonly {
    grid-template-rows: 40px 56px minmax(0, 1fr) 52px;
}

.outbound-bom-preview {
    z-index: 70;
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

.filter-field select {
    width: 200px;
    height: var(--erp-size-control-height-sm);
    padding: 0 32px 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font: inherit;
    appearance: none;
}

.filter-field :deep(.inventory-date-picker) {
    width: 200px;
    max-width: 200px;
    flex-basis: 200px;
}

.filter-field :deep(.date-trigger) {
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
    border-color: var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
}

.filter-actions {
    margin-left: auto;
    gap: var(--erp-spacing-12);
}

.toolbar-left {
    gap: var(--erp-spacing-8);
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

.primary-button:not(:disabled):active,
.muted-button.active:not(:disabled):active {
    background: var(--erp-color-action-primary-pressed);
}

.outline-button {
    border: 1px solid var(--erp-color-border-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
}

.outline-button:disabled {
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
    cursor: not-allowed;
}

.danger-button {
    border-color: var(--erp-color-border-error);
    color: var(--erp-color-text-status-error);
}

.danger-button:not(:disabled):hover {
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

.table-row,
.table-head,
.data-row {
    width: 100%;
    min-width: 0;
    display: grid;
    align-items: center;
}

.data-row {
    height: 80px;
}

.selection-head,
.selection-row {
    position: sticky;
    left: 0;
    z-index: 5;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: inherit;
}

.selection-head {
    background: var(--erp-color-fill-table-header);
}

.action-head,
.action-row {
    position: sticky;
    right: 0;
    z-index: 5;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.action-head {
    background: var(--erp-color-fill-table-header);
}

.action-row {
    background: var(--erp-color-fill-default);
}

.data-row:hover .action-row {
    background: var(--erp-color-fill-hover);
}

.table-cell {
    overflow: hidden;
    text-overflow: ellipsis;
}

.checkbox-cell {
    padding: 0;
}

.ellipsis-text {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.actions-cell {
    gap: var(--erp-spacing-12);
}

.icon-button.blue {
    color: var(--erp-color-icon-brand);
}

.import-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
}

.import-dialog-body {
    min-height: 0;
    overflow: auto;
}

.import-section-title {
    margin: var(--erp-spacing-8) 0 var(--erp-spacing-12);
    padding-bottom: var(--erp-spacing-8);
    border-bottom: 1px solid var(--erp-color-divider-subtle);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content1-font-size);
}

.import-upload-box {
    height: 118px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-10);
    border: 1px dashed var(--erp-color-border-default);
    border-radius: var(--erp-radius-surface-default);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content1-font-size);
    cursor: pointer;
}

.import-upload-box.disabled {
    cursor: not-allowed;
    opacity: 0.65;
}

.import-upload-box:hover,
.import-upload-box.is-dragover {
    border-color: var(--erp-color-border-brand);
    background: var(--erp-color-fill-hover);
}

.import-upload-box input {
    display: none;
}

.upload-icon {
    width: 28px;
    height: 28px;
    color: var(--erp-color-icon-brand);
}

.import-file-attachment {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--erp-spacing-12);
    padding: var(--erp-spacing-10) var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-hover);
}

.import-file-info {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--erp-spacing-8);
    color: var(--erp-color-text-secondary-strong);
    font-size: var(--erp-typography-content2-font-size);
}

.import-file-info span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.import-file-icon {
    flex: 0 0 auto;
    color: var(--erp-color-icon-brand);
}

.import-file-remove {
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    color: var(--erp-color-icon-error);
    background: transparent;
    cursor: pointer;
}

.import-hint {
    margin: var(--erp-spacing-8) 0 0;
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-note-font-size);
}

.import-template-button {
    margin-top: var(--erp-spacing-10);
    padding: 0;
    border: 0;
    color: var(--erp-color-text-brand);
    background: transparent;
    font-size: var(--erp-typography-content2-font-size);
    cursor: pointer;
}

.import-template-button:hover { text-decoration: underline; }

.import-hint-list {
    display: grid;
    gap: var(--erp-spacing-8);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content2-font-size);
}

.import-hint-list p,
.import-result p {
    margin: 0;
}

.import-hint-list strong { color: var(--erp-color-text-secondary-strong); }

.import-result {
    margin-top: var(--erp-spacing-12);
    padding: var(--erp-spacing-10);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-hover);
    font-size: var(--erp-typography-content2-font-size);
}

.import-errors {
    max-height: 120px;
    margin-top: var(--erp-spacing-8);
    overflow-y: auto;
    color: var(--erp-color-text-status-error);
}
</style>
