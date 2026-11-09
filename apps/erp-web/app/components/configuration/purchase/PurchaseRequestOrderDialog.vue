<template>
    <div class="erp-dialog-mask" @click.self="closeDialog">
        <ErpDialogFrame
            class="request-order-dialog"
            :title="mode === 'edit' ? '编辑采购单' : '新建采购单'"
            width="1280px"
            height="760px"
            @close="closeDialog"
            @submit.prevent="submitOrder"
        >
            <div class="request-order-body">
                <div v-if="fullyAllocatedRequestNos.length" class="fully-allocated-warning">
                    <Icon name="lucide:triangle-alert" />
                    <span>采购申请 {{ fullyAllocatedRequestNos.join("、") }} 已全部分配，不能再合并生成采购单，请返回列表取消勾选。</span>
                </div>
                <PurchaseChannelFields
                    v-model:purchase-channel="purchaseChannel"
                    :platform-order-nos="mergedOrderNos"
                    :show-order-nos-input="false"
                    :allow-unset="Boolean(initialOrder && !initialOrder.purchaseChannel)"
                />
                <section class="basic-card">
                    <h3>基本信息</h3>
                    <div class="basic-grid">
                        <label>
                            <span>采购单号<i>*</i></span>
                            <input :value="initialOrder?.orderNo || '保存后自动生成'" disabled>
                        </label>
                        <label>
                            <span>采购日期<i>*</i></span>
                            <InventoryDatePicker v-model="purchaseDate" aria-label-text="采购日期" />
                        </label>
                        <label>
                            <span>备注</span>
                            <input v-model.trim="remark" type="text">
                        </label>
                    </div>
                </section>

                <section class="product-card">
                    <div class="section-toolbar">
                        <button class="text-action" type="button" @click="showProductPicker = true">
                            <Icon name="lucide:plus" />
                            <span>选择产品</span>
                        </button>
                        <button class="danger-action" type="button" @click="lines = []">
                            <Icon name="lucide:trash-2" />
                            <span>清空</span>
                        </button>
                    </div>
                    <div class="product-table-scroll">
                        <div class="product-table">
                            <div class="product-row product-head">
                                <div>产品编号</div>
                                <div>型号</div>
                                <div>供应商</div>
                                <div>分类</div>
                                <div>产品图片</div>
                                <div>分配</div>
                                <div>运单</div>
                                <div>淘宝订单号</div>
                                <div>采购数量</div>
                                <div>单位</div>
                                <div>单价（人民币）<i>*</i></div>
                                <div>备注</div>
                                <div>总金额（人民币）</div>
                                <div>操作</div>
                            </div>
                            <div v-if="lines.length === 0" class="empty-row">暂未选择产品</div>
                            <div v-for="line in lines" :key="line.productId" class="product-row product-data">
                                <div :title="line.productCode">{{ line.productCode || "--" }}</div>
                                <div :title="line.productModel">{{ line.productModel || "--" }}</div>
                                <div class="link-cell">
                                    <span :title="line.suppliers.map((supplier) => supplier.supplierName).join('、')">
                                        {{ line.suppliers.map((supplier) => supplier.supplierName).join("、") || "请选择" }}
                                    </span>
                                    <button type="button" @click="openSupplierPicker(line)">
                                        {{ line.supplierId ? "更换" : "选择" }}
                                    </button>
                                </div>
                                <div :title="line.category">{{ line.category || "--" }}</div>
                                <div class="image-cell">
                                    <img v-if="line.image" :src="resolveErpImageUrl(line.image)" :alt="line.productModel">
                                    <Icon v-else name="lucide:image" />
                                </div>
                                <div class="stack-cell">
                                    <span v-for="allocation in line.allocations" :key="allocationKey(allocation)">
                                        {{ allocation.purchaseRequestNo }} - {{ formatQuantity(allocation.allocatedQuantity) }}
                                    </span>
                                    <button type="button" @click="openAllocationPicker(line)">添加</button>
                                </div>
                                <div class="stack-cell">
                                    <span v-if="purchaseChannel === 'other' && !line.waybills.length">待补录</span>
                                    <span v-for="waybill in line.waybills" :key="waybill.trackingNo" class="waybill-chip">
                                        {{ waybill.courierCompany }}：{{ waybill.trackingNo }}
                                        <button type="button" title="删除运单" @click="removeWaybill(line, waybill.trackingNo)">×</button>
                                    </span>
                                    <button type="button" @click="openWaybillDialog(line)">添加</button>
                                </div>
                                <div class="stack-cell">
                                    <template v-if="purchaseChannel === 'taobao'">
                                        <span v-for="orderNo in line.platformOrderNos" :key="orderNo" class="waybill-chip">
                                            {{ orderNo }}
                                            <button type="button" title="删除淘宝订单号" @click="removePlatformOrderNo(line, orderNo)">×</button>
                                        </span>
                                        <button type="button" @click="openOrderNoDialog(line)">添加</button>
                                    </template>
                                    <span v-else>--</span>
                                </div>
                                <div>
                                    <input v-model.number="line.quantity" class="number-input" type="number" min="0.001" step="0.001">
                                </div>
                                <div>{{ line.unitName || "--" }}</div>
                                <div>
                                    <input v-model="line.unitPrice" class="amount-input" type="number" min="0.001" step="0.001" required placeholder="必填" :aria-label="`${line.productCode}单价`">
                                </div>
                                <div>
                                    <input v-model.trim="line.remark" class="remark-input" type="text" :aria-label="`${line.productCode}产品备注`">
                                </div>
                                <div class="amount-cell">
                                    <input :value="formatLineAmount(line)" class="amount-input" type="text" readonly :aria-label="`${line.productCode}总金额`">
                                    <small v-if="line.unitPrice === '' && line.originalAmount !== undefined">原金额：{{ line.originalAmount.toFixed(2) }}</small>
                                </div>
                                <div class="operation-cell">
                                    <button type="button" title="删除" @click="removeLine(line.productId)">
                                        <Icon name="lucide:trash-2" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>

            <template #footer>
                <button class="dialog-button cancel" type="button" :disabled="submitting" @click="closeDialog">取消</button>
                <button class="dialog-button confirm" type="submit" :disabled="submitting">
                    {{ submitting ? "保存中..." : "确认" }}
                </button>
            </template>
        </ErpDialogFrame>

        <ProductPickerDialog
            v-if="showProductPicker"
            selection-mode="multiple"
            :columns="productPickerColumns"
            :selected-product-ids="selectedProductCodes"
            :selected-products="selectedPickerProducts"
            @close="showProductPicker = false"
            @confirm="confirmProducts"
        />

        <Teleport to="body">
            <div v-if="showSupplierPicker" class="erp-app erp-dialog-mask nested-mask" @click.self="closeSupplierPicker">
                <ErpDialogFrame class="supplier-picker" title="选择供应商" width="900px" height="560px" :form="false" :close-disabled="supplierSaving" @close="closeSupplierPicker">
                    <div class="picker-toolbar">
                        <button v-if="canWriteSupplier" class="primary-small" type="button" :disabled="supplierLoading || supplierSaving" @click="showSupplierCreate = true">
                            <Icon name="lucide:circle-plus" />新建
                        </button>
                        <div class="supplier-scope-toggle">
                            <el-switch v-model="showAllSuppliers" aria-label="显示所有供应商" :disabled="supplierSaving" @change="searchSuppliers" />
                            <span>显示所有供应商</span>
                        </div>
                        <input v-model.trim="supplierKeyword" placeholder="输入供应商名称" :disabled="supplierSaving" @keyup.enter="searchSuppliers">
                        <button class="filter-small" type="button" :disabled="supplierSaving" @click="searchSuppliers">搜索</button>
                    </div>
                    <div class="simple-table">
                        <div class="simple-row simple-head supplier-row">
                            <div>
                                <input type="checkbox" :checked="allPageSuppliersSelected" :indeterminate="somePageSuppliersSelected && !allPageSuppliersSelected" :disabled="supplierLoading || supplierSaving || !suppliers.length" aria-label="全选本页供应商" @change="togglePageSuppliers">
                            </div>
                            <div>供应商编号</div><div>供应商名称</div><div>产品编号</div><div>产品图片</div>
                        </div>
                        <label v-for="supplier in suppliers" :key="supplier._id" class="simple-row supplier-row">
                            <div><input type="checkbox" :checked="selectedSuppliers.some((item) => item._id === supplier._id)" :disabled="supplierSaving || !supplier._id" :aria-label="`选择供应商${supplier.name}`" @change="toggleSupplier(supplier)"></div>
                            <div>{{ supplier.code }}</div><div>{{ supplier.name }}</div>
                            <div class="supplier-product-codes">
                                <span v-for="product in supplier.products || []" :key="product.productId">{{ product.code || "--" }}</span>
                                <span v-if="!supplier.products?.length">--</span>
                            </div>
                            <div class="supplier-product-images">
                                <template v-if="supplier.products?.length">
                                    <template v-for="product in supplier.products" :key="product.productId">
                                        <img v-if="product.image" :src="resolveErpImageUrl(product.image)" :alt="product.code">
                                        <Icon v-else name="lucide:image" />
                                    </template>
                                </template>
                                <span v-else>--</span>
                            </div>
                        </label>
                        <div v-if="supplierLoading" class="simple-empty">加载中...</div>
                        <div v-else-if="suppliers.length === 0" class="simple-empty">暂无供应商</div>
                    </div>
                    <fieldset class="supplier-pagination" :disabled="supplierSaving">
                        <InventoryPagination
                            v-model:jump-page-input="supplierJumpPageInput"
                            :page-size="supplierPageSize"
                            :total="supplierTotalItems"
                            :page-size-options="supplierPageSizeOptions"
                            :page-numbers="supplierPageNumbers"
                            :total-pages="supplierTotalPages"
                            :current-page="supplierCurrentPage"
                            @update:page-size="changeSupplierPageSize"
                            @page-change="changeSupplierPage"
                            @jump="jumpSupplierPage"
                        />
                    </fieldset>
                    <template #footer>
                        <span class="supplier-selection-count">已选 {{ selectedSuppliers.length }} 家</span>
                        <button class="dialog-button cancel" type="button" :disabled="supplierSaving" @click="closeSupplierPicker">取消</button>
                        <button class="dialog-button confirm" type="button" :disabled="supplierLoading || supplierSaving || !selectedSuppliers.length" @click="confirmSupplier">
                            {{ supplierSaving ? "处理中..." : "确认" }}
                        </button>
                    </template>
                </ErpDialogFrame>
            </div>
        </Teleport>

        <Teleport to="body">
            <SupplierDialog
                v-if="canWriteSupplier"
                v-model="showSupplierCreate"
                :mask-z-index="2200"
                mode="create"
                @submit="createSupplier"
            />
        </Teleport>

        <div v-if="showAllocationPicker" class="erp-dialog-mask nested-mask" @click.self="showAllocationPicker = false">
            <ErpDialogFrame class="allocation-picker" title="选择申请单" width="960px" height="600px" :form="false" @close="showAllocationPicker = false">
                <div class="picker-toolbar right-search">
                    <input v-model.trim="candidateKeyword" placeholder="搜索申请编号或销售订单号" @keyup.enter="loadCandidates">
                    <button class="filter-small" type="button" @click="loadCandidates">搜索</button>
                </div>
                <div class="simple-table">
                    <div class="simple-row allocation-row simple-head">
                        <div></div><div>申请编号</div><div>销售订单号</div><div>申请数量</div><div>已分配</div><div>剩余数量</div><div>分配数量</div><div>单位</div>
                    </div>
                    <div v-for="candidate in candidates" :key="allocationKey(candidate)" class="simple-row allocation-row">
                        <div><input v-model="selectedCandidateKeys" type="checkbox" :value="allocationKey(candidate)"></div>
                        <div>{{ candidate.purchaseRequestNo }}</div><div>{{ candidate.salesOrderNo || "--" }}</div>
                        <div>{{ formatQuantity(candidate.requestedQuantity) }}</div><div>{{ formatQuantity(candidate.allocatedQuantity) }}</div>
                        <div>{{ formatQuantity(candidate.remainingQuantity) }}</div>
                        <div><input v-model.number="candidate.nextAllocatedQuantity" class="mini-input" type="number" min="0.001" :max="candidate.remainingQuantity" step="0.001"></div>
                        <div>{{ candidate.unitName || "--" }}</div>
                    </div>
                    <div v-if="candidates.length === 0" class="simple-empty">暂无可分配的已审批采购申请</div>
                </div>
                <template #footer>
                    <button class="dialog-button cancel" type="button" @click="showAllocationPicker = false">取消</button>
                    <button class="dialog-button confirm" type="button" @click="confirmAllocations">确认</button>
                </template>
            </ErpDialogFrame>
        </div>

        <div v-if="showWaybillDialog" class="erp-dialog-mask nested-mask" @click.self="showWaybillDialog = false">
            <ErpDialogFrame class="waybill-dialog" title="新建运单号" width="560px" height="360px" @close="showWaybillDialog = false" @submit.prevent="confirmWaybill">
                <div class="waybill-form">
                    <label><span>运单号<i>*</i></span><input v-model.trim="waybillForm.trackingNo" type="text"></label>
                    <label><span>快递公司<i>*</i></span><SearchableSelect v-model="waybillForm.courierCompany" :options="courierOptions" placeholder="请选择" /></label>
                    <label><span>备注</span><input v-model.trim="waybillForm.remark" type="text"></label>
                </div>
                <template #footer>
                    <button class="dialog-button cancel" type="button" @click="showWaybillDialog = false">取消</button>
                    <button class="dialog-button confirm" type="submit">确认</button>
                </template>
            </ErpDialogFrame>
        </div>

        <div v-if="showOrderNoDialog" class="erp-dialog-mask nested-mask" @click.self="showOrderNoDialog = false">
            <ErpDialogFrame class="waybill-dialog" title="淘宝订单号" width="560px" height="320px" @close="showOrderNoDialog = false" @submit.prevent="confirmOrderNos">
                <div class="waybill-form">
                    <label class="orderno-row">
                        <span>订单号<i>*</i></span>
                        <textarea
                            v-model="orderNoText"
                            rows="4"
                            placeholder="填写淘宝订单号，多个用换行或逗号分隔"
                            aria-label="淘宝订单号"
                        />
                    </label>
                </div>
                <template #footer>
                    <button class="dialog-button cancel" type="button" @click="showOrderNoDialog = false">取消</button>
                    <button class="dialog-button confirm" type="submit">确认</button>
                </template>
            </ErpDialogFrame>
        </div>
    </div>
</template>

<script setup lang="ts">
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ProductPickerDialog from "~/components/configuration/inventory/ProductPickerDialog.vue";
import type { ProductPickerColumn } from "~/components/configuration/inventory/ProductPickerDialog.vue";
import InventoryDatePicker from "~/components/configuration/inventory/InventoryDatePicker.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import SearchableSelect from "~/components/configuration/SearchableSelect.vue";
import SupplierDialog from "~/components/configuration/purchase/SupplierDialog.vue";
import PurchaseChannelFields from "~/components/configuration/purchase/PurchaseChannelFields.vue";
import type { PurchaseChannel } from "~~/shared/types/logistics";
import { parsePlatformOrderNos, platformOrderNosError } from "~~/shared/utils/logistics";
import {
    retrieveInventoryProducts,
    uploadInventoryAttachment,
} from "~/composables/api/useInventoryApi";
import {
    addPurchaseSupplier,
    retrievePurchaseSuppliers,
    savePurchaseSupplierProducts,
} from "~/composables/api/usePurchaseSupplierApi";
import { retrievePurchaseRequestOrderCandidates } from "~/composables/api/usePurchaseOrderApi";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import {
    normalizeProductPickerItem,
    type ProductPickerItem,
} from "~/composables/inventory/useInventoryProductPickerData";
import type { PurchaseRequestListItem } from "~/types/approval";
import { logisticsCompanyOptions } from "~/utils/logisticsCompanyOptions";
import { erpMessageBox } from "~/utils/erpMessageBox";
import type {
    PurchaseOrder,
    PurchaseOrderMutationPayload,
    PurchaseOrderSupplier,
    PurchaseOrderWaybill,
    PurchaseRequestOrderCandidate,
    PurchaseSupplier,
    PurchaseSupplierAttachment,
} from "~~/shared/types/purchase";
import type { PurchaseOrderDialogDraft } from "~~/shared/types/purchase";
import {
    calculatePurchaseItemAmount,
    getPurchaseUnitPriceError,
    sumPurchaseItemAmounts,
} from "~~/shared/utils/purchaseOrderAmount";
import { canAccessPurchaseSupplier, canReadPurchaseSupplier } from "~~/shared/utils/adminPermission";

type CandidateRow = PurchaseRequestOrderCandidate & { nextAllocatedQuantity: number };
type AllocationRow = Omit<PurchaseRequestOrderCandidate, "purchaseRequestItemIndex"> & {
    sourceType?: "sales-order" | "purchase-request";
    purchaseRequestItemIndex?: number;
    allocatedQuantity: number;
};
type ProductLine = {
    productId: string;
    productCode: string;
    productName: string;
    productModel: string;
    category: string;
    image: string;
    unitId: string;
    unitName: string;
    supplierId: string;
    supplierName: string;
    suppliers: PurchaseOrderSupplier[];
    quantity: number;
    unitPrice: number | string;
    remark: string;
    originalAmount?: number;
    allocations: AllocationRow[];
    waybills: PurchaseOrderWaybill[];
    platformOrderNos: string[];
};

const props = withDefaults(defineProps<{
    mode?: "create" | "edit";
    initialOrder?: PurchaseOrder | null;
    submitting?: boolean;
    selectedRequestIds?: string[];
    selectedRequests?: PurchaseRequestListItem[];
    initialDraft?: PurchaseOrderDialogDraft | null;
}>(), {
    mode: "create",
    initialOrder: null,
    submitting: false,
    selectedRequestIds: () => [],
    selectedRequests: () => [],
    initialDraft: null,
});
const emit = defineEmits<{
    close: [];
    confirm: [payload: PurchaseOrderMutationPayload];
}>();
const adminInfo = useState<{ role?: number | string }>("admin_info", () => ({}));
const canWriteSupplier = computed(() => canAccessPurchaseSupplier(Number(adminInfo.value.role)));

const today = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};
const purchaseDate = ref(props.initialOrder?.purchaseDate || today());
const purchaseChannel = ref<PurchaseChannel | "">(props.initialOrder ? props.initialOrder.purchaseChannel || "" : "taobao");
const mergedOrderNos = computed(() => [...new Set(lines.value.flatMap((line) => line.platformOrderNos))]);
const remark = ref(props.initialOrder?.remark || "");
const lines = ref<ProductLine[]>([]);
const showProductPicker = ref(false);
const selectedPickerProducts = ref<ProductPickerItem[]>([]);
const showSupplierPicker = ref(false);
const showSupplierCreate = ref(false);
const suppliers = ref<PurchaseSupplier[]>([]);
const supplierKeyword = ref("");
const supplierSearchKeyword = ref("");
const showAllSuppliers = ref(false);
const supplierLoading = ref(false);
const supplierSaving = ref(false);
const selectedSuppliers = ref<PurchaseSupplier[]>([]);
const allPageSuppliersSelected = computed(() => suppliers.value.length > 0
    && suppliers.value.every((supplier) => selectedSuppliers.value.some((item) => item._id === supplier._id)));
const somePageSuppliersSelected = computed(() => suppliers.value.some((supplier) =>
    selectedSuppliers.value.some((item) => item._id === supplier._id)));
let supplierRequestId = 0;
const {
    pageSizeOptions: supplierPageSizeOptions,
    pageSize: supplierPageSize,
    pageNumbers: supplierPageNumbers,
    totalPages: supplierTotalPages,
    currentPage: supplierCurrentPage,
    jumpPageInput: supplierJumpPageInput,
    totalItems: supplierTotalItems,
    setTotalItems: setSupplierTotalItems,
    goToPage: goToSupplierPage,
} = useInventoryPagination({ pageSizeOptions: [10, 20, 50], initialPageSize: 20 });
const activeLine = ref<ProductLine | null>(null);
const showAllocationPicker = ref(false);
const candidates = ref<CandidateRow[]>([]);
const candidateKeyword = ref("");
const selectedCandidateKeys = ref<string[]>([]);
const showWaybillDialog = ref(false);
const waybillForm = reactive({ trackingNo: "", courierCompany: "", remark: "" });
const showOrderNoDialog = ref(false);
const orderNoText = ref("");
const fullyAllocatedRequestNos = ref<string[]>([]);

const productPickerColumns: ProductPickerColumn[] = [
    { key: "id", label: "产品编号", width: 170 },
    { key: "model", label: "型号", width: 210 },
    { key: "category", label: "分类", width: 180 },
    { key: "image", label: "产品图片", width: 140 },
    { key: "unit", label: "单位", width: 100 },
];
const courierOptions = logisticsCompanyOptions.map((item: any) =>
    typeof item === "string" ? { label: item, value: item } : item,
);
const selectedProductCodes = computed(() => lines.value.map((line) => line.productCode).filter(Boolean));

const allocationKey = (item: Partial<PurchaseRequestOrderCandidate>) =>
    item.requirementId
        ? `requirement:${item.requirementId}`
        : `request:${item.purchaseRequestId || ""}:${item.purchaseRequestItemIndex ?? ""}`;
const formatQuantity = (value: unknown) => Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 3 });
const isInventoryProductId = (value: string) => /^[a-f\d]{24}$/i.test(value);
const formatLineAmount = (line: ProductLine) => {
    const amount = calculatePurchaseItemAmount(line.quantity, line.unitPrice);
    return amount === null ? "--" : amount.toFixed(2);
};

const initialSuppliers = (suppliers: PurchaseOrderSupplier[] | undefined, supplierId: string, supplierName: string): PurchaseOrderSupplier[] => {
    if (suppliers?.length) {
        return suppliers.map((supplier) => ({ ...supplier, supplierId: String(supplier.supplierId) }));
    }
    return supplierId ? [{ supplierId, supplierName }] : [];
};

const syncInitialOrder = () => {
    if (!props.initialOrder?.items?.length) return;
    const allocations = Array.isArray(props.initialOrder.allocations) ? props.initialOrder.allocations : [];
    lines.value = props.initialOrder.items.map((item, itemIndex) => {
        const productId = String(item.productId || "");
        const lineAllocations = allocations
            .filter((allocation: any) => String(allocation.productId || "") === productId)
            .map((allocation: any) => ({
                sourceType: allocation.requirementId ? "sales-order" as const : "purchase-request" as const,
                purchaseRequestId: String(allocation.purchaseRequestId || ""),
                purchaseRequestNo: allocation.purchaseRequestNo || "",
                purchaseRequestItemIndex: Number.isInteger(allocation.purchaseRequestItemIndex)
                    && allocation.purchaseRequestItemIndex >= 0
                    ? allocation.purchaseRequestItemIndex
                    : undefined,
                salesOrderNo: allocation.salesOrderNo || "",
                category: "",
                productId,
                requirementId: String(allocation.requirementId || ""),
                requestedQuantity: Number(allocation.allocatedQuantity || 0),
                allocatedQuantity: Number(allocation.allocatedQuantity || 0),
                remainingQuantity: 0,
                unitName: item.unitName || "",
            }));
        return {
            productId,
            productCode: item.productCode || "",
            productName: item.productName || "",
            productModel: item.productModel || "",
            category: "",
            image: "",
            unitId: String(item.unitId || ""),
            unitName: item.unitName || "",
            supplierId: String(item.supplierId || props.initialOrder?.supplierId || ""),
            supplierName: item.supplierName || props.initialOrder?.supplierName || "",
            suppliers: initialSuppliers(item.suppliers, String(item.supplierId || props.initialOrder?.supplierId || ""), item.supplierName || props.initialOrder?.supplierName || ""),
            quantity: Number(item.quantity || 0),
            unitPrice: item.unitPrice ?? "",
            remark: item.remark || "",
            originalAmount: typeof item.totalAmount === "number" && Number.isFinite(item.totalAmount)
                ? item.totalAmount
                : undefined,
            allocations: lineAllocations,
            waybills: (props.initialOrder?.waybills || []).filter((waybill) =>
                waybill.productIds?.length
                    ? waybill.productIds.map(String).includes(productId)
                    : itemIndex === 0,
            ),
            platformOrderNos: [...(item.platformOrderNos || [])],
        };
    });
    // 历史数据没有行级订单号：先按运单归属反推，仍无法归属的归到第一行，保证编辑保存不丢号。
    if (lines.value.length && lines.value.every((line) => !line.platformOrderNos.length)) {
        const legacyOrderNos = props.initialOrder.platformOrderNos || [];
        if (legacyOrderNos.length) {
            const attributed = new Set<string>();
            for (const waybill of props.initialOrder.waybills || []) {
                const waybillOrderNos = waybill.platformOrderNos || [];
                if (!waybillOrderNos.length) continue;
                const targets = waybill.productIds?.length
                    ? lines.value.filter((line) => waybill.productIds!.map(String).includes(line.productId))
                    : lines.value.slice(0, 1);
                for (const line of targets) {
                    for (const orderNo of waybillOrderNos) {
                        if (!line.platformOrderNos.includes(orderNo)) line.platformOrderNos.push(orderNo);
                        attributed.add(orderNo);
                    }
                }
            }
            const firstLine = lines.value[0]!;
            for (const orderNo of legacyOrderNos) {
                if (!attributed.has(orderNo) && !firstLine.platformOrderNos.includes(orderNo)) {
                    firstLine.platformOrderNos.push(orderNo);
                }
            }
        }
    }
};

const syncInitialDraft = () => {
    const draft = props.initialDraft;
    if (!draft || props.initialOrder) return;
    const sourceItems = draft.items?.length
        ? draft.items
        : draft.productId ? [draft] : [];
    lines.value = sourceItems.map((item) => ({
        productId: item.productId,
        productCode: item.productCode || "",
        productName: item.productName || "",
        productModel: item.productModel || "",
        category: "",
        image: "",
        unitId: String(item.unitId || ""),
        unitName: item.unitName || "",
        supplierId: item.supplierId || "",
        supplierName: item.supplierName || "",
        suppliers: initialSuppliers(undefined, item.supplierId || "", item.supplierName || ""),
        quantity: Number(item.purchaseQuantity || 0),
        unitPrice: "",
        remark: "",
        allocations: (item.relatedOrders || []).map((order) => ({
            sourceType: order.sourceType || "sales-order",
            purchaseRequestId: order.purchaseRequestId || "",
            purchaseRequestNo: order.purchaseRequestNo || order.orderNo || "",
            purchaseRequestItemIndex: Number.isInteger(order.purchaseRequestItemIndex)
                && Number(order.purchaseRequestItemIndex) >= 0
                ? order.purchaseRequestItemIndex
                : undefined,
            salesOrderNo: order.sourceType === "purchase-request"
                ? ""
                : order.salesOrderNo || order.orderNo || "",
            category: order.category || "",
            productId: item.productId,
            requirementId: order.sourceType === "purchase-request"
                ? undefined
                : order.requirementId || order.id,
            requestedQuantity: Number(order.requiredQuantity || 0),
            allocatedQuantity: Number(order.allocatedQuantity || 0),
            remainingQuantity: Number(order.remainingQuantity || 0),
            unitName: item.unitName || "",
        })),
        waybills: [],
        platformOrderNos: [],
    }));
};

const loadSelectedRequestProducts = async () => {
    if (props.initialOrder || !props.selectedRequests?.length) return;

    const requestIds = new Set(props.selectedRequests.map((request) => request.id));
    const productMap = new Map<string, {
        productId: string;
        name: string;
        model: string;
        unit: string;
        quantity: number;
    }>();
    props.selectedRequests.forEach((request) => {
        (request.items || []).forEach((item, itemIndex) => {
            const productId = String(item.productId || `request-item:${request.id}:${itemIndex}`);
            const existing = productMap.get(productId);
            if (existing) {
                existing.quantity += Number(item.quantity || 0);
                return;
            }
            productMap.set(productId, {
                productId,
                name: item.name || "",
                model: item.model || "",
                unit: item.unit || "",
                quantity: Number(item.quantity || 0),
            });
        });
    });

    if (!productMap.size) {
        ElMessage.warning("所选采购申请没有采购明细");
        return;
    }

    let productDetails: ProductPickerItem[] = [];
    let productDetailsFailed = false;
    try {
        const productIds = [...productMap.keys()].filter(isInventoryProductId);
        if (productIds.length) {
            const response = await retrieveInventoryProducts({
                ids: productIds,
                page: 1,
                limit: productIds.length,
            });
            if (response.code === 200) {
                productDetails = (response.data?.list || []).map(normalizeProductPickerItem);
            } else {
                productDetailsFailed = true;
            }
        }
    } catch {
        productDetailsFailed = true;
    }

    const inventoryProductCount = [...productMap.keys()].filter(isInventoryProductId).length;
    if (productDetailsFailed || productDetails.length < inventoryProductCount || inventoryProductCount < productMap.size) {
        ElMessage.warning("部分采购产品详情获取失败，将保留申请中的产品信息");
    }

    const detailMap = new Map(productDetails.map((product) => [product.backendId, product]));
    lines.value = [...productMap.values()].map((source) => {
        const detail = detailMap.get(source.productId);
        return {
            productId: source.productId,
            productCode: detail?.id || source.productId,
            productName: detail?.name || source.name,
            productModel: detail?.model || source.model,
            category: detail?.category || "",
            image: detail?.image || "",
            unitId: detail?.unitId || "",
            unitName: detail?.unit === "--" ? source.unit : detail?.unit || source.unit,
            supplierId: "",
            supplierName: "",
            suppliers: [],
            quantity: source.quantity,
            unitPrice: "",
            remark: "",
            allocations: [],
            waybills: [],
            platformOrderNos: [],
        };
    });
    selectedPickerProducts.value = productDetails;

    let allocationLoadFailed = false;
    for (const line of lines.value) {
        if (!isInventoryProductId(line.productId)) continue;
        try {
            const response = await retrievePurchaseRequestOrderCandidates({
                source: "purchase-request",
                productId: line.productId,
                keyword: undefined,
                page: 1,
                limit: 100,
            });
            if (response.code !== 200) continue;
            const candidates = (response.data?.list || []).filter((candidate) =>
                requestIds.has(candidate.purchaseRequestId),
            );
            line.allocations = candidates.map((candidate) => ({
                ...candidate,
                allocatedQuantity: Number(candidate.remainingQuantity || 0),
            }));
            const allocatedQuantity = line.allocations.reduce(
                (total, item) => total + Number(item.allocatedQuantity || 0),
                0,
            );
            if (allocatedQuantity > line.quantity) line.quantity = allocatedQuantity;
        } catch {
            allocationLoadFailed = true;
        }
    }
    if (allocationLoadFailed) {
        fullyAllocatedRequestNos.value = [];
        ElMessage.warning("部分采购申请分配信息获取失败，请在分配栏补充");
        return;
    }
    const coveredRequestIds = new Set(
        lines.value.flatMap((line) => line.allocations.map((item) => item.purchaseRequestId)),
    );
    fullyAllocatedRequestNos.value = props.selectedRequests
        .filter((request) =>
            (request.items || []).some((item) => isInventoryProductId(String(item.productId || "")))
            && !coveredRequestIds.has(request.id))
        .map((request) => request.requestNo);
};

const confirmProducts = (products: ProductPickerItem[]) => {
    const selectedIds = new Set(products.map((product) => product.backendId || product.id));
    lines.value = lines.value.filter((line) => selectedIds.has(line.productId));
    products.forEach((product) => {
        const productId = product.backendId || product.id;
        if (lines.value.some((line) => line.productId === productId)) return;
        lines.value.push({
            productId,
            productCode: product.id,
            productName: product.name,
            productModel: product.model,
            category: product.category,
            image: product.image,
            unitId: product.unitId,
            unitName: product.unit === "--" ? "" : product.unit,
            supplierId: "",
            supplierName: "",
            suppliers: [],
            quantity: 1,
            unitPrice: "",
            remark: "",
            allocations: [],
            waybills: [],
            platformOrderNos: [],
        });
    });
    selectedPickerProducts.value = products;
    showProductPicker.value = false;
};

const removeLine = (productId: string) => {
    lines.value = lines.value.filter((line) => line.productId !== productId);
};

const loadSuppliers = async () => {
    if (!activeLine.value || !showSupplierPicker.value || supplierSaving.value) return;
    if (!canReadPurchaseSupplier(Number(adminInfo.value.role))) return;
    const requestId = ++supplierRequestId;
    const page = supplierCurrentPage.value;
    supplierLoading.value = true;
    suppliers.value = [];
    try {
        const response = await retrievePurchaseSuppliers({
            keyword: supplierSearchKeyword.value || undefined,
            isEnabled: true,
            productId: showAllSuppliers.value ? undefined : activeLine.value.productId,
            page,
            limit: supplierPageSize.value,
        }, { skipLoading: true });
        if (requestId !== supplierRequestId || !showSupplierPicker.value) return;
        if (response.code !== 200) throw new Error(response.msg || "获取供应商失败");
        setSupplierTotalItems(response.data?.pagination?.total || 0);
        if (page !== supplierCurrentPage.value) {
            await loadSuppliers();
            return;
        }
        suppliers.value = response.data?.list || [];
        selectedSuppliers.value = selectedSuppliers.value.map((selected) =>
            suppliers.value.find((supplier) => supplier._id === selected._id) || selected);
    } catch (error: any) {
        if (requestId !== supplierRequestId || !showSupplierPicker.value) return;
        ElMessage.error({
            message: error?.data?.msg || error?.message || "获取供应商失败",
            customClass: "supplier-picker-message",
        });
    } finally {
        if (requestId === supplierRequestId) supplierLoading.value = false;
    }
};

const searchSuppliers = async () => {
    if (supplierSaving.value) return;
    supplierSearchKeyword.value = supplierKeyword.value;
    goToSupplierPage(1);
    await loadSuppliers();
};

const changeSupplierPage = async (page: number) => {
    if (supplierSaving.value) return;
    const previousPage = supplierCurrentPage.value;
    goToSupplierPage(page);
    if (supplierCurrentPage.value === previousPage) return;
    await loadSuppliers();
};

const jumpSupplierPage = async () => {
    await changeSupplierPage(Number(supplierJumpPageInput.value.trim()));
};

const changeSupplierPageSize = async (pageSize: number) => {
    if (supplierSaving.value) return;
    supplierPageSize.value = pageSize;
    goToSupplierPage(1);
    await loadSuppliers();
};

const closeSupplierPicker = () => {
    if (supplierSaving.value) return;
    showSupplierPicker.value = false;
    supplierRequestId++;
    supplierLoading.value = false;
};

const openSupplierPicker = async (line: ProductLine) => {
    if (supplierSaving.value) return;
    activeLine.value = line;
    showAllSuppliers.value = false;
    supplierKeyword.value = "";
    supplierSearchKeyword.value = "";
    goToSupplierPage(1);
    selectedSuppliers.value = line.suppliers.map((supplier) => ({
        _id: supplier.supplierId,
        code: supplier.supplierCode || "",
        name: supplier.supplierName || "",
    }));
    showSupplierPicker.value = true;
    await loadSuppliers();
};

const toggleSupplier = (supplier: PurchaseSupplier) => {
    if (supplierSaving.value || !supplier._id) return;
    if (selectedSuppliers.value.some((item) => item._id === supplier._id)) {
        selectedSuppliers.value = selectedSuppliers.value.filter((item) => item._id !== supplier._id);
    } else {
        selectedSuppliers.value.push(supplier);
    }
};

const togglePageSuppliers = () => {
    if (supplierLoading.value || supplierSaving.value) return;
    if (allPageSuppliersSelected.value) {
        const pageIds = new Set(suppliers.value.map((supplier) => supplier._id));
        selectedSuppliers.value = selectedSuppliers.value.filter((supplier) => !pageIds.has(supplier._id));
    } else {
        for (const supplier of suppliers.value) {
            if (supplier._id && !selectedSuppliers.value.some((item) => item._id === supplier._id)) {
                selectedSuppliers.value.push(supplier);
            }
        }
    }
};

const confirmSupplier = async () => {
    if (supplierLoading.value || supplierSaving.value) return;
    const line = activeLine.value;
    if (!selectedSuppliers.value.length || !line) {
        ElMessage.warning({ message: "请选择供应商", customClass: "supplier-picker-message" });
        return;
    }
    supplierSaving.value = true;
    try {
        const suppliersToLink = selectedSuppliers.value.filter((supplier) =>
            !line.suppliers.some((item) => item.supplierId === supplier._id)
            && !supplier.products?.some((product) => product.productId === line.productId));
        if (canWriteSupplier.value && suppliersToLink.length) {
            await erpMessageBox.confirm(`将供应商 ${suppliersToLink.map((supplier) => supplier.name).join("、")} 关联此产品`, "关联供应商", {
                type: "warning",
                confirmButtonText: "确认关联",
                cancelButtonText: "取消",
                closeOnClickModal: false,
                modalClass: "supplier-relation-confirm-overlay",
            });
            for (const supplier of suppliersToLink) {
                const response = await savePurchaseSupplierProducts({
                    supplierId: supplier._id!,
                    productIds: [line.productId],
                    mode: "append",
                });
                if (response.code !== 200) throw new Error(response.msg || "关联供应商产品失败");
                supplier.products = [...(supplier.products || []), { productId: line.productId, code: line.productCode, image: line.image }];
            }
        }
        line.suppliers = selectedSuppliers.value.map((supplier) => ({
            supplierId: supplier._id!,
            supplierCode: supplier.code,
            supplierName: supplier.name,
        }));
        line.supplierId = line.suppliers[0]!.supplierId;
        line.supplierName = line.suppliers[0]!.supplierName || "";
        showSupplierPicker.value = false;
    } catch (error: any) {
        if (error === "cancel" || error === "close") return;
        ElMessage.error({
            message: error?.data?.msg || error?.message || "关联供应商产品失败",
            customClass: "supplier-picker-message",
        });
    } finally {
        supplierSaving.value = false;
    }
};

const uploadSupplierAttachments = async (attachments: Array<File | PurchaseSupplierAttachment>) => {
    const result: PurchaseSupplierAttachment[] = [];
    for (const attachment of attachments || []) {
        if (!(attachment instanceof File)) {
            if (attachment.url && attachment.name) result.push(attachment);
            continue;
        }
        const data = new FormData();
        data.append("file", attachment);
        const response = await uploadInventoryAttachment(data);
        if (response.code !== 200 || !response.data?.url) throw new Error(response.msg || "附件上传失败");
        result.push(response.data);
    }
    return result;
};

const createSupplier = async (form: any) => {
    const line = activeLine.value;
    if (!canWriteSupplier.value || !line || supplierSaving.value) return;
    supplierSaving.value = true;
    let created = false;
    try {
        const response = await addPurchaseSupplier({
            name: form.name,
            contact: form.contact,
            phone: form.phone,
            address: form.address,
            detailedAddress: form.detailedAddress,
            remark: form.remark,
            isEnabled: true,
            attachments: await uploadSupplierAttachments(form.attachments || []),
        });
        const supplier = response.data?.detail;
        if (response.code !== 200 || !supplier?._id) throw new Error(response.msg || "新增供应商失败");
        const relationResponse = await savePurchaseSupplierProducts({
            supplierId: supplier._id,
            productIds: [line.productId],
            mode: "append",
        });
        if (relationResponse.code !== 200) throw new Error(relationResponse.msg || "关联供应商产品失败");
        supplier.products = [...(supplier.products || []), { productId: line.productId, code: line.productCode, image: line.image }];
        selectedSuppliers.value = [...selectedSuppliers.value.filter((item) => item._id !== supplier._id), supplier];
        showSupplierCreate.value = false;
        created = true;
        ElMessage.success("新增供应商并关联产品成功");
    } catch (error: any) {
        ElMessage.error(error?.data?.msg || error?.message || "新增供应商失败");
    } finally {
        supplierSaving.value = false;
    }
    if (created) await loadSuppliers();
};

const loadCandidates = async () => {
    if (!activeLine.value) return;
    const response = await retrievePurchaseRequestOrderCandidates({
        source: "purchase-request",
        productId: activeLine.value.productId,
        purchaseOrderId: props.initialOrder?._id || props.initialOrder?.id || undefined,
        keyword: candidateKeyword.value || undefined,
        page: 1,
        limit: 100,
    });
    if (response.code !== 200) throw new Error(response.msg || "获取采购申请失败");
    const existingMap = new Map(activeLine.value.allocations.map((item) => [allocationKey(item), item]));
    const selectedRequestIds = new Set(props.selectedRequestIds || []);
    const candidateList = (response.data?.list || []).filter((candidate) =>
        selectedRequestIds.size === 0 || selectedRequestIds.has(candidate.purchaseRequestId),
    );
    candidates.value = candidateList.map((candidate) => ({
        ...candidate,
        nextAllocatedQuantity: existingMap.get(allocationKey(candidate))?.allocatedQuantity
            || candidate.remainingQuantity,
    }));
    selectedCandidateKeys.value = candidates.value
        .filter((candidate) => existingMap.has(allocationKey(candidate)) || selectedRequestIds.has(candidate.purchaseRequestId))
        .map(allocationKey);
};

const openAllocationPicker = async (line: ProductLine) => {
    activeLine.value = line;
    candidateKeyword.value = "";
    candidates.value = [];
    selectedCandidateKeys.value = [];
    showAllocationPicker.value = true;
    try {
        await loadCandidates();
    } catch (error: any) {
        ElMessage.error(error?.data?.msg || error?.message || "获取采购申请失败");
    }
};

const confirmAllocations = () => {
    if (!activeLine.value) return;
    const selected = candidates.value.filter((item) => selectedCandidateKeys.value.includes(allocationKey(item)));
    for (const item of selected) {
        if (item.nextAllocatedQuantity <= 0 || item.nextAllocatedQuantity > item.remainingQuantity) {
            ElMessage.warning(`申请 ${item.purchaseRequestNo} 的分配数量不合法`);
            return;
        }
    }
    const visibleCandidateKeys = new Set(candidates.value.map(allocationKey));
    const retainedAllocations = activeLine.value.allocations.filter((item) =>
        !visibleCandidateKeys.has(allocationKey(item)),
    );
    activeLine.value.allocations = [
        ...retainedAllocations,
        ...selected.map((item) => ({
            ...item,
            allocatedQuantity: Number(item.nextAllocatedQuantity),
        })),
    ];
    const allocatedQuantity = activeLine.value.allocations.reduce(
        (total, item) => total + Number(item.allocatedQuantity || 0),
        0,
    );
    if (Number(activeLine.value.quantity || 0) < allocatedQuantity) {
        activeLine.value.quantity = allocatedQuantity;
    }
    showAllocationPicker.value = false;
};

const openWaybillDialog = (line: ProductLine) => {
    activeLine.value = line;
    Object.assign(waybillForm, { trackingNo: "", courierCompany: "", remark: "" });
    showWaybillDialog.value = true;
};

const removeWaybill = (line: ProductLine, trackingNo: string) => {
    line.waybills = line.waybills.filter((item) => item.trackingNo !== trackingNo);
};

const openOrderNoDialog = (line: ProductLine) => {
    activeLine.value = line;
    orderNoText.value = line.platformOrderNos.join("\n");
    showOrderNoDialog.value = true;
};

const confirmOrderNos = () => {
    if (!activeLine.value) return;
    const orderNos = parsePlatformOrderNos(orderNoText.value);
    if (orderNos.some((orderNo) => !/^\d{12,24}$/.test(orderNo))) {
        ElMessage.warning("淘宝订单号必须是12～24位数字");
        return;
    }
    const allOrderNos = new Set([
        ...orderNos,
        ...lines.value.filter((line) => line !== activeLine.value).flatMap((line) => line.platformOrderNos),
    ]);
    if (allOrderNos.size > 20) {
        ElMessage.warning("一次最多关联20个淘宝订单");
        return;
    }
    activeLine.value.platformOrderNos = orderNos;
    showOrderNoDialog.value = false;
};

const removePlatformOrderNo = (line: ProductLine, orderNo: string) => {
    line.platformOrderNos = line.platformOrderNos.filter((item) => item !== orderNo);
};

const confirmWaybill = () => {
    if (!activeLine.value || !waybillForm.trackingNo || !waybillForm.courierCompany) {
        ElMessage.warning("请填写运单号并选择快递公司");
        return;
    }
    if (activeLine.value.waybills.some((item) => item.trackingNo === waybillForm.trackingNo)) {
        ElMessage.warning("运单号不能重复");
        return;
    }
    activeLine.value.waybills.push({
        trackingNo: waybillForm.trackingNo,
        courierCompany: waybillForm.courierCompany,
        remark: waybillForm.remark,
        productIds: [activeLine.value.productId],
    });
    showWaybillDialog.value = false;
};

const closeDialog = () => {
    if (!props.submitting && !supplierSaving.value) emit("close");
};

const submitOrder = () => {
    if (fullyAllocatedRequestNos.value.length) {
        return ElMessage.error(`采购申请 ${fullyAllocatedRequestNos.value.join("、")} 已全部分配，不能再合并生成采购单`);
    }
    if (purchaseChannel.value === "taobao") {
        const error = platformOrderNosError(mergedOrderNos.value);
        if (error) return ElMessage.warning(error);
    }
    if (purchaseChannel.value === "other") {
        const manual = lines.value.flatMap((line) => line.waybills).filter((item) => item.source !== "taobao");
        if (manual.some((item) => !item.trackingNo.trim() || !item.courierCompany?.trim())) {
            return ElMessage.warning("请为已添加的运单填写运单号和快递公司");
        }
    }
    if (!purchaseDate.value) return ElMessage.warning("请选择采购日期");
    if (!lines.value.length) return ElMessage.warning("请选择产品");
    const amounts: number[] = [];
    for (const line of lines.value) {
        if (!isInventoryProductId(line.productId)) {
            return ElMessage.warning(`产品 ${line.productName || line.productModel || line.productCode} 未关联库存产品，请重新选择产品`);
        }
        if (!line.supplierId) return ElMessage.warning(`请选择产品 ${line.productCode} 的供应商`);
        if (!Number.isFinite(Number(line.quantity)) || Number(line.quantity) <= 0) {
            return ElMessage.warning(`产品 ${line.productCode} 的采购数量必须大于0`);
        }
        const priceError = getPurchaseUnitPriceError(line.unitPrice);
        if (priceError) return ElMessage.warning(`产品 ${line.productCode} 的${priceError}`);
        const amount = calculatePurchaseItemAmount(line.quantity, line.unitPrice);
        if (amount === null) return ElMessage.warning(`产品 ${line.productCode} 的金额超出可计算范围`);
        amounts.push(amount);
        if (!line.allocations.length) return ElMessage.warning(`请为产品 ${line.productCode} 添加申请分配`);
        const allocated = line.allocations.reduce((sum, item) => sum + Number(item.allocatedQuantity || 0), 0);
        if (allocated > Number(line.quantity)) return ElMessage.warning(`产品 ${line.productCode} 的分配数量不能超过采购数量`);
    }
    const totalPrice = sumPurchaseItemAmounts(amounts);
    if (totalPrice === null) return ElMessage.warning("采购单总金额超出可计算范围");
    const usesRequestFlow = props.initialOrder?.creationSource === "purchase-request"
        || props.initialDraft?.source !== "material-pool"
        || lines.value.some((line) => line.allocations.some((allocation) =>
            allocation.sourceType === "purchase-request" || !allocation.requirementId,
        ));
    if (usesRequestFlow) {
        for (const line of lines.value) {
            for (const allocation of line.allocations) {
                if (
                    !isInventoryProductId(allocation.purchaseRequestId)
                    || !Number.isInteger(allocation.purchaseRequestItemIndex)
                    || Number(allocation.purchaseRequestItemIndex) < 0
                ) {
                    return ElMessage.warning("采购申请分配信息不完整，请刷新物料池后重新选择，当前填写内容已保留");
                }
            }
        }
    }
    const firstLine = lines.value[0]!;
    const waybillsByTracking = new Map<string, PurchaseOrderWaybill>();
    for (const line of lines.value) {
        for (const waybill of line.waybills) {
            const key = waybill.trackingNo.trim().toUpperCase();
            const previous = waybillsByTracking.get(key);
            waybillsByTracking.set(key, {
                ...waybill,
                productIds: [...new Set([...(previous?.productIds || []), line.productId])],
            });
        }
    }
    const payload: PurchaseOrderMutationPayload = {
        ...(purchaseChannel.value ? {
            purchaseChannel: purchaseChannel.value,
            platformOrderNos: purchaseChannel.value === "taobao" ? mergedOrderNos.value : [],
        } : {}),
        ...(usesRequestFlow ? { creationSource: "purchase-request" as const } : {}),
        supplierId: firstLine.supplierId,
        buyer: "",
        purchaseDate: purchaseDate.value,
        totalPrice,
        remark: remark.value,
        items: lines.value.map((line) => ({
            productId: line.productId,
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
            remark: line.remark,
            unitId: line.unitId || null,
            supplierId: line.supplierId,
            supplierIds: line.suppliers.map((supplier) => supplier.supplierId),
            platformOrderNos: purchaseChannel.value === "taobao" ? [...line.platformOrderNos] : [],
        })),
        allocations: lines.value.flatMap((line) => line.allocations.map((allocation) => ({
            purchaseRequestId: allocation.purchaseRequestId,
            purchaseRequestNo: allocation.purchaseRequestNo,
            purchaseRequestItemIndex: allocation.purchaseRequestItemIndex,
            productId: line.productId,
            requirementId: allocation.requirementId || undefined,
            allocatedQuantity: Number(allocation.allocatedQuantity),
        }))),
        waybills: [...waybillsByTracking.values()],
    };
    emit("confirm", payload);
};

syncInitialOrder();
syncInitialDraft();
void loadSelectedRequestProducts();
</script>

<style scoped>
.request-order-body { display: grid; gap: 14px; }
.fully-allocated-warning { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid #f5c26b; border-radius: 6px; color: #b26a00; background: #fdf6ec; font-size: 13px; }
.basic-card,.product-card { border: 1px solid #e6ebf0; border-radius: 6px; background: #fff; }
.basic-card h3 { margin: 0; padding: 12px 14px; border-bottom: 1px solid #edf1f4; font-size: 14px; }
.basic-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 20px; padding: 14px; }
.basic-grid label,.waybill-form label { display: grid; grid-template-columns: 86px minmax(0,1fr); align-items: center; gap: 8px; }
.basic-grid span,.waybill-form span { text-align: right; font-size: 13px; }
i { color: #f56c6c; font-style: normal; }
input { min-width: 0; height: 32px; box-sizing: border-box; padding: 0 9px; border: 1px solid #dfe4ea; border-radius: 5px; outline: none; }
.section-toolbar { height: 46px; display: flex; align-items: center; justify-content: space-between; padding: 0 14px; border-bottom: 1px solid #edf1f4; }
.section-toolbar button,.link-cell button,.stack-cell button { border: 0; color: #28a5ea; background: transparent; cursor: pointer; }
.text-action,.danger-action { display: inline-flex; align-items: center; gap: 5px; }
.danger-action,.operation-cell button { color: #f05b61 !important; }
.product-table-scroll { overflow: auto; }
.product-table { min-width: 1950px; }
.product-row { display: grid; grid-template-columns: 130px 170px 160px 130px 110px 180px 180px 170px 110px 80px 140px 170px 150px 70px; align-items: center; min-height: 72px; border-bottom: 1px solid #edf1f4; }
.product-row>div { min-width: 0; padding: 8px 10px; overflow: hidden; text-overflow: ellipsis; text-align: center; }
.remark-input { width: 100%; }
.amount-cell { display: grid; gap: 4px; }
.amount-cell small { color: #7d8795; font-size: 12px; }
input[readonly] { background: #f5f7fa; color: #606266; }
.product-head { min-height: 42px; color: #3d4650; background: #f4f7fa; font-size: 13px; font-weight: 600; }
.product-data { color: #4f5964; font-size: 13px; }
.image-cell img { width: 64px; height: 48px; object-fit: contain; }
.link-cell,.stack-cell { display: flex; flex-direction: column; gap: 4px; }
.stack-cell span { white-space: nowrap; }
.waybill-chip { display: inline-flex; align-items: center; justify-content: center; gap: 3px; }
.waybill-chip button { padding: 0; color: #f05b61; font-size: 15px; }
.number-input,.amount-input,.mini-input { width: 86px; text-align: center; }
.operation-cell button { border: 0; background: transparent; cursor: pointer; }
.empty-row,.simple-empty { min-height: 180px; display: grid; place-items: center; color: #9aa4af; }
.nested-mask { z-index: 2100; }
.picker-toolbar { display: flex; gap: 8px; padding: 0 0 12px; }
.picker-toolbar>input { margin-left: auto; width: 260px; }
.supplier-picker :deep(.erp-dialog-frame__body) { display: grid; grid-template-rows: auto minmax(0,1fr) auto; }
.supplier-scope-toggle { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; font-size: 13px; }
.supplier-pagination { min-width: 0; margin: 0; padding: 0; border: 0; }
.supplier-pagination:disabled { opacity: .6; }
.supplier-picker button:disabled { cursor: not-allowed; opacity: .6; }
.supplier-selection-count { margin-right: auto; color: #606266; font-size: 13px; }
:global(.supplier-relation-confirm-overlay) { z-index: 2300 !important; }
:global(.supplier-picker-message) { z-index: 2400 !important; }
.primary-small,.filter-small { height: 32px; display: inline-flex; align-items: center; gap: 5px; padding: 0 12px; border: 1px solid #3da9e9; border-radius: 5px; color: #fff; background: #3da9e9; }
.simple-table { overflow: auto; border: 1px solid #e8edf2; }
.simple-row { display: grid; align-items: center; min-width: 850px; min-height: 46px; border-bottom: 1px solid #edf1f4; font-size: 13px; }
.simple-row>div { min-width: 0; padding: 7px 10px; overflow: hidden; text-overflow: ellipsis; text-align: center; }
.simple-head { color: #3d4650; background: #f4f7fa; font-weight: 600; }
.supplier-row { grid-template-columns: 50px 130px 150px minmax(140px,1fr) 180px; }
.supplier-product-codes { display: flex; flex-direction: column; gap: 4px; }
.supplier-product-codes span { white-space: nowrap; }
.supplier-product-images { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
.supplier-product-images img { width: 64px; height: 48px; object-fit: contain; }
.allocation-row { grid-template-columns: 48px 145px 145px 100px 100px 100px 120px 80px; }
.waybill-form { width: 390px; display: grid; gap: 16px; margin: 28px auto; }
.orderno-row { align-items: start; }
.orderno-row textarea { min-width: 0; box-sizing: border-box; padding: 8px 9px; border: 1px solid #dfe4ea; border-radius: 5px; font: inherit; resize: vertical; }
@media (max-width: 900px) { .basic-grid { grid-template-columns: 1fr; } }
</style>
