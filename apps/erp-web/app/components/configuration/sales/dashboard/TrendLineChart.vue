<template>
    <div class="trend-chart-card">
        <div class="chart-header">
            <div class="chart-title-row">
                <div class="title-indicator" />
                <span class="chart-title">近 30 天销售与回款趋势</span>
            </div>
            <div class="chart-tabs">
                <button
                    v-for="tab in tabs"
                    :key="tab.value"
                    class="tab-btn"
                    :class="{ active: activeTab === tab.value }"
                    @click="activeTab = tab.value"
                >
                    {{ tab.label }}
                </button>
            </div>
        </div>
        <div class="chart-legend">
            <div class="legend-item">
                <span class="legend-dot legend-dot-blue" />
                <span>销售金额（万元）</span>
            </div>
            <div class="legend-item">
                <span class="legend-dot legend-dot-green" />
                <span>回款金额（万元）</span>
            </div>
        </div>
        <div class="chart-body">
            <svg :viewBox="`0 0 ${svgW} ${svgH}`" class="chart-svg" preserveAspectRatio="xMidYMid meet">
                <!-- 横向网格线 + Y轴标签 -->
                <g v-for="(tick, i) in yTicks" :key="`grid-${i}`">
                    <line
                        :x1="padL" :y1="tick.y" :x2="svgW - padR" :y2="tick.y"
                        stroke="#e8eef5" stroke-width="1"
                    />
                    <text
                        :x="padL - 8" :y="tick.y + 4"
                        text-anchor="end" fill="#9aa5b1" font-size="13" font-family="Inter, sans-serif"
                    >
                        {{ tick.label }}
                    </text>
                </g>

                <!-- X轴日期标签 -->
                <g v-for="(label, i) in displayLabels" :key="`xlabel-${i}`">
                    <text
                        :x="xForIndex(i)" :y="svgH - padB + 20"
                        text-anchor="middle" fill="#999" font-size="14" font-family="PingFang SC, sans-serif"
                    >
                        {{ label }}
                    </text>
                </g>

                <!-- 销售折线 -->
                <polyline
                    :points="salesPointsStr"
                    fill="none" stroke="#3dabee" stroke-width="2"
                    stroke-linejoin="round" stroke-linecap="round"
                />
                <!-- 回款折线 -->
                <polyline
                    :points="collectPointsStr"
                    fill="none" stroke="#34c759" stroke-width="2"
                    stroke-linejoin="round" stroke-linecap="round"
                />

                <!-- 销售数据点 -->
                <circle
                    v-for="(pt, i) in salesPoints" :key="`sdot-${i}`"
                    :cx="pt.x" :cy="pt.y" r="2.5"
                    fill="#3dabee" class="hover-dot"
                    @mouseenter="hoverInfo = { x: pt.x, y: pt.y, sales: displaySales[i], collect: displayCollect[i], label: displayLabels[i] }"
                    @mouseleave="hoverInfo = null"
                />
            </svg>
        </div>
    </div>
</template>

<script setup lang="ts">
interface Props {
    dates: string[];
    salesAmount: number[];
    collectAmount: number[];
}
const props = defineProps<Props>();

const activeTab = ref<"30d" | "7d">("30d");
const tabs = [
    { label: "近7天", value: "7d" as const },
    { label: "近30天", value: "30d" as const },
];

const hoverInfo = ref<{ x: number; y: number; sales: number; collect: number; label: string } | null>(null);

// 根据 tab 切换显示数据
const displayDates = computed(() => {
    if (activeTab.value === "7d") return props.dates.slice(-7);
    return props.dates;
});
const displaySales = computed(() => {
    if (activeTab.value === "7d") return props.salesAmount.slice(-7);
    return props.salesAmount;
});
const displayCollect = computed(() => {
    if (activeTab.value === "7d") return props.collectAmount.slice(-7);
    return props.collectAmount;
});
const displayLabels = computed(() => displayDates.value);

// SVG 尺寸
const svgW = 920;
const svgH = 380;
const padL = 60;
const padR = 20;
const padT = 20;
const padB = 40;
const chartW = svgW - padL - padR;
const chartH = svgH - padT - padB;

// Y轴刻度
const yTicks = computed(() => {
    const allVals = [...displaySales.value, ...displayCollect.value];
    const maxVal = Math.max(1, ...allVals) * 1.15;
    const tickCount = 6;
    const step = Math.ceil(maxVal / tickCount / 100) * 100 || 100;
    const ticks: { y: number; label: string }[] = [];
    for (let i = 0; i <= tickCount; i++) {
        const val = step * i;
        if (val > maxVal * 1.1) break;
        ticks.push({
            y: padT + chartH - (val / maxVal) * chartH,
            label: val.toLocaleString(),
        });
    }
    return ticks;
});

const maxVal = computed(() => {
    const allVals = [...displaySales.value, ...displayCollect.value];
    return Math.max(1, ...allVals) * 1.15;
});

const xForIndex = (i: number) => {
    const len = displayLabels.value.length;
    if (len <= 1) return padL;
    return padL + (i / (len - 1)) * chartW;
};

const salesPoints = computed(() =>
    displaySales.value.map((v, i) => ({
        x: xForIndex(i),
        y: padT + chartH - (v / maxVal.value) * chartH,
    }))
);

const collectPoints = computed(() =>
    displayCollect.value.map((v, i) => ({
        x: xForIndex(i),
        y: padT + chartH - (v / maxVal.value) * chartH,
    }))
);

const salesPointsStr = computed(() => salesPoints.value.map((p) => `${p.x},${p.y}`).join(" "));
const collectPointsStr = computed(() => collectPoints.value.map((p) => `${p.x},${p.y}`).join(" "));
</script>

<style scoped>
.trend-chart-card {
    background: #fff;
    border: 1px solid #e6edf5;
    border-radius: 16px;
    box-shadow: 2px 2px 2px 0 rgba(51, 51, 51, 0.05);
    padding: 20px 26px;
    display: flex;
    flex-direction: column;
    height: 100%;
}

.chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
}

.chart-title-row {
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

.chart-title {
    font-size: 18px;
    font-weight: 500;
    color: #262626;
    font-family: "PingFang SC", sans-serif;
}

.chart-tabs {
    display: flex;
    gap: 6px;
}

.tab-btn {
    height: 36px;
    padding: 8px 18px;
    border-radius: 10px;
    border: 1px solid #e6edf5;
    background: #fff;
    color: #999;
    font-size: 14px;
    font-family: "PingFang SC", sans-serif;
    cursor: pointer;
    transition: all 0.2s;
}

.tab-btn.active {
    background: rgba(61, 171, 238, 0.1);
    border-color: #3dabee;
    color: #3dabee;
}

.chart-legend {
    display: flex;
    gap: 24px;
    margin-bottom: 12px;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    color: #262626;
    font-family: "PingFang SC", sans-serif;
}

.legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 5px;
}

.legend-dot-blue {
    background: #3dabee;
}

.legend-dot-green {
    background: #34c759;
}

.chart-body {
    flex: 1;
    min-height: 0;
}

.chart-svg {
    width: 100%;
    height: 100%;
    display: block;
}

.hover-dot {
    cursor: pointer;
    transition: r 0.15s;
}

.hover-dot:hover {
    r: 5;
}
</style>
