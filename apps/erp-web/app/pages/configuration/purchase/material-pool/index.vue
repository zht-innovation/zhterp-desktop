<template>
    <div class="material-pool-page" :class="{ 'detail-mode': selectedMaterialDetail }">
        <template v-if="selectedMaterialDetail">
            <div class="material-detail-page">
                <header class="detail-topbar">
                    <button class="detail-back-button" type="button" @click="backToMaterialList">
                        <Icon name="lucide:arrow-left" class="detail-back-icon" />
                        <span>返回</span>
                    </button>
                    <span class="detail-breadcrumb-divider">|</span>
                    <span class="detail-breadcrumb-parent">待采购物料池</span>
                    <Icon name="lucide:chevron-right" class="detail-breadcrumb-icon" />
                    <span class="detail-breadcrumb-current">{{ selectedMaterialDetail.materialCode }}</span>
                </header>

                <section class="detail-card material-basic-card">
                    <div class="material-basic-title">
                        <h1>{{ selectedMaterialDetail.materialModel }}</h1>
                        <span class="material-type-tag">{{ selectedMaterialDetail.materialType }}</span>
                    </div>

                    <div class="material-basic-grid">
                        <div
                            v-for="item in materialBasicInfo"
                            :key="item.label"
                            class="material-basic-item"
                        >
                            <span>{{ item.label }}</span>
                            <strong>{{ item.value }}</strong>
                        </div>
                    </div>
                </section>

                <section class="detail-summary-grid" aria-label="采购汇总">
                    <article class="summary-card danger">
                        <div class="summary-card-content">
                            <span class="summary-label">汇总缺口数量</span>
                            <strong class="summary-value">{{ selectedMaterialDetail.shortageQuantity }}</strong>
                            <span class="summary-meta">{{ selectedMaterialDetail.unit }}</span>
                        </div>
                        <Icon name="lucide:circle-alert" class="summary-alert-icon" />
                    </article>

                    <article class="summary-card">
                        <span class="summary-label">需求来源数量</span>
                        <strong class="summary-value">{{ selectedMaterialDetail.sources.length }}</strong>
                        <span class="summary-meta">个业务单据</span>
                    </article>

                    <article v-if="canViewPrice" class="summary-card">
                        <span class="summary-label">预估采购金额</span>
                        <strong class="summary-value blue">{{ formatMoney(estimatedPurchaseAmount) }}</strong>
                        <span class="summary-meta">= 单价 × 缺口数</span>
                    </article>
                </section>

                <section class="detail-card" aria-label="需求来源明细">
                    <h2 class="detail-section-title">需求来源明细</h2>
                    <ErpTableFrame
                        class="detail-source-table"
                        :columns="detailSourceTableColumnTemplate"
                        :minimum-width="detailSourceTableMinimumWidth"
                        :empty="selectedMaterialDetail.sources.length === 0"
                        empty-text="暂无需求来源"
                        embedded
                        scroll-x
                    >
                        <template #header>
                            <div class="table-row detail-source-row detail-source-head">
                                <div
                                    v-for="column in detailSourceColumns"
                                    :key="column.key"
                                    class="table-cell detail-source-cell"
                                >
                                    {{ column.label }}
                                </div>
                            </div>
                        </template>
                        <div
                            v-for="source in selectedMaterialDetail.sources"
                            :key="source.id"
                            class="table-row detail-source-row"
                        >
                            <div class="table-cell detail-source-cell">
                                <button class="source-order-link erp-selectable-text" type="button">
                                    {{ source.orderNo }}
                                </button>
                            </div>
                            <div class="table-cell detail-source-cell">
                                <span class="source-type-pill">{{ source.orderType }}</span>
                            </div>
                            <strong class="table-cell detail-source-cell">
                                {{ source.requiredQuantity }} {{ selectedMaterialDetail.unit }}
                            </strong>
                            <span class="table-cell detail-source-cell">{{ formatDate(source.deliveryDate) }}</span>
                            <span class="table-cell detail-source-cell">{{ source.remainingDays == null ? "--" : `${source.remainingDays} 天` }}</span>
                            <span class="table-cell detail-source-cell detail-long-cell" :title="source.orderRemark">
                                {{ source.orderRemark || "--" }}
                            </span>
                            <span class="table-cell detail-source-cell detail-long-cell" :title="source.sampleRequirement">
                                {{ source.sampleRequirement || "--" }}
                            </span>
                            <div class="table-cell detail-source-cell source-order-images">
                                <button
                                    v-if="getSourceOrderThumbnailUrl(source)"
                                    class="source-image-button"
                                    type="button"
                                    @click="openSourceOrderImages(source)"
                                >
                                    <img
                                        :src="getSourceOrderThumbnailUrl(source)"
                                        :alt="`${source.orderNo || '订单'}图片`"
                                    >
                                    <span v-if="getSourceOrderImageCount(source) > 1">
                                        {{ getSourceOrderImageCount(source) }} 张
                                    </span>
                                </button>
                                <span v-else>--</span>
                            </div>
                        </div>
                    </ErpTableFrame>
                </section>

                <section class="detail-card" aria-label="当前库存状况">
                    <h2 class="detail-section-title">当前库存状况</h2>
                    <div class="inventory-status-grid">
                        <article
                            v-for="item in inventoryStatusCards"
                            :key="item.label"
                            class="inventory-status-card"
                            :class="{ danger: item.danger, blue: item.blue, orange: item.orange }"
                        >
                            <span>{{ item.label }}</span>
                            <strong>{{ item.value }}</strong>
                            <small>{{ item.meta }}</small>
                        </article>
                    </div>
                </section>

                <section class="detail-card purchase-history-card" aria-label="近期采购历史">
                    <h2 class="detail-section-title">近期采购历史</h2>
                    <div
                        v-if="selectedMaterialDetail.purchaseHistory.length > 0"
                        class="purchase-history-list"
                    >
                        <article
                            v-for="history in selectedMaterialDetail.purchaseHistory"
                            :key="history.id"
                            class="purchase-history-item"
                        >
                            <div class="purchase-history-main">
                                <span class="history-order">{{ history.orderNo }}</span>
                                <span>{{ formatDate(history.purchaseDate) }}</span>
                                <span>采购记录</span>
                            </div>
                            <div class="purchase-history-meta">
                                <span>数量：<strong>{{ history.quantity }} {{ selectedMaterialDetail.unit }}</strong></span>
                                <span v-if="canViewPrice">单价：<strong>{{ formatMoney(history.unitPrice, 3) }}</strong></span>
                                <span class="history-status">{{ history.status }}</span>
                            </div>
                        </article>
                    </div>
                    <div v-else class="detail-empty-state">暂无近期采购记录</div>
                    <div class="purchase-history-total">
                        共 {{ selectedMaterialDetail.purchaseHistory.length }} 条采购记录
                    </div>
                </section>
            </div>
        </template>

        <template v-else>
        <header class="topbar">
            <ErpBreadcrumb icon="lucide:package-search" :items="materialPoolBreadcrumbItems" />
            <ErpSearchBox
                v-model="searchText"
                :disabled="isLoading"
                placeholder="搜索物料编码或型号"
                @search="applyFilters"
            />
        </header>

        <div class="view-row">
            <div class="view-tabs" role="tablist" aria-label="待采购物料视图">
                <button
                    v-for="tab in viewTabs"
                    :key="tab.key"
                    class="view-tab"
                    :class="{ active: activeView === tab.key }"
                    type="button"
                    role="tab"
                    :aria-selected="activeView === tab.key"
                    @click="switchView(tab.key)"
                >
                    <Icon :name="tab.icon" class="view-tab-icon" />
                    <span>{{ tab.label }}</span>
                </button>
            </div>

            <button v-if="canManagePurchaseOrder" class="primary-button" type="button" @click="mergeSelectedMaterials">
                <Icon name="lucide:shopping-cart" class="button-icon" />
                <span>合并生成采购单</span>
            </button>
        </div>

        <div class="filter-row">
            <label class="filter-field">
                <span>物料名称</span>
                <input
                    v-model="materialNameFilter"
                    class="filter-input"
                    type="text"
                    placeholder="物料编码或名称"
                    aria-label="物料名称"
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

        <section class="table-wrap" aria-label="待采购物料列表">
            <ErpTableFrame
                :columns="materialTableColumnTemplate"
                :minimum-width="materialTableMinimumWidth"
                :loading="isLoading"
                :empty="Boolean(loadError) || visibleMaterials.length === 0"
                loading-text="加载中..."
                scroll-x
            >
                <template #header>
                <div
                    class="table-row table-head"
                >
                    <div class="selection-head checkbox-cell material-pool-selection-cell">
                        <input
                            class="row-checkbox"
                            type="checkbox"
                            aria-label="全选当前页待采购物料"
                            :checked="isCurrentPageSelected"
                            :disabled="isLoading"
                            @change="toggleCurrentPageSelection"
                        >
                    </div>
                    <div
                        v-for="column in materialColumns"
                        :key="column.key"
                        class="table-cell"
                    >
                        {{ column.label }}
                    </div>
                    <div class="action-head erp-table-fixed-end">操作</div>
                </div>
                </template>

                <template v-for="material in visibleMaterials" :key="material.id">
                    <div
                        class="table-row data-row"
                    >
                        <div class="selection-row checkbox-cell material-pool-selection-cell">
                            <input
                                v-model="selectedMaterialIds"
                                class="row-checkbox"
                                type="checkbox"
                                :value="material.id"
                                :aria-label="'选择待采购物料' + material.materialCode"
                                :disabled="isLoading"
                            >
                        </div>
                        <div class="table-cell">{{ material.materialCode }}</div>
                        <div class="table-cell">{{ material.materialModel }}</div>
                        <div class="table-cell shortage-cell">
                            <span>{{ material.shortageQuantity }}</span>
                            <span class="unit">{{ material.unit }}</span>
                        </div>
                        <div class="table-cell">
                            <button
                                class="source-toggle"
                                type="button"
                                :aria-expanded="isExpanded(material.id)"
                                @click="toggleMaterialExpansion(material.id)"
                            >
                                <span>包含{{ material.sources.length }}个</span>
                                <Icon
                                    :name="isExpanded(material.id) ? 'lucide:chevron-up' : 'lucide:chevron-down'"
                                    class="source-icon"
                                />
                            </button>
                        </div>
                        <div class="action-row actions-cell erp-table-fixed-end">
                            <button class="link-button" type="button" @click="viewMaterialDetail(material)">
                                查看详情
                            </button>
                        </div>
                    </div>

                    <Transition name="source-collapse">
                        <div
                            v-if="isExpanded(material.id)"
                            class="source-list"
                            :style="{ marginLeft: 'var(--material-pool-selection-width)' }"
                        >
                            <div
                                v-for="source in material.sources"
                                :key="source.id"
                                class="source-card"
                            >
                                <div class="source-main">
                                    <span class="source-order">{{ source.orderNo }}</span>
                                    <span>{{ source.orderType }}</span>
                                    <span>·</span>
                                    <span>{{ source.salesperson }}</span>
                                </div>
                                <div class="source-quantity">
                                    <span>需求数量：</span>
                                    <strong>{{ source.requiredQuantity }}</strong>
                                    <span>{{ material.unit }}</span>
                                </div>
                            </div>
                        </div>
                    </Transition>
                </template>

                <template #empty>
                    {{ loadError || "暂无匹配待采购物料" }}
                </template>
            </ErpTableFrame>
        </section>

        <InventoryPagination
            v-model:page-size="pageSize"
            v-model:jump-page-input="jumpPageInput"
            :total="totalMaterials"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="goToPage"
            @jump="jumpToInputPage"
        />
        </template>

        <ImagePreviewDialog
            v-model="showImagePreview"
            :title="previewTitle"
            :images="previewImages"
            :z-index="5200"
        />
    </div>
</template>

<script setup lang="ts">
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import {
    getPurchaseMaterialPoolDetail,
    retrievePurchaseMaterialPool,
} from "~/composables/api/usePurchaseMaterialPoolApi";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import {
    getErpTableGridColumn,
    getErpTableMinimumWidth,
} from "~/utils/inventory/erpTableColumns";
import type { PurchaseMaterialPoolItem } from "~~/shared/types/purchase";
import {
    canManagePurchaseOrder as canManagePurchaseOrderByRole,
    canViewPurchasePrice,
} from "~~/shared/utils/adminPermission";
import {
    getAttachmentPath,
    type AttachmentPreviewSource,
} from "~/utils/attachmentPreview";

definePageMeta({
    layout: "purchase",
});

type MaterialPoolView = "material" | "order";
type MaterialColumnKey = "materialCode" | "materialModel" | "shortageQuantity" | "sourceCount";
type DetailSourceColumnKey =
    | "orderNo"
    | "orderType"
    | "requiredQuantity"
    | "deliveryDate"
    | "remainingDays"
    | "orderRemark"
    | "sampleRequirement"
    | "orderImages";

interface ViewTab {
    key: MaterialPoolView;
    label: string;
    icon: string;
}

interface MaterialColumn {
    key: MaterialColumnKey;
    label: string;
    width: number;
    grow?: boolean;
}

interface DetailSourceColumn {
    key: DetailSourceColumnKey;
    label: string;
    width: number;
    grow?: boolean;
}

interface RequirementSource {
    id: string;
    sourceType: "sales-order" | "purchase-request";
    requirementId?: string;
    purchaseRequestId?: string;
    purchaseRequestNo?: string;
    purchaseRequestItemIndex?: number;
    salesOrderNo: string;
    orderNo: string;
    orderType: string;
    salesperson: string;
    orderRemark: string;
    orderImages: Array<string | Record<string, unknown>>;
    sampleRequirement: string;
    requiredQuantity: number;
    remainingPurchaseQuantity: number;
    deliveryDate: string | Date | null;
    remainingDays: number | null;
}

interface MaterialInventoryStatus {
    availableQuantity: number;
    inTransitQuantity: number;
    reservedQuantity: number;
    safetyStock: number;
}

interface PurchaseHistory {
    id: string;
    orderNo: string;
    purchaseDate: string | Date | null;
    supplierName: string;
    quantity: number;
    unitPrice?: number;
    status: string;
}

interface PurchaseMaterial {
    id: string;
    productId: string;
    unitId: string;
    materialCode: string;
    materialName: string;
    materialModel: string;
    materialType: string;
    shortageQuantity: number;
    unit: string;
    suggestedSupplierId: string;
    suggestedSupplier: string;
    estimatedUnitPrice?: number;
    inventory: MaterialInventoryStatus;
    purchaseHistory: PurchaseHistory[];
    sources: RequirementSource[];
}

const viewTabs: ViewTab[] = [
    { key: "material", label: "按物料需求汇总", icon: "lucide:layers" },
    { key: "order", label: "按业务单据查看", icon: "lucide:clipboard-list" },
];

const materialColumns: MaterialColumn[] = [
    { key: "materialCode", label: "物料编码", width: 260, grow: true },
    { key: "materialModel", label: "物料型号", width: 260, grow: true },
    { key: "shortageQuantity", label: "缺口数量", width: 180 },
    { key: "sourceCount", label: "需求来源", width: 200, grow: true },
];

const detailSourceColumns: DetailSourceColumn[] = [
    { key: "orderNo", label: "来源单号", width: 200 },
    { key: "orderType", label: "单据类型", width: 180 },
    { key: "requiredQuantity", label: "需求数量", width: 180 },
    { key: "deliveryDate", label: "要求交期", width: 180 },
    { key: "remainingDays", label: "剩余天数", width: 180 },
    { key: "orderRemark", label: "订单备注", width: 200, grow: true },
    { key: "sampleRequirement", label: "非标要求", width: 200, grow: true },
    { key: "orderImages", label: "订单图片", width: 180 },
];

const materialPoolBreadcrumbItems = [
    { label: "采购管理" },
    { label: "待采购物料池" },
];

const activeView = ref<MaterialPoolView>("material");
const searchText = ref("");
const materialNameFilter = ref("");
const appliedSearchText = ref("");
const appliedMaterialNameFilter = ref("");
const isLoading = ref(false);
const loadError = ref("");
const materials = ref<PurchaseMaterial[]>([]);
const totalMaterialCount = ref(0);
const selectedMaterialIds = ref<string[]>([]);
const expandedMaterialIds = ref<string[]>([]);
const selectedMaterialDetail = ref<PurchaseMaterial | null>(null);
const adminInfo = useState<{ role?: number }>("admin_info", () => ({}));
const canManagePurchaseOrder = computed(() =>
    canManagePurchaseOrderByRole(Number(adminInfo.value?.role)),
);
const canViewPrice = computed(() =>
    canViewPurchasePrice(Number(adminInfo.value?.role)),
);
const showImagePreview = ref(false);
const previewTitle = ref("订单图片");
const previewImages = ref<PreviewImage[]>([]);
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

const materialTableColumnTemplate = computed(() => [
    "var(--material-pool-selection-width)",
    ...materialColumns.map(getErpTableGridColumn),
    "var(--material-pool-action-width)",
].join(" "));

const materialTableMinimumWidth = getErpTableMinimumWidth(
    materialColumns,
    ["var(--material-pool-selection-width)"],
    ["var(--material-pool-action-width)"],
);
const detailSourceTableColumnTemplate = computed(() =>
    detailSourceColumns.map(getErpTableGridColumn).join(" "),
);
const detailSourceTableMinimumWidth = getErpTableMinimumWidth(detailSourceColumns);

const visibleMaterials = computed(() => materials.value);
const totalMaterials = computed(() => totalMaterialCount.value);
const isCurrentPageSelected = computed(() =>
    visibleMaterials.value.length > 0 &&
    visibleMaterials.value.every((material) => selectedMaterialIds.value.includes(material.id)),
);
const hasPendingFilters = computed(() =>
    searchText.value.trim() !== appliedSearchText.value ||
    materialNameFilter.value.trim() !== appliedMaterialNameFilter.value,
);
const estimatedPurchaseAmount = computed(() => {
    const material = selectedMaterialDetail.value;
    if (!canViewPrice.value || material?.estimatedUnitPrice == null) return undefined;

    return material.shortageQuantity * material.estimatedUnitPrice;
});
const materialBasicInfo = computed(() => {
    const material = selectedMaterialDetail.value!;

    return [
        { label: "物料编码", value: material.materialCode },
        { label: "计量单位", value: material.unit },
        ...(canViewPrice.value ? [{ label: "预估单价", value: formatMoney(material.estimatedUnitPrice) }] : []),
    ];
});
const inventoryStatusCards = computed(() => {
    const material = selectedMaterialDetail.value!;

    return [
        {
            label: "可用库存",
            value: material.inventory.availableQuantity,
            meta: material.unit,
        },
        {
            label: "在途数量",
            value: material.inventory.inTransitQuantity,
            meta: "待入库",
            blue: true,
        },
        {
            label: "已预留",
            value: material.inventory.reservedQuantity,
            meta: "已分配",
            orange: true,
        },
        {
            label: "安全库存",
            value: material.inventory.safetyStock,
            meta: "最低库存",
        },
        {
            label: "缺口",
            value: material.shortageQuantity,
            meta: "需采购",
            danger: true,
        },
    ];
});

const normalizeMaterial = (item: PurchaseMaterialPoolItem): PurchaseMaterial => ({
    id: item.id || item.productId,
    productId: item.productId || item.id,
    unitId: item.unitId || "",
    materialCode: item.materialCode || "",
    materialName: item.materialName || "",
    materialModel: item.materialModel || "",
    materialType: item.materialType || "",
    shortageQuantity: Number(item.shortageQuantity || 0),
    unit: item.unit || "",
    suggestedSupplierId: item.suggestedSupplierId || "",
    suggestedSupplier: item.suggestedSupplier || "",
    estimatedUnitPrice: item.estimatedUnitPrice == null ? undefined : Number(item.estimatedUnitPrice),
    inventory: {
        availableQuantity: Number(item.inventory?.availableQuantity || 0),
        inTransitQuantity: Number(item.inventory?.inTransitQuantity || 0),
        reservedQuantity: Number(item.inventory?.reservedQuantity || 0),
        safetyStock: Number(item.inventory?.safetyStock || 0),
    },
    purchaseHistory: Array.isArray(item.purchaseHistory)
        ? item.purchaseHistory.map((history) => ({
            id: history.id,
            orderNo: history.orderNo,
            purchaseDate: history.purchaseDate,
            supplierName: history.supplierName,
            quantity: Number(history.quantity || 0),
            unitPrice: history.unitPrice == null ? undefined : Number(history.unitPrice),
            status: history.status,
        }))
        : [],
    sources: Array.isArray(item.sources)
        ? item.sources.map((source) => ({
            id: source.id,
            sourceType: source.sourceType || "sales-order",
            requirementId: source.sourceType === "purchase-request"
                ? undefined
                : source.requirementId || source.id,
            purchaseRequestId: source.purchaseRequestId,
            purchaseRequestNo: source.purchaseRequestNo,
            purchaseRequestItemIndex: source.purchaseRequestItemIndex,
            salesOrderNo: source.sourceType === "purchase-request"
                ? ""
                : source.salesOrderNo || source.orderNo,
            orderNo: source.orderNo,
            orderType: source.orderType,
            salesperson: source.salesperson,
            orderRemark: source.orderRemark || "",
            orderImages: Array.isArray(source.orderImages) ? source.orderImages : [],
            sampleRequirement: source.sampleRequirement || "",
            requiredQuantity: Number(source.requiredQuantity || 0),
            remainingPurchaseQuantity: Number(source.remainingPurchaseQuantity || 0),
            deliveryDate: source.deliveryDate || null,
            remainingDays: source.remainingDays ?? null,
        }))
        : [],
});

const loadMaterials = async () => {
    isLoading.value = true;
    loadError.value = "";
    try {
        const res = await retrievePurchaseMaterialPool({
            keyword: appliedSearchText.value,
            materialKeyword: appliedMaterialNameFilter.value,
            page: currentPage.value,
            limit: pageSize.value,
        });

        if (res.code !== 200 || !res.data) {
            throw new Error(res.msg || "获取待采购物料失败");
        }

        totalMaterialCount.value = res.data.pagination.total;
        materials.value = res.data.list.map(normalizeMaterial);
        setTotalItems(totalMaterialCount.value);
        selectedMaterialIds.value = selectedMaterialIds.value.filter((id) =>
            materials.value.some((material) => material.id === id),
        );
        if (!expandedMaterialIds.value.length && materials.value[0]) {
            expandedMaterialIds.value = [materials.value[0].id];
        }
    } catch (err: any) {
        materials.value = [];
        totalMaterialCount.value = 0;
        setTotalItems(0);
        loadError.value = err?.data?.msg || err?.message || "获取待采购物料失败";
    } finally {
        isLoading.value = false;
    }
};

const applyFilters = () => {
    appliedSearchText.value = searchText.value.trim();
    appliedMaterialNameFilter.value = materialNameFilter.value.trim();
    if (currentPage.value === 1) {
        void loadMaterials();
    } else {
        goToPage(1);
    }
};

const resetFilters = () => {
    searchText.value = "";
    materialNameFilter.value = "";
    applyFilters();
};

const switchView = (view: MaterialPoolView) => {
    activeView.value = view;
};

const toggleCurrentPageSelection = (event: Event) => {
    const checked = (event.target as HTMLInputElement).checked;
    const visibleIds = visibleMaterials.value.map((material) => material.id);

    selectedMaterialIds.value = checked
        ? Array.from(new Set([...selectedMaterialIds.value, ...visibleIds]))
        : selectedMaterialIds.value.filter((id) => !visibleIds.includes(id));
};

const isExpanded = (materialId: string) => expandedMaterialIds.value.includes(materialId);

const toggleMaterialExpansion = (materialId: string) => {
    expandedMaterialIds.value = isExpanded(materialId)
        ? expandedMaterialIds.value.filter((id) => id !== materialId)
        : [...expandedMaterialIds.value, materialId];
};

const viewMaterialDetail = async (material: PurchaseMaterial) => {
    selectedMaterialDetail.value = material;
    try {
        const res = await getPurchaseMaterialPoolDetail(material.id);
        if (res.code === 200 && res.data) {
            selectedMaterialDetail.value = normalizeMaterial(res.data);
        }
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "获取物料详情失败");
    }
};

const backToMaterialList = () => {
    selectedMaterialDetail.value = null;
};

const formatMoney = (amount: number | undefined, maximumFractionDigits = 2) => {
    if (amount == null || !Number.isFinite(amount)) return "--";
    return "¥" + amount.toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits,
    });
};

const formatDate = (value: string | Date | null) => {
    if (!value) return "--";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "--";

    return date.toISOString().slice(0, 10);
};

const normalizeImageUrl = (value: unknown) => {
    const path = getAttachmentPath(value as AttachmentPreviewSource);
    if (!path || path === "[object Object]") return "";
    if (/^(https?:)?\/\//i.test(path) || path.startsWith("data:") || path.startsWith("blob:")) {
        return path;
    }

    return path.startsWith("/") ? path : `/${path.replace(/^\/+/, "")}`;
};

const getSourceOrderImageUrls = (source: RequirementSource) =>
    source.orderImages.map(normalizeImageUrl).filter(Boolean);

const getSourceOrderThumbnailUrl = (source: RequirementSource) =>
    getSourceOrderImageUrls(source)[0] || "";

const getSourceOrderImageCount = (source: RequirementSource) =>
    getSourceOrderImageUrls(source).length;

const openSourceOrderImages = (source: RequirementSource) => {
    const images = getSourceOrderImageUrls(source);
    if (!images.length) return;

    const title = source.orderNo ? `${source.orderNo} 订单图片` : "订单图片";
    previewTitle.value = title;
    previewImages.value = images.map((url, index) => ({
        url,
        alt: images.length > 1 ? `${title}（${index + 1}）` : title,
    }));
    showImagePreview.value = true;
};

const mergeSelectedMaterials = () => {
    if (selectedMaterialIds.value.length === 0) {
        ElMessage.warning("请先选择需要合并的物料");
        return;
    }

    const selectedMaterials = selectedMaterialIds.value
        .map((id) => materials.value.find((item) => item.id === id))
        .filter((item): item is PurchaseMaterial => Boolean(item));
    if (selectedMaterials.length !== selectedMaterialIds.value.length || !selectedMaterials.length) {
        ElMessage.warning("未找到选中的物料");
        return;
    }

    if (import.meta.client) {
        sessionStorage.setItem("purchase-order-prefill-draft", JSON.stringify({
            source: "material-pool",
            items: selectedMaterials.map((material) => ({
                productId: material.productId,
                productCode: material.materialCode,
                productModel: material.materialModel,
                productName: material.materialName,
                unitId: material.unitId,
                unitName: material.unit,
                supplierId: material.suggestedSupplierId,
                supplierName: material.suggestedSupplier,
                purchaseQuantity: material.shortageQuantity,
                relatedOrders: material.sources.map((source) => ({
                    id: source.id,
                    sourceType: source.sourceType,
                    requirementId: source.requirementId,
                    purchaseRequestId: source.purchaseRequestId,
                    purchaseRequestNo: source.purchaseRequestNo,
                    purchaseRequestItemIndex: source.purchaseRequestItemIndex,
                    salesOrderNo: source.salesOrderNo,
                    category: source.sourceType === "purchase-request" ? source.orderType : "销售订单采购",
                    orderNo: source.orderNo,
                    requiredQuantity: source.requiredQuantity,
                    remainingQuantity: source.remainingPurchaseQuantity,
                    allocatedQuantity: source.remainingPurchaseQuantity,
                })),
            })),
        }));
    }

    void navigateTo("/configuration/purchase/order?source=material-pool");
};

watch([currentPage, pageSize], () => {
    void loadMaterials();
});

onMounted(() => {
    void loadMaterials();
});
</script>

<style scoped>
button,
input,
select {
    font: inherit;
}

.topbar,
.view-row,
.filter-row,
.view-tabs,
.filter-actions {
    display: flex;
    align-items: center;
}

.topbar,
.view-row {
    justify-content: space-between;
    padding: 0 12px;
    border-radius: 10px;
    background: var(--erp-color-fill-default);
}

.view-tabs {
    gap: 24px;
}

.view-tab {
    position: relative;
    height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-secondary);
    background: transparent;
    font-size: 16px;
    font-weight: 500;
    cursor: pointer;
}

.view-tab.active {
    color: var(--material-pool-blue);
}

.view-tab.active::after {
    content: "";
    position: absolute;
    right: 0;
    bottom: -4px;
    left: 0;
    height: 3px;
    border-radius: 999px;
    background: var(--material-pool-blue);
}

.view-tab-icon {
    width: 20px;
    height: 20px;
}

.filter-row {
    gap: 60px;
}

.filter-field {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--material-pool-text);
    font-size: 16px;
}

.filter-field input {
    width: 180px;
    height: 26px;
    min-width: 0;
    padding: 0 12px;
    border: 1px solid var(--material-pool-muted);
    border-radius: 8px;
    outline: 0;
    color: var(--material-pool-text);
    background: var(--erp-color-fill-default);
    font-size: 16px;
    font-weight: 400;
}

.filter-actions {
    margin-left: auto;
    gap: 12px;
}

.primary-button {
    border: 0;
    border-radius: 10px;
    background: var(--material-pool-blue);
    color: var(--erp-color-text-white);
    cursor: pointer;
}

.primary-button,
.outline-button,
.muted-button {
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
}

.outline-button {
    border: 1px solid var(--material-pool-muted);
    border-radius: 10px;
    color: var(--material-pool-text);
    background: var(--erp-color-fill-default);
}

.muted-button {
    border: 0;
    border-radius: 10px;
    color: var(--erp-color-text-white);
    background: var(--erp-color-neutral-400);
}

.muted-button.active {
    background: var(--material-pool-blue);
}

.button-icon {
    width: 20px;
    height: 20px;
}

.table-wrap {
    min-height: 0;
    overflow: hidden;
}

.selection-head,
.selection-row {
    position: sticky;
    left: 0;
    z-index: 5;
}

.action-head,
.action-row {
    position: sticky;
    right: 0;
    z-index: 5;
}

.table-row {
    width: max-content;
    min-width: 100%;
    display: grid;
    align-items: center;
    padding-right: 8px;
}

.table-head {
    height: 40px;
    border-radius: 10px;
    background: var(--material-pool-table-bg);
    font-size: 16px;
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 10;
}

.data-row {
    height: 64px;
    margin-top: 10px;
    border-radius: 10px;
    background: var(--erp-color-fill-default);
    font-size: 16px;
    font-weight: 400;
}

.selection-head,
.selection-row,
.action-head,
.action-row {
    display: flex;
    align-items: center;
    justify-content: center;
}

.selection-head,
.action-head {
    height: 40px;
    border-radius: 10px;
    background: var(--material-pool-table-bg);
    font-size: 16px;
    font-weight: 600;
}

.selection-row,
.action-row {
    height: 64px;
    border-radius: 10px;
    background: var(--erp-color-fill-default);
    font-size: 16px;
}

.table-cell {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.checkbox-cell {
    padding: 0;
}

.row-checkbox {
    width: 16px;
    height: 16px;
    accent-color: var(--material-pool-blue);
    cursor: pointer;
}

.shortage-cell {
    gap: 8px;
    color: var(--erp-color-text-status-error);
    font-weight: 600;
}

.shortage-cell .unit {
    color: var(--erp-color-text-secondary);
    font-weight: 400;
}

.source-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 0;
    color: var(--material-pool-blue);
    background: transparent;
    cursor: pointer;
}

.source-icon {
    width: 16px;
    height: 16px;
}

.link-button {
    border: 0;
    color: var(--material-pool-blue);
    background: transparent;
    cursor: pointer;
}

.actions-cell {
    gap: 12px;
}

.source-list {
    width: calc(100% - var(--material-pool-selection-width));
    display: grid;
    gap: 10px;
    padding: 10px 0 0 0;
}

.source-card {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-right: 8px;
    padding: 0 24px;
    border-radius: 10px;
    color: var(--erp-color-text-secondary);
    background: var(--erp-color-fill-control-secondary);
    font-size: 14px;
}

.source-main,
.source-quantity {
    display: flex;
    align-items: center;
    gap: 8px;
}

.source-order {
    color: var(--material-pool-blue);
}

.source-quantity strong {
    color: var(--material-pool-text);
    font-weight: 600;
}

.source-order-images {
    min-width: 0;
    display: flex;
    align-items: center;
}

.source-image-button {
    width: fit-content;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-brand);
    background: transparent;
    cursor: pointer;
}

.source-image-button img {
    width: 44px;
    height: 44px;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: 6px;
    object-fit: cover;
}

.source-collapse-enter-active,
.source-collapse-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.source-collapse-enter-from,
.source-collapse-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

.material-pool-page.detail-mode {
    grid-template-rows: minmax(0, 1fr);
    gap: 0;
}

.material-detail-page {
    min-height: 0;
    display: grid;
    grid-template-rows: 28px auto auto auto auto minmax(0, 1fr);
    gap: 12px;
    color: var(--erp-color-text-primary);
    overflow: auto;
}

.detail-topbar {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--erp-color-text-tertiary);
    font-size: 14px;
}

.detail-back-button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-tertiary);
    background: transparent;
    cursor: pointer;
}

.detail-back-button:hover,
.detail-breadcrumb-current {
    color: var(--material-pool-text);
}

.detail-back-icon,
.detail-breadcrumb-icon {
    width: 16px;
    height: 16px;
}

.detail-breadcrumb-divider,
.detail-breadcrumb-parent {
    color: var(--erp-color-text-placeholder);
}

.detail-card,
.summary-card {
    border: 1px solid var(--erp-color-border-muted);
    border-radius: 10px;
    background: var(--erp-color-fill-default);
}

.detail-card {
    padding: 18px 20px;
}

.material-basic-card {
    padding: 18px 20px 22px;
}

.material-basic-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 20px;
}

.material-basic-title h1 {
    margin: 0;
    color: var(--material-pool-text);
    font-size: 18px;
    font-weight: 700;
}

.material-type-tag {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 7px;
    border-radius: 4px;
    color: var(--erp-color-text-status-purchase);
    background: var(--erp-color-bg-status-purchase);
    font-size: 12px;
    font-weight: 500;
}

.material-basic-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
}

.material-basic-item,
.summary-card,
.inventory-status-card {
    min-width: 0;
    display: grid;
}

.material-basic-item {
    gap: 6px;
}

.material-basic-item span,
.summary-label,
.summary-meta,
.inventory-status-card span,
.inventory-status-card small {
    color: var(--erp-color-text-tertiary);
    font-size: 12px;
    font-weight: 400;
}

.material-basic-item strong {
    overflow: hidden;
    color: var(--material-pool-text);
    font-size: 14px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.detail-summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
}

.summary-card {
    min-height: 92px;
    position: relative;
    gap: 8px;
    align-content: center;
    padding: 14px 18px;
}

.summary-card.danger {
    border-color: var(--erp-color-function-red-100);
    background: var(--erp-color-bg-status-error-subtle);
}

.summary-card.danger .summary-label,
.summary-card.danger .summary-value,
.summary-card.danger .summary-meta {
    color: var(--erp-color-text-status-error);
}

.summary-card-content {
    display: grid;
    gap: 8px;
}

.summary-value {
    color: var(--material-pool-text);
    font-size: 24px;
    font-weight: 700;
    line-height: 1;
}

.summary-value.blue {
    color: var(--erp-color-text-brand);
}

.summary-alert-icon {
    position: absolute;
    right: 18px;
    top: 50%;
    width: 30px;
    height: 30px;
    color: var(--erp-color-text-status-error);
    transform: translateY(-50%);
}

.detail-section-title {
    margin: 0 0 18px;
    color: var(--material-pool-text);
    font-size: 16px;
    font-weight: 700;
}

.detail-source-table {
    border-radius: 8px;
    overflow: hidden;
}

.detail-source-row {
    min-height: 68px;
    display: grid;
    grid-template-columns: var(--erp-table-columns);
    align-items: center;
    border-top: 1px solid var(--erp-color-divider-default);
    color: var(--erp-color-text-secondary-strong);
    font-size: 14px;
}

.detail-source-cell {
    height: 100%;
    box-sizing: border-box;
    padding: 0 12px;
    overflow: hidden;
}

.detail-long-cell {
    display: flex;
    overflow-wrap: normal;
    text-overflow: ellipsis;
    white-space: normal;
}

.detail-source-row:first-child {
    border-top: 0;
}

.detail-source-head {
    min-height: 48px;
    border-top: 0;
    color: var(--erp-color-text-secondary);
    background: var(--erp-color-fill-hover);
    font-size: 13px;
    font-weight: 600;
}

.source-order-link {
    padding: 2px 6px;
    border: 0;
    border-radius: 4px;
    color: var(--erp-color-text-brand);
    background: var(--erp-color-fill-nav-selected);
    font-size: 14px;
    cursor: pointer;
}

.source-type-pill {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 8px;
    border-radius: 4px;
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-control-secondary);
    font-size: 14px;
}

.inventory-status-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 12px;
}

.inventory-status-card {
    min-height: 80px;
    justify-items: center;
    align-content: center;
    gap: 8px;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: 8px;
    background: var(--erp-color-fill-default);
}

.inventory-status-card strong {
    color: var(--material-pool-text);
    font-size: 22px;
    font-weight: 700;
    line-height: 1;
}

.inventory-status-card.blue strong {
    color: var(--erp-color-text-brand);
}

.inventory-status-card.orange strong {
    color: var(--erp-color-text-status-producing);
}

.inventory-status-card.danger {
    border-color: var(--erp-color-function-red-100);
    background: var(--erp-color-bg-status-error-subtle);
}

.inventory-status-card.danger span,
.inventory-status-card.danger strong,
.inventory-status-card.danger small {
    color: var(--erp-color-text-status-error);
}

.purchase-history-card {
    min-height: 164px;
    position: relative;
}

.purchase-history-list {
    display: grid;
    gap: 10px;
}

.purchase-history-item {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 14px;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    color: var(--erp-color-text-secondary-strong);
    font-size: 14px;
}

.purchase-history-main,
.purchase-history-meta {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 16px;
}

.history-order {
    padding: 2px 6px;
    border-radius: 4px;
    color: var(--erp-color-text-status-complete);
    background: var(--erp-color-bg-status-complete);
    font-size: 14px;
    font-weight: 600;
}

.history-status {
    padding: 3px 8px;
    border-radius: 4px;
    color: var(--erp-color-text-status-complete);
    background: var(--erp-color-bg-status-complete);
    font-size: 14px;
}

.detail-empty-state {
    min-height: 58px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--material-pool-muted);
    font-size: 14px;
}

.purchase-history-total {
    position: absolute;
    right: 0;
    bottom: 10px;
    left: 0;
    color: var(--erp-color-text-tertiary);
    font-size: 14px;
    text-align: center;
}

.material-pool-page {
    --material-pool-blue: var(--erp-color-action-primary);
    --material-pool-table-bg: var(--erp-color-fill-table-header);
    --material-pool-text: var(--erp-color-text-primary);
    --material-pool-muted: var(--erp-color-text-placeholder);
    --material-pool-soft: var(--erp-color-fill-control-secondary);
    --material-pool-selection-width: 58px;
    --material-pool-action-width: var(--erp-table-col-action);

    height: 100%;
    display: grid;
    grid-template-rows: 40px 32px 32px minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
}

.material-pool-page:not(.detail-mode) .topbar,
.material-pool-page:not(.detail-mode) .view-row {
    padding: 0;
    border-radius: 0;
    background: transparent;
}

.material-pool-page:not(.detail-mode) .view-row {
    height: var(--erp-size-control-height-sm);
}

.material-pool-page .view-tabs {
    gap: var(--erp-spacing-24);
}

.material-pool-page .view-tab {
    height: var(--erp-size-control-height-sm);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
}

.material-pool-page .view-tab.active {
    color: var(--erp-color-text-brand);
}

.material-pool-page .view-tab.active::after {
    bottom: 0;
    height: 2px;
    background: var(--erp-color-action-primary);
}

.material-pool-page .filter-row {
    gap: var(--erp-spacing-12);
}

.material-pool-page .filter-field {
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
}

.material-pool-page .filter-input {
    width: 200px;
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
    border-color: var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
}

.material-pool-page .primary-button,
.material-pool-page .outline-button,
.material-pool-page .muted-button {
    height: var(--erp-size-control-height-sm);
    gap: 6px;
    padding: 0 var(--erp-spacing-12);
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
}

.material-pool-page .primary-button {
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.material-pool-page .outline-button {
    border-color: var(--erp-color-border-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
}

.material-pool-page .muted-button {
    background: var(--erp-color-neutral-400);
}

.material-pool-page .muted-button.active {
    background: var(--erp-color-action-primary);
}

.material-pool-page .table-wrap {
    min-width: 0;
}

.material-pool-page .table-row {
    width: 100%;
    min-width: 0;
    grid-template-columns: var(--erp-table-columns);
    padding-right: 0;
}

.material-pool-page .material-pool-selection-cell,
.material-pool-page .action-head,
.material-pool-page .action-row {
    position: sticky;
    z-index: 5;
}

.material-pool-page .material-pool-selection-cell {
    left: 0;
}

.material-pool-page .action-head,
.material-pool-page .action-row {
    right: 0;
}

.material-pool-page .selection-head,
.material-pool-page .selection-row,
.material-pool-page .action-head,
.material-pool-page .action-row {
    height: 100%;
    background: inherit;
}

.material-pool-page .selection-head,
.material-pool-page .action-head,
.material-pool-page .table-head {
    background: var(--erp-color-fill-table-header);
}

.material-pool-page .table-head {
    height: 48px;
    border-radius: 0;
}

.material-pool-page .data-row,
.material-pool-page .selection-row,
.material-pool-page .action-row {
    height: 64px;
    margin-top: 0;
    border-radius: 0;
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
}

.material-pool-page .data-row:hover,
.material-pool-page .data-row:hover .selection-row,
.material-pool-page .data-row:hover .action-row {
    background: var(--erp-color-fill-hover);
}

.material-pool-page .row-checkbox {
    accent-color: var(--erp-color-action-primary);
}

.material-pool-page .shortage-cell {
    color: var(--erp-color-text-status-error);
}

.material-pool-page .shortage-cell .unit,
.material-pool-page .source-card {
    color: var(--erp-color-text-secondary);
}

.material-pool-page .source-toggle,
.material-pool-page .link-button,
.material-pool-page .source-order {
    color: var(--erp-color-text-brand);
}

.material-pool-page .source-card {
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-control-secondary);
    font-size: var(--erp-typography-content1-font-size);
}

.material-pool-page:not(.detail-mode) :deep(.erp-table-frame) {
    height: 100%;
}

.detail-topbar {
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content1-font-size);
}

.detail-back-button,
.detail-breadcrumb-divider,
.detail-breadcrumb-parent {
    color: var(--erp-color-text-secondary);
}

.detail-back-button:hover,
.detail-breadcrumb-current {
    color: var(--erp-color-text-primary);
}

.detail-card,
.summary-card,
.inventory-status-card,
.purchase-history-item {
    border-color: var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.detail-card {
    padding: var(--erp-spacing-20);
}

.material-basic-card {
    padding: var(--erp-spacing-20);
}

.material-basic-title h1 {
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
}

.material-type-tag {
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-status-purchase);
    background: var(--erp-color-bg-status-purchase);
}

.material-basic-item span,
.summary-label,
.summary-meta,
.inventory-status-card span,
.inventory-status-card small {
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-note-font-size);
}

.material-basic-item strong,
.summary-value,
.inventory-status-card strong,
.detail-section-title {
    color: var(--erp-color-text-primary);
}

.detail-section-title {
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.detail-source-row {
    border-color: var(--erp-color-divider-default);
    color: var(--erp-color-text-secondary-strong);
    font-size: var(--erp-typography-content1-font-size);
}

.detail-source-head {
    color: var(--erp-color-text-secondary);
    background: var(--erp-color-fill-table-header);
    font-size: var(--erp-typography-content2-font-size);
}

.source-order-link,
.source-type-pill,
.history-order,
.history-status {
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-content1-font-size);
}

.source-order-link {
    color: var(--erp-color-text-brand);
    background: var(--erp-color-fill-nav-selected);
}

.source-type-pill {
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-control-secondary);
}

.inventory-status-card.blue strong,
.summary-value.blue {
    color: var(--erp-color-text-brand);
}

.purchase-history-item {
    color: var(--erp-color-text-secondary-strong);
    font-size: var(--erp-typography-content1-font-size);
}
</style>
