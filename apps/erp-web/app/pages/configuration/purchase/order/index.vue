<template>
    <div class="purchase-order-page">
        <header class="topbar">
            <ErpBreadcrumb icon="lucide:shopping-cart" :items="purchaseOrderBreadcrumbItems"  />
        </header>

        <div class="filter-row">
            <ErpSearchBox
                v-model="searchText"
                :disabled="isLoading"
                placeholder="搜索采购单号、采购人"
                @search="applyFilters"
            />
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
                <button
                    v-if="canDeletePurchaseOrder"
                    class="outline-button danger-button"
                    type="button"
                    :disabled="selectedOrderIds.length === 0"
                    @click="batchDeletePurchaseOrders"
                >
                    <Icon name="lucide:trash-2" class="button-icon" />
                    <span>批量删除</span>
                </button>
            </div>
        </div>

        <section class="table-wrap" aria-label="采购单列表">
            <ErpTableFrame
                :columns="purchaseOrderTableColumnTemplate"
                :minimum-width="purchaseOrderTableMinimumWidth"
                :loading="isLoading"
                :empty="visiblePurchaseOrders.length === 0"
                loading-text="加载中..."
                empty-text="暂无匹配采购单"
                scroll-x
            >
                <template #header>
                <div
                    class="table-row table-head"
                >
                    <div
                        v-for="column in purchaseOrderColumns"
                        :key="column.key"
                        class="table-cell"
                        :class="{ 'order-no-head': column.key === 'orderNo' }"
                    >
                        <input
                            v-if="column.key === 'orderNo'"
                            class="row-checkbox"
                            type="checkbox"
                            aria-label="全选当前页采购单"
                            :checked="isCurrentPageSelected"
                            :disabled="isLoading"
                            @change="toggleCurrentPageSelection"
                        >
                        <span>{{ column.label }}</span>
                    </div>
                    <div class="action-head erp-table-fixed-end">操作</div>
                </div>
                </template>

                <div
                    v-for="order in visiblePurchaseOrders"
                    :key="order.id"
                    class="table-row data-row purchase-order-group"
                    :class="{ 'created-order-highlight': order.id === highlightedOrderId }"
                    :style="{ gridTemplateRows: `repeat(${order.items.length}, minmax(76px, auto))` }"
                >
                    <div class="table-cell order-cell order-number-cell" :style="purchaseOrderCellStyle('orderNo')">
                        <input
                            v-model="selectedOrderIds"
                            class="row-checkbox"
                            type="checkbox"
                            :value="order.id"
                            :aria-label="'选择采购单' + order.orderNo"
                            :disabled="isLoading"
                        >
                        <div class="order-identity">
                            <span :title="order.orderNo">{{ order.orderNo }}</span>
                            <span class="product-secondary">{{ order.purchaseDate || '--' }}</span>
                        </div>
                    </div>
                    <div class="table-cell order-cell remark-cell" :style="purchaseOrderCellStyle('remark')" :title="order.remark">{{ order.remark }}</div>
                    <template v-for="(item, itemIndex) in order.items" :key="item.productId || 'empty'">
                        <div
                            class="table-cell product-row-cell product-cell"
                            :class="{ 'product-row-divider': itemIndex > 0 }"
                            :style="purchaseOrderCellStyle('products', itemIndex + 1)"
                        >
                            <strong :title="item.productName">{{ item.productName }}</strong>
                            <span v-if="item.productModel && item.productModel !== item.productName" class="product-secondary" :title="item.productModel">{{ item.productModel }}</span>
                            <span class="product-secondary" :title="item.productCode">
                                {{ item.productCode ? item.productCode + ' · ' : '' }}{{ item.quantity }} {{ item.unitName }}
                            </span>
                        </div>
                        <div
                            class="table-cell product-row-cell logistics-cell"
                            :class="{ 'product-row-divider': itemIndex > 0 }"
                            :style="purchaseOrderCellStyle('logistics', itemIndex + 1)"
                        >
                            <div v-if="item.waybills.length" class="waybill-list">
                                <div v-for="(waybill, waybillIndex) in item.waybills" :key="waybillIndex" class="waybill-entry">
                                    <strong :title="waybill.courierCompany">{{ waybill.courierCompany || '--' }}</strong>
                                    <span class="product-secondary" :title="waybill.trackingNo">{{ waybill.trackingNo || '--' }}</span>
                                </div>
                            </div>
                            <span v-else>{{ order.purchaseChannel === 'other' ? '待补录' : '--' }}</span>
                        </div>
                        <div
                            class="table-cell product-row-cell inbound-progress-cell"
                            :class="{ 'product-row-divider': itemIndex > 0 }"
                            :style="purchaseOrderCellStyle('inboundProgress', itemIndex + 1)"
                        >
                            <button class="progress-button" type="button" @click="showInboundProgress(order, item)">
                                {{ item.receivedQuantity }} / {{ item.quantity }} {{ item.unitName }}
                            </button>
                        </div>
                    </template>
                    <div class="action-row actions-cell erp-table-fixed-end">
                        <button
                            class="link-button"
                            type="button"
                            :aria-label="'查看采购单' + order.orderNo"
                            @click="openPurchaseOrderDetail(order)"
                        >查看</button>
                        <button
                            v-if="canManagePurchaseOrder && order.purchaseChannel === 'taobao'"
                            class="icon-button blue"
                            type="button"
                            :disabled="Boolean(syncingTaobaoId)"
                            :aria-label="'同步运单' + order.orderNo"
                            title="同步淘宝运单"
                            @click="syncTaobaoWaybills(order)"
                        ><Icon name="lucide:refresh-cw" /></button>
                        <button
                            class="icon-button blue"
                            type="button"
                            :aria-label="'查看物流' + order.orderNo"
                            title="查看物流"
                            @click="openLogisticsTracking(order)"
                        ><Icon name="lucide:truck" /></button>
                        <button
                            v-if="canEditPurchaseOrder"
                            class="icon-button blue"
                            type="button"
                            :aria-label="'编辑' + order.orderNo"
                            @click="editOrder(order)"
                        >
                            <Icon name="lucide:square-pen" />
                        </button>
                        <button
                            v-if="canDeletePurchaseOrder"
                            class="icon-button delete"
                            type="button"
                            :aria-label="'删除' + order.orderNo"
                            @click="deleteOrder(order)"
                        >
                            <Icon name="lucide:trash-2" />
                        </button>
                    </div>
                </div>
            </ErpTableFrame>
        </section>

        <InventoryPagination
            v-model:page-size="pageSize"
            v-model:jump-page-input="jumpPageInput"
            :total="totalPurchaseOrders"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="goToPurchasePage"
            @jump="jumpToPurchaseInputPage"
        />

        <PurchaseOrderDialog
            v-if="showCreateOrderDialog"
            :order-no="nextPurchaseOrderNo"
            :mode="purchaseOrderDialogMode"
            :initial-order="editingPurchaseOrder"
            :initial-draft="prefillPurchaseOrderDraft"
            @close="closeCreateOrderDialog"
            @confirm="confirmCreateOrder"
        />
        <PurchaseRequestOrderDialog
            v-if="showRequestOrderDialog || prefillPurchaseOrderDraft?.source === 'material-pool'"
            :mode="showRequestOrderDialog ? 'edit' : 'create'"
            :initial-order="editingRequestOrder"
            :initial-draft="prefillPurchaseOrderDraft?.source === 'material-pool' ? prefillPurchaseOrderDraft : null"
            :submitting="requestOrderSubmitting"
            @close="closeRequestOrderDialog"
            @confirm="prefillPurchaseOrderDraft?.source === 'material-pool' ? confirmCreateRequestStyleOrder($event) : confirmRequestOrderUpdate($event)"
        />
        <LogisticsTrackingDialog
            v-if="trackingTarget"
            context="purchase"
            :record-id="trackingTarget.id"
            :waybills="trackingTarget.waybills"
            @close="trackingTarget = null"
            @updated="handleLogisticsTrackingUpdated"
        />
        <PurchaseOrderDetailDialog
            v-if="detailOrderId"
            :order="selectedOrderDetail"
            :loading="detailLoading"
            :error="detailError"
            @close="closePurchaseOrderDetail"
            @retry="loadPurchaseOrderDetail"
        />
    </div>
</template>

<script setup lang="ts">
import PurchaseOrderDialog from "~/components/configuration/purchase/PurchaseOrderDialog.vue";
import PurchaseOrderDetailDialog from "~/components/configuration/purchase/PurchaseOrderDetailDialog.vue";
import LogisticsTrackingDialog from "~/components/configuration/inventory/LogisticsTrackingDialog.vue";
import PurchaseRequestOrderDialog from "~/components/configuration/purchase/PurchaseRequestOrderDialog.vue";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import {
    addPurchaseOrder,
    deletePurchaseOrder,
    getPurchaseOrderDetail,
    retrievePurchaseOrders,
    updatePurchaseOrder,
    syncTaobaoPurchaseWaybills,
} from "~/composables/api/usePurchaseOrderApi";
import type {
    PurchaseOrder as PurchaseOrderEntity,
    PurchaseOrderDialogDraft,
    PurchaseOrderItem,
    PurchaseOrderMutationPayload,
    PurchaseOrderWaybill,
} from "~~/shared/types/purchase";
import {
    canDeletePurchaseOrder as canDeletePurchaseOrderByRole,
    canEditPurchaseOrder as canEditPurchaseOrderByRole,
    canManagePurchaseOrder as canManagePurchaseOrderByRole,
} from "~~/shared/utils/adminPermission";
import {
    getErpTableGridColumn,
    getErpTableMinimumWidth,
} from "~/utils/inventory/erpTableColumns";
import { erpMessageBox } from "~/utils/erpMessageBox";

definePageMeta({
    layout: "purchase",
});

type PurchaseOrderColumnKey =
    | "orderNo"
    | "products"
    | "inboundProgress"
    | "logistics"
    | "remark";

interface PurchaseOrderColumn {
    key: PurchaseOrderColumnKey;
    label: string;
    width: number;
    widthVar?: string;
    grow?: boolean;
}

interface PurchaseOrder {
    purchaseChannel?: "taobao" | "other";
    id: string;
    orderNo: string;
    items: PurchaseOrderProductRow[];
    remark: string;
    purchaseDate: string;
    inboundReceived: number;
}

interface PurchaseOrderProductRow {
    productId: string;
    productName: string;
    productCode: string;
    productModel: string;
    quantity: number;
    unitName: string;
    receivedQuantity: number;
    waybills: PurchaseOrderWaybill[];
}

interface PurchaseOrderDialogSubmitPayload {
    form: {
        purchaseChannel: "taobao" | "other" | "";
        platformOrderNos: string[];
        orderNo: string;
        buyer: string;
        supplierId: string;
        supplierName: string;
        productId: string;
        productName: string;
        purchaseQuantity: number;
        unitId: string;
        unitPrice: number | string;
        productRemark: string;
        purchaseDate: string;
        remark: string;
    };
    relatedOrders: Array<{
        id: string;
        requirementId: string;
        orderNo: string;
        requiredQuantity: number;
        allocatedQuantity: number;
    }>;
    items?: Array<{
        productId: string;
        quantity: number;
        unitPrice: number | string;
        remark: string;
        unitId?: string | null;
        supplierId?: string;
        supplierIds?: string[];
        allocations?: Array<{ requirementId: string; allocatedQuantity: number }>;
    }>;
    waybills: Array<{
        source?: "manual" | "taobao";
        id: string;
        trackingNo: string;
        courierCompany: string;
        remark: string;
    }>;
}

const purchaseOrderColumns: PurchaseOrderColumn[] = [
    { key: "orderNo", label: "采购单号 / 日期", width: 210, grow: true },
    { key: "products", label: "采购产品", width: 220, grow: true },
    { key: "inboundProgress", label: "入库进度", width: 150 },
    { key: "logistics", label: "物流信息", width: 220, grow: true },
    { key: "remark", label: "备注", width: 220, grow: true },
];

const purchaseOrderBreadcrumbItems = [
    { label: "采购管理" },
    { label: "采购单" },
];

const purchaseOrders = ref<PurchaseOrder[]>([]);
const detailOrderId = ref("");
const selectedOrderDetail = ref<PurchaseOrderEntity | null>(null);
const detailLoading = ref(false);
const detailError = ref("");
let detailRequestVersion = 0;
const syncingTaobaoId = ref("");
const trackingTarget = ref<{ id: string; waybills: Array<{ trackingNo: string; courierCompany?: string }> } | null>(null);
const totalPurchaseOrders = ref(0);
const isLoading = ref(false);
const selectedOrderIds = ref<string[]>([]);
const route = useRoute();
const router = useRouter();
const queryText = (value: unknown) => Array.isArray(value)
    ? String(value[0] || "").trim()
    : String(value || "").trim();
const locatedOrderNo = ref(queryText(route.query.orderNo));
const highlightedOrderId = ref(queryText(route.query.createdOrderId));
const locationNoticeShown = ref(false);
const adminInfo = useState<{ role?: number }>("admin_info", () => ({}));
const canDeletePurchaseOrder = computed(() =>
    canDeletePurchaseOrderByRole(Number(adminInfo.value?.role)),
);
const canManagePurchaseOrder = computed(() =>
    canManagePurchaseOrderByRole(Number(adminInfo.value?.role)),
);
const canEditPurchaseOrder = computed(() =>
    canEditPurchaseOrderByRole(Number(adminInfo.value?.role)),
);
const searchText = ref(locatedOrderNo.value);
const supplierFilter = ref("");
const appliedSearchText = ref(locatedOrderNo.value);
const appliedSupplierFilter = ref("");
const showCreateOrderDialog = ref(false);
const purchaseOrderDialogMode = ref<"create" | "edit">("create");
const editingPurchaseOrderId = ref("");
const editingPurchaseOrder = ref<PurchaseOrderEntity | null>(null);
const prefillPurchaseOrderDraft = ref<PurchaseOrderDialogDraft | null>(null);
const showRequestOrderDialog = ref(false);
const requestOrderSubmitting = ref(false);
const editingRequestOrder = ref<PurchaseOrderEntity | null>(null);
const nextPurchaseOrderNo = ref("");
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

const purchaseOrderTableColumnTemplate = computed(() => [
    ...purchaseOrderColumns.map(getErpTableGridColumn),
    "var(--purchase-order-action-width)",
].join(" "));

const purchaseOrderTableMinimumWidth = getErpTableMinimumWidth(
    purchaseOrderColumns,
    [],
    ["var(--purchase-order-action-width)"],
);

const purchaseOrderColumnPositions = new Map(
    purchaseOrderColumns.map((column, index) => [column.key, index + 1]),
);

const purchaseOrderCellStyle = (key: PurchaseOrderColumnKey, row?: number) => ({
    gridColumn: purchaseOrderColumnPositions.get(key),
    gridRow: row ? String(row) : "1 / -1",
});

const visiblePurchaseOrders = computed(() => purchaseOrders.value);
const isCurrentPageSelected = computed(() =>
    visiblePurchaseOrders.value.length > 0 &&
    visiblePurchaseOrders.value.every((order) => selectedOrderIds.value.includes(order.id)),
);
const hasPendingFilters = computed(() =>
    searchText.value.trim() !== appliedSearchText.value ||
    supplierFilter.value.trim() !== appliedSupplierFilter.value,
);

const formatMaybeDate = (value: unknown) => {
    if (!value) return "";
    return typeof value === "string" ? value : "";
};

const normalizePurchaseOrder = (order: PurchaseOrderEntity): PurchaseOrder => {
    const inboundReceived = Number(order.inboundReceived || 0);
    const progressByProduct = new Map(
        (order.inboundProgress?.items || []).map((item) => [String(item.productId), item]),
    );
    const productItems: PurchaseOrderItem[] = order.items?.length
        ? order.items
        : [{ productId: "", quantity: 0 }];
    const items: PurchaseOrderProductRow[] = productItems.map((item) => {
        const productId = String(item.productId || "");
        const productCode = item.productCode?.trim() || "";
        const productModel = item.productModel?.trim() || "";
        const waybills = (order.waybills || []).filter((waybill) => {
            // 历史运单未指定产品时，沿用物流服务的整单关联规则。
            if (!waybill.productIds?.length) return true;
            return waybill.productIds.some((id) => String(id) === productId);
        });

        return {
            productId,
            productName: item.productName?.trim() || productModel || productCode || "--",
            productCode,
            productModel,
            quantity: Number(item.quantity || 0),
            unitName: item.unitName || "",
            receivedQuantity: Number(progressByProduct.get(productId)?.receivedQuantity || 0),
            waybills,
        };
    });

    return {
        purchaseChannel: order.purchaseChannel,
        id: order.id || order._id || "",
        orderNo: order.orderNo || "",
        items,
        remark: order.remark || "--",
        purchaseDate: formatMaybeDate(order.purchaseDate),
        inboundReceived,
    };
};

const loadPurchaseOrderDetail = async () => {
    const id = detailOrderId.value;
    if (!id) return;

    const requestVersion = ++detailRequestVersion;
    selectedOrderDetail.value = null;
    detailLoading.value = true;
    detailError.value = "";

    try {
        const response = await getPurchaseOrderDetail({ id });
        if (requestVersion !== detailRequestVersion) return;
        if (response.code !== 200 || !response.data) {
            throw new Error(response.msg || "获取采购单详情失败");
        }
        selectedOrderDetail.value = response.data;
    } catch (error: any) {
        if (requestVersion !== detailRequestVersion) return;
        detailError.value = error?.data?.msg || error?.message || "获取采购单详情失败";
    } finally {
        if (requestVersion === detailRequestVersion) {
            detailLoading.value = false;
        }
    }
};

const openPurchaseOrderDetail = (order: PurchaseOrder) => {
    detailOrderId.value = order.id;
    void loadPurchaseOrderDetail();
};

const closePurchaseOrderDetail = () => {
    detailRequestVersion += 1;
    detailOrderId.value = "";
    selectedOrderDetail.value = null;
    detailLoading.value = false;
    detailError.value = "";
};

let pendingLogisticsRefresh = false;
const loadPurchaseOrders = async () => {
    if (isLoading.value) {
        return;
    }

    isLoading.value = true;
    try {
        const res = await retrievePurchaseOrders({
            orderNo: locatedOrderNo.value || undefined,
            keyword: locatedOrderNo.value ? undefined : appliedSearchText.value || undefined,
            supplierName: appliedSupplierFilter.value || undefined,
            page: currentPage.value,
            limit: pageSize.value,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取采购单列表失败");
            purchaseOrders.value = [];
            totalPurchaseOrders.value = 0;
            setTotalItems(0);
            return;
        }

        purchaseOrders.value = Array.isArray(res.data?.list)
            ? res.data.list.map((item) => normalizePurchaseOrder(item))
            : [];
        totalPurchaseOrders.value = res.data?.pagination?.total || 0;
        setTotalItems(totalPurchaseOrders.value);
        selectedOrderIds.value = selectedOrderIds.value.filter((id) =>
            purchaseOrders.value.some((order) => order.id === id),
        );
        if (highlightedOrderId.value && !locationNoticeShown.value) {
            const located = purchaseOrders.value.some((order) => order.id === highlightedOrderId.value);
            if (located) {
                ElMessage.success(`已定位采购单 ${locatedOrderNo.value}`);
            } else {
                ElMessage.error(`未查询到刚生成的采购单 ${locatedOrderNo.value}`);
            }
            locationNoticeShown.value = true;
        }
    } catch (err: any) {
        purchaseOrders.value = [];
        totalPurchaseOrders.value = 0;
        setTotalItems(0);
        ElMessage.error(err?.data?.msg || err?.message || "获取采购单列表失败");
    } finally {
        isLoading.value = false;
        if (pendingLogisticsRefresh) {
            pendingLogisticsRefresh = false;
            void loadPurchaseOrders();
        }
    }
};

const handleLogisticsTrackingUpdated = async () => {
    if (isLoading.value) {
        pendingLogisticsRefresh = true;
        return;
    }
    await loadPurchaseOrders();
};

const applyFilters = async () => {
    locatedOrderNo.value = "";
    highlightedOrderId.value = "";
    locationNoticeShown.value = true;
    const remainingQuery = { ...route.query };
    delete remainingQuery.createdOrderId;
    delete remainingQuery.orderNo;
    await router.replace({ path: route.path, query: remainingQuery });
    appliedSearchText.value = searchText.value.trim();
    appliedSupplierFilter.value = supplierFilter.value.trim();
    goToPage(1);
    await loadPurchaseOrders();
};

const resetFilters = async () => {
    searchText.value = "";
    supplierFilter.value = "";
    await applyFilters();
};

const toggleCurrentPageSelection = (event: Event) => {
    const checked = (event.target as HTMLInputElement).checked;
    const visibleIds = visiblePurchaseOrders.value.map((order) => order.id);

    selectedOrderIds.value = checked
        ? Array.from(new Set([...selectedOrderIds.value, ...visibleIds]))
        : selectedOrderIds.value.filter((id) => !visibleIds.includes(id));
};

const closeCreateOrderDialog = () => {
    showCreateOrderDialog.value = false;
    editingPurchaseOrderId.value = "";
    editingPurchaseOrder.value = null;
    prefillPurchaseOrderDraft.value = null;
};

const openCreateOrderWithDraft = (draft: PurchaseOrderDialogDraft) => {
    if (draft.source === "material-pool") {
        prefillPurchaseOrderDraft.value = draft;
        editingRequestOrder.value = null;
        requestOrderSubmitting.value = false;
        showRequestOrderDialog.value = true;
        return;
    }
    purchaseOrderDialogMode.value = "create";
    editingPurchaseOrderId.value = "";
    editingPurchaseOrder.value = null;
    prefillPurchaseOrderDraft.value = draft;
    nextPurchaseOrderNo.value = "后端自动生成";
    showCreateOrderDialog.value = true;
};

const consumePurchaseOrderPrefillDraft = () => {
    if (!import.meta.client) return;

    const raw = sessionStorage.getItem("purchase-order-prefill-draft");
    if (!raw) return;

    sessionStorage.removeItem("purchase-order-prefill-draft");
    try {
        const parsed = JSON.parse(raw);
        if (parsed?.source === "material-pool" && (parsed.productId || parsed.items?.length)) {
            openCreateOrderWithDraft(parsed as PurchaseOrderDialogDraft);
        }
    } catch {
        ElMessage.warning("采购单预填数据无效");
    }
};

const buildCreatePayload = (payload: PurchaseOrderDialogSubmitPayload): PurchaseOrderMutationPayload => {
    const { form } = payload;

    return {
        ...(form.purchaseChannel ? {
            purchaseChannel: form.purchaseChannel,
            platformOrderNos: form.purchaseChannel === "taobao" ? form.platformOrderNos : [],
        } : {}),
        supplierId: form.supplierId,
        buyer: form.buyer,
        purchaseDate: form.purchaseDate,
        remark: form.remark,
        items: payload.items?.length
            ? payload.items.map((item) => ({
                productId: item.productId,
                quantity: Number(item.quantity),
                unitPrice: item.unitPrice,
                remark: item.remark,
                unitId: item.unitId,
                supplierId: item.supplierId,
                supplierIds: item.supplierIds,
            }))
            : [{
                productId: form.productId,
                quantity: form.purchaseQuantity,
                unitId: form.unitId,
                unitPrice: form.unitPrice,
                remark: form.productRemark,
            }],
        allocations: payload.items?.length
            ? payload.items.flatMap((item) => (item.allocations || []).map((allocation) => ({
                requirementId: allocation.requirementId,
                allocatedQuantity: Number(allocation.allocatedQuantity || 0),
                productId: item.productId,
            })))
            : payload.relatedOrders.map((order) => ({
                requirementId: order.requirementId || order.id,
                allocatedQuantity: Number(order.allocatedQuantity || 0),
            })),
        waybills: payload.waybills.map((waybill) => ({
            source: waybill.source,
            trackingNo: waybill.trackingNo,
            courierCompany: waybill.courierCompany,
            remark: waybill.remark,
        })),
    };
};

const confirmCreateOrder = async (payload: PurchaseOrderDialogSubmitPayload) => {
    if (!canManagePurchaseOrder.value) {
        ElMessage.warning("您没有新增或编辑采购单的权限");
        return;
    }
    if (purchaseOrderDialogMode.value === "edit" && !canEditPurchaseOrder.value) {
        ElMessage.warning("您没有编辑采购单的权限");
        return;
    }

    try {
        const body = buildCreatePayload(payload);
        const res = purchaseOrderDialogMode.value === "edit" && editingPurchaseOrderId.value
            ? await updatePurchaseOrder({
                ...body,
                id: editingPurchaseOrderId.value,
            })
            : await addPurchaseOrder(body);

        if (res.code !== 200) {
            ElMessage.error(res.msg || (purchaseOrderDialogMode.value === "edit" ? "编辑采购单失败" : "新建采购单失败"));
            return;
        }

        closeCreateOrderDialog();
        goToPage(1);
        await loadPurchaseOrders();
        ElMessage.success(purchaseOrderDialogMode.value === "edit" ? "编辑采购单成功" : "新建采购单成功");
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || (purchaseOrderDialogMode.value === "edit" ? "编辑采购单失败" : "新建采购单失败"));
    }
};

const syncTaobaoWaybills = async (order: PurchaseOrder) => {
    if (!canManagePurchaseOrder.value || syncingTaobaoId.value) return;
    syncingTaobaoId.value = order.id;
    try {
        const response = await syncTaobaoPurchaseWaybills(order.id);
        if (response.code !== 200) throw new Error(response.msg || "同步失败");
        await loadPurchaseOrders();
        const detail = response.data?.detail;
        if (detail?.taobaoSyncStatus === "matched") ElMessage.success("淘宝运单同步完成");
        else ElMessage.warning(detail?.taobaoSyncMessage || "暂无新运单，可稍后重试");
    } catch (error: any) {
        ElMessage.error(error?.data?.msg || error?.message || "同步失败");
    } finally {
        syncingTaobaoId.value = "";
    }
};

const openLogisticsTracking = async (order: PurchaseOrder) => {
    try {
        const response = await getPurchaseOrderDetail({ id: order.id });
        if (response.code !== 200) throw new Error(response.msg || "获取采购单失败");
        const waybills = response.data?.waybills || [];
        if (!waybills.length) { ElMessage.warning("暂无运单，请先填写或同步运单"); return; }
        trackingTarget.value = { id: order.id, waybills };
    } catch (error: any) {
        ElMessage.error(error?.data?.msg || error?.message || "获取采购单失败");
    }
};

const editOrder = async (order: PurchaseOrder) => {
    if (!canEditPurchaseOrder.value) {
        ElMessage.warning("您没有编辑采购单的权限");
        return;
    }

    if (order.inboundReceived > 0) {
        ElMessage.warning("已有入库进度的采购单不可编辑");
        return;
    }

    try {
        const res = await getPurchaseOrderDetail({ id: order.id });
        if (res.code !== 200 || !res.data) {
            ElMessage.error(res.msg || "获取采购单详情失败");
            return;
        }

        if (res.data.creationSource === "purchase-request") {
            editingRequestOrder.value = res.data;
            showRequestOrderDialog.value = true;
            return;
        }

        purchaseOrderDialogMode.value = "edit";
        editingPurchaseOrderId.value = order.id;
        editingPurchaseOrder.value = res.data;
        nextPurchaseOrderNo.value = res.data.orderNo || order.orderNo;
        showCreateOrderDialog.value = true;
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "获取采购单详情失败");
    }
};

const closeRequestOrderDialog = () => {
    showRequestOrderDialog.value = false;
    editingRequestOrder.value = null;
    if (prefillPurchaseOrderDraft.value?.source === "material-pool") {
        prefillPurchaseOrderDraft.value = null;
    }
};

const confirmCreateRequestStyleOrder = async (payload: PurchaseOrderMutationPayload) => {
    if (!canManagePurchaseOrder.value || requestOrderSubmitting.value) return;
    requestOrderSubmitting.value = true;
    try {
        const response = await addPurchaseOrder(payload);
        if (response.code !== 200) throw new Error(response.msg || "生成采购单失败");
        prefillPurchaseOrderDraft.value = null;
        await loadPurchaseOrders();
        ElMessage.success("采购单生成成功");
    } catch (error: any) {
        ElMessage.error(error?.data?.msg || error?.message || "生成采购单失败");
    } finally {
        requestOrderSubmitting.value = false;
    }
};

const confirmRequestOrderUpdate = async (payload: PurchaseOrderMutationPayload) => {
    if (!canEditPurchaseOrder.value) {
        ElMessage.warning("您没有编辑采购单的权限");
        return;
    }
    const id = editingRequestOrder.value?.id || editingRequestOrder.value?._id || "";
    if (!id || requestOrderSubmitting.value) return;
    requestOrderSubmitting.value = true;
    try {
        const response = await updatePurchaseOrder({ ...payload, id });
        if (response.code !== 200) throw new Error(response.msg || "编辑采购单失败");
        closeRequestOrderDialog();
        await loadPurchaseOrders();
        ElMessage.success("编辑采购单成功");
    } catch (error: any) {
        ElMessage.error(error?.data?.msg || error?.message || "编辑采购单失败");
    } finally {
        requestOrderSubmitting.value = false;
    }
};

const showInboundProgress = (order: PurchaseOrder, item: PurchaseOrderProductRow) => {
    ElMessage.info(`${order.orderNo} ${item.productName} 已入库 ${item.receivedQuantity}/${item.quantity} ${item.unitName}`.trim());
};

const confirmHtmlEscapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
};

const escapeConfirmHtml = (value: string) =>
    value.replace(/[&<>"']/g, (char) => confirmHtmlEscapeMap[char] || char);

const getDeleteInboundNos = (order: PurchaseOrderEntity | null) => {
    const records = order?.inboundProgress?.records || [];
    return Array.from(new Set(
        records
            .map((record) => record.inboundNo || record._id || "")
            .filter(Boolean),
    ));
};

const buildDeleteConfirmMessage = (orderNo: string, inboundNos: string[]) => {
    const safeOrderNo = escapeConfirmHtml(orderNo);
    const inboundContent = inboundNos.length
        ? `<div class="purchase-order-delete-inbound-list">${
            inboundNos
                .map((inboundNo) =>
                    `<span class="purchase-order-delete-inbound-no">${escapeConfirmHtml(inboundNo)}</span>`,
                )
                .join("")
        }</div>`
        : `<div class="purchase-order-delete-empty">暂无关联入库单需要同步删除</div>`;

    return `
        <div class="purchase-order-delete-message">
            <p class="purchase-order-delete-title">是否确认删除采购单 <span>${safeOrderNo}</span>？</p>
            <div class="purchase-order-delete-sync">
                <p>入库单将同步删除：</p>
                ${inboundContent}
            </div>
        </div>
    `;
};

const deleteOrder = async (order: PurchaseOrder) => {
    let inboundNos: string[] = [];
    try {
        const detailRes = await getPurchaseOrderDetail({ id: order.id });
        if (detailRes.code !== 200 || !detailRes.data) {
            ElMessage.error(detailRes.msg || "获取采购单详情失败");
            return;
        }
        inboundNos = getDeleteInboundNos(detailRes.data);
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "获取采购单详情失败");
        return;
    }

    try {
        await erpMessageBox.confirm(buildDeleteConfirmMessage(order.orderNo, inboundNos), "删除采购单", {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning",
            dangerouslyUseHTMLString: true,
            customClass: "purchase-order-delete-confirm",
        });
    } catch {
        return;
    }

    try {
        const res = await deletePurchaseOrder({ id: order.id });
        if (res.code !== 200) {
            ElMessage.error(res.msg || "删除采购单失败");
            return;
        }

        selectedOrderIds.value = selectedOrderIds.value.filter((id) => id !== order.id);
        await loadPurchaseOrders();
        ElMessage.success("删除采购单成功");
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "删除采购单失败");
    }
};

const batchDeletePurchaseOrders = async () => {
    const ids = selectedOrderIds.value.filter(Boolean);

    if (!ids.length) {
        ElMessage.warning("请先选择需要删除的采购单");
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除选中的 ${ids.length} 个采购单？`, "批量删除采购单", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    try {
        const res = await deletePurchaseOrder({ ids });
        if (res.code !== 200) {
            ElMessage.error(res.msg || "批量删除采购单失败");
            return;
        }

        selectedOrderIds.value = [];
        await loadPurchaseOrders();
        ElMessage.success("批量删除采购单成功");
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "批量删除采购单失败");
    }
};

const goToPurchasePage = (page: number) => {
    goToPage(page);
    void loadPurchaseOrders();
};

const jumpToPurchaseInputPage = () => {
    jumpToInputPage();
    void loadPurchaseOrders();
};

watch(pageSize, () => {
    void loadPurchaseOrders();
});

onMounted(() => {
    void loadPurchaseOrders();
    consumePurchaseOrderPrefillDraft();
});

onBeforeUnmount(closePurchaseOrderDetail);
</script>

<style scoped>
.purchase-order-page {
    --purchase-order-action-width: 300px;

    height: 100%;
    display: grid;
    grid-template-rows: 40px 84px 32px minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
}

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

.filter-row {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--erp-spacing-12);
}

.filter-field {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
}

.filter-input {
    width: 200px;
    height: var(--erp-size-control-height-sm);
    min-width: 0;
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
}

.filter-actions {
    gap: 12px;
}

.toolbar-left {
    gap: var(--erp-spacing-12);
}

.primary-button {
    border: 0;
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
    cursor: pointer;
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

.outline-button {
    border: 1px solid var(--erp-color-border-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
}

.outline-button:disabled {
    color: var(--erp-color-text-disabled);
    cursor: not-allowed;
    opacity: 0.62;
}

.muted-button {
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-white);
    background: var(--erp-color-neutral-400);
}

.muted-button.active {
    background: var(--erp-color-action-primary);
}

.button-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.table-wrap {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}

.order-no-head,
.order-number-cell {
    position: sticky;
    left: 0;
    z-index: 5;
}

.purchase-order-page .order-no-head,
.purchase-order-page .order-number-cell {
    justify-content: flex-start;
    gap: 12px;
}

.order-no-head {
    height: 48px;
    background: var(--erp-color-fill-table-header);
}

.order-number-cell {
    background: var(--erp-color-fill-default);
}

.order-identity {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.order-identity span {
    overflow: hidden;
    text-overflow: ellipsis;
}

.action-head,
.action-row {
    position: sticky;
    right: 0;
    z-index: 5;
}

.table-row {
    width: 100%;
    min-width: 0;
    display: grid;
    grid-template-columns: var(--erp-table-columns);
    align-items: center;
    padding-right: 0;
}

.table-head {
    height: 48px;
    border-radius: 0;
    background: var(--erp-color-fill-table-header);
    position: sticky;
    top: 0;
    z-index: 10;
}

.data-row {
    margin-top: 0;
    border-radius: 0;
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
}

.purchase-order-page .purchase-order-group {
    height: auto;
    min-height: 76px;
    align-items: stretch;
}

.action-head,
.action-row {
    display: flex;
    align-items: center;
    justify-content: center;
}

.action-head {
    height: 48px;
    border-radius: 0;
    background: var(--erp-color-fill-table-header);
}

.purchase-order-group .action-row {
    height: auto;
    grid-row: 1 / -1;
    align-self: stretch;
    align-items: flex-start;
    justify-content: flex-start;
    padding: 18px var(--erp-spacing-20);
    box-sizing: border-box;
    border-radius: 0;
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
}

.action-row {
    grid-column: -2 / -1;
}

.data-row:hover,
.data-row:hover .order-number-cell,
.data-row:hover .action-row {
    background: var(--erp-color-fill-hover);
}

.data-row.created-order-highlight,
.data-row.created-order-highlight .order-number-cell,
.data-row.created-order-highlight .action-row {
    background: #e8f7ff;
    box-shadow: inset 0 1px 0 #8bd2f5, inset 0 -1px 0 #8bd2f5;
}

.table-cell {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--erp-spacing-20);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.purchase-order-page .table-head > .table-cell,
.purchase-order-page .table-head > .action-head {
    justify-content: flex-start;
    padding: 0 var(--erp-spacing-20);
    text-align: left;
}

.purchase-order-group .order-cell {
    align-items: flex-start;
    padding-top: 18px;
    padding-bottom: 18px;
}

.purchase-order-group .remark-cell {
    justify-content: flex-start;
    white-space: normal;
    overflow-wrap: anywhere;
}

.purchase-order-group .product-row-cell {
    min-height: 76px;
    align-self: stretch;
    padding-top: 12px;
    padding-bottom: 12px;
    box-sizing: border-box;
}

.purchase-order-group .inbound-progress-cell {
    justify-content: flex-start;
    text-align: left;
}

.action-row .link-button {
    padding: 0;
}

.product-row-divider {
    border-top: 1px solid var(--erp-color-border-muted);
}

.purchase-order-group .product-cell {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
}

.product-cell strong,
.product-cell span {
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
}

.product-secondary {
    color: var(--erp-color-text-secondary-strong);
    font-size: 12px;
    line-height: 18px;
}

.waybill-list {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.waybill-entry {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    padding: 6px 0;
}

.waybill-entry strong,
.waybill-entry span {
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
}

.waybill-entry + .waybill-entry {
    border-top: 1px dashed var(--erp-color-border-muted);
    box-sizing: border-box;
}

.row-checkbox {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    accent-color: var(--erp-color-action-primary);
    cursor: pointer;
}

.progress-button {
    padding: 0;
    border: 0;
    color: var(--erp-color-text-primary);
    background: transparent;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
}

.progress-button:hover {
    color: var(--erp-color-text-brand);
}

.link-button {
    border: 0;
    color: var(--erp-color-text-brand);
    background: transparent;
    cursor: pointer;
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
    color: var(--erp-color-icon-brand);
}

.icon-button.delete {
    color: var(--erp-color-icon-error);
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
    opacity: 1;
}

:deep(.erp-table-frame) {
    height: 100%;
}

:global(.purchase-order-delete-confirm .el-message-box__message) {
    color: var(--erp-color-text-primary);
    font-size: 14px;
}

:global(.purchase-order-delete-message) {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

:global(.purchase-order-delete-title) {
    margin: 0;
    color: var(--erp-color-text-primary);
    font-size: 16px;
    line-height: 24px;
}

:global(.purchase-order-delete-title span) {
    color: var(--erp-color-text-brand);
    font-weight: 600;
}

:global(.purchase-order-delete-sync) {
    padding: 10px 12px;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-fill-control-secondary);
}

:global(.purchase-order-delete-sync p) {
    margin: 0 0 8px;
    color: var(--erp-color-text-primary);
    font-size: 14px;
    line-height: 20px;
}

:global(.purchase-order-delete-inbound-list) {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    max-height: 96px;
    overflow: auto;
}

:global(.purchase-order-delete-inbound-no) {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 2px 8px;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-status-error);
    background: var(--erp-color-fill-default);
    font-size: 14px;
    line-height: 20px;
    word-break: break-all;
}

:global(.purchase-order-delete-empty) {
    color: var(--erp-color-text-tertiary);
    font-size: 14px;
    line-height: 20px;
}

</style>
