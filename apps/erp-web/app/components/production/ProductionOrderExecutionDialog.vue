<template>
    <ProductionExecutionDialog :title="order ? `生产单详情 · ${order.documentNo}` : '生产单详情'" width="1100px" @close="emit('close')">
        <p v-if="loading" class="detail-note">正在加载生产单…</p>
        <p v-else-if="loadError" class="form-error" role="alert">{{ loadError }} <button class="text-button" type="button" @click="reload">重试</button></p>
        <template v-else-if="order">
            <div class="detail-summary">
                <div><small>生产状态</small><strong><span class="status-pill" :class="order.status">{{ order.status }}</span></strong><small>{{ sourceLabel(order) }}</small></div>
                <div><small>生产对象</small><strong>{{ order.productName }}</strong><small>{{ order.productCode }} · {{ order.kind === 'component' ? '部件' : '成品' }} · {{ order.unit }}</small></div>
                <div><small>负责人 / 车间</small><strong>{{ order.owner }}</strong><small>{{ order.workshop }}</small></div>
            </div>
            <p v-if="order.blockReason" class="form-error">{{ order.blockReason }}</p>
            <div class="information-grid">
                <div><small>产品图片</small><ProductionImage :src="order.image" :name="order.productName" /></div>
                <div><small>计划日期</small><strong>{{ order.planStart }} 至 {{ order.planFinish }}</strong><small>BOM {{ order.bomVersion }}</small></div>
                <div><small>入库归属</small><strong>{{ receiptOwnership(order) }}</strong></div>
                <div><small>计划数量</small><strong>{{ order.planQty }} {{ order.unit }}</strong></div>
                <div><small>累计完工 / 合格入库</small><strong>{{ order.completedQty }} / {{ order.receivedQty }} {{ order.unit }}</strong></div>
                <div><small>本次可登记完工</small><strong>{{ order.completionLimit }} {{ order.unit }}</strong></div>
            </div>
            <div class="execution-tabs"><button type="button" :class="{ active: tab === 'materials' }" @click="tab = 'materials'">物料与发料</button><button type="button" :class="{ active: tab === 'completion' }" @click="tab = 'completion'">完工与入库</button></div>
            <ProductionExecutionRecords :production-order-id="order.id" :tab="tab" :data="snapshot" />
            <details><summary>机器号 · 只读</summary><p class="detail-note">{{ order.machineNumbers.join('、') || '暂无机器号' }}</p></details>
            <p class="detail-note">{{ order.remark || '暂无生产备注' }}</p>
        </template>
        <div v-else class="empty-panel">未找到对应生产单。</div>
        <template #footer><NuxtLink v-if="order && canOpenOrderPage" class="text-button" :to="{ path: '/configuration/production/production-orders', query: { id: order.id, tab } }">打开生产单页面</NuxtLink><button class="secondary-button" type="button" @click="emit('close')">关闭</button></template>
    </ProductionExecutionDialog>
</template>

<script setup lang="ts">
import ProductionExecutionDialog from "~/components/production/ProductionExecutionDialog.vue";
import ProductionImage from "~/components/production/ProductionImage.vue";
import ProductionExecutionRecords from "~/components/production/ProductionExecutionRecords.vue";
import { useProductionExecution } from "~/composables/production/useProductionExecution";
import { canAccessConfigurationPath } from "~~/shared/utils/adminPermission";

const props = defineProps<{ orderId: string }>();
const emit = defineEmits<{ close: [] }>();
const adminInfo = useState<{ role?: number }>("admin_info", () => ({}));
const canOpenOrderPage = computed(() => canAccessConfigurationPath(
    Number(adminInfo.value?.role), "/configuration/production/production-orders",
));
const { snapshot, getOrder, loading, loadError, loadScope, sourceLabel, receiptOwnership } = useProductionExecution();
const order = computed(() => getOrder(props.orderId));
const tab = ref<"materials" | "completion">("materials");
const reload = () => loadScope({ productionOrderId: props.orderId });
watch(() => props.orderId, () => { void reload(); }, { immediate: true });
</script>

<style src="~/assets/css/production-execution.css"></style>
<style scoped>
.execution-tabs { display: flex; gap: 20px; border-bottom: 1px solid #e9edf2; }
.execution-tabs button { padding: 8px 0; border: 0; border-bottom: 2px solid transparent; background: none; color: #606266; cursor: pointer; }
.execution-tabs button.active { border-bottom-color: #409eff; color: #409eff; }
</style>
