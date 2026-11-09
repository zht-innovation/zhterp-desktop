<template>
    <div class="svg-container">
        <svg :viewBox="`0 0 ${width} ${height}`" class="chart-svg">
            <!-- 1. 竖向网格线 -->
            <g class="grids">
                <line v-for="(pt, i) in points" :key="`grid-${i}`" :x1="pt.x" :y1="height - padding.bottom" :x2="pt.x"
                    :y2="pt.y" stroke="#E0E6F1" stroke-width="1" />
            </g>

            <!-- 2. 折线路径 -->
            <path :d="linePath" fill="none" stroke="#2a82e4" stroke-width="1" />

            <!-- 3. 数据点 (圆点) -->
            <g class="dot">
                <circle v-for="(pt, i) in points" :key="`dot-${i}`" :cx="pt.x" :cy="pt.y"
                    :r="hoverIndex === i ? dotRadiusHover : dotRadius" fill="#2a82e4" class="dot-circle"
                    @mouseenter="hoverIndex = i" @mouseleave="hoverIndex = null" @focus="hoverIndex = i"
                    @blur="hoverIndex = null" tabindex="0">
                    <title>{{ tooltipText(i) }}</title>
                </circle>
            </g>

            <!-- 3.1 hover 提示框（避免浏览器对 SVG <title> 支持不一致） -->
            <g v-if="tooltip" class="tooltip" :transform="`translate(${tooltip.x}, ${tooltip.y})`">
                <rect :width="tooltip.w" :height="tooltip.h" rx="3" ry="3" />
                <text :x="tooltip.padding" :y="tooltip.textBaseline" class="tooltip-text">
                    {{ tooltip.text }}
                </text>
            </g>

            <!-- 4. 底部日期文字 -->
            <!-- 为了不拥挤，我们只显示首、中、尾，或者全部显示取决于宽度 -->
            <g class="labels">
                <text v-for="(pt, i) in points" :key="`txt-${i}`" :x="pt.x" :y="height - padding.bottom + 10"
                    text-anchor="middle" fill="#a4a6b1" font-size="6px">
                    {{ formatDate(labels[i], i, labels.length) }}
                </text>
            </g>
        </svg>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
    data: { type: Array, default: () => [] },
    labels: { type: Array, default: () => [] }
})

const hoverIndex = ref(null)
const dotRadius = 1.8
const dotRadiusHover = 4

// SVG 画布逻辑尺寸
const width = 200
const height = 120
const padding = { top: 15, bottom: 30, left: 15, right: 15 }

// 计算坐标点
const points = computed(() => {
    if (!props.data.length) return []

    const max = Math.max(...props.data) * 1.1
    const min = 0
    const chartH = height - padding.top - padding.bottom
    const chartW = width - padding.left - padding.right
    const len = props.data.length

    return props.data.map((val, i) => {
        const x = padding.left + (i / (len - 1)) * chartW
        // 翻转 Y 轴，因为 SVG 原点在左上
        const y = height - padding.bottom - ((val - min) / (max - min)) * chartH
        return { x, y }
    })
})

// 生成折线 Path
const linePath = computed(() => {
    if (!points.value.length) return ''
    return 'M' + points.value.map(p => `${p.x},${p.y}`).join(' L')
})

const tooltipText = (index) => {
    const val = props.data?.[index]
    const label = props.labels?.[index]
    if (label == null || label === '') return String(val ?? '')
    return `${label}: ${val ?? ''}`
}

const tooltip = computed(() => {
    if (hoverIndex.value == null) return null

    const index = hoverIndex.value
    const pt = points.value?.[index]
    if (!pt) return null

    const text = tooltipText(index)
    const fontSize = 6
    const paddingX = 4
    const paddingY = 3
    const estimatedTextW = Math.max(10, text.length * 3.6)
    const w = estimatedTextW + paddingX * 2
    const h = fontSize + paddingY * 2

    const clamp = (v, min, max) => Math.min(Math.max(v, min), max)
    const x = clamp(pt.x - w / 2, 0, width - w)
    const y = clamp(pt.y - h - 8, 0, height - h)

    return {
        x,
        y,
        w,
        h,
        text,
        padding: paddingX,
        textBaseline: paddingY + fontSize
    }
})

// 简单的日期过滤器：如果数据太多，可以只显示一部分，防止文字重叠
const formatDate = (dateStr, index, total) => {
    // 策略：如果是这种窄卡片，建议只显示 1月, 6月, 12月，或者隔点显示
    // 这里做个简单处理：只显示短月份名
    // 如果你需要显示全部，直接返回 dateStr 即可

    // 示例：仅显示首尾和中间
    if (index % 2 === 0) {
        return dateStr
    }
    return '' // 其他隐藏，保持页面清爽
}
</script>

<style scoped>
.svg-container {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    padding: 20px 10px 0 10px;
}

.chart-svg {
    width: 100%;
    height: 100%;
    display: block;
}

.dot-circle {
    cursor: pointer;
    outline: none;
}

.tooltip {
    pointer-events: none;
}

.tooltip rect {
    fill: rgba(32, 33, 34, 0.9);
}

.tooltip-text {
    fill: #fff;
    font-size: 6px;
}
</style>
