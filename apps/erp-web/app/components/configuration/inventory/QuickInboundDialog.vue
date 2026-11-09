<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { ElMessage } from "element-plus";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import InventoryDatePicker from "~/components/configuration/inventory/InventoryDatePicker.vue";
import InventoryWarehouseCascader from "~/components/configuration/inventory/InventoryWarehouseCascader.vue";
import type { InboundWarehouseOption } from "~/utils/inventory/inboundFrontendMapping";
import type {
    QuickInboundCandidateItem,
    QuickInboundCandidatesResponse,
} from "~~/shared/types/purchase";
import {
    getQuickInboundCandidates,
    quickInboundAllocate,
} from "~/composables/api/usePurchaseOrderApi";
import {
    addInventoryInboundOrder,
    type InventoryInboundMutationPayload,
} from "~/composables/api/useInventoryApi";

const props = defineProps<{
    purchaseOrderNo: string;
    courierCompany: string;
    trackingNo: string;
    warehouseOptions: InboundWarehouseOption[];
}>();

const emit = defineEmits<{
    close: [];
    confirm: [];
}>();

interface AllocationEntry {
    requirementId: string;
    purchaseRequestNo: string;
    salesOrderNo: string;
    dispatchDate: string | null;
    remainingGap: number;
    allocatedQuantity: number;
}

interface DialogProduct {
    rowId: string;
    productId: string;
    productCode: string;
    model: string;
    unitName: string;
    inboundQuantity: number;
    warehouseId: string;
    locationId: string;
    targetWarehouse: string;
    candidates: QuickInboundCandidateItem[];
    allocations: AllocationEntry[];
    showAllocation: boolean;
}

const form = reactive({
    date: new Date().toISOString().slice(0, 10),
    remark: "",
});

const products = ref<DialogProduct[]>([]);
const isLoading = ref(true);
const isSubmitting = ref(false);
const salesOrderNos = ref<string[]>([]);

const hasAnyCandidates = computed(() =>
    products.value.some((p) => p.candidates.length > 0),
);

const formatDateValue = (date: Date) => date.toISOString().slice(0, 10);

const formatQuantity = (value: number) => {
    if (!Number.isFinite(value)) return "0";
    return String(Number(value.toFixed(3)));
};

const parseQuantity = (value: string) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? Number(num.toFixed(3)) : 0;
};

const autoAllocateProduct = (product: DialogProduct) => {
    const sorted = [...product.candidates]
        .filter((c) => c.remainingGap > 0)
        .sort((a, b) => {
            if (!a.dispatchDate) return 1;
            if (!b.dispatchDate) return -1;
            return String(a.dispatchDate).localeCompare(String(b.dispatchDate));
        });

    let remaining = product.inboundQuantity;
    const allocations: AllocationEntry[] = [];

    for (const candidate of sorted) {
        const alloc = Math.min(remaining, candidate.remainingGap);
        allocations.push({ ...candidate, allocatedQuantity: alloc });
        remaining = Math.max(remaining - alloc, 0);
        if (remaining <= 0) break;
    }

    for (const candidate of product.candidates) {
        if (!allocations.find((a) => a.requirementId === candidate.requirementId)) {
            allocations.push({ ...candidate, allocatedQuantity: 0 });
        }
    }

    product.allocations = allocations;
    product.showAllocation = true;
};

const reAutoAllocate = (product: DialogProduct) => {
    autoAllocateProduct(product);
};

const toggleAllocation = (product: DialogProduct) => {
    if (product.candidates.length === 0) return;
    if (!product.showAllocation) {
        autoAllocateProduct(product);
    } else {
        product.showAllocation = false;
    }
};

const updateInboundQuantity = (product: DialogProduct, value: string) => {
    product.inboundQuantity = parseQuantity(value);
};

const updateAllocationQuantity = (entry: AllocationEntry, value: string) => {
    entry.allocatedQuantity = parseQuantity(value);
};

const getAllocationTotal = (product: DialogProduct) =>
    product.allocations.reduce((sum, a) => sum + a.allocatedQuantity, 0);

const getAllocationSummary = (product: DialogProduct) => {
    const total = getAllocationTotal(product);
    return `分配合计：${formatQuantity(total)} / 本次入库 ${formatQuantity(product.inboundQuantity)} ${product.unitName}；未分配缺口继续保留在订单。`;
};

const updateWarehouse = (
    product: DialogProduct,
    warehouseId: string,
    locationId: string,
    label: string,
) => {
    product.warehouseId = warehouseId;
    product.locationId = locationId;
    product.targetWarehouse = label;
};

const validateForm = () => {
    if (!form.date) {
        ElMessage.warning("请选择入库日期");
        return false;
    }
    for (const product of products.value) {
        if (product.inboundQuantity <= 0) {
            ElMessage.warning(`${product.productCode} 的入库数量必须大于0`);
            return false;
        }
        if (!product.warehouseId) {
            ElMessage.warning(`${product.productCode} 请选择库位`);
            return false;
        }
    }
    return true;
};

const handleSubmit = async () => {
    if (isSubmitting.value || !validateForm()) return;

    isSubmitting.value = true;
    try {
        const payload: InventoryInboundMutationPayload = {
            type: "采购",
            inboundDate: form.date,
            remark: form.remark.trim(),
            courierCompany: props.courierCompany.trim(),
            trackingNo: props.trackingNo.trim(),
            purchaseOrderNo: props.purchaseOrderNo.trim(),
            items: products.value.map((p) => ({
                productId: p.productId,
                quantity: p.inboundQuantity,
                unitId: null,
                warehouseId: p.warehouseId || null,
                locationId: p.locationId || null,
            })),
        };

        const res = await addInventoryInboundOrder(payload);
        if (res.code !== 200) {
            ElMessage.error(res.msg || "创建入库单失败");
            return;
        }

        const inboundItems = products.value
            .filter((p) => p.allocations.length > 0 && p.allocations.some((a) => a.allocatedQuantity > 0))
            .flatMap((p) =>
                p.allocations
                    .filter((a) => a.allocatedQuantity > 0)
                    .map((a) => ({
                        productId: p.productId,
                        requirementId: a.requirementId,
                        allocatedQuantity: a.allocatedQuantity,
                    })),
            );

        if (inboundItems.length > 0) {
            await quickInboundAllocate({
                orderNo: props.purchaseOrderNo,
                items: products.value.map((p) => ({
                    productId: p.productId,
                    quantity: p.inboundQuantity,
                })),
            });
        }

        ElMessage.success("快捷入库成功");
        emit("confirm");
    } catch (err: any) {
        ElMessage.error(err?.message || "创建入库单失败");
    } finally {
        isSubmitting.value = false;
    }
};

onMounted(async () => {
    isLoading.value = true;
    try {
        const res = await getQuickInboundCandidates({ orderNo: props.purchaseOrderNo });
        if (res.code === 200 && res.data) {
            const data = res.data as QuickInboundCandidatesResponse;
            salesOrderNos.value = data.salesOrderNos || [];
            products.value = data.products.map((p, i) => {
                const targetWarehouse = p.warehouseName
                    ? (p.locationName ? `${p.warehouseName} / ${p.locationName}` : p.warehouseName)
                    : "";
                const product: DialogProduct = {
                    rowId: `${p.productId}-${i}`,
                    productId: p.productId,
                    productCode: p.productCode,
                    model: p.model,
                    unitName: p.unitName,
                    inboundQuantity: p.remainingQuantity,
                    warehouseId: p.warehouseId || "",
                    locationId: p.locationId || "",
                    targetWarehouse,
                    candidates: p.candidates,
                    allocations: [],
                    showAllocation: false,
                };
                if (p.candidates.length > 0) {
                    autoAllocateProduct(product);
                }
                return product;
            });
        } else {
            ElMessage.error(res.msg || "获取快捷入库数据失败");
        }
    } catch (err: any) {
        ElMessage.error(err?.message || "获取快捷入库数据失败");
    } finally {
        isLoading.value = false;
    }
});
</script>

<template>
    <div class="erp-dialog-mask inventory-responsive-dialog-mask" @click.self="emit('close')">
        <ErpDialogFrame
            class="quick-inbound-dialog"
            title="快捷采购入库"
            width="min(1240px, calc(100vw - 32px))"
            height="min(760px, calc(100vh - 32px))"
            :show-footer="true"
            @close="emit('close')"
            @submit.prevent="handleSubmit"
        >
            <div class="dialog-body">
                <section class="form-section">
                    <h3>基本信息</h3>
                    <div class="info-grid quick-inbound-info-grid">
                        <label class="inbound-form-row id-row">
                            <span>入库编号</span>
                            <input value="保存后自动生成" type="text" readonly aria-label="入库编号">
                        </label>

                        <label class="inbound-form-row type-row">
                            <span>入库类型</span>
                            <input value="采购" type="text" readonly aria-label="入库类型">
                        </label>

                        <label class="inbound-form-row date-row">
                            <span>入库日期<i>*</i></span>
                            <InventoryDatePicker
                                v-model="form.date"
                                aria-label-text="选择入库日期"
                                initial-month="2026-05-01"
                            />
                        </label>

                        <label class="inbound-form-row courier-row">
                            <span>快递公司</span>
                            <input :value="courierCompany" type="text" readonly aria-label="快递公司">
                        </label>

                        <label class="inbound-form-row tracking-row">
                            <span>物流运单号</span>
                            <input :value="trackingNo" type="text" readonly aria-label="物流运单号">
                        </label>

                        <label class="inbound-form-row order-row">
                            <span>采购单号</span>
                            <input :value="purchaseOrderNo" type="text" readonly aria-label="采购单号">
                        </label>

                        <label class="inbound-form-row remark-row">
                            <span>备注</span>
                            <input
                                v-model="form.remark"
                                type="text"
                                placeholder="请输入备注"
                                aria-label="备注"
                            >
                        </label>
                    </div>
                </section>

                <section class="form-section product-section">
                    <h3>产品明细</h3>

                    <div v-if="isLoading" class="loading-placeholder">正在加载数据...</div>

                    <template v-else-if="products.length === 0">
                        <div class="empty-placeholder">该采购单暂无可入库产品</div>
                    </template>

                    <template v-else>
                        <div class="product-table-wrapper">
                            <div class="table-row table-head product-head">
                                <div class="table-cell product-cell col-po">采购单号</div>
                                <div class="table-cell product-cell col-code">产品编号</div>
                                <div class="table-cell product-cell col-model">型号</div>
                                <div class="table-cell product-cell col-waybill">本次运单</div>
                                <div class="table-cell product-cell col-received">验收合格数量</div>
                                <div class="table-cell product-cell col-inbound">本次入库<i>*</i></div>
                                <div class="table-cell product-cell col-unit">单位</div>
                                <div class="table-cell product-cell col-warehouse">库位<i>*</i></div>
                            </div>

                            <div
                                v-for="product in products"
                                :key="product.rowId"
                                class="product-group"
                            >
                                <div class="table-row data-row product-row">
                                    <div class="table-cell product-cell col-po">{{ purchaseOrderNo }}</div>
                                    <div class="table-cell product-cell col-code">{{ product.productCode }}</div>
                                    <div class="table-cell product-cell col-model">{{ product.model || "--" }}</div>
                                    <div class="table-cell product-cell col-waybill">
                                        {{ courierCompany }}·{{ trackingNo }}
                                    </div>
                                    <div class="table-cell product-cell col-received">
                                        {{ formatQuantity(product.inboundQuantity) }}
                                    </div>
                                    <div class="table-cell product-cell col-inbound">
                                        <input
                                            :value="formatQuantity(product.inboundQuantity)"
                                            class="dialog-input quantity-input"
                                            type="number"
                                            min="0"
                                            step="0.001"
                                            @change="updateInboundQuantity(product, ($event.target as HTMLInputElement).value)"
                                        >
                                        <button
                                            v-if="product.candidates.length > 0"
                                            class="allocate-link"
                                            type="button"
                                            @click="toggleAllocation(product)"
                                        >
                                            分配
                                        </button>
                                    </div>
                                    <div class="table-cell product-cell col-unit">{{ product.unitName }}</div>
                                    <div class="table-cell product-cell col-warehouse">
                                        <InventoryWarehouseCascader
                                            :warehouse-options="warehouseOptions"
                                            :warehouse-id="product.warehouseId"
                                            :location-id="product.locationId"
                                            :label="product.targetWarehouse"
                                            placeholder="请选择"
                                            @select="(wid, lid, label) => updateWarehouse(product, wid, lid, label)"
                                        />
                                    </div>
                                </div>

                                <div
                                    v-if="product.showAllocation && product.candidates.length > 0"
                                    class="allocation-panel"
                                >
                                    <div class="allocation-header">
                                        <span class="allocation-title">
                                            订单分配确认
                                            <span class="allocation-subtitle">
                                                系统按订单交期生成建议，可人工调整
                                            </span>
                                        </span>
                                        <button
                                            class="reallocate-link"
                                            type="button"
                                            @click="reAutoAllocate(product)"
                                        >
                                            重新自动分配
                                        </button>
                                    </div>

                                    <div class="allocation-table">
                                        <div class="table-row alloc-head">
                                            <div class="table-cell alloc-cell col-source">来源申请</div>
                                            <div class="table-cell alloc-cell col-order">对应订单</div>
                                            <div class="table-cell alloc-cell col-deadline">订单交期</div>
                                            <div class="table-cell alloc-cell col-gap">未满足缺口</div>
                                            <div class="table-cell alloc-cell col-alloc">本次分配</div>
                                        </div>
                                        <div
                                            v-for="entry in product.allocations"
                                            :key="entry.requirementId"
                                            class="table-row alloc-row"
                                        >
                                            <div class="table-cell alloc-cell col-source">
                                                {{ entry.purchaseRequestNo || "--" }}
                                            </div>
                                            <div class="table-cell alloc-cell col-order">
                                                {{ entry.salesOrderNo || "无" }}
                                            </div>
                                            <div class="table-cell alloc-cell col-deadline">
                                                {{ entry.dispatchDate ? String(entry.dispatchDate).slice(0, 10) : "--" }}
                                            </div>
                                            <div class="table-cell alloc-cell col-gap">
                                                {{ formatQuantity(entry.remainingGap) }}
                                            </div>
                                            <div class="table-cell alloc-cell col-alloc">
                                                <input
                                                    :value="formatQuantity(entry.allocatedQuantity)"
                                                    class="dialog-input alloc-input"
                                                    type="number"
                                                    min="0"
                                                    step="0.001"
                                                    @change="updateAllocationQuantity(entry, ($event.target as HTMLInputElement).value)"
                                                >
                                            </div>
                                        </div>
                                    </div>

                                    <div class="allocation-summary">
                                        {{ getAllocationSummary(product) }}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div v-if="salesOrderNos.length > 0" class="related-sales-orders">
                            <span class="related-label">关联销售订单：</span>
                            <span
                                v-for="(no, idx) in salesOrderNos"
                                :key="no"
                                class="related-order-tag"
                            >
                                {{ no }}{{ idx < salesOrderNos.length - 1 ? "、" : "" }}
                            </span>
                        </div>
                    </template>
                </section>
            </div>

            <template #footer>
                <button class="cancel-button" type="button" @click="emit('close')">取消</button>
                <button
                    class="confirm-button"
                    type="button"
                    :disabled="isSubmitting || products.length === 0"
                    @click="handleSubmit"
                >
                    {{ isSubmitting ? "提交中..." : "确认" }}
                </button>
            </template>
        </ErpDialogFrame>
    </div>
</template>

<style scoped>
.quick-inbound-dialog :deep(.dialog-body) {
    padding: 0;
    overflow-y: auto;
}

.form-section {
    padding: 16px 20px;
    border-bottom: 1px solid var(--erp-color-border-default, #e8e8e8);
}

.form-section h3 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
    color: var(--erp-color-text-primary, #1a1a1a);
}

.quick-inbound-info-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px 24px;
}

.inbound-form-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
}

.inbound-form-row span:first-child {
    min-width: 72px;
    font-size: 13px;
    color: var(--erp-color-text-secondary, #666);
    flex-shrink: 0;
}

.inbound-form-row span:first-child i {
    color: var(--erp-color-text-error, #f56c6c);
    font-style: normal;
}

.inbound-form-row input {
    flex: 1;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--erp-color-border-default, #dcdfe6);
    border-radius: 4px;
    font-size: 13px;
    color: var(--erp-color-text-primary, #1a1a1a);
    background: var(--erp-color-fill-default, #fff);
    outline: none;
}

.inbound-form-row input[readonly] {
    background: var(--erp-color-fill-disabled, #f5f7fa);
    color: var(--erp-color-text-secondary, #909399);
    cursor: default;
}

.inbound-form-row input:not([readonly]):focus {
    border-color: var(--erp-color-action-primary, #409eff);
}

.inbound-form-row :deep(.inventory-date-picker) {
    flex: 1;
}

.product-section h3 {
    margin-bottom: 12px;
}

.loading-placeholder,
.empty-placeholder {
    text-align: center;
    padding: 40px 0;
    color: var(--erp-color-text-secondary, #909399);
    font-size: 13px;
}

.product-table-wrapper {
    border: 1px solid var(--erp-color-border-default, #e8e8e8);
    border-radius: 4px;
    overflow: hidden;
}

.table-row {
    display: flex;
    align-items: center;
}

.table-head {
    background: var(--erp-color-fill-header, #f5f7fa);
    font-size: 13px;
    font-weight: 600;
    color: var(--erp-color-text-primary, #1a1a1a);
}

.table-cell {
    padding: 8px 12px;
    font-size: 13px;
    color: var(--erp-color-text-primary, #1a1a1a);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.table-cell i {
    color: var(--erp-color-text-error, #f56c6c);
    font-style: normal;
}

.col-po { width: 140px; flex-shrink: 0; }
.col-code { width: 120px; flex-shrink: 0; }
.col-model { width: 140px; flex-shrink: 0; }
.col-waybill { width: 160px; flex-shrink: 0; }
.col-received { width: 120px; flex-shrink: 0; text-align: right; }
.col-inbound { width: 160px; flex-shrink: 0; }
.col-unit { width: 60px; flex-shrink: 0; }
.col-warehouse { flex: 1; min-width: 160px; }

.data-row {
    border-top: 1px solid var(--erp-color-border-default, #e8e8e8);
}

.quantity-input {
    width: 80px;
    height: 28px;
    padding: 0 6px;
    border: 1px solid var(--erp-color-border-default, #dcdfe6);
    border-radius: 4px;
    font-size: 13px;
    text-align: right;
    outline: none;
}

.quantity-input:focus {
    border-color: var(--erp-color-action-primary, #409eff);
}

.allocate-link {
    margin-left: 8px;
    padding: 0;
    border: none;
    background: none;
    color: var(--erp-color-action-primary, #409eff);
    font-size: 13px;
    cursor: pointer;
}

.allocate-link:hover {
    text-decoration: underline;
}

.product-group {
    border-top: 1px solid var(--erp-color-border-default, #e8e8e8);
}

.product-group:first-child {
    border-top: none;
}

.allocation-panel {
    margin: 8px 0;
    padding: 12px 16px;
    background: var(--erp-color-fill-secondary, #f0f7ff);
    border: 1px solid var(--erp-color-action-primary, #409eff);
    border-radius: 4px;
    border-left: 3px solid var(--erp-color-action-primary, #409eff);
}

.allocation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}

.allocation-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--erp-color-text-primary, #1a1a1a);
}

.allocation-subtitle {
    margin-left: 8px;
    font-weight: 400;
    font-size: 12px;
    color: var(--erp-color-text-secondary, #909399);
}

.reallocate-link {
    padding: 0;
    border: none;
    background: none;
    color: var(--erp-color-action-primary, #409eff);
    font-size: 13px;
    cursor: pointer;
}

.reallocate-link:hover {
    text-decoration: underline;
}

.allocation-table {
    border: 1px solid var(--erp-color-border-default, #e8e8e8);
    border-radius: 4px;
    overflow: hidden;
    background: #fff;
}

.alloc-head {
    background: var(--erp-color-fill-header, #f5f7fa);
    font-size: 12px;
    font-weight: 600;
}

.alloc-row {
    border-top: 1px solid var(--erp-color-border-default, #e8e8e8);
}

.alloc-cell {
    padding: 6px 12px;
    font-size: 13px;
}

.col-source { width: 140px; flex-shrink: 0; }
.col-order { width: 140px; flex-shrink: 0; }
.col-deadline { width: 120px; flex-shrink: 0; }
.col-gap { width: 100px; flex-shrink: 0; text-align: right; }
.col-alloc { width: 100px; flex-shrink: 0; }

.alloc-input {
    width: 80px;
    height: 28px;
    padding: 0 6px;
    border: 1px solid var(--erp-color-border-default, #dcdfe6);
    border-radius: 4px;
    font-size: 13px;
    text-align: right;
    outline: none;
}

.alloc-input:focus {
    border-color: var(--erp-color-action-primary, #409eff);
}

.allocation-summary {
    margin-top: 8px;
    font-size: 12px;
    color: var(--erp-color-text-secondary, #909399);
}

.related-sales-orders {
    margin-top: 12px;
    font-size: 13px;
    color: var(--erp-color-text-secondary, #666);
}

.related-label {
    font-weight: 500;
}

.related-order-tag {
    color: var(--erp-color-action-primary, #409eff);
}

.cancel-button {
    height: 36px;
    padding: 0 20px;
    border: 1px solid var(--erp-color-border-default, #dcdfe6);
    border-radius: 4px;
    background: #fff;
    color: var(--erp-color-text-primary, #1a1a1a);
    font-size: 14px;
    cursor: pointer;
}

.cancel-button:hover {
    border-color: var(--erp-color-action-primary, #409eff);
    color: var(--erp-color-action-primary, #409eff);
}

.confirm-button {
    height: 36px;
    padding: 0 24px;
    border: none;
    border-radius: 4px;
    background: var(--erp-color-action-primary, #409eff);
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    margin-left: 12px;
}

.confirm-button:hover:not(:disabled) {
    background: var(--erp-color-action-primary-hover, #66b1ff);
}

.confirm-button:disabled {
    background: var(--erp-color-fill-disabled, #a0cfff);
    cursor: not-allowed;
}
</style>
