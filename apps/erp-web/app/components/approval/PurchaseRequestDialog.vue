<template>
    <Teleport to="body">
        <div class="erp-dialog-mask purchase-request-mask erp-app" @click.self="closeDialog">
            <ErpDialogFrame
                class="purchase-request-dialog"
                :title="dialogTitle"
                width="min(1160px, calc(100vw - 48px))"
                height="min(860px, calc(100vh - 48px))"
                :form="false"
                :close-disabled="working"
                role="dialog"
                aria-modal="true"
                :aria-label="dialogTitle"
                @close="closeDialog"
            >
                <div class="purchase-form">
                    <section class="purchase-basic-card">
                        <h3>基本信息</h3>
                        <div class="basic-info-grid">
                            <label class="form-field application-number-field">
                                <span>申请编号</span>
                                <input :value="initialDraft?.requestNo || '保存后自动生成'" disabled>
                            </label>

                            <label class="form-field category-field">
                                <span><i>*</i>采购类别</span>
                                <select v-model="category" :disabled="isProductionPurchase || isSubmittedOrderPurchase">
                                    <option v-if="!isProductionPurchase" value="" disabled>请选择</option>
                                    <option v-for="item in availableCategories" :key="item" :value="item">
                                        {{ item }}
                                    </option>
                                </select>
                            </label>

                            <label class="form-field department-field">
                                <span><i v-if="!canConfirmBomCovered">*</i>部门</span>
                                <select v-model="department" :disabled="working">
                                    <option value="">请选择</option>
                                    <option v-for="item in PURCHASE_REQUEST_DEPARTMENTS" :key="item" :value="item">
                                        {{ item }}
                                    </option>
                                </select>
                            </label>

                            <label v-if="isProductionPurchase" class="form-field sales-order-field">
                                <span><i>*</i>关联生产单号</span>
                                <input :value="productionOrderNo" readonly>
                            </label>

                            <label v-else-if="isOrderPurchase" class="form-field sales-order-field">
                                <span><i>*</i>关联订单号</span>
                                <div class="sales-order-picker" :class="{ open: salesOrderPickerOpen }">
                                    <input
                                        :value="selectedSalesOrderLabel || '请选择'"
                                        readonly
                                        :disabled="loadingOrders || Boolean(initialDraft)"
                                        @click="toggleSalesOrderPicker"
                                    >
                                    <button
                                        type="button"
                                        :disabled="loadingOrders || Boolean(initialDraft)"
                                        @click="toggleSalesOrderPicker"
                                    >
                                        选择
                                    </button>
                                </div>
                                <small v-if="loadingRequirements">正在读取订单缺口物料...</small>
                            </label>

                            <div class="upload-field image-upload-field">
                                <span>图片<i v-if="isOrderPurchase && !canConfirmBomCovered">*</i></span>
                                <FileUploader
                                    v-model="images"
                                    accept="image/*"
                                    :max-size="10"
                                    :max-files="9"
                                    variant="dropzone"
                                    button-text="添加图片"
                                />
                                <small>最多选择9张</small>
                            </div>

                            <label class="form-field attachment-text-field">
                                <span>附件</span>
                                <textarea v-model="attachmentText" maxlength="500" placeholder="请输入" :disabled="working"></textarea>
                                <small>{{ attachmentText.length }}/500</small>
                            </label>

                            <label class="form-field remark-field">
                                <span>备注</span>
                                <textarea v-model="remark" maxlength="500" placeholder="请输入"></textarea>
                                <small>{{ remark.length }}/500</small>
                            </label>

                            <div v-if="attachments.length" class="upload-field legacy-attachment-field">
                                <span>历史附件</span>
                                <FileUploader :model-value="attachments" readonly />
                            </div>
                        </div>
                    </section>

                    <section class="purchase-detail-card">
                        <header class="detail-card-heading">
                            <h3>产品明细</h3>
                        </header>

                        <p v-if="productionContextError" class="production-context-error" role="status">
                            {{ productionContextError }}
                            <button v-if="!loadingProduction" type="button" @click="loadProductionOrder">重试</button>
                        </p>
                        <p v-if="isOrderPurchase && orderContextError && !loadingRequirements" class="production-context-error" role="alert">
                            {{ orderContextError }}
                            <button v-if="requirementsLoadError" type="button" :disabled="working || loadingRequirements" @click="loadOrderRequirements(salesOrderId)">重试</button>
                        </p>
                        <p v-if="isOrderPurchase && bomGroups.length" class="bom-stock-hint">
                            成品按 BOM 逐层拆分并扣除可用库存，仅末级缺口物料参与采购；同组相同物料汇总采购。
                            <button type="button" :disabled="working || loadingRequirements" @click="loadOrderRequirements(salesOrderId)">重新读取</button>
                        </p>
                        <p v-if="canConfirmBomCovered" class="bom-covered-tip" role="status">
                            BOM 物料库存已满足，本次无需采购。确认后将更新订单缺口，不生成采购申请。
                        </p>

                        <div class="product-toolbar">
                            <button
                                class="select-product-button"
                                type="button"
                                :disabled="working || Boolean(productionContextError) || (isOrderPurchase && (!salesOrderId || loadingRequirements || Boolean(requirementsLoadError)))"
                                :title="isOrderPurchase && !salesOrderId ? '请先选择关联订单' : '选择产品'"
                                @click="openProductPicker"
                            >
                                <Icon name="lucide:plus" />
                                <span>选择产品</span>
                            </button>
                            <div v-if="isOrderPurchase" class="product-source-legend">
                                <span class="order-shortage-legend">订单缺口</span>
                                <span class="manual-added-legend">手工新增</span>
                            </div>
                            <button
                                v-if="hasClearableProducts"
                                class="clear-product-button"
                                type="button"
                                @click="clearProducts"
                            >
                                <Icon name="lucide:trash-2" />
                                <span>{{ isOrderPurchase ? "清空新增" : "清空" }}</span>
                            </button>
                        </div>

                        <details v-for="group in displayedBomGroups" :key="group.sourceRequirementId" class="purchase-bom-group" open>
                            <summary>
                                <strong>{{ group.root.productCode }} · {{ group.root.model }}</strong>
                                <span>来源成品缺口 {{ formatQuantity(group.root.requiredQuantity) }} {{ group.root.unit }}</span>
                                <span v-if="group.root.bomCode || group.root.bomVersion">BOM {{ group.root.bomCode }} {{ group.root.bomVersion }}</span>
                            </summary>
                            <div class="purchase-bom-table-scroll">
                                <table class="purchase-bom-table">
                                    <thead><tr><th>产品编号 / 层级</th><th>型号</th><th>单位用量</th><th>需求数量</th><th>可用库存</th><th>缺口数量</th><th>采购数量</th><th>单位</th></tr></thead>
                                    <tbody>
                                        <tr v-for="row in getBomRows(group)" :key="row.node.key">
                                            <td>
                                                <div class="bom-node-label" :style="{ paddingLeft: `${row.level * 18}px` }">
                                                    <button v-if="row.node.children.length" type="button" :aria-label="`${collapsedBomNodeKeys.has(row.node.key) ? '展开' : '收起'}${row.node.model}`" @click="toggleBomNode(row.node.key)">
                                                        <Icon :name="collapsedBomNodeKeys.has(row.node.key) ? 'lucide:plus' : 'lucide:minus'" />
                                                    </button>
                                                    <span v-else class="bom-node-spacer"></span>
                                                    {{ row.node.productCode || "--" }}
                                                </div>
                                            </td>
                                            <td><span>{{ row.node.model || "--" }}</span><small v-if="row.node.bomCode">BOM {{ row.node.bomCode }} {{ row.node.bomVersion }}</small></td>
                                            <td>{{ formatQuantity(row.node.quantity) }}</td>
                                            <td>{{ formatQuantity(row.node.requiredQuantity) }}</td>
                                            <td>{{ formatQuantity(row.node.availableQuantity) }}</td>
                                            <td>{{ formatQuantity(row.node.shortageQuantity) }}</td>
                                            <td><div class="quantity-cell">
                                                <template v-if="row.item">
                                                    <input v-model="row.item.quantity" type="number" :min="row.item.minQuantity ?? 0.001" step="0.001" :aria-label="`${row.node.productCode}采购数量`" :disabled="working || loadingRequirements" @input="normalizeQuantity(row.item)">
                                                    <small>最低 {{ formatQuantity(row.item.minQuantity) }}</small>
                                                </template>
                                                <span v-else>{{ row.node.children.length ? "不采购" : row.isRepeated ? "同组汇总" : "0（库存满足）" }}</span>
                                            </div></td>
                                            <td>{{ row.node.unit || "--" }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </details>

                        <div v-if="ungroupedItems.length || !displayedBomGroups.length" class="purchase-product-table">
                            <div class="purchase-product-table-inner">
                                <div class="purchase-product-row purchase-product-head">
                                    <div>产品编号</div>
                                    <div>型号</div>
                                    <div>分类</div>
                                    <div>产品图片</div>
                                    <div>数量</div>
                                    <div>单位</div>
                                    <div>来源</div>
                                    <div>操作</div>
                                </div>
                                <div v-if="ungroupedItems.length === 0" class="empty-products">{{ loadingRequirements ? "正在读取 BOM 采购明细..." : "暂未选择产品" }}</div>
                                <div
                                    v-for="item in ungroupedItems"
                                    :key="item.id"
                                    class="purchase-product-row purchase-product-data"
                                    :class="{
                                        'order-shortage-row': Boolean(item.requirementId || item.bomLineKey),
                                        'manual-added-row': isOrderPurchase && !item.requirementId && !item.bomLineKey,
                                    }"
                                >
                                    <div class="readonly-cell" :title="item.productCode || item.name">
                                        {{ item.productCode || item.name || "--" }}
                                    </div>
                                    <div class="readonly-cell" :title="item.model">{{ item.model || "--" }}</div>
                                    <div class="readonly-cell" :title="item.category">{{ item.category || "--" }}</div>
                                    <div class="product-image-cell">
                                        <img v-if="item.image" :src="resolveErpImageUrl(item.image)" :alt="item.model || item.name">
                                        <Icon v-else name="lucide:image" />
                                    </div>
                                    <div class="quantity-cell">
                                        <input
                                            v-model="item.quantity"
                                            type="number"
                                            :min="item.minQuantity ?? (isOrderPurchase ? 0.001 : 0.1)"
                                            :step="isOrderPurchase ? 0.001 : 0.1"
                                            :disabled="working || (isOrderPurchase && loadingRequirements)"
                                            aria-label="采购数量"
                                            @input="normalizeQuantity(item)"
                                        >
                                        <small v-if="isOrderPurchase && (item.requirementId || item.bomLineKey) && item.minQuantity != null">
                                            最低 {{ formatQuantity(item.minQuantity) }}
                                        </small>
                                    </div>
                                    <div class="readonly-cell">{{ item.unit || "--" }}</div>
                                    <div class="product-source-cell">
                                        <span :class="isProductionPurchase ? 'production-material-tag' : (item.requirementId || item.bomLineKey) ? 'order-shortage-tag' : 'manual-added-tag'">
                                            {{ isProductionPurchase ? "生产用料" : (item.requirementId || item.bomLineKey) ? "订单缺口" : "手工新增" }}
                                        </span>
                                    </div>
                                    <div class="product-operation-cell">
                                        <button
                                            v-if="!item.requirementId && !item.bomLineKey"
                                            type="button"
                                            title="删除产品"
                                            aria-label="删除产品"
                                            @click="removeItem(item.id)"
                                        >
                                            <Icon name="lucide:trash-2" />
                                        </button>
                                        <span v-else>--</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <template #footer>
                    <button class="dialog-button cancel" type="button" :disabled="working" @click="closeDialog">
                        取消
                    </button>
                    <button v-if="!canConfirmBomCovered" class="dialog-button draft" type="button" :disabled="working || Boolean(productionContextError) || Boolean(orderContextError)" @click="save('save-draft')">
                        保存草稿
                    </button>
                    <button class="dialog-button confirm" type="button" :disabled="working || Boolean(productionContextError) || Boolean(orderContextError)" @click="save(canConfirmBomCovered ? 'confirm-bom-covered' : 'submit')">
                        {{ working ? "处理中" : canConfirmBomCovered ? "确认无需采购" : "确认提交" }}
                    </button>
                </template>
            </ErpDialogFrame>

            <ProductPickerDialog
                v-if="showProductPicker"
                :columns="purchaseProductPickerColumns"
                :selected-product-ids="selectedProductPickerIds"
                :product-loader="isProductionPurchase ? loadProductionProducts : undefined"
                :show-category-filter="!isProductionPurchase"
                :image-preview-z-index="isProductionPurchase ? 2500 : undefined"
                @close="closeProductPicker"
                @confirm="confirmProductSelection"
            />

            <div
                v-if="salesOrderPickerOpen"
                class="erp-dialog-mask sales-order-dialog-mask"
                @click.self="closeSalesOrderPicker"
            >
                <ErpDialogFrame
                    class="sales-order-dialog"
                    title="选择订单号"
                    width="min(1120px, calc(100vw - 48px))"
                    height="min(620px, calc(100vh - 48px))"
                    :form="false"
                    @close="closeSalesOrderPicker"
                >
                    <div class="sales-order-filter-row">
                        <label class="sales-order-filter-field">
                            <form class="sales-order-search-box" @submit.prevent="applySalesOrderSearch">
                                <el-input
                                    v-model="salesOrderPickerKeyword"
                                    type="search"
                                    placeholder="输入想要寻找的订单编号"
                                    aria-label="搜索订单"
                                ></el-input>
                            </form>
                        </label>
                        <button class="sales-order-filter-button" type="button" @click="applySalesOrderSearch">
                            <Icon name="lucide:filter" />
                            <span>筛选</span>
                        </button>
                        <button class="sales-order-reset-button" type="button" title="重置" @click="resetSalesOrderSearch">
                            <Icon name="lucide:refresh-cw" />
                        </button>

                    </div>

                    <div class="sales-order-table" role="table" aria-label="订单列表">
                        <div class="sales-order-table-head" role="row">
                            <span>订单编号</span>
                            <span>销售员</span>
                            <span>订单状态</span>
                            <span>订单类型</span>
                            <span>下单日期</span>
                            <span>工期</span>
                        </div>
                        <button
                            v-for="order in filteredSalesOrders"
                            :key="order.id"
                            class="sales-order-table-row"
                            :class="{ selected: order.id === salesOrderPickerDraftId }"
                            type="button"
                            role="row"
                            @click="salesOrderPickerDraftId = order.id"
                        >
                            <span>{{ order.orderNo }}</span>
                            <span>{{ order.salesperson || order.customerName || "--" }}</span>
                            <span class="sales-order-status">{{ order.status || "待采购" }}</span>
                            <span>{{ order.orderType || "销售订单" }}</span>
                            <span>{{ order.orderDate || "--" }}</span>
                            <span>{{ order.duration || "--" }}</span>
                        </button>
                        <div v-if="loadingOrders" class="sales-order-table-empty">正在加载订单...</div>
                        <div v-else-if="!filteredSalesOrders.length" class="sales-order-table-empty">暂无匹配订单</div>
                    </div>

                    <div class="sales-order-result-count">共{{ filteredSalesOrders.length }}条</div>

                    <template #footer>
                        <button class="dialog-button cancel" type="button" @click="closeSalesOrderPicker">
                            取消
                        </button>
                        <button class="dialog-button confirm" type="button" @click="confirmSalesOrderPicker">
                            确认
                        </button>
                    </template>
                </ErpDialogFrame>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ProductPickerDialog from "~/components/configuration/inventory/ProductPickerDialog.vue";
import type { ProductPickerColumn, ProductPickerLoadParams } from "~/components/configuration/inventory/ProductPickerDialog.vue";
import FileUploader from "~/components/configuration/sales/FileUploader.vue";
import { retrievePurchaseRequestBomPreview, submitPurchaseRequest } from "~/composables/api/useApprovalApi";
import { retrieveSalesOrderList } from "~/composables/api/useCustomerApi";
import { normalizeProductPickerItem, type ProductPickerItem } from "~/composables/inventory/useInventoryProductPickerData";
import { getToken } from "~/utils/auth";
import type { PurchaseRequestListItem } from "~/types/approval";
import {
    PURCHASE_REQUEST_CATEGORIES,
    PURCHASE_REQUEST_DEPARTMENTS,
    type AttachmentRef,
    type PurchaseRequestDepartment,
} from "~~/shared/types/approval";
import { isApprovalApplicantRole } from "~~/shared/enums";
import {
    canSelectSalesOrderForPurchaseRequest,
    canSubmitPurchaseRequest,
    hasFullInventoryAccess,
} from "~~/shared/utils/adminPermission";
import type { ExecutionOrder, ExecutionSnapshot } from "~~/shared/types/production-execution";
import type { PurchaseBomExpansion, PurchaseBomGroup, PurchaseBomNode, PurchaseBomPreviewLine } from "~~/shared/types/purchaseBom";

type FormItem = {
    id: number;
    name: string;
    model: string;
    quantity: string;
    unit: string;
    productId?: string;
    requirementId?: string;
    bomLineKey?: string;
    shortageQuantity?: number;
    minQuantity?: number;
    productCode?: string;
    category?: string;
    image?: string;
};

type SalesOrderOption = {
    id: string;
    orderNo: string;
    customerName?: string;
    salesperson?: string;
    status?: string;
    orderType?: string;
    orderDate?: string;
    duration?: string;
};

const emit = defineEmits<{
    close: [];
    submitted: [];
    saved: [];
}>();

const props = defineProps<{
    initialDraft?: PurchaseRequestListItem | null;
    productionOrderId?: string;
    productionOrderNo?: string;
}>();
const dialogTitle = computed(() => props.initialDraft?.status === "rejected"
    ? "修改采购申请并重新提交"
    : props.initialDraft ? "编辑采购申请草稿" : "采购申请");
const adminInfo = useState<any>("admin_info", () => ({}));

let nextItemId = 1;

const productionOrderId = ref(props.initialDraft?.productionOrderId || props.productionOrderId || "");
const productionOrderNo = ref(props.initialDraft?.productionOrderNo || props.productionOrderNo || "");
const isProductionPurchase = computed(() => Boolean(productionOrderId.value));
const productionOrder = ref<ExecutionOrder | null>(null);
const loadingProduction = ref(false);
const productionLoadError = ref("");
let productionLoadSequence = 0;
const category = ref(isProductionPurchase.value ? "生产用料采购" : props.initialDraft?.category || "");
const department = ref<PurchaseRequestDepartment | "">(props.initialDraft?.department || "");
const availableCategories = computed(() => isProductionPurchase.value ? ["生产用料采购"] : PURCHASE_REQUEST_CATEGORIES);
const productionContextError = computed(() => {
    if (!isProductionPurchase.value) return "";
    const role = Number(adminInfo.value?.role);
    if (!hasFullInventoryAccess(role) || !isApprovalApplicantRole(role)) return "没有生产单采购申请权限";
    if (loadingProduction.value) return "正在读取生产单物料…";
    if (productionLoadError.value) return productionLoadError.value;
    if (!productionOrder.value) return "生产单详情尚未加载";
    if (!productionOrder.value.executable) return productionOrder.value.blockReason || "当前生产单不能申请采购";
    if (!productionOrder.value.hasMaterialLoss) return "请先登记损耗";
    return "";
});
const salesOrderId = ref(props.initialDraft?.salesOrderId || "");
const salesOrderNo = ref(props.initialDraft?.salesOrderNo || "");
const isSubmittedOrderPurchase = computed(() => Boolean(props.initialDraft?.approvalId && props.initialDraft.salesOrderId));
const salesOrders = ref<SalesOrderOption[]>([]);
const loadingOrders = ref(false);
const loadingRequirements = ref(false);
const requirementsLoadError = ref("");
const bomGroups = ref<PurchaseBomGroup[]>(props.initialDraft?.bomGroups || []);
const bomExpansion = ref<PurchaseBomExpansion | null>(null);
const collapsedBomNodeKeys = ref(new Set<string>());
let requirementLoadSequence = 0;
const salesOrderPickerOpen = ref(false);
const salesOrderPickerDraftId = ref("");
const salesOrderPickerKeyword = ref("");
const salesOrderPickerAppliedKeyword = ref("");
const showProductPicker = ref(false);
const selectedProductPickerIds = ref<string[]>([]);
const purchaseProductPickerColumns: ProductPickerColumn[] = [
    { key: "id", label: "产品编号", width: 150 },
    { key: "model", label: "型号", width: 190 },
    { key: "category", label: "分类", width: 160 },
    { key: "image", label: "产品图片", width: 130 },
    { key: "availableQuantity", label: "可用数量", width: 120 },
    { key: "unit", label: "单位", width: 90 },
];
const items = ref<FormItem[]>(props.initialDraft?.items?.length
    ? props.initialDraft.items.map((item) => ({
        id: nextItemId++,
        name: item.name || "",
        model: item.model || "",
        quantity: item.quantity > 0 ? String(item.quantity) : "",
        unit: item.unit || "",
        productId: item.productId,
        requirementId: item.requirementId,
        bomLineKey: item.bomLineKey,
        shortageQuantity: item.shortageQuantity,
        minQuantity: item.minQuantity ?? item.shortageQuantity,
        productCode: item.name || "",
        category: "",
        image: "",
    }))
    : []);
const images = ref<Array<File | AttachmentRef>>([...(props.initialDraft?.images || [])]);
const attachments = ref<AttachmentRef[]>([...(props.initialDraft?.attachments || [])]);
const attachmentText = ref(props.initialDraft?.attachmentText ?? "");
const remark = ref(props.initialDraft?.remark || "");
const working = ref(false);
const isOrderPurchase = computed(() => category.value === "销售订单采购");
const hasClearableProducts = computed(() => isOrderPurchase.value
    ? items.value.some((item) => !item.requirementId && !item.bomLineKey)
    : items.value.length > 0);
const orderContextError = computed(() => {
    if (!isOrderPurchase.value || !salesOrderId.value) return "";
    if (loadingRequirements.value) return "正在读取 BOM 采购明细";
    if (requirementsLoadError.value) return requirementsLoadError.value;
    if (props.initialDraft?.approvalId && bomExpansion.value?.sourceRequirementIds.length && !items.value.length) {
        return "该申请已有审批历史，请新建申请确认 BOM 库存";
    }
    return "";
});
const canConfirmBomCovered = computed(() => isOrderPurchase.value
    && !orderContextError.value && Boolean(bomExpansion.value?.sourceRequirementIds.length)
    && items.value.length === 0);
const displayedBomGroups = computed(() => isOrderPurchase.value ? bomGroups.value : []);
const groupedBomLineKeys = computed(() => {
    const keys = new Set<string>();
    const collect = (group: PurchaseBomGroup, node: PurchaseBomNode) => {
        if (!node.children.length) keys.add(`${group.sourceRequirementId}:${node.productId}`);
        for (const child of node.children) collect(group, child);
    };
    for (const group of displayedBomGroups.value) collect(group, group.root);
    return keys;
});
const ungroupedItems = computed(() => items.value.filter((item) => !item.bomLineKey || !groupedBomLineKeys.value.has(item.bomLineKey)));
const getBomRows = (group: PurchaseBomGroup) => {
    const rows: Array<{ node: PurchaseBomNode; level: number; item?: FormItem; isRepeated: boolean }> = [];
    const usedLineKeys = new Set<string>();
    const visit = (node: PurchaseBomNode, level: number) => {
        const lineKey = `${group.sourceRequirementId}:${node.productId}`;
        const isRepeated = !node.children.length && usedLineKeys.has(lineKey);
        const item = node.children.length || isRepeated ? undefined : items.value.find((line) => line.bomLineKey === lineKey);
        if (!node.children.length) usedLineKeys.add(lineKey);
        rows.push({ node, level, item, isRepeated });
        if (!collapsedBomNodeKeys.value.has(node.key)) {
            for (const child of node.children) visit(child, level + 1);
        }
    };
    for (const child of group.root.children) visit(child, 0);
    return rows;
};
const toggleBomNode = (key: string) => {
    const next = new Set(collapsedBomNodeKeys.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    collapsedBomNodeKeys.value = next;
};
const selectedSalesOrderLabel = computed(() => {
    const selected = salesOrders.value.find((order) => order.id === salesOrderId.value);
    if (selected) return selected.customerName ? `${selected.orderNo} | ${selected.customerName}` : selected.orderNo;
    return salesOrderNo.value;
});
const filteredSalesOrders = computed(() => {
    const keyword = salesOrderPickerAppliedKeyword.value.trim().toLowerCase();
    if (!keyword) return salesOrders.value;
    return salesOrders.value.filter((order) => (
        order.orderNo.toLowerCase().includes(keyword)
        || String(order.customerName || "").toLowerCase().includes(keyword)
    ));
});

const loadProductionOrder = async () => {
    if (!isProductionPurchase.value) return;
    const sequence = ++productionLoadSequence;
    productionOrder.value = null;
    productionLoadError.value = "";
    const role = Number(adminInfo.value?.role);
    if (!hasFullInventoryAccess(role) || !isApprovalApplicantRole(role)) return;
    loadingProduction.value = true;
    try {
        const response: any = await $fetch("/production/orders/detail", {
            headers: { Token: getToken() || "" },
            query: { resource: "execution", productionOrderId: productionOrderId.value },
        });
        if (response?.code !== 200) throw new Error(response?.msg || "读取生产单失败");
        if (sequence !== productionLoadSequence) return;
        const snapshot = response.data as ExecutionSnapshot;
        const order = snapshot.orders.find((item) => item.id === productionOrderId.value);
        if (!order) throw new Error("关联生产单不存在");
        productionOrder.value = order;
        productionOrderNo.value = order.documentNo;
        for (const item of items.value) {
            const material = order.materials.find((row) => row.productId === item.productId);
            if (!material) continue;
            item.productCode = material.code;
            item.category = material.category;
            item.image = material.image;
        }
    } catch (error: any) {
        if (sequence === productionLoadSequence) productionLoadError.value = error?.data?.msg || error?.message || "读取生产单失败";
    } finally {
        if (sequence === productionLoadSequence) loadingProduction.value = false;
    }
};

const loadProductionProducts = async ({ keyword = "", page, limit }: ProductPickerLoadParams) => {
    if (productionContextError.value) throw new Error(productionContextError.value);
    const search = keyword.trim().toLowerCase();
    const materials = (productionOrder.value?.materials || []).filter((material) => (
        !search || [material.code, material.name, material.category].some((value) => value.toLowerCase().includes(search))
    ));
    const start = (page - 1) * limit;
    const list = materials.slice(start, start + limit).map((material) => normalizeProductPickerItem({
        _id: material.productId,
        code: material.code,
        name: material.name,
        model: material.name,
        categoryName: material.category,
        image: material.image,
        material: material.material,
        source: material.source,
        unitName: material.unit,
        availableQuantity: material.availableQty,
    }));
    return { list, pagination: { page, limit, total: materials.length, hasMore: start + limit < materials.length } };
};

const loadSalesOrders = async () => {
    if (salesOrders.value.length || loadingOrders.value) return;
    loadingOrders.value = true;
    try {
        const response: any = canSelectSalesOrderForPurchaseRequest(Number(adminInfo.value?.role))
            ? await $fetch("/purchase/material-requirement/retrieve", {
                method: "GET",
                headers: { Token: getToken() || "" },
                query: { purchaseRequestPicker: true, page: 1, limit: 100 },
            })
            : await retrieveSalesOrderList()({
                status: "待采购,生产中",
                page: 1,
                limit: 100,
            });
        salesOrders.value = (response?.data?.list || []).map((order: any) => ({
            id: order._id || order.id,
            orderNo: order.orderNo || "",
            customerName: order.customerName || "",
            salesperson: order.salespersonName || order.salesperson || "",
            status: order.status || "待采购",
            orderType: order.orderType || "销售订单",
            orderDate: order.orderDate || order.createdAt || "",
            duration: order.durationText || "",
        })).filter((order: SalesOrderOption) => order.id && order.orderNo);
    } catch (error: any) {
        ElMessage.error(error?.data?.msg || error?.message || "获取销售订单失败");
    } finally {
        loadingOrders.value = false;
    }
};

const toggleSalesOrderPicker = async () => {
    if (loadingOrders.value || props.initialDraft) return;
    if (salesOrderPickerOpen.value) {
        closeSalesOrderPicker();
        return;
    }
    await openSalesOrderPicker();
};

const openSalesOrderPicker = async () => {
    if (props.initialDraft) return;
    if (!salesOrders.value.length) await loadSalesOrders();
    salesOrderPickerDraftId.value = salesOrderId.value;
    salesOrderPickerKeyword.value = "";
    salesOrderPickerAppliedKeyword.value = "";
    salesOrderPickerOpen.value = true;
};

const closeSalesOrderPicker = () => {
    salesOrderPickerOpen.value = false;
};

const applySalesOrderSearch = () => {
    salesOrderPickerAppliedKeyword.value = salesOrderPickerKeyword.value.trim();
};

const resetSalesOrderSearch = () => {
    salesOrderPickerKeyword.value = "";
    salesOrderPickerAppliedKeyword.value = "";
};

const confirmSalesOrderPicker = () => {
    const selected = salesOrders.value.find((order) => order.id === salesOrderPickerDraftId.value);
    if (!selected) {
        ElMessage.warning("请选择订单");
        return;
    }
    salesOrderId.value = selected.id;
    salesOrderNo.value = selected.orderNo;
    closeSalesOrderPicker();
};

const makeRequirementItem = (line: PurchaseBomPreviewLine): FormItem => ({
    id: nextItemId++,
    name: line.productCode || line.productModel || "",
    model: line.productModel || "",
    quantity: String(line.remainingPurchaseQuantity),
    unit: line.unitName || "",
    productId: line.productId,
    requirementId: line.id,
    bomLineKey: line.bomLineKey,
    shortageQuantity: line.shortageQuantity,
    minQuantity: line.remainingPurchaseQuantity,
    productCode: line.productCode || line.productModel || "",
    category: line.categoryName || "",
    image: line.image || "",
});

const loadOrderRequirements = async (orderId: string) => {
    if (!orderId) return;
    const sequence = ++requirementLoadSequence;
    loadingRequirements.value = true;
    requirementsLoadError.value = "";
    try {
        const response = await retrievePurchaseRequestBomPreview(orderId, props.initialDraft?.id);
        if (sequence !== requirementLoadSequence || salesOrderId.value !== orderId || !isOrderPurchase.value) return;
        if (response.code !== 200 || !response.data) throw new Error(response.msg || "获取 BOM 采购明细失败");
        const preview = response.data;
        const previousItems = items.value;
        const convertedSourceIds = new Set(preview.sourceRequirementIds);
        const draftRequirementIds = new Set((props.initialDraft?.items || []).map((item) => item.requirementId).filter(Boolean));
        const nextItems: FormItem[] = [];
        for (const line of preview.list) {
            if (line.remainingPurchaseQuantity <= 0) continue;
            if (props.initialDraft && line.id && !draftRequirementIds.has(line.id)) continue;
            if (props.initialDraft && !line.id && !convertedSourceIds.has(line.bomLineKey?.split(":")[0] || "")) continue;
            const existing = previousItems.find((item) => (
                (line.id && item.requirementId === line.id)
                || (line.bomLineKey && item.bomLineKey === line.bomLineKey)
            ));
            if (existing) {
                nextItems.push({
                    ...existing,
                    productCode: line.productCode,
                    category: line.categoryName,
                    image: line.image,
                    bomLineKey: line.bomLineKey || existing.bomLineKey,
                    minQuantity: line.remainingPurchaseQuantity,
                });
            } else nextItems.push(makeRequirementItem(line));
        }
        for (const item of previousItems) {
            if (convertedSourceIds.has(item.requirementId || "")) continue;
            if (item.bomLineKey && !item.requirementId) continue;
            if (!props.initialDraft && (item.requirementId || item.bomLineKey)) continue;
            const alreadyIncluded = nextItems.some((line) => line.id === item.id);
            if (!alreadyIncluded) nextItems.push(item);
        }
        items.value = nextItems;
        bomExpansion.value = preview.sourceRequirementIds.length
            ? { version: preview.version, sourceRequirementIds: preview.sourceRequirementIds }
            : null;
        const savedGroups = props.initialDraft?.bomGroups || [];
        bomGroups.value = [...savedGroups, ...preview.groups.filter((group) => !savedGroups.some((saved) => saved.sourceRequirementId === group.sourceRequirementId))];
        collapsedBomNodeKeys.value = new Set();
        if (props.initialDraft && previousItems.some((item) => convertedSourceIds.has(item.requirementId || ""))) {
            ElMessage.warning("草稿中的成品已按 BOM 拆分，请确认各末级物料的采购数量");
        }
        if (!items.value.length && !preview.sourceRequirementIds.length) ElMessage.warning("该销售订单暂无可采购缺口");
        const selected = salesOrders.value.find((order) => order.id === orderId);
        salesOrderNo.value = selected?.orderNo || props.initialDraft?.salesOrderNo || "";
    } catch (error: any) {
        if (sequence === requirementLoadSequence) requirementsLoadError.value = error?.data?.msg || error?.message || "获取 BOM 采购明细失败";
    } finally {
        if (sequence === requirementLoadSequence) loadingRequirements.value = false;
    }
};

watch(isOrderPurchase, (enabled) => {
    salesOrderPickerOpen.value = false;
    if (enabled) loadSalesOrders();
}, { immediate: true });
watch([salesOrderId, isOrderPurchase], ([value, enabled]) => {
    requirementLoadSequence += 1;
    loadingRequirements.value = false;
    requirementsLoadError.value = "";
    bomExpansion.value = null;
    if (!enabled || !value) return;
    if (!props.initialDraft) {
        items.value = [];
        bomGroups.value = [];
    }
    void loadOrderRequirements(value);
}, { immediate: true });
watch(() => Number(adminInfo.value?.role), () => { void loadProductionOrder(); }, { immediate: true });
onBeforeUnmount(() => { requirementLoadSequence += 1; });

const normalizeQuantity = (item: FormItem) => {
    const value = String(item.quantity ?? "");
    if (!value) return;

    const normalized = value
        .replace(/[^0-9.]/g, "")
        .replace(/\.(?=.*\.)/g, "")
        .replace(isOrderPurchase.value ? /^(\d+\.\d{3}).*/ : /^(\d+\.\d).*/, "$1");

    item.quantity = normalized;
};

const formatQuantity = (value: number | undefined) => {
    if (value == null || !Number.isFinite(Number(value))) return "";
    return Number(Number(value).toFixed(3)).toLocaleString("zh-CN", {
        maximumFractionDigits: 3,
    });
};

const openProductPicker = () => {
    if (productionContextError.value) {
        ElMessage.warning(productionContextError.value);
        return;
    }
    if (isOrderPurchase.value && !salesOrderId.value) {
        ElMessage.warning("请先选择关联订单");
        return;
    }
    if (orderContextError.value) {
        ElMessage.warning(orderContextError.value);
        return;
    }
    selectedProductPickerIds.value = items.value
        .map((item) => item.productCode || "")
        .filter(Boolean);
    showProductPicker.value = true;
};

const closeProductPicker = () => {
    showProductPicker.value = false;
    selectedProductPickerIds.value = [];
};

const confirmProductSelection = (products: ProductPickerItem[]) => {
    if (!products.length) {
        ElMessage.warning("请选择产品");
        return;
    }
    if (isProductionPurchase.value && (productionContextError.value || products.some((product) => (
        !productionOrder.value?.materials.some((material) => material.productId === (product.backendId || product.id))
    )))) {
        ElMessage.warning(productionContextError.value || "只能选择关联生产单的 BOM 物料");
        return;
    }

    const existingProductIds = new Set(items.value.map((item) => item.productId).filter(Boolean));
    let skippedCount = 0;
    products.forEach((product) => {
        const productId = product.backendId || product.id;
        if (productId && existingProductIds.has(productId)) {
            skippedCount += 1;
            return;
        }

        items.value.push({
            id: nextItemId++,
            name: product.name || product.model || product.id,
            model: product.model || product.name || product.id,
            quantity: "1",
            unit: product.unit && product.unit !== "--" ? product.unit : "个",
            productId,
            productCode: product.id,
            category: product.category,
            image: product.image,
        });
        if (productId) existingProductIds.add(productId);
    });
    if (skippedCount) ElMessage.warning(`已跳过${skippedCount}个重复产品`);
    closeProductPicker();
};

const clearProducts = () => {
    items.value = isOrderPurchase.value
        ? items.value.filter((item) => Boolean(item.requirementId || item.bomLineKey))
        : [];
};

const removeItem = (id: number) => {
    items.value = items.value.filter((item) => item.id !== id);
};

const closeDialog = () => {
    if (!working.value) emit("close");
};

const validate = () => {
    if (productionContextError.value) return productionContextError.value;
    if (orderContextError.value) return orderContextError.value;
    if (!category.value) return "请选择采购类别";
    if (!department.value) return "请选择部门";
    if (isOrderPurchase.value && (!salesOrderId.value || !items.value.some((item) => item.requirementId || item.bomLineKey))) {
        return "请选择销售订单并确认缺口物料";
    }
    if (isOrderPurchase.value && !images.value.length) return "销售订单采购至少需要上传一张图片";
    if (!items.value.length) return "请选择采购产品";
    for (let index = 0; index < items.value.length; index += 1) {
        const item = items.value[index]!;
        const label = `采购明细${index + 1}`;
        if (isProductionPurchase.value && !productionOrder.value?.materials.some((material) => material.productId === item.productId)) {
            return `${label}不属于关联生产单的 BOM 物料`;
        }
        if (!item.name.trim()) return `请输入${label}名称`;
        if (!item.model.trim()) return `请输入${label}型号规格`;
        const quantity = Number(item.quantity);
        const precisionScale = isOrderPurchase.value ? 1000 : 10;
        if (
            !Number.isFinite(quantity)
            || quantity <= 0
            || Math.abs(quantity * precisionScale - Math.round(quantity * precisionScale)) > 1e-6
        ) {
            return `${label}数量必须大于0且最多保留${isOrderPurchase.value ? "三" : "一"}位小数`;
        }
        if (isOrderPurchase.value && (item.requirementId || item.bomLineKey) && item.minQuantity != null) {
            const minQuantity = Number(item.minQuantity);
            if (Number.isFinite(minQuantity) && minQuantity > 0 && quantity + 1e-6 < minQuantity) {
                return `${label}数量不得低于订单数量${formatQuantity(minQuantity)}`;
            }
        }
        if (!item.unit.trim()) return `请输入${label}单位`;
    }
    return "";
};

const isFile = (value: File | AttachmentRef): value is File =>
    typeof File !== "undefined" && value instanceof File;

const save = async (action: "save-draft" | "submit" | "confirm-bom-covered") => {
    if (working.value) return;
    if (!canSubmitPurchaseRequest(Number(adminInfo.value?.role))) {
        ElMessage.warning("没有采购申请权限");
        return;
    }
    const errorMessage = productionContextError.value || orderContextError.value
        || (attachmentText.value.length > 500 ? "附件不能超过500字符" : "")
        || (action === "confirm-bom-covered" && !canConfirmBomCovered.value ? "请重新读取 BOM 采购明细" : "")
        || (action === "submit" ? validate() : "");
    if (errorMessage) {
        ElMessage.warning(errorMessage);
        return;
    }

    const formData = new FormData();
    formData.append("resource", "purchase-request");
    formData.append("action", action);
    if (props.initialDraft?.id) {
        formData.append("requestId", props.initialDraft.id);
        formData.append("expectedUpdateTime", props.initialDraft.updateTime);
    }
    formData.append("category", category.value);
    if (action !== "confirm-bom-covered") formData.append("department", department.value);
    if (isProductionPurchase.value) {
        formData.append("productionOrderId", productionOrderId.value);
        formData.append("productionOrderNo", productionOrderNo.value);
    }
    if (isOrderPurchase.value) {
        formData.append("salesOrderId", salesOrderId.value);
        formData.append("salesOrderNo", salesOrderNo.value);
        if (bomExpansion.value) formData.append("bomExpansion", JSON.stringify(bomExpansion.value));
    }
    formData.append("items", JSON.stringify(items.value.map((item) => ({
        name: item.name.trim(),
        model: item.model.trim(),
        quantity: Number(item.quantity),
        unit: item.unit.trim(),
        productId: item.productId,
        requirementId: item.requirementId,
        bomLineKey: item.bomLineKey,
        shortageQuantity: item.shortageQuantity,
    }))));
    formData.append("attachmentText", attachmentText.value);
    formData.append("remark", remark.value.trim());
    if (action !== "confirm-bom-covered") {
        formData.append("imagesExisting", JSON.stringify(images.value.filter((file) => !isFile(file))));
        formData.append("attachmentsExisting", JSON.stringify(attachments.value));
        images.value.filter(isFile).forEach((file) => formData.append("images", file));
    }

    working.value = true;
    try {
        const response = await submitPurchaseRequest(formData);
        if (response.code !== 200) {
            const message = response.msg || (action === "confirm-bom-covered" ? "无需采购确认失败" : action === "submit" ? "采购申请提交失败" : "草稿保存失败");
            if (isOrderPurchase.value && response.code === 409) requirementsLoadError.value = message;
            ElMessage.error(message);
            return;
        }
        if (action === "submit" || action === "confirm-bom-covered") {
            ElMessage.success(action === "confirm-bom-covered" ? "BOM 物料库存已满足，无需采购" : "采购申请已提交");
            emit("submitted");
        } else {
            ElMessage.success("采购申请草稿已保存");
            emit("saved");
        }
    } catch (error: any) {
        const message = error?.data?.msg
            || error?.message
            || (action === "confirm-bom-covered" ? "无需采购确认失败" : action === "submit" ? "采购申请提交失败" : "草稿保存失败");
        if (isOrderPurchase.value && Number(error?.statusCode || error?.status || error?.response?.status) === 409) {
            requirementsLoadError.value = message;
        }
        ElMessage.error(message);
    } finally {
        working.value = false;
    }
};
</script>

<style scoped>
.erp-dialog-mask.purchase-request-mask {
    /* Element Plus 的图片预览和操作提示使用 2000 起的层级。 */
    z-index: 1900;
    box-sizing: border-box;
    padding: 16px;
    overflow: hidden;
    overscroll-behavior: contain;
    background: rgb(24 36 58 / 40%);
    color: #303133;
}

.purchase-request-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
    overflow-y: auto;
}

.purchase-request-dialog :deep(.dialog-button.draft) {
    border: 1px solid var(--erp-color-border-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
}

.purchase-form {
    min-width: 0;
    display: grid;
    gap: var(--erp-spacing-20);
}

.production-context-error {
    margin: 0 0 12px;
    color: #d9363e;
    font-size: 13px;
}

.production-context-error button {
    margin-left: 8px;
    border: 0;
    background: none;
    color: #409eff;
    cursor: pointer;
}

.bom-stock-hint,
.bom-covered-tip {
    margin: 0;
    color: #7a8694;
    font-size: 13px;
    line-height: 1.6;
}

.bom-stock-hint button {
    margin-left: 8px;
    padding: 0;
    border: 0;
    background: none;
    color: #409eff;
    cursor: pointer;
}

.bom-covered-tip {
    padding: 10px 12px;
    border-radius: 5px;
    color: #228358;
    background: #f0fbf5;
}

.purchase-bom-group {
    min-width: 0;
    border: 1px solid #dce8f2;
    border-radius: 5px;
}

.purchase-bom-group summary {
    padding: 12px;
    background: #f0f8ff;
    color: #46515c;
    cursor: pointer;
    font-size: 13px;
    line-height: 1.8;
}

.purchase-bom-group summary span {
    margin-left: 16px;
    color: #7a8694;
}

.purchase-bom-table-scroll {
    overflow-x: auto;
}

.purchase-bom-table {
    width: 100%;
    min-width: 1000px;
    border-collapse: collapse;
    font-size: 13px;
}

.purchase-bom-table th,
.purchase-bom-table td {
    padding: 10px;
    border-bottom: 1px solid #edf0f3;
    color: #46515c;
    text-align: center;
    white-space: nowrap;
}

.purchase-bom-table th {
    background: #f7f9fc;
    font-weight: 600;
}

.purchase-bom-table td:nth-child(-n+2) {
    text-align: left;
}

.purchase-bom-table td > small {
    display: block;
    color: #7a8694;
    font-size: 11px;
}

.bom-node-label {
    display: flex;
    align-items: center;
    gap: 6px;
}

.bom-node-label button,
.bom-node-spacer {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
}

.bom-node-label button {
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid #c5d9e8;
    border-radius: 3px;
    color: #409eff;
    background: white;
    cursor: pointer;
}

.bom-node-label button :deep(svg) {
    width: 12px;
    height: 12px;
}

.form-field,
.upload-field {
    min-width: 0;
    display: grid;
    gap: var(--erp-spacing-8);
}

.form-field > span,
.upload-field > span {
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.form-field i {
    margin-right: 2px;
    color: var(--erp-color-text-required);
    font-style: normal;
}

.form-field input,
.form-field select,
.form-field textarea {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font: inherit;
}

.form-field input,
.form-field select {
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
}

.form-field textarea {
    min-height: 96px;
    padding: var(--erp-spacing-8);
    resize: vertical;
}

.form-field input:focus,
.form-field select:focus,
.form-field textarea:focus {
    border-color: var(--erp-color-border-brand);
}

.detail-section {
    display: grid;
    gap: var(--erp-spacing-16);
    padding-top: var(--erp-spacing-20);
    border-top: 1px solid var(--erp-color-divider-subtle);
}

.detail-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--erp-spacing-12);
}

.detail-heading h3 {
    margin: 0;
    font-size: var(--erp-typography-title2-font-size);
    line-height: var(--erp-typography-title2-line-height);
}

.detail-heading button {
    width: var(--erp-size-control-height-sm);
    height: var(--erp-size-control-height-sm);
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-status-error);
    background: transparent;
    cursor: pointer;
}

.quantity-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--erp-spacing-20);
}

.add-detail-button {
    width: fit-content;
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    gap: var(--erp-spacing-4);
    padding: 0 var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    cursor: pointer;
}

.total-quantity {
    margin: 0;
    color: var(--erp-color-text-secondary);
}

.total-quantity strong {
    color: var(--erp-color-text-primary);
}

.form-field small,
.upload-field small,
.remark-field small {
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-note-font-size);
}

.attachment-text-field,
.remark-field {
    position: relative;
}

.attachment-text-field small,
.remark-field small {
    position: absolute;
    right: var(--erp-spacing-8);
    bottom: var(--erp-spacing-4);
}

@media (max-width: 700px) {
    .quantity-row {
        grid-template-columns: 1fr;
    }
}

/* Screenshot-aligned dialog refinements. */
.purchase-request-dialog {
    box-sizing: border-box;
    max-width: min(1240px, calc(100vw - 48px));
    max-height: min(860px, calc(100vh - 48px));
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr) auto;
    border-color: #e0e6ec;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 18px 46px rgb(31 45 61 / 16%);
}

.purchase-request-dialog :deep(.erp-dialog-frame__header) {
    min-height: 56px;
    box-sizing: border-box;
    padding: 0 18px;
    border-bottom-color: #edf0f3;
}

.purchase-request-dialog :deep(.erp-dialog-frame__title) {
    color: #2e3742;
    font-size: 16px;
    font-weight: 600;
}

.purchase-request-dialog :deep(.erp-dialog-frame__close) {
    color: #7c8792;
}

.purchase-request-dialog :deep(.erp-dialog-frame__body) {
    min-height: 0;
    align-content: start;
    gap: 14px;
    padding: 16px;
    overflow-x: hidden;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    background: #f8fafc;
}

.purchase-request-dialog :deep(.erp-dialog-frame__actions) {
    min-height: 64px;
    box-sizing: border-box;
    flex-wrap: wrap;
    padding: 12px 16px;
    border-top-color: #edf0f3;
    background: #ffffff;
}

.purchase-form {
    gap: 14px;
}

.form-field,
.upload-field,
.detail-section {
    padding: 14px;
}

.purchase-form > .form-field,
.purchase-form > .upload-field,
.purchase-form > .detail-section {
    border: 1px solid #e5eaf0;
    border-radius: 6px;
    background: #ffffff;
}

.detail-section .form-field {
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
}

.form-field,
.upload-field {
    gap: 8px;
}

.form-field > span,
.upload-field > span {
    color: #414a55;
    font-size: 13px;
    font-weight: 500;
}

.form-field input,
.form-field select,
.form-field textarea {
    border-color: #dfe4ea;
    border-radius: 5px;
    color: #3e4650;
    background: #ffffff;
    font-size: 13px;
}

.form-field input,
.form-field select {
    height: 34px;
    padding: 0 10px;
}

.form-field textarea {
    min-height: 84px;
    padding: 10px;
}

.form-field input:focus,
.form-field select:focus,
.form-field textarea:focus {
    border-color: #3da9e9;
    box-shadow: 0 0 0 2px rgb(61 169 233 / 10%);
}

.detail-section {
    display: grid;
    gap: 12px;
    padding-top: 14px;
    border-top: 1px solid #e5eaf0;
}

.detail-heading {
    padding-bottom: 8px;
    border-bottom: 1px solid #edf0f3;
}

.detail-heading h3 {
    color: #303944;
    font-size: 14px;
    font-weight: 600;
}

.detail-heading button,
.danger-text-button {
    color: #ef5b5b;
}

.add-detail-button {
    height: 32px;
    border-color: #bfe5fb;
    border-radius: 5px;
    color: #258fca;
    background: #f1faff;
    font-size: 13px;
}

.total-quantity {
    padding: 10px 14px;
    border: 1px solid #e5eaf0;
    border-radius: 6px;
    background: #ffffff;
    color: #697480;
    font-size: 13px;
}

.upload-field small,
.remark-field small,
.form-field small {
    color: #a1aab4;
}

.purchase-request-dialog :deep(.dialog-button) {
    width: 92px;
    height: 34px;
    border-radius: 5px;
    font-size: 13px;
    flex: 0 0 auto;
}

.purchase-request-dialog :deep(.dialog-button.confirm) {
    border-color: #3da9e9;
    background: #3da9e9;
}

.purchase-request-dialog :deep(.dialog-button.confirm:not(:disabled):hover) {
    border-color: #2b96d8;
    background: #2b96d8;
}

.purchase-request-dialog :deep(.dialog-button.draft) {
    border-color: #d9e0e7;
    color: #59636f;
    background: #ffffff;
}

.purchase-request-dialog :deep(.file-uploader) {
    width: fit-content;
    max-width: 100%;
}

.purchase-request-dialog :deep(.file-uploader.is-button .upload-area) {
    min-width: 112px;
    height: 34px;
    box-sizing: border-box;
    padding: 0 14px;
    border-color: #d9e0e7;
    border-radius: 5px;
    background: #ffffff;
}

.purchase-request-dialog :deep(.file-uploader.is-button .upload-content) {
    height: 32px;
    gap: 6px;
}

.purchase-request-dialog :deep(.file-uploader.is-button .upload-content .upload-icon) {
    color: #59636f;
    font-size: 16px;
}

.purchase-request-dialog :deep(.file-uploader.is-button .upload-content p) {
    color: #4e5964;
    font-size: 13px;
}

.purchase-request-dialog :deep(.file-uploader .file-list) {
    max-width: min(100%, 720px);
}

@supports (height: 100dvh) {
    .purchase-request-dialog {
        height: min(860px, calc(100dvh - 32px)) !important;
        max-height: calc(100dvh - 32px);
    }
}

@media (max-width: 760px) {
    .purchase-request-dialog {
        width: calc(100vw - 24px) !important;
        max-width: calc(100vw - 24px);
        height: calc(100vh - 24px) !important;
        max-height: calc(100vh - 24px);
    }

    .erp-dialog-mask.purchase-request-mask {
        padding: 12px;
    }

    @supports (height: 100dvh) {
        .purchase-request-dialog {
            height: calc(100dvh - 24px) !important;
            max-height: calc(100dvh - 24px);
        }
    }

    .purchase-request-dialog :deep(.erp-dialog-frame__header) {
        min-height: 52px;
        padding: 0 12px;
    }

    .purchase-request-dialog :deep(.erp-dialog-frame__actions) {
        padding: 10px 12px;
    }

    .purchase-request-dialog :deep(.dialog-button) {
        min-width: 0;
        flex: 1 1 0;
    }
}

@media (max-width: 700px) {
    .purchase-request-dialog :deep(.erp-dialog-frame__body) {
        padding: 12px;
    }

    .form-field,
    .upload-field,
    .detail-section {
        padding: 12px;
    }
}

/* The purchase form keeps one DOM tree while matching the reference layout. */
.purchase-request-dialog :deep(.erp-dialog-frame__body) {
    padding: 14px;
    background: #f7f8fa;
}

.purchase-form {
    gap: 14px;
}

.purchase-basic-card,
.purchase-detail-card {
    min-width: 0;
    padding: 14px;
    border: 1px solid #e5e8ec;
    border-radius: 6px;
    background: #ffffff;
}

.purchase-basic-card > h3,
.purchase-detail-card h3 {
    margin: 0;
    color: #303944;
    font-size: 16px;
    font-weight: 600;
    line-height: 24px;
}

.basic-info-grid {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-template-rows: auto auto;
    gap: 18px 24px;
    margin-top: 16px;
}

.basic-info-grid > .form-field,
.basic-info-grid > .upload-field {
    min-width: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
}

.basic-info-grid > .form-field {
    grid-template-columns: 82px minmax(0, 1fr);
    align-items: center;
}

.basic-info-grid > .application-number-field {
    grid-column: 1;
    grid-row: 1;
}

.basic-info-grid > .application-number-field input {
    color: #909399;
    background: #f5f7fa;
}

.basic-info-grid input[readonly],
.basic-info-grid select:disabled {
    color: #606266;
    background: #f5f7fa;
    cursor: default;
}

.basic-info-grid > .category-field {
    grid-column: 2;
    grid-row: 1;
}

.basic-info-grid > .department-field {
    grid-column: 3;
    grid-row: 1;
}

.basic-info-grid > .sales-order-field {
    grid-column: 1 / -1;
}

.sales-order-picker {
    min-width: 0;
    position: relative;
    display: flex;
    gap: 8px;
}

.sales-order-picker input {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sales-order-picker > button {
    flex: 0 0 70px;
    height: 34px;
    border: 1px solid #3da9e9;
    border-radius: 5px;
    color: #ffffff;
    background: #3da9e9;
    cursor: pointer;
}

.sales-order-picker > button:not(:disabled):hover {
    border-color: #2b96d8;
    background: #2b96d8;
}

.sales-order-picker > button:disabled,
.sales-order-picker input:disabled {
    cursor: not-allowed;
}

.basic-info-grid > .image-upload-field {
    grid-column: 1;
}

.basic-info-grid > .attachment-text-field {
    grid-column: 2;
    align-self: start;
}

.basic-info-grid > .remark-field {
    grid-column: 3;
    align-self: start;
}

.basic-info-grid > .legacy-attachment-field {
    grid-column: 1 / -1;
}

.basic-info-grid > .upload-field {
    grid-template-columns: 82px minmax(0, 1fr);
    align-items: start;
}

.basic-info-grid > .upload-field > span {
    padding-top: 8px;
}

.basic-info-grid > .upload-field > span i {
    margin-left: 2px;
    color: #ef5b5b;
    font-style: normal;
}

.basic-info-grid > .upload-field > small {
    grid-column: 2;
}

.basic-info-grid > .attachment-text-field textarea,
.basic-info-grid > .remark-field textarea {
    min-height: 120px;
    padding-bottom: 26px;
    resize: vertical;
}

.basic-info-grid > .attachment-text-field small,
.basic-info-grid > .remark-field small {
    right: 10px;
    bottom: 8px;
}

.purchase-request-dialog :deep(.file-uploader) {
    width: 100%;
}

.purchase-request-dialog :deep(.file-uploader.is-button .upload-area) {
    width: 100%;
}

.purchase-request-dialog :deep(.file-uploader:not(.is-button) .upload-area) {
    min-height: 120px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px 12px;
    border: 1px dashed #dfe3e8;
    border-radius: 4px;
    background: #ffffff;
}

.purchase-request-dialog :deep(.file-uploader:not(.is-button) .upload-content .upload-icon) {
    margin-bottom: 12px;
    color: #35aaf4;
    font-size: 28px;
}

.purchase-request-dialog :deep(.file-uploader:not(.is-button) .upload-content p) {
    color: #b2b6bc;
    font-size: 14px;
    line-height: 1.6;
    overflow-wrap: anywhere;
}

.detail-card-heading {
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid #edf0f3;
}

.detail-card-heading .add-detail-button {
    width: auto;
    margin: 0;
    padding: 0 10px;
    border: 0;
    color: #2ea8ed;
    background: transparent;
    font-size: 14px;
}

.detail-card-heading .add-detail-button :deep(svg) {
    width: 20px;
    height: 20px;
}

.detail-list {
    min-width: 0;
    display: grid;
    gap: 10px;
    margin-top: 12px;
}

.detail-list .detail-section {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(240px, 1fr);
    gap: 12px 18px;
    padding: 12px;
    border: 1px solid #edf0f3;
    border-radius: 4px;
    background: #ffffff;
}

.detail-list .detail-heading {
    grid-column: 1 / -1;
    padding-bottom: 8px;
    border-bottom: 1px solid #f0f2f4;
}

.detail-list .detail-heading h4 {
    margin: 0;
    color: #3d4650;
    font-size: 14px;
    font-weight: 600;
}

.detail-list .detail-section > .form-field,
.detail-list .quantity-row {
    min-width: 0;
}

.detail-list .quantity-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.detail-list .form-field > span {
    font-size: 12px;
}

.total-quantity {
    margin: 12px 0 0;
    padding: 10px 12px;
    border: 1px solid #edf0f3;
    border-radius: 4px;
    background: #fafbfc;
}

.purchase-detail-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
}

.product-toolbar {
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
}

.product-source-legend {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: auto;
}

.product-source-legend span,
.product-source-cell span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 18px;
    white-space: nowrap;
}

.order-shortage-legend,
.order-shortage-tag {
    color: #258bc8;
    background: #dff2ff;
}

.manual-added-legend,
.manual-added-tag {
    color: #28875a;
    background: #dff6e9;
}

.production-material-tag {
    color: #337ecc;
    background: #ecf5ff;
}

.select-product-button,
.clear-product-button {
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 10px;
    border: 0;
    background: transparent;
    font-size: 14px;
    cursor: pointer;
}

.select-product-button {
    color: #2ea8ed;
}

.select-product-button:disabled {
    color: #aeb7c0;
    cursor: not-allowed;
}

.clear-product-button {
    margin-left: auto;
    color: #f04444;
}

.select-product-button :deep(svg),
.clear-product-button :deep(svg) {
    width: 20px;
    height: 20px;
}

.order-product-hint {
    color: #8b949e;
    font-size: 13px;
}

.purchase-product-table {
    min-width: 0;
    min-height: 220px;
    flex: 1 0 auto;
    overflow: auto;
    border: 1px solid #edf0f3;
    border-radius: 5px;
    background: #ffffff;
}

.purchase-product-table-inner {
    width: 100%;
    min-width: 920px;
}

.purchase-product-row {
    display: grid;
    grid-template-columns: minmax(120px, 1.05fr) minmax(160px, 1.4fr) minmax(100px, 1fr) 90px 110px 64px 100px 64px;
    align-items: center;
    column-gap: 12px;
    padding: 0 14px;
}

.purchase-product-head {
    height: 44px;
    color: #303944;
    background: #f1f4f8;
    font-size: 13px;
    font-weight: 600;
    text-align: center;
}

.purchase-product-data {
    min-height: 70px;
    border-bottom: 1px solid #edf0f3;
    color: #46515c;
    font-size: 13px;
}

.purchase-product-data:hover {
    background: #fafcfe;
}

.purchase-product-data.order-shortage-row,
.purchase-product-data.order-shortage-row:hover {
    background: #f0f8ff;
}

.purchase-product-data.manual-added-row,
.purchase-product-data.manual-added-row:hover {
    background: #f0fbf5;
}

.purchase-product-data .readonly-cell {
    min-width: 0;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.purchase-product-head > :nth-child(-n+3),
.purchase-product-data > .readonly-cell:nth-child(-n+3) {
    text-align: left;
}

.product-image-cell,
.product-source-cell,
.product-operation-cell,
.quantity-cell {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}

.product-image-cell img {
    width: 60px;
    height: 46px;
    object-fit: contain;
}

.product-image-cell :deep(svg) {
    width: 24px;
    height: 24px;
    color: #b8c0c8;
}

.quantity-cell {
    flex-direction: column;
    gap: 3px;
}

.quantity-cell input {
    width: 76px;
    height: 30px;
    box-sizing: border-box;
    padding: 0 8px;
    border: 1px solid #d8dde3;
    border-radius: 5px;
    outline: 0;
    color: #3e4650;
    text-align: center;
}

.quantity-cell input:focus {
    border-color: #3da9e9;
}

.quantity-cell small {
    color: #9aa3ad;
    font-size: 11px;
    white-space: nowrap;
}

.product-operation-cell button {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: 5px;
    color: #f04444;
    background: transparent;
    cursor: pointer;
}

.product-operation-cell button:hover {
    background: #fff0f0;
}

.empty-products {
    min-width: 920px;
    min-height: 170px;
    display: grid;
    place-items: center;
    color: #a1aab4;
    font-size: 13px;
}

@media (max-width: 900px) {
    .basic-info-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .basic-info-grid > .application-number-field,
    .basic-info-grid > .category-field,
    .basic-info-grid > .department-field,
    .basic-info-grid > .sales-order-field,
    .basic-info-grid > .image-upload-field,
    .basic-info-grid > .attachment-text-field,
    .basic-info-grid > .remark-field {
        grid-column: auto;
        grid-row: auto;
    }

    .basic-info-grid > .remark-field {
        grid-column: 1 / -1;
    }
}

@media (max-width: 700px) {
    .basic-info-grid {
        grid-template-columns: 1fr;
    }

    .basic-info-grid > .remark-field {
        grid-column: auto;
    }

    .basic-info-grid > .form-field,
    .basic-info-grid > .upload-field {
        grid-template-columns: 76px minmax(0, 1fr);
    }

    .detail-list .detail-section {
        grid-template-columns: 1fr;
    }

    .detail-list .detail-heading,
    .detail-list .quantity-row {
        grid-column: auto;
    }

    .detail-list .quantity-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

.sales-order-dialog-mask {
    z-index: 70;
    background: rgb(22 34 48 / 42%);
}

.sales-order-dialog {
    border-color: #dfe4ea;
    border-radius: 6px;
    background: #ffffff;
    box-shadow: 0 18px 46px rgb(31 45 61 / 18%);
}

.sales-order-dialog :deep(.erp-dialog-frame__header) {
    min-height: 58px;
    padding: 0 16px;
    border-bottom-color: #e6e9ed;
}

.sales-order-dialog :deep(.erp-dialog-frame__title) {
    color: #262d35;
    font-size: 18px;
    font-weight: 600;
}

.sales-order-dialog :deep(.erp-dialog-frame__body) {
    grid-template-rows: 42px minmax(0, 1fr) 28px;
    align-content: stretch;
    gap: 10px;
    padding: 14px;
    overflow: hidden;
    background: #ffffff;
}

.sales-order-dialog :deep(.erp-dialog-frame__actions) {
    min-height: 64px;
    padding: 12px 14px;
    border-top-color: #e6e9ed;
}

.sales-order-filter-row {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
}

.sales-order-filter-field {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #3e4650;
    font-size: 13px;
    white-space: nowrap;
}

.sales-order-filter-field select,
.sales-order-search-box,
.sales-order-search-box input {
    height: 34px;
    box-sizing: border-box;
    border: 1px solid #dfe4ea;
    border-radius: 5px;
    background: #ffffff;
}

.sales-order-filter-field select {
    width: 232px;
    padding: 0 10px;
    color: #8d959e;
    outline: 0;
}

.sales-order-filter-button,
.sales-order-reset-button {
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border-radius: 5px;
    cursor: pointer;
}

.sales-order-filter-button {
    padding: 0 12px;
    border: 1px solid #3da9e9;
    color: #ffffff;
    background: #3da9e9;
}

.sales-order-reset-button {
    width: 34px;
    padding: 0;
    border: 1px solid #cbd2d9;
    color: #65717c;
    background: #ffffff;
}

.sales-order-filter-button :deep(svg),
.sales-order-reset-button :deep(svg) {
    width: 16px;
    height: 16px;
}

.sales-order-search-box {
    width: 232px;
    display: flex;
    align-items: center;
    margin-left: auto;
}

.sales-order-search-box input {
    width: 100%;
    padding: 0 10px;
    border: 0;
    outline: 0;
    color: #3e4650;
    font-size: 13px;
}

.sales-order-table {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    border: 1px solid #eef0f2;
    background: #ffffff;
}

.sales-order-table-head,
.sales-order-table-row {
    min-width: 820px;
    display: grid;
    grid-template-columns: 1.25fr 1.2fr 1fr 1fr 1fr 0.7fr;
    align-items: center;
    column-gap: 12px;
    padding: 0 14px;
}

.sales-order-table-head {
    height: 54px;
    color: #2f3740;
    background: #f1f4f8;
    font-size: 14px;
    font-weight: 600;
}

.sales-order-table-row {
    width: 100%;
    height: 70px;
    border: 0;
    border-bottom: 1px solid #eef0f2;
    color: #3f4852;
    background: #ffffff;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
}

.sales-order-table-row:hover,
.sales-order-table-row.selected {
    background: #f1faff;
}

.sales-order-table-row > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sales-order-status {
    width: fit-content;
    padding: 5px 10px;
    border-radius: 999px;
    color: #5d67dd;
    background: #e3e1ff;
}

.sales-order-table-empty {
    min-width: 820px;
    height: 140px;
    display: grid;
    place-items: center;
    color: #a1aab4;
    font-size: 13px;
}

.sales-order-result-count {
    color: #59636f;
    font-size: 13px;
}

.sales-order-dialog :deep(.dialog-button) {
    width: 92px;
    height: 34px;
    border-radius: 5px;
    font-size: 13px;
}

.sales-order-dialog :deep(.dialog-button.confirm) {
    border-color: #3da9e9;
    background: #3da9e9;
}

@media (max-width: 760px) {
    .sales-order-dialog {
        width: calc(100vw - 24px) !important;
        height: calc(100vh - 24px) !important;
    }

    .sales-order-dialog :deep(.erp-dialog-frame__body) {
        grid-template-rows: auto minmax(0, 1fr) 28px;
        padding: 12px;
    }

    .sales-order-filter-row {
        flex-wrap: wrap;
        height: auto;
    }

    .sales-order-filter-field select,
    .sales-order-search-box {
        width: 160px;
    }
}
</style>
