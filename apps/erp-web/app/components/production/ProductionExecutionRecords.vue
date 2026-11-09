<template>
    <div class="execution-records">
        <p v-if="loading && !data" class="record-note">正在加载生产执行记录…</p>
        <p v-else-if="loadError && !data" class="record-error" role="alert">{{ loadError }} <button type="button" @click="reload">重试</button></p>
        <template v-else>
            <p v-for="order in records.orders.filter(item => item.blockReason)" :key="order.id" class="record-error">{{ order.documentNo }}：{{ order.blockReason }}</p>
            <template v-if="tab === 'materials'">
                <div class="record-table-scroll"><table><thead><tr><th>生产单</th><th>物料 / 编码</th><th>需求</th><th>损耗补料</th><th>可用（含在途）</th><th>待出库</th><th>净已领</th><th>待退入库</th><th>单位</th><th v-if="canRegisterLoss">操作</th></tr></thead><tbody>
                    <template v-for="order in records.orders" :key="order.id">
                        <tr v-for="material in order.materials" :key="`${order.id}:${material.productId}`">
                            <td>{{ order.documentNo }}</td>
                            <td><strong>{{ material.name }}</strong><small>{{ material.code }}</small></td>
                            <td>{{ material.requiredQty }}</td>
                            <td>{{ material.lossQty ?? 0 }}</td>
                            <td class="material-availability">
                                {{ material.availableWithTransitQty ?? material.availableQty }}
                                <small>可领 {{ material.availableQty }} · 在途分配 {{ material.allocatedInTransitQty ?? 0 }}</small>
                            </td>
                            <td>{{ material.pendingQty }}</td><td>{{ material.issuedQty }}</td><td>{{ material.pendingReturnQty }}</td><td>{{ material.unit }}</td>
                            <td v-if="canRegisterLoss"><button class="loss-button" type="button" :disabled="!(order.executable || order.cleanupAllowed) || !(material.lossLimit > 0)" :title="order.blockReason || (!(order.executable || order.cleanupAllowed) ? '生产单当前不能登记损耗' : !(material.lossLimit > 0) ? '暂无可登记损耗的已领物料' : `最多可登记 ${material.lossLimit} ${material.unit}`)" @click="emit('registerLoss', order.id, material.productId)">登记损耗</button></td>
                        </tr>
                    </template>
                    <tr v-if="!records.orders.some(order => order.materials.length)"><td :colspan="canRegisterLoss ? 10 : 9" class="record-empty">暂无物料明细</td></tr>
                </tbody></table></div>
                <p class="record-note material-availability-note">可用（含在途）= 可领库存 + 在途分配。在途分配指已分配给本订单产品、尚未入库的采购数量，实际入库后才可领料。同一销售订单、同一订单产品下的同种物料共用余额，请勿按生产单重复累计。</p>
                <p class="record-note">需求已包含损耗补料；净已领为出库减实际退料，计算可完工与可退料数量时会再扣除损耗。</p>
                <template v-if="records.materialLosses?.length">
                    <h3>损耗登记记录</h3>
                    <div class="record-table-scroll"><table><thead><tr><th>日期</th><th>生产单</th><th>物料</th><th>损耗数量</th><th>登记人</th><th>备注</th></tr></thead><tbody>
                        <tr v-for="loss in records.materialLosses" :key="loss.id"><td>{{ loss.date }}</td><td>{{ orderNumber(loss.orderId) }}</td><td>{{ loss.materialName }}<small>{{ loss.materialCode }}</small></td><td>{{ loss.quantity }} {{ loss.unit }}</td><td>{{ loss.person }}</td><td>{{ loss.remark || '—' }}</td></tr>
                    </tbody></table></div>
                </template>
                <h3>关联发料单</h3>
                <div class="record-table-scroll"><table><thead><tr><th>发料单</th><th>生产单</th><th>申请人</th><th>状态</th><th>物料项</th><th v-if="canOpenRequisitions">操作</th></tr></thead><tbody>
                    <tr v-for="request in records.requisitions" :key="request.id"><td>{{ request.documentNo }}</td><td>{{ orderNumber(request.orderId) }}</td><td>{{ request.applicant }}</td><td>{{ request.status }}<small v-if="request.hasPendingReturn">待退料入库</small></td><td>{{ request.lines.length }}</td><td v-if="canOpenRequisitions"><NuxtLink :to="{ path: '/configuration/production/requisitions', query: { id: request.id, productionOrderId: request.orderId } }">查看</NuxtLink></td></tr>
                    <tr v-if="!records.requisitions.length"><td :colspan="canOpenRequisitions ? 6 : 5" class="record-empty">暂无发料记录</td></tr>
                </tbody></table></div>
            </template>
            <template v-else>
                <div class="record-table-scroll"><table><thead><tr><th>完工批次 / 日期</th><th>生产单 / 产品</th><th>本批完工</th><th>已入库</th><th>待入库</th><th>状态</th><th v-if="canOpenCompletion">操作</th></tr></thead><tbody>
                    <tr v-for="completion in records.completions" :key="completion.id"><td>{{ completion.documentNo }}<small>{{ completion.date }}</small></td><td>{{ orderNumber(completion.orderId) }}<small>{{ orderFor(completion.orderId)?.productName }}</small></td><td>{{ completion.quantity }} {{ orderFor(completion.orderId)?.unit }}</td><td>{{ completion.receivedQty }}</td><td>{{ completion.pendingQty }}</td><td>{{ completion.status }}</td><td v-if="canOpenCompletion"><NuxtLink :to="{ path: '/configuration/production/completion', query: { id: completion.id, productionOrderId: completion.orderId } }">查看</NuxtLink></td></tr>
                    <tr v-if="!records.completions.length"><td :colspan="canOpenCompletion ? 7 : 6" class="record-empty">暂无完工批次</td></tr>
                </tbody></table></div>
                <h3>关联入库单</h3>
                <div class="record-table-scroll"><table><thead><tr><th>入库单</th><th>日期</th><th>经办人</th><th>明细项</th><th v-if="canOpenCompletion">操作</th></tr></thead><tbody>
                    <tr v-for="receipt in records.receipts" :key="receipt.id"><td>{{ receipt.documentNo }}</td><td>{{ receipt.date }}</td><td>{{ receipt.person }}</td><td>{{ receipt.lines.length }}</td><td v-if="canOpenCompletion"><NuxtLink :to="{ path: '/configuration/production/completion', query: { receiptId: receipt.id, ...scope } }">查看</NuxtLink></td></tr>
                    <tr v-if="!records.receipts.length"><td :colspan="canOpenCompletion ? 5 : 4" class="record-empty">暂无生产入库单</td></tr>
                </tbody></table></div>
            </template>
            <div v-if="canOpenRequisitions || canOpenCompletion" class="record-actions"><NuxtLink v-if="canOpenRequisitions" :to="{ path: '/configuration/production/requisitions', query: scope }">前往发料管理</NuxtLink><NuxtLink v-if="canOpenCompletion" :to="{ path: '/configuration/production/completion', query: scope }">前往完工入库</NuxtLink></div>
        </template>
    </div>
</template>

<script setup lang="ts">
import type { ExecutionSnapshot } from "~~/shared/types/production-execution";
import { useProductionExecution } from "~/composables/production/useProductionExecution";
import { canAccessConfigurationPath } from "~~/shared/utils/adminPermission";

const props = withDefaults(defineProps<{ productionOrderId?: string; salesOrderId?: string; tab: "materials" | "completion"; data?: ExecutionSnapshot; allowMaterialLoss?: boolean }>(), { productionOrderId: "", salesOrderId: "", allowMaterialLoss: false });
const emit = defineEmits<{ registerLoss: [orderId: string, productId: string] }>();
const { snapshot, loading, loadError, loadScope, canExecuteAction } = useProductionExecution();
const adminInfo = useState<{ role?: number }>("admin_info", () => ({}));
const canOpenRequisitions = computed(() => canAccessConfigurationPath(Number(adminInfo.value?.role), "/configuration/production/requisitions"));
const canOpenCompletion = computed(() => canAccessConfigurationPath(Number(adminInfo.value?.role), "/configuration/production/completion"));
const canRegisterLoss = computed(() => props.allowMaterialLoss && canExecuteAction("register-material-loss"));
const scope = computed(() => props.productionOrderId ? { productionOrderId: props.productionOrderId } : { salesOrderId: props.salesOrderId });
const records = computed(() => props.data || snapshot.value);
const orderFor = (id: string) => records.value.orders.find((order) => order.id === id);
const orderNumber = (id: string) => orderFor(id)?.documentNo || "—";
const reload = () => { if (!props.data && (props.productionOrderId || props.salesOrderId)) void loadScope(scope.value); };
watch(() => [props.productionOrderId, props.salesOrderId], reload, { immediate: true });
</script>

<style scoped>
.execution-records { display: grid; gap: 14px; min-width: 0; }
.execution-records h3 { margin: 5px 0 0; font-size: 14px; font-weight: 600; }
.record-table-scroll { max-width: 100%; overflow-x: auto; }
.execution-records table { width: 100%; min-width: 700px; border-collapse: collapse; text-align: left; font-size: 13px; }
.execution-records th { padding: 11px 12px; color: #606266; background: #f5f7fa; font-size: 12px; font-weight: 500; white-space: nowrap; }
.execution-records td { padding: 12px; border-bottom: 1px solid #edf0f4; }
.execution-records td strong, .execution-records td small { display: block; }
.execution-records td small, .record-note { margin-top: 4px; color: #909399; font-size: 12px; }
.material-availability { min-width: 160px; white-space: nowrap; }
.material-availability-note { margin: 0; line-height: 1.7; overflow-wrap: anywhere; }
.record-empty { height: 100px; color: #909399; text-align: center; }
.record-error { margin: 0; color: #d9363e; font-size: 13px; }
.execution-records a, .record-error button { border: 0; background: none; color: #409eff; cursor: pointer; text-decoration: none; }
.record-actions { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; }
.loss-button { padding: 0; border: 0; background: none; color: #409eff; cursor: pointer; white-space: nowrap; font: inherit; }
.loss-button:disabled { color: #a8abb2; cursor: not-allowed; }
</style>
