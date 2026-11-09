<template>
    <ProductionExecutionDialog title="额外分配物料到订单" width="820px" :close-disabled="submitting" @close="requestClose">
        <p v-if="loading" class="detail-note">正在读取公共未分配库存…</p>
        <p v-else-if="loadError" class="form-error" role="alert">{{ loadError }} <button class="text-button" type="button" @click="reload">重试</button></p>
        <template v-else-if="context">
            <div class="allocation-content">
                <div class="allocation-summary">
                    <div><strong>{{ context.salesOrderNo }}</strong><small>目标订单</small></div>
                    <div><strong>{{ context.relatedProductionOrderCount }} 张</strong><small>关联生产单</small></div>
                    <div><strong>订单物料池</strong><small>分配后仍需申请发料</small></div>
                </div>
                <p v-if="!canAllocate" class="form-error">当前没有额外分配物料的权限。</p>
                <form id="production-material-allocation-form" class="allocation-form" novalidate @submit.prevent="submit">
                    <label class="field">
                        <span>物料 <b class="required-mark">*</b></span>
                        <select v-model="selectedProductId" required :disabled="formLocked || !materials.length">
                            <option v-if="selectedMissing" :value="selectedProductId" disabled>{{ selectedMaterialLabel }}（库存已耗尽）</option>
                            <option v-else-if="!selectedProductId" value="" disabled>暂无可分配库存</option>
                            <option v-for="material in materials" :key="material.productId" :value="material.productId" :disabled="!(material.publicAvailableQty > 0)">{{ material.code }} · {{ material.name }}{{ material.publicAvailableQty > 0 ? '' : '（无公共库存）' }}</option>
                        </select>
                    </label>
                    <label class="field">
                        <span>公共库存可用</span>
                        <input class="public-quantity" :value="publicQuantityLabel" type="text" readonly tabindex="-1">
                    </label>
                    <label class="field">
                        <span>分配数量 <b class="required-mark">*</b></span>
                        <input v-model="quantity" type="number" inputmode="decimal" min="0.001" :max="selectedMaterial?.publicAvailableQty" step="0.001" required placeholder="请输入" :disabled="formLocked || !currentMaterialCanAllocate">
                    </label>
                    <label class="field allocation-reason">
                        <span>分配原因 <b class="required-mark">*</b></span>
                        <select v-model="reason" required :disabled="formLocked"><option v-for="item in PUBLIC_MATERIAL_ALLOCATION_REASONS" :key="item" :value="item">{{ item }}</option></select>
                    </label>
                    <label class="field allocation-person">
                        <span>经办人 <b class="required-mark">*</b></span>
                        <input v-model="person" type="text" maxlength="40" required :disabled="formLocked">
                    </label>
                    <label class="field allocation-remark">
                        <span>分配说明 <b class="required-mark">*</b></span>
                        <textarea v-model="remark" maxlength="300" rows="2" required placeholder="例如：订单赶工，补充分配公共库存中的可用物料" :disabled="formLocked" />
                    </label>
                </form>
                <p v-if="selectedUnavailable" class="form-error" role="alert">{{ selectedMaterialLabel }} 已无公共库存，原输入已保留，请重新选择物料。</p>
                <p v-else-if="!materials.length" class="detail-note">本单暂无 BOM 物料。</p>
                <p v-else-if="!hasAvailableMaterials" class="detail-note">本单 BOM 物料暂无公共未分配库存，可展开查看全部物料。</p>
                <p class="detail-note">确认后从公共库存转入当前订单物料池，不代表已发料或已出库；生产单仍须按正常发料流程领用。</p>
            </div>
        </template>
        <p v-if="retryInput" class="detail-note">上次提交结果尚未确认，请点击“重试分配”确认同一次分配。</p>
        <p v-if="submitError" class="form-error" role="alert">{{ submitError }}</p>
        <template #footer>
            <button class="secondary-button" type="button" :disabled="submitting" @click="requestClose">取消</button>
            <button class="primary-button" type="submit" form="production-material-allocation-form" :disabled="submitDisabled">{{ submitting ? '分配中…' : retryInput ? '重试分配' : '确认分配' }}</button>
        </template>
    </ProductionExecutionDialog>
</template>

<script setup lang="ts">
import ProductionExecutionDialog from "~/components/production/ProductionExecutionDialog.vue";
import { useProductionExecution } from "~/composables/production/useProductionExecution";
import { PUBLIC_MATERIAL_ALLOCATION_REASONS, type ProductionPublicMaterials, type PublicMaterialAllocationInput, type PublicMaterialAllocationReason } from "~~/shared/types/production-execution";

const props = defineProps<{ orderId: string }>();
const emit = defineEmits<{ close: []; allocated: [] }>();
const { submitting, operatorName, loadPublicMaterials, allocatePublicMaterials, canExecuteAction } = useProductionExecution();
const context = ref<ProductionPublicMaterials | null>(null);
const loading = ref(false);
const loadError = ref("");
const submitError = ref("");
const selectedProductId = ref("");
const selectedMaterialLabel = ref("");
const selectedMaterialUnit = ref("");
const quantity = ref("");
const reason = ref<PublicMaterialAllocationReason>("赶工补料");
const person = ref(operatorName.value);
const remark = ref("");
const retryInput = ref<PublicMaterialAllocationInput | null>(null);
const canAllocate = computed(() => canExecuteAction("allocate-public-materials"));
const materials = computed(() => context.value?.materials || []);
const hasAvailableMaterials = computed(() => materials.value.some((item) => item.publicAvailableQty > 0));
const selectedMaterial = computed(() => materials.value.find((item) => item.productId === selectedProductId.value));
const currentMaterialCanAllocate = computed(() => Boolean(selectedMaterial.value && selectedMaterial.value.publicAvailableQty > 0));
const selectedMissing = computed(() => Boolean(selectedProductId.value && !selectedMaterial.value));
const selectedUnavailable = computed(() => Boolean(selectedProductId.value && !currentMaterialCanAllocate.value));
const publicQuantityLabel = computed(() => {
    if (!selectedProductId.value) return hasAvailableMaterials.value ? "—" : "0";
    return `${selectedMaterial.value?.publicAvailableQty ?? 0} ${selectedMaterial.value?.unit || selectedMaterialUnit.value}`;
});
const formLocked = computed(() => submitting.value || !canAllocate.value || Boolean(retryInput.value));
const submitDisabled = computed(() => loading.value || Boolean(loadError.value) || submitting.value || !canAllocate.value || !context.value
    || (!retryInput.value && (!currentMaterialCanAllocate.value || !(Number(quantity.value) > 0) || !person.value.trim() || !remark.value.trim())));
let loadSequence = 0;
let initialized = false;

watch(selectedProductId, () => {
    quantity.value = "";
    submitError.value = "";
    const material = selectedMaterial.value;
    if (material) {
        selectedMaterialLabel.value = `${material.code} · ${material.name}`;
        selectedMaterialUnit.value = material.unit;
    }
});

const requestClose = () => {
    if (!submitting.value) emit("close");
};
const reload = async () => {
    if (submitting.value || retryInput.value) return;
    const sequence = ++loadSequence;
    loading.value = true;
    loadError.value = "";
    try {
        const data = await loadPublicMaterials(props.orderId);
        if (sequence === loadSequence) {
            context.value = data;
            if (!initialized) {
                selectedProductId.value = materials.value.find((item) => item.publicAvailableQty > 0)?.productId || "";
                initialized = true;
            }
        }
    } catch (error: any) {
        if (sequence === loadSequence) loadError.value = error?.data?.msg || error?.message || "加载公共物料库存失败，请重试。";
    } finally {
        if (sequence === loadSequence) loading.value = false;
    }
};
watch(() => props.orderId, () => {
    context.value = null;
    submitError.value = "";
    retryInput.value = null;
    selectedProductId.value = "";
    selectedMaterialLabel.value = "";
    selectedMaterialUnit.value = "";
    quantity.value = "";
    reason.value = "赶工补料";
    person.value = operatorName.value;
    remark.value = "";
    initialized = false;
    void reload();
}, { immediate: true });

const submit = async () => {
    if (submitting.value || loading.value || loadError.value) return;
    submitError.value = "";
    const current = context.value;
    if (!canAllocate.value || !current) {
        submitError.value = "当前没有额外分配物料的权限或生产单信息无效。";
        return;
    }
    let input = retryInput.value;
    if (!input) {
        const material = selectedMaterial.value;
        if (!material || !currentMaterialCanAllocate.value) {
            submitError.value = "请选择有公共可用库存的物料。";
            return;
        }
        const amount = Number(quantity.value);
        if (!Number.isFinite(amount) || amount <= 0 || amount > material.publicAvailableQty
            || Math.abs(amount * 1000 - Math.round(amount * 1000)) > 0.000001) {
            submitError.value = "分配数量须为正数、最多三位小数，且不超过公共库存可用量。";
            return;
        }
        if (!PUBLIC_MATERIAL_ALLOCATION_REASONS.includes(reason.value)) {
            submitError.value = "请选择有效的分配原因。";
            return;
        }
        const operator = person.value.trim();
        if (!operator || operator.length > 40) {
            submitError.value = "请填写经办人，最多 40 字。";
            return;
        }
        const description = remark.value.trim();
        if (!description || description.length > 300) {
            submitError.value = "请填写分配说明，最多 300 字。";
            return;
        }
        input = {
            orderId: current.orderId, version: current.version,
            lines: [{ productId: material.productId, quantity: amount }],
            reason: reason.value, person: operator, remark: description,
        };
    }
    try {
        await allocatePublicMaterials(input);
        retryInput.value = null;
        emit("allocated");
    } catch (error: any) {
        submitError.value = error?.message || "分配失败，请重试。";
        const statusCode = Number(error?.statusCode || error?.status || 0);
        if (statusCode === 409) {
            retryInput.value = null;
            await reload();
        } else if (!statusCode || statusCode >= 500) {
            // 保留原版本、数量与幂等键，重试不创建第二次分配。
            retryInput.value = input;
        } else {
            retryInput.value = null;
        }
    }
};
</script>

<style src="~/assets/css/production-execution.css"></style>
<style scoped>
.allocation-content { display: grid; gap: 12px; min-width: 0; }
.allocation-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; padding: 15px; border-radius: 6px; background: #f5f7fa; }
.allocation-summary div { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.allocation-summary strong { color: #303133; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.allocation-summary small { color: #909399; font-size: 12px; }
.allocation-form { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: start; gap: 16px; min-width: 0; }
.allocation-form .field { gap: 7px; }
.allocation-form .field input, .allocation-form .field select { width: 100%; height: 35px; font-size: 13px; }
.allocation-form select option:disabled { color: #a8abb2; }
.allocation-form .required-mark { color: #f56c6c; font-weight: 400; }
.allocation-form .public-quantity { color: #909399; background: #f5f7fa; }
.allocation-reason { grid-column: 1; }
.allocation-person { grid-column: 2; }
.allocation-remark { grid-column: 1 / span 2; }
.allocation-form .field textarea { width: 100%; min-height: 60px; height: 60px; font-size: 13px; resize: vertical; }
@media (max-width: 650px) {
    .allocation-summary, .allocation-form { grid-template-columns: 1fr; }
    .allocation-reason, .allocation-person, .allocation-remark { grid-column: 1; }
}
</style>
