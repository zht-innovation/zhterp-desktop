<template>
    <div class="inbound-page">
        <header class="topbar">
            <ErpBreadcrumb icon="lucide:package-plus" :items="inboundBreadcrumbItems" />

            <ErpSearchBox
                v-model="searchText"
                :disabled="isLoadingInboundOrders"
                @search="applySearch"
            />
        </header>

        <div class="filter-row">
            <div class="filter-field date-field">
                <span>入库日期</span>
                <InventoryDatePicker
                    ref="datePickerRef"
                    v-model="draftInboundDate"
                    aria-label-text="选择入库日期"
                    initial-month="2026-05-01"
                />
            </div>

            <label class="filter-field">
                <span>入库类型</span>
                <select v-model="draftInboundType" aria-label="筛选入库类型">
                    <option value="">请选择</option>
                    <option
                        v-for="type in inboundTypeOptions"
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

        <div class="toolbar">
            <div class="toolbar-left">
                <button class="primary-button" type="button" @click="openInboundDialog">
                    <Icon name="lucide:circle-plus" class="button-icon" />
                    <span>新建</span>
                </button>
                <button class="outline-button" type="button" @click="openImportDialog">
                    <Icon name="lucide:download" class="button-icon" />
                    <span>导入</span>
                </button>
                <button class="outline-button" type="button" @click="exportInboundOrders">
                    <Icon name="lucide:upload" class="button-icon" />
                    <span>{{ selectedInboundOrderIds.length ? '导出选中' : '导出' }}</span>
                </button>
                <button
                    v-if="canDeleteInbound"
                    class="outline-button danger-button"
                    type="button"
                    :disabled="selectedInboundOrderIds.length === 0"
                    @click="batchDeleteInboundOrders"
                >
                    <Icon name="lucide:trash-2" class="button-icon" />
                    <span>批量删除</span>
                </button>
            </div>
        </div>

        <ErpTableFrame
            data-inventory-copy-table
            :columns="inboundTableColumnTemplate"
            :minimum-width="inboundTableMinimumWidth"
            :loading="isLoadingInboundOrders"
            :empty="!isLoadingInboundOrders && visibleInboundOrders.length === 0"
            loading-text="正在加载入库单..."
            empty-text="暂无匹配入库单"
            scroll-x
        >
            <template #header>
                <div class="table-row table-head">
                    <div class="selection-head checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                class="row-checkbox"
                                type="checkbox"
                                :checked="allRowsSelected"
                                :disabled="visibleInboundOrders.length === 0"
                                @change="toggleSelectAll"
                            >
                        </label>
                    </div>

                    <div
                        v-for="column in inboundColumns"
                        :key="column.key"
                        class="table-cell"
                    >
                        {{ column.label }}
                    </div>

                    <div class="action-head erp-table-fixed-end">操作</div>
                </div>
            </template>

            <template v-for="order in visibleInboundOrders" :key="order.id">
                <div class="table-row data-row">
                        <div class="selection-row checkbox-cell">
                            <label class="checkbox-control">
                                <input
                                    v-model="selectedInboundOrderIds"
                                    class="row-checkbox"
                                    type="checkbox"
                                    :value="order.id"
                                >
                            </label>
                        </div>

                        <div
                            v-for="column in inboundColumns"
                            :key="order.id + '-' + column.key"
                            class="table-cell"
                        >
                            <ProductImageCell v-if="column.key === 'image'" :items="order.items" />
                            <template v-else>{{ getInboundCellValue(order, column.key) }}</template>
                        </div>

                        <div class="action-row actions-cell erp-table-fixed-end">
                            <button
                                class="icon-button blue"
                                type="button"
                                @click="openViewInboundDialog(order)"
                            >
                                <Icon name="lucide:list" />
                            </button>
                            <button
                                v-if="canEditInbound"
                                class="icon-button blue"
                                type="button"
                                @click="openEditInboundDialog(order)"
                            >
                                <Icon name="lucide:square-pen" />
                            </button>
                            <button
                                v-if="canDeleteInbound"
                                class="icon-button delete"
                                type="button"
                                @click="deleteInboundOrder(order)"
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
            :total="totalInboundOrders"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="goToInboundPage"
            @jump="jumpToInboundInputPage"
        />

        <InboundDialog
            v-if="showInboundDialog"
            :title="inboundDialogTitle"
            :readonly="isInboundDialogReadonly"
            :form="inboundDialogForm"
            :type-options="inboundTypeOptions"
            :products="inboundDialogProducts"
            :warehouse-options="warehouseOptions"
            :scan-loading="isInboundScanAdding"
            :scan-clear-signal="inboundScanClearSignal"
            :scan-auto-focus="!showProductPickerDialog"
            @close="closeInboundDialog"
            @confirm="confirmInboundDialog"
            @update-field="updateInboundDialogField"
            @update-quantity="updateInboundProductQuantity"
            @update-warehouse="updateInboundProductWarehouse"
            @remove-product="removeInboundDialogProduct"
            @clear-products="clearInboundDialogProducts"
            @open-product-picker="openInboundProductPicker"
            @scan-product="handleInboundScanAdd"
            @scan-location="handleInboundLocationScan"
            @select-purchase-order="applyPurchaseOrderToInboundDialog"
        />

        <ProductPickerDialog
            v-if="showProductPickerDialog"
            :title="inboundProductPickerTitle"
            selection-mode="multiple"
            :product-loader="inboundProductPickerLocation ? loadInboundLocationPickerProducts : undefined"
            :empty-text="inboundProductPickerLocation ? '该仓位暂无匹配产品' : '暂无匹配产品'"
            @close="closeInboundProductPicker"
            @confirm="confirmInboundProductSelection"
        />

        <div v-if="showImportDialog" class="erp-dialog-mask" @click.self="closeImportDialog">
            <ErpDialogFrame
                class="import-dialog"
                title="批量导入入库单"
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
                            @change="handleImportFileChange"
                        >
                    </label>
                    <p class="import-hint">支持 .xlsx，单个文件不超过 {{ INVENTORY_IMPORT_MAX_FILE_SIZE_MB }}MB。</p>
                    <button
                        class="import-template-button"
                        type="button"
                        :disabled="isImporting"
                        @click="downloadInboundImportTemplate"
                    >
                        下载模板（Excel）
                    </button>

                    <div class="import-section-title">字段说明</div>
                    <div class="import-hint-list">
                        <p><strong>必填字段：</strong>入库类型、入库日期、产品编号（或型号）、数量</p>
                        <p><strong>入库类型：</strong>期初建账、采购、生产、售出退货、外包、退料</p>
                        <p><strong>关联单号：</strong>根据类型自动对应（采购→采购单号，生产→生产单号，售出退货→退货单号）</p>
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
import { canEditInventoryInbound, canManageInventory } from "~~/shared/utils/adminPermission";
import {
    INVENTORY_IMPORT_FILE_SIZE_MESSAGE,
    INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES,
    INVENTORY_IMPORT_MAX_FILE_SIZE_MB,
} from "~~/shared/utils/inventoryImport";
import type { PurchaseOrderInboundDetail, PurchaseOrderItem } from "~~/shared/types/purchase";
import type {
    InventoryInboundOrder,
    InventoryLocation,
    InventoryProduct,
    InventoryWarehouse,
} from "~~/shared/types/inventory";
import { getPurchaseOrderByTracking, getPurchaseOrderInboundDetail } from "~/composables/api/usePurchaseOrderApi";
import {
    addInventoryInboundOrder,
    deleteInventoryInboundOrder,
    getInventoryInboundDetail,
    getInventoryProductDetail,
    exportInventoryInboundOrders,
    importInventoryInboundOrders,
    retrieveInventoryInboundOrders,
    retrieveInventoryLocations,
    retrieveInventoryWarehouses,
    updateInventoryInboundOrder,
    type InventoryInboundMutationPayload,
} from "~/composables/api/useInventoryApi";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InboundDialog from "~/components/configuration/inventory/InboundDialog.vue";
import InventoryDatePicker from "~/components/configuration/inventory/InventoryDatePicker.vue";
import ProductImageCell from "~/components/configuration/inventory/ProductImageCell.vue";
import ProductPickerDialog, {
    type ProductPickerLoadParams,
    type ProductPickerLoadResult,
} from "~/components/configuration/inventory/ProductPickerDialog.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import { erpMessageBox } from "~/utils/erpMessageBox";
import { getErpTableGridColumn, getErpTableMinimumWidth } from "~/utils/inventory/erpTableColumns";
import {
    lookupInventoryProductByScanCode,
    type ProductPickerItem,
} from "~/composables/inventory/useInventoryProductPickerData";
import {
    getInventoryItemLocationKey,
    loadInventoryLocationProducts,
    lookupInventoryLocationByScanCode,
    type ScannedInventoryLocation,
} from "~/composables/inventory/useInventoryLocationScan";
import {
    buildInboundLocationTree,
    formatInboundWarehouseDisplayName,
    type InboundWarehouseOption,
    normalizeInboundOrderForPage,
} from "~/utils/inventory/inboundFrontendMapping";

definePageMeta({
    layout: "inventory",
});

const inboundBreadcrumbItems = [
    { label: "仓储管理" },
    { label: "入库管理" },
];

type InboundColumnKey =
    | "id"
    | "type"
    | "relatedNo"
    | "productModel"
    | "image"
    | "totalQuantity"
    | "inboundDate"
    | "handler"
    | "remark"
    | "updatedAt";

interface InboundColumn {
    key: InboundColumnKey;
    label: string;
    width: number;
    widthVar?: string;
    grow?: boolean;
}

interface InboundOrder {
    backendId: string;
    id: string;
    type: string;
    relatedNo: string;
    totalQuantity: number;
    inboundDate: string;
    handler: string;
    remark: string;
    updatedAt: string;
    courierCompany: string;
    trackingNo: string;
    purchaseOrderNo: string;
    processingOrderNo: string;
    productionOwner: string;
    salesOrderId: string;
    salesOrderNo: string;
    orderNo: string;
    returnReason: string;
    items: InboundDialogProduct[];
}

type InboundDialogMode = "create" | "edit" | "view";

type InboundDialogField =
    | "type"
    | "date"
    | "remark"
    | "courierCompany"
    | "trackingNo"
    | "purchaseOrderNo"
    | "processingOrderNo"
    | "productionOwner"
    | "salesOrderId"
    | "salesOrderNo"
    | "orderNo"
    | "returnReason";

interface InboundDialogForm {
    id: string;
    type: string;
    date: string;
    operator: string;
    remark: string;
    courierCompany: string;
    trackingNo: string;
    purchaseOrderNo: string;
    processingOrderNo: string;
    productionOwner: string;
    salesOrderId: string;
    salesOrderNo: string;
    orderNo: string;
    returnReason: string;
}

interface InboundDialogProduct {
    rowId: string;
    productId: string;
    productCode: string;
    productName: string;
    model: string;
    categoryId: string;
    categoryName: string;
    image: string;
    quantity: number;
    unitId: string;
    unitName: string;
    targetWarehouse: string;
    warehouseId: string;
    locationId: string;
}

type WarehouseOption = InboundWarehouseOption;

const inboundColumns: InboundColumn[] = [
    { key: "id", label: "入库编号", width: 180 },
    { key: "type", label: "入库类型", width: 150 },
    { key: "relatedNo", label: "关联业务号 / 凭证", width: 220, grow: true },
    { key: "productModel", label: "入库产品", width: 160, grow: true },
    { key: "image", label: "产品图片", width: 140 },
    { key: "totalQuantity", label: "入库总数量", width: 140 },
    { key: "inboundDate", label: "入库日期", width: 180, widthVar: "--erp-table-col-date" },
    { key: "handler", label: "经办人", width: 150, widthVar: "--erp-table-col-operator" },
    { key: "remark", label: "备注", width: 180, widthVar: "--erp-table-col-remark", grow: true },
    { key: "updatedAt", label: "修改时间", width: 180, widthVar: "--erp-table-col-date" },
];

const inboundTypeOptions = ["期初建账", "采购", "生产", "售出退货", "外包", "盘盈入库", "退料"];

const createMockInboundOrders = () => [
    {
        id: "RK-20260526-01",
        type: "期初建账",
        relatedNo: "QC-20260526-001",
        totalQuantity: 150,
        inboundDate: "2026-05-10",
        handler: "雪糕",
        remark: "期初库存录入",
        updatedAt: "2026-05-26 15:28",
        items: [],
    },
    {
        id: "RK-20260526-02",
        type: "采购",
        relatedNo: "CG-20260510-003",
        totalQuantity: 20,
        inboundDate: "2026-05-10",
        handler: "雪糕",
        remark: "备注",
        updatedAt: "2026-05-26 16:10",
        items: [],
    },
    {
        id: "RK-20260526-03",
        type: "生产",
        relatedNo: "SC-20260510-001",
        totalQuantity: 1,
        inboundDate: "2026-05-10",
        handler: "雪糕",
        remark: "生产完工入库",
        updatedAt: "2026-05-26 16:32",
        items: [],
    },
    {
        id: "RK-20260527-01",
        type: "售出退货",
        relatedNo: "TH-20260527-001",
        totalQuantity: 36,
        inboundDate: "2026-05-27",
        handler: "李想",
        remark: "客户退货入库",
        updatedAt: "2026-05-27 10:18",
        items: [],
    },
    {
        id: "RK-20260528-01",
        type: "生产",
        relatedNo: "SC-20260528-002",
        totalQuantity: 12,
        inboundDate: "2026-05-28",
        handler: "王宁",
        remark: "生产补录",
        updatedAt: "2026-05-28 14:05",
        items: [],
    },
    {
        id: "RK-20260529-01",
        type: "采购",
        relatedNo: "CG-20260529-006",
        totalQuantity: 88,
        inboundDate: "2026-05-29",
        handler: "赵晨",
        remark: "供应商到货",
        updatedAt: "2026-05-29 11:46",
        items: [],
    },
    {
        id: "RK-20260601-01",
        type: "期初建账",
        relatedNo: "QC-20260601-001",
        totalQuantity: 4,
        inboundDate: "2026-06-01",
        handler: "陈默",
        remark: "期初差异补录",
        updatedAt: "2026-06-01 17:20",
        items: [],
    },
    {
        id: "RK-20260602-01",
        type: "售出退货",
        relatedNo: "TH-20260602-001",
        totalQuantity: 9,
        inboundDate: "2026-06-02",
        handler: "周航",
        remark: "售出退货",
        updatedAt: "2026-06-02 09:15",
        items: [],
    },
    {
        id: "RK-20260603-01",
        type: "采购",
        relatedNo: "CG-20260603-004",
        totalQuantity: 64,
        inboundDate: "2026-06-03",
        handler: "刘佳",
        remark: "批量入库",
        updatedAt: "2026-06-03 13:38",
        items: [],
    },
    {
        id: "RK-20260604-01",
        type: "生产",
        relatedNo: "SC-20260604-001",
        totalQuantity: 18,
        inboundDate: "2026-06-04",
        handler: "高远",
        remark: "成品生产入库",
        updatedAt: "2026-06-04 15:52",
        items: [],
    },
];

const searchText = ref("");
const datePickerRef = ref<InstanceType<typeof InventoryDatePicker> | null>(null);
const draftInboundDate = ref("");
const draftInboundType = ref("");
const appliedSearchText = ref("");
const appliedInboundDate = ref("");
const appliedInboundType = ref("");
const selectedInboundOrderIds = ref<string[]>([]);
// Mock 数据保留用于对照：
// const inboundOrders = ref<InboundOrder[]>(createMockInboundOrders());
void createMockInboundOrders;
const inboundOrders = ref<InboundOrder[]>([]);
const adminInfo = useState<{ nickname?: string; role?: number }>("admin_info", () => ({}));
const canDeleteInbound = computed(() => canManageInventory(Number(adminInfo.value?.role)));
const canEditInbound = computed(() => canEditInventoryInbound(Number(adminInfo.value?.role)));
const showInboundDialog = ref(false);
const showProductPickerDialog = ref(false);
const isInboundScanAdding = ref(false);
const inboundScanClearSignal = ref(0);
const inboundProductPickerLocation = ref<ScannedInventoryLocation | null>(null);
const inboundDialogMode = ref<InboundDialogMode>("create");
const editingInboundOrderId = ref("");
const warehouseOptions = ref<WarehouseOption[]>([]);
const isLoadingInboundOrders = ref(false);
const isSubmittingInboundOrder = ref(false);
let purchaseOrderPrefillRequestSeq = 0;

const showImportDialog = ref(false);
const importFile = ref<File | null>(null);
const isImporting = ref(false);
const isImportDragover = ref(false);
const importResult = ref<{ successCount: number; failCount: number; errors: Array<{ row: number; message: string }> } | null>(null);
const importFileName = computed(() => importFile.value?.name || "");

const formatTodayDate = () => {
    const today = new Date();
    const pad = (part: number) => String(part).padStart(2, "0");

    return [
        today.getFullYear(),
        pad(today.getMonth() + 1),
        pad(today.getDate()),
    ].join("-");
};

const createInboundDialogForm = (): InboundDialogForm => ({
    id: "提交后自动生成",
    type: "",
    date: formatTodayDate(),
    operator: adminInfo.value.nickname ?? "",
    remark: "",
    courierCompany: "",
    trackingNo: "",
    purchaseOrderNo: "",
    processingOrderNo: "",
    productionOwner: "",
    salesOrderId: "",
    salesOrderNo: "",
    orderNo: "",
    returnReason: "",
});

const inboundDialogForm = reactive<InboundDialogForm>(createInboundDialogForm());
const inboundDialogProducts = ref<InboundDialogProduct[]>([]);
const inboundDialogTitle = computed(() =>
    inboundDialogMode.value === "view"
        ? "查看入库单"
        : inboundDialogMode.value === "edit"
            ? "编辑入库单"
            : "新建入库单",
);
const isInboundDialogReadonly = computed(() => inboundDialogMode.value === "view");

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
const totalInboundOrders = ref(0);

const handleApiError = (err: any, fallbackMessage: string) => {
    ElMessage.error(err?.data?.msg || err?.message || fallbackMessage);
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
        ElMessage.error(res.msg || "获取仓位选项失败");
        return [];
    }

    return Array.isArray(res.data?.list)
        ? buildInboundLocationTree(res.data.list)
        : [];
};

const loadWarehouseOptions = async () => {
    try {
        const res = await retrieveInventoryWarehouses();
        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取仓库选项失败");
            warehouseOptions.value = [];
            return;
        }

        const warehouses = Array.isArray(res.data?.list) ? res.data.list : [];
        const locationGroups = await Promise.all(
            warehouses.map((warehouse) => loadLocationsByWarehouse(warehouse)),
        );

        warehouseOptions.value = warehouses.map((warehouse, index) => ({
            ...normalizeWarehouseBaseOption(warehouse),
            enableLocation: warehouse.enableLocation === true,
            children: locationGroups[index],
        }));
    } catch (err: any) {
        warehouseOptions.value = [];
        handleApiError(err, "获取仓库选项失败");
    }
};

const normalizeInboundOrder = (order: InventoryInboundOrder): InboundOrder =>
    normalizeInboundOrderForPage(order as Record<string, any>);

const loadInboundOrders = async () => {
    if (isLoadingInboundOrders.value) {
        return;
    }

    isLoadingInboundOrders.value = true;
    try {
        const res = await retrieveInventoryInboundOrders({
            keyword: appliedSearchText.value || undefined,
            type: appliedInboundType.value || undefined,
            inboundDate: appliedInboundDate.value || undefined,
            page: currentPage.value,
            limit: pageSize.value,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取入库单列表失败");
            inboundOrders.value = [];
            totalInboundOrders.value = 0;
            setTotalItems(0);
            return;
        }

        inboundOrders.value = Array.isArray(res.data?.list)
            ? res.data.list.map(normalizeInboundOrder)
            : [];
        totalInboundOrders.value = Number(res.data?.pagination?.total || 0);
        setTotalItems(totalInboundOrders.value);
        goToPage(Number(res.data?.pagination?.page || currentPage.value));
    } catch (err: any) {
        inboundOrders.value = [];
        totalInboundOrders.value = 0;
        setTotalItems(0);
        handleApiError(err, "获取入库单列表失败");
    } finally {
        isLoadingInboundOrders.value = false;
    }
};

const hasPendingFilters = computed(() =>
    searchText.value.trim() !== appliedSearchText.value ||
    draftInboundDate.value !== appliedInboundDate.value ||
    draftInboundType.value !== appliedInboundType.value,
);

const inboundTableColumnTemplate = computed(() => [
    "var(--inbound-selection-width)",
    ...inboundColumns.map(getErpTableGridColumn),
    "var(--inbound-action-width)",
].join(" "));
const inboundTableMinimumWidth = computed(() =>
    getErpTableMinimumWidth(
        inboundColumns,
        ["var(--inbound-selection-width)"],
        ["var(--inbound-action-width)"],
    ),
);

const getInboundCellValue = (order: InboundOrder, columnKey: InboundColumnKey) => {
    if (columnKey === "image") {
        return "--";
    }

    if (columnKey === "productModel") {
        const firstProductModel = order.items[0]?.model;

        if (!firstProductModel) {
            return "--";
        }

        return order.items.length > 1 ? `${firstProductModel}+...` : firstProductModel;
    }

    if (columnKey === "totalQuantity") {
        return order.totalQuantity.toFixed(1);
    }

    return order[columnKey] || "--";
};

const inboundMatchesSearch = (order: InboundOrder, keyword: string) => {
    const values = inboundColumns.map((column) => String(getInboundCellValue(order, column.key)));

    return values.some((value) => value.toLocaleLowerCase().includes(keyword));
};

const filteredInboundOrders = computed(() => {
    const keyword = appliedSearchText.value.trim().toLocaleLowerCase();

    return inboundOrders.value.filter((order) => {
        if (keyword && !inboundMatchesSearch(order, keyword)) {
            return false;
        }

        if (appliedInboundDate.value && order.inboundDate !== appliedInboundDate.value) {
            return false;
        }

        if (appliedInboundType.value && order.type !== appliedInboundType.value) {
            return false;
        }

        return true;
    });
});

// Mock 过滤逻辑保留用于对照，接口接入后列表直接使用后端分页结果。
void filteredInboundOrders;
const visibleInboundOrders = computed(() => inboundOrders.value);
const allRowsSelected = computed(() =>
    visibleInboundOrders.value.length > 0 &&
    visibleInboundOrders.value.every((order) => selectedInboundOrderIds.value.includes(order.id)),
);

const toggleSelectAll = () => {
    if (allRowsSelected.value) {
        selectedInboundOrderIds.value = selectedInboundOrderIds.value.filter(
            (id) => !visibleInboundOrders.value.some((order) => order.id === id),
        );
        return;
    }

    selectedInboundOrderIds.value = [
        ...new Set([
            ...selectedInboundOrderIds.value,
            ...visibleInboundOrders.value.map((order) => order.id),
        ]),
    ];
};

const applySearch = () => {
    appliedSearchText.value = searchText.value.trim();
    goToPage(1);
    void loadInboundOrders();
};

const applyFilters = () => {
    appliedSearchText.value = searchText.value.trim();
    appliedInboundDate.value = draftInboundDate.value;
    appliedInboundType.value = draftInboundType.value;
    goToPage(1);
    void loadInboundOrders();
};

const resetFilters = () => {
    searchText.value = "";
    draftInboundDate.value = "";
    draftInboundType.value = "";
    appliedSearchText.value = "";
    appliedInboundDate.value = "";
    appliedInboundType.value = "";
    selectedInboundOrderIds.value = [];
    datePickerRef.value?.close();
    goToPage(1);
    void loadInboundOrders();
};

const goToInboundPage = (page: number) => {
    goToPage(page);
    void loadInboundOrders();
};

const jumpToInboundInputPage = () => {
    goToPage(Number(jumpPageInput.value.trim()));
    void loadInboundOrders();
};

const resetInboundDialog = () => {
    purchaseOrderPrefillRequestSeq += 1;
    Object.assign(inboundDialogForm, createInboundDialogForm());
    inboundDialogProducts.value = [];
};

const copyInboundDialogProducts = (items: InboundDialogProduct[]) =>
    items.map((item) => ({ ...item }));

const applyInboundOrderToDialog = (order: InboundOrder) => {
    resetInboundDialog();
    editingInboundOrderId.value = order.backendId;
    inboundDialogForm.id = order.id;
    inboundDialogForm.type = order.type;
    inboundDialogForm.date = order.inboundDate;
    inboundDialogForm.operator = order.handler;
    inboundDialogForm.remark = order.remark === "--" ? "" : order.remark;
    inboundDialogForm.courierCompany = order.courierCompany;
    inboundDialogForm.trackingNo = order.trackingNo;
    inboundDialogForm.purchaseOrderNo = order.purchaseOrderNo;
    inboundDialogForm.processingOrderNo = order.processingOrderNo;
    inboundDialogForm.productionOwner = order.productionOwner;
    inboundDialogForm.salesOrderId = order.salesOrderId;
    inboundDialogForm.salesOrderNo = order.salesOrderNo;
    inboundDialogForm.orderNo = order.orderNo;
    inboundDialogForm.returnReason = order.returnReason;
    inboundDialogProducts.value = copyInboundDialogProducts(order.items);
};

const openInboundDialog = () => {
    inboundDialogMode.value = "create";
    editingInboundOrderId.value = "";
    resetInboundDialog();
    showInboundDialog.value = true;
};

const loadInboundOrderDetail = async (order: InboundOrder) => {
    if (!order.backendId) {
        return order;
    }

    try {
        const res = await getInventoryInboundDetail(order.backendId);
        if (res.code !== 200 || !res.data?.detail) {
            ElMessage.error(res.msg || "获取入库单详情失败");
            return order;
        }

        return normalizeInboundOrder(res.data.detail);
    } catch (err: any) {
        handleApiError(err, "获取入库单详情失败");
        return order;
    }
};

const openViewInboundDialog = async (order: InboundOrder) => {
    inboundDialogMode.value = "view";
    applyInboundOrderToDialog(await loadInboundOrderDetail(order));
    showInboundDialog.value = true;
};

const openEditInboundDialog = async (order: InboundOrder) => {
    inboundDialogMode.value = "edit";
    applyInboundOrderToDialog(await loadInboundOrderDetail(order));
    showInboundDialog.value = true;
};

const deleteInboundOrder = async (order: InboundOrder) => {
    if (!order.backendId) return;
    try {
        await erpMessageBox.confirm(`是否确认删除入库单 ${order.id}`, "删除入库单", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }
    try {
        const res = await deleteInventoryInboundOrder({ id: order.backendId });
        if (res.code !== 200) {
            ElMessage.error(res.msg || "删除入库单失败");
            return;
        }
        ElMessage.success("删除入库单成功");
        await loadInboundOrders();
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "删除入库单失败");
    }
};

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

const downloadInboundImportTemplate = async () => {
    const XLSX = await import("xlsx");
    const headers = [
        "入库类型",
        "入库日期",
        "产品编号",
        "型号",
        "数量",
        "关联单号",
        "采购单号",
        "生产单号",
        "生产负责人",
        "退货单号",
        "退货原因",
        "快递公司",
        "快递单号",
        "备注",
    ];
    const example = [
        "采购",
        "2026-06-30",
        "PROD-DEMO-001",
        "M-100",
        "10",
        "CG-20260630-001",
        "CG-20260630-001",
        "",
        "",
        "",
        "",
        "顺丰",
        "SF1234567890",
        "示例：采购入库",
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws["!cols"] = headers.map(() => ({ wch: 16 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "入库单导入模板");
    XLSX.writeFile(wb, "入库单导入模板.xlsx");
};

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url));
};

const exportInboundOrders = async () => {
    const selectedBackendIds = selectedInboundOrderIds.value
        .map((id) => visibleInboundOrders.value.find((order) => order.id === id)?.backendId)
        .filter(Boolean) as string[];

    try {
        const blob = await exportInventoryInboundOrders({
            keyword: selectedBackendIds.length ? undefined : appliedSearchText.value || undefined,
            type: selectedBackendIds.length ? undefined : appliedInboundType.value || undefined,
            inboundDate: selectedBackendIds.length ? undefined : appliedInboundDate.value || undefined,
            ids: selectedBackendIds.length ? selectedBackendIds.join(",") : undefined,
        });
        downloadBlob(blob, selectedInboundOrderIds.value.length ? "选中入库单.xlsx" : "入库单.xlsx");
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "导出入库单失败");
    }
};

const batchDeleteInboundOrders = async () => {
    const selectedBackendIds = selectedInboundOrderIds.value
        .map((id) => inboundOrders.value.find((order) => order.id === id)?.backendId)
        .filter(Boolean) as string[];

    if (!selectedBackendIds.length) {
        ElMessage.warning("请先选择需要删除的入库单");
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除选中的 ${selectedBackendIds.length} 个入库单？`, "批量删除入库单", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    try {
        const res = await deleteInventoryInboundOrder({ ids: selectedBackendIds });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "批量删除入库单失败");
            return;
        }

        selectedInboundOrderIds.value = [];
        ElMessage.success("批量删除入库单成功");
        await loadInboundOrders();
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "批量删除入库单失败");
    }
};

const confirmImport = async () => {
    if (!importFile.value || isImporting.value) return;
    isImporting.value = true;
    try {
        const res = await importInventoryInboundOrders(importFile.value);
        if (res.code !== 200) {
            ElMessage.error(res.msg || "导入失败");
            return;
        }
        importResult.value = res.data;
        if (res.data.failCount === 0) {
            ElMessage.success(`导入成功，共 ${res.data.successCount} 条`);
            await loadInboundOrders();
        } else {
            ElMessage.warning(`导入完成：成功 ${res.data.successCount} 条，失败 ${res.data.failCount} 条`);
        }
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "导入失败");
    } finally {
        isImporting.value = false;
    }
};

const closeInboundDialog = () => {
    purchaseOrderPrefillRequestSeq += 1;
    showInboundDialog.value = false;
    showProductPickerDialog.value = false;
    inboundProductPickerLocation.value = null;
};

const validateInboundDialog = () => {
    if (!inboundDialogForm.type) {
        ElMessage.warning("请选择入库类型");
        return false;
    }

    if (!inboundDialogForm.date) {
        ElMessage.warning("请选择入库日期");
        return false;
    }

    if (!inboundDialogProducts.value.length) {
        ElMessage.warning("请选择入库产品");
        return false;
    }

    const invalidQuantity = inboundDialogProducts.value.some((product) => product.quantity <= 0);
    if (invalidQuantity) {
        ElMessage.warning("入库数量必须大于0");
        return false;
    }

    const missingWarehouse = inboundDialogProducts.value.some((product) => !product.warehouseId);
    if (missingWarehouse) {
        ElMessage.warning("请选择目标仓库");
        return false;
    }

    return true;
};

const buildInboundPayload = (): InventoryInboundMutationPayload => ({
    type: inboundDialogForm.type,
    inboundDate: inboundDialogForm.date,
    handler: inboundDialogForm.operator,
    remark: inboundDialogForm.remark.trim(),
    courierCompany: inboundDialogForm.courierCompany.trim(),
    trackingNo: inboundDialogForm.trackingNo.trim(),
    purchaseOrderNo: inboundDialogForm.purchaseOrderNo.trim(),
    processingOrderNo: inboundDialogForm.processingOrderNo.trim(),
    productionOwner: inboundDialogForm.productionOwner.trim(),
    salesOrderId: inboundDialogForm.type === "生产"
        ? inboundDialogForm.salesOrderId
        : undefined,
    orderNo: inboundDialogForm.orderNo.trim(),
    returnReason: inboundDialogForm.returnReason.trim(),
    items: inboundDialogProducts.value.map((product) => ({
        productId: product.productId,
        quantity: product.quantity,
        unitId: product.unitId || null,
        warehouseId: product.warehouseId || null,
        locationId: product.locationId || null,
    })),
});

const confirmInboundDialog = async () => {
    if (isInboundDialogReadonly.value) {
        closeInboundDialog();
        return;
    }

    if (isSubmittingInboundOrder.value || !validateInboundDialog()) {
        return;
    }

    isSubmittingInboundOrder.value = true;
    try {
        const payload = buildInboundPayload();
        const res = inboundDialogMode.value === "edit" && editingInboundOrderId.value
            ? await updateInventoryInboundOrder({
                ...payload,
                id: editingInboundOrderId.value,
                inboundNo: inboundDialogForm.id,
            })
            : await addInventoryInboundOrder(payload);

        if (res.code !== 200) {
            ElMessage.error(res.msg || "保存入库单失败");
            return;
        }

        const available = Array.isArray(res.data?.availableQuantities)
            ? res.data.availableQuantities
            : [];
        const availableText = available.length
            ? `，当前可用数量：${available.map((item: any) => Number(item.quantity || 0)).join("、")}`
            : "";
        ElMessage.success(
            `${inboundDialogMode.value === "edit" ? "编辑入库单成功" : "新建入库单成功"}${availableText}`,
        );
        closeInboundDialog();
        if (inboundDialogMode.value !== "edit") {
            goToPage(1);
        }
        await loadInboundOrders();
    } catch (err: any) {
        handleApiError(err, "保存入库单失败");
    } finally {
        isSubmittingInboundOrder.value = false;
    }
};

const updateInboundDialogField = (field: InboundDialogField, value: string) => {
    if (isInboundDialogReadonly.value) {
        return;
    }

    inboundDialogForm[field] = value;
    if (field === "type" && value !== "生产") {
        inboundDialogForm.salesOrderId = "";
        inboundDialogForm.salesOrderNo = "";
    }
};

const updateInboundProductQuantity = (rowId: string, quantity: number) => {
    if (isInboundDialogReadonly.value) {
        return;
    }

    const product = inboundDialogProducts.value.find((item) => item.rowId === rowId);

    if (product) {
        product.quantity = quantity;
    }
};

const updateInboundProductWarehouse = (
    rowId: string,
    warehouseId: string,
    locationId: string,
    label: string,
) => {
    if (isInboundDialogReadonly.value) {
        return;
    }

    const product = inboundDialogProducts.value.find((item) => item.rowId === rowId);
    if (!product) {
        return;
    }

    product.warehouseId = warehouseId;
    product.locationId = locationId;
    product.targetWarehouse = label || "--";
};

const removeInboundDialogProduct = (rowId: string) => {
    if (isInboundDialogReadonly.value) {
        return;
    }

    inboundDialogProducts.value = inboundDialogProducts.value.filter((item) => item.rowId !== rowId);
};

const clearInboundDialogProducts = () => {
    if (isInboundDialogReadonly.value) {
        return;
    }

    inboundDialogProducts.value = [];
};

const createInboundDialogProductFromPurchaseItem = (
    item: PurchaseOrderItem,
    index: number,
    quantity: number,
    product?: InventoryProduct | null,
): InboundDialogProduct => {
    const productId = String(item.productId || "");
    const warehouseId = product?.warehouseId ? String(product.warehouseId) : "";
    const locationId = product?.locationId ? String(product.locationId) : "";

    return {
        rowId: `${productId || "purchase-product"}-${Date.now()}-${index}`,
        productId,
        productCode: product?.code || item.productCode || "",
        productName: product?.name || item.productModel || "",
        model: product?.model || product?.modelCode || item.productModel || "",
        categoryId: product?.categoryId ? String(product.categoryId) : "",
        categoryName: product?.categoryPath || product?.categoryName || "",
        image: product?.image || "",
        quantity,
        unitId: product?.unitId ? String(product.unitId) : item.unitId ? String(item.unitId) : "",
        unitName: product?.unitName || item.unitName || "",
        targetWarehouse: formatInboundWarehouseDisplayName(product?.warehouseName || "", product?.locationName || ""),
        warehouseId,
        locationId,
    };
};

const resolvePurchaseOrderProduct = async (item: PurchaseOrderItem) => {
    const productId = String(item.productId || "");
    if (!productId) {
        return null;
    }

    try {
        const res = await getInventoryProductDetail({ id: productId });

        return res.code === 200 ? res.data?.detail || null : null;
    } catch {
        return null;
    }
};

const buildInboundDialogPrefillFromPurchaseOrder = async (order: PurchaseOrderInboundDetail) => {
    const firstWaybill = Array.isArray(order.waybills) ? order.waybills[0] : null;
    const items = Array.isArray(order.items) ? order.items : [];
    const products = await Promise.all(items.map(resolvePurchaseOrderProduct));
    const receivedQuantityMap = new Map(
        (order.inboundProgress?.items || []).map((item) => [
            String(item.productId || ""),
            Number(item.receivedQuantity || 0),
        ]),
    );
    const prefillProducts = items
        .map((item, index) => {
            const productId = String(item.productId || "");
            const remainingQuantity = Math.max(
                Number(item.quantity || 0) - (receivedQuantityMap.get(productId) || 0),
                0,
            );

            return remainingQuantity > 0
                ? createInboundDialogProductFromPurchaseItem(item, index, remainingQuantity, products[index])
                : null;
        })
        .filter((product): product is InboundDialogProduct => Boolean(product));

    return {
        courierCompany: firstWaybill?.courierCompany || "",
        trackingNo: firstWaybill?.trackingNo || "",
        products: prefillProducts,
    };
};

const applyPurchaseOrderToInboundDialog = async (orderNo: string) => {
    if (isInboundDialogReadonly.value || inboundDialogForm.type !== "采购" || !orderNo) {
        return;
    }

    const currentRequestSeq = ++purchaseOrderPrefillRequestSeq;

    try {
        const res = await getPurchaseOrderInboundDetail({ orderNo });

        if (currentRequestSeq !== purchaseOrderPrefillRequestSeq) {
            return;
        }

        if (res.code !== 200 || !res.data) {
            ElMessage.error(res.msg || "获取采购单详情失败");
            return;
        }

        const prefill = await buildInboundDialogPrefillFromPurchaseOrder(res.data);

        if (currentRequestSeq !== purchaseOrderPrefillRequestSeq) {
            return;
        }

        inboundDialogForm.courierCompany = prefill.courierCompany;
        inboundDialogForm.trackingNo = prefill.trackingNo;
        inboundDialogProducts.value = prefill.products;
    } catch (err: any) {
        if (currentRequestSeq !== purchaseOrderPrefillRequestSeq) {
            return;
        }

        handleApiError(err, "获取采购单详情失败");
    }
};

const getInboundProductTargetWarehouse = (product: ProductPickerItem) => {
    return formatInboundWarehouseDisplayName(product.warehouseName, product.locationName);
};

const createInboundDialogProduct = (
    product: ProductPickerItem,
    index = Date.now(),
): InboundDialogProduct => ({
    rowId: `${product.backendId || product.id || "inbound-product"}-${index}`,
    productId: product.backendId || product.id,
    productCode: product.id,
    productName: product.model,
    model: product.model,
    categoryId: product.categoryId,
    categoryName: product.category,
    image: product.image,
    quantity: 1,
    unitId: product.unitId,
    unitName: product.unit,
    targetWarehouse: getInboundProductTargetWarehouse(product),
    warehouseId: product.warehouseId,
    locationId: product.locationId,
});

const openInboundProductPicker = async () => {
    if (isInboundDialogReadonly.value) {
        return;
    }

    inboundProductPickerLocation.value = null;
    showProductPickerDialog.value = true;
};

const closeInboundProductPicker = () => {
    showProductPickerDialog.value = false;
    inboundProductPickerLocation.value = null;
};

const inboundProductPickerTitle = computed(() => {
    const location = inboundProductPickerLocation.value;
    return location ? `选择仓位产品：${location.code}` : "选择产品";
});

const loadInboundLocationPickerProducts = async (
    params: ProductPickerLoadParams,
): Promise<ProductPickerLoadResult> => {
    const location = inboundProductPickerLocation.value;
    if (!location) {
        return {
            list: [],
            pagination: {
                page: params.page,
                limit: params.limit,
                total: 0,
                hasMore: false,
            },
        };
    }

    return await loadInventoryLocationProducts(location, params, {
        includeAssignedProducts: true,
    });
};

const handleInboundLocationScan = async (scanCode: string) => {
    if (isInboundDialogReadonly.value || isInboundScanAdding.value) {
        return;
    }

    isInboundScanAdding.value = true;
    try {
        const location = await lookupInventoryLocationByScanCode(scanCode);
        inboundProductPickerLocation.value = location;
        inboundScanClearSignal.value += 1;
        showProductPickerDialog.value = true;
        ElMessage.success(`已识别仓位：${location.warehouseName || location.warehouseCode} / ${location.name}`);
    } catch (err: any) {
        ElMessage.warning(err?.message || "扫码查询仓位失败");
    } finally {
        isInboundScanAdding.value = false;
    }
};

const handleInboundScanAdd = async (scanCode: string) => {
    if (isInboundDialogReadonly.value || isInboundScanAdding.value) {
        return;
    }

    isInboundScanAdding.value = true;
    try {
        try {
            const product = await lookupInventoryProductByScanCode(scanCode);
            const productId = product.backendId || product.id;
            const productKey = getInventoryItemLocationKey(
                productId,
                product.warehouseId,
                product.locationId,
            );
            const existingProduct = inboundDialogProducts.value.find((item) =>
                getInventoryItemLocationKey(item.productId, item.warehouseId, item.locationId) === productKey,
            );

            if (existingProduct) {
                existingProduct.quantity = Number(existingProduct.quantity || 0) + 1;
            } else {
                inboundDialogProducts.value = [
                    ...inboundDialogProducts.value,
                    createInboundDialogProduct(product),
                ];
            }

            inboundScanClearSignal.value += 1;
            ElMessage.success(`已添加${product.id || product.model || "产品"}`);
            return;
        } catch {}

        if (inboundDialogForm.type === "采购") {
            const trackingRes = await getPurchaseOrderByTracking({ trackingNo: scanCode.trim() });

            if (trackingRes.code === 200 && trackingRes.data) {
                const prefill = await buildInboundDialogPrefillFromPurchaseOrder(trackingRes.data);

                inboundDialogForm.purchaseOrderNo = trackingRes.data.orderNo;
                inboundDialogForm.courierCompany = prefill.courierCompany;
                inboundDialogForm.trackingNo = prefill.trackingNo;
                inboundDialogProducts.value = prefill.products;

                inboundScanClearSignal.value += 1;
                ElMessage.success(`已匹配采购单：${trackingRes.data.orderNo || scanCode}`);
                return;
            }
        }

        ElMessage.warning("未找到匹配的产品或采购单");
    } finally {
        isInboundScanAdding.value = false;
    }
};

const confirmInboundProductSelection = (selectedProducts: ProductPickerItem[]) => {
    if (!selectedProducts.length) {
        return;
    }

    const existingProductKeys = new Set(
        inboundDialogProducts.value.map((product) =>
            getInventoryItemLocationKey(product.productId, product.warehouseId, product.locationId),
        ),
    );
    const newProducts = selectedProducts.filter((product) => {
        const productId = product.backendId || product.id;
        const productKey = getInventoryItemLocationKey(
            productId,
            product.warehouseId,
            product.locationId,
        );

        if (!productId || existingProductKeys.has(productKey)) {
            return false;
        }

        existingProductKeys.add(productKey);
        return true;
    });

    if (!newProducts.length) {
        closeInboundProductPicker();
        return;
    }

    inboundDialogProducts.value = [
        ...inboundDialogProducts.value,
        ...newProducts.map((product, index) => createInboundDialogProduct(product, Date.now() + index)),
    ];
    closeInboundProductPicker();
};

watch(totalInboundOrders, (total) => setTotalItems(total), {
    immediate: true,
});

watch(pageSize, () => {
    goToPage(1);
    void loadInboundOrders();
});

onMounted(() => {
    void loadWarehouseOptions();
    void loadInboundOrders();
});

</script>

<style scoped>
.inbound-page {
    --inbound-selection-width: 58px;
    --inbound-action-width: var(--erp-table-col-action);

    height: 100%;
    display: grid;
    grid-template-rows: 40px 56px 32px minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-container-gap);
    color: var(--erp-color-text-primary);
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
    background-color: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
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

.table-row {
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
    line-height: var(--erp-typography-content1-line-height);
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
    line-height: var(--erp-typography-note-line-height);
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

.import-template-button:hover {
    text-decoration: underline;
}

.import-hint-list {
    display: grid;
    gap: var(--erp-spacing-8);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.import-hint-list p,
.import-result p {
    margin: 0;
}

.import-hint-list strong {
    color: var(--erp-color-text-secondary-strong);
}

.import-result {
    margin-top: var(--erp-spacing-12);
    padding: var(--erp-spacing-10);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-hover);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.import-errors {
    max-height: 120px;
    margin-top: var(--erp-spacing-8);
    overflow-y: auto;
    color: var(--erp-color-text-status-error);
}
</style>
