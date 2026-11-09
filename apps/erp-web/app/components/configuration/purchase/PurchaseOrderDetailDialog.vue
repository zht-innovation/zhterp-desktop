<template>
    <Teleport to="body">
        <div class="erp-app erp-dialog-mask purchase-order-detail-mask" @click.self="emit('close')">
            <ErpDialogFrame
                class="purchase-order-detail-dialog"
                title="采购单详情"
                width="1100px"
                height="740px"
                :form="false"
                role="dialog"
                aria-modal="true"
                aria-label="采购单详情"
                @close="emit('close')"
            >
                <div v-if="loading" class="detail-state" role="status">加载中...</div>
                <div v-else-if="error" class="detail-state" role="alert">
                    <p>{{ error }}</p>
                    <button class="dialog-button cancel" type="button" @click="emit('retry')">重试</button>
                </div>
                <template v-else-if="order">
                    <section class="detail-section" aria-label="采购单基本信息">
                        <h3>基本信息</h3>
                        <dl class="detail-grid">
                            <div v-for="row in summaryRows" :key="row.label" class="detail-field">
                                <dt>{{ row.label }}</dt>
                                <dd>{{ row.value }}</dd>
                            </div>
                            <div class="detail-field detail-field-wide">
                                <dt>备注</dt>
                                <dd>
                                    <textarea
                                        class="remark-text"
                                        :value="order.remark || '--'"
                                        readonly
                                        rows="3"
                                        aria-label="备注"
                                    ></textarea>
                                </dd>
                            </div>
                        </dl>
                    </section>

                    <section class="detail-section" aria-label="采购产品明细">
                        <h3>采购产品</h3>
                        <div v-if="productRows.length" class="product-table-wrap">
                            <table class="product-table">
                                <thead>
                                    <tr>
                                        <th scope="col">产品名称</th>
                                        <th scope="col">型号</th>
                                        <th scope="col">产品编码</th>
                                        <th scope="col">供应商</th>
                                        <th scope="col">采购数量 / 单位</th>
                                        <th v-if="canViewPrice" scope="col">单价（人民币）</th>
                                        <th scope="col">备注</th>
                                        <th v-if="canViewPrice" scope="col">总金额（人民币）</th>
                                        <th scope="col">入库进度</th>
                                        <th scope="col">物流信息</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="item in productRows" :key="item.productId">
                                        <td class="product-name">{{ item.displayName }}</td>
                                        <td>{{ item.productModel || "--" }}</td>
                                        <td>{{ item.productCode || "--" }}</td>
                                        <td>{{ item.supplierNames || "--" }}</td>
                                        <td>{{ formatQuantity(item.quantity) }} {{ item.unitName || "" }}</td>
                                        <td v-if="canViewPrice">{{ formatUnitPrice(item.unitPrice) }}</td>
                                        <td class="product-remark">{{ item.remark || "--" }}</td>
                                        <td v-if="canViewPrice">{{ item.totalAmount == null ? "--" : item.totalAmount.toFixed(2) }}</td>
                                        <td class="inbound-progress">{{ formatQuantity(item.receivedQuantity) }} / {{ formatQuantity(item.quantity) }} {{ item.unitName || "" }}</td>
                                        <td>
                                            <div v-if="item.waybills.length" class="waybill-list">
                                                <div v-for="(waybill, index) in item.waybills" :key="waybill._id || `${waybill.trackingNo}-${index}`" class="waybill-item">
                                                    <strong>{{ waybill.courierCompany || "未填写快递公司" }}</strong>
                                                    <span>{{ waybill.trackingNo || "--" }}</span>
                                                </div>
                                            </div>
                                            <span v-else>{{ order.purchaseChannel === "other" ? "待补录" : "--" }}</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <p v-else class="empty-text">暂无采购产品</p>
                    </section>

                    <section class="detail-section" aria-label="采购单附件">
                        <h3>附件</h3>
                        <ul v-if="attachments.length" class="attachment-list">
                            <li v-for="(attachment, index) in attachments" :key="`${attachment.url}-${index}`">
                                <a v-if="attachment.href" :href="attachment.href" target="_blank" rel="noopener noreferrer">{{ attachment.label }}</a>
                                <span v-else>{{ attachment.label }}</span>
                            </li>
                        </ul>
                        <p v-else class="empty-text">暂无附件</p>
                    </section>
                </template>
                <div v-else class="detail-state">暂无采购单详情</div>
                <template #footer>
                    <button class="dialog-button cancel" type="button" @click="emit('close')">关闭</button>
                </template>
            </ErpDialogFrame>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import type { PurchaseOrder } from "~~/shared/types/purchase";
import { canViewPurchasePrice, isElectronicsWarehouseKeeper } from "~~/shared/utils/adminPermission";

const props = defineProps<{
    order: PurchaseOrder | null;
    loading: boolean;
    error: string;
}>();

const emit = defineEmits<{
    close: [];
    retry: [];
}>();

const adminInfo = useState<{ role?: number }>("admin_info", () => ({}));
const canViewPrice = computed(() => {
    const role = Number(adminInfo.value?.role ?? NaN);
    return canViewPurchasePrice(role) && !isElectronicsWarehouseKeeper(role);
});

const taobaoStatusLabels: Record<string, string> = {
    pending: "待匹配",
    partial: "部分匹配",
    matched: "已匹配",
    error: "匹配失败",
    not_applicable: "无需匹配",
};

const formatQuantity = (value: number | undefined) => {
    if (value == null || !Number.isFinite(Number(value))) return "--";
    return String(Number(value));
};

const formatUnitPrice = (value: number | undefined) => {
    if (value == null || !Number.isFinite(value)) return "--";
    return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
};

const formatDateTime = (value: string | Date | null | undefined) => {
    if (!value) return "--";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatAmount = (order: PurchaseOrder) => {
    const amount = order.totalAmount ?? order.totalPrice;
    if (amount == null || amount === "") return "--";
    const number = Number(amount);
    return Number.isFinite(number) ? number.toFixed(2) : "--";
};

const summaryRows = computed(() => {
    const order = props.order;
    if (!order) return [];
    const syncMessages = [];
    if (order.taobaoSyncMessage) syncMessages.push(order.taobaoSyncMessage);
    if (order.taobaoSyncedAt) syncMessages.push(`最近匹配：${formatDateTime(order.taobaoSyncedAt)}`);

    return [
        { label: "采购单号", value: order.orderNo || "--" },
        { label: "采购日期", value: order.purchaseDate || "--" },
        { label: "购买渠道", value: order.purchaseChannel === "taobao" ? "淘宝" : order.purchaseChannel === "other" ? "其他" : "未设置" },
        { label: "淘宝订单号", value: order.platformOrderNos?.join("、") || "--" },
        { label: "运单匹配", value: taobaoStatusLabels[order.taobaoSyncStatus || ""] || "--" },
        { label: "匹配说明", value: syncMessages.join("；") || "--" },
        ...(canViewPrice.value ? [{ label: "总金额", value: formatAmount(order) }] : []),
        { label: "采购总共数量", value: formatQuantity(order.totalQuantity) },
        { label: "采购人", value: order.buyer || "--" },
        { label: "操作人", value: order.updatedBy || order.operator || order.createdBy || "--" },
        { label: "修改时间", value: formatDateTime(order.updateTime || order.createTime) },
    ];
});

const productRows = computed(() => {
    const order = props.order;
    if (!order) return [];
    const receivedByProduct = new Map<string, number>();
    for (const progress of order.inboundProgress?.items || []) {
        receivedByProduct.set(String(progress.productId), Number(progress.receivedQuantity || 0));
    }

    return (order.items || []).map((item) => {
        const productId = String(item.productId);
        const waybills = (order.waybills || []).filter((waybill) =>
            !waybill.productIds?.length || waybill.productIds.some((id) => String(id) === productId),
        );
        return {
            ...item,
            productId,
            displayName: item.productName || item.productModel || item.productCode || "未命名产品",
            supplierNames: item.suppliers?.length
                ? item.suppliers.map((supplier) => supplier.supplierName || supplier.supplierCode || "--").join("、")
                : item.supplierName || order.supplierName || "",
            receivedQuantity: receivedByProduct.get(productId) || 0,
            waybills,
        };
    });
});

const getAttachmentHref = (value: string) => {
    const url = value.trim();
    if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return url;
    try {
        const parsed = new URL(url);
        return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : "";
    } catch {
        return "";
    }
};

const attachments = computed(() => (props.order?.attachments || []).map((attachment, index) => ({
    ...attachment,
    label: attachment.name || `附件${index + 1}`,
    href: getAttachmentHref(attachment.url || ""),
})));
</script>

<style scoped>
.purchase-order-detail-dialog {
    max-width: calc(100vw - 32px);
}

.purchase-order-detail-dialog :deep(.erp-dialog-frame__body) {
    display: block;
    overflow: auto;
}

.detail-section + .detail-section {
    margin-top: 24px;
}

.detail-section h3 {
    margin: 0 0 16px;
    font-size: 15px;
    font-weight: 600;
}

.detail-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px 24px;
    margin: 0;
}

.detail-field {
    min-width: 0;
}

.detail-field dt {
    margin-bottom: 6px;
    color: var(--erp-color-text-secondary);
}

.detail-field dd {
    margin: 0;
    overflow-wrap: anywhere;
}

.detail-field-wide {
    grid-column: 1 / -1;
}

.remark-text {
    display: block;
    width: 100%;
    padding: var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font: inherit;
    white-space: pre-wrap;
    overflow-y: auto;
    resize: vertical;
    cursor: text;
    -webkit-user-select: text;
    user-select: text;
}

.product-table-wrap {
    overflow-x: auto;
}

.product-table {
    width: 100%;
    min-width: 1200px;
    border-collapse: collapse;
    text-align: left;
}

.product-table th,
.product-table td {
    padding: 12px;
    border-bottom: 1px solid var(--erp-color-divider-subtle);
    vertical-align: top;
    overflow-wrap: anywhere;
}

.product-table th {
    color: var(--erp-color-text-secondary);
    background: var(--erp-color-fill-hover);
    font-weight: 500;
}

.product-table .product-name,
.product-table .inbound-progress {
    font-weight: 600;
}

.product-remark {
    min-width: 140px;
    white-space: pre-wrap;
}

.inbound-progress {
    white-space: nowrap;
}

.waybill-list {
    display: grid;
    gap: 8px;
}

.waybill-item {
    display: grid;
    gap: 4px;
}

.waybill-item + .waybill-item {
    padding-top: 8px;
    border-top: 1px dashed var(--erp-color-divider-subtle);
}

.waybill-item span {
    color: var(--erp-color-text-secondary);
}

.attachment-list {
    display: grid;
    gap: 8px;
    margin: 0;
    padding-left: 20px;
    overflow-wrap: anywhere;
}

.attachment-list a {
    color: var(--erp-color-action-primary);
}

.empty-text {
    margin: 0;
    color: var(--erp-color-text-placeholder);
}

.detail-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    min-height: 240px;
    color: var(--erp-color-text-secondary);
    text-align: center;
}

.detail-state p {
    margin: 0;
}

@media (max-width: 700px) {
    .detail-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 420px) {
    .detail-grid {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
