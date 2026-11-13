<template>
    <div class="data-center-page">
        <!-- 顶部标题栏 -->
        <div class="topbar">
            <div class="topbar-title">
                <Icon name="lucide:bar-chart-3" class="topbar-icon" />
                <span>订单看板</span>
            </div>
            <div class="search-box">
                <Icon name="lucide:search" class="search-icon" />
                <input
                    class="search-input"
                    type="search"
                    placeholder="输入你想要寻找的内容"
                    readonly
                >
                <button class="search-btn" type="button">搜索</button>
            </div>
        </div>

        <!-- 统计卡片行 -->
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

        <!-- 中间行：趋势图 + 客户Top5 -->
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

        <!-- 底部行：库存环形图 + 订单进度 -->
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
</template>

<script setup lang="ts">
import { getToken } from "~/utils/auth";
import StatCard from "~/components/configuration/sales/dashboard/StatCard.vue";
import TrendLineChart from "~/components/configuration/sales/dashboard/TrendLineChart.vue";
import TopCustomersChart from "~/components/configuration/sales/dashboard/TopCustomersChart.vue";
import StockDonutChart from "~/components/configuration/sales/dashboard/StockDonutChart.vue";
import OrderPipeline from "~/components/configuration/sales/dashboard/OrderPipeline.vue";

definePageMeta({ layout: "sales" });

// ── 默认空数据 ──
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
    low: 0, lowPercent: 0,
    high: 0, highPercent: 0,
    normal: 0, normalPercent: 0,
});

const orderPipeline = reactive({
    pendingAudit: 0,
    pendingPurchase: 0,
    producing: 0,
    pendingShip: 0,
    shipped: 0,
});

// ── 加载数据 ──
const loadData = async () => {
    try {
        const res = await $fetch<{ code: number; data?: any }>("/dashboard/stats", {
            headers: { Token: getToken() || "" },
        });
        if (res.code === 200 && res.data) {
            const d = res.data;

            Object.assign(summaryCards.monthlySales, d.summaryCards.monthlySales);
            Object.assign(summaryCards.pendingReceivable, d.summaryCards.pendingReceivable);
            Object.assign(summaryCards.purchaseWarning, d.summaryCards.purchaseWarning);
            Object.assign(summaryCards.productionOrders, d.summaryCards.productionOrders);

            salesTrend.dates = d.salesTrend.dates;
            salesTrend.salesAmount = d.salesTrend.salesAmount;
            salesTrend.collectAmount = d.salesTrend.collectAmount;

            topCustomers.value = d.topCustomers;

            Object.assign(stockSummary, d.stockSummary);
            Object.assign(orderPipeline, d.orderPipeline);
        }
    } catch (err) {
        console.error("Dashboard load error:", err);
    }
};

onMounted(() => {
    void loadData();
});
</script>

<style scoped>
.data-center-page {
    --d-color: #3dabee;
    --gray-15: #262626;
    --gray-40: #666;
    --gray-70: #b3b3b3;
    --page-bg: #f5f7fa;

    height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px;
    background: var(--page-bg);
    font-family: "PingFang SC", sans-serif;
    max-width: 1900px;
}

/* ── 顶部栏 ── */
.topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 40px;
}

.topbar-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 18px;
    font-weight: 500;
    color: var(--gray-15);
}

.topbar-icon {
    width: 24px;
    height: 24px;
    color: var(--d-color);
}

.search-box {
    width: 460px;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 4px 8px 12px;
    border-radius: 10px;
    background: #fff;
}

.search-icon {
    width: 24px;
    height: 24px;
    color: var(--gray-70);
}

.search-input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    font-size: 14px;
    color: var(--gray-15);
    background: transparent;
    font-family: "PingFang SC", sans-serif;
}

.search-input::placeholder {
    color: var(--gray-70);
}

.search-btn {
    width: 60px;
    height: 32px;
    border: 0;
    border-radius: 10px;
    background: var(--d-color);
    color: #fff;
    font-size: 14px;
    font-weight: 500;
    font-family: "PingFang SC", sans-serif;
    cursor: pointer;
}

/* ── 统计卡片行 ── */
.stats-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
}

/* ── 中间行：左宽(60%) 右窄(40%) ── */
.mid-row {
    display: grid;
    grid-template-columns: 3fr 2fr;
    gap: 20px;
    height: 416px;
}

.mid-col-wide,
.mid-col-narrow {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}

/* ── 底部行：左窄(40%) 右宽(60%) ── */
.bottom-row {
    display: grid;
    grid-template-columns: 2fr 3fr;
    gap: 20px;
    height: 380px;
}

.bottom-col {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}
</style>
