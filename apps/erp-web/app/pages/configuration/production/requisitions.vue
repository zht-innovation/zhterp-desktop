<template>
    <div class="production-execution-page">
        <header class="page-topbar">
            <ErpBreadcrumb icon="lucide:package-open" :items="[{ label: '生产管理' }, { label: '发料管理' }]" />
            <ErpSearchBox v-model="searchText" placeholder="搜索发料单、生产单、订单或物料" @search="applySearch" />
        </header>
        <section class="page-heading"><h1>发料管理</h1><p>{{ canPreviewOrder ? '创建、出库与退料' : '查看发料明细与操作记录' }}</p></section>
        <section class="status-cards" aria-label="发料状态统计">
            <button v-for="status in cardStatuses" :key="status" type="button" :class="{ active: statusFilter === status }" @click="chooseStatus(status)"><span>{{ status }}</span><strong>{{ statusCount(status) }}</strong><small>张发料单</small></button>
        </section>
        <section class="list-card">
            <div class="list-actions"><button v-if="canExecuteAction('create-requisition')" class="primary-button" type="button" @click="openCreate"><Icon name="lucide:plus" />新建发料单</button><span class="list-help">申请时占用可用物料，确认出库后更新已领数量。</span></div>
            <div class="filter-row"><div class="filter-tabs" role="group" aria-label="按发料状态筛选"><button v-for="status in filterStatuses" :key="status" type="button" :class="{ active: statusFilter === status }" @click="chooseStatus(status)">{{ status }}<span>{{ statusCount(status) }}</span></button></div></div>
            <ErpTableFrame :columns="tableColumns" minimum-width="1100px" :loading="loading" :empty="!loading && visibleRows.length === 0" empty-text="暂无匹配的发料单" scroll-x>
                <template #header><div class="table-row table-header"><div>发料单</div><div>生产单 / 订单</div><div>物料</div><div>申请人</div><div>状态</div><div>已出库项 / 物料项</div><div>退料</div><div>操作</div></div></template>
                <div v-for="row in visibleRows" :key="row.id" class="table-row table-data">
                    <div class="stack"><strong>{{ row.documentNo }}</strong></div>
                    <div class="stack"><button v-if="canPreviewOrder" class="text-button erp-selectable-text" type="button" @click="openOrderPreview(row.orderId, $event)">{{ orderNumber(row.orderId) }}</button><strong v-else>{{ orderNumber(row.orderId) }}</strong><small>{{ sourceText(row) }}</small></div>
                    <div>{{ row.lines.length }} 项物料</div><div>{{ row.applicant }}</div>
                    <div><span class="status-pill" :class="statusClass(requisitionStatus(row))">{{ requisitionStatus(row) }}</span></div>
                    <div class="stack"><strong>{{ row.lines.filter(line => line.issued > 0).length }} / {{ row.lines.length }} 项</strong><small v-if="row.lines.some(line => requisitionPending(line) > 0)">待出库 {{ row.lines.filter(line => requisitionPending(line) > 0).length }} 项</small></div>
                    <div class="stack"><span>{{ returnItemCount(row) ? `${returnItemCount(row)} 项有退料` : '—' }}</span><small v-if="hasPendingReturn(row)" class="return-pending">待退料入库</small></div>
                    <div><button class="text-button" type="button" @click="selectedId = row.id">查看</button></div>
                </div>
            </ErpTableFrame>
            <InventoryPagination v-model:page-size="pageSize" v-model:jump-page-input="jumpPageInput" :total="pagination.total" :page-size-options="[5, 10, 15]" :total-pages="totalPages" :current-page="currentPage" @page-change="goToPage" @jump="jumpToInputPage" />
        </section>
        <p v-if="loadError" class="form-error" role="alert">{{ loadError }} <button class="text-button" type="button" @click="refresh">重试</button></p>
        <p v-if="detailLoading" class="detail-note">正在加载单据详情…</p>
        <p v-if="detailError" class="form-error" role="alert">{{ detailError }} <button class="text-button" type="button" @click="selectedId ? loadDetail('requisition', selectedId) : refresh()">重试</button></p>
        <p class="detail-note">撤销仅释放未出库部分；已领物料通过退料入库回补。待退物料不再参与完工数量计算。</p>
        <ProductionExecutionDialog v-if="showCreate && canExecuteAction('create-requisition')" title="新建发料单" width="1180px" :close-disabled="submitting" @close="showCreate = false">
            <form id="create-requisition-form" @submit.prevent="submitCreate">
                <div class="candidate-search"><input v-model="candidateKeyword" placeholder="搜索生产单或产品" aria-label="搜索可发料生产单" @keydown.enter.prevent="searchCandidates" /><button class="secondary-button" type="button" :disabled="candidateLoading" @click="searchCandidates">搜索生产单</button><button v-if="candidateOrders.length < candidatePagination.total" class="text-button" type="button" :disabled="candidateLoading" @click="moreCandidates">加载更多</button></div>
                <p v-if="candidateLoading" class="detail-note">正在加载可发料生产单…</p>
                <p v-if="candidateError" class="form-error" role="alert">{{ candidateError }} <button class="text-button" type="button" @click="searchCandidates">重试</button></p>
                <div class="form-grid">
                    <label class="field"><span>生产单 <b class="required">*</b></span><select v-model="createOrderId" required><option value="">请选择生产单</option><option v-for="order in candidateOrders" :key="order.id" :value="order.id" :disabled="!order.executable">{{ order.documentNo }} · {{ order.productName }} · {{ sourceLabel(order) }}</option></select></label>
                    <label class="field"><span>申请人 <b class="required">*</b></span><input v-model.trim="createApplicant" maxlength="40" required /></label>
                </div>
                <template v-if="createOrder">
                    <p class="detail-note">{{ sourceLabel(createOrder) }} · {{ createOrder.productName }} · {{ createOrder.workshop }}</p>
                    <p v-if="createOrder.blockReason" class="form-error">{{ createOrder.blockReason }}</p>
                    <div class="table-scroll"><table class="detail-table request-materials"><thead><tr><th>图片</th><th>物料 / 编码</th><th>来源</th><th>需求</th><th>已领</th><th>待出库</th><th>{{ createOrder.sourceType === 'stock' ? '公共可用' : '订单可用' }}</th><th>物料状态</th><th>本次申请</th></tr></thead><tbody>
                        <tr v-for="material in createOrder.materials" :key="material.code">
                            <td><ProductionImage :src="material.image" :name="material.name" /></td>
                            <td><strong>{{ material.name }}</strong><small>{{ material.code }} · {{ material.unit }}</small><small>{{ material.material }} · {{ material.category }}</small></td>
                            <td>{{ material.source }}</td><td>{{ material.requiredQty }}</td><td>{{ materialIssued(createOrder, material) }}</td><td>{{ materialPending(createOrder, material) }}</td><td>{{ materialAvailable(material) }}</td>
                            <td><span class="status-pill" :class="materialState(createOrder, material) === '已领齐' ? 'done' : 'pending'">{{ materialState(createOrder, material) }}</span></td>
                            <td><input v-model.number="requestQuantities[material.code]" type="number" min="0" :max="materialRequestLimit(createOrder, material)" step="0.001" :disabled="materialRequestLimit(createOrder, material) === 0" :aria-label="`${material.name}本次申请数量`" /><small>最多 {{ materialRequestLimit(createOrder, material) }} {{ material.unit }}</small></td>
                        </tr>
                    </tbody></table></div><p class="detail-note">可分批申请；本次申请不得超过各物料的需求余额和可用数量。</p>
                </template>
                <div v-else class="empty-panel">{{ candidateOrders.length ? '请选择生产单以核对物料' : '暂无可申请发料的生产单' }}</div>
                <label class="field">备注<textarea v-model.trim="createRemark" maxlength="300" rows="2" placeholder="填写本次发料说明（选填）" /></label>
                <p v-if="createError" class="form-error" role="alert">{{ createError }}</p>
            </form>
            <template #footer><button class="secondary-button" type="button" :disabled="submitting" @click="showCreate = false">取消</button><button class="primary-button" type="submit" form="create-requisition-form" :disabled="!createOrder?.executable || submitting || candidateLoading">{{ submitting ? '提交中…' : '创建发料单' }}</button></template>
        </ProductionExecutionDialog>
        <ProductionExecutionDialog v-if="selected && selectedOrder" :title="`发料单详情 · ${selected.documentNo}`" width="1120px" @close="selectedId = ''">
            <div class="detail-summary">
                <div><span>发料状态</span><strong><span class="status-pill" :class="statusClass(requisitionStatus(selected))">{{ requisitionStatus(selected) }}</span></strong><small>{{ selected.date }}</small></div>
                <div><span>生产单 / 生产对象</span><button v-if="canPreviewOrder" class="text-button erp-selectable-text" type="button" @click="openOrderPreview(selectedOrder.id, $event)">{{ selectedOrder.documentNo }}</button><strong v-else>{{ selectedOrder.documentNo }}</strong><strong>{{ selectedOrder.productName }}</strong></div>
                <div><span>生产来源</span><strong>{{ sourceLabel(selectedOrder) }}</strong><small>{{ selected.applicant }} · {{ selectedOrder.workshop }}</small></div>
            </div>
            <div v-if="selectedOrder.relatedPurchaseOrders?.length" class="table-scroll"><table class="detail-table"><thead><tr><th>关联采购单</th><th>入库数量 / 采购总数</th><th>入库进度</th></tr></thead><tbody>
                <tr v-for="purchase in selectedOrder.relatedPurchaseOrders" :key="purchase.id"><td>{{ purchase.orderNo }}</td><td>{{ purchase.inboundReceived }} / {{ purchase.inboundTotal }}</td><td><span class="status-pill" :class="purchase.receiptComplete ? 'done' : 'pending'">{{ purchase.receiptComplete ? '已全部入库' : '待入库完成' }}</span></td></tr>
            </tbody></table></div>
            <template v-if="canExecuteAction('issue-requisition')">
                <p v-if="selectedOrder.purchaseSourceValid !== true" class="form-error" role="alert">{{ selectedOrder.purchaseSourceBlockReason || '关联采购来源异常，请核对后出库。' }}</p>
                <p v-else-if="!selectedOrder.purchaseReceiptReady" class="detail-note" role="status">采购尚未全部到货，可先领用已有可领物料<span v-if="selectedOrder.purchaseReceiptBlockReason">。{{ selectedOrder.purchaseReceiptBlockReason }}</span></p>
            </template>
            <div class="table-scroll"><table class="detail-table"><thead><tr><th>图片</th><th>物料 / 编码</th><th>申请</th><th>已出库</th><th>待出库</th><th>已退</th><th>待退入库</th><th>单位</th></tr></thead><tbody>
                <tr v-for="line in selected.lines" :key="line.materialCode">
                    <td><ProductionImage :src="getMaterial(selectedOrder, line.materialCode)?.image" :name="materialName(selected, line)" /></td>
                    <td><strong>{{ materialName(selected, line) }}</strong><small>{{ line.materialCode }}</small><small>{{ getMaterial(selectedOrder, line.materialCode)?.material }} · {{ getMaterial(selectedOrder, line.materialCode)?.category }}</small></td>
                    <td>{{ line.quantity }}</td><td>{{ line.issued }}</td><td>{{ requisitionPending(line) }}</td><td>{{ line.returned }}</td><td>{{ line.pendingReturn }}</td><td>{{ getMaterial(selectedOrder, line.materialCode)?.unit }}</td>
                </tr>
            </tbody></table></div>
            <p v-if="selected.remark" class="detail-note">备注：{{ selected.remark }}</p>
            <details class="operation-records"><summary>操作记录（{{ selected.records.length }}）</summary><div class="table-scroll"><table class="detail-table"><thead><tr><th>时间</th><th>操作 / 物料</th><th>数量</th><th>单据</th><th>仓库 / 库位</th><th>备注</th></tr></thead><tbody>
                <tr v-for="(record, index) in selected.records" :key="`${record.documentNo}-${index}`"><td>{{ record.date }}</td><td>{{ record.action }}<small>{{ getMaterial(selectedOrder, record.materialCode)?.name || record.materialCode }}</small></td><td>{{ record.quantity }} {{ record.unit }}</td><td>{{ record.documentNo }}</td><td>{{ record.warehouseId ? `${warehouseName(record.warehouseId)} / ${locationName(record.warehouseId, record.locationId || '')}` : '—' }}</td><td>{{ record.remark || '—' }}</td></tr>
                <tr v-if="!selected.records.length"><td colspan="6">暂无操作记录</td></tr>
            </tbody></table></div></details>
            <template #footer>
                <button v-if="canExecuteAction('issue-requisition')" class="secondary-button" type="button" :disabled="!canOperate('issue')" @click="openOperation('issue')">仓库确认出库</button>
                <button v-if="canExecuteAction('cancel-requisition')" class="secondary-button" type="button" :disabled="!canOperate('cancel')" @click="openOperation('cancel')">{{ selected.lines.some(line => line.issued > 0) ? '终止剩余发料' : '撤销发料申请' }}</button>
                <button v-if="canExecuteAction('request-return')" class="secondary-button" type="button" :disabled="!canOperate('return')" @click="openOperation('return')">申请退料</button>
                <button v-if="canExecuteAction('receive-return')" class="primary-button" type="button" :disabled="!canOperate('receive')" @click="openOperation('receive')">确认退料入库</button>
                <button class="secondary-button" type="button" @click="selectedId = ''">关闭</button>
            </template>
        </ProductionExecutionDialog>
        <ProductionExecutionDialog v-if="operation && selected && selectedOrder && canExecuteAction(operationActions[operation])" :title="`${operationTitle} · ${selected.documentNo}`" width="1000px" :close-disabled="submitting" @close="operation = ''">
            <form id="requisition-operation-form" @submit.prevent="submitOperation">
                <p class="detail-note">{{ operationHelp }}</p>
                <p v-if="operation === 'issue' && selectedOrder.purchaseSourceValid !== true" class="form-error" role="alert">{{ selectedOrder.purchaseSourceBlockReason || '关联采购来源异常，请核对后出库。' }}</p>
                <p v-else-if="operation === 'issue' && !selectedOrder.purchaseReceiptReady" class="detail-note" role="status">采购尚未全部到货，可先领用已有可领物料<span v-if="selectedOrder.purchaseReceiptBlockReason">。{{ selectedOrder.purchaseReceiptBlockReason }}</span></p>
                <div v-if="operation === 'issue'" class="table-scroll"><table class="detail-table"><thead><tr><th>物料 / 编码</th><th>待出库</th><th>本次可出</th><th>本次出库</th><th>仓库</th><th>库位</th></tr></thead><tbody>
                    <tr v-for="line in issueLines" :key="line.allocationId">
                        <td><strong>{{ line.name }}</strong><small>{{ line.materialCode }}</small></td>
                        <td>{{ line.maximum }}</td><td>{{ line.maximum }}</td>
                        <td><input v-model.number="line.quantity" type="number" min="0" :max="line.maximum" step="0.001" :aria-label="`${line.name}出库数量`" /></td>
                        <td>{{ warehouseName(line.warehouseId) }}</td><td>{{ locationName(line.warehouseId, line.locationId) }}</td>
                    </tr>
                </tbody></table></div>
                <div v-else class="form-grid">
                    <label class="field"><span>处理物料 / 仓位 <b class="required">*</b></span><select v-model="operationAllocationId" required><option v-for="item in operationLines" :key="item.allocation.id" :value="item.allocation.id">{{ item.line.name }} · {{ warehouseName(item.allocation.warehouseId) }} / {{ locationName(item.allocation.warehouseId, item.allocation.locationId) }}</option></select></label>
                    <label class="field"><span>本次数量 <b class="required">*</b></span><input v-model.number="operationQuantity" type="number" min="0.001" :max="operationLimit" step="0.001" required /><small>本次最多 {{ operationLimit }} {{ operationOption?.line.unit }}</small></label>
                </div>
                <label class="field">备注<textarea v-model.trim="operationRemark" rows="2" maxlength="300" placeholder="填写本次操作说明（选填）" /></label>
                <label v-if="operation === 'cancel'" class="confirm-line"><input v-model="releaseConfirmed" type="checkbox" />我已确认释放所选物料的未出库数量，后续如需领用须重新申请。</label>
                <p v-if="operationError" class="form-error" role="alert">{{ operationError }}</p>
            </form>
            <template #footer><button class="secondary-button" type="button" :disabled="submitting" @click="operation = ''">取消</button><button class="primary-button" type="submit" form="requisition-operation-form" :disabled="submitting || (operation === 'issue' ? !canOperate('issue') : operationLimit === 0)">{{ submitting ? '提交中…' : `确认${operationTitle}` }}</button></template>
        </ProductionExecutionDialog>
        <ProductionOrderExecutionDialog v-if="previewOrderId && canPreviewOrder" :order-id="previewOrderId" @close="previewOrderId = ''" />
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    </div>
</template>

<script setup lang="ts">
import ProductionExecutionDialog from "~/components/production/ProductionExecutionDialog.vue";
import ProductionImage from "~/components/production/ProductionImage.vue";
import ProductionOrderExecutionDialog from "~/components/production/ProductionOrderExecutionDialog.vue";
import { useProductionExecution } from "~/composables/production/useProductionExecution";
import { hasTextSelection } from "~/utils/textSelection";
import { canAccessProductionExecution } from "~~/shared/utils/adminPermission";
import type { ExecutionAllocation, ExecutionIssueInput, ExecutionMaterial, ExecutionOrder, ExecutionRequisition, ExecutionRequisitionLine, ExecutionRequisitionOperation } from "~~/shared/types/production-execution";

definePageMeta({ layout: "production" });
useHead({ title: "发料管理 - 生产管理" });
const route = useRoute();
const adminInfo = useState<{ role?: number }>("admin_info", () => ({}));
const canPreviewOrder = computed(() => canAccessProductionExecution(Number(adminInfo.value?.role)));
const {
    requisitions, warehouses, operatorName, getOrder, getMaterial, getRequisition, sourceLabel,
    materialIssued, materialPending, materialAvailable, materialRequestLimit, requisitionPending,
    requisitionStatus, hasPendingReturn, createRequisition, issueRequisition, adjustRequisition,
    warehouseName, locationName, loading, loadError, detailLoading, detailError, submitting,
    candidateOrders, candidateLoading, candidateError, candidatePagination, counts, pagination,
    loadList, loadDetail, loadSource, loadCandidates, refresh, canExecuteAction,
} = useProductionExecution();
const currentPage = ref(1);
const pageSize = ref(15);
const jumpPageInput = ref("");
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.value.total / pageSize.value)));
const cardStatuses = ["待出库", "部分出库", "已出库", "待退料入库"];
const filterStatuses = ["全部", "待出库", "部分出库", "已出库", "已撤销", "已关闭", "待退料入库"];
const tableColumns = "minmax(165px, 1.15fr) minmax(185px, 1.3fr) 100px 95px 110px 155px 130px 65px";
const statusFilter = ref("全部");
const searchText = ref("");
const keyword = ref("");
const selectedId = ref("");
const selected = computed(() => getRequisition(selectedId.value));
const selectedOrder = computed(() => selected.value ? getOrder(selected.value.orderId) : undefined);
const previewOrderId = ref("");
const openOrderPreview = (id: string, event: MouseEvent) => {
    if (!canPreviewOrder.value || hasTextSelection(event)) {
        return;
    }

    previewOrderId.value = id;
};
const notice = ref("");
const candidateKeyword = ref("");
const queryId = (name: string) => String(Array.isArray(route.query[name]) ? route.query[name]![0] || "" : route.query[name] || "");
const scope = computed(() => ({ productionOrderId: queryId("productionOrderId"), salesOrderId: queryId("salesOrderId") }));
const visibleRows = requisitions;
const statusCount = (status: string) => counts.value[status] ?? (status === "全部" ? ["待出库", "部分出库", "已出库", "已撤销", "已关闭"].reduce((sum, key) => sum + (counts.value[key] || 0), 0) : 0);
const returnItemCount = (row: ExecutionRequisition) => row.lines.filter((line) => line.returned > 0 || line.pendingReturn > 0).length;
const sourceText = (row: ExecutionRequisition) => { const order = getOrder(row.orderId); return order ? sourceLabel(order) : "—"; };
const orderNumber = (id: string) => getOrder(id)?.documentNo || "生产单";
const materialName = (_row: ExecutionRequisition, line: ExecutionRequisitionLine) => line.name || line.materialCode;
const statusClass = (status: string) => ({ "待出库": "pending", "部分出库": "working", "已出库": "done", "已撤销": "muted", "已关闭": "muted" }[status] || "pending");
const loadRows = () => loadList({ view: "requisitions", ...scope.value, keyword: keyword.value, status: statusFilter.value, page: currentPage.value, limit: pageSize.value });
const chooseStatus = (status: string) => { statusFilter.value = status; currentPage.value = 1; void loadRows(); };
const applySearch = () => { keyword.value = searchText.value.trim(); currentPage.value = 1; void loadRows(); };
const goToPage = (page: number) => { currentPage.value = Math.min(totalPages.value, Math.max(1, page)); void loadRows(); };
const jumpToInputPage = () => { const page = Number(jumpPageInput.value); if (Number.isInteger(page)) goToPage(page); jumpPageInput.value = ""; };
watch(pageSize, () => { currentPage.value = 1; void loadRows(); });
watch(selectedId, (id) => { if (id) void loadDetail("requisition", id); });
watch(() => [route.query.productionOrderId, route.query.salesOrderId, route.query.id], () => {
    currentPage.value = 1;
    selectedId.value = "";
    operation.value = "";
    showCreate.value = false;
    previewOrderId.value = "";
    void loadRows();
    selectedId.value = queryId("id");
});
watch([() => pagination.value.total, loading], () => {
    if (!loading.value && !loadError.value && currentPage.value > totalPages.value) {
        currentPage.value = totalPages.value;
        void loadRows();
    }
});
onMounted(async () => { await loadRows(); if (queryId("id")) selectedId.value = queryId("id"); });

const showCreate = ref(false);
const createOrderId = ref("");
const createApplicant = ref("");
const createRemark = ref("");
const createError = ref("");
const requestQuantities = reactive<Record<string, number>>({});
const createOrder = computed(() => getOrder(createOrderId.value));
const resetRequestQuantities = () => {
    for (const code of Object.keys(requestQuantities)) delete requestQuantities[code];
    if (createOrder.value) for (const material of createOrder.value.materials) requestQuantities[material.code] = material.requestLimit;
    createError.value = "";
};
watch(createOrderId, resetRequestQuantities);
const materialState = (_order: ExecutionOrder, material: ExecutionMaterial) => material.requestLimit > 0 ? "可申请" : material.pendingQty > 0 ? "待出库" : material.issuedQty >= material.requiredQty ? "已领齐" : "暂无可申请量";
const searchCandidates = async () => {
    if (!canExecuteAction("create-requisition")) return;
    createOrderId.value = "";
    if (await loadCandidates("requisition", candidateKeyword.value.trim())) createOrderId.value = candidateOrders.value[0]?.id || "";
};
const moreCandidates = () => loadCandidates("requisition", candidateKeyword.value.trim(), candidatePagination.value.page + 1);
const openCreate = async () => {
    if (!canExecuteAction("create-requisition")) return;
    createApplicant.value = operatorName.value;
    createRemark.value = "";
    candidateKeyword.value = "";
    createOrderId.value = "";
    showCreate.value = true;
    if (!await loadCandidates("requisition")) return;
    const preferred = scope.value.productionOrderId;
    if (preferred && !candidateOrders.value.some((order) => order.id === preferred)) {
        await loadSource({ productionOrderId: preferred });
        const order = getOrder(preferred);
        if (order?.executable && order.materials.some((material) => material.requestLimit > 0)) candidateOrders.value.push(order);
    }
    createOrderId.value = preferred ? candidateOrders.value.find((order) => order.id === preferred)?.id || "" : candidateOrders.value[0]?.id || "";
    resetRequestQuantities();
};
const submitCreate = async () => {
    if (!canExecuteAction("create-requisition")) return;
    try {
        if (!createOrder.value) throw new Error("请选择可申请发料的生产单。");
        const result = await createRequisition({ orderId: createOrder.value.id, applicant: createApplicant.value, remark: createRemark.value, lines: createOrder.value.materials.map((material) => ({ productId: material.productId, quantity: requestQuantities[material.code] })) });
        showCreate.value = false;
        selectedId.value = result.id;
        notice.value = `已创建发料单 ${result.documentNo}`;
    } catch (error) { createError.value = error instanceof Error ? error.message : "创建发料单失败。"; }
};

type Operation = "issue" | ExecutionRequisitionOperation;
const operationActions: Record<Operation, string> = {
    issue: "issue-requisition",
    cancel: "cancel-requisition",
    return: "request-return",
    receive: "receive-return",
};
interface AllocationOption { line: ExecutionRequisitionLine; allocation: ExecutionAllocation; }
interface IssueDraft extends ExecutionIssueInput { materialCode: string; name: string; warehouseId: string; locationId: string; maximum: number; }
const operation = ref<Operation | "">("");
const operationAllocationId = ref("");
const operationQuantity = ref(0);
const operationRemark = ref("");
const operationError = ref("");
const releaseConfirmed = ref(false);
const issueLines = ref<IssueDraft[]>([]);
const operationTitle = computed(() => ({ issue: "仓库出库", cancel: selected.value?.lines.some((line) => line.issued > 0) ? "终止剩余发料" : "撤销发料申请", return: "申请退料", receive: "退料入库" })[operation.value || "issue"]);
const operationHelp = computed(() => ({ issue: "按已分配仓位逐项填写实际出库数量，可只出库部分物料。", cancel: "只释放所选仓位尚未出库的数量，已出库记录保留。", return: "仅能退回尚未用于完工的物料；申请后不再用于完工，实际退料入库后恢复原物料池。", receive: "按原发料仓位确认实际退回数量，回补原来源物料池或公共库存。" })[operation.value || "issue"]);
const allocationLimit = (kind: Operation, allocation: ExecutionAllocation) => kind === "return" ? allocation.returnLimit : kind === "receive" ? allocation.pendingReturn : allocation.pendingQty;
const allAllocations = computed<AllocationOption[]>(() => {
    const result: AllocationOption[] = [];
    if (selected.value) for (const line of selected.value.lines) for (const allocation of line.allocations) result.push({ line, allocation });
    return result;
});
const canOperate = (kind: Operation) => {
    const order = selectedOrder.value;
    const allowed = kind === "issue" ? order?.executable && order.purchaseSourceValid === true : order?.executable || order?.cleanupAllowed;
    return Boolean(allowed) && !submitting.value && !detailLoading.value && canExecuteAction(operationActions[kind])
        && allAllocations.value.some(({ allocation }) => allocationLimit(kind, allocation) > 0);
};
const operationLines = computed(() => operation.value ? allAllocations.value.filter(({ allocation }) => allocationLimit(operation.value as Operation, allocation) > 0) : []);
const operationOption = computed(() => allAllocations.value.find(({ allocation }) => allocation.id === operationAllocationId.value));
const operationLimit = computed(() => operation.value && operationOption.value ? allocationLimit(operation.value, operationOption.value.allocation) : 0);
watch(operationAllocationId, () => { operationQuantity.value = operationLimit.value; operationError.value = ""; });
const openOperation = (kind: Operation) => {
    if (!selected.value || !canOperate(kind)) return;
    operation.value = kind;
    operationAllocationId.value = operationLines.value[0]?.allocation.id || "";
    operationQuantity.value = operationLimit.value;
    operationRemark.value = "";
    operationError.value = "";
    releaseConfirmed.value = false;
    issueLines.value = operationLines.value.map(({ line, allocation }) => ({ allocationId: allocation.id, materialCode: line.materialCode, name: line.name, quantity: allocation.pendingQty, maximum: allocation.pendingQty, warehouseId: allocation.warehouseId, locationId: allocation.locationId }));
};
const submitOperation = async () => {
    if (!selected.value || !operation.value || !canExecuteAction(operationActions[operation.value])) return;
    if (operation.value === "issue" && !canOperate("issue")) {
        operationError.value = selectedOrder.value?.blockReason || selectedOrder.value?.purchaseSourceBlockReason || "当前发料单不可出库，请刷新后核对。";
        return;
    }
    try {
        const result = operation.value === "issue"
            ? await issueRequisition(selected.value.id, issueLines.value.map(({ allocationId, quantity }) => ({ allocationId, quantity })), operationRemark.value)
            : await adjustRequisition(selected.value.id, operation.value, operationAllocationId.value, operationQuantity.value, operationRemark.value, releaseConfirmed.value);
        notice.value = `已记录${operationTitle.value} · ${result.documentNo}`;
        operation.value = "";
    } catch (error) { operationError.value = error instanceof Error ? error.message : "操作失败，请核对数量。"; }
};
</script>

<style src="~/assets/css/production-execution.css"></style>
<style scoped>
.required { color: #f56c6c; }
.production-execution-page .return-pending { color: #e6a23c; }
.operation-records summary { padding: 10px 0; color: #606266; cursor: pointer; }
.request-materials { min-width: 1040px; }
.candidate-search { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
</style>
