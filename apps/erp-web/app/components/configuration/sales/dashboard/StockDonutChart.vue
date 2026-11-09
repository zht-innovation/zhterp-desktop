<template>
    <div class="stock-card">
        <div class="card-header">
            <div class="title-row">
                <div class="title-indicator" />
                <span class="card-title">库存物料情况</span>
            </div>
        </div>
        <div class="chart-body">
            <div class="donut-section">
                <svg viewBox="0 0 214 214" class="donut-svg">
                    <!-- 底圈 -->
                    <circle cx="107" cy="107" r="80" fill="none" stroke="#f0f0f0" stroke-width="28" />
                    <!-- 过低 (红) -->
                    <circle
                        cx="107" cy="107" r="80"
                        fill="none"
                        stroke="#ff3b30"
                        stroke-width="28"
                        :stroke-dasharray="lowArc"
                        :stroke-dashoffset="0"
                        transform="rotate(-90 107 107)"
                    />
                    <!-- 过高 (橙) -->
                    <circle
                        cx="107" cy="107" r="80"
                        fill="none"
                        stroke="#ff9500"
                        stroke-width="28"
                        :stroke-dasharray="highArc"
                        :stroke-dashoffset="-lowArcLen"
                        transform="rotate(-90 107 107)"
                    />
                    <!-- 正常 (绿) -->
                    <circle
                        cx="107" cy="107" r="80"
                        fill="none"
                        stroke="#34c759"
                        stroke-width="28"
                        :stroke-dasharray="normalArc"
                        :stroke-dashoffset="-(lowArcLen + highArcLen)"
                        transform="rotate(-90 107 107)"
                    />
                    <!-- 内圈白底 -->
                    <circle cx="107" cy="107" r="66" fill="#fff" />
                    <text x="107" y="100" text-anchor="middle" fill="#999" font-size="16" font-family="PingFang SC, sans-serif">总计</text>
                    <text x="107" y="126" text-anchor="middle" fill="#262626" font-size="32" font-weight="800" font-family="Podkova, sans-serif">{{ total }}</text>
                </svg>
            </div>
            <div class="legend-section">
                <div class="legend-row">
                    <div class="legend-left">
                        <span class="legend-dot dot-red" />
                        <span class="legend-label">库存量过低</span>
                    </div>
                    <span class="legend-count">{{ low }}</span>
                    <span class="legend-pct pct-blue">{{ lowPct }}%</span>
                </div>
                <div class="legend-row">
                    <div class="legend-left">
                        <span class="legend-dot dot-orange" />
                        <span class="legend-label">库存量过高</span>
                    </div>
                    <span class="legend-count">{{ high }}</span>
                    <span class="legend-pct pct-blue">{{ highPct }}%</span>
                </div>
                <div class="legend-row">
                    <div class="legend-left">
                        <span class="legend-dot dot-green" />
                        <span class="legend-label">库存量正常</span>
                    </div>
                    <span class="legend-count">{{ normal }}</span>
                    <span class="legend-pct pct-blue">{{ normalPct }}%</span>
                </div>
            </div>
        </div>
        <div class="card-footer">
            <NuxtLink to="/configuration/inventory/basic-data/unit" class="footer-link">
                查看全部
                <span class="chevron">›</span>
            </NuxtLink>
        </div>
    </div>
</template>

<script setup lang="ts">
const props = defineProps<{
    total: number;
    low: number;
    lowPercent: number;
    high: number;
    highPercent: number;
    normal: number;
    normalPercent: number;
}>();

const circumference = 2 * Math.PI * 80; // ≈ 502.65

const lowPct = computed(() => (props.total > 0 ? Math.round((props.low / props.total) * 100) : 0));
const highPct = computed(() => (props.total > 0 ? Math.round((props.high / props.total) * 100) : 0));
const normalPct = computed(() => (props.total > 0 ? Math.round((props.normal / props.total) * 100) : 0));

const lowArcLen = computed(() => (lowPct.value / 100) * circumference);
const highArcLen = computed(() => (highPct.value / 100) * circumference);
const normalArcLen = computed(() => (normalPct.value / 100) * circumference);

const lowArc = computed(() => `${lowArcLen.value} ${circumference}`);
const highArc = computed(() => `${highArcLen.value} ${circumference}`);
const normalArc = computed(() => `${normalArcLen.value} ${circumference}`);
</script>

<style scoped>
.stock-card {
    background: #fff;
    border: 1px solid #e6edf5;
    border-radius: 16px;
    box-shadow: 2px 2px 2px 0 rgba(51, 51, 51, 0.05);
    padding: 20px 26px;
    display: flex;
    flex-direction: column;
    height: 100%;
}

.card-header {
    margin-bottom: 16px;
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

.chart-body {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 56px;
    padding: 0 20px;
}

.donut-section {
    flex-shrink: 0;
}

.donut-svg {
    width: 214px;
    height: 214px;
}

.legend-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 40px;
}

.legend-row {
    display: flex;
    align-items: center;
    gap: 40px;
}

.legend-left {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 140px;
}

.legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 5px;
    flex-shrink: 0;
}

.dot-red {
    background: #ff3b30;
}

.dot-orange {
    background: #ff9500;
}

.dot-green {
    background: #34c759;
}

.legend-label {
    font-size: 16px;
    color: #262626;
    font-family: "PingFang SC", sans-serif;
}

.legend-count {
    font-size: 16px;
    color: #262626;
    font-family: "PingFang SC", sans-serif;
    width: 40px;
    text-align: center;
}

.legend-pct {
    font-size: 16px;
    font-family: "PingFang SC", sans-serif;
    width: 40px;
    text-align: center;
}

.pct-blue {
    color: #3dabee;
}

.card-footer {
    padding-top: 12px;
    border-top: 1px solid #e8eef5;
    margin-top: 16px;
}

.footer-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 16px;
    color: #3dabee;
    text-decoration: none;
    font-family: "PingFang SC", sans-serif;
}

.chevron {
    font-size: 18px;
}
</style>
