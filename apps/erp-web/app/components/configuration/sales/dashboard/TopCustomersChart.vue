<template>
    <div class="top-customers-card">
        <div class="card-header">
            <div class="title-row">
                <div class="title-indicator" />
                <span class="card-title">客户业绩 Top 5</span>
            </div>
            <button class="period-btn">本月</button>
        </div>
        <div class="chart-body">
            <div v-if="customers.length === 0" class="empty-hint">暂无数据</div>
            <div
                v-for="(item, i) in customers"
                :key="i"
                class="bar-row"
            >
                <span class="bar-name">{{ item.name }}</span>
                <div class="bar-track">
                    <div class="bar-fill" :style="{ width: barWidth(item.amount) }" />
                </div>
                <span class="bar-value">{{ item.amount.toFixed(2) }} 万元</span>
            </div>
            <!-- X轴刻度 -->
            <div class="bar-x-axis">
                <span v-for="tick in xTicks" :key="tick" class="x-tick">{{ tick }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
interface Props {
    customers: { name: string; amount: number }[];
}
const props = defineProps<Props>();

const maxAmount = computed(() => Math.max(1, ...props.customers.map((c) => c.amount)) * 1.1);

const barWidth = (amount: number) => {
    const pct = (amount / maxAmount.value) * 100;
    return `${Math.max(2, pct)}%`;
};

const xTicks = computed(() => {
    const m = maxAmount.value;
    const step = Math.ceil(m / 5 / 100) * 100 || 100;
    const ticks: number[] = [];
    for (let v = 0; v <= m * 1.05; v += step) ticks.push(v);
    return ticks;
});
</script>

<style scoped>
.top-customers-card {
    background: #fff;
    border: 1px solid #e6edf5;
    border-radius: 16px;
    box-shadow: 2px 2px 1px rgba(51, 51, 51, 0.05);
    padding: 20px 26px;
    display: flex;
    flex-direction: column;
    height: 100%;
}

.card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 32px;
}

.title-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.title-indicator {
    width: 3px;
    height: 16px;
    background: #3dabee;
    border-radius: 2px;
}

.card-title {
    font-size: 18px;
    font-weight: 500;
    color: #262626;
    font-family: "PingFang SC", sans-serif;
}

.period-btn {
    height: 36px;
    padding: 8px 18px;
    border-radius: 10px;
    border: 1px solid #e6edf5;
    background: #fff;
    color: #999;
    font-size: 14px;
    font-family: "PingFang SC", sans-serif;
    cursor: default;
}

.chart-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.empty-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #999;
    font-size: 14px;
}

.bar-row {
    display: flex;
    align-items: center;
    gap: 12px;
}

.bar-name {
    width: 180px;
    flex-shrink: 0;
    font-size: 16px;
    color: #4d4d4d;
    font-family: "PingFang SC", sans-serif;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.bar-track {
    flex: 1;
    height: 4px;
    background: #e8eef5;
    border-radius: 2px;
    position: relative;
}

.bar-fill {
    height: 100%;
    background: #3dabee;
    border-radius: 6px;
    transition: width 0.6s ease;
}

.bar-value {
    width: 100px;
    flex-shrink: 0;
    font-size: 16px;
    color: #4d4d4d;
    font-family: "PingFang SC", sans-serif;
    text-align: right;
}

.bar-x-axis {
    display: flex;
    justify-content: space-between;
    padding-left: 192px;
    padding-right: 112px;
    margin-top: 4px;
}

.x-tick {
    font-size: 14px;
    color: #999;
    font-family: "PingFang SC", sans-serif;
}
</style>
