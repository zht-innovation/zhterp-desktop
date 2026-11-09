<template>
    <div class="erp-dialog-mask logistics-tracking-mask" @click.self="emit('close')">
        <ErpDialogFrame title="物流轨迹" width="760px" :form="false" @close="emit('close')">
            <div class="logistics-tracking-body">
                <div class="history-toolbar">
                    <button type="button" :disabled="historyLoading || !selectedNo" @click="toggleHistory">
                        {{ historyOpen ? "隐藏查询记录" : "查询记录" }}
                    </button>
                </div>
                <section v-if="historyOpen" class="history-panel" aria-label="物流轨迹查询记录">
                    <p role="status">{{ historyError || (historyLoading ? "正在加载查询记录..." : "") }}</p>
                    <p v-if="!historyLoading && !historyError && !history.length">暂无查询记录</p>
                    <ol v-else-if="history.length" class="history-list">
                        <li v-for="(item, index) in history" :key="`${item.queriedAt}-${index}`">
                            <strong>{{ item.userName || item.username }}</strong>
                            <time>{{ formatTime(item.queriedAt) }}</time>
                        </li>
                    </ol>
                </section>
                <label>运单
                    <select v-model="selectedNo" :disabled="loading" aria-label="选择查询运单">
                        <option v-for="waybill in waybills" :key="waybill.trackingNo" :value="waybill.trackingNo">
                            {{ waybill.courierCompany || "其他" }}：{{ waybill.trackingNo }}
                        </option>
                    </select>
                </label>
                <label v-if="!knownCode">快递鸟公司编码
                    <input v-model.trim="customCode" :disabled="loading" maxlength="20" placeholder="例如 SF、ZTO；请按实际公司填写">
                </label>
                <label v-if="requiresPhone || code === 'JD'">
                    {{ requiresPhone ? "手机号后四位" : "京东商家编码" }}
                    <input
                        v-model.trim="customerName"
                        :disabled="loading"
                        :maxlength="requiresPhone ? 4 : 10"
                        :inputmode="requiresPhone ? 'numeric' : 'text'"
                        :placeholder="requiresPhone ? '寄件人或收件人的手机号后四位' : '10位青龙配送商家编码'"
                        autocomplete="off"
                    >
                </label>
                <div class="query-actions">
                    <button type="button" :disabled="loading" @click="load(false)">{{ loading ? "查询中..." : "查询物流" }}</button>
                    <button type="button" :disabled="loading || cooldown > 0" @click="load(true)">
                        {{ cooldown > 0 ? `${cooldown}秒后可刷新` : "刷新物流" }}
                    </button>
                </div>
                <p role="status">{{ errorMessage || result?.message || "请选择运单并查询。" }}</p>
                <template v-if="result">
                    <p>状态：{{ result.stateLabel || "--" }}　位置：{{ result.location || "--" }}</p>
                    <p>查询时间：{{ formatTime(result.queriedAt) }} {{ result.cached ? "（缓存）" : "" }} {{ result.stale ? "（历史轨迹，更新未成功）" : "" }}</p>
                    <p v-if="result.traces.length">最新节点：{{ result.traces[result.traces.length - 1]?.acceptStation }}</p>
                    <ol class="tracking-timeline">
                        <li v-for="(trace, index) in [...result.traces].reverse()" :key="index">
                            <time>{{ formatTime(trace.acceptTime) }}</time>
                            <span>{{ trace.acceptStation }}</span>
                        </li>
                    </ol>
                </template>
            </div>
            <template #footer><button type="button" class="close-tracking" @click="emit('close')">关闭</button></template>
        </ErpDialogFrame>
    </div>
</template>

<script setup lang="ts">
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import {
    queryLogisticsTracking,
    retrieveLogisticsTrackingHistory,
} from "~/composables/api/useLogisticsApi";
import type { LogisticsTrackingAuditRecord, LogisticsTrackingResult } from "~~/shared/types/logistics";
import { getCourierCode } from "~~/shared/utils/logistics";

const props = defineProps<{
    context: "purchase" | "inventory";
    recordId: string;
    waybills: Array<{ trackingNo: string; courierCompany?: string }>;
}>();
const emit = defineEmits<{ close: []; updated: [] }>();
const selectedNo = ref(props.waybills[0]?.trackingNo || "");
const customCode = ref("");
const customerName = ref("");
const loading = ref(false);
const result = ref<LogisticsTrackingResult | null>(null);
const errorMessage = ref("");
const historyOpen = ref(false);
const historyLoading = ref(false);
const historyError = ref("");
const history = ref<LogisticsTrackingAuditRecord[]>([]);
const clock = ref(Date.now());
const refreshAt = ref(0);
const cooldown = computed(() => Math.max(0, Math.ceil((refreshAt.value - clock.value) / 1000)));
const selectedWaybill = computed(() => props.waybills.find((item) => item.trackingNo === selectedNo.value));
const knownCode = computed(() => getCourierCode(selectedWaybill.value?.courierCompany || ""));
const code = computed(() => knownCode.value || customCode.value.toUpperCase());
const requiresPhone = computed(() => code.value === "SF" || code.value === "ZTO");
let timer: ReturnType<typeof setInterval> | undefined;
let revision = 0;

const formatTime = (value?: string | null) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "--";
const loadHistory = async () => {
    if (!selectedNo.value) return;
    historyLoading.value = true;
    historyError.value = "";
    try {
        const response = await retrieveLogisticsTrackingHistory(props.context, props.recordId, selectedNo.value);
        if (response.code !== 200 || !response.data) throw new Error(response.msg || "获取查询记录失败");
        history.value = response.data;
    } catch (error: any) {
        history.value = [];
        historyError.value = error?.data?.msg || error?.message || "获取查询记录失败";
    } finally {
        historyLoading.value = false;
    }
};
const toggleHistory = async () => {
    historyOpen.value = !historyOpen.value;
    if (historyOpen.value) await loadHistory();
};
const load = async (refresh: boolean) => {
    if (loading.value || !selectedNo.value) return;
    loading.value = true;
    errorMessage.value = "";
    const version = revision;
    try {
        const response = await queryLogisticsTracking(props.context, props.recordId, selectedNo.value, {
            customerName: customerName.value,
            shipperCode: code.value,
            refresh,
        });
        if (version !== revision) return;
        if (response.code !== 200 || !response.data) throw new Error(response.msg || "查询失败");
        result.value = response.data;
        if (response.data.transportStatusSynced === true) emit("updated");
        if (historyOpen.value) await loadHistory();
        const queriedAt = response.data.queriedAt ? Date.parse(response.data.queriedAt) : 0;
        const next = response.data.retryAfter > 0
            ? Date.now() + response.data.retryAfter * 1000
            : response.data.status === "success" || response.data.status === "no_traces" ? queriedAt + 60_000 : 0;
        refreshAt.value = next;
        clock.value = Date.now();
    } catch (error: any) {
        if (version === revision) errorMessage.value = error?.data?.msg || error?.message || "物流查询失败";
        if (historyOpen.value) await loadHistory();
    } finally {
        loading.value = false;
    }
};
watch(selectedNo, () => {
    revision += 1;
    customerName.value = "";
    customCode.value = "";
    result.value = null;
    errorMessage.value = "";
    refreshAt.value = 0;
    history.value = [];
    historyError.value = "";
    if (historyOpen.value) void loadHistory();
});
watch([customerName, customCode], () => {
    revision += 1;
    result.value = null;
    errorMessage.value = "";
    refreshAt.value = 0;
});
onMounted(() => {
    timer = setInterval(() => { clock.value = Date.now(); }, 1000);
    if (knownCode.value && !requiresPhone.value && code.value !== "JD") void load(false);
});
onBeforeUnmount(() => {
    revision += 1;
    if (timer) clearInterval(timer);
});
</script>

<style scoped>
.logistics-tracking-mask { z-index: 3100; }
.logistics-tracking-body { display: grid; gap: 14px; padding: 20px; max-height: 65vh; overflow: auto; }
.history-toolbar { display: flex; justify-content: flex-end; }
.history-panel { display: grid; gap: 8px; padding: 12px; border: 1px solid #cbd5e1; border-radius: 4px; }
.history-list { display: grid; gap: 8px; max-height: 180px; overflow: auto; margin: 0; padding: 0; list-style: none; }
.history-list li { display: flex; justify-content: space-between; gap: 16px; font-size: 13px; }
.history-list time { color: #64748b; }
label { display: grid; grid-template-columns: 120px minmax(0, 1fr); align-items: center; gap: 12px; }
input, select { padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; min-width: 0; }
.query-actions { display: flex; gap: 12px; }
button { padding: 8px 14px; border: 1px solid #cbd5e1; border-radius: 4px; background: white; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
p { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
.tracking-timeline { margin: 0; padding-left: 22px; }
.tracking-timeline li { padding: 8px 0; }
.tracking-timeline time { display: block; color: #64748b; font-size: 12px; margin-bottom: 4px; }
.close-tracking { margin-left: auto; }
</style>
