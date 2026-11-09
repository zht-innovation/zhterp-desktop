<template>
    <div class="production-execution-page">
        <header class="page-topbar">
            <ErpBreadcrumb icon="lucide:package-check" :items="[{ label: '生产管理' }, { label: '完工入库' }]" />
            <ErpSearchBox v-model="searchText" placeholder="搜索完工记录、生产单、订单或产品" @search="applySearch" />
        </header>
        <section class="page-heading"><h1>完工入库</h1><p>分批登记完工，按实际合格数量入库</p></section>

        <section class="status-cards three-columns" aria-label="完工入库状态统计">
            <button v-for="status in statuses" :key="status" type="button" :class="{ active: statusFilter === status }" @click="chooseStatus(status)">
                <span>{{ status }}</span><strong>{{ countStatus(status) }}</strong><small>条完工记录</small>
            </button>
        </section>
        <section class="list-card">
            <div class="list-actions">
                <button v-if="canExecuteAction('register-completion')" class="primary-button" type="button" @click="openCompletionForm"><Icon name="lucide:plus" />登记完工</button>
                <button class="secondary-button" type="button" :disabled="!canReceive" @click="openReceiptForm()"><Icon name="lucide:package-plus" />多项入库</button>
                <span class="list-help">订单成品归属来源订单，部件归属订单物料池；备货生产进入公共库存。</span>
            </div>
            <div class="filter-row">
                <div class="filter-tabs" role="group" aria-label="按入库状态筛选">
                    <button type="button" :class="{ active: statusFilter === '全部' }" @click="chooseStatus('全部')">全部<span>{{ allCount }}</span></button>
                    <button v-for="status in statuses" :key="status" type="button" :class="{ active: statusFilter === status }" @click="chooseStatus(status)">{{ status }}<span>{{ countStatus(status) }}</span></button>
                </div>
            </div>
            <ErpTableFrame :columns="tableColumns" minimum-width="1240px" :loading="loading" :empty="!loading && pageRows.length === 0" empty-text="暂无匹配的完工记录" scroll-x>
                <template #header>
                    <div class="table-row table-header"><div>完工记录 / 日期</div><div>生产单 / 订单</div><div>图片</div><div>生产对象</div><div>本批完工</div><div>已入库 / 待入库</div><div>入库进度</div><div>登记人</div><div>操作</div></div>
                </template>
                <div v-for="record in pageRows" :key="record.id" class="table-row table-data">
                    <div class="stack"><strong>{{ record.documentNo }}</strong><small>{{ record.date }}</small></div>
                    <div class="stack"><button class="text-button erp-selectable-text" type="button" @click="openOrderPreview(record.orderId, $event)">{{ orderNumber(record.orderId) }}</button><small>{{ sourceLabel(orderFor(record)) }}</small></div>
                    <div><ProductionImage :src="orderFor(record).image" :name="orderFor(record).productName" /></div>
                    <div class="stack"><strong>{{ orderFor(record).productName }}</strong><small>{{ orderFor(record).productCode }} · {{ orderFor(record).kind === 'component' ? '部件' : '成品' }}</small><small>{{ orderFor(record).material }} · {{ orderFor(record).category }}</small></div>
                    <div>{{ record.quantity }} {{ orderFor(record).unit }}</div>
                    <div>{{ completionReceived(record) }} / {{ completionPending(record) }} {{ orderFor(record).unit }}</div>
                    <div><span class="status-pill" :class="statusClass(completionStatus(record))">{{ completionStatus(record) }}</span></div>
                    <div>{{ record.person }}</div>
                    <div class="row-actions"><button class="text-button" type="button" @click="selectedCompletionId = record.id">查看</button><button v-if="completionPending(record) > 0" class="text-button" type="button" @click="openReceiptForm(record)">入库</button></div>
                </div>
            </ErpTableFrame>
            <InventoryPagination v-model:page-size="pageSize" v-model:jump-page-input="jumpPageInput" :total="pagination.total" :page-size-options="[5, 10, 15]" :total-pages="totalPages" :current-page="currentPage" @page-change="goToPage" @jump="jumpToInputPage" />
        </section>
        <p v-if="loadError" class="form-error" role="alert">{{ loadError }} <button class="text-button" type="button" @click="refresh">重试</button></p>
        <p v-if="detailLoading" class="detail-note">正在加载单据详情…</p>
        <p v-if="detailError" class="form-error" role="alert">{{ detailError }} <button class="text-button" type="button" @click="refresh">重试</button></p>
        <p class="detail-note">可登记完工数量取全部必需 BOM 物料可支持量的最小值；待退物料不能继续用于完工。</p>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>

        <ProductionExecutionDialog v-if="showCompletionForm && canExecuteAction('register-completion')" title="登记完工" width="1080px" :close-disabled="submitting" @close="showCompletionForm = false">
            <form id="production-completion-form" @submit.prevent="submitCompletion">
                <div class="candidate-search"><input v-model="completionCandidateKeyword" placeholder="搜索生产单或产品" aria-label="搜索可登记完工生产单" @keydown.enter.prevent="searchCompletionCandidates" /><button class="secondary-button" type="button" :disabled="candidateLoading" @click="searchCompletionCandidates">搜索生产单</button><button v-if="candidateOrders.length < candidatePagination.total" class="text-button" type="button" :disabled="candidateLoading" @click="moreCompletionCandidates">加载更多</button></div>
                <p v-if="candidateLoading" class="detail-note">正在加载可登记生产单…</p>
                <p v-if="candidateError" class="form-error" role="alert">{{ candidateError }} <button class="text-button" type="button" @click="searchCompletionCandidates">重试</button></p>
                <label class="field"><span>生产单 <b class="required">*</b></span><select v-model="completionForm.orderId" required><option value="">请选择生产单</option><option v-for="order in eligibleOrders" :key="order.id" :value="order.id" :disabled="!order.executable">{{ order.documentNo }} · {{ order.productName }} · {{ sourceLabel(order) }}</option></select></label>
                <template v-if="formOrder">
                    <p v-if="formOrder.blockReason" class="form-error">{{ formOrder.blockReason }}</p>
                    <div class="table-scroll completion-preview"><table class="detail-table"><thead><tr><th>图片</th><th>生产对象</th><th>计划</th><th>累计完工</th><th>已入库</th><th>本次可登记</th></tr></thead><tbody><tr><td><ProductionImage :src="formOrder.image" :name="formOrder.productName" /></td><td><strong>{{ formOrder.productName }}</strong><small>{{ formOrder.productCode }} · {{ formOrder.unit }}</small><small>{{ formOrder.material }} · {{ formOrder.category }}</small></td><td>{{ formOrder.planQty }}</td><td>{{ completedQty(formOrder) }}</td><td>{{ receivedQty(formOrder) }}</td><td><strong>{{ formLimit }}</strong></td></tr></tbody></table></div>
                    <details class="completion-materials"><summary>物料核对 · 按全部必需物料计算</summary><div class="table-scroll"><table class="detail-table"><thead><tr><th>图片</th><th>物料 / 编码</th><th>单位用量</th><th>净已领</th><th>待退入库</th><th>已完工占用</th><th>可支持累计完工</th></tr></thead><tbody><tr v-for="material in formOrder.materials" :key="material.code"><td><ProductionImage :src="material.image" :name="material.name" /></td><td><strong>{{ material.name }}</strong><small>{{ material.code }} · {{ material.unit }}</small><small>{{ material.material }} · {{ material.category }}</small></td><td>{{ material.per }}</td><td>{{ materialIssued(formOrder, material) }}</td><td>{{ materialPendingReturn(formOrder, material) }}</td><td>{{ completedQty(formOrder) * material.per }}</td><td>{{ supportedQuantity(formOrder, material) }}</td></tr></tbody></table></div></details>
                </template>
                <div v-else class="empty-panel">暂无可登记完工的生产单，请先在发料管理中完成必需物料出库。</div>
                <div class="form-grid completion-fields">
                    <label class="field"><span>本次完工数量 <b class="required">*</b></span><input v-model.number="completionForm.quantity" type="number" min="1" :max="formLimit" step="1" required :disabled="!formOrder" /></label>
                    <label class="field"><span>完工日期 <b class="required">*</b></span><input v-model="completionForm.date" type="date" required /></label>
                    <label class="field"><span>登记人 <b class="required">*</b></span><input v-model.trim="completionForm.person" maxlength="40" required /></label>
                </div>
                <label class="field">备注<textarea v-model.trim="completionForm.remark" rows="2" maxlength="300" placeholder="填写本次完工说明（选填）" /></label>
                <p class="detail-note">登记完工不增加库存，合格实物由仓库另行确认入库。</p>
                <p v-if="completionError" class="form-error" role="alert">{{ completionError }}</p>
            </form>
            <template #footer><button class="secondary-button" type="button" :disabled="submitting" @click="showCompletionForm = false">取消</button><button class="primary-button" type="submit" form="production-completion-form" :disabled="!formOrder?.executable || formLimit <= 0 || submitting || candidateLoading">{{ submitting ? '提交中…' : '确认登记完工' }}</button></template>
        </ProductionExecutionDialog>

        <ProductionExecutionDialog v-if="selectedCompletion" :title="`完工记录 · ${selectedCompletion.documentNo}`" width="1080px" @close="selectedCompletionId = ''">
            <div class="detail-summary">
                <div><span>入库进度</span><strong><span class="status-pill" :class="statusClass(completionStatus(selectedCompletion))">{{ completionStatus(selectedCompletion) }}</span></strong><small>{{ selectedCompletion.date }} · {{ selectedCompletion.person }}</small></div>
                <div><span>生产单 / 来源</span><button class="text-button erp-selectable-text" type="button" @click="openOrderPreview(selectedCompletion.orderId, $event)">{{ orderNumber(selectedCompletion.orderId) }}</button><small>{{ sourceLabel(orderFor(selectedCompletion)) }}</small></div>
                <div><span>入库归属</span><strong>{{ receiptOwnership(orderFor(selectedCompletion)) }}</strong></div>
            </div>
            <div class="table-scroll"><table class="detail-table"><thead><tr><th>图片</th><th>生产对象</th><th>本批完工</th><th>已入库</th><th>待入库</th><th>单位</th></tr></thead><tbody><tr><td><ProductionImage :src="orderFor(selectedCompletion).image" :name="orderFor(selectedCompletion).productName" /></td><td><strong>{{ orderFor(selectedCompletion).productName }}</strong><small>{{ orderFor(selectedCompletion).productCode }}</small><small>{{ orderFor(selectedCompletion).material }} · {{ orderFor(selectedCompletion).category }}</small></td><td>{{ selectedCompletion.quantity }}</td><td>{{ completionReceived(selectedCompletion) }}</td><td>{{ completionPending(selectedCompletion) }}</td><td>{{ orderFor(selectedCompletion).unit }}</td></tr></tbody></table></div>
            <p v-if="selectedCompletion.remark" class="detail-note">备注：{{ selectedCompletion.remark }}</p>
            <h3 class="section-title">入库记录</h3>
            <div class="table-scroll"><table class="detail-table"><thead><tr><th>入库单</th><th>日期</th><th>仓库 / 库位</th><th>本批入库</th><th>操作</th></tr></thead><tbody><tr v-for="receipt in relatedReceipts" :key="receipt.id"><td>{{ receipt.documentNo }}</td><td>{{ receipt.date }}</td><td>{{ receiptStorage(receipt, selectedCompletion.id) }}</td><td>{{ receiptQuantity(receipt, selectedCompletion.id) }} {{ orderFor(selectedCompletion).unit }}</td><td><button class="text-button" type="button" @click="openReceipt(receipt.id)">查看</button></td></tr><tr v-if="!relatedReceipts.length"><td colspan="5" class="empty-panel">暂无入库记录</td></tr></tbody></table></div>
            <details><summary>机器号 · 只读</summary><p class="machine-numbers">{{ orderFor(selectedCompletion).kind === 'component' ? '部件不使用机器号' : orderFor(selectedCompletion).machineNumbers.join('、') || '暂无机器号' }}</p></details>
            <template #footer><button class="secondary-button" type="button" @click="selectedCompletionId = ''">关闭</button><button class="primary-button" type="button" :disabled="completionPending(selectedCompletion) <= 0 || !canReceive" @click="openReceiptForm(selectedCompletion)">仓库确认入库</button></template>
        </ProductionExecutionDialog>

        <ProductionExecutionDialog v-if="showReceiptForm && canReceive" :title="singleCompletionId ? '仓库确认入库' : '多项合格入库'" width="1220px" :close-disabled="submitting" @close="showReceiptForm = false">
            <form id="production-receipt-form" @submit.prevent="submitReceipt">
                <div v-if="!singleCompletionId" class="candidate-search"><input v-model="receiptSourceKeyword" placeholder="搜索订单、生产单或产品" aria-label="搜索待入库来源" @keydown.enter.prevent="loadReceiptSources(1)" /><button class="secondary-button" type="button" :disabled="receiptSourcesLoading" @click="loadReceiptSources(1)">查找来源</button><button v-if="receiptSourcesPage * 20 < receiptSourcesTotal" class="text-button" type="button" :disabled="receiptSourcesLoading" @click="loadReceiptSources(receiptSourcesPage + 1)">加载更多来源</button></div>
                <p v-if="receiptSourcesLoading || receiptSourceLoading" class="detail-note">正在加载待入库批次…</p>
                <div class="form-grid">
                    <label class="field"><span>生产来源 <b class="required">*</b></span><select v-model="receiptForm.sourceKey" required :disabled="Boolean(singleCompletionId)"><option value="">请选择生产来源</option><option v-for="source in receiptSources" :key="source.key" :value="source.key">{{ source.label }}</option></select></label>
                    <label class="field"><span>入库日期 <b class="required">*</b></span><input v-model="receiptForm.date" type="date" required /></label>
                    <label class="field"><span>经办人 <b class="required">*</b></span><input v-model.trim="receiptForm.person" maxlength="40" required /></label>
                </div>
                <p class="detail-note">同一来源可多项入库，仓库 / 库位可逐项调整。入库后同步更新生产单和订单备货。</p>
                <div v-if="receiptCandidates.length" class="table-scroll"><table class="detail-table receipt-table"><thead><tr><th>选择</th><th>图片</th><th>完工记录 / 生产单</th><th>生产对象</th><th>待入库</th><th>单位</th><th>本次合格入库</th><th>仓库 / 库位</th></tr></thead><tbody>
                    <tr v-for="record in receiptCandidates" :key="record.id">
                        <td><input v-model="receiptDrafts[record.id].selected" type="checkbox" :aria-label="`选择 ${record.id}`" /></td>
                        <td><ProductionImage :src="orderFor(record).image" :name="orderFor(record).productName" /></td>
                        <td><strong>{{ record.documentNo }}</strong><small>{{ orderNumber(record.orderId) }}</small></td>
                        <td><strong>{{ orderFor(record).productName }}</strong><small>{{ orderFor(record).productCode }}</small><small>{{ orderFor(record).material }} · {{ orderFor(record).category }}</small></td>
                        <td>{{ completionPending(record) }}</td><td>{{ orderFor(record).unit }}</td>
                        <td><input v-model.number="receiptDrafts[record.id].quantity" type="number" min="0" :max="completionPending(record)" step="1" :disabled="!receiptDrafts[record.id].selected" :aria-label="`${record.id}本次合格入库数量`" /></td>
                        <td class="storage-fields"><select v-model="receiptDrafts[record.id].warehouseId" :disabled="!receiptDrafts[record.id].selected" :aria-label="`${record.id}仓库`" @change="changeWarehouse(record.id)"><option v-for="warehouse in warehouses" :key="warehouse.id" :value="warehouse.id" :disabled="!warehouse.locations.length">{{ warehouse.name }}</option></select><select v-model="receiptDrafts[record.id].locationId" :disabled="!receiptDrafts[record.id].selected" :aria-label="`${record.id}库位`"><option v-for="location in warehouseLocations(receiptDrafts[record.id].warehouseId)" :key="location.id" :value="location.id">{{ location.name }}</option></select></td>
                    </tr>
                </tbody></table></div>
                <div v-else class="empty-panel">暂无待入库完工记录。</div>
                <label class="field receipt-note">备注<textarea v-model.trim="receiptForm.remark" rows="2" maxlength="300" placeholder="填写入库说明（选填）" /></label>
                <label class="confirm-line"><input v-model="receiptForm.qualified" type="checkbox" required />已核对本次数量和实物合格情况，确认记录本次合格入库。</label>
                <p v-if="receiptError" class="form-error" role="alert">{{ receiptError }}</p>
            </form>
            <template #footer><button class="secondary-button" type="button" :disabled="submitting" @click="showReceiptForm = false">取消</button><button class="primary-button" type="submit" form="production-receipt-form" :disabled="!receiptCandidates.length || submitting || receiptSourceLoading || !canReceive">{{ submitting ? '提交中…' : '确认入库' }}</button></template>
        </ProductionExecutionDialog>

        <ProductionExecutionDialog v-if="selectedReceipt" :title="`生产入库单 · ${selectedReceipt.documentNo}`" width="1180px" @close="selectedReceiptId = ''">
            <div class="detail-summary"><div><span>生产来源</span><strong>{{ receiptSourceLabel(selectedReceipt) }}</strong><small>{{ selectedReceipt.date }}</small></div><div><span>经办人</span><strong>{{ selectedReceipt.person }}</strong></div><div><span>入库记录</span><strong>{{ selectedReceipt.lines.length }} 项</strong><small>已过账</small></div></div>
            <div class="table-scroll"><table class="detail-table"><thead><tr><th>图片</th><th>生产对象</th><th>完工记录 / 生产单</th><th>入库数量</th><th>单位</th><th>仓库 / 库位</th><th>入库归属</th></tr></thead><tbody><tr v-for="line in selectedReceipt.lines" :key="line.completionId"><td><ProductionImage :src="orderForCompletionId(line.completionId).image" :name="orderForCompletionId(line.completionId).productName" /></td><td><strong>{{ orderForCompletionId(line.completionId).productName }}</strong><small>{{ orderForCompletionId(line.completionId).productCode }}</small><small>{{ orderForCompletionId(line.completionId).material }} · {{ orderForCompletionId(line.completionId).category }}</small></td><td><button class="text-button erp-selectable-text" type="button" @click="showCompletionFromReceipt(line.completionId, $event)">{{ completionNumber(line.completionId) }}</button><small>{{ orderNumber(orderForCompletionId(line.completionId).id) }}</small></td><td>{{ line.quantity }}</td><td>{{ orderForCompletionId(line.completionId).unit }}</td><td>{{ warehouseName(line.warehouseId) }}<small>{{ locationName(line.warehouseId, line.locationId) }}</small></td><td>{{ receiptOwnership(orderForCompletionId(line.completionId)) }}</td></tr></tbody></table></div>
            <p v-if="selectedReceipt.remark" class="detail-note">备注：{{ selectedReceipt.remark }}</p>
            <template #footer><button class="primary-button" type="button" @click="selectedReceiptId = ''">关闭</button></template>
        </ProductionExecutionDialog>
        <ProductionOrderExecutionDialog v-if="previewOrderId" :order-id="previewOrderId" @close="previewOrderId = ''" />
    </div>
</template>

<script setup lang="ts">
import ProductionExecutionDialog from "~/components/production/ProductionExecutionDialog.vue";
import ProductionImage from "~/components/production/ProductionImage.vue";
import ProductionOrderExecutionDialog from "~/components/production/ProductionOrderExecutionDialog.vue";
import { useProductionExecution } from "~/composables/production/useProductionExecution";
import { hasTextSelection } from "~/utils/textSelection";
import type { ExecutionCompletion, ExecutionMaterial, ExecutionOrder, ExecutionReceipt, ExecutionReceiptLine } from "~~/shared/types/production-execution";

definePageMeta({ layout: "production" });
useHead({ title: "完工入库 - 生产管理" });
const route = useRoute();
const {
    completions, allReceipts, warehouses, operatorName, today, getOrder, getCompletion, getReceipt,
    completedQty, receivedQty, completionReceived, completionPending, completionStatus, completionLimit,
    materialIssued, materialPendingReturn, sourceKey, sourceLabel, receiptOwnership, warehouseName, locationName,
    createCompletion, createReceipt, loadList, loadDetail, loadSource, loadCandidates, loadReceiptCandidates,
    candidateOrders, candidatePagination, candidateLoading, candidateError, loading, loadError, detailLoading, detailError,
    counts, pagination, refresh, submitting, canExecuteAction, canReceive,
} = useProductionExecution();
const statuses = ["待入库", "部分入库", "已入库"] as const;
type StatusFilter = "全部" | typeof statuses[number];
const tableColumns = "190px 190px 72px minmax(180px, 1fr) 100px 140px 100px 90px 100px";
const currentPage = ref(1);
const pageSize = ref(15);
const jumpPageInput = ref("");
const totalPages = computed(() => Math.max(1, Math.ceil(pagination.value.total / pageSize.value)));
const searchText = ref("");
const keyword = ref("");
const statusFilter = ref<StatusFilter>("全部");
const notice = ref("");
const previewOrderId = ref("");
const openOrderPreview = (id: string, event: MouseEvent) => {
    if (hasTextSelection(event)) {
        return;
    }

    previewOrderId.value = id;
};
const selectedCompletionId = ref("");
const selectedReceiptId = ref("");
const selectedCompletion = computed(() => getCompletion(selectedCompletionId.value));
const selectedReceipt = computed(() => {
    const receipt = getReceipt(selectedReceiptId.value);
    if (!receipt || receipt.lines.some((line) => !getCompletion(line.completionId) || !getOrder(line.orderId))) return undefined;
    return receipt;
});
const orderFor = (record: ExecutionCompletion): ExecutionOrder => getOrder(record.orderId)!;
const orderForCompletionId = (id: string): ExecutionOrder => orderFor(getCompletion(id)!);
const orderNumber = (id: string) => getOrder(id)?.documentNo || "生产单";
const completionNumber = (id: string) => getCompletion(id)?.documentNo || "完工记录";
const statusClass = (status: string) => status === "已入库" ? "done" : status === "部分入库" ? "working" : "pending";
const countStatus = (status: string) => counts.value[status] || 0;
const allCount = computed(() => counts.value["全部"] ?? statuses.reduce((sum, status) => sum + countStatus(status), 0));
const pageRows = completions;
const queryId = (name: string) => String(Array.isArray(route.query[name]) ? route.query[name]![0] || "" : route.query[name] || "");
const scope = computed(() => ({ productionOrderId: queryId("productionOrderId"), salesOrderId: queryId("salesOrderId") }));
const loadRows = () => loadList({ view: "completions", ...scope.value, keyword: keyword.value, status: statusFilter.value, page: currentPage.value, limit: pageSize.value });
const applySearch = () => { keyword.value = searchText.value.trim(); currentPage.value = 1; void loadRows(); };
const chooseStatus = (status: StatusFilter) => { statusFilter.value = status; currentPage.value = 1; void loadRows(); };
const goToPage = (page: number) => { currentPage.value = Math.min(totalPages.value, Math.max(1, page)); void loadRows(); };
const jumpToInputPage = () => { const page = Number(jumpPageInput.value); if (Number.isInteger(page)) goToPage(page); jumpPageInput.value = ""; };
watch(pageSize, () => { currentPage.value = 1; void loadRows(); });
watch(selectedCompletionId, (id) => { if (id) void loadDetail("completion", id); });
const openReceipt = async (id: string) => { if (await loadDetail("receipt", id)) selectedReceiptId.value = id; };
onMounted(async () => { await loadRows(); if (queryId("id")) selectedCompletionId.value = queryId("id"); if (queryId("receiptId")) await openReceipt(queryId("receiptId")); });
watch(() => [route.query.productionOrderId, route.query.salesOrderId, route.query.id, route.query.receiptId], async () => {
    const requestedPath = route.fullPath;
    currentPage.value = 1;
    selectedCompletionId.value = "";
    selectedReceiptId.value = "";
    showCompletionForm.value = false;
    showReceiptForm.value = false;
    previewOrderId.value = "";
    await loadRows();
    if (route.fullPath !== requestedPath) return;
    selectedCompletionId.value = queryId("id");
    if (queryId("receiptId")) await openReceipt(queryId("receiptId"));
});
watch([() => pagination.value.total, loading], () => {
    if (!loading.value && !loadError.value && currentPage.value > totalPages.value) {
        currentPage.value = totalPages.value;
        void loadRows();
    }
});

const showCompletionForm = ref(false);
const completionError = ref("");
const completionCandidateKeyword = ref("");
const completionForm = reactive({ orderId: "", quantity: 0, date: "", person: "", remark: "" });
const eligibleOrders = candidateOrders;
const formOrder = computed(() => getOrder(completionForm.orderId));
const formLimit = computed(() => formOrder.value?.completionLimit || 0);
const supportedQuantity = (_order: ExecutionOrder, material: ExecutionMaterial) => material.supportedQty;
watch(() => completionForm.orderId, () => { completionForm.quantity = formLimit.value; completionError.value = ""; });
const searchCompletionCandidates = async () => {
    if (!canExecuteAction("register-completion")) return;
    completionForm.orderId = "";
    if (await loadCandidates("completion", completionCandidateKeyword.value.trim())) completionForm.orderId = candidateOrders.value[0]?.id || "";
};
const moreCompletionCandidates = () => loadCandidates("completion", completionCandidateKeyword.value.trim(), candidatePagination.value.page + 1);
const openCompletionForm = async () => {
    if (!canExecuteAction("register-completion")) return;
    completionError.value = "";
    completionCandidateKeyword.value = "";
    Object.assign(completionForm, { orderId: "", quantity: 0, date: today(), person: operatorName.value, remark: "" });
    showCompletionForm.value = true;
    if (!await loadCandidates("completion")) return;
    const preferred = scope.value.productionOrderId;
    if (preferred && !candidateOrders.value.some((order) => order.id === preferred)) {
        await loadSource({ productionOrderId: preferred });
        const order = getOrder(preferred);
        if (order?.executable && order.completionLimit > 0) candidateOrders.value.push(order);
    }
    completionForm.orderId = preferred ? candidateOrders.value.find((order) => order.id === preferred)?.id || "" : candidateOrders.value[0]?.id || "";
    completionForm.quantity = formLimit.value;
};
const submitCompletion = async () => {
    if (!canExecuteAction("register-completion")) return;
    completionError.value = "";
    try {
        const record = await createCompletion({ ...completionForm });
        showCompletionForm.value = false;
        selectedCompletionId.value = record.id;
        notice.value = `已登记完工记录 ${record.documentNo}`;
    } catch (error) { completionError.value = error instanceof Error ? error.message : "登记完工失败，请核对填写内容。"; }
};
const relatedReceipts = computed(() => allReceipts.value.filter((receipt) => receipt.lines.some((line) => line.completionId === selectedCompletionId.value)));
const receiptQuantity = (receipt: ExecutionReceipt, completionId: string) => receipt.lines.filter((line) => line.completionId === completionId).reduce((sum, line) => sum + line.quantity, 0);
const receiptStorage = (receipt: ExecutionReceipt, completionId: string) => receipt.lines.filter((line) => line.completionId === completionId).map((line) => `${warehouseName(line.warehouseId)} / ${locationName(line.warehouseId, line.locationId)}`).join("；");

interface ReceiptDraft { selected: boolean; quantity: number; warehouseId: string; locationId: string; }
const showReceiptForm = ref(false);
const singleCompletionId = ref("");
const receiptError = ref("");
const receiptSourceKeyword = ref("");
const receiptSourcesLoading = ref(false);
const receiptSourceLoading = ref(false);
const receiptSourcesPage = ref(1);
const receiptSourcesTotal = ref(0);
const receiptSourceOrders = ref<ExecutionOrder[]>([]);
const receiptSourceCompletions = ref<ExecutionCompletion[]>([]);
const receiptForm = reactive({ sourceKey: "", date: "", person: "", remark: "", qualified: false });
const receiptDrafts = reactive<Record<string, ReceiptDraft>>({});
const receiptSources = computed(() => receiptSourceOrders.value.map((order) => ({ key: sourceKey(order), label: sourceLabel(order) })));
const receiptCandidates = computed(() => receiptSourceCompletions.value.filter((record) => record.pendingQty > 0 && (!singleCompletionId.value || record.id === singleCompletionId.value)));
const warehouseLocations = (id: string) => warehouses.value.find((warehouse) => warehouse.id === id)?.locations || [];
const resetReceiptDrafts = () => {
    for (const id of Object.keys(receiptDrafts)) delete receiptDrafts[id];
    const warehouse = warehouses.value.find((item) => item.locations.length > 0);
    for (const record of receiptCandidates.value) receiptDrafts[record.id] = { selected: Boolean(singleCompletionId.value), quantity: record.pendingQty, warehouseId: warehouse?.id || "", locationId: warehouse?.locations[0]?.id || "" };
};
let receiptLookupSequence = 0;
const loadReceiptSources = async (page = 1) => {
    if (!canReceive.value) return;
    const sequence = ++receiptLookupSequence;
    receiptSourcesLoading.value = true;
    receiptError.value = "";
    if (page === 1) { receiptSourceOrders.value = []; receiptForm.sourceKey = ""; receiptSourceCompletions.value = []; }
    try {
        const data = await loadReceiptCandidates(receiptSourceKeyword.value.trim(), page);
        if (!data || sequence !== receiptLookupSequence) return;
        for (const record of data.completions) {
            if (record.pendingQty <= 0) continue;
            const order = getOrder(record.orderId);
            if (order && !receiptSourceOrders.value.some((item) => sourceKey(item) === sourceKey(order))) receiptSourceOrders.value.push(order);
        }
        receiptSourcesPage.value = data.pagination.page;
        receiptSourcesTotal.value = data.pagination.total;
        if (!receiptForm.sourceKey) receiptForm.sourceKey = receiptSources.value[0]?.key || "";
    } catch (error) { if (sequence === receiptLookupSequence) receiptError.value = error instanceof Error ? error.message : "加载生产来源失败。"; }
    finally { if (sequence === receiptLookupSequence) receiptSourcesLoading.value = false; }
};
let sourceSequence = 0;
const loadReceiptSource = async () => {
    if (!canReceive.value) return;
    const sequence = ++sourceSequence;
    receiptSourceCompletions.value = [];
    receiptSourceLoading.value = true;
    receiptError.value = "";
    const order = receiptSourceOrders.value.find((item) => sourceKey(item) === receiptForm.sourceKey);
    if (!order) { receiptSourceLoading.value = false; return; }
    const data = await loadSource(order.sourceType === "stock" ? { productionOrderId: order.id } : { salesOrderId: order.salesOrderId });
    if (sequence !== sourceSequence) return;
    receiptSourceCompletions.value = data?.completions || [];
    if (!data) receiptError.value = detailError.value || "加载待入库批次失败，请重试。";
    resetReceiptDrafts();
    receiptSourceLoading.value = false;
};
watch(() => receiptForm.sourceKey, () => { if (showReceiptForm.value) void loadReceiptSource(); }, { flush: "sync" });
const changeWarehouse = (id: string) => { receiptDrafts[id].locationId = warehouseLocations(receiptDrafts[id].warehouseId)[0]?.id || ""; };
const openReceiptForm = async (record?: ExecutionCompletion) => {
    if (!canReceive.value) return;
    singleCompletionId.value = record?.id || "";
    receiptSourceKeyword.value = "";
    receiptSourceOrders.value = [];
    Object.assign(receiptForm, { sourceKey: "", date: today(), person: operatorName.value, remark: "", qualified: false });
    showReceiptForm.value = true;
    if (record) {
        const order = orderFor(record);
        receiptSourceOrders.value = [order];
        receiptForm.sourceKey = sourceKey(order);
    } else {
        await loadReceiptSources();
        receiptForm.sourceKey = receiptSources.value[0]?.key || "";
    }
};
const submitReceipt = async () => {
    if (!canReceive.value) return;
    receiptError.value = "";
    try {
        const lines: Array<Omit<ExecutionReceiptLine, "orderId">> = [];
        for (const record of receiptCandidates.value) {
            const draft = receiptDrafts[record.id];
            if (draft?.selected) lines.push({ completionId: record.id, quantity: draft.quantity, warehouseId: draft.warehouseId, locationId: draft.locationId });
        }
        const receipt = await createReceipt({ ...receiptForm, lines });
        showReceiptForm.value = false;
        selectedReceiptId.value = receipt.id;
        notice.value = `已记录入库单 ${receipt.documentNo}`;
    } catch (error) { receiptError.value = error instanceof Error ? error.message : "入库失败，请核对填写内容。"; }
};
const receiptSourceLabel = (receipt: ExecutionReceipt) => { const order = getOrder(receipt.lines[0]?.orderId || ""); return order ? sourceLabel(order) : "—"; };
const showCompletionFromReceipt = (id: string, event: MouseEvent) => {
    if (hasTextSelection(event)) {
        return;
    }

    selectedReceiptId.value = "";
    selectedCompletionId.value = id;
};
</script>

<style src="~/assets/css/production-execution.css"></style>
<style scoped>
.row-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.completion-materials summary, details summary { cursor: pointer; color: #606266; font-size: 13px; }
.completion-materials .table-scroll { margin-top: 12px; }
.machine-numbers { white-space: pre-wrap; overflow-wrap: anywhere; color: #606266; }
.receipt-table { min-width: 1080px; }
.receipt-table input[type="number"] { width: 90px; }
.storage-fields select { display: block; width: 155px; margin: 3px 0; }
.required { color: #e45b5b; }
.candidate-search { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
</style>
