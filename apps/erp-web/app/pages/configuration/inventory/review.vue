<template>
    <div class="review-page">
        <header class="review-topbar">
            <ErpBreadcrumb icon="lucide:clipboard-check" :items="breadcrumbItems" />
            <ErpSearchBox v-model="searchText" placeholder="搜索订单或产品" :disabled="isLoading" @search="applySearch" />
        </header>

        <section class="review-heading">
            <h1>仓库复核</h1>
            <p>功能启用后审批通过的订单均需仓库复核，无论库存是否充足；历史订单不纳入。</p>
        </section>

        <section class="review-statistics" aria-label="仓库复核统计">
            <div v-for="item in statusOptions" :key="item.value" class="review-statistic">
                <span>{{ item.label }}</span>
                <strong>{{ statusCounts[item.value] }}</strong>
            </div>
        </section>

        <section class="review-panel">
            <label class="review-filter">
                <span>状态</span>
                <select v-model="selectedStatus" :disabled="isLoading" aria-label="筛选仓库复核状态" @change="applyFilters">
                    <option value="">全部</option>
                    <option v-for="item in statusOptions" :key="item.value" :value="item.value">
                        {{ item.label }}
                    </option>
                </select>
            </label>

            <div class="review-table-scroll">
                <table class="review-table" aria-label="仓库复核订单列表">
                    <colgroup>
                        <col style="width: 20%">
                        <col style="width: 10%">
                        <col style="width: 22%">
                        <col style="width: 14%">
                        <col style="width: 12%">
                        <col style="width: 22%">
                    </colgroup>
                    <thead>
                        <tr>
                            <th scope="col">订单编号</th>
                            <th scope="col">销售员</th>
                            <th scope="col">销售数量 / 可用数量</th>
                            <th scope="col">订单交期</th>
                            <th scope="col">仓库状态</th>
                            <th scope="col">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-if="isLoading">
                            <td colspan="6" class="review-empty" role="status">正在加载复核订单...</td>
                        </tr>
                        <tr v-else-if="loadError">
                            <td colspan="6" class="review-empty" role="alert">
                                {{ loadError }}
                                <button class="review-link" type="button" @click="loadOrders">重试</button>
                            </td>
                        </tr>
                        <tr v-for="order in displayedOrders" :key="order.id">
                            <td>{{ order.code }}</td>
                            <td>{{ order.salesperson }}</td>
                            <td>
                                <div v-for="product in order.products" :key="product.id" class="review-product">
                                    <span>{{ product.model }} × {{ product.salesQuantity }} {{ product.unit }}</span>
                                    <small>可用数量 {{ product.ownReservedQuantity === undefined ? "--" : product.stockQuantity }}</small>
                                </div>
                            </td>
                            <td>{{ order.deliveryDate || "--" }}</td>
                            <td>
                                <span class="review-status" :class="`review-status--${order.status}`">
                                    {{ statusLabels[order.status] }}
                                </span>
                            </td>
                            <td>
                                <button class="review-link" type="button" :disabled="!!openingOrderId || isSaving" @click="openReview(order)">
                                    {{ openingOrderId === order.id ? "正在加载..." : order.status === "reviewed" ? "查看复核结果" : "库存与 BOM 复核" }}
                                </button>
                            </td>
                        </tr>
                        <tr v-if="!isLoading && !loadError && orders.length === 0">
                            <td colspan="6" class="review-empty">暂无匹配的复核订单</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </section>

        <InventoryPagination
            :total="total"
            :page-size="pageSize"
            :page-size-options="[20, 50, 100]"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            :jump-page-input="jumpPageInput"
            @update:page-size="changePageSize"
            @update:jump-page-input="jumpPageInput = $event"
            @page-change="goToPage"
            @jump="jumpToPage"
        />

        <InventoryReviewDialog
            v-if="selectedOrder"
            :key="selectedOrder.id"
            :order="selectedOrder"
            :readonly="selectedOrder.status === 'reviewed'"
            :saving="isSaving"
            :submission-error="saveError"
            @close="closeReview"
            @save="saveReview($event, false)"
            @complete="saveReview($event, true)"
        />
    </div>
</template>

<script setup lang="ts">
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import InventoryReviewDialog from "~/components/configuration/inventory/review/InventoryReviewDialog.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import { getPaginationPageNumbers } from "~/composables/inventory/useInventoryPagination";
import {
    getInventoryOrderReviewDetail,
    retrieveInventoryOrderReviews,
    saveInventoryOrderReview,
} from "~/composables/api/useInventoryApi";
import type { InventoryReviewOrder, InventoryReviewStatus } from "~/types/inventoryReview";

definePageMeta({
    layout: "inventory",
});

const breadcrumbItems = [{ label: "仓储管理" }, { label: "仓库复核" }];
const statusLabels: Record<InventoryReviewStatus, string> = {
    pending: "待复核",
    reviewing: "复核中",
    reviewed: "已复核",
};
const statusOptions: { value: InventoryReviewStatus; label: string }[] = [
    { value: "pending", label: "待复核" },
    { value: "reviewing", label: "复核中" },
    { value: "reviewed", label: "已复核" },
];
const orders = ref<InventoryReviewOrder[]>([]);
const searchText = ref("");
const appliedSearch = ref("");
const selectedStatus = ref<InventoryReviewStatus | "">("");
const selectedOrder = ref<InventoryReviewOrder | null>(null);
const statusCounts = ref<Record<InventoryReviewStatus, number>>({ pending: 0, reviewing: 0, reviewed: 0 });
const isLoading = ref(false);
const openingOrderId = ref("");
const isSaving = ref(false);
const loadError = ref("");
const saveError = ref("");
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);
const jumpPageInput = ref("1");
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const pageNumbers = computed(() => getPaginationPageNumbers(totalPages.value, currentPage.value));
const displayedOrders = computed(() => isLoading.value || loadError.value ? [] : orders.value);
let loadSequence = 0;

function errorMessage(error: any, fallback: string) {
    return error?.data?.msg || error?.data?.message || error?.data?.statusMessage || error?.statusMessage || fallback;
}

async function loadOrders() {
    const sequence = ++loadSequence;
    isLoading.value = true;
    loadError.value = "";
    try {
        const response = await retrieveInventoryOrderReviews({
            keyword: appliedSearch.value,
            status: selectedStatus.value,
            page: currentPage.value,
            limit: pageSize.value,
        });
        if (sequence !== loadSequence) return;
        if (response.code !== 200 || !response.data) {
            throw new Error(response.msg || "获取复核订单失败");
        }
        total.value = response.data.pagination.total;
        statusCounts.value = response.data.counts;
        if (currentPage.value > totalPages.value) {
            currentPage.value = totalPages.value;
            jumpPageInput.value = String(currentPage.value);
            await loadOrders();
            return;
        }
        orders.value = response.data.list;
    } catch (error: any) {
        if (sequence !== loadSequence) return;
        loadError.value = errorMessage(error, error.message || "加载复核订单失败，请重试");
        orders.value = [];
    } finally {
        if (sequence === loadSequence) isLoading.value = false;
    }
}

function applyFilters() {
    currentPage.value = 1;
    jumpPageInput.value = "1";
    void loadOrders();
}

function applySearch() {
    appliedSearch.value = searchText.value.trim();
    applyFilters();
}

function changePageSize(value: number) {
    if (isLoading.value) return;
    pageSize.value = value;
    applyFilters();
}

function goToPage(value: number) {
    if (isLoading.value || !Number.isFinite(value)) return;
    currentPage.value = Math.max(1, Math.min(Math.trunc(value), totalPages.value));
    jumpPageInput.value = String(currentPage.value);
    void loadOrders();
}

function jumpToPage() {
    const value = Number(jumpPageInput.value.trim());
    if (value === currentPage.value) return;
    goToPage(value);
}

async function openReview(order: InventoryReviewOrder) {
    if (openingOrderId.value || isSaving.value) return;
    openingOrderId.value = order.id;
    saveError.value = "";
    try {
        const response = await getInventoryOrderReviewDetail(order.id);
        if (response.code !== 200 || !response.data?.detail) {
            throw new Error(response.msg || "获取复核详情失败");
        }
        selectedOrder.value = response.data.detail;
    } catch (error: any) {
        ElMessage.error(errorMessage(error, error.message || "获取复核详情失败"));
    } finally {
        openingOrderId.value = "";
    }
}

function closeReview() {
    if (isSaving.value) return;
    selectedOrder.value = null;
    saveError.value = "";
}

async function saveReview(order: InventoryReviewOrder, complete: boolean) {
    if (isSaving.value || selectedOrder.value?.status === "reviewed") return;
    isSaving.value = true;
    saveError.value = "";
    try {
        const response = await saveInventoryOrderReview(order, complete);
        if (response.code !== 200 || !response.data?.detail) {
            throw new Error(response.msg || "保存复核记录失败");
        }
        selectedOrder.value = null;
        ElMessage.success(complete ? "复核已完成" : "草稿已保存");
        await loadOrders();
    } catch (error: any) {
        saveError.value = errorMessage(error, error.message || "保存失败，请重试");
        ElMessage.error(saveError.value);
    } finally {
        isSaving.value = false;
    }
}

onMounted(() => {
    void loadOrders();
});

onBeforeUnmount(() => {
    loadSequence += 1;
});
</script>

<style scoped>
.review-page {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    color: var(--erp-color-text-primary);
}

.review-topbar,
.review-heading,
.review-statistics {
    flex-shrink: 0;
}

.review-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 40px;
}

.review-topbar :deep(.erp-search-box) {
    width: 344px;
    max-width: 100%;
    box-sizing: border-box;
}

.review-heading h1 {
    margin: 4px 0 6px;
    font-size: 18px;
    font-weight: 600;
}

.review-heading p {
    margin: 0 0 4px;
    color: var(--erp-color-text-secondary);
    font-size: 12px;
}

.review-statistics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    width: 100%;
    max-width: 1016px;
}

.review-statistic {
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-sizing: border-box;
    min-height: 85px;
    padding: 14px 16px;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: 4px;
    background: var(--erp-color-fill-default);
}

.review-statistic span {
    color: var(--erp-color-text-secondary);
    font-size: 14px;
}

.review-statistic strong {
    font-size: 24px;
    font-weight: 500;
    line-height: 1;
}

.review-panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 260px;
    padding: 12px;
    border-radius: 4px;
    background: var(--erp-color-fill-default);
}

.review-filter {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 16px;
    font-size: 13px;
}

.review-filter select {
    width: 170px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--erp-color-border-default);
    border-radius: 4px;
    color: inherit;
    background: var(--erp-color-fill-default);
    font: inherit;
}

.review-table-scroll {
    min-height: 0;
    overflow: auto;
}

.review-table {
    width: 100%;
    min-width: 920px;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 13px;
}

.review-table th {
    height: 44px;
    padding: 0 12px;
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-table-header);
    text-align: left;
    font-weight: 500;
}

.review-table td {
    padding: 14px 12px;
    border-bottom: 1px solid var(--erp-color-divider-subtle);
    line-height: 20px;
    overflow-wrap: anywhere;
}

.review-product {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.review-product + .review-product {
    margin-top: 16px;
}

.review-product small {
    color: var(--erp-color-text-secondary);
    font-size: 12px;
}

.review-status {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 3px;
    color: var(--erp-color-action-primary);
    background: #edf7ff;
    font-size: 12px;
}

.review-status--reviewing {
    color: #ad6b00;
    background: #fff7e6;
}

.review-link {
    padding: 0;
    border: 0;
    color: var(--erp-color-action-primary);
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.review-link:hover {
    text-decoration: underline;
}

.review-link:disabled {
    opacity: 0.6;
    cursor: wait;
}

.review-link:focus-visible,
.review-filter select:focus-visible {
    outline: 2px solid var(--erp-color-action-primary);
    outline-offset: 3px;
}

.review-table .review-empty {
    height: 120px;
    color: var(--erp-color-text-secondary);
    text-align: center;
}

@media (max-width: 680px) {
    .review-topbar {
        flex-wrap: wrap;
    }

    .review-topbar :deep(.erp-search-box) {
        width: 100%;
    }

    .review-statistic {
        padding: 12px;
    }

    .review-panel {
        min-height: 320px;
    }
}
</style>
