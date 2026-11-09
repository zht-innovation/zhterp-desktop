<template>
    <div class="business-detail">
        <section class="business-section">
            <h4>基本信息</h4>
            <dl class="detail-grid">
                <div><dt>申请编号</dt><dd>{{ request.requestNo }}</dd></div>
                <div><dt>采购类别</dt><dd>{{ request.category }}</dd></div>
                <div><dt>部门</dt><dd>{{ request.department || "--" }}</dd></div>
                <div><dt>总数量</dt><dd>{{ formatQuantity(request.totalQuantity) }}</dd></div>
                <div v-if="request.productionOrderId"><dt>关联生产单号</dt><dd>{{ request.productionOrderNo || "--" }}</dd></div>
                <div class="detail-grid-wide"><dt>备注</dt><dd>{{ request.remark || "--" }}</dd></div>
            </dl>
        </section>

        <section v-if="isOrderPurchase" class="business-section">
            <h4>订单信息</h4>
            <dl class="detail-grid">
                <div><dt>订单编号</dt><dd>{{ order?.orderNo || request.salesOrderNo || "--" }}</dd></div>
                <div><dt>销售员</dt><dd>{{ order?.salespersonName || "--" }}</dd></div>
                <div><dt>订单类型</dt><dd>{{ order?.orderType || "--" }}</dd></div>
            </dl>
        </section>

        <section v-if="isOrderPurchase" class="business-section">
            <h4>订单下单产品明细</h4>
            <ErpTableFrame
                class="order-product-table"
                columns="64px 150px 180px 100px 120px 80px 120px 240px"
                :empty="orderProducts.length === 0"
                empty-text="暂无订单下单产品明细"
                scroll-x
                embedded
            >
                <template #header>
                    <div class="table-row table-head">
                        <div class="table-cell">序号</div>
                        <div class="table-cell">产品编号</div>
                        <div class="table-cell">型号</div>
                        <div class="table-cell">产品图片</div>
                        <div class="table-cell">可用数量</div>
                        <div class="table-cell">单位</div>
                        <div class="table-cell">来源</div>
                        <div class="table-cell">备注</div>
                    </div>
                </template>
                <div
                    v-for="(product, index) in orderProducts"
                    :key="index"
                    class="table-row data-row"
                >
                    <div class="table-cell" title="双击复制" @dblclick.stop="copyCellText(index + 1)">{{ index + 1 }}</div>
                    <div class="table-cell" :title="`${product.productCode || '--'}（双击复制）`" @dblclick.stop="copyCellText(product.productCode)">{{ product.productCode || "--" }}</div>
                    <div class="table-cell" :title="`${product.model || '--'}（双击复制）`" @dblclick.stop="copyCellText(product.model)">{{ product.model || "--" }}</div>
                    <div class="table-cell product-image-cell">
                        <button
                            v-if="product.image"
                            class="product-image-button"
                            type="button"
                            :aria-label="`预览${product.model || product.productCode || '产品'}图片`"
                            @click="openImagePreview(product.image, product.model || product.productCode || '产品图片')"
                        >
                            <img :src="product.image" :alt="product.model || product.productCode || '产品图片'">
                        </button>
                        <Icon v-else name="lucide:image" />
                    </div>
                    <div class="table-cell" title="双击复制" @dblclick.stop="copyCellText(formatAvailableQuantity(product.availableQuantity))">{{ formatAvailableQuantity(product.availableQuantity) }}</div>
                    <div class="table-cell" title="双击复制" @dblclick.stop="copyCellText(product.unitName)">{{ product.unitName || "--" }}</div>
                    <div class="table-cell" title="双击复制" @dblclick.stop="copyCellText(product.source)">{{ product.source || "--" }}</div>
                    <div class="table-cell" :title="`${product.remark || '--'}（双击复制）`" @dblclick.stop="copyCellText(product.remark)">{{ product.remark || "--" }}</div>
                </div>
            </ErpTableFrame>
        </section>

        <section v-if="request.inventoryReview" class="business-section review-section">
            <div class="review-section-header">
                <h4>仓库复核依据</h4>
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
            <p class="review-confirm-tip">请审批人核对以下实际库存与订单需求，确认缺货及是否货不对板后选择同意或驳回；驳回时填写原因。</p>
            <ErpTableFrame
                class="review-inventory-table"
                columns="140px 180px 80px 110px 110px 110px 110px 110px 100px minmax(240px, 1fr)"
                :empty="request.inventoryReview.lines.length === 0"
                empty-text="暂无仓库复核依据"
                scroll-x
                embedded
            >
                <template #header>
                    <div class="table-row table-head">
                        <div class="table-cell">产品编号</div>
                        <div class="table-cell">型号</div>
                        <div class="table-cell">单位</div>
                        <div class="table-cell">订单需求</div>
                        <div class="table-cell">实际库存</div>
                        <div class="table-cell">复核后可用</div>
                        <div class="table-cell">锁定数量</div>
                        <div class="table-cell">本单占用</div>
                        <div class="table-cell">缺口</div>
                        <div class="table-cell">备注</div>
                    </div>
                </template>
                <div
                    v-for="(line, index) in request.inventoryReview.lines"
                    :key="`${line.productId}-${line.demandType}-${index}`"
                    class="table-row data-row"
                >
                    <div class="table-cell">{{ line.productCode }}</div>
                    <div class="table-cell">{{ line.model }}</div>
                    <div class="table-cell">{{ line.unit }}</div>
                    <div class="table-cell">{{ formatQuantity(line.requiredQuantity) }}</div>
                    <div class="table-cell">{{ formatQuantity(line.actualQuantity) }}</div>
                    <div class="table-cell">{{ formatQuantity(line.availableQuantity) }}</div>
                    <div class="table-cell">
                        <button
                            v-if="line.lockedQuantity > 0 && approvalId"
                            class="review-lock-link"
                            type="button"
                            :aria-label="`查看${line.productCode || line.model || '产品'}复核后锁定明细`"
                            @click="openReviewLockDialog(line)"
                        >{{ formatQuantity(line.lockedQuantity) }}</button>
                        <span v-else>{{ formatQuantity(line.lockedQuantity) }}</span>
                    </div>
                    <div class="table-cell">{{ formatQuantity(line.reservedQuantity) }}</div>
                    <div class="table-cell">{{ formatQuantity(line.shortageQuantity) }}</div>
                    <div class="table-cell review-remark">{{ line.remark || "--" }}</div>
                </div>
            </ErpTableFrame>
        </section>

        <section v-if="request.bomGroups?.length" class="business-section">
            <h4>BOM 采购明细</h4>
            <details v-for="group in request.bomGroups" :key="group.sourceRequirementId" class="purchase-bom-snapshot" open>
                <summary>
                    <strong>{{ group.root.productCode }} · {{ group.root.model }}</strong>
                    <span>来源成品缺口 {{ formatQuantity(group.root.requiredQuantity) }} {{ group.root.unit }}</span>
                    <span>BOM {{ group.root.bomCode || "--" }} {{ group.root.bomVersion }}</span>
                </summary>
                <div class="bom-snapshot-scroll">
                    <table class="bom-snapshot-table">
                        <thead><tr><th>产品编号 / 层级</th><th>型号</th><th>单位用量</th><th>需求数量</th><th>可用库存</th><th>缺口数量</th><th>采购数量</th><th>单位</th></tr></thead>
                        <tbody>
                            <tr v-for="row in getBomSnapshotRows(group)" :key="row.node.key">
                                <td :style="{ paddingLeft: `${12 + row.level * 18}px` }">{{ row.level ? "└ " : "" }}{{ row.node.productCode || "--" }}</td>
                                <td>{{ row.node.model || "--" }}<small v-if="row.node.bomCode">BOM {{ row.node.bomCode }} {{ row.node.bomVersion }}</small></td>
                                <td>{{ formatQuantity(row.node.quantity) }}</td>
                                <td>{{ formatQuantity(row.node.requiredQuantity) }}</td>
                                <td>{{ formatQuantity(row.node.availableQuantity) }}</td>
                                <td>{{ formatQuantity(row.node.shortageQuantity) }}</td>
                                <td>{{ row.node.children.length ? "不采购" : row.isRepeated ? "同组汇总" : formatQuantity(row.purchaseQuantity) }}</td>
                                <td>{{ row.node.unit || "--" }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </details>
        </section>

        <section v-if="ungroupedPurchaseItems.length || !request.bomGroups?.length" class="business-section">
            <h4>采购明细</h4>
            <ErpTableFrame
                class="purchase-item-table"
                columns="72px minmax(220px, 1fr) minmax(220px, 1fr) 140px 120px"
                :empty="ungroupedPurchaseItems.length === 0"
                empty-text="暂无采购明细"
                scroll-x
                embedded
            >
                <template #header>
                    <div class="table-row table-head purchase-row">
                        <div class="table-cell">序号</div>
                        <div class="table-cell">名称</div>
                        <div class="table-cell">型号规格</div>
                        <div class="table-cell">数量</div>
                        <div class="table-cell">单位</div>
                    </div>
                </template>
                <div
                    v-for="(item, index) in ungroupedPurchaseItems"
                    :key="`${item.name}-${index}`"
                    class="table-row data-row purchase-row"
                >
                    <div class="table-cell" title="双击复制" @dblclick.stop="copyCellText(index + 1)">{{ index + 1 }}</div>
                    <div class="table-cell" :title="`${item.name || '--'}（双击复制）`" @dblclick.stop="copyCellText(item.name)">{{ item.name }}</div>
                    <div class="table-cell" :title="`${item.model || '--'}（双击复制）`" @dblclick.stop="copyCellText(item.model)">{{ item.model }}</div>
                    <div class="table-cell" title="双击复制" @dblclick.stop="copyCellText(formatQuantity(item.quantity))">{{ formatQuantity(item.quantity) }}</div>
                    <div class="table-cell" title="双击复制" @dblclick.stop="copyCellText(item.unit)">{{ item.unit }}</div>
                </div>
            </ErpTableFrame>
        </section>

        <section v-if="request.images.length || request.attachments.length || request.attachmentText" class="business-section">
            <h4>文件资料</h4>
            <dl class="detail-grid file-grid">
                <div v-if="request.images.length" class="detail-grid-wide approval-attachment-field">
                    <dt>图片</dt>
                    <dd><FileUploader :model-value="request.images" readonly /></dd>
                </div>
                <div v-if="request.attachmentText" class="detail-grid-wide">
                    <dt>附件</dt>
                    <dd class="attachment-text">{{ request.attachmentText }}</dd>
                </div>
                <div v-if="request.attachments.length" class="detail-grid-wide approval-attachment-field">
                    <dt>历史附件</dt>
                    <dd><FileUploader :model-value="request.attachments" readonly /></dd>
                </div>
            </dl>
        </section>

        <InventoryRestrictionDialog
            v-if="selectedReviewLockLine"
            mode="review-snapshot"
            :product-code="selectedReviewLockLine.productCode"
            :model="selectedReviewLockLine.model"
            :unit-name="selectedReviewLockLine.unit"
            :expected-quantity="selectedReviewLockLine.lockedQuantity"
            :details="null"
            :review-snapshot="reviewLockDetails"
            :loading="reviewLockLoading"
            :error="reviewLockError"
            @close="closeReviewLockDialog"
            @retry="loadReviewLockDetails"
        />
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
import InventoryRestrictionDialog from "~/components/configuration/inventory/InventoryRestrictionDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import FileUploader from "~/components/configuration/sales/FileUploader.vue";
import OrderKitAnalysisDialog from "~/components/configuration/sales/OrderKitAnalysisDialog.vue";
import { useApprovalKitAnalysis } from "~/composables/useApprovalKitAnalysis";
import { retrieveApprovalInventoryReviewLocks } from "~/composables/api/useApprovalApi";
import type { PurchaseRequestBusinessDetail } from "~/types/approval";
import type { InventoryReviewDemandLine, InventoryReviewLockDetails } from "~~/shared/types/inventoryReview";
import type { PurchaseBomGroup, PurchaseBomNode } from "~~/shared/types/purchaseBom";

const props = defineProps<{
    detail: PurchaseRequestBusinessDetail;
    approvalId?: string;
}>();

const request = computed(() => props.detail.request);
const isOrderPurchase = computed(() => request.value.category === "销售订单采购");
const order = computed(() => props.detail.order);
const orderProducts = computed(() => order.value?.products || []);
const ungroupedPurchaseItems = computed(() => {
    const sourceIds = new Set((request.value.bomGroups || []).map((group) => group.sourceRequirementId));
    return request.value.items.filter((item) => !item.bomLineKey || !sourceIds.has(item.bomLineKey.split(":")[0] || ""));
});
const getBomSnapshotRows = (group: PurchaseBomGroup) => {
    const rows: Array<{ node: PurchaseBomNode; level: number; purchaseQuantity: number; isRepeated: boolean }> = [];
    const seen = new Set<string>();
    const visit = (node: PurchaseBomNode, level: number) => {
        const lineKey = `${group.sourceRequirementId}:${node.productId}`;
        const isRepeated = !node.children.length && seen.has(lineKey);
        const item = request.value.items.find((line) => line.bomLineKey === lineKey);
        rows.push({ node, level, purchaseQuantity: item?.quantity || 0, isRepeated });
        if (!node.children.length) seen.add(lineKey);
        for (const child of node.children) visit(child, level + 1);
    };
    for (const child of group.root.children) visit(child, 0);
    return rows;
};
const { copyCellText } = useApprovalCellCopy();
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
    visibleFields: () => props.detail.kitAnalysisVisibleFields || [],
    enabled: () => isOrderPurchase.value && Boolean(request.value.inventoryReview && request.value.salesOrderId),
});

const formatQuantity = (value: number) => Number(value || 0).toLocaleString("zh-CN", {
    maximumFractionDigits: 3,
});

const formatAvailableQuantity = (value?: number) => value == null ? "--" : formatQuantity(value);
const selectedReviewLockLine = ref<InventoryReviewDemandLine | null>(null);
const reviewLockDetails = ref<InventoryReviewLockDetails | null>(null);
const reviewLockLoading = ref(false);
const reviewLockError = ref("");
let reviewLockSequence = 0;

const closeReviewLockDialog = () => {
    reviewLockSequence += 1;
    selectedReviewLockLine.value = null;
    reviewLockDetails.value = null;
    reviewLockLoading.value = false;
    reviewLockError.value = "";
};

const loadReviewLockDetails = async () => {
    const line = selectedReviewLockLine.value;
    const approvalId = props.approvalId;
    if (!line || !approvalId || reviewLockLoading.value) return;
    const sequence = ++reviewLockSequence;
    const detail = props.detail;
    const isCurrentRequest = () => sequence === reviewLockSequence
        && props.approvalId === approvalId && props.detail === detail
        && selectedReviewLockLine.value === line;
    reviewLockDetails.value = null;
    reviewLockError.value = "";
    reviewLockLoading.value = true;
    try {
        const response = await retrieveApprovalInventoryReviewLocks(approvalId, line.productId);
        if (!isCurrentRequest()) return;
        if (response.code !== 200 || !response.data?.details) {
            throw new Error(response.msg || "获取复核后锁定明细失败");
        }
        reviewLockDetails.value = response.data.details;
    } catch (error: any) {
        if (isCurrentRequest()) {
            reviewLockError.value = error?.data?.msg || error?.message || "获取复核后锁定明细失败";
        }
    } finally {
        if (isCurrentRequest()) reviewLockLoading.value = false;
    }
};

const openReviewLockDialog = (line: InventoryReviewDemandLine) => {
    if (!props.approvalId || line.lockedQuantity <= 0) return;
    closeReviewLockDialog();
    selectedReviewLockLine.value = line;
    void loadReviewLockDetails();
};

watch(() => [props.approvalId, props.detail], closeReviewLockDialog, { flush: "sync" });
onBeforeUnmount(closeReviewLockDialog);

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
.attachment-text {
    min-width: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.purchase-bom-snapshot {
    margin-bottom: 12px;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: 5px;
    overflow: hidden;
}

.purchase-bom-snapshot summary {
    padding: 12px;
    background: #f0f8ff;
    font-size: 13px;
    line-height: 1.8;
    cursor: pointer;
}

.purchase-bom-snapshot summary span {
    margin-left: 16px;
    color: var(--erp-color-text-secondary);
}

.bom-snapshot-scroll {
    overflow-x: auto;
}

.bom-snapshot-table {
    width: 100%;
    min-width: 980px;
    border-collapse: collapse;
    font-size: 13px;
}

.bom-snapshot-table th,
.bom-snapshot-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--erp-color-border-muted);
    text-align: center;
    white-space: nowrap;
}

.bom-snapshot-table th {
    background: #f7f9fc;
}

.bom-snapshot-table td:nth-child(-n+2) {
    text-align: left;
}

.bom-snapshot-table td small {
    display: block;
    color: var(--erp-color-text-secondary);
    font-size: 11px;
}

.review-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: var(--erp-spacing-20);
}

.business-section.review-section .review-section-header h4 {
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

.review-confirm-tip {
    margin: 0 0 12px;
    color: var(--erp-color-text-secondary);
    line-height: 1.6;
}

.review-inventory-table {
    height: auto;
    border: 1px solid var(--erp-color-border-muted);
}

.review-inventory-table .table-row {
    width: max-content;
    min-width: 100%;
}

.review-inventory-table .data-row {
    height: auto;
    min-height: 64px;
    padding: 12px 0;
}

.review-inventory-table .review-remark {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.review-lock-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--erp-color-text-brand);
    font: inherit;
    cursor: pointer;
}

.purchase-item-table {
    height: auto;
    border: 1px solid var(--erp-color-border-muted);
}

.purchase-item-table .purchase-row {
    width: 100%;
    min-width: 874px;
}

.purchase-item-table .table-cell {
    overflow: hidden;
    text-overflow: ellipsis;
}

.file-grid {
    grid-template-columns: 1fr;
}

.order-product-table {
    height: auto;
    border: 1px solid var(--erp-color-border-muted);
}

.order-product-table :deep(.erp-table-frame__scroll) {
    max-height: min(416px, 52vh);
}

.order-product-table .table-row {
    width: max-content;
    min-width: 100%;
}

.order-product-table .table-cell {
    overflow: hidden;
    text-overflow: ellipsis;
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
</style>
