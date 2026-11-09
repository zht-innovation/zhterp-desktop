<template>
    <div class="overview-page">
        <header class="topbar">
            <ErpBreadcrumb icon="lucide:factory" :items="[{ label: '生产管理' }, { label: '订单总览' }]" />
            <ErpSearchBox v-model="searchText" placeholder="搜索订单编号、产品型号或编号" @search="applySearch" />
        </header>

        <div class="page-intro">
            <div>
                <h1>订单总览</h1>
                <p>查看销售订单的备货进度和关联生产单</p>
            </div>
        </div>

        <div class="summary-grid" aria-label="订单状态统计">
            <button v-for="item in statusCards" :key="item.label" class="summary-card" :class="{ selected: statusFilter === item.label }" type="button" @click="chooseStatus(item.label)">
                <span class="summary-label"><Icon :name="item.icon" />{{ item.label }}</span>
                <strong>{{ item.count }}</strong>
                <span class="summary-unit">个订单</span>
            </button>
        </div>

        <section class="list-panel" aria-label="订单列表">
            <div class="list-toolbar">
                <div class="status-filters" role="group" aria-label="按订单状态筛选">
                    <button v-for="option in statusOptions" :key="option" type="button" :class="{ active: statusFilter === option }" @click="chooseStatus(option)">
                        {{ option }} <span>{{ option === '全部' ? Object.values(statusCounts).reduce((sum, count) => sum + count, 0) : statusCounts[option] }}</span>
                    </button>
                </div>
                <button class="help-button" type="button" @click="showRules = true">
                    <Icon name="lucide:circle-help" />数量口径
                </button>
            </div>

            <ErpTableFrame :columns="tableColumns" minimum-width="1080px" :loading="loading" :empty="!loading && pageOrders.length === 0" empty-text="暂无匹配订单" scroll-x>
                <template #header>
                    <div class="table-row table-head">
                        <div>订单 / 销售员 / 类型</div><div>产品型号 × 数量</div><div>交期</div><div>订单状态</div><div>关联生产单</div><div>订单进度 <small>已备货 / 订单需求</small></div><div>操作</div>
                    </div>
                </template>
                <div v-for="order in pageOrders" :key="order.id" class="table-row data-row">
                    <div class="order-cell"><strong>{{ order.id }}</strong><span>销售员：{{ order.salesperson }}</span><span>类型：{{ order.type || '未填写' }}</span></div>
                    <div class="products-cell">
                        <div v-for="product in order.products" :key="product.code" class="product-item">
                            <strong>{{ product.name }} <span>× {{ product.quantity }} {{ product.unit }}</span></strong>
                            <small>{{ product.code }} · {{ product.material || '未维护' }} · {{ product.category || '未分类' }}</small>
                        </div>
                    </div>
                    <div class="date-cell">{{ order.dueDate }}</div>
                    <div><span class="status-pill" :class="statusClass(order.status)">{{ order.status }}</span></div>
                    <div class="production-cell"><strong>{{ order.productionOrders.length }} 张</strong><small>{{ order.productionOrders.length ? order.productionOrders.join('、') : '尚未关联' }}</small></div>
                    <div class="progress-cell">
                        <strong>{{ readyProductCount(order) }} / {{ order.products.length }} 项已备齐</strong>
                        <div class="progress-bar"><span :style="{ width: `${progressPercent(order)}%` }" /></div>
                        <small>{{ progressText(order) }}</small>
                    </div>
                    <div class="action-cell"><button type="button" @click="openDetail(order)">查看<Icon name="lucide:arrow-up-right" /></button></div>
                </div>
            </ErpTableFrame>

            <InventoryPagination
                v-model:page-size="pageSize"
                v-model:jump-page-input="jumpPageInput"
                :total="totalCount"
                :page-size-options="[5, 10, 15]"
                :total-pages="totalPages"
                :current-page="currentPage"
                @page-change="changePage"
                @jump="jumpToPage"
            />
        </section>

        <p v-if="loadError" class="load-error" role="alert">{{ loadError }} <button type="button" @click="loadOrders">重试</button></p>
        <p class="footnote"><Icon name="lucide:info" />成品合格入库计入订单备货；部件入库进入订单物料池。</p>
        <p v-if="createNotice" class="create-notice" role="status">{{ createNotice }}</p>

        <Teleport to="body">
            <div v-if="selectedOrder" class="erp-app dialog-backdrop" @click.self="closeDetail">
                <section class="detail-dialog" role="dialog" aria-modal="true" :aria-label="`订单 ${selectedOrder.id} 生产详情`">
                    <header class="detail-header"><h2>订单生产详情 · {{ selectedOrder.id }}</h2><button type="button" aria-label="关闭详情" :disabled="completionSubmitting" @click="closeDetail"><Icon name="lucide:x" /></button></header>
                    <div class="detail-body">
                        <div class="detail-summary">
                            <div><strong>{{ selectedOrder.id }}</strong><small>销售员：{{ selectedOrder.salesperson }}</small></div>
                            <div><span class="status-pill" :class="statusClass(selectedOrder.status)">{{ selectedOrder.status }}</span><small>交期 {{ selectedOrder.dueDate }}</small></div>
                            <div><strong>{{ selectedOrder.productionOrders.length }} 张生产单</strong><small>按产品明细核算</small></div>
                        </div>

                        <details class="detail-disclosure"><summary>订单要求</summary>
                            <div class="requirement-grid">
                                <div><span>非标要求</span><p>{{ selectedOrder.requirements?.custom || '未填写' }}</p></div>
                                <div><span>安装要求</span><p>{{ selectedOrder.requirements?.installation || '未填写' }}</p></div>
                                <div><span>测试要求</span><p>{{ selectedOrder.requirements?.testing || '未填写' }}</p></div>
                                <div class="requirement-full-width"><span>订单备注</span><p class="order-remark">{{ selectedOrder.orderRemark || '未填写' }}</p></div>
                                <div class="requirement-full-width">
                                    <span>订单图片</span>
                                    <FileUploader v-if="selectedOrder.orderImages?.length" :model-value="selectedOrder.orderImages" readonly />
                                    <p v-else>未上传</p>
                                </div>
                            </div>
                        </details>

                        <nav class="detail-tabs" aria-label="订单生产详情分类">
                            <button v-for="tab in detailTabs" :key="tab.id" type="button" :class="{ active: detailTab === tab.id }" @click="detailTab = tab.id">{{ tab.label }}</button>
                        </nav>

                        <div v-if="detailTab === 'products'" class="detail-table-scroll">
                            <p v-if="selectedOrder.products.some(product => product.legacyReviewRequired) || selectedOrder.components.some(product => product.legacyReviewRequired)" class="page-error">历史生产入库缺少来源关联，相关产品核对完成后才能继续下达。</p>
                            <table class="detail-table product-detail-table">
                                <thead><tr><th>图片</th><th>产品型号 / 编号</th><th>备注</th><th>材质</th><th>分类</th><th>订单数量</th><th>库存锁定</th><th>净生产需求</th><th>有效已下达</th><th>待下达</th><th>生产入库</th><th>已备货</th></tr></thead>
                                <tbody><tr v-for="product in selectedOrder.products" :key="product.code">
                                    <td><div class="product-thumbnail"><img v-if="product.image && !failedProductImages.has(product.image)" :src="product.image" :alt="`${product.name} 产品图片`" loading="lazy" @error="failedProductImages.add(product.image)" /><Icon v-else name="lucide:box" /></div></td>
                                    <td><strong>{{ product.name }}</strong><small>{{ product.code }} · {{ product.unit }}</small></td>
                                    <td class="product-remark">{{ product.remark || '--' }}</td>
                                    <td>{{ product.material || '未维护' }}</td><td>{{ product.category || '未分类' }}</td>
                                    <td>{{ product.quantity }} {{ product.unit }}</td><td>{{ product.locked }}</td>
                                    <td>{{ Math.max(0, product.quantity - product.planningCoverage) }}</td><td>{{ product.released }}</td>
                                    <td>{{ product.remaining }}</td><td>{{ product.received }}</td>
                                    <td>{{ Math.min(product.quantity, product.locked + product.received) }} / {{ product.quantity }}</td>
                                </tr></tbody>
                            </table>
                            <p class="detail-note">已备货 = 本订单锁定的合格成品 + 来源生产单的合格入库数量；各产品逐项核算。</p>
                            <template v-if="!isSalesperson && selectedOrder.warehouseReview">
                                <h3>仓库复核物料汇总</h3>
                                <p class="detail-note">
                                    <span v-if="selectedOrder.warehouseReview.route !== 'purchase'">库存满足需求，已同步生产</span>
                                    <span v-else-if="selectedOrder.warehouseReview.purchaseRequestId || selectedOrder.warehouseReview.purchaseRequestNo">存在缺料，已提交采购申请确认</span>
                                    <span v-else>存在缺料，采购申请由生产经理手动发起</span>
                                    · {{ completionTime(selectedOrder.warehouseReview.reviewedAt) }}
                                </p>
                                <table class="detail-table">
                                    <thead><tr><th>产品 / 物料</th><th>复核实际库存</th><th>订单需求</th><th>可用库存</th><th>本单占用</th><th>缺口</th><th>差异原因</th></tr></thead>
                                    <tbody>
                                        <tr v-for="(line, index) in selectedOrder.warehouseReview.lines" :key="`${line.productId}-${index}`">
                                            <td>{{ line.model }}<small>{{ line.productCode }}</small></td>
                                            <td>{{ line.actualQuantity }} {{ line.unit }}</td><td>{{ line.requiredQuantity }} {{ line.unit }}</td>
                                            <td>{{ line.availableQuantity }}</td><td>{{ line.reservedQuantity }}</td><td>{{ line.shortageQuantity }}</td>
                                            <td>{{ line.differenceReason || '--' }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </template>
                        </div>
                        <div v-else-if="detailTab === 'production'" class="detail-table-scroll">
                            <table class="detail-table related-detail-table"><thead><tr><th>生产单</th><th>产品</th><th>计划数量</th><th>状态</th><th>完工 / 入库</th><th v-if="canOpenProductionOrder || canManageProduction">操作</th></tr></thead><tbody>
                                <tr v-for="item in selectedOrder.productionOrderDetails" :key="item.id"><td><strong>{{ item.documentNo }}</strong></td><td>{{ [...selectedOrder.products, ...selectedOrder.components].find((product) => product.productId === item.productId)?.name || '未维护' }}</td><td>{{ item.planQty }}</td><td>{{ item.status }}</td><td>{{ item.completedQty }} / {{ item.receivedQty }}</td><td v-if="canOpenProductionOrder || canManageProduction"><NuxtLink v-if="canOpenProductionOrder" class="inline-action" :to="{ path: '/configuration/production/production-orders', query: { id: item.id, salesOrderId: selectedOrder.salesOrderId } }">查看</NuxtLink><button v-if="canManageProduction && item.status === '草稿' && !selectedOrder.completion.confirmation" class="inline-action" type="button" :disabled="releasingId === item.id" @click="releaseDraft(item)">确认下达</button></td></tr>
                                <tr v-if="!selectedOrder.productionOrderDetails.length"><td :colspan="canOpenProductionOrder || canManageProduction ? 6 : 5" class="detail-empty">暂无关联生产单</td></tr>
                            </tbody></table>
                        </div>
                        <div v-else class="detail-table-scroll"><ProductionExecutionRecords :sales-order-id="selectedOrder.salesOrderId" :tab="detailTab === 'materials' ? 'materials' : 'completion'" /></div>

                        <details class="detail-disclosure machine-disclosure"><summary>机器号</summary><p>{{ selectedOrder.machineNumbers?.length ? selectedOrder.machineNumbers.join('、') : '暂无机器号' }}</p></details>
                        <div v-if="selectedOrder.completion.confirmation" class="completion-confirmed" role="status">
                            <template v-if="selectedOrder.completion.confirmation.source === 'legacy'">历史放行订单</template>
                            <template v-else>已确认完工：{{ selectedOrder.completion.confirmation.confirmedBy }} · {{ completionTime(selectedOrder.completion.confirmation.confirmedAt) }}</template>
                        </div>
                        <div v-else-if="canManageProduction && selectedOrder.completion.required && selectedOrder.completion.blockingReasons.length" class="completion-blockers">
                            <strong>暂不能确认订单完工</strong>
                            <ul><li v-for="reason in selectedOrder.completion.blockingReasons" :key="reason">{{ reason }}</li></ul>
                        </div>
                        <p v-if="completionError" class="load-error" role="alert">{{ completionError }}</p>
                    </div>
                    <footer class="detail-footer">
                        <button v-if="canManageProduction && selectedOrder.completion.required && !selectedOrder.completion.confirmation" class="complete-order-button" type="button" :disabled="completionSubmitting || loading || !selectedOrder.completion.canComplete" :title="selectedOrder.completion.blockingReasons.join('；')" @click="openCompletion">订单完工</button>
                        <button v-if="canManageProduction && !selectedOrder.completion.confirmation" class="create-production-button" type="button" :disabled="completionSubmitting" @click="openCreate">新建关联生产单</button>
                        <button class="close-detail-button" type="button" :disabled="completionSubmitting" @click="closeDetail">关闭</button>
                    </footer>
                </section>
            </div>
            <ProductionOrderCreateDialog v-if="canManageProduction && showCreate && selectedOrder" :initial-order="selectedOrder" @close="showCreate = false" @created="handleCreated" />
            <div v-if="completionPreview && canManageProduction" class="erp-app dialog-backdrop completion-backdrop" @click.self="closeCompletion">
                <section class="completion-dialog" role="dialog" aria-modal="true" aria-label="确认订单完工">
                    <header><h2>确认订单完工 · {{ completionPreview.id }}</h2><button type="button" aria-label="关闭完工确认" :disabled="completionSubmitting" @click="closeCompletion"><Icon name="lucide:x" /></button></header>
                    <div class="dialog-body">
                        <p>确认后订单进入待出库，以下剩余生产物料将释放为可用库存。</p>
                        <h3>本次释放的生产物料</h3>
                        <div v-if="completionPreview.completion.releaseMaterials.length" class="detail-table-scroll"><table class="detail-table"><thead><tr><th>物料 / 编码</th><th>仓库 / 库位</th><th>释放数量</th></tr></thead><tbody>
                            <tr v-for="line in completionPreview.completion.releaseMaterials" :key="line.reservationId"><td>{{ line.productName }}<small>{{ line.productCode }}</small></td><td>{{ line.warehouseName || '未维护仓库' }} / {{ line.locationName || '未指定库位' }}</td><td>{{ line.quantity }} {{ line.unit }}</td></tr>
                        </tbody></table></div>
                        <p v-else class="detail-note">没有需要释放的剩余生产物料。</p>
                        <h3>继续锁定用于销售出库的成品</h3>
                        <div class="detail-table-scroll"><table class="detail-table"><thead><tr><th>产品 / 编码</th><th>仓库 / 库位</th><th>保留锁定</th></tr></thead><tbody>
                            <tr v-for="line in completionPreview.completion.retainedProducts" :key="line.reservationId"><td>{{ line.productName }}<small>{{ line.productCode }}</small></td><td>{{ line.warehouseName || '未维护仓库' }} / {{ line.locationName || '未指定库位' }}</td><td>{{ line.quantity }} {{ line.unit }}</td></tr>
                        </tbody></table></div>
                        <p class="detail-note">成品预占保留至实际出库。确认后不能继续下达生产、领料或生产入库，本期不支持撤销完工。</p>
                        <p v-if="completionError" class="load-error" role="alert">{{ completionError }}</p>
                    </div>
                    <footer><button class="cancel-completion-button" type="button" :disabled="completionSubmitting" @click="closeCompletion">取消</button><button type="button" :disabled="completionSubmitting" @click="confirmCompletion">{{ completionSubmitting ? '确认中…' : '确认完工' }}</button></footer>
                </section>
            </div>
            <div v-if="showRules" class="erp-app dialog-backdrop" @click.self="showRules = false">
                <section class="rules-dialog" role="dialog" aria-modal="true" aria-label="订单数量口径">
                    <header><h2>订单数量口径</h2><button type="button" aria-label="关闭数量口径" @click="showRules = false"><Icon name="lucide:x" /></button></header>
                    <div class="dialog-body"><p>已备货 = 本订单锁定的现有合格成品 + 来源生产单的合格成品入库数量，不等于已发货数量。</p><p>每条产品分别核对需求和已备货，不同产品或单位的数量不合并抵扣。需要生产的订单全部备齐并结清生产、领退料及采购分配后，还须确认订单完工才能进入待发货；无需生产的订单保持自动流转。</p><p>进度条按已备齐的产品项数计算。质检待验、报废以及仅登记完工但尚未入库的数量不计入备货。</p></div>
                    <footer><button type="button" @click="showRules = false">知道了</button></footer>
                </section>
            </div>
        </Teleport>
    </div>
</template>

<script setup lang="ts">
import type { ProductionOverviewOrder } from "~/types/production";
import { getToken } from "~/utils/auth";
import FileUploader from "~/components/configuration/sales/FileUploader.vue";
import ProductionExecutionRecords from "~/components/production/ProductionExecutionRecords.vue";
import { useProductionRevision } from "~/composables/production/useProductionRevision";
import { ADMIN_ROLE } from "~~/shared/enums";
import { canAccessConfigurationPath, hasFullInventoryAccess } from "~~/shared/utils/adminPermission";

definePageMeta({ layout: "production" });
useHead({ title: "订单总览 - 生产管理" });
const route = useRoute();
const { revision, invalidateProduction } = useProductionRevision();
const adminInfo = useState<{ role?: number }>("admin_info", () => ({}));
const isSalesperson = computed(() => Number(adminInfo.value?.role) === ADMIN_ROLE.SELLER);
const canManageProduction = computed(() => hasFullInventoryAccess(Number(adminInfo.value?.role)));
const canOpenProductionOrder = computed(() => canAccessConfigurationPath(Number(adminInfo.value?.role), "/configuration/production/production-orders"));
const requestedSalesOrderId = ref(String(route.query.salesOrderId || ""));

const orders = reactive<ProductionOverviewOrder[]>([]);
const failedProductImages = reactive(new Set<string>());
const loading = ref(false);
const loadError = ref("");
const totalCount = ref(0);
const statusCounts = reactive<Record<"待采购" | "待生产" | "生产中" | "待发货", number>>({ "待采购": 0, "待生产": 0, "生产中": 0, "待发货": 0 });
const statusOptions = ["全部", "待采购", "待生产", "生产中", "待发货"] as const;
type StatusFilter = typeof statusOptions[number];
const searchText = ref("");
const appliedSearch = ref("");
const statusFilter = ref<StatusFilter>("全部");
const currentPage = ref(1);
const pageSize = ref(10);
const jumpPageInput = ref("");
const selectedOrder = ref<ProductionOverviewOrder | null>(null);
const showCreate = ref(false);
const createNotice = ref("");
const releasingId = ref("");
const releaseRequestKeys = new Map<string, string>();
const completionPreview = ref<ProductionOverviewOrder | null>(null);
const completionSubmitting = ref(false);
const completionError = ref("");
const completionRequestKeys = new Map<string, string>();
const detailTabs = [
    { id: "products", label: "产品与数量" },
    { id: "production", label: "关联生产单" },
    { id: "materials", label: "物料与发料" },
    { id: "quality", label: "完工与入库" },
] as const;
const detailTab = ref<typeof detailTabs[number]["id"]>("products");
const showRules = ref(false);
const tableColumns = "190px minmax(270px, 1.6fr) 110px 110px 145px minmax(205px, 1fr) 72px";

const statusCards = computed(() => [
    { label: "待采购" as const, icon: "lucide:shopping-bag", count: statusCounts["待采购"] },
    { label: "待生产" as const, icon: "lucide:calendar-clock", count: statusCounts["待生产"] },
    { label: "生产中" as const, icon: "lucide:settings-2", count: statusCounts["生产中"] },
    { label: "待发货" as const, icon: "lucide:package-check", count: statusCounts["待发货"] },
]);
const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize.value)));
const pageOrders = computed(() => orders);
let listSequence = 0;

const loadOrders = async () => {
    const sequence = ++listSequence;
    loading.value = true;
    loadError.value = "";
    try {
        const response: any = await $fetch(isSalesperson.value ? "/sales-order/retrieve" : "/production/orders/retrieve", { headers: { Token: getToken() || "" }, query: {
            ...(isSalesperson.value ? { view: "production-overview" } : {}),
            page: currentPage.value, limit: pageSize.value, keyword: appliedSearch.value, status: statusFilter.value, salesOrderId: String(route.query.salesOrderId || ""),
        } });
        if (response?.code !== 200) throw new Error(response?.msg || "加载订单失败");
        if (sequence !== listSequence) return;
        orders.splice(0, orders.length, ...(response.data?.list || []));
        totalCount.value = Number(response.data?.pagination?.total || 0);
        Object.assign(statusCounts, response.data?.counts || {});
        if (selectedOrder.value) selectedOrder.value = orders.find((order) => order.salesOrderId === selectedOrder.value?.salesOrderId) || selectedOrder.value;
        if (requestedSalesOrderId.value) {
            selectedOrder.value = orders.find((order) => order.salesOrderId === requestedSalesOrderId.value) || null;
            requestedSalesOrderId.value = "";
        }
    } catch (error: any) {
        if (sequence !== listSequence) return;
        loadError.value = error?.data?.msg || error?.message || "加载订单失败";
        orders.splice(0, orders.length);
        totalCount.value = 0;
    } finally {
        if (sequence === listSequence) loading.value = false;
    }
};
watch(pageSize, () => { currentPage.value = 1; void loadOrders(); });
onMounted(() => { void loadOrders(); });
watch(revision, () => { void loadOrders(); });
watch(() => route.query.salesOrderId, () => { currentPage.value = 1; selectedOrder.value = null; requestedSalesOrderId.value = String(route.query.salesOrderId || ""); void loadOrders(); });
const applySearch = () => { appliedSearch.value = searchText.value.trim(); currentPage.value = 1; void loadOrders(); };
const chooseStatus = (value: StatusFilter) => { statusFilter.value = value; currentPage.value = 1; void loadOrders(); };
const openDetail = (order: ProductionOverviewOrder) => { detailTab.value = "products"; completionError.value = ""; selectedOrder.value = order; };
const closeDetail = () => {
    if (completionSubmitting.value) return;
    selectedOrder.value = null;
    completionPreview.value = null;
    completionError.value = "";
};
const openCreate = () => { if (canManageProduction.value && selectedOrder.value && !selectedOrder.value.completion.confirmation) showCreate.value = true; };
const completionTime = (value: string | null) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
const openCompletion = () => {
    const order = selectedOrder.value;
    if (!canManageProduction.value || !order?.completion.canComplete || completionSubmitting.value) return;
    completionError.value = "";
    completionPreview.value = JSON.parse(JSON.stringify(order));
};
const closeCompletion = () => { if (!completionSubmitting.value) completionPreview.value = null; };
const refreshSelectedOrder = async (salesOrderId: string) => {
    const response: any = await $fetch(isSalesperson.value ? "/sales-order/retrieve" : "/production/orders/retrieve", {
        headers: { Token: getToken() || "" }, query: { salesOrderId, page: 1, limit: 1, status: "全部", ...(isSalesperson.value ? { view: "production-overview" } : {}) },
    });
    if (response?.code !== 200) throw new Error(response?.msg || "刷新订单失败");
    if (selectedOrder.value?.salesOrderId === salesOrderId) selectedOrder.value = response.data?.list?.[0] || null;
};
const confirmCompletion = async () => {
    const order = completionPreview.value;
    if (!canManageProduction.value || !order?.completion.canComplete || completionSubmitting.value) return;
    const signature = `${order.salesOrderId}:${order.completion.version}`;
    if (!completionRequestKeys.has(signature)) completionRequestKeys.set(signature, crypto.randomUUID());
    completionSubmitting.value = true;
    completionError.value = "";
    try {
        const response: any = await $fetch("/production/orders/add", {
            method: "POST", headers: { Token: getToken() || "", "Idempotency-Key": completionRequestKeys.get(signature)! },
            body: { resource: "execution", action: "confirm-order-completion", salesOrderId: order.salesOrderId, version: order.completion.version },
        });
        if (response?.code !== 200) throw new Error(response?.msg || "确认订单完工失败");
        completionRequestKeys.delete(signature);
        completionPreview.value = null;
        if (selectedOrder.value?.salesOrderId === order.salesOrderId) {
            selectedOrder.value.status = "待发货";
            if (response.data?.completion) selectedOrder.value.completion = response.data.completion;
        }
        createNotice.value = `订单 ${order.id} 已确认完工，进入待出库`;
        invalidateProduction();
        try { await refreshSelectedOrder(order.salesOrderId); }
        catch { completionError.value = "完工确认已成功，订单详情刷新失败，请重新打开详情。"; }
    } catch (error: any) {
        completionError.value = error?.data?.msg || error?.message || "确认订单完工失败";
        if (error?.statusCode === 409 || error?.status === 409) {
            completionPreview.value = null;
            await loadOrders();
            try { await refreshSelectedOrder(order.salesOrderId); } catch { /* 保留原始冲突原因，允许重新加载。 */ }
        }
    } finally { completionSubmitting.value = false; }
};
const handleCreated = async (result: { documentNo: string; intent: "draft" | "release" }) => {
    createNotice.value = `已${result.intent === "draft" ? "保存草稿" : "下达"}生产单 ${result.documentNo}`;
    showCreate.value = false;
    detailTab.value = "production";
    invalidateProduction();
};
const releaseDraft = async (item: ProductionOverviewOrder["productionOrderDetails"][number]) => {
    if (!canManageProduction.value || !selectedOrder.value || selectedOrder.value.completion.confirmation) return;
    releasingId.value = item.id;
    if (!releaseRequestKeys.has(item.id)) releaseRequestKeys.set(item.id, crypto.randomUUID());
    try {
        const response: any = await $fetch("/production/orders/release", {
            method: "POST", headers: { Token: getToken() || "", "Idempotency-Key": releaseRequestKeys.get(item.id)! },
            body: { id: item.id, version: item.version },
        });
        if (response?.code !== 200) throw new Error(response?.msg || "下达生产单失败");
        createNotice.value = `已下达生产单 ${item.documentNo}`;
        releaseRequestKeys.delete(item.id);
        invalidateProduction();
    } catch (error: any) {
        createNotice.value = error?.data?.msg || error?.message || "下达生产单失败";
    } finally { releasingId.value = ""; }
};
const changePage = (page: number) => { currentPage.value = Math.min(totalPages.value, Math.max(1, page)); void loadOrders(); };
const jumpToPage = () => { const page = Number(jumpPageInput.value); if (Number.isInteger(page)) changePage(page); jumpPageInput.value = ""; };
const readyProductCount = (order: ProductionOverviewOrder) => order.products.filter((product) => product.locked + product.received >= product.quantity).length;
const progressPercent = (order: ProductionOverviewOrder) => order.products.length ? Math.round(readyProductCount(order) / order.products.length * 100) : 0;
const progressText = (order: ProductionOverviewOrder) => order.products.length === 1
    ? `${Math.min(order.products[0]!.quantity, order.products[0]!.locked + order.products[0]!.received)} / ${order.products[0]!.quantity} ${order.products[0]!.unit}`
    : "按产品逐项核对，不合并不同产品数量";
const statusClass = (status: ProductionOverviewOrder["status"]) => ({
    "待采购": "status-purchase", "待生产": "status-planned", "生产中": "status-running", "待发货": "status-ready",
}[status]);
</script>

<style scoped>
.overview-page { box-sizing: border-box; height: 100%; min-height: 0; display: flex; flex-direction: column; gap: 20px; padding: 12px; overflow: auto; background: #f5f7fa; color: #202122; font-family: var(--erp-typography-font-family-base); font-size: 14px; line-height: 1.5; }
.topbar, .page-intro, .list-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.topbar { flex: 0 0 auto; min-height: 40px; }
.page-intro { flex: 0 0 auto; margin-top: 2px; }
h1 { display: flex; align-items: center; gap: 12px; margin: 0; font-size: 28px; font-weight: 700; line-height: 1.4; }
.page-intro p { margin: 5px 0 0; color: #909399; font-size: 14px; line-height: 22px; }
.preview-badge { border-radius: 4px; padding: 3px 7px; background: #fff3df; color: #a86611; font-size: 11px; font-weight: 500; }
.help-button { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; border: 1px solid #dcdfe6; border-radius: 8px; padding: 8px 12px; background: #fff; color: #409eff; cursor: pointer; font-size: 13px; }
.help-button svg { width: 15px; height: 15px; }
.summary-grid { flex: 0 0 auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 18px; }
.summary-card { display: flex; flex-direction: column; align-items: flex-start; min-height: 122px; border: 1px solid #e6edf5; border-radius: 8px; padding: 18px 20px; background: #fff; box-shadow: 0 2px 12px rgb(0 0 0 / 3%); text-align: left; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.summary-card:hover, .summary-card.selected { border-color: #409eff; box-shadow: 0 5px 18px rgb(64 158 255 / 10%); }
.summary-label { display: flex; align-items: center; gap: 8px; color: #606266; font-size: 14px; line-height: 20px; }
.summary-label svg { width: 17px; height: 17px; color: #409eff; }
.summary-card strong { margin-top: 9px; color: #409eff; font-size: 30px; line-height: 34px; }
.summary-unit { margin-top: 4px; font-size: 12px; line-height: 18px; color: #a0a4aa; }
.list-panel { display: flex; flex: 1 0 auto; min-height: 300px; flex-direction: column; border: 0; border-radius: 8px; background: #fff; box-shadow: 0 2px 12px rgb(0 0 0 / 3%); overflow: hidden; }
.list-toolbar { flex: 0 0 auto; min-height: 60px; padding: 10px 20px; border-bottom: 1px solid #f0f2f5; }
.status-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.status-filters button { border: 0; border-radius: 6px; padding: 7px 10px; background: transparent; color: #606266; cursor: pointer; font-size: 13px; }
.status-filters button.active { background: #eaf2ff; color: #409eff; font-weight: 600; }
.status-filters span { margin-left: 3px; opacity: .75; }
.list-panel :deep(.erp-table-frame) { flex: 1; min-height: 300px; border-inline: 0; border-radius: 0; box-shadow: none; }
.table-row { display: grid; grid-template-columns: v-bind(tableColumns); align-items: center; min-width: 1080px; box-sizing: border-box; }
.table-row > div { min-width: 0; padding: 12px 14px; box-sizing: border-box; }
.list-panel :deep(.erp-table-frame .table-head) { height: auto; min-height: 52px; background: #f5f7fa; color: #606266; font-size: 13px; font-weight: 600; line-height: 20px; }
.table-head small { display: block; font-weight: 400; color: var(--erp-color-text-placeholder); }
.list-panel :deep(.erp-table-frame .data-row) { height: auto; min-height: 88px; align-items: center; border-top: 0; border-bottom: 1px solid #f0f2f5; font-size: 13px; line-height: 20px; }
.list-panel :deep(.erp-table-frame .data-row > div) { align-self: center; }
.data-row:hover { background: #f9fbff; }
.order-cell, .production-cell, .progress-cell, .product-item { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.order-cell strong, .production-cell strong, .progress-cell strong, .product-item strong { font-size: 13px; line-height: 20px; }
.order-cell strong { color: var(--erp-color-action-primary); }
.order-cell span, .production-cell small, .product-item small, .progress-cell small { color: #909399; font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.products-cell { display: flex; flex-direction: column; gap: 12px; }
.product-item + .product-item { border-top: 1px dashed var(--erp-color-border-default); padding-top: 10px; }
.product-item strong { font-weight: 600; }
.product-item strong span { font-weight: 500; }
.date-cell { font-variant-numeric: tabular-nums; }
.status-pill { display: inline-block; border-radius: 4px; padding: 5px 8px; white-space: nowrap; font-size: 12px; }
.status-purchase { background: #fff2e8; color: #ad5d15; }.status-planned { background: #eef3ff; color: #496ba4; }.status-running { background: #e9f4ff; color: #1875bd; }.status-ready { background: #e8f7ed; color: #238252; }
.production-cell small { overflow: hidden; text-overflow: ellipsis; }
.progress-bar { width: 100%; height: 6px; border-radius: 9px; background: #e7edf5; overflow: hidden; }.progress-bar span { display: block; height: 100%; border-radius: inherit; background: #409eff; }
.action-cell button { display: inline-flex; align-items: center; gap: 2px; padding: 4px 0; border: 0; background: none; color: var(--erp-color-action-primary); cursor: pointer; white-space: nowrap; }.action-cell svg { width: 14px; height: 14px; }
.list-panel :deep(.inventory-pagination) { flex: 0 0 auto; }
.footnote { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; margin: 0 0 3px; color: #909399; font-size: 12px; line-height: 18px; }.footnote svg { width: 14px; height: 14px; }
.create-notice { position: fixed; z-index: 2200; left: 20px; bottom: 18px; max-width: min(460px, calc(100vw - 40px)); margin: 0; padding: 10px 14px; border-radius: 6px; background: #e9f7ed; color: #238252; box-shadow: 0 6px 20px #0002; font-size: 13px; }
.dialog-backdrop { position: fixed; z-index: 2000; inset: 0; box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 16px; background: #18243a88; }
.detail-dialog, .rules-dialog { box-sizing: border-box; width: min(1160px, 100%); min-width: 0; max-height: min(780px, 94vh); display: flex; flex-direction: column; border-radius: 8px; background: white; color: #202122; font-family: var(--erp-typography-font-family-base); font-size: 14px; line-height: 1.5; box-shadow: 0 24px 60px #0003; overflow: hidden; }
.rules-dialog { width: min(570px, 100%); }
.detail-dialog header, .rules-dialog header, .detail-dialog footer, .rules-dialog footer { display: flex; align-items: center; justify-content: space-between; flex: 0 0 auto; padding: 14px 22px; border-bottom: 1px solid #e7ebf0; }
.detail-dialog footer, .rules-dialog footer { justify-content: flex-end; gap: 10px; border-top: 1px solid #e7ebf0; border-bottom: 0; }
.detail-dialog .detail-footer { box-sizing: border-box; width: 100%; min-width: 0; flex-wrap: wrap; }
.detail-dialog h2, .rules-dialog h2 { margin: 0; font-size: 17px; line-height: 26px; font-weight: 600; }
.detail-dialog .detail-header { background: #f5f7fa; }
.detail-dialog header button, .rules-dialog header button { border: 0; background: transparent; cursor: pointer; }.detail-dialog header svg, .rules-dialog header svg { width: 20px; height: 20px; }
.dialog-body { padding: 20px 22px; overflow-y: auto; }.dialog-body h3 { margin: 22px 0 12px; font-size: 14px; }.dialog-body p { line-height: 1.8; }
.detail-body { flex: 1 1 auto; min-height: 0; padding: 16px 20px 22px; overflow-y: auto; }
.detail-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: center; gap: 16px; padding: 14px 16px; border-radius: 5px; background: #f5f7fa; }
.detail-summary > div { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; min-width: 0; }.detail-summary strong { font-size: 14px; font-weight: 500; }.detail-summary small { color: #909399; font-size: 12px; line-height: 18px; }
.detail-disclosure { padding: 0 0 12px; border-bottom: 1px solid #e5e9ef; color: #606266; }.detail-disclosure summary { padding: 16px 0 6px; cursor: pointer; font-size: 13px; }.detail-disclosure p { margin: 0; font-size: 13px; line-height: 20px; }
.requirement-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; padding: 10px 12px; border-radius: 5px; background: #f8fafc; }.requirement-grid span { color: #909399; font-size: 12px; }.requirement-grid p { margin-top: 4px; color: #303133; }
.requirement-grid > div { min-width: 0; }.requirement-full-width { grid-column: 1 / -1; }.requirement-grid .order-remark { white-space: pre-wrap; overflow-wrap: anywhere; }
.detail-tabs { display: flex; gap: 24px; margin-top: 14px; border-bottom: 1px solid #e5e9ef; }.detail-tabs button { margin-bottom: -1px; padding: 12px 4px; border: 0; border-bottom: 2px solid transparent; background: none; color: #606266; cursor: pointer; font-size: 13px; white-space: nowrap; }.detail-tabs button.active { border-bottom-color: #409eff; color: #409eff; font-weight: 600; }
.detail-table-scroll { max-width: 100%; overflow-x: auto; }.detail-table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }.detail-table th { padding: 13px 10px; background: #f5f7fa; color: #606266; font-size: 12px; font-weight: 500; white-space: nowrap; }.detail-table td { padding: 14px 10px; border-bottom: 1px solid #edf0f4; color: #303133; white-space: nowrap; }.detail-table td strong { display: block; font-weight: 500; }.detail-table td small { display: block; color: #909399; font-size: 12px; }.product-detail-table { min-width: 1170px; }.product-detail-table td { height: 72px; }.product-detail-table th:nth-child(2), .product-detail-table td:nth-child(2) { min-width: 140px; }.related-detail-table { min-width: 570px; }
.product-detail-table .product-remark { min-width: 160px; max-width: 240px; white-space: pre-wrap; overflow-wrap: anywhere; }
.product-thumbnail { width: 52px; height: 48px; display: grid; place-items: center; overflow: hidden; border: 1px solid #f5d7e6; border-radius: 4px; background: #faedf3; color: #cc4f84; }.product-thumbnail img { width: 100%; height: 100%; object-fit: contain; background: #fff; }.product-thumbnail svg { width: 23px; height: 23px; }
.detail-note { margin: 12px 2px; color: #909399; font-size: 12px; line-height: 19px; }.detail-empty, .detail-empty-panel { color: #909399; text-align: center; }.detail-empty-panel { min-height: 210px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; }.detail-empty-panel svg { width: 28px; height: 28px; color: #a9bfd8; }.detail-empty-panel strong { color: #606266; font-weight: 500; }.detail-empty-panel span { font-size: 12px; }
.inline-action { padding: 0; border: 0; background: transparent; color: #409eff; cursor: pointer; }.inline-action:disabled { opacity: .5; cursor: wait; }
.machine-disclosure { margin-top: 2px; }
.detail-dialog footer button, .rules-dialog footer button { border: 0; border-radius: 5px; padding: 8px 20px; background: var(--erp-color-action-primary); color: white; cursor: pointer; }
.detail-dialog footer .create-production-button { border: 1px solid #dcdfe6; background: #fff; color: #303133; cursor: pointer; }
.detail-dialog footer .create-production-button:hover { border-color: #409eff; color: #409eff; }
.detail-dialog footer .close-detail-button { flex: 0 0 auto; min-width: 64px; background: #409eff; color: #fff; }
.detail-dialog footer button:disabled { opacity: .55; cursor: not-allowed; }
.detail-dialog footer .complete-order-button { background: var(--erp-color-action-primary, #409eff); color: #fff; }
.detail-dialog footer .complete-order-button:not(:disabled):hover { background: var(--erp-color-action-primary-pressed, #337ecc); }
.detail-dialog footer .complete-order-button:disabled { background: #d9ecff; color: #606266; opacity: 1; cursor: not-allowed; }
.completion-confirmed { margin-top: 14px; padding: 10px 12px; border-radius: 5px; background: #edf8f0; color: #238252; font-size: 13px; }
.completion-blockers { margin-top: 14px; padding: 12px; border-radius: 5px; background: #fff7e8; color: #995c12; font-size: 13px; }
.completion-blockers ul { margin: 6px 0 0; padding-left: 20px; }
.completion-blockers li + li { margin-top: 4px; }
.completion-backdrop { z-index: 2100; }
.completion-dialog { display: flex; flex-direction: column; width: min(760px, 100%); max-height: 90vh; border-radius: 8px; overflow: hidden; background: #fff; box-shadow: 0 24px 60px #0003; }
.completion-dialog header, .completion-dialog footer { display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 22px; }
.completion-dialog header { border-bottom: 1px solid #e7ebf0; }
.completion-dialog h2 { margin: 0; font-size: 17px; font-weight: 600; }
.completion-dialog header button { padding: 0; border: 0; background: transparent; cursor: pointer; }
.completion-dialog footer { justify-content: flex-end; border-top: 1px solid #e7ebf0; }
.completion-dialog footer button { border: 0; border-radius: 5px; padding: 8px 20px; background: #409eff; color: #fff; cursor: pointer; }
.completion-dialog footer .cancel-completion-button { border: 1px solid #dcdfe6; background: #fff; color: #303133; }
.completion-dialog button:disabled { opacity: .55; cursor: not-allowed; }
.completion-dialog .dialog-body { min-height: 0; }
.completion-dialog .detail-table { min-width: 520px; }
@media (max-width: 1000px) { .topbar { align-items: flex-start; flex-direction: column; }.summary-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .summary-grid { gap: 8px; }.summary-card { min-height: 95px; padding: 12px; }.list-toolbar { align-items: flex-start; flex-direction: column; }.help-button { align-self: flex-end; }.detail-summary { grid-template-columns: 1fr; gap: 9px; }.requirement-grid { grid-template-columns: 1fr; }.detail-tabs { gap: 12px; overflow-x: auto; } }
</style>
