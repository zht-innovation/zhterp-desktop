<template>
    <ProductionExecutionDialog title="登记损耗" width="540px" :close-disabled="submitting" @close="emit('close')">
        <p v-if="loading" class="detail-note">正在读取可登记损耗数量…</p>
        <p v-else-if="loadError" class="form-error" role="alert">{{ loadError }} <button class="text-button" type="button" @click="reload">重试</button></p>
        <template v-else-if="order && material">
            <p class="detail-note">{{ order.documentNo }} · {{ material.name }}（{{ material.code }}）</p>
            <p class="detail-note">累计损耗 {{ material.lossQty }} {{ material.unit }}，本次最多可登记 {{ material.lossLimit }} {{ material.unit }}。</p>
            <p v-if="!canRegisterForOrder" class="form-error">{{ order.blockReason || '生产单当前不能登记损耗' }}</p>
            <form id="production-material-loss-form" class="loss-form" @submit.prevent="submit">
                <label>本次损耗数量（{{ material.unit }}）<input v-model="quantity" type="number" min="0.001" :max="material.lossLimit" step="0.001" required :disabled="submitting || !canRegisterForOrder" autofocus></label>
                <label>备注<textarea v-model="remark" maxlength="300" rows="3" :disabled="submitting" placeholder="填写损耗原因（选填）" /></label>
            </form>
            <p class="detail-note">仅登记已领出、尚未用于完工或退料的物料损耗，不会再次扣减仓库库存。</p>
        </template>
        <p v-else class="form-error">未找到对应生产单物料。</p>
        <p v-if="submitError" class="form-error" role="alert">{{ submitError }}</p>
        <template #footer>
            <button class="secondary-button" type="button" :disabled="submitting" @click="emit('close')">取消</button>
            <button class="primary-button" type="submit" form="production-material-loss-form" :disabled="loading || Boolean(loadError) || submitting || !canRegisterForOrder || !(material && material.lossLimit > 0)">{{ submitting ? '登记中…' : '确认登记' }}</button>
        </template>
    </ProductionExecutionDialog>
</template>

<script setup lang="ts">
import ProductionExecutionDialog from "~/components/production/ProductionExecutionDialog.vue";
import { useProductionExecution } from "~/composables/production/useProductionExecution";

const props = defineProps<{ orderId: string; productId: string }>();
const emit = defineEmits<{ close: []; registered: [] }>();
const { getOrder, loading, loadError, submitting, loadScope, registerMaterialLoss, canExecuteAction } = useProductionExecution();
const order = computed(() => getOrder(props.orderId));
const material = computed(() => order.value?.materials.find((item) => item.productId === props.productId));
const canRegister = computed(() => canExecuteAction("register-material-loss"));
const canRegisterForOrder = computed(() => canRegister.value && Boolean(order.value?.executable || order.value?.cleanupAllowed));
const quantity = ref("");
const remark = ref("");
const submitError = ref("");
const reload = () => loadScope({ productionOrderId: props.orderId });
watch(() => [props.orderId, props.productId], () => { quantity.value = ""; remark.value = ""; submitError.value = ""; void reload(); }, { immediate: true });

const submit = async () => {
    if (submitting.value || loading.value || loadError.value) return;
    submitError.value = "";
    const currentOrder = order.value;
    const currentMaterial = material.value;
    if (!canRegisterForOrder.value || !currentOrder || !currentMaterial) {
        submitError.value = "当前没有登记损耗的权限或生产单不可执行。";
        return;
    }
    const amount = Number(quantity.value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > currentMaterial.lossLimit
        || Math.abs(amount * 1000 - Math.round(amount * 1000)) > 0.000001) {
        submitError.value = "损耗数量必须大于零、不超过可登记上限，且最多三位小数。";
        return;
    }
    try {
        await registerMaterialLoss({ orderId: currentOrder.id, version: currentOrder.version, productId: currentMaterial.productId, quantity: amount, remark: remark.value.trim() });
        emit("registered");
    } catch (error: any) {
        submitError.value = error?.message || "登记损耗失败，请重试。";
    }
};
</script>

<style src="~/assets/css/production-execution.css"></style>
<style scoped>
.loss-form { display: grid; gap: 16px; margin: 18px 0; }
.loss-form label { display: grid; gap: 8px; color: #606266; font-size: 14px; }
.loss-form input, .loss-form textarea { box-sizing: border-box; width: 100%; padding: 9px 12px; border: 1px solid #dcdfe6; border-radius: 5px; font: inherit; }
.loss-form textarea { resize: vertical; }
</style>
