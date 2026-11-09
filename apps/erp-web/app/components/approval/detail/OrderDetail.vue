<template>
    <div class="business-detail">
        <section v-if="hasCustomerFields" class="business-section">
            <h4>客户信息</h4>
            <dl class="detail-grid">
                <div v-if="canShow('customerName')"><dt>客户姓名</dt><dd>{{ order.customerName || "--" }}</dd></div>
                <div v-if="canShow('customerCompany')"><dt>客户公司</dt><dd>{{ order.customerCompany || "--" }}</dd></div>
                <div v-if="canShow('customerRegion')"><dt>区域</dt><dd>{{ order.customerRegion || "--" }}</dd></div>
            </dl>
        </section>

        <section v-if="hasOrderFields" class="business-section">
            <h4>订单信息</h4>
            <dl class="detail-grid order-info-grid">
                <div v-if="canShow('orderNo')"><dt>订单编号</dt><dd>{{ order.orderNo || "--" }}</dd></div>
                <div v-if="canShow('customerCompany')"><dt>客户公司</dt><dd>{{ order.customerCompany || "--" }}</dd></div>
                <div v-if="canShow('orderType')"><dt>订单类型</dt><dd>{{ order.orderType || "--" }}</dd></div>
                <div v-if="canShow('amount')"><dt>PI 总金额</dt><dd>{{ formatMoney(order.amount) }}</dd></div>
                <div v-if="canShow('currency')"><dt>币种</dt><dd>{{ order.currency || "--" }}</dd></div>
                <div v-if="canShow('machineNo')"><dt>机器号</dt><dd>{{ order.machineNo || "--" }}</dd></div>
                <div v-if="canShow('sampleRequirement')"><dt>非标要求</dt><dd>{{ order.sampleRequirement || "--" }}</dd></div>
                <div v-if="canShow('installationRequirement')"><dt>安装要求</dt><dd>{{ order.installationRequirement || "--" }}</dd></div>
                <div v-if="canShow('testingRequirement')"><dt>测试要求</dt><dd>{{ order.testingRequirement || "--" }}</dd></div>
                <div v-if="canShow('orderRemark')"><dt>订单备注</dt><dd>{{ order.orderRemark || "--" }}</dd></div>
                <div v-if="canShow('hasShootingTask')"><dt>拍摄任务</dt><dd>{{ order.hasShootingTask ? "需要拍摄" : "无需拍摄" }}</dd></div>
                <div v-if="canShow('shootingRequirement')"><dt>拍摄要求</dt><dd>{{ order.shootingRequirement || "--" }}</dd></div>
                <div v-if="canShow('orderImages')" class="order-image-item">
                    <dt>订单图片</dt>
                    <dd><FileUploader :model-value="order.orderImages" readonly /></dd>
                </div>
            </dl>
        </section>

        <section v-if="hasContractFields" class="business-section">
            <h4>合同信息</h4>
            <dl class="detail-grid">
                <div v-if="canShow('contractNo')"><dt>合同编号</dt><dd>{{ order.contractNo || "--" }}</dd></div>
                <div v-if="canShow('orderDate')"><dt>下单日期</dt><dd>{{ formatDate(order.orderDate) }}</dd></div>
                <div v-if="canShow('durationDays')"><dt>合同交期</dt><dd>{{ order.contractDeliveryDate || "--" }}</dd></div>
                <div v-if="canShow('invoiceStatus')"><dt>发票状态</dt><dd>{{ order.invoiceStatus || "--" }}</dd></div>
                <div v-if="canShow('attachments')" class="approval-attachment-field">
                    <dt>附件</dt>
                    <dd><FileUploader :model-value="order.attachments" readonly /></dd>
                </div>
            </dl>
        </section>

        <section v-if="hasReceivableFields" class="business-section">
            <h4>应收单</h4>
            <dl class="detail-grid">
                <div v-if="canShow('receivableOrder')"><dt>应收单号</dt><dd>{{ order.receivableOrder || "--" }}</dd></div>
                <div v-if="canShow('receivableDate')"><dt>应收日期</dt><dd>{{ formatDate(order.receivableDate) }}</dd></div>
                <div v-if="canShow('incomeCategory')"><dt>收入类别</dt><dd>{{ order.incomeCategory || "--" }}</dd></div>
                <div v-if="canShow('actualReceivableAmount')"><dt>实际应收</dt><dd>{{ formatMoney(order.actualReceivableAmount) }}</dd></div>
                <div v-if="canShow('receivedAmount')"><dt>已收金额</dt><dd>{{ formatMoney(order.receivedAmount) }}</dd></div>
                <div v-if="canShow('plannedPayments')">
                    <dt>计划回款</dt>
                    <dd>
                        <div v-for="(plan, index) in plannedPayments" :key="index">
                            第 {{ index + 1 }} 期：{{ formatDate(plan.date) }} / {{ formatMoney(plan.amount) }} {{ plan.currency || "--" }}
                        </div>
                        <div v-if="plannedPaymentTotals.length">分币种合计：</div>
                        <div v-for="total in plannedPaymentTotals" :key="total.currency">{{ total.currency || "--" }} {{ formatMoney(total.amount) }}</div>
                        <span v-if="plannedPayments.length === 0">--</span>
                    </dd>
                </div>
                <div v-if="canShow('receivableRemark')"><dt>备注</dt><dd>{{ order.receivableRemark || "--" }}</dd></div>
                <div v-if="canShow('receivableAttachments')" class="approval-attachment-field">
                    <dt>附件</dt>
                    <dd><FileUploader :model-value="order.receivableAttachments" readonly /></dd>
                </div>
            </dl>
        </section>

        <section v-if="hasProductFields" class="business-section product-section">
            <div class="product-section-header">
                <h4>产品明细</h4>
                <ElButton
                    v-if="canAnalyzeOrderKit"
                    type="primary"
                    plain
                    :loading="kitAnalysisLoading"
                    :disabled="kitAnalysisLoading"
                    @click="analyzeOrderKit"
                >
                    一键齐套分析
                </ElButton>
            </div>
            <p v-if="kitAnalysisError" class="kit-analysis-error" role="alert">
                {{ kitAnalysisError }}
                <button type="button" :disabled="kitAnalysisLoading" @click="analyzeOrderKit">重试</button>
            </p>
            <p v-if="snExportUnavailableReason && hasConfiguredSnProduct" class="sn-export-hint">
                {{ snExportUnavailableReason }}
            </p>
            <ErpTableFrame
                class="order-product-table"
                :columns="productColumns"
                :empty="order.products.length === 0"
                empty-text="暂无产品"
                scroll-x
                embedded
            >
                <template #header>
                    <div class="table-row table-head">
                        <div class="table-cell">序号</div>
                        <div v-if="canShow('productCode')" class="table-cell">产品编号</div>
                        <div v-if="canShow('productModel')" class="table-cell">型号</div>
                        <div v-if="canShow('productImage')" class="table-cell">产品图片</div>
                        <div v-if="canShow('salePrice')" class="table-cell">销售单价</div>
                        <div v-if="canShow('availableQuantity')" class="table-cell">可用数量</div>
                        <div v-if="canShow('unitName')" class="table-cell">单位</div>
                        <div v-if="canShow('quantity')" class="table-cell">销售数量</div>
                        <div v-if="canShow('totalPrice')" class="table-cell">销售总价</div>
                        <div v-if="canShow('source')" class="table-cell">来源</div>
                        <div v-if="canShow('productMachineNo')" class="table-cell">机器号</div>
                        <div v-if="canShow('productRemark')" class="table-cell">备注</div>
                        <div v-if="hasDownloadColumn" class="table-cell download-cell erp-table-fixed-end">下载 Excel</div>
                    </div>
                </template>
                <div
                    v-for="(product, index) in order.products"
                    :key="`${product.productId || product.productCode || 'product'}-${index}`"
                    class="table-row data-row"
                >
                    <div class="table-cell" title="双击复制" @dblclick.stop="copyCellText(index + 1)">{{ index + 1 }}</div>
                    <div v-if="canShow('productCode')" class="table-cell" :title="`${product.productCode || '--'}（双击复制）`" @dblclick.stop="copyCellText(product.productCode)">
                        {{ product.productCode || "--" }}
                    </div>
                    <div v-if="canShow('productModel')" class="table-cell" :title="`${product.model || '--'}（双击复制）`" @dblclick.stop="copyCellText(product.model)">
                        {{ product.model || "--" }}
                    </div>
                    <div v-if="canShow('productImage')" class="table-cell product-image-cell">
                        <button
                            v-if="product.image"
                            class="product-image-button"
                            type="button"
                            @click="openImagePreview(product.image, product.model || '')"
                        >
                            <img :src="product.image" :alt="product.model || ''">
                        </button>
                        <Icon v-else name="lucide:image" />
                    </div>
                    <div v-if="canShow('salePrice')" class="table-cell" title="双击复制" @dblclick.stop="copyCellText(formatMoney(product.salePrice))">{{ formatMoney(product.salePrice) }}</div>
                    <div v-if="canShow('availableQuantity')" class="table-cell" title="双击复制" @dblclick.stop="copyCellText(product.availableQuantity)">{{ product.availableQuantity ?? "--" }}</div>
                    <div v-if="canShow('unitName')" class="table-cell" title="双击复制" @dblclick.stop="copyCellText(product.unitName)">{{ product.unitName || "--" }}</div>
                    <div v-if="canShow('quantity')" class="table-cell" title="双击复制" @dblclick.stop="copyCellText(product.quantity)">{{ product.quantity ?? "--" }}</div>
                    <div v-if="canShow('totalPrice')" class="table-cell" title="双击复制" @dblclick.stop="copyCellText(formatMoney(product.totalPrice))">{{ formatMoney(product.totalPrice) }}</div>
                    <div v-if="canShow('source')" class="table-cell" title="双击复制" @dblclick.stop="copyCellText(product.source)">{{ product.source || "--" }}</div>
                    <div v-if="canShow('productMachineNo')" class="table-cell" :title="`${product.machineNo || '--'}（双击复制）`" @dblclick.stop="copyCellText(product.machineNo)">
                        {{ product.machineNo || "--" }}
                    </div>
                    <div v-if="canShow('productRemark')" class="table-cell" :title="`${product.remark || '--'}（双击复制）`" @dblclick.stop="copyCellText(product.remark)">
                        {{ product.remark || "--" }}
                    </div>
                    <div v-if="hasDownloadColumn" class="table-cell download-cell erp-table-fixed-end">
                        <ElButton
                            v-if="canDownloadProduct(product)"
                            type="primary"
                            link
                            :loading="downloadingIndex === index"
                            :disabled="downloadingIndex !== null"
                            @click.stop="downloadProductExcel(product, index)"
                        >
                            下载 Excel
                        </ElButton>
                    </div>
                </div>
            </ErpTableFrame>
        </section>

        <OrderKitAnalysisDialog
            v-if="kitAnalysisReport && canAnalyzeOrderKit"
            v-model="showKitAnalysis"
            :rows="kitAnalysisReport.rows"
            :analyzed-at="kitAnalysisReport.analyzedAt"
            :visible-fields="kitAnalysisVisibleFields"
            stock-description="公共可用库存＋本订单有效预占；在途不计入；仅供审批参考。"
        />
        <ImagePreviewDialog
            v-model="showImagePreview"
            :title="previewTitle"
            :images="previewImages"
        />
    </div>
</template>

<script setup lang="ts">
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import FileUploader from "~/components/configuration/sales/FileUploader.vue";
import OrderKitAnalysisDialog from "~/components/configuration/sales/OrderKitAnalysisDialog.vue";
import type {
    ApprovalDate,
    SalesOrderBusinessDetail,
} from "~/types/approval";
import { normalizeOrderVisibleFields, RECEIVABLE_APPROVAL_FIELDS, type OrderApprovalField } from "~~/shared/types/orderApproval";
import type { SalesOrderProductSnapshot } from "~~/shared/types/approval";
import { getSalesOrderProductSnRule } from "~~/shared/utils/salesOrderProductSn";
import { getSalesOrderPaymentPlans, getSalesOrderPaymentTotals } from "~~/shared/utils/salesOrderPayment";
import { exportApprovalProductSn } from "~/composables/api/useApprovalApi";
import { useApprovalKitAnalysis } from "~/composables/useApprovalKitAnalysis";

const props = withDefaults(defineProps<{
    detail: SalesOrderBusinessDetail;
    approvalId?: string;
    allowProductExcelDownload?: boolean;
    snExportUnavailableReason?: string;
}>(), {
    allowProductExcelDownload: false,
});

const order = computed(() => props.detail.order);
const { copyCellText } = useApprovalCellCopy();
const visibleFields = computed(() => new Set(normalizeOrderVisibleFields(props.detail.visibleFields)));
const canShow = (field: OrderApprovalField) => visibleFields.value.has(field);
const {
    canAnalyzeOrderKit,
    kitAnalysisLoading,
    kitAnalysisError,
    kitAnalysisReport,
    showKitAnalysis,
    kitAnalysisVisibleFields,
    analyzeOrderKit,
} = useApprovalKitAnalysis({
    approvalId: () => props.approvalId,
    detail: () => props.detail,
    visibleFields: () => normalizeOrderVisibleFields(props.detail.visibleFields),
    enabled: () => true,
});

const hasConfiguredSnProduct = computed(() => canShow("productCode") && canShow("quantity")
    && (order.value.products || []).some((product) => Boolean(getSalesOrderProductSnRule(product.productCode || ""))));
const canDownloadProduct = (product: SalesOrderProductSnapshot) =>
    props.allowProductExcelDownload
    && Boolean(props.approvalId)
    && canShow("productCode")
    && canShow("quantity")
    && Boolean(getSalesOrderProductSnRule(product.productCode || ""));
const hasDownloadColumn = computed(() => (order.value.products || []).some(canDownloadProduct));
const downloadingIndex = ref<number | null>(null);

const downloadProductExcel = async (product: SalesOrderProductSnapshot, index: number) => {
    if (downloadingIndex.value !== null || !props.approvalId || !canDownloadProduct(product)) return;
    const currentOrder = order.value;
    const approvalId = props.approvalId;
    const productCode = product.productCode || "";
    downloadingIndex.value = index;
    try {
        const blob = await exportApprovalProductSn(approvalId, index);
        if (order.value !== currentOrder
            || props.approvalId !== approvalId
            || order.value.products[index] !== product
            || product.productCode !== productCode
            || !canDownloadProduct(product)) return;

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        try {
            link.href = url;
            link.download = `产品标号_${productCode}_${index + 1}.xlsx`;
            document.body.appendChild(link);
            link.click();
        } finally {
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
    } catch (error: any) {
        let data = error?.data;
        if (data instanceof Blob) {
            try {
                data = await data.json();
            } catch {
                data = null;
            }
        }
        ElMessage.error(data?.msg || "Excel 下载失败，请重试");
    } finally {
        downloadingIndex.value = null;
    }
};
const hasCustomerFields = computed(() => ["customerName", "customerCompany", "customerRegion"].some((f) => canShow(f as OrderApprovalField)));
const hasOrderFields = computed(() => ["orderNo", "orderType", "amount", "currency", "machineNo", "sampleRequirement", "installationRequirement", "testingRequirement", "orderRemark", "hasShootingTask", "shootingRequirement", "orderImages"].some((f) => canShow(f as OrderApprovalField)));
const hasContractFields = computed(() => ["contractNo", "orderDate", "durationDays", "invoiceStatus", "attachments"].some((f) => canShow(f as OrderApprovalField)));
const hasReceivableFields = computed(() => Boolean(order.value.hasReceivable || order.value.receivableOrder)
    && RECEIVABLE_APPROVAL_FIELDS.some((field) => canShow(field)));
const plannedPayments = computed(() => canShow("plannedPayments") ? getSalesOrderPaymentPlans(order.value) : []);
const plannedPaymentTotals = computed(() => getSalesOrderPaymentTotals({ plannedPayments: plannedPayments.value }));
const hasProductFields = computed(() => ["productCode", "productModel", "productImage", "salePrice", "availableQuantity", "unitName", "quantity", "totalPrice", "source", "productMachineNo", "productRemark"].some((f) => canShow(f as OrderApprovalField)));
const productColumns = computed(() => [
    "64px",
    canShow("productCode") ? "150px" : null,
    canShow("productModel") ? "180px" : null,
    canShow("productImage") ? "100px" : null,
    canShow("salePrice") ? "120px" : null,
    canShow("availableQuantity") ? "100px" : null,
    canShow("unitName") ? "80px" : null,
    canShow("quantity") ? "100px" : null,
    canShow("totalPrice") ? "120px" : null,
    canShow("source") ? "100px" : null,
    canShow("productMachineNo") ? "120px" : null,
    canShow("productRemark") ? "180px" : null,
    hasDownloadColumn.value ? "120px" : null,
].filter(Boolean).join(" "));
const moneyFormatter = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const formatMoney = (value?: number) =>
    value == null ? "--" : moneyFormatter.format(value);

const formatDate = (value?: ApprovalDate | null) => {
    if (!value) return "--";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "--" : date.toLocaleDateString("zh-CN");
};

const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");

const openImagePreview = (url: string, title: string) => {
    if (!url) return;
    previewImages.value = [{ url, alt: title }];
    previewTitle.value = title;
    showImagePreview.value = true;
};
</script>

<style scoped>
.product-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: var(--erp-spacing-20);
}

.business-section.product-section .product-section-header h4 {
    margin: 0;
}

.kit-analysis-error {
    margin: 0 0 12px;
    color: var(--erp-color-text-danger, #d9363e);
    font-size: 13px;
}

.kit-analysis-error button {
    margin-left: 8px;
    padding: 0;
    border: 0;
    background: none;
    color: var(--erp-color-action-primary);
    cursor: pointer;
}

.sn-export-hint {
    margin: 0 0 12px;
    color: var(--erp-color-text-secondary);
    font-size: 14px;
}

.order-info-grid > div,
.approval-attachment-field {
    min-height: 44px;
    align-items: start;
}

.product-image-button {
    width: 52px;
    height: 36px;
    display: grid;
    place-items: center;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-fill-default);
    cursor: zoom-in;
}

.product-image-button img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
}

.order-product-table {
    height: min(416px, 52vh);
    border: 1px solid var(--erp-color-border-muted);
}

.order-product-table .table-row {
    width: max-content;
    min-width: 100%;
}

.order-product-table .table-cell {
    overflow: hidden;
    text-overflow: ellipsis;
}

.order-product-table .download-cell {
    position: sticky;
    right: 0;
    z-index: 5;
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--erp-color-fill-default);
}

.order-product-table .table-head .download-cell {
    background: var(--erp-color-fill-table-header);
}

.product-image-cell {
    display: grid;
    place-items: center;
    color: var(--erp-color-icon-disabled);
}

.product-image-cell > :deep(svg) {
    width: 24px;
    height: 24px;
}
</style>
