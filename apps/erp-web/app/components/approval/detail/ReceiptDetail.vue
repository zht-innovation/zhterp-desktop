<template>
    <div class="business-detail">
        <section class="business-section">
            <h4>回款信息</h4>
            <dl class="detail-grid">
                <div><dt>回款单号</dt><dd>{{ receipt.receiptNo }}</dd></div>
                <div><dt>回款金额</dt><dd>{{ formatMoney(receipt.amount) }}</dd></div>
                <div><dt>币种</dt><dd>{{ receipt.currency || "--" }}</dd></div>
                <div><dt>回款日期</dt><dd>{{ formatDate(receipt.paymentDate) }}</dd></div>
                <div><dt>备注</dt><dd>{{ receipt.remark || "--" }}</dd></div>
                <div class="approval-attachment-field">
                    <dt>附件</dt>
                    <dd><FileUploader :model-value="receipt.attachments" readonly /></dd>
                </div>
            </dl>
        </section>

        <section class="business-section">
            <h4>关联订单信息</h4>
            <dl class="detail-grid">
                <div><dt>订单编号</dt><dd>{{ order.orderNo }}</dd></div>
                <div><dt>销售员</dt><dd>{{ order.salespersonName || "--" }}</dd></div>
                <div><dt>订单类型</dt><dd>{{ order.orderType || "--" }}</dd></div>
                <div><dt>PI 总金额</dt><dd>{{ formatMoney(order.amount) }}</dd></div>
                <div><dt>币种</dt><dd>{{ order.currency || "--" }}</dd></div>
            </dl>
        </section>

        <section class="business-section">
            <h4>应收单</h4>
            <dl class="detail-grid">
                <div><dt>应收单号</dt><dd>{{ receipt.receivableOrder }}</dd></div>
                <div><dt>应收日期</dt><dd>{{ formatDate(order.receivableDate) }}</dd></div>
                <div><dt>合同交期</dt><dd>{{ getSalesOrderDeliveryDate(order) || "--" }}</dd></div>
                <div><dt>实际应收</dt><dd>{{ formatMoney(order.actualReceivableAmount) }}</dd></div>
                <div><dt>已收金额</dt><dd>{{ formatMoney(detail.receivedAmountBefore) }}</dd></div>
                <div v-for="(plan, index) in plannedPayments" :key="index">
                    <dt>第 {{ index + 1 }} 期计划回款</dt>
                    <dd>日期：{{ formatDate(plan.date) }}<br>金额：{{ formatMoney(plan.amount) }} {{ plan.currency || "--" }}</dd>
                </div>
                <div v-if="plannedPaymentTotals.length">
                    <dt>分币种合计</dt>
                    <dd><div v-for="total in plannedPaymentTotals" :key="total.currency">{{ total.currency || "--" }} {{ formatMoney(total.amount) }}</div></dd>
                </div>
                <div><dt>备注</dt><dd>{{ order.receivableRemark || "--" }}</dd></div>
                <div class="approval-attachment-field">
                    <dt>附件</dt>
                    <dd><FileUploader :model-value="order.receivableAttachments" readonly /></dd>
                </div>
            </dl>
        </section>
    </div>
</template>

<script setup lang="ts">
import FileUploader from "~/components/configuration/sales/FileUploader.vue";
import { getSalesOrderPaymentPlans, getSalesOrderPaymentTotals } from "~~/shared/utils/salesOrderPayment";
import { getSalesOrderDeliveryDate } from "~~/shared/utils/salesOrderDelivery";
import type {
    ApprovalDate,
    ReceiptBusinessDetail,
} from "~/types/approval";

const props = defineProps<{
    detail: ReceiptBusinessDetail;
}>();

const receipt = computed(() => props.detail.receipt);
const order = computed(() => props.detail.order);
const plannedPayments = computed(() => getSalesOrderPaymentPlans(order.value));
const plannedPaymentTotals = computed(() => getSalesOrderPaymentTotals({ plannedPayments: plannedPayments.value }));
const moneyFormatter = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const formatMoney = (value?: number) =>
    value === undefined ? "--" : moneyFormatter.format(value);

const formatDate = (value?: ApprovalDate | null) => {
    if (!value) return "--";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "--" : date.toLocaleDateString("zh-CN");
};
</script>
