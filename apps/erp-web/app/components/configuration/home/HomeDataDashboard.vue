<template>
    <div v-if="canViewDataDashboard && dashboardState === 'loading'" class="dashboard-state dashboard-loading">
        <Icon name="lucide:loader-circle" class="dashboard-state-icon spinning" />
        <h1>正在加载技术看板</h1>
        <p>正在读取销售、库存和订单数据，请稍候。</p>
    </div>

    <div v-else-if="canViewDataDashboard && dashboardState === 'error'" class="dashboard-state dashboard-error">
        <Icon name="lucide:triangle-alert" class="dashboard-state-icon" />
        <h1>技术看板加载失败</h1>
        <p>{{ errorMessage }}</p>
        <button type="button" class="retry-button" :disabled="isLoading" @click="loadData">
            <Icon name="lucide:refresh-cw" :class="{ spinning: isLoading }" />
            重试
        </button>
    </div>

    <div v-else-if="canViewDataDashboard && dashboardState === 'empty'" class="dashboard-state dashboard-empty">
        <Icon name="lucide:chart-no-axes-combined" class="dashboard-state-icon" />
        <h1>暂无可展示数据</h1>
        <p>技术看板已连接成功，但当前没有符合统计条件的业务数据。</p>
        <button type="button" class="retry-button" :disabled="isLoading" @click="loadData">
            <Icon name="lucide:refresh-cw" :class="{ spinning: isLoading }" />
            重新加载
        </button>
    </div>

    <div v-else-if="canViewDataDashboard" class="data-center-page">
        <div class="topbar">
            <div class="topbar-title">
                <Icon name="lucide:bar-chart-3" class="topbar-icon" />
                <span>{{ props.title }}</span>
            </div>
        </div>

        <div class="stats-row">
            <StatCard
                title="本月销售总额"
                :value="summaryCards.monthlySales.value"
                :unit="summaryCards.monthlySales.unit"
                :change="summaryCards.monthlySales.change"
                icon-text="销"
                icon-color="#3dabee"
                icon-bg="rgba(61,171,238,0.1)"
            />
            <StatCard
                title="待回款总额"
                :value="summaryCards.pendingReceivable.value"
                :unit="summaryCards.pendingReceivable.unit"
                :change="summaryCards.pendingReceivable.change"
                icon-text="回"
                icon-color="#34c759"
                icon-bg="rgba(52,199,89,0.1)"
            />
            <StatCard
                title="待采购/备料预警"
                :value="summaryCards.purchaseWarning.value"
                :unit="summaryCards.purchaseWarning.unit"
                :change="summaryCards.purchaseWarning.change"
                icon-text="采"
                icon-color="#ff3b30"
                icon-bg="rgba(255,59,48,0.1)"
            />
            <StatCard
                title="生产中订单"
                :value="summaryCards.productionOrders.value"
                :unit="summaryCards.productionOrders.unit"
                :change="summaryCards.productionOrders.change"
                icon-text="产"
                icon-color="#5856d6"
                icon-bg="rgba(175,82,222,0.1)"
            />
        </div>

        <div class="mid-row">
            <div class="mid-col-wide">
                <TrendLineChart
                    :dates="salesTrend.dates"
                    :sales-amount="salesTrend.salesAmount"
                    :collect-amount="salesTrend.collectAmount"
                />
            </div>
            <div class="mid-col-narrow">
                <TopCustomersChart :customers="topCustomers" />
            </div>
        </div>

        <div class="bottom-row">
            <div class="bottom-col">
                <StockDonutChart
                    :total="stockSummary.total"
                    :low="stockSummary.low"
                    :low-percent="stockSummary.lowPercent"
                    :high="stockSummary.high"
                    :high-percent="stockSummary.highPercent"
                    :normal="stockSummary.normal"
                    :normal-percent="stockSummary.normalPercent"
                />
            </div>
            <div class="bottom-col">
                <OrderPipeline
                    :pending-audit="orderPipeline.pendingAudit"
                    :pending-purchase="orderPipeline.pendingPurchase"
                    :producing="orderPipeline.producing"
                    :pending-ship="orderPipeline.pendingShip"
                    :shipped="orderPipeline.shipped"
                />
            </div>
        </div>
    </div>

    <div v-else class="dashboard-state dashboard-unavailable">
        <Icon name="lucide:bar-chart-3" class="dashboard-unavailable-icon" />
        <h1>{{ props.title }}</h1>
        <p>当前角色暂不具备查看技术看板的权限。</p>
    </div>
</template>

<script setup lang="ts">
import { canAccessSalesModule } from "~~/shared/utils/adminPermission";
import StatCard from "~/components/configuration/sales/dashboard/StatCard.vue";
import TrendLineChart from "~/components/configuration/sales/dashboard/TrendLineChart.vue";
import TopCustomersChart from "~/components/configuration/sales/dashboard/TopCustomersChart.vue";
import StockDonutChart from "~/components/configuration/sales/dashboard/StockDonutChart.vue";
import OrderPipeline from "~/components/configuration/sales/dashboard/OrderPipeline.vue";

const props = withDefaults(defineProps<{
    title?: string;
}>(), {
    title: "技术看板",
});

const adminInfo = useState<any>("admin_info", () => ({}));
const role = computed(() => Number(adminInfo.value?.role));
const canViewDataDashboard = computed(() => canAccessSalesModule(role.value));
const dashboardState = ref<"loading" | "success" | "empty" | "error">("loading");
const errorMessage = ref("无法获取看板数据，请稍后重试。");
const isLoading = computed(() => dashboardState.value === "loading");

const emptySummary = () => ({ value: 0, unit: "", change: 0 });
const summaryCards = reactive({
    monthlySales: emptySummary(),
    pendingReceivable: emptySummary(),
    purchaseWarning: emptySummary(),
    productionOrders: emptySummary(),
});

const salesTrend = reactive({
    dates: [] as string[],
    salesAmount: [] as number[],
    collectAmount: [] as number[],
});

const topCustomers = ref<{ name: string; amount: number }[]>([]);

const stockSummary = reactive({
    total: 0,
    low: 0,
    lowPercent: 0,
    high: 0,
    highPercent: 0,
    normal: 0,
    normalPercent: 0,
});

const orderPipeline = reactive({
    pendingAudit: 0,
    pendingPurchase: 0,
    producing: 0,
    pendingShip: 0,
    shipped: 0,
});

const loadData = async () => {
    if (!canViewDataDashboard.value) return;
    dashboardState.value = "loading";
    errorMessage.value = "无法获取看板数据，请稍后重试。";
    try {
        const res = await $fetch<{ code: number; data?: any }>("/dashboard/stats");
        if (res.code !== 200 || !res.data) {
            throw new Error("看板接口返回异常");
        }

        const data = res.data;
        if (!data.summaryCards || !data.salesTrend || !data.stockSummary || !data.orderPipeline) {
            throw new Error("看板响应缺少必要数据");
        }

        Object.assign(summaryCards.monthlySales, data.summaryCards.monthlySales || emptySummary());
        Object.assign(summaryCards.pendingReceivable, data.summaryCards.pendingReceivable || emptySummary());
        Object.assign(summaryCards.purchaseWarning, data.summaryCards.purchaseWarning || emptySummary());
        Object.assign(summaryCards.productionOrders, data.summaryCards.productionOrders || emptySummary());

        salesTrend.dates = Array.isArray(data.salesTrend.dates) ? data.salesTrend.dates : [];
        salesTrend.salesAmount = Array.isArray(data.salesTrend.salesAmount) ? data.salesTrend.salesAmount : [];
        salesTrend.collectAmount = Array.isArray(data.salesTrend.collectAmount) ? data.salesTrend.collectAmount : [];
        topCustomers.value = Array.isArray(data.topCustomers) ? data.topCustomers : [];

        Object.assign(stockSummary, data.stockSummary);
        Object.assign(orderPipeline, data.orderPipeline);
        const hasSummaryValue = Object.values(summaryCards).some((card) => Number(card.value) > 0);
        const hasTrendValue = salesTrend.salesAmount.some((value) => Number(value) > 0)
            || salesTrend.collectAmount.some((value) => Number(value) > 0);
        const hasCustomerValue = topCustomers.value.length > 0;
        const hasStockValue = stockSummary.total > 0;
        const hasOrderValue = Object.values(orderPipeline).some((value) => Number(value) > 0);
        dashboardState.value = hasSummaryValue || hasTrendValue || hasCustomerValue || hasStockValue || hasOrderValue
            ? "success"
            : "empty";
    } catch (error) {
        console.error("Dashboard load error:", error);
        errorMessage.value = error instanceof Error && error.message
            ? error.message
            : "无法获取看板数据，请检查网络或服务端日志。";
        dashboardState.value = "error";
    }
};

onMounted(() => {
    watch(canViewDataDashboard, (canView) => {
        if (canView && dashboardState.value !== "success") void loadData();
    }, { immediate: true });
});
</script>

<style scoped>
.data-center-page {
    --d-color: #3dabee;
    --gray-15: #262626;
    --page-bg: #f5f7fa;

    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
    overflow: auto;
    background: var(--page-bg);
}

.topbar {
    height: 40px;
    display: flex;
    align-items: center;
}

.topbar-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--gray-15);
    font-size: 18px;
    font-weight: 600;
    line-height: 26px;
}

.topbar-icon {
    width: 24px;
    height: 24px;
    color: var(--d-color);
}

.stats-row {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 20px;
}

.mid-row,
.bottom-row {
    display: grid;
    gap: 20px;
}

.mid-row {
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    min-height: 416px;
}

.bottom-row {
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    min-height: 380px;
}

.mid-col-wide,
.mid-col-narrow,
.bottom-col {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}

.dashboard-unavailable {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px;
    color: var(--erp-color-text-secondary, #6b7280);
    background: var(--erp-color-bg-page, #f5f7fa);
    text-align: center;
}

.dashboard-state {
    min-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 10px;
    padding: 24px;
    color: var(--erp-color-text-secondary, #6b7280);
    background: var(--erp-color-bg-page, #f5f7fa);
    text-align: center;
}

.dashboard-state-icon {
    width: 42px;
    height: 42px;
    color: var(--erp-color-action-primary, #409eff);
}

.dashboard-state h1,
.dashboard-state p {
    margin: 0;
}

.dashboard-state h1 {
    color: var(--erp-color-text-primary, #1f2937);
    font-size: 20px;
    font-weight: 600;
    line-height: 28px;
}

.dashboard-state p {
    max-width: 460px;
    font-size: 14px;
    line-height: 22px;
}

.dashboard-error .dashboard-state-icon {
    color: var(--erp-color-function-red-500, #ef4444);
}

.dashboard-empty .dashboard-state-icon {
    color: var(--erp-color-text-tertiary, #9ca3af);
}

.retry-button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 36px;
    margin-top: 6px;
    padding: 0 14px;
    border: 1px solid var(--erp-color-border-brand, #409eff);
    border-radius: var(--erp-radius-control-default, 6px);
    color: var(--erp-color-action-primary, #409eff);
    background: var(--erp-color-fill-default, #fff);
    cursor: pointer;
}

.retry-button:disabled {
    cursor: wait;
    opacity: .65;
}

.spinning {
    animation: dashboard-spin 1s linear infinite;
}

@keyframes dashboard-spin {
    to { transform: rotate(360deg); }
}

.dashboard-unavailable-icon {
    width: 40px;
    height: 40px;
    color: var(--erp-color-text-tertiary, #9ca3af);
}

.dashboard-unavailable h1,
.dashboard-unavailable p {
    margin: 0;
}

.dashboard-unavailable h1 {
    color: var(--erp-color-text-primary, #1f2937);
    font-size: 20px;
    font-weight: 600;
    line-height: 28px;
}

.dashboard-unavailable p {
    font-size: 14px;
    line-height: 22px;
}

@media (max-width: 1200px) {
    .stats-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .mid-row,
    .bottom-row {
        grid-template-columns: minmax(0, 1fr);
        min-height: 0;
    }

    .mid-col-wide,
    .mid-col-narrow,
    .bottom-col {
        min-height: 360px;
    }
}
</style>
