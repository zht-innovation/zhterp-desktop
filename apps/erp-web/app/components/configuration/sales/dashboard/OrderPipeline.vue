<template>
    <div class="pipeline-card">
        <div class="card-header">
            <div class="title-row">
                <div class="title-indicator" />
                <span class="card-title">订单履约进度</span>
            </div>
            <span class="subtitle">从订单到达的整体状态</span>
        </div>
        <div class="pipeline-body">
            <div
                v-for="(step, i) in steps"
                :key="step.label"
                class="step-group"
            >
                <div class="step-box" :style="{ borderColor: step.color }">
                    <span class="step-value" :style="{ color: step.color }">{{ step.value }}</span>
                </div>
                <span class="step-label">{{ step.label }}</span>
                <div v-if="i < steps.length - 1" class="step-arrow" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const props = defineProps<{
    pendingAudit: number;
    pendingPurchase: number;
    producing: number;
    pendingShip: number;
    shipped: number;
}>();

const steps = computed(() => [
    { label: "待审核", value: props.pendingAudit, color: "#3dabee" },
    { label: "待采购", value: props.pendingPurchase, color: "#5856d6" },
    { label: "生产中", value: props.producing, color: "#ffcc00" },
    { label: "待发货", value: props.pendingShip, color: "#00c7be" },
    { label: "已出库", value: props.shipped, color: "#34c759" },
]);
</script>

<style scoped>
.pipeline-card {
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

.subtitle {
    font-size: 12px;
    color: #9aa7b8;
    font-family: "PingFang SC", sans-serif;
}

.pipeline-body {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
}

.step-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    position: relative;
}

.step-box {
    width: 67px;
    height: 67px;
    border: 1.5px solid;
    border-radius: 8px;
    background: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
}

.step-value {
    font-size: 25px;
    font-weight: 500;
    font-family: "PingFang SC", sans-serif;
}

.step-label {
    font-size: 16px;
    color: #4d5b6b;
    font-family: "PingFang SC", sans-serif;
    white-space: nowrap;
}

.step-arrow {
    position: absolute;
    right: -46px;
    top: 28px;
    width: 40px;
    height: 2px;
    background: #e8eef5;
}

.step-arrow::after {
    content: "";
    position: absolute;
    right: -1px;
    top: -4px;
    width: 0;
    height: 0;
    border-left: 6px solid #e8eef5;
    border-top: 5px solid transparent;
    border-bottom: 5px solid transparent;
}

.step-group:not(:last-child) {
    margin-right: 60px;
}
</style>
