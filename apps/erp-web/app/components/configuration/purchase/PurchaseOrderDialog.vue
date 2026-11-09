<template>
    <div class="erp-dialog-mask" role="presentation" @click.self="closeDialog">
        <ErpDialogFrame
            class="purchase-order-dialog"
            :title="dialogTitle"
            width="1240px"
            height="760px"
            @close="closeDialog"
            @submit.prevent="confirmCreateOrder"
        >
            <div class="dialog-body">
                    <PurchaseChannelFields
                        v-model:purchase-channel="form.purchaseChannel"
                        v-model:platform-order-nos="form.platformOrderNos"
                        :allow-unset="Boolean(initialOrder && !initialOrder.purchaseChannel)"
                    />
                    <section class="form-section">
                        <h3>基本信息</h3>
                        <div class="purchase-form-grid">
                            <label class="purchase-form-row">
                                <span>采购单号</span>
                                <input
                                    v-model="form.orderNo"
                                    type="text"
                                    readonly
                                    aria-label="采购单号"
                                >
                            </label>

                            <label class="purchase-form-row">
                                <span>总金额</span>
                                <input
                                    :value="formatAmount(totalAmount)"
                                    type="text"
                                    readonly
                                    aria-label="总金额"
                                >
                            </label>
                            <label class="purchase-form-row">
                                <span>采购人<i>*</i></span>
                                <input
                                    v-model.trim="form.buyer"
                                    type="text"
                                    required
                                    aria-label="采购人"
                                >
                            </label>
                            <div class="purchase-form-row">
                                <span>供应商<i>*</i></span>
                                <div class="supplier-field">
                                    <el-select
                                        :model-value="form.supplierIds"
                                        multiple filterable remote default-first-option
                                        :allow-create="canWriteSupplier"
                                        :placeholder="canWriteSupplier ? '请选择或输入供应商' : '请选择供应商'"
                                        :remote-method="loadSupplierOptions"
                                        @visible-change="handleSupplierSelectVisible"
                                        @update:model-value="updateSupplierSelection(form, $event)"
                                    >
                                        <el-option v-for="supplier in supplierOptions" :key="supplier.id" :label="supplier.label" :value="supplier.id" />
                                    </el-select>
                                    <small v-if="showSupplierCreateHint">提交时新增</small>
                                </div>
                            </div>
                            <div class="purchase-form-row">
                                <span>产品<i>*</i></span>
                                <div class="product-select-field">
                                    <input
                                        :value="selectedProductLabel"
                                        type="text"
                                        readonly
                                        required
                                        placeholder="请选择"
                                        aria-label="产品"
                                    >
                                    <button
                                        class="select-product-button"
                                        type="button"
                                        @click="openProductPicker"
                                    >
                                        <Icon name="lucide:mouse-pointer-2" />
                                        <span>选择</span>
                                    </button>
                                </div>
                            </div>
                            <label class="purchase-form-row">
                                <span>采购数量<i>*</i></span>
                                <input
                                    v-model.number="form.purchaseQuantity"
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    required
                                    placeholder="填写数量"
                                    aria-label="采购数量"
                                >
                            </label>
                            <label class="purchase-form-row">
                                <span>单位<i>*</i></span>
                                <SearchableSelect
                                    v-model="form.unitId"
                                    :options="unitSelectOptions"
                                    placeholder="请选择"
                                    aria-label="单位"
                                />
                            </label>
                            <label class="purchase-form-row">
                                <span>单价<i>*</i></span>
                                <input
                                    v-model.number="form.unitPrice"
                                    type="number"
                                    min="0.001"
                                    step="0.001"
                                    required
                                    placeholder="填写单价"
                                    aria-label="单价"
                                >
                            </label>
                            <label class="purchase-form-row">
                                <span>产品备注</span>
                                <input
                                    v-model.trim="form.productRemark"
                                    type="text"
                                    aria-label="产品备注"
                                >
                            </label>
                            <label class="purchase-form-row">
                                <span>产品总金额</span>
                                <input
                                    :value="formatAmount(calculatePurchaseItemAmount(form.purchaseQuantity, form.unitPrice))"
                                    type="text"
                                    readonly
                                    aria-label="产品总金额"
                                >
                            </label>
                            <label class="purchase-form-row">
                                <span>采购日期<i>*</i></span>
                                <InventoryDatePicker
                                    v-model="form.purchaseDate"
                                    aria-label-text="采购日期"
                                />
                            </label>
                            <label class="purchase-form-row">
                                <span>备注</span>
                                <input
                                    v-model.trim="form.remark"
                                    type="text"
                                    aria-label="备注"
                                >
                            </label>
                        </div>
                        <p v-if="hasMissingUnitPrice && originalOrderAmount !== null" class="historical-amount">
                            原总金额：{{ formatAmount(originalOrderAmount) }}，补充各产品单价后重新计算。
                        </p>
                        <p v-if="form.unitPrice === '' && originalFirstItemAmount !== null" class="historical-amount">
                            当前产品原金额：{{ formatAmount(originalFirstItemAmount) }}。
                        </p>
                    </section>

                    <section v-if="draftItems.length" class="form-section">
                        <h3>合并产品明细</h3>
                        <div v-for="item in draftItems" :key="item.productId" class="purchase-item-row">
                            <strong>{{ item.productCode || item.productModel || item.productName }}</strong>
                            <label>
                                <span>采购数量<i>*</i></span>
                                <input v-model.number="item.purchaseQuantity" type="number" min="0.001" step="0.001" required aria-label="采购数量">
                            </label>
                            <label>
                                <span>供应商</span>
                                <el-select
                                    :model-value="item.supplierIds"
                                    multiple filterable remote default-first-option
                                    :allow-create="canWriteSupplier"
                                    placeholder="请选择或输入供应商"
                                    :remote-method="loadSupplierOptions"
                                    @visible-change="handleSupplierSelectVisible"
                                    @update:model-value="updateSupplierSelection(item, $event)"
                                >
                                    <el-option v-for="supplier in supplierOptions" :key="supplier.id" :label="supplier.label" :value="supplier.id" />
                                </el-select>
                            </label>
                            <label>
                                <span>单价（人民币）<i>*</i></span>
                                <input v-model.number="item.unitPrice" type="number" min="0.001" step="0.001" required aria-label="单价">
                            </label>
                            <label>
                                <span>备注</span>
                                <input v-model.trim="item.remark" type="text" aria-label="产品备注">
                            </label>
                            <label>
                                <span>总金额（人民币）</span>
                                <input :value="formatAmount(calculatePurchaseItemAmount(item.purchaseQuantity, item.unitPrice))" type="text" readonly aria-label="产品总金额">
                                <small v-if="item.unitPrice === '' && item.originalAmount != null" class="historical-amount">原金额：{{ formatAmount(item.originalAmount) }}</small>
                            </label>
                        </div>
                    </section>

                    <section class="form-section table-section">
                        <div class="section-actions">
                            <button class="text-button" type="button" @click="openOrderPicker">
                                <Icon name="lucide:plus" class="button-icon" />
                                <span>添加关联订单</span>
                            </button>
                            <button class="danger-text-button" type="button" @click="clearRelatedOrders">
                                <Icon name="lucide:trash-2" class="button-icon" />
                                <span>清空</span>
                            </button>
                        </div>
                        <ErpTableFrame
                            class="dialog-table"
                            :columns="relatedOrderColumnTemplate"
                            :empty="relatedOrders.length === 0"
                            empty-text="暂无关联订单"
                            embedded
                        >
                            <template #header>
                            <div
                                class="dialog-table-row dialog-table-head"
                            >
                                <div>订单号</div>
                                <div>该物品需求数量</div>
                                <div>分配数量</div>
                                <div>操作</div>
                            </div>
                            </template>
                            <div
                                v-for="order in relatedOrders"
                                :key="order.id"
                                class="dialog-table-row dialog-table-data"
                            >
                                <div>{{ order.orderNo }}</div>
                                <div>{{ formatPurchaseOrderRequirementQuantity(order.requiredQuantity, order.remainingQuantity) }}</div>
                                <div>
                                    <input
                                        v-model.number="order.allocatedQuantity"
                                        class="mini-number-input"
                                        type="number"
                                        min="0"
                                        step="0.001"
                                        aria-label="分配数量"
                                    >
                                </div>
                                <div class="dialog-action-cell">
                                    <button
                                        class="icon-button delete"
                                        type="button"
                                        :aria-label="'删除关联订单' + order.orderNo"
                                        @click="removeRelatedOrder(order.id)"
                                    >
                                        <Icon name="lucide:trash-2" />
                                    </button>
                                </div>
                            </div>
                        </ErpTableFrame>
                    </section>

                    <section class="form-section table-section">
                        <div class="section-actions">
                            <button class="text-button" type="button" @click="addWaybill">
                                <Icon name="lucide:plus" class="button-icon" />
                                <span>新建运单</span>
                            </button>
                            <button class="danger-text-button" type="button" @click="clearWaybills">
                                <Icon name="lucide:trash-2" class="button-icon" />
                                <span>清空</span>
                            </button>
                        </div>
                        <ErpTableFrame
                            class="dialog-table"
                            :columns="waybillColumnTemplate"
                            :empty="waybills.length === 0"
                            :empty-text="form.purchaseChannel === 'other' ? '待补录' : '暂无运单信息'"
                            embedded
                        >
                            <template #header>
                            <div
                                class="dialog-table-row dialog-table-head"
                            >
                                <div>运单号</div>
                                <div>快递公司</div>
                                <div>备注</div>
                                <div>操作</div>
                            </div>
                            </template>
                            <div
                                v-for="waybill in waybills"
                                :key="waybill.id"
                                class="dialog-table-row dialog-table-data"
                            >
                                <div>{{ waybill.trackingNo }}</div>
                                <div>{{ waybill.courierCompany }}</div>
                                <div>{{ waybill.remark }}</div>
                                <div class="dialog-action-cell">
                                    <button
                                        class="icon-button delete"
                                        type="button"
                                        :aria-label="'删除运单' + waybill.trackingNo"
                                        @click="removeWaybill(waybill.id)"
                                    >
                                        <Icon name="lucide:trash-2" />
                                    </button>
                                </div>
                            </div>
                        </ErpTableFrame>
                    </section>
            </div>

            <template #footer>
                <button class="dialog-button cancel" type="button" @click="closeDialog">
                    取消
                </button>
                <button class="dialog-button confirm" type="submit">
                    确认
                </button>
            </template>
        </ErpDialogFrame>

        <ProductPickerDialog
            v-if="showProductPicker"
            selection-mode="single"
            :product-loader="form.supplierId ? loadSupplierProducts : undefined"
            :selected-product-ids="selectedProductIds"
            :selected-products="selectedProducts"
            @close="showProductPicker = false"
            @confirm="confirmProductSelection"
        />

        <div
            v-if="showOrderPicker"
            class="erp-dialog-mask order-picker-mask"
            role="presentation"
            @click.self="closeOrderPicker"
        >
            <ErpDialogFrame
                class="order-picker-dialog"
                title="选择订单"
                width="1080px"
                height="600px"
                :form="false"
                @close="closeOrderPicker"
            >
                <div class="order-picker-filter-row">
                    <label class="order-filter-field">
                        <span>订单类型</span>
                        <SearchableSelect
                            v-model="orderPickerDraftType"
                            :options="orderTypeSelectOptions"
                            placeholder="请选择"
                            aria-label="筛选订单类型"
                        />
                    </label>
                    <button class="order-outline-button" type="button" @click="resetOrderPickerFilters">
                        <Icon name="lucide:refresh-cw" class="button-icon" />
                        <span>重置</span>
                    </button>
                    <button
                        class="order-muted-button"
                        :class="{ active: hasPendingOrderPickerFilters }"
                        type="button"
                        @click="applyOrderPickerFilters"
                    >
                        <Icon name="lucide:sliders-horizontal" class="button-icon" />
                        <span>筛选</span>
                    </button>
                    <form class="order-search-box" @submit.prevent="applyOrderPickerSearch">
                        <Icon name="lucide:search" class="order-search-icon" />
                        <input
                            v-model="orderPickerSearchText"
                            type="search"
                            placeholder="输入你想要寻找的文字"
                            aria-label="搜索订单"
                        >
                        <button class="order-search-button" type="submit">搜索</button>
                    </form>
                </div>

                <ErpTableFrame
                    class="order-picker-table"
                    :columns="orderPickerColumnTemplate"
                    :empty="orderPickerList.length === 0"
                    empty-text="暂无匹配订单"
                    embedded
                >
                    <template #header>
                        <div
                            class="order-picker-row order-picker-head"
                        >
                            <div class="order-picker-select-cell">
                                <input
                                    class="row-checkbox"
                                    type="checkbox"
                                    :checked="allVisibleOrderPickerSelected"
                                    aria-label="选择全部订单"
                                    @change="toggleSelectAllVisibleOrders"
                                >
                            </div>
                            <div>订单编号</div>
                            <div>销售员</div>
                            <div>订单类型</div>
                            <div>派单日期</div>
                            <div>工期</div>
                        </div>
                    </template>
                    <label
                        v-for="order in orderPickerList"
                        :key="order.id"
                        class="order-picker-row order-picker-data"
                        :class="{ selected: selectedOrderPickerIds.includes(order.id) }"
                    >
                        <span class="order-picker-select-cell">
                            <input
                                class="row-checkbox"
                                type="checkbox"
                                :checked="selectedOrderPickerIds.includes(order.id)"
                                :aria-label="'选择订单' + order.orderNo"
                                @change="toggleOrderPickerSelection(order)"
                            >
                        </span>
                        <span>{{ order.orderNo }}</span>
                        <span>{{ order.salesperson }}</span>
                        <span>{{ order.orderType }}</span>
                        <span>{{ order.dispatchDate }}</span>
                        <span>{{ order.duration }}</span>
                    </label>
                </ErpTableFrame>

                <template #footer>
                    <button class="dialog-button cancel" type="button" @click="closeOrderPicker">
                        取消
                    </button>
                    <button class="dialog-button confirm" type="button" @click="confirmOrderPicker">
                        确认
                    </button>
                </template>
            </ErpDialogFrame>
        </div>

        <div
            v-if="showWaybillDialog"
            class="erp-dialog-mask waybill-create-mask"
            role="presentation"
            @click.self="closeWaybillDialog"
        >
            <ErpDialogFrame
                class="waybill-create-dialog"
                title="新建运单"
                width="600px"
                height="480px"
                @close="closeWaybillDialog"
                @submit.prevent="confirmWaybillDialog"
            >
                <div class="waybill-create-body">
                    <label class="waybill-form-row">
                        <span>运单号<i>*</i></span>
                        <input
                            v-model.trim="waybillForm.trackingNo"
                            type="text"
                            required
                            aria-label="运单号"
                        >
                    </label>

                    <label class="waybill-form-row">
                        <span>快递公司<i>*</i></span>
                        <SearchableSelect
                            v-model="waybillForm.courierCompany"
                            :options="logisticsCompanySelectOptions"
                            placeholder="请选择"
                            aria-label="快递公司"
                        />
                    </label>

                    <label class="waybill-form-row textarea-row">
                        <span>备注</span>
                        <textarea
                            v-model.trim="waybillForm.remark"
                            aria-label="备注"
                        ></textarea>
                    </label>
                </div>

                <template #footer>
                    <button class="dialog-button cancel" type="button" @click="closeWaybillDialog">
                        取消
                    </button>
                    <button class="dialog-button confirm" type="submit">
                        确认
                    </button>
                </template>
            </ErpDialogFrame>
        </div>
    </div>
</template>

<script setup lang="ts">
import ProductPickerDialog from "~/components/configuration/inventory/ProductPickerDialog.vue";
import InventoryDatePicker from "~/components/configuration/inventory/InventoryDatePicker.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import {
    retrieveInventoryProducts,
    retrieveInventoryUnits,
} from "~/composables/api/useInventoryApi";
import {
    addPurchaseSupplier,
    retrievePurchaseSupplierProducts,
    retrievePurchaseSuppliers,
    savePurchaseSupplierProducts,
} from "~/composables/api/usePurchaseSupplierApi";
import { retrievePurchaseOrderSalesCandidates } from "~/composables/api/usePurchaseOrderApi";
import { logisticsCompanyOptions } from "~/utils/logisticsCompanyOptions";
import PurchaseChannelFields from "~/components/configuration/purchase/PurchaseChannelFields.vue";
import type { PurchaseChannel } from "~~/shared/types/logistics";
import { platformOrderNosError } from "~~/shared/utils/logistics";
import {
    normalizeProductPickerItem,
    type ProductPickerItem,
} from "~/composables/inventory/useInventoryProductPickerData";
import type {
    InventoryProduct,
    InventoryUnit as InventoryUnitEntity,
} from "~~/shared/types/inventory";
import type {
    PurchaseOrder,
    PurchaseOrderDialogDraft,
    PurchaseOrderSalesCandidate,
    PurchaseSupplier,
} from "~~/shared/types/purchase";
import {
    calculatePurchaseItemAmount,
    getPurchaseUnitPriceError,
    sumPurchaseItemAmounts,
} from "~~/shared/utils/purchaseOrderAmount";
import { canAccessPurchaseSupplier, canReadPurchaseSupplier } from "~~/shared/utils/adminPermission";

interface UnitOption {
    id: string;
    name: string;
}

interface SupplierOption {
    id: string;
    label: string;
}

interface PurchaseOrderForm {
    purchaseChannel: PurchaseChannel | "";
    platformOrderNos: string[];
    orderNo: string;
    buyer: string;
    supplierId: string;
    supplierName: string;
    supplierIds: string[];
    productId: string;
    productName: string;
    purchaseQuantity: number | null;
    unitId: string;
    unitPrice: number | string;
    productRemark: string;
    purchaseDate: string;
    remark: string;
}

interface RelatedOrder {
    id: string;
    requirementId: string;
    orderNo: string;
    requiredQuantity: number;
    remainingQuantity: number | null;
    allocatedQuantity: number;
}

interface DraftItem {
    productId: string;
    productCode: string;
    productModel: string;
    productName: string;
    unitId: string;
    unitName: string;
    purchaseQuantity: number;
    unitPrice: number | string;
    remark: string;
    originalAmount?: number;
    supplierId: string;
    supplierName: string;
    supplierIds: string[];
    relatedOrders: RelatedOrder[];
}

interface OrderPickerItem {
    id: string;
    orderNo: string;
    salesperson: string;
    orderType: string;
    dispatchDate: string;
    duration: string;
    requiredQuantity: number;
    remainingQuantity: number;
}

interface WaybillInfo {
    source?: "manual" | "taobao";
    id: string;
    trackingNo: string;
    courierCompany: string;
    remark: string;
}

interface WaybillForm {
    trackingNo: string;
    courierCompany: string;
    remark: string;
}

const props = defineProps<{
    orderNo: string;
    mode?: "create" | "edit";
    initialOrder?: PurchaseOrder | null;
    initialDraft?: PurchaseOrderDialogDraft | null;
}>();

const emit = defineEmits<{
    close: [];
    confirm: [payload: {
        form: PurchaseOrderForm & { purchaseQuantity: number };
        relatedOrders: RelatedOrder[];
        waybills: WaybillInfo[];
        items?: Array<{
            productId: string;
            quantity: number;
            unitPrice: number | string;
            remark: string;
            unitId?: string;
            supplierId?: string;
            supplierIds?: string[];
            allocations: Array<{ requirementId: string; allocatedQuantity: number }>;
        }>;
    }];
}>();

const relatedOrderColumnTemplate = "1fr 1fr 1fr 76px";
const waybillColumnTemplate = "1fr 1fr 1fr 76px";
const orderPickerColumnTemplate = "52px 1.15fr 1fr 1fr 1.2fr 1fr";
const orderTypeOptions = ["机架", "机架动力套", "整机+配件", "电池", "其他"];
const logisticsCompanySelectOptions = logisticsCompanyOptions.map((company) => ({
    label: company,
    value: company,
}));
const orderTypeSelectOptions = orderTypeOptions.map((type) => ({
    label: type,
    value: type,
}));
const supplierPageSize = 50;
const adminInfo = useState<{ username?: string; role?: number | string }>("admin_info", () => ({}));
const canWriteSupplier = computed(() => canAccessPurchaseSupplier(Number(adminInfo.value.role)));
const dialogTitle = computed(() => props.mode === "edit" ? "编辑采购单" : "新建采购单");
const currentBuyerName = computed(() => adminInfo.value.username ?? "");
const getTodayDate = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
};

const form = reactive<PurchaseOrderForm>({
    purchaseChannel: props.initialOrder ? props.initialOrder.purchaseChannel || "" : "taobao",
    platformOrderNos: props.initialOrder?.platformOrderNos || [],
    orderNo: props.orderNo,
    buyer: currentBuyerName.value,
    supplierId: "",
    supplierName: "",
    supplierIds: [],
    productId: "",
    productName: "",
    purchaseQuantity: null,
    unitId: "",
    unitPrice: "",
    productRemark: "",
    purchaseDate: getTodayDate(),
    remark: "",
});
const unitOptions = ref<UnitOption[]>([]);
const supplierOptions = ref<SupplierOption[]>([]);
const createdSupplierIds = new Set<string>();
const selectedProduct = ref<ProductPickerItem | null>(null);
const relatedOrders = ref<RelatedOrder[]>([]);
const draftItems = ref<DraftItem[]>([]);
const originalOrderAmount = ref<number | null>(null);
const originalFirstItemAmount = ref<number | null>(null);
const purchaseItems = computed<DraftItem[]>(() => [{
    productId: form.productId,
    productCode: selectedProduct.value?.id || "",
    productModel: selectedProduct.value?.model || "",
    productName: form.productName,
    unitId: form.unitId,
    unitName: selectedProduct.value?.unit || "",
    purchaseQuantity: Number(form.purchaseQuantity),
    unitPrice: form.unitPrice,
    remark: form.productRemark,
    supplierId: form.supplierId,
    supplierName: form.supplierName,
    supplierIds: form.supplierIds,
    relatedOrders: relatedOrders.value,
}, ...draftItems.value]);
const totalAmount = computed(() => {
    const amounts: number[] = [];
    for (const item of purchaseItems.value) {
        const amount = calculatePurchaseItemAmount(item.purchaseQuantity, item.unitPrice);
        if (amount === null) return null;
        amounts.push(amount);
    }
    return sumPurchaseItemAmounts(amounts);
});
const hasMissingUnitPrice = computed(() => purchaseItems.value.some((item) => item.unitPrice === ""));
const formatAmount = (value: number | null | undefined) => value == null ? "--" : value.toFixed(2);
const waybills = ref<WaybillInfo[]>([]);
const orderPickerList = ref<OrderPickerItem[]>([]);
const showProductPicker = ref(false);
const showOrderPicker = ref(false);
const showWaybillDialog = ref(false);
const isInitialReady = ref(false);
const skipSupplierClear = ref(false);
let supplierOptionsRequestId = 0;
const orderPickerDraftType = ref("");
const orderPickerAppliedType = ref("");
const orderPickerSearchText = ref("");
const orderPickerAppliedKeyword = ref("");
const selectedOrderPickerIds = ref<string[]>([]);
const unitSelectOptions = computed(() =>
    unitOptions.value.map((unit) => ({
        label: unit.name,
        value: unit.id,
    })),
);

const waybillForm = reactive<WaybillForm>({
    trackingNo: "",
    courierCompany: "",
    remark: "",
});

const selectedProductLabel = computed(() => selectedProduct.value
    ? selectedProduct.value.model || selectedProduct.value.id
    : "");
const selectedProductIds = computed(() =>
    selectedProduct.value?.id ? [selectedProduct.value.id] : [],
);
const selectedProducts = computed(() =>
    selectedProduct.value ? [selectedProduct.value] : [],
);
const showSupplierCreateHint = computed(() =>
    canWriteSupplier.value
    && form.supplierIds.some((id) => !supplierOptions.value.some((supplier) => supplier.id === id || supplier.label === id)),
);
const hasPendingOrderPickerFilters = computed(() =>
    orderPickerDraftType.value !== orderPickerAppliedType.value,
);
const allVisibleOrderPickerSelected = computed(() =>
    orderPickerList.value.length > 0
    && orderPickerList.value.every((order) => selectedOrderPickerIds.value.includes(order.id)),
);

const normalizeUnitOption = (unit: InventoryUnitEntity): UnitOption => ({
    id: unit._id!,
    name: unit.name,
});

const normalizeSupplierOption = (supplier: PurchaseSupplier): SupplierOption => ({
    id: supplier._id!,
    label: supplier.name,
});

const applyDefaultBuyer = () => {
    if (props.mode !== "edit" && !form.buyer) {
        form.buyer = currentBuyerName.value;
    }
};

const applyDefaultPurchaseDate = () => {
    if (props.mode !== "edit" && !form.purchaseDate) {
        form.purchaseDate = getTodayDate();
    }
};

const formatDateTime = (value?: string | Date | null) =>
    value ? String(value).slice(0, 16).replace("T", " ") : "";

const formatQuantity = (value: number) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0";

    return String(Number(num.toFixed(3)));
};

const formatPurchaseOrderRequirementQuantity = (
    requiredQuantity: number,
    remainingQuantity: number | null,
) => {
    const requiredText = formatQuantity(requiredQuantity);
    if (remainingQuantity === null || remainingQuantity === undefined) {
        return requiredText;
    }

    const remaining = Number(remainingQuantity);
    if (!Number.isFinite(remaining)) {
        return requiredText;
    }

    return `${requiredText}(缺口${formatQuantity(remaining)})`;
};

const loadUnitOptions = async () => {
    try {
        const res = await retrieveInventoryUnits();

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取单位选项失败");
            unitOptions.value = [];
            return;
        }

        unitOptions.value = res.data!.list.map(normalizeUnitOption);
    } catch (err: any) {
        unitOptions.value = [];
        ElMessage.error(err?.data?.msg || err?.message || "获取单位选项失败");
    }
};

const fetchSupplierOptions = async (keyword: string): Promise<SupplierOption[]> => {
    if (!canReadPurchaseSupplier(Number(adminInfo.value.role))) return [];
    try {
        const res = await retrievePurchaseSuppliers({
            keyword,
            isEnabled: true,
            limit: supplierPageSize,
        }, {
            skipLoading: true,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取供应商选项失败");
            return [];
        }

        return res.data!.list.map(normalizeSupplierOption);
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "获取供应商选项失败");
        return [];
    }
};

const loadSupplierOptions = async (keyword = "") => {
    const requestId = ++supplierOptionsRequestId;
    const options = await fetchSupplierOptions(keyword);
    if (requestId !== supplierOptionsRequestId) return;
    const selectedIds = new Set([
        ...form.supplierIds,
        ...draftItems.value.flatMap((item) => item.supplierIds),
    ]);
    const retained = supplierOptions.value.filter((supplier) => selectedIds.has(supplier.id) || selectedIds.has(supplier.label));
    supplierOptions.value = [...new Map([...retained, ...options].map((supplier) => [supplier.id, supplier])).values()];
};

const handleSupplierSelectVisible = (visible: boolean) => {
    if (visible) void loadSupplierOptions();
};

const createEmptyProductLoadResult = (params: {
    page: number;
    limit: number;
}) => ({
    list: [],
    pagination: {
        page: params.page,
        limit: params.limit,
        total: 0,
        hasMore: false,
    },
});

const loadAllPurchaseProducts = async (params: {
    keyword?: string;
    categoryId?: string;
    page: number;
    limit: number;
}) => {
    const res = await retrieveInventoryProducts({
        keyword: params.keyword,
        categoryId: params.categoryId,
        includeStock: true,
        page: params.page,
        limit: params.limit,
    });

    if (res.code !== 200) {
        ElMessage.error(res.msg || "获取产品列表失败");
        return createEmptyProductLoadResult(params);
    }

    return {
        list: Array.isArray(res.data?.list)
            ? res.data.list.map((product) => normalizeProductPickerItem(product as InventoryProduct))
            : [],
        pagination: res.data?.pagination || {
            page: params.page,
            limit: params.limit,
            total: 0,
            hasMore: false,
        },
    };
};

const loadSupplierProducts = async (params: {
    keyword?: string;
    categoryId?: string;
    page: number;
    limit: number;
}) => {
    if (!form.supplierId) {
        return await loadAllPurchaseProducts(params);
    }

    try {
        const res = await retrievePurchaseSupplierProducts(form.supplierId, {
            keyword: params.keyword,
            categoryId: params.categoryId,
            page: params.page,
            limit: params.limit,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取供应商关联产品失败");
            return createEmptyProductLoadResult(params);
        }

        const list = Array.isArray(res.data?.list)
            ? res.data.list.map((product) => normalizeProductPickerItem(product as InventoryProduct))
            : [];
        const pagination = res.data?.pagination || {
            page: params.page,
            limit: params.limit,
            total: 0,
            hasMore: false,
        };
        const hasNoSupplierRelations =
            list.length === 0
            && Number(res.data?.pagination?.total) === 0
            && Number(res.data?.pagination?.limit) === 0;

        if (hasNoSupplierRelations) {
            return await loadAllPurchaseProducts(params);
        }

        return {
            list,
            pagination,
        };
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "获取供应商关联产品失败");
        return createEmptyProductLoadResult(params);
    }
};

const normalizeOrderPickerItem = (item: PurchaseOrderSalesCandidate): OrderPickerItem => ({
    id: item.requirementId,
    orderNo: item.orderNo,
    salesperson: item.salesperson || "",
    orderType: item.orderType || "",
    dispatchDate: formatDateTime(item.dispatchDate),
    duration: item.duration || "",
    requiredQuantity: Number(item.requiredQuantity || 0),
    remainingQuantity: Number(item.remainingQuantity || 0),
});

const loadOrderPickerList = async () => {
    try {
        const res = await retrievePurchaseOrderSalesCandidates({
            productId: form.productId,
            keyword: orderPickerAppliedKeyword.value || undefined,
            orderType: orderPickerAppliedType.value || undefined,
            page: 1,
            limit: 200,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取候选订单失败");
            orderPickerList.value = [];
            return;
        }

        orderPickerList.value = res.data!.list.map(normalizeOrderPickerItem);
    } catch (err: any) {
        orderPickerList.value = [];
        ElMessage.error(err?.data?.msg || err?.message || "获取候选订单失败");
    }
};

const createRelatedOrderFromPicker = (order: OrderPickerItem): RelatedOrder => ({
    id: order.id,
    requirementId: order.id,
    orderNo: order.orderNo,
    requiredQuantity: order.requiredQuantity,
    remainingQuantity: order.remainingQuantity,
    allocatedQuantity: order.remainingQuantity,
});

const openOrderPicker = async () => {
    if (!form.productId) {
        ElMessage.warning("请先选择采购产品");
        return;
    }

    await loadOrderPickerList();
    selectedOrderPickerIds.value = orderPickerList.value
        .filter((order) => relatedOrders.value.some((relatedOrder) => relatedOrder.requirementId === order.id))
        .map((order) => order.id);
    showOrderPicker.value = true;
};

const closeOrderPicker = () => {
    showOrderPicker.value = false;
};

const applyOrderPickerFilters = async () => {
    orderPickerAppliedType.value = orderPickerDraftType.value;
    await loadOrderPickerList();
};

const resetOrderPickerFilters = () => {
    orderPickerDraftType.value = "";
    orderPickerAppliedType.value = "";
    void loadOrderPickerList();
};

const applyOrderPickerSearch = async () => {
    orderPickerAppliedKeyword.value = orderPickerSearchText.value.trim();
    await loadOrderPickerList();
};

const toggleOrderPickerSelection = (order: OrderPickerItem) => {
    if (selectedOrderPickerIds.value.includes(order.id)) {
        selectedOrderPickerIds.value = selectedOrderPickerIds.value.filter((id) => id !== order.id);
        return;
    }

    selectedOrderPickerIds.value = [...selectedOrderPickerIds.value, order.id];
};

const toggleSelectAllVisibleOrders = () => {
    const visibleIds = orderPickerList.value.map((order) => order.id);

    if (allVisibleOrderPickerSelected.value) {
        selectedOrderPickerIds.value = selectedOrderPickerIds.value.filter((id) => !visibleIds.includes(id));
        return;
    }

    selectedOrderPickerIds.value = [...new Set([...selectedOrderPickerIds.value, ...visibleIds])];
};

const confirmOrderPicker = () => {
    const selectedOrders = orderPickerList.value.filter((order) => selectedOrderPickerIds.value.includes(order.id));
    const existingRequirementIds = new Set(relatedOrders.value.map((order) => order.requirementId));
    const nextRelatedOrders = selectedOrders
        .filter((order) => !existingRequirementIds.has(order.id))
        .map(createRelatedOrderFromPicker);

    if (!selectedOrders.length) {
        ElMessage.warning("请选择订单");
        return;
    }

    if (!nextRelatedOrders.length) {
        closeOrderPicker();
        return;
    }

    relatedOrders.value = [...relatedOrders.value, ...nextRelatedOrders];
    closeOrderPicker();
};

const removeRelatedOrder = (id: string) => {
    relatedOrders.value = relatedOrders.value.filter((order) => order.id !== id);
};

const clearRelatedOrders = () => {
    relatedOrders.value = [];
};

const addWaybill = () => {
    resetWaybillForm();
    showWaybillDialog.value = true;
};

const resetWaybillForm = () => {
    waybillForm.trackingNo = "";
    waybillForm.courierCompany = "";
    waybillForm.remark = "";
};

const closeWaybillDialog = () => {
    showWaybillDialog.value = false;
};

const confirmWaybillDialog = () => {
    if (!waybillForm.trackingNo.trim() || !waybillForm.courierCompany) {
        ElMessage.warning("请填写完整的运单信息");
        return;
    }

    waybills.value = [
        ...waybills.value,
        {
            id: `waybill-${Date.now()}-${waybills.value.length + 1}`,
            trackingNo: waybillForm.trackingNo.trim(),
            courierCompany: waybillForm.courierCompany,
            remark: waybillForm.remark.trim(),
        },
    ];
    closeWaybillDialog();
};

const removeWaybill = (id: string) => {
    waybills.value = waybills.value.filter((waybill) => waybill.id !== id);
};

const clearWaybills = () => {
    waybills.value = [];
};

const clearSelectedProduct = () => {
    selectedProduct.value = null;
    form.productId = "";
    form.productName = "";
    form.unitId = "";
    form.unitPrice = "";
    form.productRemark = "";
    originalFirstItemAmount.value = null;
    relatedOrders.value = [];
    selectedOrderPickerIds.value = [];
    orderPickerList.value = [];
};

const openProductPicker = () => {
    if (!form.supplierIds.length) {
        ElMessage.warning("请先填写供应商");
        return;
    }

    showProductPicker.value = true;
};

const confirmProductSelection = (products: ProductPickerItem[]) => {
    const [product] = products;

    if (!product) {
        return;
    }

    selectedProduct.value = product;
    form.productId = product.backendId || product.id;
    form.productName = product.model || product.id;
    form.unitPrice = "";
    form.productRemark = "";
    originalFirstItemAmount.value = null;
    relatedOrders.value = [];
    selectedOrderPickerIds.value = [];
    orderPickerList.value = [];

    form.unitId = product.unitId || "";

    showProductPicker.value = false;
};

const updateSupplierSelection = (
    target: Pick<PurchaseOrderForm, "supplierIds" | "supplierId" | "supplierName">,
    values: string[],
) => {
    const ids: string[] = [];
    for (const value of values) {
        const text = value.trim();
        if (!text) continue;
        const option = supplierOptions.value.find((supplier) => supplier.id === text || supplier.label === text);
        const id = option?.id || text;
        if (!ids.includes(id)) ids.push(id);
    }
    const first = supplierOptions.value.find((supplier) => supplier.id === ids[0]);
    const firstId = first?.id || "";
    if (target === form && target.supplierId !== firstId && ids.some((id) => target.supplierIds.includes(id))) {
        skipSupplierClear.value = true;
    }
    target.supplierIds = ids;
    target.supplierId = firstId;
    target.supplierName = first?.label || ids[0] || "";
};

const assignInitialDraft = (draft?: PurchaseOrderDialogDraft | null) => {
    if (!draft || props.mode === "edit") {
        return;
    }

    const sourceItems = Array.isArray(draft.items) && draft.items.length
        ? draft.items
        : [{ ...draft, relatedOrders: draft.relatedOrders || [] }];
    const firstItem = sourceItems[0]!;
    draftItems.value = sourceItems.slice(1).map((item) => ({
        productId: item.productId,
        productCode: item.productCode || "",
        productModel: item.productModel || "",
        productName: item.productName || "",
        unitId: item.unitId || "",
        unitName: item.unitName || "",
        purchaseQuantity: Number(item.purchaseQuantity || 0),
        unitPrice: "",
        remark: "",
        supplierId: item.supplierId || "",
        supplierName: item.supplierName || "",
        supplierIds: item.supplierId ? [item.supplierId] : item.supplierName ? [item.supplierName] : [],
        relatedOrders: (item.relatedOrders || []).map((order) => ({
            id: order.id || order.requirementId,
            requirementId: order.requirementId || order.id,
            orderNo: order.orderNo,
            requiredQuantity: Number(order.requiredQuantity || 0),
            remainingQuantity: order.remainingQuantity == null ? null : Number(order.remainingQuantity),
            allocatedQuantity: Number(order.allocatedQuantity || 0),
        })),
    }));
    form.orderNo = props.orderNo;
    form.supplierId = firstItem.supplierId || draft.supplierId || "";
    form.supplierName = firstItem.supplierName || draft.supplierName || "";
    form.supplierIds = form.supplierId ? [form.supplierId] : form.supplierName ? [form.supplierName] : [];
    const initialSuppliers = [form, ...draftItems.value]
        .filter((item) => item.supplierId)
        .map((item) => ({ id: item.supplierId, label: item.supplierName }));
    supplierOptions.value = [...new Map(initialSuppliers.map((supplier) => [supplier.id, supplier])).values()];
    form.productId = firstItem.productId || "";
    form.productName = firstItem.productModel || firstItem.productCode || firstItem.productName || "";
    form.purchaseQuantity = Number(firstItem.purchaseQuantity || 0) || null;
    form.unitId = firstItem.unitId || "";
    form.unitPrice = "";
    form.productRemark = "";
    originalOrderAmount.value = null;
    originalFirstItemAmount.value = null;

    selectedProduct.value = firstItem.productId ? {
        backendId: firstItem.productId,
        id: firstItem.productCode || firstItem.productId,
        model: firstItem.productModel || firstItem.productCode || firstItem.productName || "",
        material: "",
        category: "",
        categoryId: "",
        image: "",
        totalQuantity: "",
        availableQuantity: "",
        unit: firstItem.unitName || "",
        unitId: firstItem.unitId || "",
        source: "",
        barcode: "",
        modelCode: "",
        snPrefixes: [],
        finishedCount: "",
        warehouseId: "",
        warehouseName: "",
        locationId: "",
        locationName: "",
    } : null;

    relatedOrders.value = Array.isArray(firstItem.relatedOrders)
        ? firstItem.relatedOrders.map((order) => ({
            id: order.id || order.requirementId,
            requirementId: order.requirementId || order.id,
            orderNo: order.orderNo,
            requiredQuantity: Number(order.requiredQuantity || 0),
            remainingQuantity: order.remainingQuantity === null || order.remainingQuantity === undefined
                ? null
                : Number(order.remainingQuantity || 0),
            allocatedQuantity: Number(order.allocatedQuantity ?? 0),
        }))
        : [];
};

const assignInitialOrder = (order?: PurchaseOrder | null) => {
    if (!order) return;

    const items = Array.isArray(order.items) ? order.items : [];
    const [item] = items;
    const initialSuppliers: SupplierOption[] = [];
    for (const product of items) {
        const snapshots = product.suppliers?.length
            ? product.suppliers
            : [{ supplierId: product.supplierId || order.supplierId || "", supplierName: product.supplierName || order.supplierName || "" }];
        for (const supplier of snapshots) {
            if (supplier.supplierId) initialSuppliers.push({ id: supplier.supplierId, label: supplier.supplierName || "" });
        }
    }
    supplierOptions.value = [...new Map(initialSuppliers.map((supplier) => [supplier.id, supplier])).values()];
    const getRelatedOrders = (productId: string, itemIndex: number): RelatedOrder[] => (order.allocations || [])
        .filter((allocation) => allocation.productId ? String(allocation.productId) === productId : itemIndex === 0)
        .map((allocation) => ({
            id: allocation.requirementId || allocation._id || "",
            requirementId: allocation.requirementId || "",
            orderNo: allocation.salesOrderNo || "",
            requiredQuantity: Number(allocation.allocatedQuantity || 0),
            remainingQuantity: null,
            allocatedQuantity: Number(allocation.allocatedQuantity || 0),
        }));
    draftItems.value = items.slice(1).map((product, index) => ({
        productId: String(product.productId),
        productCode: product.productCode || "",
        productModel: product.productModel || "",
        productName: product.productName || "",
        unitId: product.unitId || "",
        unitName: product.unitName || "",
        purchaseQuantity: Number(product.quantity || 0),
        unitPrice: product.unitPrice ?? "",
        remark: product.remark || "",
        originalAmount: product.totalAmount,
        supplierId: product.supplierId || order.supplierId || "",
        supplierName: product.supplierName || order.supplierName || "",
        supplierIds: product.suppliers?.length
            ? product.suppliers.map((supplier) => supplier.supplierId)
            : product.supplierId || order.supplierId ? [String(product.supplierId || order.supplierId)] : [],
        relatedOrders: getRelatedOrders(String(product.productId), index + 1),
    }));
    form.orderNo = order.orderNo || "";
    const previousAmount = order.totalAmount ?? order.totalPrice;
    originalOrderAmount.value = previousAmount != null && previousAmount !== "" && Number.isFinite(Number(previousAmount))
        ? Number(previousAmount)
        : null;
    originalFirstItemAmount.value = item?.totalAmount ?? null;
    form.buyer = order.buyer || "";
    form.supplierId = item?.supplierId || order.supplierId || "";
    form.supplierName = item?.supplierName || order.supplierName || "";
    form.supplierIds = item?.suppliers?.length
        ? item.suppliers.map((supplier) => supplier.supplierId)
        : form.supplierId ? [form.supplierId] : [];
    form.productId = item?.productId || "";
    form.productName = item?.productModel || item?.productCode || "";
    form.purchaseQuantity = Number(item?.quantity || 0) || null;
    form.unitId = item?.unitId || "";
    form.unitPrice = item?.unitPrice ?? "";
    form.productRemark = item?.remark || "";
    form.purchaseDate = order.purchaseDate || "";
    form.remark = order.remark || "";
    form.purchaseChannel = order.purchaseChannel || "";
    form.platformOrderNos = [...(order.platformOrderNos || [])];

    selectedProduct.value = item ? {
        backendId: form.productId,
        id: item.productCode || form.productId,
        model: item.productModel || item.productCode || "",
        material: "",
        category: "",
        categoryId: "",
        image: "",
        totalQuantity: "",
        availableQuantity: "",
        unit: item.unitName || "",
        unitId: form.unitId,
        source: "",
        barcode: "",
        modelCode: "",
        snPrefixes: [],
        finishedCount: "",
        warehouseId: "",
        warehouseName: "",
        locationId: "",
        locationName: "",
    } : null;

    relatedOrders.value = item ? getRelatedOrders(String(item.productId), 0) : [];

    waybills.value = Array.isArray(order.waybills)
        ? order.waybills.map((waybill, index) => ({
            id: `waybill-${index}-${waybill.trackingNo || Date.now()}`,
            trackingNo: waybill.trackingNo || "",
            courierCompany: waybill.courierCompany || "",
            remark: waybill.remark || "",
            source: waybill.source,
        }))
        : [];
};

const closeDialog = () => {
    showProductPicker.value = false;
    showOrderPicker.value = false;
    showWaybillDialog.value = false;
    emit("close");
};

const ensureSupplier = async () => {
    if (!form.supplierIds.length) {
        ElMessage.warning("请填写供应商");
        return false;
    }

    try {
        for (const item of [form, ...draftItems.value]) {
            const ids: string[] = [];
            for (const value of item.supplierIds) {
                let supplier = supplierOptions.value.find((option) => option.id === value || option.label === value);
                let page = 1;
                while (!supplier) {
                    const response = await retrievePurchaseSuppliers({
                        keyword: value,
                        isEnabled: true,
                        page,
                        limit: supplierPageSize,
                    }, { skipLoading: true });
                    if (response.code !== 200 || !response.data) throw new Error(response.msg || "查询供应商失败");
                    const existing = response.data.list.find((candidate) => candidate.name === value);
                    if (existing) {
                        supplier = normalizeSupplierOption(existing);
                        supplierOptions.value.push(supplier);
                    }
                    if (!response.data.pagination.hasMore) break;
                    page++;
                }
                if (!supplier) {
                    if (!canWriteSupplier.value) throw new Error("请选择已有供应商");
                    const res = await addPurchaseSupplier({ name: value, isEnabled: true });
                    if (res.code !== 200 || !res.data?.detail) {
                        throw new Error(res.msg || "新增供应商失败");
                    }
                    supplier = normalizeSupplierOption(res.data.detail as PurchaseSupplier);
                    supplierOptions.value.push(supplier);
                    createdSupplierIds.add(supplier.id);
                    const supplierId = supplier.id;
                    item.supplierIds = item.supplierIds.map((id) => id === value ? supplierId : id);
                }
                if (canWriteSupplier.value && createdSupplierIds.has(supplier.id) && item.productId) {
                    const productRes = await savePurchaseSupplierProducts({
                        supplierId: supplier.id,
                        productIds: [item.productId],
                        mode: "append",
                    });
                    if (productRes.code !== 200) {
                        throw new Error(productRes.msg || "关联供应商产品失败");
                    }
                }
                if (!ids.includes(supplier.id)) ids.push(supplier.id);
            }
            if (item === form && form.supplierId !== ids[0]) {
                skipSupplierClear.value = true;
            }
            updateSupplierSelection(item, ids);
        }
        return true;
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "新增供应商失败");
        return false;
    }
};

const confirmCreateOrder = async () => {
    if (form.purchaseChannel === "taobao") {
        const error = platformOrderNosError(form.platformOrderNos);
        if (error) { ElMessage.warning(error); return; }
    }
    if (form.purchaseChannel === "other") {
        const manual = waybills.value.filter((item) => item.source !== "taobao");
        if (manual.some((item) => !item.trackingNo.trim() || !item.courierCompany.trim())) {
            ElMessage.warning("请为已添加的运单填写运单号和快递公司");
            return;
        }
    }
    if (!form.productId) {
        ElMessage.warning("请选择采购产品");
        return;
    }

    if (!form.purchaseDate) {
        ElMessage.warning("请选择采购日期");
        return;
    }

    for (const item of purchaseItems.value) {
        const label = item.productCode || item.productModel || item.productName;
        if (!Number.isFinite(item.purchaseQuantity) || item.purchaseQuantity <= 0) {
            ElMessage.warning(`产品 ${label} 的采购数量必须大于0`);
            return;
        }
        const priceError = getPurchaseUnitPriceError(item.unitPrice);
        if (priceError) {
            ElMessage.warning(`产品 ${label}：${priceError}`);
            return;
        }
        if (calculatePurchaseItemAmount(item.purchaseQuantity, item.unitPrice) === null) {
            ElMessage.warning(`产品 ${label} 的金额超出允许范围`);
            return;
        }
    }
    if (totalAmount.value === null) {
        ElMessage.warning("采购单总金额超出允许范围");
        return;
    }

    const supplierReady = await ensureSupplier();
    if (!supplierReady) {
        return;
    }

    emit("confirm", {
        form: {
            ...form,
            purchaseQuantity: Number(form.purchaseQuantity),
        },
        relatedOrders: relatedOrders.value.map((order) => ({ ...order })),
        waybills: waybills.value.map((waybill) => ({ ...waybill })),
        items: purchaseItems.value.map((item) => ({
            productId: item.productId,
            quantity: Number(item.purchaseQuantity),
            unitPrice: item.unitPrice,
            remark: item.remark,
            unitId: item.unitId,
            supplierId: item.supplierId || form.supplierId,
            supplierIds: item.supplierIds.length ? [...item.supplierIds] : [...form.supplierIds],
            allocations: item.relatedOrders.map((order) => ({
                requirementId: order.requirementId || order.id,
                allocatedQuantity: Number(order.allocatedQuantity || 0),
            })),
        })),
    });
};

const hydrateInitial = async () => {
    isInitialReady.value = false;
    if (props.initialOrder) {
        assignInitialOrder(props.initialOrder);
    } else {
        assignInitialDraft(props.initialDraft);
        applyDefaultBuyer();
        applyDefaultPurchaseDate();
    }
    await nextTick();
    isInitialReady.value = true;
};

onMounted(async () => {
    await loadUnitOptions();
    await hydrateInitial();
});

watch(() => props.initialOrder, () => {
    void hydrateInitial();
});

watch(() => props.initialDraft, () => {
    void hydrateInitial();
});

watch(() => form.supplierId, (id, oldId) => {
    if (!isInitialReady.value || id === oldId) {
        return;
    }

    if (skipSupplierClear.value) {
        skipSupplierClear.value = false;
        return;
    }

    if (oldId || selectedProduct.value) {
        clearSelectedProduct();
    }
});

watch(currentBuyerName, () => {
    applyDefaultBuyer();
});
</script>

<style scoped>
.section-actions {
    display: flex;
    align-items: center;
}
.form-section h3 {
    margin: 0;
}

.purchase-form-row > span {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    white-space: nowrap;
}

.purchase-form-row i {
    color: #ff4d4f;
    font-style: normal;
}

.historical-amount {
    margin: 10px 0 0;
    color: var(--erp-color-text-secondary);
    font-size: 12px;
}

.purchase-item-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--erp-spacing-16);
    margin-top: var(--erp-spacing-16);
    padding-top: var(--erp-spacing-16);
    border-top: 1px solid var(--erp-color-border-muted);
}

.purchase-item-row strong {
    grid-column: 1 / -1;
}

.purchase-item-row label {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: var(--erp-spacing-8);
}

.purchase-item-row i {
    color: #ff4d4f;
    font-style: normal;
}

.purchase-item-row input {
    width: 100%;
    min-width: 0;
    height: var(--erp-size-control-height-sm);
    box-sizing: border-box;
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
}

.purchase-item-row input[readonly] {
    background: var(--erp-color-fill-disabled);
}

.purchase-form-row input::placeholder {
    color: var(--purchase-order-muted, #b3b3b3);
}

.purchase-form-row select {
    appearance: auto;
}

.purchase-form-row :deep(.searchable-select) {
    --searchable-select-height: 32px;
    --searchable-select-border: #cfcfcf;
    --searchable-select-radius: 6px;
    --searchable-select-font-size: 14px;
    --searchable-select-active-border: var(--purchase-order-blue, #3dabee);

    width: 100%;
}

.purchase-form-row :deep(.searchable-select-input) {
    padding: 0 30px 0 10px;
}

.supplier-field {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 8px;
    align-items: center;
}

.supplier-field small {
    color: var(--purchase-order-muted, #b3b3b3);
    font-size: 12px;
    line-height: 32px;
    white-space: nowrap;
}

.purchase-form-row :deep(.inventory-date-picker) {
    width: 100%;
    max-width: none;
    flex: 1 1 auto;
}

.purchase-form-row :deep(.date-trigger) {
    height: 32px;
    padding: 0 10px;
    border-color: #cfcfcf;
    border-radius: 6px;
    font-size: 14px;
}

.purchase-form-row :deep(.date-trigger-icon) {
    order: 2;
    width: 14px;
    height: 14px;
    margin-left: auto;
}

.product-select-field {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 64px;
    gap: 8px;
    align-items: center;
}

.select-product-button {
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    color: #ffffff;
    background: var(--purchase-order-blue, #3dabee);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
}

.select-product-button :deep(svg) {
    width: 13px;
    height: 13px;
}

.table-section {
    padding-top: 14px;
}

.section-actions {
    justify-content: space-between;
    height: 30px;
    margin: 0 6px 8px;
}

.text-button,
.danger-text-button {
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 0 6px;
    border: 0;
    background: transparent;
    font-size: 14px;
    cursor: pointer;
}

.text-button {
    color: var(--purchase-order-blue, #3dabee);
}

.danger-text-button,
.icon-button.delete {
    color: #ff4d4f;
}

.button-icon {
    width: 16px;
    height: 16px;
}

.dialog-table {
    height: 106px;
    overflow: auto;
}

.dialog-table-row {
    display: grid;
    align-items: center;
}

.dialog-table-row > div {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 0 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dialog-table-head {
    height: 32px;
    border-radius: 6px;
    background: var(--purchase-order-table-bg, #e6edf5);
    font-size: 14px;
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 1;
}

.dialog-table-data {
    height: 44px;
    background: #ffffff;
    font-size: 14px;
    overflow: auto;
}

.dialog-table-data > div {
    height: 32px;
}

.mini-number-input {
    width: 72px;
    height: 28px;
    padding: 0 4px;
    border: 1px solid #d9d9d9;
    border-radius: 6px;
    text-align: center;
    outline: 0;
    font-size: 14px;
}


.icon-button {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
}

.dialog-button {
    width: 72px;
    height: 32px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
}

.dialog-button.cancel {
    border: 1px solid #d9d9d9;
    color: var(--purchase-order-muted, #b3b3b3);
    background: #ffffff;
}

.dialog-button.confirm {
    border: 0;
    color: #ffffff;
    background: var(--purchase-order-blue, #3dabee);
}

.order-picker-mask {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 56%);
}

.order-picker-dialog {
    width: min(1170px, calc(100vw - 46px));
    height: min(456px, calc(100vh - 48px));
    min-height: 360px;
    display: grid;
    grid-template-rows: 40px 34px minmax(0, 1fr) 46px;
    gap: 10px;
    padding: 12px 16px 14px;
    border-radius: 6px;
    color: var(--purchase-order-text, #262626);
    background: #ffffff;
    box-shadow: 0 16px 36px rgb(0 0 0 / 16%);
}

.order-picker-header,
.order-picker-filter-row,
.order-filter-field {
    display: flex;
    align-items: center;
}

.order-picker-header {
    justify-content: space-between;
}

.order-picker-header h2 {
    margin: 0;
    color: var(--purchase-order-text, #262626);
    font-size: 18px;
    font-weight: 600;
}

.order-picker-filter-row {
    gap: 14px;
}

.order-filter-field {
    gap: 10px;
    color: var(--purchase-order-text, #262626);
    font-size: 14px;
}

.order-filter-field span {
    white-space: nowrap;
}

.order-filter-field select {
    width: 160px;
    height: 26px;
    padding: 0 10px;
    border: 1px solid #cfcfcf;
    border-radius: 8px;
    color: var(--purchase-order-text, #262626);
    background: #ffffff;
    outline: 0;
    font-size: 14px;
}

.order-filter-field :deep(.searchable-select) {
    --searchable-select-height: 26px;
    --searchable-select-border: #cfcfcf;
    --searchable-select-radius: 8px;
    --searchable-select-font-size: 14px;
    --searchable-select-active-border: var(--purchase-order-blue, #3dabee);

    width: 160px;
}

.order-filter-field :deep(.searchable-select-input) {
    padding: 0 30px 0 10px;
}

.order-outline-button,
.order-muted-button {
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
}

.order-outline-button {
    border: 1px solid #cfcfcf;
    color: var(--purchase-order-text, #262626);
    background: #ffffff;
}

.order-muted-button {
    border: 0;
    color: #ffffff;
    background: #d6dce6;
}

.order-muted-button.active {
    background: var(--purchase-order-blue, #3dabee);
}

.order-outline-button .button-icon,
.order-muted-button .button-icon {
    width: 18px;
    height: 18px;
}

.order-search-box {
    width: 320px;
    height: 32px;
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    padding: 4px 4px 4px 10px;
    border-radius: 10px;
    background: #f8fbff;
}

.order-search-icon {
    width: 18px;
    height: 18px;
    color: var(--purchase-order-muted, #b3b3b3);
}

.order-search-box input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    color: var(--purchase-order-text, #262626);
    background: transparent;
    font-size: 14px;
}

.order-search-box input::placeholder {
    color: var(--purchase-order-muted, #b3b3b3);
}

.order-search-button {
    width: 60px;
    height: 24px;
    border: 0;
    border-radius: 8px;
    color: #ffffff;
    background: var(--purchase-order-blue, #3dabee);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
}

.order-picker-row {
    min-width: 720px;
    display: grid;
    align-items: center;
}

.order-picker-row > div,
.order-picker-row > span {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 0 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.order-picker-head {
    height: 36px;
    border-radius: 6px;
    background: var(--purchase-order-table-bg, #e6edf5);
    font-size: 14px;
    font-weight: 600;
    position: sticky;
    top: 0;
    z-index: 2;
}

.order-picker-data {
    height: 48px;
    margin-top: 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: #ffffff;
    font-size: 14px;
    cursor: pointer;
}

.order-picker-data.selected {
    border-color: #7bc9ff;
}

.order-picker-select-cell {
    display: flex;
    align-items: center;
    justify-content: center;
}

.row-checkbox {
    width: 16px;
    height: 16px;
    accent-color: var(--purchase-order-blue, #3dabee);
    cursor: pointer;
}

.order-picker-empty {
    height: 72px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--purchase-order-muted, #b3b3b3);
    font-size: 14px;
}

.waybill-create-mask {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 56%);
}

.waybill-create-dialog {
    width: min(538px, calc(100vw - 24px));
    min-height: 448px;
    display: grid;
    grid-template-rows: 44px minmax(0, 1fr) 48px;
    padding: 14px 16px;
    border-radius: 6px;
    color: var(--purchase-order-text, #262626);
    background: #ffffff;
    box-shadow: 0 16px 36px rgb(0 0 0 / 16%);
}

.waybill-create-body {
    display: grid;
    align-content: start;
    gap: 28px;
    padding-top: 38px;
}

.waybill-form-row {
    width: min(332px, 100%);
    min-height: 32px;
    display: grid;
    grid-template-columns: 78px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    margin: 0 auto;
    color: var(--purchase-order-text, #262626);
    font-size: 14px;
}

.waybill-form-row > span {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    white-space: nowrap;
}

.waybill-form-row i {
    color: #ff4d4f;
    font-style: normal;
}

.waybill-form-row input,
.waybill-form-row select,
.waybill-form-row textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid #cfcfcf;
    border-radius: 6px;
    color: var(--purchase-order-text, #262626);
    background: #ffffff;
    outline: 0;
    font-size: 14px;
}

.waybill-form-row input,
.waybill-form-row select {
    height: 32px;
    padding: 0 10px;
}

.waybill-form-row :deep(.searchable-select) {
    --searchable-select-height: 32px;
    --searchable-select-border: #cfcfcf;
    --searchable-select-radius: 6px;
    --searchable-select-font-size: 14px;
    --searchable-select-active-border: var(--purchase-order-blue, #3dabee);

    width: 100%;
}

.waybill-form-row :deep(.searchable-select-input) {
    padding: 0 30px 0 10px;
}

.waybill-form-row.textarea-row {
    align-items: start;
}

.waybill-form-row textarea {
    height: 126px;
    padding: 8px 10px;
    resize: none;
    line-height: 1.5;
}

.purchase-order-dialog {
    width: 1240px;
    height: 760px;
    grid-template-rows: 52px minmax(0, 1fr) 64px;
    gap: 0;
    padding: 0;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-dialog);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    box-shadow: none;
}

.purchase-order-dialog :deep(.erp-dialog-frame__body) {
    display: block;
    padding: var(--erp-spacing-20);
}

.purchase-order-dialog .dialog-body {
    min-height: 0;
    display: grid;
    grid-template-rows: auto auto auto;
    gap: var(--erp-spacing-20);
    padding: 0;
    overflow: visible;
}

.purchase-order-dialog .form-section {
    min-width: 0;
    padding: var(--erp-spacing-20);
    border-color: var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.purchase-order-dialog .form-section h3 {
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.purchase-order-dialog .purchase-form-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--erp-spacing-20);
    align-items: center;
    margin-top: var(--erp-spacing-20);
    padding: 0;
}

.purchase-order-dialog .purchase-form-row {
    min-width: 0;
    height: var(--erp-size-control-height-sm);
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
}

.purchase-order-dialog .purchase-form-row input {
    width: 100%;
    min-width: 0;
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    outline: 0;
    font-size: var(--erp-typography-content1-font-size);
}

.purchase-order-dialog .purchase-form-row input[readonly] {
    border-color: var(--erp-color-border-muted);
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

.purchase-order-dialog .purchase-form-row :deep(.searchable-select) {
    --searchable-select-height: var(--erp-size-control-height-sm);
    --searchable-select-border: var(--erp-color-border-default);
    --searchable-select-radius: var(--erp-radius-control-default);
    --searchable-select-font-size: var(--erp-typography-content1-font-size);
    --searchable-select-active-border: var(--erp-color-border-brand);
}

.purchase-order-dialog .purchase-form-row :deep(.inventory-date-picker) {
    width: 100%;
}

.purchase-order-dialog .purchase-form-row :deep(.date-trigger) {
    border-color: var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
}

.purchase-order-dialog .select-product-button {
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-action-primary);
    font-weight: var(--erp-typography-title3-font-weight);
}

.purchase-order-dialog .table-section {
    display: grid;
    grid-template-rows: var(--erp-size-control-height-sm) auto;
    row-gap: var(--erp-spacing-12);
    padding-top: var(--erp-spacing-20);
}

.purchase-order-dialog .section-actions {
    height: var(--erp-size-control-height-sm);
    margin: 0;
}

.purchase-order-dialog .text-button,
.purchase-order-dialog .danger-text-button {
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-content1-font-size);
}

.purchase-order-dialog .text-button {
    color: var(--erp-color-text-brand);
}

.purchase-order-dialog .dialog-table {
    height: auto;
    overflow: hidden;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
}

.purchase-order-dialog .dialog-table-row {
    grid-template-columns: var(--erp-table-columns);
}

.purchase-order-dialog .dialog-table-row > div {
    padding: 0 var(--erp-spacing-12);
}

.purchase-order-dialog .dialog-table-head {
    height: 48px;
    border-radius: 0;
    background: var(--erp-color-fill-table-header);
    font-size: var(--erp-typography-content1-font-size);
}

.purchase-order-dialog .dialog-table-data {
    height: 48px;
    overflow: visible;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
}

.purchase-order-dialog .dialog-table-data > div {
    height: 48px;
}

.purchase-order-dialog .mini-number-input {
    height: var(--erp-size-control-height-sm);
    border-color: var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
}

.purchase-order-dialog .icon-button.delete,
.purchase-order-dialog .danger-text-button {
    color: var(--erp-color-icon-error);
}

.order-picker-mask,
.waybill-create-mask {
    background: var(--erp-color-bg-overlay);
}

.order-picker-dialog {
    width: 1080px;
    height: 600px;
    grid-template-rows: 52px minmax(0, 1fr) 64px;
    gap: 0;
    padding: 0;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-dialog);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    box-shadow: none;
}

.order-picker-dialog :deep(.erp-dialog-frame__body) {
    display: grid;
    grid-template-rows: 32px minmax(0, 1fr);
    align-content: stretch;
    gap: var(--erp-spacing-12);
    padding: var(--erp-spacing-20);
}

.order-picker-dialog .order-picker-filter-row {
    gap: var(--erp-spacing-12);
}

.order-picker-dialog .order-filter-field {
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
}

.order-picker-dialog .order-filter-field :deep(.searchable-select) {
    --searchable-select-height: var(--erp-size-control-height-sm);
    --searchable-select-border: var(--erp-color-border-default);
    --searchable-select-radius: var(--erp-radius-control-default);
    --searchable-select-font-size: var(--erp-typography-content1-font-size);
    --searchable-select-active-border: var(--erp-color-border-brand);

    width: 200px;
}

.order-picker-dialog .order-outline-button,
.order-picker-dialog .order-muted-button {
    height: var(--erp-size-control-height-sm);
    gap: 6px;
    padding: 0 var(--erp-spacing-12);
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
}

.order-picker-dialog .order-outline-button {
    border-color: var(--erp-color-border-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
}

.order-picker-dialog .order-muted-button {
    background: var(--erp-color-neutral-400);
}

.order-picker-dialog .order-muted-button.active {
    background: var(--erp-color-action-primary);
}

.order-picker-dialog .order-search-box {
    height: var(--erp-size-control-height-sm);
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-fill-control-secondary);
}

.order-picker-dialog .order-search-button {
    height: 24px;
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-action-primary);
}

.order-picker-dialog .order-picker-table {
    min-height: 0;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
}

.order-picker-dialog .order-picker-row {
    width: 100%;
    min-width: 0;
    grid-template-columns: var(--erp-table-columns);
}

.order-picker-dialog .order-picker-head {
    height: 48px;
    border-radius: 0;
    background: var(--erp-color-fill-table-header);
    font-size: var(--erp-typography-content1-font-size);
}

.order-picker-dialog .order-picker-data {
    height: 64px;
    margin-top: 0;
    border: 0;
    border-bottom: 1px solid var(--erp-color-divider-default);
    border-radius: 0;
    font-size: var(--erp-typography-content1-font-size);
}

.order-picker-dialog .order-picker-data.selected {
    border-color: var(--erp-color-border-brand);
    background: var(--erp-color-fill-nav-selected);
}

/* Keep the order picker aligned with the purchase request screens. */
.order-picker-mask {
    background: rgb(22 34 48 / 42%);
}

.order-picker-dialog {
    width: min(1120px, calc(100vw - 48px));
    height: min(620px, calc(100vh - 48px));
    border-color: #e0e6ec;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 18px 46px rgb(31 45 61 / 16%);
}

.order-picker-dialog :deep(.erp-dialog-frame__header) {
    min-height: 56px;
    padding: 0 18px;
    border-bottom-color: #edf0f3;
}

.order-picker-dialog :deep(.erp-dialog-frame__title) {
    color: #303944;
    font-size: 16px;
    font-weight: 600;
}

.order-picker-dialog :deep(.erp-dialog-frame__body) {
    grid-template-rows: 40px minmax(0, 1fr);
    gap: 12px;
    padding: 16px;
    background: #f8fafc;
}

.order-picker-dialog .order-picker-filter-row {
    gap: 10px;
    padding: 4px 0;
}

.order-picker-dialog .order-filter-field {
    gap: 8px;
    color: #414a55;
    font-size: 13px;
}

.order-picker-dialog .order-filter-field :deep(.searchable-select) {
    --searchable-select-height: 32px;
    --searchable-select-border: #dfe4ea;
    --searchable-select-radius: 5px;
    --searchable-select-font-size: 13px;
    width: 190px;
}

.order-picker-dialog .order-outline-button,
.order-picker-dialog .order-muted-button {
    height: 32px;
    padding: 0 10px;
    border-radius: 5px;
    font-size: 13px;
}

.order-picker-dialog .order-outline-button {
    border-color: #d9e0e7;
    color: #59636f;
}

.order-picker-dialog .order-muted-button {
    background: #c9d2dc;
}

.order-picker-dialog .order-muted-button.active {
    background: #3da9e9;
}

.order-picker-dialog .order-search-box {
    height: 32px;
    border: 1px solid #e1e7ed;
    border-radius: 5px;
    background: #ffffff;
}

.order-picker-dialog .order-search-button {
    height: 26px;
    border-radius: 4px;
    background: #3da9e9;
}

.order-picker-dialog .order-picker-table {
    border-color: #e1e7ed;
    border-radius: 6px;
    background: #ffffff;
}

.order-picker-dialog .order-picker-head {
    height: 46px;
    color: #39434e;
    background: #f1f5f9;
    font-size: 13px;
    font-weight: 600;
}

.order-picker-dialog .order-picker-data {
    height: 62px;
    color: #4e5964;
    border-bottom-color: #edf0f3;
    font-size: 13px;
}

.order-picker-dialog .order-picker-data:hover,
.order-picker-dialog .order-picker-data.selected {
    background: #f1faff;
}

.order-picker-dialog :deep(.erp-dialog-frame__actions) {
    min-height: 64px;
    padding: 12px 16px;
    border-top-color: #edf0f3;
}

.order-picker-dialog :deep(.dialog-button) {
    width: 92px;
    height: 34px;
    border-radius: 5px;
    font-size: 13px;
}

.order-picker-dialog :deep(.dialog-button.confirm) {
    border-color: #3da9e9;
    background: #3da9e9;
}

@media (max-width: 760px) {
    .order-picker-dialog {
        width: calc(100vw - 24px);
        height: calc(100vh - 24px);
    }

    .order-picker-dialog .order-picker-filter-row {
        flex-wrap: wrap;
        height: auto;
    }

    .order-picker-dialog :deep(.erp-dialog-frame__body) {
        grid-template-rows: auto minmax(0, 1fr);
        padding: 12px;
    }
}

.waybill-create-dialog {
    width: 600px;
    height: 480px;
    grid-template-rows: 52px minmax(0, 1fr) 64px;
    padding: 0;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-dialog);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    box-shadow: none;
}

.waybill-create-dialog :deep(.erp-dialog-frame__body) {
    display: block;
    padding: var(--erp-spacing-20);
}

.waybill-create-dialog .waybill-create-body {
    gap: var(--erp-spacing-12);
    padding: 0;
}

.waybill-create-dialog .waybill-form-row {
    width: 384px;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
}

.waybill-create-dialog .waybill-form-row input,
.waybill-create-dialog .waybill-form-row textarea {
    border-color: var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
}

.waybill-create-dialog .waybill-form-row :deep(.searchable-select) {
    --searchable-select-height: var(--erp-size-control-height-sm);
    --searchable-select-border: var(--erp-color-border-default);
    --searchable-select-radius: var(--erp-radius-control-default);
    --searchable-select-font-size: var(--erp-typography-content1-font-size);
    --searchable-select-active-border: var(--erp-color-border-brand);
}

.waybill-create-dialog .waybill-form-row textarea {
    height: 96px;
    padding: var(--erp-spacing-8);
}
</style>
