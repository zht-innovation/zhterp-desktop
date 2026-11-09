<template>
    <div class="production-list-page">
        <header class="page-topbar">
            <ErpBreadcrumb icon="lucide:factory" :items="[{ label: '生产管理' }, { label: '生产单' }]" />
            <ErpSearchBox v-model="searchText" placeholder="搜索生产单、产品或订单" @search="search" />
        </header>

        <section class="page-heading">
            <h1>生产单</h1>
            <p>查看生产计划与执行进度</p>
        </section>

        <section class="status-cards" aria-label="生产单状态统计">
            <button v-for="card in statusCards" :key="card.filter" type="button" :class="{ active: statusFilter === card.filter }" @click="chooseStatus(card.filter)">
                <span>{{ card.label }}</span><strong>{{ card.count }}</strong><small>张生产单</small>
            </button>
        </section>

        <section class="list-card">
            <div class="list-actions">
                <button class="primary-button" type="button" :disabled="Boolean(deletingOrderId)" @click="openCreate"><Icon name="lucide:plus" />新建生产单</button>
                <span class="list-help">下达生产单后，可在详情中查看计划与执行数量。</span>
            </div>
            <div class="filter-row">
                <div class="filter-tabs" role="group" aria-label="按生产单状态筛选">
                    <button v-for="item in statusFilters" :key="item.value" type="button" :class="{ active: statusFilter === item.value }" @click="chooseStatus(item.value)">{{ item.label }}<span>{{ item.count }}</span></button>
                </div>
                <button class="rules-button" type="button" @click="showRules = true"><Icon name="lucide:circle-help" />数量口径</button>
            </div>

            <ErpTableFrame :columns="tableColumns" minimum-width="1120px" :loading="loading" :empty="!loading && rows.length === 0" empty-text="暂无生产单" scroll-x>
                <template #header>
                    <div class="table-row table-header"><div>生产单 / 订单</div><div>生产对象</div><div>负责人 / 车间</div><div>计划完成</div><div>状态</div><div>物料</div><div>入库 / 计划</div><div>操作</div></div>
                </template>
                <div v-for="row in rows" :key="row.id" class="table-row table-data">
                    <div class="stack"><strong>{{ row.documentNo }}</strong><span>{{ row.sourceType === 'stock' ? '备货生产 · 无来源订单' : row.salesOrderNo || '来源订单未维护' }}</span><small v-if="row.salesperson">销售员：{{ row.salesperson }}</small></div>
                    <div class="stack"><strong>{{ row.productName }}</strong><span>{{ row.productCode }} · {{ row.unit }}</span><small>BOM {{ row.bomVersion || '未维护' }}</small></div>
                    <div class="stack"><strong>{{ row.owner }}</strong><span>{{ row.workshop }}</span></div>
                    <div class="stack"><span>{{ formatDate(row.planFinish) }}</span><button v-if="row.pendingWarningCount" class="warning-link" type="button" @click="openDetail(row, 'warnings')">待处理预警 {{ row.pendingWarningCount }}</button></div>
                    <div><span class="status-pill" :class="statusClass(row.status)">{{ row.status }}</span></div>
                    <div class="stack"><span class="material-pill" :class="materialClass(row.materialStatus)" :title="row.materialStatusReason || (row.materialStatus ? '' : '未能取得物料状态，请刷新后重试。')">{{ row.materialStatus || '—' }}</span><small>BOM {{ row.materialCount }} 项</small></div>
                    <div class="stack"><strong>{{ row.receivedQty }} / {{ row.planQty }} {{ row.unit }}</strong><small>已完工 {{ row.completedQty }}</small></div>
                    <div class="row-actions">
                        <button class="text-button" type="button" @click="openDetail(row)">查看 <Icon name="lucide:arrow-up-right" /></button>
                        <button v-if="canEditOrder(row)" class="text-button" type="button" :disabled="Boolean(deletingOrderId)" @click="openEdit(row)">修改</button>
                        <button v-if="canDeleteOrder(row)" class="text-button delete-button" type="button" :disabled="Boolean(deletingOrderId)" @click="deleteOrder(row)">{{ deletingOrderId === row.id ? '删除中…' : '删除' }}</button>
                    </div>
                </div>
            </ErpTableFrame>
            <InventoryPagination v-model:page-size="pageSize" v-model:jump-page-input="jumpPageInput" :total="total" :page-size-options="[5, 10, 15]" :total-pages="totalPages" :current-page="page" @page-change="changePage" @jump="jumpToPage" />
        </section>
        <p v-if="loadError" class="page-error" role="alert">{{ loadError }} <button type="button" @click="loadRows">重试</button></p>
        <p v-if="detailError && !selectedOrder" class="page-error" role="alert">{{ detailError }} <button type="button" @click="openRequestedOrder">重试详情</button></p>

        <Teleport to="body">
            <div v-if="selectedOrder" v-show="!purchaseOrder && !allocationOrderId" class="modal-shade erp-selectable" @click.self="selectedOrder = null">
                <section class="order-dialog" role="dialog" aria-modal="true" :aria-label="`生产单 ${selectedOrder.documentNo} 详情`">
                    <header><div><h2>生产单详情 · {{ selectedOrder.documentNo }}</h2><p>{{ selectedOrder.sourceType === 'stock' ? '备货生产' : `来源订单 ${selectedOrder.salesOrderNo}` }}</p></div><button class="icon-button" type="button" aria-label="关闭详情" @click="selectedOrder = null"><Icon name="lucide:x" /></button></header>
                    <div class="dialog-body">
                        <p v-if="detailLoading" class="detail-note">正在加载生产单详情…</p>
                        <p v-if="detailError" class="page-error" role="alert">{{ detailError }} <button type="button" @click="loadDetail(selectedOrder.id)">重试</button></p>
                        <div class="detail-summary">
                            <div><span>生产状态</span><strong><span class="status-pill" :class="statusClass(selectedOrder.status)">{{ selectedOrder.status }}</span></strong></div>
                            <div><span>生产对象</span><strong>{{ selectedOrder.productName }}</strong><small>{{ selectedOrder.productCode }} · {{ selectedOrder.unit }}</small></div>
                            <div><span>计划数量</span><strong>{{ selectedOrder.planQty }} {{ selectedOrder.unit }}</strong><small>BOM {{ selectedOrder.bomVersion || '未维护' }}</small></div>
                            <div><span>负责人 / 车间</span><strong>{{ selectedOrder.owner }}</strong><small>{{ selectedOrder.workshop }}</small></div>
                        </div>
                        <div v-if="canAllocatePublicMaterials && selectedOrder.sourceType === 'order'" class="material-allocation-actions">
                            <p>{{ materialAllocationBlockReason || '找到可用公共物料时，可额外分配到来源订单。' }}</p>
                            <button class="primary-button" type="button" :disabled="Boolean(deletingOrderId) || Boolean(materialAllocationBlockReason)" :title="materialAllocationBlockReason" @click="openMaterialAllocation">额外分配物料到订单</button>
                        </div>
                        <div class="detail-tabs"><button v-for="tab in detailTabs" :key="tab.value" type="button" :class="{ active: detailTab === tab.value }" @click="detailTab = tab.value">{{ tab.label }}</button></div>
                        <div v-if="detailTab === 'plan'" class="detail-panel">
                            <div class="information-grid"><div><span>生产单号</span><strong>{{ selectedOrder.documentNo }}</strong></div><div><span>来源订单</span><strong>{{ selectedOrder.salesOrderNo || '备货生产' }}</strong></div><div><span>计划开始</span><strong>{{ formatDate(selectedOrder.planStart) }}</strong></div><div><span>计划完成</span><strong>{{ formatDate(selectedOrder.planFinish) }}</strong></div><div><span>生产预警</span><strong>交期前 {{ selectedOrder.warningDays === 5 ? 5 : 3 }} 天</strong></div><div><span>优先级</span><strong>{{ selectedOrder.priority }}</strong></div><div><span>当前版本</span><strong>V{{ selectedOrder.version }}</strong></div></div>
                            <div class="progress-section"><div><span>合格入库进度</span><strong>{{ selectedOrder.receivedQty }} / {{ selectedOrder.planQty }} {{ selectedOrder.unit }}</strong></div><div class="progress-track"><span :style="{ width: `${Math.min(100, selectedOrder.planQty ? selectedOrder.receivedQty / selectedOrder.planQty * 100 : 0)}%` }" /></div><p>累计完工 {{ selectedOrder.completedQty }} {{ selectedOrder.unit }}，完工待入库 {{ Math.max(0, selectedOrder.completedQty - selectedOrder.receivedQty) }} {{ selectedOrder.unit }}。</p></div>
                            <div class="note-block"><span>机器号</span><p>{{ selectedOrder.machineNumbers.length ? selectedOrder.machineNumbers.join('、') : '暂无机器号' }}</p></div>
                            <div class="note-block"><span>生产备注</span><p>{{ selectedOrder.remark || '暂无备注' }}</p></div>
                        </div>
                        <div v-else-if="detailTab === 'warnings'" class="detail-panel"><ProductionOrderWarnings :key="selectedOrder.id" :production-order-id="selectedOrder.id" :warnings="detailWarnings" :loading="detailLoading" :disabled="Boolean(deletingOrderId) || Boolean(detailError)" @handled="handleWarningHandled" @refresh="loadDetail(selectedOrder.id)" /></div>
                        <div v-else class="detail-panel"><ProductionExecutionRecords :production-order-id="selectedOrder.id" :tab="detailTab === 'materials' ? 'materials' : 'completion'" :data="detailExecution" :allow-material-loss="!deletingOrderId && !detailLoading && !detailError" @register-loss="openMaterialLoss" /></div>
                        <p v-if="canEditProductionOrder && selectedOrder.deleteBlockReason" class="detail-note">不可删除：{{ selectedOrder.deleteBlockReason }}</p>
                    </div>
                    <footer>
                        <span v-if="canRequestProductionPurchase" class="purchase-action" :title="purchaseBlockReason"><button class="secondary-button" type="button" :disabled="Boolean(deletingOrderId) || Boolean(purchaseBlockReason)" @click="openProductionPurchase">采购申请</button><small v-if="purchaseBlockReason">{{ purchaseBlockReason }}</small></span>
                        <button v-if="canDeleteOrder(selectedOrder)" class="secondary-button delete-button" type="button" :disabled="Boolean(deletingOrderId) || detailLoading || Boolean(detailError)" @click="deleteOrder(selectedOrder)">{{ deletingOrderId === selectedOrder.id ? '删除中…' : '删除' }}</button>
                        <button v-if="selectedOrder.status === '草稿'" class="primary-button" type="button" :disabled="releasing || Boolean(deletingOrderId)" @click="releaseDraft">{{ releasing ? '下达中…' : '确认下达' }}</button><NuxtLink v-else class="text-button" :to="{ path: '/configuration/production/requisitions', query: { productionOrderId: selectedOrder.id } }">发料管理</NuxtLink><NuxtLink v-if="selectedOrder.status !== '草稿'" class="text-button" :to="{ path: '/configuration/production/completion', query: { productionOrderId: selectedOrder.id } }">完工入库</NuxtLink><button class="secondary-button" type="button" @click="selectedOrder = null">关闭</button>
                    </footer>
                </section>
            </div>

            <ProductionOrderCreateDialog v-if="showCreate" @close="showCreate = false" @created="handleCreated" />
            <ProductionOrderEditDialog v-if="editingOrderId" :key="editingOrderId" :production-order-id="editingOrderId" @close="editingOrderId = ''" @saved="handleEdited" />
            <ProductionMaterialLossDialog v-if="lossTarget" :order-id="lossTarget.orderId" :product-id="lossTarget.productId" @close="lossTarget = null" @registered="handleLossRegistered" />
            <ProductionMaterialAllocationDialog v-if="allocationOrderId" :order-id="allocationOrderId" @close="allocationOrderId = ''" @allocated="handleMaterialsAllocated" />
            <PurchaseRequestDialog v-if="purchaseOrder" :production-order-id="purchaseOrder.id" :production-order-no="purchaseOrder.documentNo" @close="purchaseOrder = null" @saved="purchaseOrder = null" @submitted="handlePurchaseSubmitted" />
            <div v-if="showRules" class="modal-shade rules-shade erp-selectable" @click.self="showRules = false"><section class="rules-dialog" role="dialog" aria-modal="true" aria-label="数量口径"><header><h2>数量口径</h2><button class="icon-button" type="button" aria-label="关闭数量口径" @click="showRules = false"><Icon name="lucide:x" /></button></header><div><p><strong>计划数量</strong>：本张生产单确认要生产的数量。</p><p><strong>累计完工</strong>：已登记完成生产的数量，不直接增加库存。</p><p><strong>合格入库</strong>：已确认入库的合格数量；计划数量全部入库后，生产单完成。</p><p><strong>完工待入库</strong>：累计完工减去合格入库。</p></div><footer><button class="primary-button" type="button" @click="showRules = false">知道了</button></footer></section></div>
        </Teleport>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    </div>
</template>

<script setup lang="ts">
import { getToken } from "~/utils/auth";
import { erpMessageBox } from "~/utils/erpMessageBox";
import ProductionOrderEditDialog from "~/components/ProductionOrderEditDialog.vue";
import ProductionExecutionRecords from "~/components/production/ProductionExecutionRecords.vue";
import ProductionMaterialLossDialog from "~/components/production/ProductionMaterialLossDialog.vue";
import ProductionMaterialAllocationDialog from "~/components/production/ProductionMaterialAllocationDialog.vue";
import ProductionOrderWarnings from "~/components/production/ProductionOrderWarnings.vue";
import PurchaseRequestDialog from "~/components/approval/PurchaseRequestDialog.vue";
import { useProductionRevision } from "~/composables/production/useProductionRevision";
import type { ExecutionSnapshot, ProductionMaterialState, ProductionMaterialStatus } from "~~/shared/types/production-execution";
import type { ProductionWarning } from "~~/shared/types/production-warning";
import { isApprovalApplicantRole } from "~~/shared/enums";
import { canAccessConfigurationPath, canExecuteProductionAction, hasFullInventoryAccess } from "~~/shared/utils/adminPermission";

definePageMeta({ layout: "production" });
useHead({ title: "生产单 - 生产管理" });
const route = useRoute();
const router = useRouter();
const { revision, invalidateProduction } = useProductionRevision();

type Status = "草稿" | "待发料" | "待生产" | "生产中" | "已完成";
type Filter = "全部" | "草稿" | "待执行" | "生产中" | "已完成";
interface ProductionRow extends ProductionMaterialState {
    id: string; documentNo: string; sourceType: "order" | "stock"; salesOrderNo: string; salesperson: string;
    productId: string; rootProductId: string; productCode: string; productName: string; unit: string;
    planQty: number; status: Status; owner: string; workshop: string; priority: string;
    planStart: string; planFinish: string; bomVersion: string; completedQty: number; receivedQty: number;
    machineNumbers: string[]; remark: string; version: number;
    materialCount: number;
    warningDays: number; pendingWarningCount: number;
    canDelete: boolean; deleteBlockReason: string;
}
const rows = ref<ProductionRow[]>([]);
const detailExecution = ref<ExecutionSnapshot>();
const detailWarnings = ref<ProductionWarning[]>([]);
const detailLoading = ref(false);
const detailError = ref("");
const counts = reactive<Record<Status, number>>({ "草稿": 0, "待发料": 0, "待生产": 0, "生产中": 0, "已完成": 0 });
const loading = ref(false);
const loadError = ref("");
const total = ref(0);
const page = ref(1);
const pageSize = ref(15);
const jumpPageInput = ref("");
const searchText = ref("");
const keyword = ref("");
const statusFilter = ref<Filter>("全部");
const selectedOrder = ref<ProductionRow | null>(null);
const lossTarget = ref<{ orderId: string; productId: string } | null>(null);
const allocationOrderId = ref("");
const purchaseOrder = ref<{ id: string; documentNo: string } | null>(null);
const adminInfo = useState<{ role?: number }>("admin_info", () => ({}));
const canEditProductionOrder = computed(() => canAccessConfigurationPath(Number(adminInfo.value?.role), "/configuration/production/production-orders"));
const canEditOrder = (row: ProductionRow) => canEditProductionOrder.value && ["草稿", "待发料", "待生产", "生产中"].includes(row.status);
const canDeleteOrder = (row: ProductionRow) => canEditProductionOrder.value && row.canDelete === true;
const canRequestProductionPurchase = computed(() => {
    const role = Number(adminInfo.value?.role);
    return hasFullInventoryAccess(role) && isApprovalApplicantRole(role);
});
const executionOrder = computed(() => detailExecution.value?.orders.find((order) => order.id === selectedOrder.value?.id));
const canAllocatePublicMaterials = computed(() => canExecuteProductionAction(Number(adminInfo.value?.role), "allocate-public-materials"));
const materialAllocationBlockReason = computed(() => {
    if (detailLoading.value) return "正在加载生产单详情";
    if (detailError.value || !executionOrder.value) return "请先加载有效的生产单详情";
    if (!executionOrder.value.executable) return executionOrder.value.blockReason || "生产单当前不能额外分配物料";
    return "";
});
const purchaseBlockReason = computed(() => {
    if (detailLoading.value) return "正在加载生产单详情";
    if (detailError.value || !executionOrder.value) return "请先加载有效的生产单详情";
    if (!executionOrder.value.executable) return executionOrder.value.blockReason || "生产单当前不能采购申请";
    if (!executionOrder.value.hasMaterialLoss) return "请先登记损耗";
    return "";
});
type DetailTab = "plan" | "materials" | "completion" | "warnings";
const detailTab = ref<DetailTab>("plan");
const detailTabs = [{ value: "plan", label: "生产计划" }, { value: "materials", label: "物料与发料" }, { value: "completion", label: "完工与入库" }, { value: "warnings", label: "生产预警" }] as const;
const showRules = ref(false);
const showCreate = ref(false);
const editingOrderId = ref("");
const releasing = ref(false);
const deletingOrderId = ref("");
const notice = ref("");
const releaseKeys = new Map<string, string>();
const tableColumns = "minmax(170px, 1.15fr) minmax(180px, 1.25fr) minmax(130px, .8fr) 115px 115px minmax(170px, 1fr) 125px 155px";
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
let listSequence = 0;
let detailSequence = 0;
const allCount = computed(() => Object.values(counts).reduce((sum, count) => sum + count, 0));
const statusCards = computed(() => [
    { filter: "草稿" as Filter, label: "草稿", count: counts["草稿"] },
    { filter: "待执行" as Filter, label: "待生产", count: counts["待发料"] + counts["待生产"] },
    { filter: "生产中" as Filter, label: "生产中", count: counts["生产中"] },
    { filter: "已完成" as Filter, label: "已完成", count: counts["已完成"] },
]);
const statusFilters = computed(() => [{ value: "全部" as Filter, label: "全部", count: allCount.value }, ...statusCards.value.map((card) => ({ value: card.filter, label: card.label, count: card.count }))]);
const formatDate = (value: string) => value ? String(value).slice(0, 10) : "—";
const statusClass = (status: Status) => ({ "草稿": "draft", "待发料": "pending", "待生产": "pending", "生产中": "working", "已完成": "done" })[status];
const materialClass = (status: ProductionMaterialStatus | null) => {
    switch (status) {
        case "缺料": return "shortage";
        case "缺料·部分领料": return "partial";
        case "待领料": return "ready";
        case "已领齐": return "complete";
        default: return "unknown";
    }
};
const closeDeletedOrder = (id: string) => {
    // 同时作废删除前发起的详情请求，避免迟到响应重新打开已删除单据。
    ++detailSequence;
    detailLoading.value = false;
    if (selectedOrder.value?.id === id) {
        selectedOrder.value = null;
        detailExecution.value = undefined;
        detailWarnings.value = [];
        detailError.value = "";
    }
    if (editingOrderId.value === id) editingOrderId.value = "";
    if (lossTarget.value?.orderId === id) lossTarget.value = null;
    if (allocationOrderId.value === id) allocationOrderId.value = "";
    if (purchaseOrder.value?.id === id) purchaseOrder.value = null;
    if (String(route.query.id || "") === id) {
        const query = { ...route.query };
        delete query.id;
        delete query.tab;
        void router.replace({ query });
    }
};
const loadDetail = async (id: string, open = false) => {
    const sequence = ++detailSequence;
    detailLoading.value = true;
    detailError.value = "";
    try {
        const result: any = await $fetch("/production/orders/detail", { headers: { Token: getToken() || "" }, query: { id } });
        if (result?.code !== 200) throw new Error(result?.msg || "加载生产单详情失败");
        if (sequence !== detailSequence) return;
        if (!open && selectedOrder.value?.id !== id) return;
        selectedOrder.value = result.data.order;
        detailExecution.value = result.data.execution;
        detailWarnings.value = result.data.warnings || [];
    } catch (error: any) {
        if (sequence !== detailSequence) return;
        if (Number(error?.statusCode || error?.status || error?.response?.status) === 404) {
            closeDeletedOrder(id);
            notice.value = error?.data?.msg || "生产单不存在或已被删除";
            return;
        }
        if (open || selectedOrder.value?.id === id) detailError.value = error?.data?.msg || error?.message || "加载生产单详情失败";
    } finally { if (sequence === detailSequence) detailLoading.value = false; }
};
const openDetail = (row: ProductionRow, tab: DetailTab = "plan") => {
    detailTab.value = tab;
    detailExecution.value = undefined;
    detailWarnings.value = [];
    selectedOrder.value = row;
    void loadDetail(row.id);
};
const openMaterialLoss = (orderId: string, productId: string) => {
    if (deletingOrderId.value || detailLoading.value || detailError.value || selectedOrder.value?.id !== orderId) return;
    lossTarget.value = { orderId, productId };
};
const handleLossRegistered = () => {
    lossTarget.value = null;
    notice.value = "已登记物料损耗";
};
const openMaterialAllocation = () => {
    if (deletingOrderId.value || !canAllocatePublicMaterials.value || materialAllocationBlockReason.value || selectedOrder.value?.sourceType !== "order") return;
    allocationOrderId.value = selectedOrder.value.id;
};
const handleMaterialsAllocated = () => {
    allocationOrderId.value = "";
    notice.value = "已额外分配物料到订单";
};
const openProductionPurchase = () => {
    if (deletingOrderId.value || !canRequestProductionPurchase.value || purchaseBlockReason.value || !selectedOrder.value) return;
    purchaseOrder.value = { id: selectedOrder.value.id, documentNo: selectedOrder.value.documentNo };
};
const handlePurchaseSubmitted = () => {
    purchaseOrder.value = null;
    notice.value = "生产采购申请已提交审批";
};
const handleWarningHandled = () => {
    notice.value = "已保存生产预警处理记录";
    invalidateProduction();
};
const loadRows = async (): Promise<void> => {
    const sequence = ++listSequence;
    loading.value = true;
    loadError.value = "";
    try {
        const result: any = await $fetch("/production/orders/list", { headers: { Token: getToken() || "" }, query: { page: page.value, limit: pageSize.value, status: statusFilter.value, keyword: keyword.value, salesOrderId: String(route.query.salesOrderId || "") } });
        if (result?.code !== 200) throw new Error(result?.msg || "加载生产单失败");
        if (sequence !== listSequence) return;
        rows.value = result.data?.list || [];
        total.value = Number(result.data?.pagination?.total || 0);
        Object.assign(counts, result.data?.counts || {});
        if (page.value > totalPages.value) {
            page.value = totalPages.value;
            await loadRows();
            return;
        }
        if (selectedOrder.value) {
            const current = rows.value.find((row) => row.id === selectedOrder.value?.id);
            if (current && current.version >= selectedOrder.value.version) selectedOrder.value = current;
        }
    } catch (error: any) {
        if (sequence !== listSequence) return;
        rows.value = [];
        total.value = 0;
        loadError.value = error?.data?.msg || error?.message || "加载生产单失败";
    } finally { if (sequence === listSequence) loading.value = false; }
};
const openRequestedOrder = () => {
    const id = String(route.query.id || "");
    if (!id) return;
    const tab = String(route.query.tab || "");
    detailTab.value = tab === "materials" || tab === "completion" || tab === "warnings" ? tab : "plan";
    detailExecution.value = undefined;
    detailWarnings.value = [];
    void loadDetail(id, true);
};
onMounted(() => { void loadRows(); openRequestedOrder(); });
watch(() => [route.query.id, route.query.tab], openRequestedOrder);
watch(() => route.query.salesOrderId, () => { page.value = 1; void loadRows(); });
watch(revision, () => { void loadRows(); if (selectedOrder.value) void loadDetail(selectedOrder.value.id); });
watch(pageSize, () => { page.value = 1; void loadRows(); });
const search = () => { keyword.value = searchText.value.trim(); page.value = 1; void loadRows(); };
const chooseStatus = (value: Filter) => { statusFilter.value = value; page.value = 1; void loadRows(); };
const changePage = (value: number) => { page.value = Math.min(totalPages.value, Math.max(1, value)); void loadRows(); };
const jumpToPage = () => { const value = Number(jumpPageInput.value); if (Number.isInteger(value)) changePage(value); jumpPageInput.value = ""; };
const openCreate = () => { if (!deletingOrderId.value) showCreate.value = true; };
const openEdit = (row: ProductionRow) => {
    if (!deletingOrderId.value && canEditOrder(row)) editingOrderId.value = row.id;
};
const handleEdited = (result: { documentNo: string }) => {
    editingOrderId.value = "";
    notice.value = `已修改生产单 ${result.documentNo}`;
    invalidateProduction();
};
const handleCreated = async (result: { documentNo: string; intent: "draft" | "release" }) => {
    showCreate.value = false;
    notice.value = `已${result.intent === "draft" ? "保存草稿" : "下达"}生产单 ${result.documentNo}`;
    page.value = 1;
    invalidateProduction();
};
const deleteOrder = async (row: ProductionRow) => {
    if (!canDeleteOrder(row) || deletingOrderId.value || releasing.value || editingOrderId.value
        || allocationOrderId.value || lossTarget.value || purchaseOrder.value || showCreate.value) return;
    // 确认弹窗期间也锁定入口，避免重复打开弹窗和重复提交。
    deletingOrderId.value = row.id;
    try {
        await erpMessageBox.confirm(`是否确认删除生产单 ${row.documentNo}？仅无后续业务记录的生产单可删除。`, "删除生产单", {
            type: "warning", confirmButtonText: "确认删除", cancelButtonText: "取消",
        });
    } catch {
        deletingOrderId.value = "";
        return;
    }
    try {
        const result: any = await $fetch("/production/orders/add", {
            method: "POST", headers: { Token: getToken() || "" },
            body: { resource: "delete", id: row.id, version: row.version },
        });
        if (result?.code !== 200) throw new Error(result?.msg || "删除生产单失败");
        closeDeletedOrder(row.id);
        ++listSequence;
        rows.value = rows.value.filter((item) => item.id !== row.id);
        notice.value = `已删除生产单 ${row.documentNo}`;
        invalidateProduction();
    } catch (error: any) {
        const status = Number(error?.statusCode || error?.status || error?.response?.status);
        if (status === 404) closeDeletedOrder(row.id);
        else {
            ++detailSequence;
            detailLoading.value = false;
        }
        ++listSequence;
        notice.value = error?.data?.msg || error?.message || "删除结果尚未确认，正在刷新生产单，请核对后重试。";
        invalidateProduction();
    } finally { deletingOrderId.value = ""; }
};
const releaseDraft = async () => {
    const row = selectedOrder.value;
    if (!row || deletingOrderId.value) return;
    if (!releaseKeys.has(row.id)) releaseKeys.set(row.id, crypto.randomUUID());
    releasing.value = true;
    try {
        const result: any = await $fetch("/production/orders/release", { method: "POST", headers: { Token: getToken() || "", "Idempotency-Key": releaseKeys.get(row.id)! }, body: { id: row.id, version: row.version } });
        if (result?.code !== 200) throw new Error(result?.msg || "下达失败");
        releaseKeys.delete(row.id);
        notice.value = `已下达生产单 ${row.documentNo}`;
        selectedOrder.value = null;
        invalidateProduction();
    } catch (error: any) { notice.value = error?.data?.msg || error?.message || "下达失败"; }
    finally { releasing.value = false; }
};
</script>

<style scoped>
.row-actions { display: flex; align-items: center; gap: 12px; white-space: nowrap; }
.text-button.delete-button,.secondary-button.delete-button { color: #d9363e; }
.text-button:disabled { opacity: .6; cursor: not-allowed; }
.warning-link { padding: 3px 6px; border: 0; border-radius: 4px; background: #fdf6ec; color: #b77712; font: inherit; font-size: 12px; cursor: pointer; }
.material-allocation-actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-top: 16px; }
.material-allocation-actions p { margin: 0; color: #909399; font-size: 12px; }
.material-allocation-actions button { margin-left: auto; }
.purchase-action { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-right: auto; }
.purchase-action small { max-width: 260px; color: #909399; font-size: 12px; }
.production-list-page { box-sizing: border-box; height: 100%; min-height: 0; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 20px; background: #f5f7fa; color: #303133; font-family: var(--erp-typography-font-family-base); font-size: 14px; }
.page-topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 42px; }
.page-heading h1 { margin: 0; font-size: 24px; line-height: 32px; font-weight: 600; color: #202122; }.page-heading p { margin: 5px 0 0; color: #909399; font-size: 13px; }
.status-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }.status-cards button { min-height: 108px; padding: 17px 20px; text-align: left; border: 1px solid #e3e8ef; border-radius: 7px; background: #fff; cursor: pointer; }.status-cards button.active { border-color: #90c5ff; box-shadow: 0 0 0 2px #409eff16; }.status-cards span,.status-cards small { display: block; color: #606266; font-size: 13px; }.status-cards strong { display: block; margin: 7px 0 1px; color: #409eff; font-size: 29px; line-height: 34px; font-weight: 500; }.status-cards small { color: #a2a8b1; font-size: 11px; }
.list-card { min-height: 0; padding: 12px; border-radius: 7px; background: #fff; }.list-actions { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }.list-help { color: #909399; font-size: 12px; }.primary-button,.secondary-button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 35px; padding: 7px 14px; border-radius: 5px; font: inherit; cursor: pointer; }.primary-button { border: 1px solid #409eff; background: #409eff; color: #fff; }.primary-button:hover { background: #2d8de8; }.secondary-button { border: 1px solid #dcdfe6; background: #fff; color: #606266; }.primary-button:disabled,.secondary-button:disabled { opacity: .65; cursor: wait; }.primary-button :deep(svg) { width: 15px; height: 15px; }
.filter-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #e8edf3; }.filter-tabs { display: flex; flex-wrap: wrap; gap: 7px; }.filter-tabs button { display: flex; align-items: center; gap: 5px; min-height: 40px; padding: 0 10px; border: 0; border-bottom: 2px solid transparent; background: none; color: #606266; cursor: pointer; font: inherit; }.filter-tabs button.active { border-color: #409eff; color: #409eff; }.filter-tabs span { color: #909399; font-size: 12px; }.rules-button { display: inline-flex; align-items: center; gap: 5px; border: 0; background: none; color: #409eff; cursor: pointer; white-space: nowrap; }.rules-button :deep(svg) { width: 14px; height: 14px; }
.table-row { display: grid; grid-template-columns: v-bind(tableColumns); align-items: center; gap: 14px; min-width: 1120px; padding: 12px 14px; }.table-header { min-height: 44px; box-sizing: border-box; background: #f5f7fa; color: #606266; font-size: 12px; font-weight: 500; }.table-data { min-height: 83px; box-sizing: border-box; border-bottom: 1px solid #edf0f4; font-size: 13px; }.stack { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }.stack strong { font-weight: 600; color: #303133; }.stack span,.stack small { color: #909399; line-height: 18px; overflow-wrap: anywhere; }.stack small { font-size: 12px; }.status-pill,.material-pill { display: inline-block; padding: 4px 8px; border-radius: 4px; background: #ecf5ff; color: #409eff; font-size: 12px; white-space: nowrap; }.status-pill.draft { background: #f3f4f6; color: #777d87; }.status-pill.working { background: #e8f4ff; color: #2281d0; }.status-pill.done { background: #e9f7ef; color: #2b9b65; }.material-pill { background: #f4f6f8; color: #7a838e; }.text-button { display: inline-flex; align-items: center; gap: 2px; padding: 4px 0; border: 0; background: none; color: #409eff; font: inherit; cursor: pointer; }.text-button :deep(svg) { width: 13px; height: 13px; }.page-error { color: #d9363e; font-size: 13px; }.page-error button { border: 0; background: none; color: #409eff; cursor: pointer; }
.modal-shade { position: fixed; inset: 0; z-index: 2000; display: grid; place-items: center; padding: 20px; background: #0006; }.create-shade { z-index: 2010; }.rules-shade { z-index: 2020; }.order-dialog,.rules-dialog { width: min(990px, 100%); max-height: min(92vh, 900px); display: flex; flex-direction: column; overflow: hidden; border-radius: 8px; background: #fff; box-shadow: 0 20px 50px #0003; }.order-dialog header,.rules-dialog header { display: flex; align-items: center; justify-content: space-between; flex: 0 0 auto; gap: 12px; padding: 16px 20px; border-bottom: 1px solid #e9edf2; background: #f8fafc; }.order-dialog h2,.rules-dialog h2 { margin: 0; font-size: 17px; font-weight: 600; }.order-dialog header p { margin: 3px 0 0; color: #909399; font-size: 12px; }.icon-button { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 4px; background: none; color: #606266; cursor: pointer; }.icon-button:hover { background: #eef1f5; }.dialog-body { min-height: 0; padding: 20px; overflow: auto; }.order-dialog footer,.rules-dialog footer { display: flex; justify-content: flex-end; gap: 10px; flex: 0 0 auto; padding: 13px 20px; border-top: 1px solid #e9edf2; }
.detail-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 15px; border-radius: 6px; background: #f5f7fa; }.detail-summary div { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }.detail-summary span:not(.status-pill),.detail-summary small { color: #909399; font-size: 12px; }.detail-summary strong { font-size: 14px; font-weight: 600; }.detail-tabs { display: flex; gap: 24px; margin-top: 20px; border-bottom: 1px solid #e9edf2; }.detail-tabs button { padding: 0 4px 10px; border: 0; border-bottom: 2px solid transparent; background: none; color: #606266; cursor: pointer; font: inherit; }.detail-tabs button.active { border-color: #409eff; color: #409eff; }.detail-panel { padding: 20px 4px; }.information-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }.information-grid div { display: flex; flex-direction: column; gap: 5px; }.information-grid span,.note-block span { color: #909399; font-size: 12px; }.information-grid strong { font-size: 13px; font-weight: 500; }.progress-section,.note-block { margin-top: 24px; padding-top: 18px; border-top: 1px solid #edf0f4; }.progress-section>div:first-child { display: flex; justify-content: space-between; font-size: 13px; }.progress-section strong { font-weight: 600; }.progress-track { height: 7px; margin-top: 9px; border-radius: 10px; background: #e6ebf2; }.progress-track span { display: block; height: 100%; border-radius: inherit; background: #409eff; }.progress-section p,.detail-note,.note-block p { margin: 8px 0 0; color: #909399; font-size: 12px; }.empty-panel { display: grid; place-items: center; gap: 8px; min-height: 180px; color: #909399; text-align: center; }.empty-panel :deep(svg) { width: 28px; height: 28px; }.empty-panel strong { color: #606266; }.empty-panel p { margin: 0; font-size: 12px; }
.material-table-scroll { max-width: 100%; overflow-x: auto; }.material-table { width: 100%; min-width: 600px; border-collapse: collapse; text-align: left; font-size: 13px; }.material-table th { padding: 11px 12px; background: #f5f7fa; color: #606266; font-size: 12px; font-weight: 500; }.material-table td { padding: 14px 12px; border-bottom: 1px solid #edf0f4; }.material-table td strong,.material-table td small { display: block; }.material-table td small { color: #909399; font-size: 12px; }
@media (max-width: 900px) { .status-cards { gap: 8px; }.detail-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 650px) { .page-topbar { align-items: stretch; flex-direction: column; }.status-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }.list-actions { align-items: flex-start; flex-direction: column; }.information-grid { grid-template-columns: 1fr; } }
.material-pill.shortage { background: #fef0f0; color: #d9363e; }
.material-pill.partial { background: #fdf6ec; color: #d88b19; }
.material-pill.ready { background: #ecf5ff; color: #409eff; }
.material-pill.complete { background: #e9f7ef; color: #2b9b65; }
.material-pill.unknown { background: #f4f6f8; color: #7a838e; }
</style>

