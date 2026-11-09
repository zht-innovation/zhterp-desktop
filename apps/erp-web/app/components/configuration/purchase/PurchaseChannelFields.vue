<template>
    <section class="purchase-channel-fields">
        <label>
            <span>购买渠道</span>
            <select v-model="channel" aria-label="购买渠道">
                <option v-if="allowUnset" value="">未设置（历史采购单）</option>
                <option value="taobao">淘宝</option>
                <option value="other">其他购买渠道</option>
            </select>
        </label>
        <template v-if="channel === 'taobao'">
            <label v-if="showOrderNosInput">
                <span>淘宝订单号</span>
                <textarea
                    v-model="orderText"
                    rows="2"
                    placeholder="填写淘宝订单号，多个用换行或逗号分隔，最多20个"
                    aria-label="淘宝订单号"
                />
            </label>
            <div class="match-row">
                <button type="button" :disabled="matching" @click="matchOrders">
                    {{ matching ? "匹配中..." : "匹配运单" }}
                </button>
                <span role="status">{{ message || "可先保存，采集到运单后再同步。预览结果在保存时由服务端重新确认。" }}</span>
            </div>
            <p v-if="result?.unmatchedOrderNos.length">未匹配：{{ result.unmatchedOrderNos.join("、") }}</p>
            <ul v-if="result?.waybills.length">
                <li v-for="waybill in result.waybills" :key="waybill.trackingNo">
                    {{ waybill.courierCompany }}：{{ waybill.trackingNo }}
                    （淘宝订单 {{ waybill.platformOrderNos.join("、") }}）
                </li>
            </ul>
        </template>
        <p v-else-if="channel === 'other'">运单信息可暂不填写，待补录。</p>
    </section>
</template>

<script setup lang="ts">
import { resolveTaobaoWaybills } from "~/composables/api/usePurchaseOrderApi";
import type { PurchaseChannel, TaobaoMatchResult } from "~~/shared/types/logistics";
import { parsePlatformOrderNos, platformOrderNosError } from "~~/shared/utils/logistics";

withDefaults(defineProps<{ allowUnset?: boolean; showOrderNosInput?: boolean }>(), { showOrderNosInput: true });
const channel = defineModel<PurchaseChannel | "">("purchaseChannel", { required: true });
const orderNos = defineModel<string[]>("platformOrderNos", { required: true });
const matching = ref(false);
const result = ref<TaobaoMatchResult | null>(null);
const message = ref("");
const orderText = ref(orderNos.value.join("\n"));
watch(orderText, (value) => { orderNos.value = parsePlatformOrderNos(value); });
watch(orderNos, (value) => {
    if (JSON.stringify(parsePlatformOrderNos(orderText.value)) !== JSON.stringify(value)) {
        orderText.value = value.join("\n");
    }
}, { deep: true });
let revision = 0;
watch([channel, orderNos], () => {
    revision += 1;
    result.value = null;
    message.value = "";
}, { deep: true, flush: "sync" });

const matchOrders = async () => {
    if (matching.value) return;
    const error = platformOrderNosError(orderNos.value);
    if (error) { message.value = error; return; }
    matching.value = true;
    const version = revision;
    try {
        const response = await resolveTaobaoWaybills(orderNos.value);
        if (version !== revision) return;
        if (response.code !== 200 || !response.data) throw new Error(response.msg || "匹配失败");
        result.value = response.data;
        message.value = response.data.message;
    } catch (error: any) {
        if (version === revision) message.value = error?.data?.msg || error?.message || "运单匹配失败";
    } finally {
        matching.value = false;
    }
};
</script>

<style scoped>
.purchase-channel-fields { display: grid; gap: 12px; padding: 16px; border: 1px solid #e5e7eb; border-radius: 8px; }
label { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 12px; align-items: start; font-size: 13px; }
select, textarea { padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; font: inherit; background: white; width: 100%; box-sizing: border-box; }
textarea { resize: vertical; }
.match-row { display: flex; align-items: center; gap: 12px; }
button { padding: 6px 12px; border: 1px solid #cbd5e1; border-radius: 4px; background: white; cursor: pointer; white-space: nowrap; }
button:disabled { opacity: .6; cursor: wait; }
p, ul, .match-row span { margin: 0; font-size: 12px; color: #64748b; overflow-wrap: anywhere; }
ul { padding-left: 20px; }
</style>
