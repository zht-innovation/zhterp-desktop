<template>
    <div class="stat-card">
        <div class="stat-card-body">
            <div class="stat-info">
                <p class="stat-title">{{ title }}</p>
                <div class="stat-value-row">
                    <span class="stat-value">{{ formattedValue }}</span>
                    <span class="stat-unit">{{ unit }}</span>
                </div>
                <div class="stat-change-row">
                    <span
                        class="stat-badge"
                        :class="changeClass"
                    >
                        {{ changePrefix }}{{ Math.abs(change) }}%
                    </span>
                    <span class="stat-change-label">环比上月</span>
                </div>
            </div>
            <div class="stat-icon" :style="{ background: iconBg }">
                <span class="stat-icon-text" :style="{ color: iconColor }">{{ iconText }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const props = defineProps<{
    title: string;
    value: number;
    unit: string;
    change: number;
    iconText: string;
    iconColor: string;
    iconBg: string;
}>();

const formattedValue = computed(() => {
    if (props.value >= 1000) {
        return props.value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return props.value % 1 === 0 ? String(props.value) : props.value.toFixed(2);
});

const changePrefix = computed(() => (props.change >= 0 ? "↑ " : "↓ "));
const changeClass = computed(() => (props.change >= 0 ? "badge-green" : "badge-red"));
</script>

<style scoped>
.stat-card {
    background: #fff;
    border: 1px solid #e6edf5;
    border-radius: 16px;
    padding: 20px 26px;
    box-shadow: 2px 2px 1px rgba(51, 51, 51, 0.05);
}

.stat-card-body {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
}

.stat-info {
    flex: 1;
    min-width: 0;
}

.stat-title {
    font-size: 18px;
    font-weight: 500;
    color: #4d4d4d;
    font-family: "PingFang SC", sans-serif;
    margin: 0 0 4px 0;
}

.stat-value-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    height: 51px;
    line-height: 1;
}

.stat-value {
    font-size: 46px;
    font-weight: 800;
    color: #262626;
    font-family: "Podkova", "PingFang SC", sans-serif;
    white-space: nowrap;
    line-height: 1;
}

.stat-unit {
    font-size: 16px;
    color: #666;
    font-family: "PingFang SC", sans-serif;
    line-height: 1;
    padding-bottom: 4px;
}

.stat-change-row {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 4px;
}

.stat-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 12px;
    border-radius: 14px;
    font-size: 14px;
    font-weight: 500;
    font-family: "PingFang SC", sans-serif;
}

.badge-green {
    background: rgba(52, 199, 89, 0.1);
    color: #34c759;
}

.badge-red {
    background: rgba(255, 59, 48, 0.1);
    color: #ff3b30;
}

.stat-change-label {
    font-size: 16px;
    color: #999;
    font-family: "PingFang SC", sans-serif;
}

.stat-icon {
    width: 60px;
    height: 60px;
    border-radius: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.stat-icon-text {
    font-size: 28px;
    font-weight: 700;
    font-family: "PingFang SC", sans-serif;
}
</style>
