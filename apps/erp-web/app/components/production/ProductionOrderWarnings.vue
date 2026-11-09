<template>
    <section class="production-warnings" aria-label="生产预警与处理记录">
        <div class="warning-toolbar">
            <p>交期以计划完成日期为准。查看预警后，请填写处理方式并保存记录。</p>
            <button class="secondary-button" type="button" :disabled="loading || Boolean(savingId)" @click="emit('refresh')">刷新预警</button>
        </div>
        <p v-if="loading" class="warning-note" role="status">正在加载生产预警…</p>
        <p v-else-if="disabled" class="warning-note">预警数据暂不可用，请先重试生产单详情。</p>
        <p v-else-if="!warnings.length" class="warning-note">暂无生产预警。</p>
        <div v-else class="warning-list">
            <article v-for="warning in warnings" :key="warning.id" class="warning-card">
                <div class="warning-heading"><strong>交期 {{ warning.dueDate.slice(0, 10) }} · 提前 {{ warning.warningDays }} 天预警</strong><span class="warning-status" :class="{ handled: warning.handledAt }">{{ warning.handledAt ? '已处理' : '待处理' }}</span></div>
                <p class="warning-note">发布时间：{{ formatTime(warning.publishedAt) }}</p>
                <div v-if="warning.handledAt" class="handling-record">
                    <span>处理方式</span><p>{{ warning.handlingMethod }}</p>
                    <small>处理人：{{ warning.handledBy }} · 处理时间：{{ formatTime(warning.handledAt) }}</small>
                </div>
                <form v-else-if="canHandle" class="handling-form" @submit.prevent="submitHandling(warning)">
                    <label :for="`warning-method-${warning.id}`">处理方式 <span class="required">*</span></label>
                    <textarea :id="`warning-method-${warning.id}`" v-model="drafts[warning.id]" rows="3" maxlength="1000" required :disabled="Boolean(savingId)" placeholder="填写生产安排、跟进措施或交期处理方案（最多 1000 字）" />
                    <button class="primary-button" type="submit" :disabled="Boolean(savingId) || !drafts[warning.id]?.trim()">{{ savingId === warning.id ? '保存中…' : '保存处理记录' }}</button>
                </form>
            </article>
        </div>
        <p v-if="submitError" class="warning-error" role="alert">{{ submitError }}</p>
    </section>
</template>

<script setup lang="ts">
import { getToken } from "~/utils/auth";
import { canAccessConfigurationPath } from "~~/shared/utils/adminPermission";
import type { ProductionWarning } from "~~/shared/types/production-warning";

const props = withDefaults(defineProps<{
    productionOrderId: string;
    warnings: ProductionWarning[];
    loading?: boolean;
    disabled?: boolean;
}>(), { loading: false, disabled: false });
const emit = defineEmits<{ handled: []; refresh: [] }>();
const adminInfo = useState<{ role?: number }>("admin_info", () => ({}));
const canHandle = computed(() => canAccessConfigurationPath(Number(adminInfo.value?.role), "/configuration/production/production-orders"));
const drafts = reactive<Record<string, string>>({});
const savingId = ref("");
const submitError = ref("");
let disposed = false;

const formatTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
};
const submitHandling = async (warning: ProductionWarning) => {
    if (props.loading || props.disabled || savingId.value || !canHandle.value || warning.handledAt) return;
    submitError.value = "";
    const handlingMethod = String(drafts[warning.id] || "").trim();
    if (!handlingMethod || handlingMethod.length > 1000) {
        submitError.value = "请填写处理方式，最多 1000 字。";
        return;
    }
    savingId.value = warning.id;
    try {
        const response = await $fetch<{ code: number | string; msg?: string }>("/production/orders/add", {
            method: "POST", headers: { Token: getToken() || "" },
            body: { resource: "handle-warning", id: props.productionOrderId, warningId: warning.id, handlingMethod },
        });
        if (disposed) return;
        if (response?.code !== 200) throw new Error(response?.msg || "保存生产预警处理记录失败");
        delete drafts[warning.id];
        emit("handled");
    } catch (error: any) {
        if (disposed) return;
        submitError.value = error?.data?.msg || error?.message || "保存生产预警处理记录失败，请重试。";
        if (Number(error?.statusCode || error?.status || error?.response?.status) === 409) {
            submitError.value += " 请点击“刷新预警”核对最新处理记录。";
        }
    } finally {
        if (!disposed) savingId.value = "";
    }
};
onBeforeUnmount(() => { disposed = true; });
</script>

<style scoped>
.production-warnings { display: flex; flex-direction: column; gap: 14px; }
.warning-toolbar, .warning-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.warning-toolbar p, .warning-note { margin: 0; color: #909399; font-size: 12px; line-height: 20px; }
.warning-list { display: flex; flex-direction: column; gap: 14px; }
.warning-card { padding: 16px; border: 1px solid #e6e9ef; border-radius: 6px; }
.warning-heading { margin-bottom: 8px; }
.warning-heading strong { color: #303133; font-size: 13px; font-weight: 600; }
.warning-status { flex-shrink: 0; padding: 3px 7px; border-radius: 4px; background: #fdf6ec; color: #b77712; font-size: 12px; }
.warning-status.handled { background: #e9f7ef; color: #2b9b65; }
.handling-record, .handling-form { margin-top: 14px; }
.handling-record span, .handling-form label { color: #606266; font-size: 13px; }
.handling-record p { margin: 7px 0 10px; color: #303133; font-size: 13px; line-height: 22px; white-space: pre-wrap; overflow-wrap: anywhere; }
.handling-record small { color: #909399; font-size: 12px; }
.handling-form { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
.handling-form textarea { box-sizing: border-box; width: 100%; padding: 9px 10px; border: 1px solid #dcdfe6; border-radius: 5px; color: #303133; font: inherit; font-size: 13px; resize: vertical; }
.handling-form textarea:disabled { background: #f5f7fa; }
.primary-button, .secondary-button { flex-shrink: 0; padding: 7px 12px; border-radius: 5px; font: inherit; font-size: 13px; cursor: pointer; }
.primary-button { border: 1px solid #409eff; background: #409eff; color: #fff; }
.secondary-button { border: 1px solid #dcdfe6; background: #fff; color: #606266; }
button:disabled { opacity: .6; cursor: not-allowed; }
.required, .warning-error { color: #d9363e; }
.warning-error { margin: 0; font-size: 12px; line-height: 20px; }
@media (max-width: 650px) { .warning-toolbar, .warning-heading { align-items: flex-start; flex-wrap: wrap; } }
</style>
