<template>
    <div class="transfer-page">
        <header class="topbar">
            <ErpBreadcrumb icon="lucide:refresh-cw" :items="transferBreadcrumbItems" />

            <ErpSearchBox
                v-model="searchText"
                :disabled="loading"
                @search="applySearch"
            />
        </header>

        <div class="filter-row">
            <div class="filter-field date-field">
                <span>调拨日期</span>
                <InventoryDatePicker
                    ref="datePickerRef"
                    v-model="draftTransferDate"
                    aria-label-text="选择调拨日期"
                    initial-month="2026-06-01"
                />
            </div>

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
                <button class="primary-button" type="button" @click="openCreateDialog">
                    <Icon name="lucide:circle-plus" class="button-icon" />
                    <span>新建</span>
                </button>
                <button class="outline-button" type="button" @click="openImportDialog">
                    <Icon name="lucide:download" class="button-icon" />
                    <span>导入</span>
                </button>
                <button class="outline-button" type="button" @click="exportTransferOrders">
                    <Icon name="lucide:upload" class="button-icon" />
                    <span>{{ selectedOrderIds.length ? '导出选中' : '导出' }}</span>
                </button>
                <button
                    class="outline-button danger-button"
                    type="button"
                    :disabled="selectedOrderIds.length === 0"
                    @click="batchDeleteTransferOrders"
                >
                    <Icon name="lucide:trash-2" class="button-icon" />
                    <span>批量删除</span>
                </button>
            </div>
        </div>

        <ErpTableFrame
            data-inventory-copy-table
            :columns="transferTableColumnTemplate"
            :minimum-width="transferTableMinimumWidth"
            :loading="loading"
            :empty="!loading && transferOrders.length === 0"
            loading-text="正在加载调拨单..."
            empty-text="暂无匹配调拨单"
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
                                :disabled="transferOrders.length === 0"
                                aria-label="选择全部调拨单"
                                @change="toggleSelectAll"
                            >
                        </label>
                    </div>
                    <div
                        v-for="column in transferColumns"
                        :key="column.key"
                        class="table-cell"
                    >
                        {{ column.label }}
                    </div>
                    <div class="action-head erp-table-fixed-end">操作</div>
                </div>
            </template>

            <template v-for="order in transferOrders" :key="order._id">
                <div class="table-row data-row">
                    <div class="selection-row checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                v-model="selectedOrderIds"
                                class="row-checkbox"
                                type="checkbox"
                                :value="order._id"
                                :aria-label="`选择${order.code}`"
                            >
                        </label>
                    </div>
                    <div
                        v-for="column in transferColumns"
                        :key="`${order._id}-${column.key}`"
                        class="table-cell"
                    >
                        <span
                            v-if="column.key === 'returnStatus'"
                            class="status-tag"
                            :class="getTransferStatusClass(order)"
                        >
                            {{ getTransferCellValue(order, column.key) }}
                        </span>
                        <span
                            v-else
                            class="ellipsis-text"
                            :title="String(getTransferCellValue(order, column.key))"
                        >
                            {{ getTransferCellValue(order, column.key) }}
                        </span>
                    </div>
                    <div class="action-row actions-cell erp-table-fixed-end">
                        <button
                            v-if="!order.returned"
                            class="icon-button green"
                            type="button"
                            :aria-label="`归还${order.code}`"
                            @click="openReturnDialog(order)"
                        >
                            <Icon name="lucide:rotate-ccw" />
                        </button>
                        <button
                            class="icon-button blue"
                            type="button"
                            :aria-label="`查看${order.code}详情`"
                            @click="openViewDialog(order)"
                        >
                            <Icon name="lucide:list" />
                        </button>
                        <button
                            class="icon-button blue"
                            type="button"
                            :aria-label="`编辑${order.code}`"
                            @click="openEditDialog(order)"
                        >
                            <Icon name="lucide:square-pen" />
                        </button>
                        <button
                            class="icon-button red"
                            type="button"
                            :aria-label="`删除${order.code}`"
                            @click="deleteTransferOrder(order._id)"
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

        <!-- 新建/编辑调拨单弹窗 -->
        <TransferDialog
            v-if="showFormDialog"
            :title="editingOrder ? '编辑调拨单' : '新建调拨单'"
            :form="transferForm"
            :warehouse-options="warehouseOptions"
            :scan-loading="isTransferScanAdding"
            :scan-clear-signal="transferScanClearSignal"
            :scan-auto-focus="!showProductPicker"
            @close="closeFormDialog"
            @confirm="confirmSubmit"
            @select-products="handleSelectProducts"
            @scan-product="handleTransferScanAdd"
            @scan-location="handleTransferLocationScan"
            @clear-items="handleClearItems"
            @remove-item="handleRemoveItem"
            @update-item-warehouse="updateItemWarehouse"
        />

        <!-- 查看调拨单弹窗 -->
        <TransferViewDialog
            v-if="showViewDialog && viewingOrder"
            :order="viewingOrder"
            @close="closeViewDialog"
        />

        <!-- 产品选择弹窗 -->
        <ProductPickerDialog
            v-if="showProductPicker"
            :title="transferProductPickerLocation ? `选择仓位产品：${transferProductPickerLocation.code}` : '选择产品'"
            selection-mode="multiple"
            :product-loader="transferProductPickerLocation ? loadTransferLocationPickerProducts : undefined"
            :empty-text="transferProductPickerLocation ? '该仓位暂无可用库存产品' : '暂无匹配产品'"
            @close="closeTransferProductPicker"
            @confirm="handleProductsSelected"
        />

        <div v-if="showReturnDialog && returningOrder" class="erp-dialog-mask" @click.self="closeReturnDialog">
            <ErpDialogFrame
                class="return-dialog"
                title="归还调拨单"
                width="600px"
                height="300px"
                :form="false"
                :close-disabled="isReturning"
                @close="closeReturnDialog"
            >
                <div class="return-dialog-body">
                    <section class="return-info-section">
                        <h3>归还信息</h3>
                        <label class="return-form-row">
                            <span>归还日期<i>*</i></span>
                            <InventoryDatePicker
                                v-model="returnDate"
                                aria-label-text="选择归还日期"
                            />
                        </label>
                    </section>
                </div>
                <template #footer>
                    <button class="dialog-button cancel" type="button" :disabled="isReturning" @click="closeReturnDialog">取消</button>
                    <button class="dialog-button confirm" type="button" :disabled="!returnDate || isReturning" @click="confirmReturn">
                        {{ isReturning ? "提交中" : "确认归还" }}
                    </button>
                </template>
            </ErpDialogFrame>
        </div>

        <!-- 导入弹窗 -->
        <div v-if="showImportDialog" class="erp-dialog-mask" @click.self="closeImportDialog">
            <ErpDialogFrame
                class="import-dialog"
                title="批量导入调拨单"
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
                        @click="downloadTransferImportTemplate"
                    >
                        下载模板（Excel）
                    </button>

                    <div class="import-section-title">字段说明</div>
                    <div class="import-hint-list">
                        <p><strong>必填字段：</strong>调拨日期、借用人、预计归还日期、转出仓库、产品编号（或型号）、数量</p>
                        <p><strong>物流字段：</strong>快递公司、快递单号为选填；填写快递单号后会自动同步到运单记录。</p>
                        <p><strong>仓库/仓位：</strong>可填写编码或名称；仓位为选填。</p>
                        <p><strong>日期格式：</strong>建议使用 2026-06-30。</p>
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
import InventoryDatePicker from "~/components/configuration/inventory/InventoryDatePicker.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import { getPaginationPageNumbers } from "~/composables/inventory/useInventoryPagination";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import TransferDialog from "~/components/configuration/inventory/transfer/TransferDialog.vue";
import TransferViewDialog from "~/components/configuration/inventory/transfer/TransferViewDialog.vue";
import ProductPickerDialog, {
    type ProductPickerLoadParams,
    type ProductPickerLoadResult,
} from "~/components/configuration/inventory/ProductPickerDialog.vue";
import { erpMessageBox } from "~/utils/erpMessageBox";
import { getErpTableGridColumn, getErpTableMinimumWidth } from "~/utils/inventory/erpTableColumns";
import type {
    InventoryLocation,
    InventoryTransferOrder,
    InventoryTransferItem,
    InventoryWarehouse,
} from "~~/shared/types/inventory";
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
    retrieveInventoryTransferOrders,
    getInventoryTransferDetail,
    addInventoryTransferOrder,
    updateInventoryTransferOrder,
    retrieveInventoryLocations,
    retrieveInventoryWarehouses,
    importInventoryTransferOrders,
    exportInventoryTransferOrders,
    deleteInventoryTransferOrder,
    returnInventoryTransferOrder,
} from "~/composables/api/useInventoryApi";
import {
    buildInboundLocationTree,
    type InboundWarehouseOption,
} from "~/utils/inventory/inboundFrontendMapping";
import { formatLocalDate, formatLocalDateTime } from "~/utils/time";
import {
    INVENTORY_IMPORT_FILE_SIZE_MESSAGE,
    INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES,
    INVENTORY_IMPORT_MAX_FILE_SIZE_MB,
} from "~~/shared/utils/inventoryImport";

definePageMeta({
    layout: "inventory",
});

const transferBreadcrumbItems = [
    { label: "仓储管理" },
    { label: "调拨单" },
];

type TransferColumnKey =
    | "code"
    | "transferDate"
    | "sourceWarehouse"
    | "borrower"
    | "expectedReturnDate"
    | "actualReturnTime"
    | "returnStatus"
    | "handler"
    | "courierCompany"
    | "trackingNo"
    | "remark"
    | "updatedBy"
    | "updateTime";

interface TransferColumn {
    key: TransferColumnKey;
    label: string;
    width: number;
    widthVar?: string;
    grow?: boolean;
}

// 状态
const loading = ref(false);
const transferOrders = ref<InventoryTransferOrder[]>([]);
const totalCount = ref(0);
const warehouseOptions = ref<InboundWarehouseOption[]>([]);

// 弹窗状态
const showFormDialog = ref(false);
const showViewDialog = ref(false);
const showProductPicker = ref(false);
const isTransferScanAdding = ref(false);
const transferScanClearSignal = ref(0);
const transferProductPickerLocation = ref<ScannedInventoryLocation | null>(null);
const editingOrder = ref<InventoryTransferOrder | null>(null);
const viewingOrder = ref<InventoryTransferOrder | null>(null);
const returningOrder = ref<InventoryTransferOrder | null>(null);
const showReturnDialog = ref(false);
const isReturning = ref(false);
const returnDate = ref("");

const transferForm = ref({
    code: "",
    transferDate: "",
    handler: "",
    borrower: "",
    expectedReturnDate: "",
    actualReturnTime: "",
    courierCompany: "",
    trackingNo: "",
    remark: "",
    items: [] as InventoryTransferItem[],
});

// 表格列定义
const transferColumns: TransferColumn[] = [
    { key: "code", label: "单据编号", width: 180 },
    { key: "transferDate", label: "调拨日期", width: 180, widthVar: "--erp-table-col-date" },
    { key: "sourceWarehouse", label: "转出仓库(源)", width: 160, grow: true },
    { key: "borrower", label: "借用人", width: 120 },
    { key: "expectedReturnDate", label: "预计归还日期", width: 180, widthVar: "--erp-table-col-date" },
    { key: "actualReturnTime", label: "实际归库时间", width: 180, widthVar: "--erp-table-col-date" },
    { key: "returnStatus", label: "归还状态", width: 100 },
    { key: "handler", label: "经办人", width: 150, widthVar: "--erp-table-col-operator" },
    { key: "courierCompany", label: "快递公司", width: 120 },
    { key: "trackingNo", label: "快递单号", width: 160, grow: true },
    { key: "remark", label: "备注", width: 180, widthVar: "--erp-table-col-remark", grow: true },
    { key: "updatedBy", label: "修改人", width: 150, widthVar: "--erp-table-col-operator" },
    { key: "updateTime", label: "修改时间", width: 180, widthVar: "--erp-table-col-date" },
];

const transferTableColumnTemplate = computed(() => [
    "var(--transfer-selection-width)",
    ...transferColumns.map(getErpTableGridColumn),
    "var(--transfer-action-width)",
].join(" "));
const transferTableMinimumWidth = computed(() =>
    getErpTableMinimumWidth(
        transferColumns,
        ["var(--transfer-selection-width)"],
        ["var(--transfer-action-width)"],
    ),
);

// 搜索和筛选
const datePickerRef = ref<InstanceType<typeof InventoryDatePicker> | null>(null);
const searchText = ref("");
const appliedSearchText = ref("");
const draftTransferDate = ref("");
const appliedTransferDate = ref("");
const selectedOrderIds = ref<string[]>([]);
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
    draftTransferDate.value !== appliedTransferDate.value,
);

// 数据获取
const fetchTransferOrders = async () => {
    loading.value = true;
    try {
        const res = await retrieveInventoryTransferOrders({
            keyword: appliedSearchText.value || undefined,
            transferDate: appliedTransferDate.value || undefined,
            page: currentPage.value,
            limit: pageSize.value,
        });
        if (res.code === 200 && res.data) {
            transferOrders.value = (res.data.list || []).map(normalizeTransferOrder);
            totalCount.value = res.data.pagination?.total || 0;
        }
    } catch (err) {
        console.error("获取调拨单列表失败", err);
    } finally {
        loading.value = false;
    }
};

const normalizeWarehouseBaseOption = (item: InventoryWarehouse | InventoryLocation) => ({
    id: item._id || "",
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

const fetchWarehouses = async () => {
    try {
        const res = await retrieveInventoryWarehouses();
        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取仓库列表失败");
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
    } catch (err) {
        console.error("获取仓库列表失败", err);
        warehouseOptions.value = [];
    }
};

// 数据规范化
const normalizeTransferOrder = (order: any): InventoryTransferOrder => ({
    _id: order._id || "",
    code: order.transferNo || "",
    transferDate: formatLocalDate(order.transferDate),
    borrower: order.borrower || "",
    expectedReturnDate: formatLocalDate(order.expectedReturnDate),
    actualReturnTime: formatLocalDate(order.actualReturnTime),
    returned: order.returned === true,
    handler: order.handler || "",
    courierCompany: order.courierCompany || "",
    trackingNo: order.trackingNo || "",
    remark: order.remark || "",
    status: order.status || "已完成",
    items: Array.isArray(order.items)
        ? order.items.map((item: any) => ({
            productId: item.productId || "",
            productCode: item.productCode || "",
            productName: item.productName || "",
            model: item.model || "",
            material: item.material || "",
            categoryId: item.categoryId || "",
            categoryName: item.categoryName || "",
            categoryPath: item.categoryPath || "",
            category: item.categoryPath || item.categoryName || "",
            image: item.image || "",
            quantity: Number(item.quantity || 0),
            unitId: item.unitId || "",
            unitCode: item.unitCode || "",
            unit: item.unitName || "",
            warehouseId: item.warehouseId || "",
            warehouseCode: item.warehouseCode || "",
            warehouseName: item.warehouseName || "",
            locationId: item.locationId || "",
            locationCode: item.locationCode || "",
            locationName: item.locationName || "",
            includeInAvailable: item.includeInAvailable !== false,
        }))
        : [],
    createdBy: order.createdBy || "",
    updatedBy: order.updatedBy || "",
    createTime: formatLocalDateTime(order.createTime) || "--",
    updateTime: formatLocalDateTime(order.updateTime) || "--",
    _isDeleted: order._isDeleted || false,
});

// 弹窗操作
const openCreateDialog = () => {
    editingOrder.value = null;
    transferForm.value = {
        code: "",
        transferDate: formatLocalDate(new Date()),
        handler: "",
        borrower: "",
        expectedReturnDate: "",
        actualReturnTime: "",
        courierCompany: "",
        trackingNo: "",
        remark: "",
        items: [],
    };
    showFormDialog.value = true;
};

const openEditDialog = async (order: InventoryTransferOrder) => {
    try {
        const res = await getInventoryTransferDetail(order._id);
        if (res.code === 200 && res.data?.detail) {
            const detail = normalizeTransferOrder(res.data.detail);
            editingOrder.value = detail;
            transferForm.value = {
                code: detail.code,
                transferDate: detail.transferDate,
                handler: detail.handler,
                borrower: detail.borrower || "",
                expectedReturnDate: String(detail.expectedReturnDate || ""),
                actualReturnTime: String(detail.actualReturnTime || ""),
                courierCompany: detail.courierCompany || "",
                trackingNo: detail.trackingNo || "",
                remark: detail.remark || "",
                items: [...detail.items],
            };
            showFormDialog.value = true;
        }
    } catch (err) {
        console.error("获取调拨单详情失败", err);
        ElMessage.error("获取调拨单详情失败");
    }
};

const closeFormDialog = () => {
    showFormDialog.value = false;
    showProductPicker.value = false;
    transferProductPickerLocation.value = null;
    editingOrder.value = null;
};

const openViewDialog = async (order: InventoryTransferOrder) => {
    try {
        const res = await getInventoryTransferDetail(order._id);
        if (res.code === 200 && res.data?.detail) {
            viewingOrder.value = normalizeTransferOrder(res.data.detail);
            showViewDialog.value = true;
        }
    } catch (err) {
        console.error("获取调拨单详情失败", err);
        ElMessage.error("获取调拨单详情失败");
    }
};

const closeViewDialog = () => {
    showViewDialog.value = false;
    viewingOrder.value = null;
};

// 提交表单
const confirmSubmit = async () => {
    const form = transferForm.value;
    if (!form.transferDate) {
        ElMessage.warning("请填写调拨日期");
        return;
    }
    if (!form.borrower.trim()) {
        ElMessage.warning("请填写借用人");
        return;
    }
    if (!form.expectedReturnDate) {
        ElMessage.warning("请选择预计归还日期");
        return;
    }
    if (!form.items.length) {
        ElMessage.warning("请添加调拨产品");
        return;
    }
    const missingSourceWarehouse = form.items.some((item) => !item.warehouseId);
    if (missingSourceWarehouse) {
        ElMessage.warning("请选择产品转出仓库");
        return;
    }

    const payload = {
        transferDate: form.transferDate,
        borrower: form.borrower.trim(),
        expectedReturnDate: form.expectedReturnDate,
        handler: form.handler,
        courierCompany: form.courierCompany.trim(),
        trackingNo: form.trackingNo.trim(),
        remark: form.remark,
        items: form.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitId: item.unitId || undefined,
            warehouseId: item.warehouseId || undefined,
            locationId: item.locationId || undefined,
        })),
    };

    try {
        if (editingOrder.value) {
            await updateInventoryTransferOrder({ id: editingOrder.value._id, ...payload });
            ElMessage.success("调拨单更新成功");
        } else {
            await addInventoryTransferOrder(payload);
            ElMessage.success("调拨单创建成功");
        }
        closeFormDialog();
        fetchTransferOrders();
    } catch (err: any) {
        const msg = err?.data?.msg || err?.message || "操作失败";
        ElMessage.error(msg);
    }
};

// 产品选择
const handleSelectProducts = async () => {
    transferProductPickerLocation.value = null;
    showProductPicker.value = true;
};

const closeTransferProductPicker = () => {
    showProductPicker.value = false;
    transferProductPickerLocation.value = null;
};

const loadTransferLocationPickerProducts = async (
    params: ProductPickerLoadParams,
): Promise<ProductPickerLoadResult> => {
    const location = transferProductPickerLocation.value;
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
        availableOnly: true,
    });
};

const addTransferProduct = (product: ProductPickerItem) => {
    transferForm.value.items.push({
        productId: product.backendId || "",
        productCode: product.id || "",
        productName: product.model || "",
        model: product.model || "",
        category: product.category || "",
        image: product.image || "",
        quantity: 1,
        unit: product.unit || "",
        unitId: product.unitId || "",
        warehouseId: product.warehouseId || "",
        warehouseName: product.warehouseName || "",
        locationId: product.locationId || "",
        locationName: product.locationName || "",
    });
};

const handleProductsSelected = (selectedProducts: ProductPickerItem[]) => {
    const existingKeys = new Set(transferForm.value.items.map((item) =>
        getInventoryItemLocationKey(
            item.productId || "",
            item.warehouseId || "",
            item.locationId || "",
        ),
    ));
    for (const product of selectedProducts) {
        const productId = product.backendId || product.id;
        const productKey = getInventoryItemLocationKey(
            productId,
            product.warehouseId,
            product.locationId,
        );
        if (!productId || existingKeys.has(productKey)) continue;
        addTransferProduct(product);
        existingKeys.add(productKey);
    }
    closeTransferProductPicker();
};

const parseWarehouseLabel = (label: string) => {
    return label === "--" ? ["", ""] : label.split(" / ");
};

const updateItemWarehouse = (
    index: number,
    warehouseId: string,
    locationId: string,
    label: string,
) => {
    const item = transferForm.value.items[index];
    if (!item) {
        return;
    }

    const [warehouseName = "", locationName = ""] = parseWarehouseLabel(label);

    item.warehouseId = warehouseId;
    item.locationId = locationId;
    item.warehouseName = warehouseName;
    item.locationName = locationName;
};

const handleTransferLocationScan = async (scanCode: string) => {
    if (isTransferScanAdding.value) {
        return;
    }

    isTransferScanAdding.value = true;
    try {
        const location = await lookupInventoryLocationByScanCode(scanCode);
        transferProductPickerLocation.value = location;
        transferScanClearSignal.value += 1;
        showProductPicker.value = true;
        ElMessage.success(`已识别仓位：${location.warehouseName || location.warehouseCode} / ${location.name}`);
    } catch (err: any) {
        ElMessage.warning(err?.message || "扫码查询仓位失败");
    } finally {
        isTransferScanAdding.value = false;
    }
};

const handleTransferScanAdd = async (scanCode: string) => {
    if (isTransferScanAdding.value) {
        return;
    }

    isTransferScanAdding.value = true;
    try {
        const product = await lookupInventoryProductByScanCode(scanCode);
        const productId = product.backendId || product.id;
        const productKey = getInventoryItemLocationKey(
            productId,
            product.warehouseId,
            product.locationId,
        );
        const existingProduct = transferForm.value.items.find((item) =>
            getInventoryItemLocationKey(
                item.productId || "",
                item.warehouseId || "",
                item.locationId || "",
            ) === productKey,
        );

        if (existingProduct) {
            existingProduct.quantity = Number(existingProduct.quantity || 0) + 1;
        } else {
            addTransferProduct(product);
        }

        transferScanClearSignal.value += 1;
        ElMessage.success(`已添加${product.id || product.model || "产品"}`);
    } catch (err: any) {
        ElMessage.warning(err?.message || "扫码查询产品失败");
    } finally {
        isTransferScanAdding.value = false;
    }
};

const handleClearItems = () => {
    transferForm.value.items = [];
};

const handleRemoveItem = (index: number) => {
    transferForm.value.items.splice(index, 1);
};

// 搜索和筛选
const applySearch = () => {
    appliedSearchText.value = searchText.value;
    currentPage.value = 1;
    fetchTransferOrders();
};

const applyFilters = () => {
    appliedTransferDate.value = draftTransferDate.value;
    currentPage.value = 1;
    fetchTransferOrders();
};

const resetFilters = () => {
    searchText.value = "";
    appliedSearchText.value = "";
    draftTransferDate.value = "";
    appliedTransferDate.value = "";
    selectedOrderIds.value = [];
    datePickerRef.value?.close();
    currentPage.value = 1;
    fetchTransferOrders();
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
    fetchTransferOrders();
};

const jumpToInputPage = () => {
    goToPage(Number(jumpPageInput.value.trim()));
};

// 选择
const allRowsSelected = computed(() =>
    transferOrders.value.length > 0
    && transferOrders.value.every((order) => selectedOrderIds.value.includes(order._id)),
);

const toggleSelectAll = () => {
    const pageIds = transferOrders.value.map((order) => order._id);
    if (allRowsSelected.value) {
        selectedOrderIds.value = selectedOrderIds.value.filter((id) => !pageIds.includes(id));
        return;
    }
    selectedOrderIds.value = [...new Set([...selectedOrderIds.value, ...pageIds])];
};

const formatWarehouseName = (warehouseName?: string, locationName?: string) => {
    const parts = [warehouseName, locationName].filter(Boolean);

    return parts.length ? parts.join(" / ") : "";
};

const getSourceWarehouseSummary = (order: InventoryTransferOrder) => {
    const names = order.items
        .map((item) => formatWarehouseName(item.warehouseName, item.locationName))
        .filter(Boolean);
    const uniqueNames = [...new Set(names)];
    const firstName = uniqueNames[0];

    if (!firstName) {
        return "--";
    }

    return uniqueNames.length > 1 ? `${firstName}...` : firstName;
};

// 单元格显示
const getTransferCellValue = (order: InventoryTransferOrder, key: TransferColumnKey) => {
    switch (key) {
        case "sourceWarehouse":
            return getSourceWarehouseSummary(order);
        case "returnStatus":
            return order.returned ? "已归还" : "未归还";
        case "transferDate":
            return order.transferDate || "--";
        case "expectedReturnDate":
            return order.expectedReturnDate || "--";
        case "actualReturnTime":
            return order.actualReturnTime || "--";
        case "updateTime":
            return order.updateTime || "--";
        default:
            return (order as any)[key] || "--";
    }
};

const getTransferStatusClass = (order: InventoryTransferOrder) =>
    order.returned ? "status-complete" : "status-review";

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
    if (file) setImportFile(file);
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

const downloadTransferImportTemplate = async () => {
    const XLSX = await import("xlsx");
    const headers = ["调拨日期", "借用人", "预计归还日期", "转出仓库", "转出仓位", "产品编号", "型号", "数量", "经办人", "快递公司", "快递单号", "备注"];
    const example = ["2026-06-30", "张三", "2026-07-15", "原料仓", "B-01", "PROD-DEMO-001", "M-100", "5", "雪糕", "顺丰", "SF123456789", "示例：调拨出库"];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws["!cols"] = headers.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "调拨单导入模板");
    XLSX.writeFile(wb, "调拨单导入模板.xlsx");
};

const confirmImport = async () => {
    if (!importFile.value || isImporting.value) return;
    isImporting.value = true;
    try {
        const res = await importInventoryTransferOrders(importFile.value);
        if (res.code !== 200) {
            ElMessage.error(res.msg || "导入调拨单失败");
            return;
        }
        importResult.value = res.data || { successCount: 0, failCount: 0, errors: [] };
        if (importResult.value.failCount === 0) {
            ElMessage.success(`导入成功，共 ${importResult.value.successCount} 条`);
            await fetchTransferOrders();
        } else {
            ElMessage.warning(`导入完成：成功 ${importResult.value.successCount} 条，失败 ${importResult.value.failCount} 条`);
        }
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "导入调拨单失败");
    } finally {
        isImporting.value = false;
    }
};

const exportTransferOrders = async () => {
    try {
        const blob = await exportInventoryTransferOrders({
            keyword: selectedOrderIds.value.length ? undefined : appliedSearchText.value || undefined,
            transferDate: selectedOrderIds.value.length ? undefined : appliedTransferDate.value || undefined,
            ids: selectedOrderIds.value.length ? selectedOrderIds.value.join(",") : undefined,
        });
        downloadBlob(blob, selectedOrderIds.value.length ? "选中调拨单.xlsx" : "调拨单.xlsx");
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "导出调拨单失败");
    }
};

const openReturnDialog = (order: InventoryTransferOrder) => {
    returningOrder.value = order;
    returnDate.value = formatLocalDate(new Date());
    showReturnDialog.value = true;
};

const closeReturnDialog = () => {
    if (isReturning.value) return;
    showReturnDialog.value = false;
    returningOrder.value = null;
    returnDate.value = "";
};

const confirmReturn = async () => {
    if (!returningOrder.value || !returnDate.value || isReturning.value) return;

    isReturning.value = true;
    try {
        const res = await returnInventoryTransferOrder({
            id: returningOrder.value._id,
            actualReturnTime: returnDate.value,
        });
        if (res.code !== 200) {
            ElMessage.error(res.msg || "归还失败");
            return;
        }

        ElMessage.success("归还成功");
        isReturning.value = false;
        closeReturnDialog();
        await fetchTransferOrders();
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "归还失败");
    } finally {
        isReturning.value = false;
    }
};

const deleteTransferOrder = async (id: string) => {
    try {
        await erpMessageBox.confirm("确定要删除这条调拨单吗？删除后将自动回滚库存。", "删除确认", {
            type: "warning",
            confirmButtonText: "确认删除",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    try {
        const res = await deleteInventoryTransferOrder({ id });
        if (res.code !== 200) {
            ElMessage.error(res.msg || "删除调拨单失败");
            return;
        }
        ElMessage.success("删除成功");
        await fetchTransferOrders();
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "删除调拨单失败");
    }
};

const batchDeleteTransferOrders = async () => {
    const ids = selectedOrderIds.value.filter(Boolean);

    if (!ids.length) {
        ElMessage.warning("请先选择需要删除的调拨单");
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除选中的 ${ids.length} 个调拨单？`, "批量删除调拨单", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    try {
        const res = await deleteInventoryTransferOrder({ ids });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "批量删除调拨单失败");
            return;
        }

        selectedOrderIds.value = selectedOrderIds.value.filter((id) => !ids.includes(id));
        ElMessage.success("批量删除调拨单成功");
        await fetchTransferOrders();
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "批量删除调拨单失败");
    }
};

// 初始化
onMounted(() => {
    fetchTransferOrders();
    fetchWarehouses();
});
</script>

<style scoped>
.transfer-page {
    --inventory-date-picker-panel-width: 288px;
    --inventory-date-picker-panel-width-compact: 260px;
    --transfer-selection-width: 58px;
    --transfer-action-width: var(--erp-table-col-action);

    height: 100%;
    display: grid;
    grid-template-rows: 40px 56px 32px minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-container-gap);
    color: var(--erp-color-text-primary);
}

button,
input,
select {
    font: inherit;
}

button {
    appearance: none;
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
    min-width: 0;
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

.return-dialog {
    min-width: 0;
    max-width: 95vw;
    max-height: 90vh;
    overflow: visible;
}

.import-dialog {
    min-width: 0;
}

.return-dialog :deep(.erp-dialog-frame__body),
.import-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
}

.return-dialog :deep(.erp-dialog-frame__body) {
    overflow: visible;
}

.return-dialog-body {
    min-height: 0;
    display: grid;
    align-content: start;
}

.return-info-section {
    min-width: 0;
    padding: var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.return-info-section h3 {
    margin: 0;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.return-form-row {
    min-width: 0;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: var(--erp-spacing-12);
    margin-top: var(--erp-spacing-20);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.return-form-row > span {
    min-height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    white-space: nowrap;
}

.return-form-row i {
    color: var(--erp-color-text-required);
    font-style: normal;
}

.return-form-row :deep(.inventory-date-picker) {
    width: 100%;
    max-width: none;
    flex: 1 1 auto;
}

.return-form-row :deep(.date-trigger) {
    height: var(--erp-size-control-height-sm);
}

.return-form-row :deep(.date-panel) {
    z-index: 60;
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
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
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
    line-height: var(--erp-typography-content2-line-height);
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
    line-height: var(--erp-typography-content2-line-height);
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

.import-hint-list p {
    margin: 0;
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
    margin-top: var(--erp-spacing-8);
    max-height: 120px;
    overflow-y: auto;
    color: var(--erp-color-text-status-error);
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

.table-head {
    background: var(--erp-color-fill-table-header);
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

.selection-head,
.action-head {
    background: var(--erp-color-fill-table-header);
}

.selection-row,
.action-row {
    background: inherit;
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

.status-tag {
    min-width: 56px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    border-radius: var(--erp-radius-control-pill);
    font-size: var(--erp-typography-content2-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-content2-line-height);
    white-space: nowrap;
}

.status-tag.status-review {
    color: var(--erp-color-text-status-review);
    background: var(--erp-color-bg-status-review);
}

.status-tag.status-complete {
    color: var(--erp-color-text-status-complete);
    background: var(--erp-color-bg-status-complete);
}

.actions-cell {
    gap: var(--erp-spacing-12);
}

.icon-button.green {
    color: var(--erp-color-text-status-complete);
}

.icon-button.red {
    color: var(--erp-color-icon-error);
}

.icon-button.blue {
    color: var(--erp-color-icon-brand);
}

.icon-button.green,
.icon-button.red,
.icon-button.blue {
    border-radius: var(--erp-radius-control-default);
}

.icon-button:not(:disabled):hover {
    background: var(--erp-color-fill-hover);
}

@media (max-width: 1280px) {
    .filter-row {
        gap: var(--erp-spacing-24);
    }
}

@media (max-width: 900px) {
    .transfer-page {
        grid-template-rows: auto auto 40px minmax(0, 1fr) 92px;
    }

    .topbar,
    .filter-row {
        flex-wrap: wrap;
    }

    .filter-field {
        flex: 0 1 280px;
    }

    .filter-actions {
        margin-left: 0;
    }
}
</style>
