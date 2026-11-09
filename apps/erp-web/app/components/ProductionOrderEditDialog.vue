<template>
    <div class="edit-backdrop erp-selectable" @click.self="closeDialog">
        <section class="edit-dialog" role="dialog" aria-modal="true" aria-label="修改生产单" @keydown.esc.stop.prevent="closeDialog">
            <header><h2>修改生产单</h2><button class="icon-button" type="button" aria-label="关闭修改生产单" :disabled="submitting" @click="closeDialog"><Icon name="lucide:x" /></button></header>
            <form @submit.prevent="submitEdit">
                <div class="edit-body">
                    <p v-if="loading" class="edit-hint" role="status">正在加载生产单…</p>
                    <p v-if="loadError" class="edit-error" role="alert">{{ loadError }} <button type="button" :disabled="loading || submitting" @click="loadOrder">重试</button></p>
                    <template v-if="order">
                        <fieldset class="edit-section"><legend>生产信息</legend>
                            <div class="edit-grid">
                                <label>生产单号<input :value="order.documentNo" readonly /></label>
                                <label>生产来源<input :value="order.sourceType === 'stock' ? '备货生产 · 无来源订单' : order.salesOrderNo || '来源订单未维护'" readonly /></label>
                                <label>生产状态<input :value="order.status" readonly /></label>
                                <label>产品名称<input :value="order.productName" readonly /></label>
                                <label>产品编号<input :value="order.productCode" readonly /></label>
                                <label>BOM 版本<input :value="order.bomVersion || '未维护'" readonly /></label>
                                <label>计划数量<input :value="`${order.planQty} ${order.unit}`" readonly /></label>
                                <label>负责人<input :value="order.owner || '未维护'" readonly /></label>
                            </div>
                        </fieldset>
                        <p v-if="!editableStatus" class="edit-error" role="status">该生产单当前为“{{ order.status }}”，不能修改。</p>
                        <fieldset class="edit-section" :disabled="submitting || statusChanged || !editableStatus"><legend>生产计划</legend>
                            <div class="edit-grid">
                                <label>计划开始 <span class="required">*</span><input v-model="form.planStart" type="date" required /></label>
                                <label>计划完成 <span class="required">*</span><input v-model="form.planFinish" type="date" :min="form.planStart || undefined" required /></label>
                                <label>生产预警<select v-model.number="form.warningDays"><option :value="3">交期前 3 天</option><option :value="5">交期前 5 天</option></select><small>以计划完成日期为交期，已发布的预警保留记录。</small></label>
                                <label>车间 <span class="required">*</span>
                                    <select v-model="form.workshop" :disabled="workshopsLoading" required><option value="">{{ workshopsLoading ? '正在加载车间…' : '请选择车间' }}</option><option v-for="workshop in workshopOptions" :key="workshop" :value="workshop">{{ workshop }}</option></select>
                                    <p v-if="workshopError" class="edit-error" role="alert">{{ workshopError }} <button type="button" :disabled="workshopsLoading || submitting" @click="loadWorkshops">重试</button></p>
                                </label>
                                <label>优先级<select v-model="form.priority"><option value="普通">普通</option><option value="紧急">紧急</option></select></label>
                                <label class="wide-field">生产备注<textarea v-model="form.remark" rows="2" maxlength="300" placeholder="填写批次或生产注意事项" /><small>最多 300 个字符。</small></label>
                                <label class="wide-field">机器号<textarea v-model="form.machineNumbers" rows="3" placeholder="每行一个，或连续号段，如 JQ001-JQ010（选填）" /><small>支持换行、逗号、分号及连续号段；机器号不能重复，数量不能超过计划数量。</small></label>
                            </div>
                        </fieldset>
                    </template>
                    <p v-if="submitError" class="edit-error" role="alert">{{ submitError }}</p>
                    <p v-if="statusChanged" class="edit-hint" role="status">生产单状态或版本已变化，请重新加载最新数据后修改。重新加载会重置表单。<button type="button" :disabled="loading || submitting" @click="loadOrder">重新加载</button></p>
                </div>
                <footer><button class="secondary-button" type="button" :disabled="submitting" @click="closeDialog">取消</button><button class="primary-button" type="submit" :disabled="!canSave">{{ submitting ? '保存中…' : '保存修改' }}</button></footer>
            </form>
        </section>
    </div>
</template>

<script setup lang="ts">
import { getToken } from "~/utils/auth";

interface EditableProductionOrder {
    id: string;
    documentNo: string;
    sourceType: "order" | "stock";
    salesOrderNo: string;
    productName: string;
    productCode: string;
    bomVersion: string;
    planQty: number;
    unit: string;
    owner: string;
    status: string;
    version: number;
    planStart: string;
    planFinish: string;
    warningDays: number;
    workshop: string;
    priority: string;
    remark: string;
    machineNumbers: string[];
}

const props = defineProps<{ productionOrderId: string }>();
const emit = defineEmits<{
    close: [];
    saved: [result: { documentNo: string }];
}>();

const order = ref<EditableProductionOrder | null>(null);
const loading = ref(false);
const loadError = ref("");
const submitting = ref(false);
const submitError = ref("");
const statusChanged = ref(false);
const workshops = ref<string[]>([]);
const workshopsLoading = ref(false);
const workshopError = ref("");
const form = reactive({ planStart: "", planFinish: "", warningDays: 3, workshop: "", priority: "普通", remark: "", machineNumbers: "" });
const editableStatus = computed(() => Boolean(order.value && ["草稿", "待发料", "待生产", "生产中"].includes(order.value.status)));
const canSave = computed(() => Boolean(order.value && editableStatus.value && !loading.value && !submitting.value && !statusChanged.value));
const workshopOptions = computed(() => {
    const options = [...workshops.value];
    const current = order.value?.workshop;
    if (current && !options.includes(current)) options.unshift(current);
    return options;
});
let disposed = false;
let orderSequence = 0;

const loadOrder = async () => {
    if (submitting.value) return;
    const sequence = ++orderSequence;
    const id = props.productionOrderId;
    loading.value = true;
    loadError.value = "";
    submitError.value = "";
    statusChanged.value = false;
    order.value = null;
    try {
        const response = await $fetch<{ code: number; msg?: string; data?: { order: EditableProductionOrder } }>("/production/orders/detail", {
            headers: { Token: getToken() || "" }, query: { id },
        });
        if (response?.code !== 200 || !response.data?.order) throw new Error(response?.msg || "加载生产单失败");
        if (disposed || sequence !== orderSequence || props.productionOrderId !== id) return;
        const current = response.data.order;
        order.value = current;
        form.planStart = String(current.planStart || "").slice(0, 10);
        form.planFinish = String(current.planFinish || "").slice(0, 10);
        form.warningDays = current.warningDays === 5 ? 5 : 3;
        form.workshop = current.workshop || "";
        form.priority = current.priority === "紧急" ? "紧急" : "普通";
        form.remark = current.remark || "";
        form.machineNumbers = (current.machineNumbers || []).join("\n");
    } catch (error: any) {
        if (!disposed && sequence === orderSequence && props.productionOrderId === id) loadError.value = error?.data?.msg || error?.message || "加载生产单失败";
    } finally {
        if (!disposed && sequence === orderSequence && props.productionOrderId === id) loading.value = false;
    }
};
const loadWorkshops = async () => {
    if (workshopsLoading.value || submitting.value) return;
    workshopsLoading.value = true;
    workshopError.value = "";
    try {
        const response = await $fetch<{ code: number; msg?: string; data?: string[] }>("/production/orders/list", {
            headers: { Token: getToken() || "" }, query: { resource: "workshops" },
        });
        if (response?.code !== 200 || !Array.isArray(response.data)) throw new Error(response?.msg || "加载车间失败");
        if (!disposed) workshops.value = response.data;
    } catch (error: any) {
        if (!disposed) workshopError.value = error?.data?.msg || error?.message || "加载车间失败";
    } finally {
        if (!disposed) workshopsLoading.value = false;
    }
};
const validateMachineNumbers = (value: string, planQty: number) => {
    const seen = new Set<string>();
    const tokens = value.split(/[\n,，;；]+/);
    for (const token of tokens) {
        const text = token.trim();
        if (!text) continue;
        const range = text.match(/^(.*?)(\d+)[-—–~～](.*?)(\d+)$/);
        let numbers = [text];
        if (range && (!range[3] || range[3] === range[1])) {
            const startDigits = range[2]!;
            const endDigits = range[4]!;
            const start = Number(startDigits);
            const end = Number(endDigits);
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end - start > 9999) return "机器号段不合法，请检查起止号码。";
            const width = Math.max(startDigits.length, endDigits.length);
            numbers = [];
            for (let number = start; number <= end; number += 1) numbers.push(`${range[1]}${String(number).padStart(width, "0")}`);
        }
        for (const number of numbers) {
            const key = number.toUpperCase();
            if (seen.has(key)) return "机器号不能重复。";
            seen.add(key);
            if (seen.size > planQty) return "机器号数量不能超过计划数量。";
        }
    }
    return "";
};
const closeDialog = () => { if (!submitting.value) emit("close"); };
const submitEdit = async () => {
    if (!canSave.value || !order.value) return;
    submitError.value = "";
    if (!form.planStart || !form.planFinish || form.planFinish < form.planStart || !form.workshop.trim()) {
        submitError.value = "请填写有效的计划日期和车间，计划完成不能早于计划开始。";
        return;
    }
    if (![3, 5].includes(form.warningDays)) {
        submitError.value = "请选择提前 3 天或 5 天预警。";
        return;
    }
    const machineError = validateMachineNumbers(form.machineNumbers, order.value.planQty);
    if (machineError) { submitError.value = machineError; return; }
    const current = order.value;
    const sequence = orderSequence;
    const id = props.productionOrderId;
    submitting.value = true;
    try {
        const response = await $fetch<{ code: number | string; msg?: string; data?: { documentNo?: string } }>("/production/orders/add", {
            method: "POST", headers: { Token: getToken() || "" },
            body: { resource: "update", id, version: current.version, planStart: form.planStart, planFinish: form.planFinish, workshop: form.workshop,
                warningDays: form.warningDays, priority: form.priority, remark: form.remark, machineNumbers: form.machineNumbers },
        });
        if (disposed || sequence !== orderSequence || props.productionOrderId !== id) return;
        if (response?.code !== 200) { submitError.value = response?.msg || "修改生产单失败"; return; }
        emit("saved", { documentNo: response.data?.documentNo || current.documentNo });
    } catch (error: any) {
        if (disposed || sequence !== orderSequence || props.productionOrderId !== id) return;
        submitError.value = error?.data?.msg || error?.message || "修改生产单失败";
        const status = Number(error?.statusCode || error?.status || error?.response?.status);
        if (status === 409 && error?.data?.code === "PRODUCTION_STATUS_CHANGED") statusChanged.value = true;
    } finally {
        if (!disposed && sequence === orderSequence && props.productionOrderId === id) submitting.value = false;
    }
};

onMounted(() => { void loadOrder(); void loadWorkshops(); });
watch(() => props.productionOrderId, () => { void loadOrder(); });
onBeforeUnmount(() => { disposed = true; orderSequence += 1; });
</script>

<style scoped>
.edit-backdrop { position: fixed; z-index: 2100; inset: 0; box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 16px; background: #18243a88; }
.edit-dialog { box-sizing: border-box; width: min(940px, 100%); max-height: 94vh; display: flex; flex-direction: column; overflow: hidden; border-radius: 8px; background: #fff; box-shadow: 0 24px 60px #0003; color: #303133; font-family: var(--erp-typography-font-family-base); }
.edit-dialog header, .edit-dialog footer { display: flex; align-items: center; justify-content: space-between; flex: 0 0 auto; gap: 10px; padding: 14px 20px; border-bottom: 1px solid #e7ebf0; }
.edit-dialog header { background: #f5f7fa; }
.edit-dialog h2 { margin: 0; font-size: 17px; }
.edit-dialog form { display: flex; flex-direction: column; min-height: 0; }
.edit-body { padding: 20px; overflow-y: auto; }
.edit-section { min-width: 0; margin: 0 0 20px; padding: 16px; border: 1px solid #dfe4eb; border-radius: 4px; }
.edit-section legend { padding: 0 6px; font-size: 14px; }
.edit-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px 20px; }
.edit-grid label { display: block; min-width: 0; font-size: 13px; }
.edit-grid input, .edit-grid select, .edit-grid textarea { box-sizing: border-box; width: 100%; min-height: 36px; margin-top: 6px; padding: 7px 9px; border: 1px solid #cfd5de; border-radius: 5px; background: #fff; color: #303133; font: inherit; }
.edit-grid input[readonly] { background: #f5f7fa; color: #7d8490; }
.edit-grid small { display: block; margin-top: 5px; color: #909399; font-size: 12px; line-height: 18px; }
.wide-field { grid-column: 1 / -1; }
.required { color: #e05a54; }
.edit-hint { margin: 8px 0 16px; color: #909399; font-size: 12px; line-height: 20px; }
.edit-error { margin: 12px 0; color: #d9363e; font-size: 12px; line-height: 20px; }
.edit-error button, .edit-hint button { margin-left: 6px; padding: 4px 8px; border: 1px solid #cfd5de; border-radius: 5px; background: #fff; color: #409eff; font: inherit; cursor: pointer; }
.edit-dialog footer { justify-content: flex-end; border-top: 1px solid #e7ebf0; border-bottom: 0; }
.primary-button, .secondary-button { min-height: 35px; padding: 8px 16px; border-radius: 5px; font: inherit; cursor: pointer; }
.primary-button { border: 1px solid #409eff; background: #409eff; color: #fff; }
.secondary-button { border: 1px solid #dcdfe6; background: #fff; color: #606266; }
.icon-button { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #606266; cursor: pointer; }
.icon-button :deep(svg) { width: 19px; height: 19px; }
.edit-dialog button:disabled { opacity: .55; cursor: not-allowed; }
.edit-section:disabled input, .edit-section:disabled select, .edit-section:disabled textarea { background: #f5f7fa; color: #909399; cursor: not-allowed; }
@media (max-width: 800px) { .edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .edit-grid { grid-template-columns: 1fr; } }
</style>
