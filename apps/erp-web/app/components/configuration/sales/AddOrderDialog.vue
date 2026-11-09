<template>
    <Teleport to="body">
        <div v-if="visible" class="erp-app erp-dialog-mask order-dialog-mask" @click.self="closeDialog">
            <ErpDialogFrame
                class="order-detail-dialog"
                :title="dialogTitle"
                width="1240px"
                height="760px"
                :form="false"
                :close-disabled="submitting"
                @close="closeDialog"
            >
                <div class="dialog-body">
                    <div v-if="isEditLocked" class="rejection-banner">
                        <Icon name="material-symbols:lock-outline" />
                        <div>
                            <strong>订单已锁定</strong>
                            <span>{{ SALES_ORDER_REJECTION_LOCK_MESSAGE }}</span>
                        </div>
                    </div>
                    <div v-if="showRejectionBanner" class="rejection-banner">
                        <Icon name="material-symbols:error-outline-rounded" />
                        <div>
                            <strong>驳回原因</strong>
                            <span>{{ orderRejectionReason }}</span>
                        </div>
                    </div>

                    <section class="form-section">
                        <h4>客户信息</h4>
                        <div class="form-grid customer-grid">
                            <label>
                                <span>客户姓名</span>
                                <input :value="customerName" disabled />
                            </label>
                            <label>
                                <span>客户公司</span>
                                <input :value="customerCompany" disabled />
                            </label>
                            <label>
                                <span>区域</span>
                                <input :value="customerRegion" disabled />
                            </label>
                        </div>
                    </section>

                    <section class="form-section">
                        <h4>订单信息</h4>
                        <div class="form-grid three-cols order-info-grid">
                            <label>
                                <span>订单编号</span>
                                <input :value="previewOrderNo" disabled />
                            </label>
                            <label>
                                <span>销售员<i>*</i></span>
                                <input v-model.trim="form.salespersonName" placeholder="默认个人名称（可更改）" :disabled="isViewMode" />
                            </label>
                            <label>
                                <span>订单类型<i>*</i></span>
                                <SearchableSelect
                                    v-model="form.orderType"
                                    :options="orderTypeSelectOptions"
                                    placeholder="请选择"
                                    :disabled="isViewMode"
                                />
                            </label>
                            <label>
                                <span>订单总金额</span>
                                <input :value="formatMoney(orderAmount)" disabled />
                            </label>
                            <label>
                                <span>币种<i>*</i></span>
                                <SearchableSelect
                                    v-model="form.currency"
                                    :options="currencyOptions"
                                    placeholder="请选择"
                                    :disabled="isViewMode"
                                />
                            </label>
                            <label class="textarea-label machine-no-field">
                                <span>机器号</span>
                                <textarea
                                    :value="form.machineNo"
                                    placeholder="由关联生产单下达后自动回填"
                                    readonly
                                ></textarea>
                            </label>
                            <label>
                                <span>订单备注</span>
                                <input v-model.trim="form.orderRemark" placeholder="请填写售后资料提供：图片/文档/视频" :disabled="isViewMode" />
                            </label>
                            <label class="shooting-task-field">
                                <span>拍摄任务</span>
                                <el-switch
                                    v-model="form.hasShootingTask"
                                    active-text="需要拍摄"
                                    inactive-text="无需拍摄"
                                    :disabled="isViewMode"
                                />
                            </label>
                            <label class="sample-task-field">
                                <span>非标要求</span>
                                <el-switch
                                    v-model="form.hasSampleRequirement"
                                    active-text="有非标要求"
                                    inactive-text="无非标要求"
                                    :disabled="isViewMode"
                                />
                            </label>
                            <label v-if="form.hasShootingTask" class="textarea-label requirement-field shooting-requirement-field">
                                <span>拍摄要求<i v-if="!isViewMode">*</i></span>
                                <textarea
                                    v-model.trim="form.shootingRequirement"
                                    placeholder="请填写拍摄内容、规格或交付要求"
                                    :disabled="isViewMode"
                                ></textarea>
                            </label>
                            <label v-if="form.hasSampleRequirement" class="textarea-label requirement-field sample-requirement-field">
                                <span>非标要求<i v-if="!isViewMode">*</i></span>
                                <textarea
                                    v-model.trim="form.sampleRequirement"
                                    placeholder="请填写具体的非标要求"
                                    :disabled="isViewMode"
                                ></textarea>
                            </label>
                            <label class="textarea-label requirement-field installation-requirement-field">
                                <span>安装要求<i v-if="areOrderRequirementsRequired">*</i></span>
                                <textarea v-model.trim="form.installationRequirement" :disabled="isViewMode"></textarea>
                            </label>
                            <label class="textarea-label requirement-field testing-requirement-field">
                                <span>测试要求<i v-if="areOrderRequirementsRequired">*</i></span>
                                <textarea v-model.trim="form.testingRequirement" :disabled="isViewMode"></textarea>
                            </label>
                            <label class="upload-field order-image-field">
                                <span>订单图片</span>
                                <FileUploader
                                    v-model="form.orderImages"
                                    :multiple="true"
                                    :max-size="10"
                                    accept="image/*"
                                    :readonly="isViewMode"
                                />
                                <small>非必填，支持上传图片，单个文件不超过10MB</small>
                            </label>
                        </div>
                    </section>

                    <section class="form-section">
                        <h4>合同信息</h4>
                        <div class="contract-grid">
                            <label>
                                <span>合同编号<i>*</i></span>
                                <input v-model.trim="form.contractNo" :disabled="isViewMode" />
                            </label>
                            <label>
                                <span>下单日期<i>*</i></span>
                                <input v-model="form.orderDate" type="date" :disabled="isViewMode" />
                            </label>
                            <label>
                                <span>合同交期<i>*</i></span>
                                <div class="delivery-date-input">
                                    <input v-model="form.contractDeliveryDate" type="date" :min="form.orderDate || undefined" :disabled="isViewMode" />
                                    <small>订单发货日期</small>
                                </div>
                            </label>
                            <label class="invoice-field">
                                <span>发票<i>*</i></span>
                                <div class="segmented">
                                    <button
                                        v-for="invoice in invoiceOptions"
                                        :key="invoice"
                                        type="button"
                                        :disabled="isViewMode"
                                        :class="{ active: form.invoiceStatus === invoice }"
                                        @click="form.invoiceStatus = invoice"
                                    >
                                        {{ invoice }}
                                    </button>
                                </div>
                            </label>
                            <label class="upload-field">
                                <span>附件<i>*</i></span>
                                <FileUploader v-model="form.attachments" :multiple="true" :max-size="10" accept="*" :readonly="isViewMode" />
                                <small>单个文件不超过10MB</small>
                            </label>
                        </div>
                    </section>

                    <button v-if="!form.hasReceivable && !isViewMode" class="add-receivable-btn" type="button" @click="enableReceivable">
                        <Icon name="material-symbols:add" />
                        添加应收单
                    </button>

                    <section v-if="form.hasReceivable" class="form-section">
                        <div class="section-title-row">
                            <h4>应收单</h4>
                            <button v-if="!isViewMode" type="button" @click="disableReceivable">移除应收单</button>
                        </div>
                        <div class="form-grid three-cols receivable-grid">
                            <label>
                                <span>应收单号</span>
                                <input :value="previewReceivableNo" disabled />
                            </label>
                            <label>
                                <span>应收日期<i>*</i></span>
                                <input v-model="form.receivableDate" type="date" :disabled="isViewMode" />
                            </label>
                            <label>
                                <span>收入类别<i>*</i></span>
                                <SearchableSelect
                                    v-model="form.incomeCategory"
                                    :options="incomeCategorySelectOptions"
                                    placeholder="请选择"
                                    :disabled="isViewMode"
                                />
                            </label>
                            <label>
                                <span>实际应收<i v-if="!isViewMode">*</i></span>
                                <input v-model.number="form.actualReceivableAmount" type="number" min="0" placeholder="请填写" :disabled="isViewMode" />
                            </label>
                            <label>
                                <span>已收金额</span>
                                <input v-model.number="form.baseReceivedAmount" type="number" min="0" placeholder="请填写" :disabled="isViewMode" />
                            </label>
                            <div class="planned-payments">
                                <div v-for="(payment, index) in form.plannedPayments" :key="payment.localId" class="planned-payment-row" :class="{ 'has-remove': !isViewMode && form.plannedPayments.length > 1 }">
                                    <label>
                                        <span>计划回款日期<i>*</i></span>
                                        <input v-model="payment.date" type="date" :disabled="isViewMode" :aria-label="`第${index + 1}笔计划回款日期`" />
                                    </label>
                                    <label>
                                        <span>计划回款金额<i>*</i></span>
                                        <input v-model.number="payment.amount" type="number" min="0" placeholder="请填写" :disabled="isViewMode" :aria-label="`第${index + 1}笔计划回款金额`" />
                                    </label>
                                    <label>
                                        <span>回款币种<i>*</i></span>
                                        <SearchableSelect
                                            v-model="payment.currency"
                                            :options="currencyOptions"
                                            placeholder="请选择"
                                            :disabled="isViewMode"
                                            :aria-label="`第${index + 1}笔计划回款币种`"
                                        />
                                    </label>
                                    <button v-if="!isViewMode && form.plannedPayments.length > 1" type="button" class="danger-action" :aria-label="`删除第${index + 1}笔计划回款`" @click="removePlannedPayment(index)">删除</button>
                                </div>
                                <div v-if="plannedPaymentTotals.length" class="planned-payment-totals">
                                    <strong>分币种合计：</strong>
                                    <span v-for="total in plannedPaymentTotals" :key="total.currency">{{ total.currency || '--' }} {{ formatMoney(total.amount) }}</span>
                                </div>
                                <button v-if="!isViewMode" type="button" class="link-action add-planned-payment" :disabled="form.plannedPayments.length >= MAX_SALES_ORDER_PAYMENT_PLANS" @click="addPlannedPayment">
                                    <Icon name="material-symbols:add" />
                                    添加计划回款（{{ form.plannedPayments.length }}/{{ MAX_SALES_ORDER_PAYMENT_PLANS }}）
                                </button>
                            </div>
                            <label class="textarea-label receivable-remark-field">
                                <span>备注</span>
                                <textarea v-model.trim="form.receivableRemark" :disabled="isViewMode"></textarea>
                            </label>
                            <label class="upload-field">
                                <span>附件<i>*</i></span>
                                <FileUploader v-model="form.receivableAttachments" :multiple="true" :max-size="10" accept="*" :readonly="isViewMode" />
                                <small>单个文件不超过10MB</small>
                            </label>
                        </div>
                    </section>

                    <section class="form-section product-section">
                        <div v-if="!isViewMode" class="product-toolbar">
                            <button type="button" class="link-action" @click="addProductRow">
                                <Icon name="material-symbols:add" />
                                选择产品
                            </button>
                            <div class="product-actions">
                                <button type="button" class="plain-action" @click="runKitAnalysis" :disabled="analysisLoading">
                                    <Icon name="material-symbols:search" />
                                    {{ analysisLoading ? '分析中...' : '一键齐套分析' }}
                                </button>
                                <button type="button" class="danger-action" @click="clearProducts">
                                    <Icon name="material-symbols:delete-outline" />
                                    清空
                                </button>
                            </div>
                        </div>

                        <div class="product-table" :class="{ 'is-view-mode': isViewMode }">
                            <div class="product-table-inner">
                                <div class="product-header product-grid">
                                    <div>序号</div>
                                    <div>产品编号</div>
                                    <div>型号</div>
                                    <div>产品图片</div>
                                    <div>销售单价</div>
                                    <div>可用数量</div>
                                    <div>单位</div>
                                    <div>销售数量</div>
                                    <div>销售总价</div>
                                    <div>来源</div>
                                    <div>机器号</div>
                                    <div>备注</div>
                                    <div v-if="!isViewMode" class="product-action-cell">操作</div>
                                </div>
                                <div v-if="form.products.length === 0" class="empty-products">
                                    暂未选择产品
                                </div>
                                <div
                                    v-for="(product, index) in form.products"
                                    :key="product.localId"
                                    class="product-row product-grid"
                                >
                                    <div>{{ index + 1 }}</div>
                                    <div class="readonly-cell text-strong">{{ product.productCode || '--' }}</div>
                                    <div class="readonly-cell">{{ product.productName || product.model || '--' }}</div>
                                    <div class="product-image">
                                        <img
                                            v-if="product.image"
                                            :src="resolveErpImageUrl(product.image)"
                                            :alt="product.model || product.productCode || '产品图片'"
                                            title="点击查看大图"
                                            @click.stop="openProductImagePreview(product.image, product.model || product.productCode || '产品图片')"
                                        />
                                        <Icon v-else name="material-symbols:image-outline" />
                                    </div>
                                    <input class="number-input" v-model.number="product.salePrice" type="number" min="0" :disabled="isViewMode" @input="syncProductTotal(product)" />
                                    <div class="readonly-cell">{{ formatQuantity(product.availableQuantity) }}</div>
                                    <div class="readonly-cell">{{ product.unitName || '--' }}</div>
                                    <input class="number-input" v-model.number="product.quantity" type="number" min="0" :disabled="isViewMode" @input="syncProductTotal(product)" />
                                    <div class="readonly-cell amount-cell">{{ formatMoney(getProductTotal(product)) }}</div>
                                    <div class="readonly-cell">{{ product.source || '--' }}</div>
                                    <div class="readonly-cell">{{ product.machineNo || '--' }}</div>
                                    <textarea class="remark-input" v-model.trim="product.remark" rows="3" placeholder="备注" :disabled="isViewMode"></textarea>
                                    <div v-if="!isViewMode" class="product-action-cell">
                                        <button
                                            class="row-delete-btn"
                                            type="button"
                                            title="删除产品"
                                            aria-label="删除产品"
                                            @click="removeProduct(index)"
                                        >
                                            <Icon name="material-symbols:delete-outline" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <template #footer>
                    <button class="dialog-button cancel" type="button" :disabled="submitting" @click="closeDialog">{{ isViewMode ? '关闭' : '取消' }}</button>
                    <button
                        v-if="canSaveDraft"
                        class="dialog-button draft"
                        type="button"
                        @click="saveDraftOrder"
                        :disabled="submitting"
                    >
                        {{ submitting ? '保存中...' : saveDraftButtonText }}
                    </button>
                    <button v-if="!isViewMode" class="dialog-button confirm" type="button" @click="submitOrder" :disabled="submitting">
                        {{ submitting ? '提交中...' : submitButtonText }}
                    </button>
                </template>
            </ErpDialogFrame>

            <ProductPickerDialog
                v-if="showProductPicker"
                :columns="salesProductPickerColumns"
                :product-loader="loadSaleableProducts"
                :selected-product-ids="selectedProductPickerIds"
                :image-preview-z-index="5200"
                @close="closeProductPicker"
                @confirm="confirmProductSelection"
            />

            <OrderKitAnalysisDialog v-model="analysisDialogVisible" :rows="analysisRows" />

            <ImagePreviewDialog
                v-model="showImagePreview"
                :title="previewTitle"
                :images="previewImages"
                :z-index="5200"
            />
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import OrderKitAnalysisDialog from "~/components/configuration/sales/OrderKitAnalysisDialog.vue";
import type { OrderKitAnalysisRow as AnalysisRow } from "~~/shared/types/orderKitAnalysis";
import { MAX_SALES_ORDER_PAYMENT_PLANS } from "~~/shared/types/salesOrderPayment";
import { getSalesOrderPaymentPlans, getSalesOrderPaymentTotals } from "~~/shared/utils/salesOrderPayment";
import { formatSalesOrderDate, getSalesOrderDeliveryDate, getSalesOrderDurationDays } from "~~/shared/utils/salesOrderDelivery";
import { isSalesOrderEditLocked, SALES_ORDER_REJECTION_LOCK_MESSAGE } from "~~/shared/utils/salesOrderRejection";
import ImagePreviewDialog from '~/components/configuration/inventory/ImagePreviewDialog.vue'
import type { PreviewImage } from '~/components/configuration/inventory/ImagePreviewDialog.vue'
import ErpDialogFrame from '~/components/configuration/ErpDialogFrame.vue'
import ProductPickerDialog from '~/components/configuration/inventory/ProductPickerDialog.vue'
import type {
    ProductPickerColumn,
    ProductPickerLoadParams,
    ProductPickerLoadResult,
} from '~/components/configuration/inventory/ProductPickerDialog.vue'
import {
    normalizeProductPickerItem,
    type ProductPickerItem,
} from '~/composables/inventory/useInventoryProductPickerData'
import FileUploader from '~/components/configuration/sales/FileUploader.vue'
import { addSalesOrder, updateSalesOrder } from '~/composables/api/useCustomerApi'
import {
    getInventoryBomStructure,
    retrieveInventoryCurrencies,
    retrieveInventoryProducts,
    retrieveInventoryStocks,
} from '~/composables/api/useInventoryApi'

type ProductRow = {
    localId: string
    productId: string
    productCode: string
    productName: string
    model: string
    image: string
    salePrice: number
    availableQuantity: number
    unitName: string
    quantity: number
    totalPrice: number
    source: string
    machineNo: string
    remark: string
}

type OrderAttachment = File | Record<string, any> | string

type PlannedPaymentRow = {
    localId: number
    date: string
    amount: number | undefined
    currency: string
}

let nextPlannedPaymentId = 0
const buildPlannedPaymentRow = (date = '', amount?: number, currency = ''): PlannedPaymentRow => ({
    localId: ++nextPlannedPaymentId,
    date,
    amount,
    currency,
})

const props = defineProps<{
    modelValue: boolean
    customer: any
    mode?: 'create' | 'edit' | 'view'
    order?: any
}>()

const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    created: []
    updated: []
}>()

const visible = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value),
})

const userInfo = useState<any>('admin_info', () => ({}))
const salespersonId = useState<string | null>('salesperson_id', () => null)
const isEditMode = computed(() => props.mode === 'edit')
const isEditLocked = computed(() => isEditMode.value && isSalesOrderEditLocked(props.order || {}));
const isViewMode = computed(() => props.mode === 'view' || isEditLocked.value)
const isDraftLikeStatus = (status?: string) => ['草稿', '已驳回'].includes(status || '')
const isRejectedOrder = computed(() => props.order?.status === '已驳回')
const orderRejectionReason = computed(() => String(props.order?.rejectionReason || '').trim())
const showRejectionBanner = computed(() => isRejectedOrder.value && Boolean(orderRejectionReason.value))
const dialogTitle = computed(() => {
    if (isViewMode.value) return '订单详情'
    if (isRejectedOrder.value) return '编辑驳回订单'
    if (props.order?.status === '草稿') return '编辑草稿'
    return isEditMode.value ? '编辑订单' : '新建订单'
})
const submitButtonText = computed(() => {
    if (isRejectedOrder.value) return '重新提交审核'
    return props.order?.status === '草稿' ? '提交审核' : (isEditMode.value ? '保存' : '提交')
})
const saveDraftButtonText = computed(() => isRejectedOrder.value ? '保存修改' : '保存草稿')
const canSaveDraft = computed(() => !isViewMode.value && (!isEditMode.value || isDraftLikeStatus(props.order?.status)))

const orderTypeOptions = ['机架', '机架动力套', '整机+配件', '电池', '其他']
const invoiceOptions = ['无需发票', '已开发票', '待开发票']
const incomeCategoryOptions = ['预收款', '尾款']
const orderTypeSelectOptions = orderTypeOptions.map((type) => ({ label: type, value: type }))
const incomeCategorySelectOptions = incomeCategoryOptions.map((category) => ({ label: category, value: category }))
const optionalRequirementOrderTypes = new Set(['电池', '其他'])
const fallbackCurrencyOptions = [
    { label: '人民币 CNY', value: 'CNY' },
    { label: '美元 USD', value: 'USD' },
    { label: '欧元 EUR', value: 'EUR' },
]
const currencyOptions = ref([...fallbackCurrencyOptions])

const buildDateValue = (date = new Date()) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
}

const buildPreviewNo = (prefix: 'DD' | 'YS') => {
    const raw = buildDateValue().replace(/-/g, '')
    return `${prefix}-${raw}-自动生成`
}

const toDateInputValue = (value?: string | Date) => {
    if (!value) return ''
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return buildDateValue(date)
}

const toNumberOrUndefined = (value: unknown) => {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : undefined
}

const toAttachmentList = (value: unknown): any[] => {
    if (Array.isArray(value)) return [...value]
    if (!value) return []
    return [value]
}

const buildForm = () => ({
    salespersonName: '',
    salespersonId: '',
    orderType: '',
    currency: 'CNY',
    machineNo: '',
    orderRemark: '',
    hasSampleRequirement: false,
    sampleRequirement: '',
    installationRequirement: '',
    testingRequirement: '',
    hasShootingTask: false,
    shootingRequirement: '',
    contractNo: '',
    orderDate: '',
    contractDeliveryDate: '',
    invoiceStatus: '无需发票',
    orderImages: [] as OrderAttachment[],
    attachments: [] as OrderAttachment[],
    hasReceivable: false,
    receivableDate: '',
    incomeCategory: '',
    actualReceivableAmount: undefined as number | undefined,
    plannedPayments: [] as PlannedPaymentRow[],
    baseReceivedAmount: 0,
    receivableRemark: '',
    receivableAttachments: [] as OrderAttachment[],
    products: [] as ProductRow[],
})

const form = reactive(buildForm())
const areOrderRequirementsRequired = computed(() => !optionalRequirementOrderTypes.has(form.orderType))
const submitting = ref(false)
const previewOrderNo = ref(buildPreviewNo('DD'))
const previewReceivableNo = ref(buildPreviewNo('YS'))
const showProductPicker = ref(false)
const selectedProductPickerIds = ref<string[]>([])
const currencyLoading = ref(false)
const analysisLoading = ref(false)
const analysisDialogVisible = ref(false)
const analysisRows = ref<AnalysisRow[]>([])
const loadedAnalysisStockKeywords = ref<Set<string>>(new Set())
const showImagePreview = ref(false)
const previewImages = ref<PreviewImage[]>([])
const previewTitle = ref('')
const salesProductPickerColumns: ProductPickerColumn[] = [
    { key: 'id', label: '产品编号', width: 140 },
    { key: 'model', label: '型号', width: 170 },
    { key: 'category', label: '分类', width: 150 },
    { key: 'image', label: '产品图片', width: 120 },
    { key: 'availableQuantity', label: '可用数量', width: 110 },
    { key: 'unit', label: '单位', width: 80 },
    { key: 'source', label: '来源', width: 90 },
    { key: 'kitQuantity', label: '成套数量', width: 110 },
    { key: 'name', label: '商品名称', width: 120 },
]

const customerName = computed(() => props.customer?.name || '无')
const customerCompany = computed(() => props.customer?.company || props.customer?.companyDetail || '无')
const customerRegion = computed(() => [props.customer?.country, props.customer?.city].filter(Boolean).join(' / ') || '无')
const orderAmount = computed(() =>
    form.products.reduce((sum, product) => sum + getProductTotal(product), 0)
)
const plannedPaymentTotals = computed(() => {
    const plannedPayments = form.plannedPayments.map((payment) => ({
        date: payment.date || null,
        amount: Number(payment.amount) || 0,
        currency: payment.currency,
    }));
    try {
        return getSalesOrderPaymentTotals({ hasReceivable: form.hasReceivable, plannedPayments });
    } catch {
        return [];
    }
});
const resetForm = () => {
    Object.assign(form, buildForm())
    previewOrderNo.value = buildPreviewNo('DD')
    previewReceivableNo.value = buildPreviewNo('YS')
    form.orderDate = buildDateValue()
    form.salespersonName =
        props.customer?.assignSalespersonName ||
        props.customer?.salesPerson ||
        userInfo.value?.nickname ||
        userInfo.value?.username ||
        ''
    form.salespersonId = props.customer?._assignSalespersonId || salespersonId.value || ''
}

const mapOrderProducts = (products: any[] = []): ProductRow[] =>
    products.map((product, index) => {
        const salePrice = Number(product?.salePrice ?? product?.price ?? 0)
        const quantity = Number(product?.quantity ?? 0)
        return {
            localId: `${product?.productId || product?.productCode || product?.model || 'order-product'}-${index}-${Date.now()}`,
            productId: String(product?.productId || ''),
            productCode: String(product?.productCode || product?.code || ''),
            productName: String(product?.productName || product?.name || ''),
            model: String(product?.model || ''),
            image: String(product?.image || ''),
            salePrice: Number.isFinite(salePrice) ? salePrice : 0,
            availableQuantity: Number(product?.availableQuantity ?? 0) || 0,
            unitName: String(product?.unitName || product?.unit || ''),
            quantity: Number.isFinite(quantity) ? quantity : 0,
            totalPrice: Number(product?.totalPrice ?? salePrice * quantity) || 0,
            source: String(product?.source || ''),
            machineNo: String(product?.machineNo || ''),
            remark: String(product?.remark || ''),
        }
    })

const fillFormFromOrder = () => {
    const order = props.order || {}
    Object.assign(form, buildForm())
    previewOrderNo.value = order.orderNo || buildPreviewNo('DD')
    previewReceivableNo.value = order.receivableOrder || buildPreviewNo('YS')
    form.salespersonName = order.salespersonName || ''
    form.salespersonId = String(order.salespersonId || '')
    form.orderType = order.orderType || ''
    form.currency = order.currency || 'CNY'
    form.machineNo = order.machineNo || ''
    form.orderRemark = order.orderRemark || order.remark || ''
    form.sampleRequirement = order.sampleRequirement || ''
    form.hasSampleRequirement = Boolean(form.sampleRequirement.trim());
    form.installationRequirement = order.installationRequirement || ''
    form.testingRequirement = order.testingRequirement || ''
    form.hasShootingTask = Boolean(order.hasShootingTask)
    form.shootingRequirement = order.shootingRequirement || ''
    form.contractNo = order.contractNo || ''
    form.orderDate = formatSalesOrderDate(order.orderDate)
    form.contractDeliveryDate = getSalesOrderDeliveryDate(order)
    form.invoiceStatus = order.invoiceStatus || '无需发票'
    form.orderImages = toAttachmentList(order.orderImages) as OrderAttachment[]
    form.attachments = toAttachmentList(order.attachments) as OrderAttachment[]
    form.hasReceivable = Boolean(order.hasReceivable || order.receivableOrder)
    form.receivableDate = toDateInputValue(order.receivableDate)
    form.incomeCategory = order.incomeCategory || ''
    form.actualReceivableAmount = toNumberOrUndefined(order.actualReceivableAmount ?? order.amount)
    form.plannedPayments = getSalesOrderPaymentPlans(order).map((payment) =>
        buildPlannedPaymentRow(toDateInputValue(payment.date || undefined), toNumberOrUndefined(payment.amount), payment.currency ?? form.currency),
    )
    if (form.hasReceivable && form.plannedPayments.length === 0) {
        form.plannedPayments.push(buildPlannedPaymentRow('', undefined, form.currency))
    }
    form.baseReceivedAmount = toNumberOrUndefined(
        order.baseReceivedAmount ?? order.receivedAmount,
    ) || 0
    form.receivableRemark = order.receivableRemark || ''
    form.receivableAttachments = toAttachmentList(order.receivableAttachments) as OrderAttachment[]
    form.products = mapOrderProducts(Array.isArray(order.products) ? order.products : [])
}

const loadCurrencyOptions = async () => {
    if (currencyLoading.value) return
    currencyLoading.value = true
    try {
        const res: any = await retrieveInventoryCurrencies()
        const seenCodes = new Set<string>()
        const options = Array.isArray(res?.data?.list)
            ? res.data.list
                .map((currency: any) => {
                    const code = String(currency?.currencyCode || '').trim().toUpperCase()
                    const name = String(currency?.name || '').trim()
                    if (!code || seenCodes.has(code)) return null
                    seenCodes.add(code)
                    return {
                        label: name ? `${name} ${code}` : code,
                        value: code,
                    }
                })
                .filter(Boolean)
            : []

        currencyOptions.value = options.length ? options : [...fallbackCurrencyOptions]
        if (!currencyOptions.value.some((currency) => currency.value === form.currency)) {
            form.currency = currencyOptions.value[0]?.value || ''
        }
    } catch (err) {
        console.error('获取币种列表失败:', err)
        currencyOptions.value = [...fallbackCurrencyOptions]
    } finally {
        for (const payment of form.plannedPayments) {
            if (payment.currency && !currencyOptions.value.some((option) => option.value === payment.currency)) {
                currencyOptions.value.push({ label: payment.currency, value: payment.currency });
            }
        }
        currencyLoading.value = false
    }
}

watch(
    () => visible.value,
    (isOpen) => {
        if (isOpen) {
            if (isEditMode.value || isViewMode.value) {
                fillFormFromOrder()
            } else {
                resetForm()
            }
            void loadCurrencyOptions()
        }
    }
)

const closeDialog = () => {
    if (submitting.value) return
    visible.value = false
}

const enableReceivable = () => {
    form.hasReceivable = true
    form.actualReceivableAmount = orderAmount.value
    form.receivableDate = form.receivableDate || buildDateValue()
    if (form.plannedPayments.length === 0) {
        form.plannedPayments.push(buildPlannedPaymentRow(buildDateValue(), orderAmount.value, form.currency))
    }
    form.baseReceivedAmount = form.baseReceivedAmount || 0
}

const addPlannedPayment = () => {
    if (isViewMode.value || form.plannedPayments.length >= MAX_SALES_ORDER_PAYMENT_PLANS) return
    form.plannedPayments.push(buildPlannedPaymentRow('', undefined, form.currency))
}

const removePlannedPayment = (index: number) => {
    if (isViewMode.value || form.plannedPayments.length <= 1) return
    form.plannedPayments.splice(index, 1)
}

const disableReceivable = () => {
    form.hasReceivable = false
    form.receivableDate = ''
    form.incomeCategory = ''
    form.actualReceivableAmount = undefined
    form.plannedPayments = []
    form.baseReceivedAmount = 0
    form.receivableRemark = ''
    form.receivableAttachments = []
}

const getProductObjectId = (product: any) =>
    String(product?._id || product?.id || product?.productId || '').trim()

const getProductCode = (product: any) =>
    String(product?.code || product?.productCode || '').trim()

const getProductName = (product: any) =>
    String(product?.name || product?.productName || product?.model || '').trim()

const buildStockQuantityMap = (stocks: any[]) => {
    const map = new Map<string, number>()
    const seenStockKeys = new Set<string>()

    stocks.forEach((stock) => {
        const stockKey = String(stock?._id || stock?.productId || stock?.productCode || stock?.code || '').trim()
        if (stockKey && seenStockKeys.has(stockKey)) return
        if (stockKey) seenStockKeys.add(stockKey)

        const quantity = Number(stock?.availableQuantity ?? 0)
        const safeQuantity = Number.isFinite(quantity) ? quantity : 0
        const ids = [
            stock?.productId,
            stock?.productCode,
            stock?.code,
        ]

        ids.forEach((id) => {
            const key = String(id || '').trim()
            if (key) {
                map.set(key, Number(map.get(key) || 0) + safeQuantity)
            }
        })
    })

    return map
}

const mergeProductsWithStock = (products: any[], stocks: any[]) => {
    const stockQuantityMap = buildStockQuantityMap(stocks)

    return products.map((product) => {
        const stockQuantity =
            stockQuantityMap.get(getProductObjectId(product)) ??
            stockQuantityMap.get(getProductCode(product))

        return {
            ...product,
            availableQuantity: stockQuantity ?? product?.availableQuantity ?? product?.totalQuantity ?? 0,
        }
    })
}

const addProductRow = () => {
    showProductPicker.value = true
    selectedProductPickerIds.value = []
}

const getProductAvailableQuantity = (product: Pick<ProductPickerItem, 'availableQuantity'>) => {
    const quantity = Number(product.availableQuantity || 0)
    return Number.isFinite(quantity) ? quantity : 0
}

const openProductImagePreview = (url: string, title: string) => {
    if (!url) return
    previewImages.value = [{ url, alt: title }]
    previewTitle.value = title || '产品图片'
    showImagePreview.value = true
}

const loadSaleableProducts = async (
    params: ProductPickerLoadParams,
): Promise<ProductPickerLoadResult> => {
    const query = {
        keyword: params.keyword || '',
        categoryId: params.categoryId || undefined,
        page: params.page,
        limit: params.limit,
    }
    const [productRes, stockRes]: any[] = await Promise.all([
        retrieveInventoryProducts({
            ...query,
            isSaleable: true,
        }),
        retrieveInventoryStocks({
            ...query,
            limit: 200,
        }),
    ])
    if (productRes?.code !== 200) {
        throw new Error(productRes?.msg || '获取产品列表失败')
    }

    const products = Array.isArray(productRes?.data?.list) ? productRes.data.list : []
    const stocks = Array.isArray(stockRes?.data?.list) ? stockRes.data.list : []
    const pagination = productRes?.data?.pagination || {}

    return {
        list: mergeProductsWithStock(products, stocks).map((product) => ({
            ...normalizeProductPickerItem(product),
            machineNo: String(product?.machineNo || product?.serialNo || ''),
        })),
        pagination: {
            page: Number(pagination.page || params.page),
            limit: Number(pagination.limit || params.limit),
            total: Number(pagination.total || products.length),
            hasMore: Boolean(pagination.hasMore),
        },
    }
}

const addSelectedProduct = (product: ProductPickerItem) => {
    const price = Number(product.standardPrice ?? product.averagePrice ?? 0)
    form.products.push({
        localId: `${product.backendId || product.id || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productId: product.backendId,
        productCode: product.id,
        productName: product.name || product.model,
        model: product.model || product.name,
        image: product.image,
        salePrice: Number.isFinite(price) ? price : 0,
        availableQuantity: getProductAvailableQuantity(product),
        unitName: product.unit || '个',
        quantity: 1,
        totalPrice: Number.isFinite(price) ? price : 0,
        source: product.source || '外购',
        machineNo: product.machineNo,
        remark: '',
    })
}

const confirmProductSelection = (selectedProducts: ProductPickerItem[]) => {
    if (selectedProducts.length === 0) {
        showOrderMessage('warning', '请选择产品')
        return
    }

    selectedProducts.forEach(addSelectedProduct)
    closeProductPicker()
}

const closeProductPicker = () => {
    showProductPicker.value = false
    selectedProductPickerIds.value = []
}

const clearProducts = () => {
    form.products = []
}

const removeProduct = (index: number) => {
    form.products.splice(index, 1)
}

const getProductTotal = (product: ProductRow) => {
    const price = Number(product.salePrice || 0)
    const quantity = Number(product.quantity || 0)
    const total = price * quantity
    return Number.isFinite(total) && total > 0 ? total : 0
}

const syncProductTotal = (product: ProductRow) => {
    product.totalPrice = getProductTotal(product)
}

const formatMoney = (value: number) =>
    Number(value || 0).toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })

const formatQuantity = (value: number) => {
    const quantity = Number(value || 0)
    if (!Number.isFinite(quantity)) return '0'
    return Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(2)
}

const showOrderMessage = (type: 'success' | 'warning' | 'error' | 'info', message: string) => {
    ElMessage({
        type,
        message,
        customClass: 'add-order-message',
    })
}

const getAnalysisRowStatus = (shortageQuantity: number): '正常' | '缺货' =>
    shortageQuantity < 0 ? '缺货' : '正常'

const collectStockKeywords = (product: Partial<ProductRow> & Record<string, any>) =>
    [
        product.productCode,
        product.code,
        product.productName,
        product.name,
        product.model,
    ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)

const appendStocksToMap = (stockMap: Map<string, number>, stocks: any[]) => {
    const nextMap = buildStockQuantityMap(stocks)
    nextMap.forEach((quantity, key) => {
        stockMap.set(key, Number(stockMap.get(key) || 0) + Number(quantity || 0))
    })
}

const buildAnalysisStockMap = async (products: ProductRow[]) => {
    const keywordSet = new Set<string>()
    products.forEach((product) => {
        collectStockKeywords(product).forEach((keyword) => keywordSet.add(keyword))
    })
    loadedAnalysisStockKeywords.value = new Set(keywordSet)

    const responses = await Promise.all(
        Array.from(keywordSet).map((keyword) =>
            retrieveInventoryStocks({
                keyword,
                page: 1,
                limit: 200,
            }).catch(() => null),
        ),
    )
    const stocks = responses.flatMap((response: any) =>
        Array.isArray(response?.data?.list) ? response.data.list : [],
    )
    return buildStockQuantityMap(stocks)
}

const getStockAvailableQuantityFromMap = (stockMap: Map<string, number>, product: Partial<ProductRow> & Record<string, any>) => {
    const ids = [
        product.productId,
        product._id,
        product.id,
        product.productCode,
        product.code,
        product.model,
        product.productName,
        product.name,
    ]

    for (const id of ids) {
        const key = String(id || '').trim()
        if (key && stockMap.has(key)) {
            return Number(stockMap.get(key) || 0)
        }
    }

    return Number(product.availableQuantity || 0)
}

const ensureStockQuantity = async (stockMap: Map<string, number>, product: Partial<ProductRow> & Record<string, any>) => {
    const currentQuantity = getStockAvailableQuantityFromMap(stockMap, product)
    const keywords = collectStockKeywords(product)
    const knownKeys = keywords.some((keyword) => stockMap.has(keyword))
    if (knownKeys || currentQuantity > 0) {
        return currentQuantity
    }

    const pendingKeywords = keywords.filter((keyword) => !loadedAnalysisStockKeywords.value.has(keyword))
    if (!pendingKeywords.length) return currentQuantity
    pendingKeywords.forEach((keyword) => loadedAnalysisStockKeywords.value.add(keyword))

    const responses = await Promise.all(
        pendingKeywords.map((keyword) =>
            retrieveInventoryStocks({
                keyword,
                page: 1,
                limit: 200,
            }).catch(() => null),
        ),
    )
    const stocks = responses.flatMap((response: any) =>
        Array.isArray(response?.data?.list) ? response.data.list : [],
    )
    appendStocksToMap(stockMap, stocks)
    return getStockAvailableQuantityFromMap(stockMap, product)
}

const getAnalysisProductId = (node: any) =>
    String(node?.productId || node?._id || node?.id || '').trim()

const createAnalysisRow = async (
    node: any,
    demandQuantity: number,
    level: number,
    parentKey: string,
    index: number,
    stockMap: Map<string, number>,
    visited = new Set<string>(),
): Promise<AnalysisRow> => {
    const productId = getAnalysisProductId(node)
    const productCode = String(node?.productCode || node?.code || '').trim()
    const productName = String(node?.productName || node?.name || '').trim()
    const model = String(node?.model || '').trim()
    const image = String(node?.image || '').trim()
    const unitName = String(node?.unitName || node?.unit || '').trim()
    const availableQuantity = await ensureStockQuantity(stockMap, {
        productId,
        productCode,
        productName,
        model,
        availableQuantity: node?.availableQuantity,
    })
    const shortageQuantity = availableQuantity - demandQuantity
    const status = getAnalysisRowStatus(shortageQuantity)
    const key = `${parentKey}/${productId || productCode || model || 'node'}-${index}`

    let structure: any = null
    if (productId && !visited.has(productId)) {
        try {
            const res: any = await getInventoryBomStructure(productId)
            structure = res?.data?.structure || null
        } catch (err) {
            structure = null
        }
    }

    const bomChildren = Array.isArray(structure?.children) ? structure.children : []
    const nextVisited = new Set(visited)
    if (productId) nextVisited.add(productId)

    const children = shortageQuantity < 0 && bomChildren.length
        ? await Promise.all(
            bomChildren.map((child: any, childIndex: number) => {
                const childQuantity = Number(child?.quantity || 0)
                const childDemand = Math.abs(shortageQuantity) * (Number.isFinite(childQuantity) ? childQuantity : 0)
                return createAnalysisRow(child, childDemand, level + 1, key, childIndex, stockMap, nextVisited)
            }),
        )
        : []

    const suggestion = status === '正常'
        ? '--'
        : bomChildren.length
            ? '需要车间组装'
            : '需要采购'

    return {
        key,
        parentKey,
        level,
        productId,
        productCode,
        productName,
        model,
        image,
        demandQuantity,
        unitName,
        availableQuantity,
        shortageQuantity,
        status,
        suggestion,
        children,
    }
}

const buildAnalysisDemandRows = () => {
    const map = new Map<string, ProductRow>()
    form.products.forEach((product) => {
        const key = product.productId || product.productCode || product.model || product.localId
        const quantity = Number(product.quantity || 0)
        if (!key || quantity <= 0) return

        const existing = map.get(key)
        if (existing) {
            existing.quantity = Number(existing.quantity || 0) + quantity
            return
        }

        map.set(key, { ...product, quantity })
    })
    return Array.from(map.values())
}

const runKitAnalysis = async () => {
    const demandProducts = buildAnalysisDemandRows()
    if (demandProducts.length === 0) {
        showOrderMessage('warning', '请先选择产品并填写销售数量')
        return
    }

    analysisLoading.value = true
    try {
        const stockMap = await buildAnalysisStockMap(demandProducts)
        form.products.forEach((product) => {
            product.availableQuantity = getStockAvailableQuantityFromMap(stockMap, product)
        })
        const rows = await Promise.all(
            demandProducts.map((product, index) =>
                createAnalysisRow(product, Number(product.quantity || 0), 1, 'analysis', index, stockMap),
            ),
        )
        analysisRows.value = rows
        analysisDialogVisible.value = true
    } catch (err) {
        console.error('齐套分析失败:', err)
        showOrderMessage('error', '齐套分析失败')
    } finally {
        analysisLoading.value = false
    }
}

const validateForm = (strict = true) => {
    if (!props.customer?._id) {
        showOrderMessage('warning', '缺少客户信息')
        return false
    }
    if (form.plannedPayments.length > MAX_SALES_ORDER_PAYMENT_PLANS) {
        showOrderMessage('warning', `计划回款最多添加${MAX_SALES_ORDER_PAYMENT_PLANS}笔`)
        return false
    }
    if (form.contractDeliveryDate) {
        const durationDays = getSalesOrderDurationDays(form.orderDate, form.contractDeliveryDate)
        if (durationDays === null) {
            showOrderMessage('warning', '请选择有效的下单日期和合同交期')
            return false
        }
        if (durationDays < 0) {
            showOrderMessage('warning', '合同交期不得早于下单日期')
            return false
        }
    }
    if (!strict) return true

    const requiredMap: Array<[boolean, string]> = [
        [Boolean(form.salespersonName), '请填写销售员'],
        [Boolean(form.orderType), '请选择订单类型'],
        [Boolean(form.currency), '请选择币种'],
        [Boolean(form.contractNo), '请填写合同编号'],
        [Boolean(form.orderDate), '请选择下单日期'],
        [Boolean(form.contractDeliveryDate), '请选择合同交期'],
        [form.attachments.length > 0, '请上传合同附件'],
    ]

    if (areOrderRequirementsRequired.value) {
        requiredMap.splice(
            3,
            0,
            [Boolean(form.installationRequirement), '请填写安装要求'],
            [Boolean(form.testingRequirement), '请填写测试要求'],
        )
    }

    if (form.hasSampleRequirement) {
        requiredMap.push([
            Boolean(form.sampleRequirement.trim()),
            "请填写非标要求",
        ]);
    }

    if (form.hasShootingTask) {
        requiredMap.push([
            Boolean(form.shootingRequirement.trim()),
            '请填写拍摄要求',
        ])
    }

    if (form.hasReceivable) {
        requiredMap.push(
            [Boolean(form.receivableDate), '请选择应收日期'],
            [Boolean(form.incomeCategory), '请选择收入类别'],
            [Number.isFinite(Number(form.actualReceivableAmount)) && Number(form.actualReceivableAmount) > 0, '请填写大于0的实际应收金额'],
            [form.plannedPayments.length > 0, '请添加计划回款'],
            [Number(form.baseReceivedAmount || 0) >= 0, '请填写有效已收金额'],
            [form.receivableAttachments.length > 0, '请上传应收单附件'],
        )
        for (let index = 0; index < form.plannedPayments.length; index += 1) {
            const payment = form.plannedPayments[index]
            requiredMap.push(
                [Boolean(payment.date) && !Number.isNaN(new Date(payment.date).getTime()), `请选择第${index + 1}笔计划回款日期`],
                [Number.isFinite(Number(payment.amount)) && Number(payment.amount) > 0, `请填写第${index + 1}笔计划回款金额`],
                [Boolean(payment.currency.trim()), `请选择第${index + 1}笔计划回款币种`],
            )
        }
    }

    const invalid = requiredMap.find(([valid]) => !valid)
    if (invalid) {
        showOrderMessage('warning', invalid[1])
        return false
    }
    return true
}

const normalizedProducts = () =>
    form.products
        .map((product) => ({
            productId: product.productId,
            productCode: product.productCode,
            productName: product.productName,
            model: product.model,
            image: product.image,
            salePrice: Number(product.salePrice || 0),
            availableQuantity: Number(product.availableQuantity || 0),
            unitName: product.unitName,
            quantity: Number(product.quantity || 0),
            totalPrice: getProductTotal(product),
            source: product.source,
            machineNo: product.machineNo,
            remark: product.remark,
        }))
        .filter((product) => product.productCode || product.model || product.totalPrice > 0)

const appendField = (fd: FormData, key: string, value: unknown) => {
    if (value === undefined || value === null) return
    fd.append(key, String(value))
}

const isFileAttachment = (file: unknown): file is File =>
    typeof File !== 'undefined' && file instanceof File

const buildSubmitData = (status: string) => {
    const fd = new FormData()
    const durationDays = getSalesOrderDurationDays(form.orderDate, form.contractDeliveryDate)
    if (isEditMode.value) {
        appendField(fd, 'id', props.order?._id || props.order?.id)
        appendField(fd, 'orderNo', props.order?.orderNo)
        appendField(fd, 'receivableOrder', props.order?.receivableOrder)
    }
    appendField(fd, 'customerId', props.customer?._id)
    appendField(fd, 'customerName', customerName.value)
    appendField(fd, 'customerCompany', customerCompany.value)
    appendField(fd, 'customerRegion', customerRegion.value)
    appendField(fd, 'salespersonId', form.salespersonId)
    appendField(fd, 'salespersonName', form.salespersonName)
    appendField(fd, 'orderType', form.orderType)
    appendField(fd, 'amount', orderAmount.value)
    appendField(fd, 'currency', form.currency)
    appendField(fd, 'status', status)
    appendField(fd, 'orderDate', form.orderDate)
    appendField(fd, 'durationDays', durationDays ?? 0)
    appendField(fd, 'durationText', durationDays !== null ? `${durationDays}天` : '')
    appendField(fd, 'invoiceStatus', form.invoiceStatus)
    appendField(fd, 'contractNo', form.contractNo)
    appendField(fd, "sampleRequirement", form.hasSampleRequirement ? form.sampleRequirement : "");
    appendField(fd, 'installationRequirement', form.installationRequirement)
    appendField(fd, 'testingRequirement', form.testingRequirement)
    appendField(fd, 'orderRemark', form.orderRemark)
    appendField(fd, 'hasShootingTask', form.hasShootingTask)
    appendField(fd, 'shootingRequirement', form.hasShootingTask ? form.shootingRequirement : '')
    appendField(fd, 'creator', userInfo.value?.nickname || userInfo.value?.username || form.salespersonName)
    appendField(fd, 'hasReceivable', form.hasReceivable)
    appendField(fd, 'products', JSON.stringify(normalizedProducts()))

    if (form.hasReceivable) {
        appendField(fd, 'receivableDate', form.receivableDate)
        appendField(fd, 'incomeCategory', form.incomeCategory)
        appendField(fd, 'actualReceivableAmount', form.actualReceivableAmount ?? 0)
        appendField(fd, 'baseReceivedAmount', form.baseReceivedAmount || 0)
        appendField(fd, 'plannedPayments', JSON.stringify(form.plannedPayments.map((payment) => ({
            date: payment.date || null,
            amount: Number(payment.amount || 0),
            currency: payment.currency,
        }))))
        appendField(fd, 'receivableRemark', form.receivableRemark)
    }

    appendField(fd, 'orderImagesExisting', JSON.stringify(form.orderImages.filter((file) => !isFileAttachment(file))))
    appendField(fd, 'attachmentsExisting', JSON.stringify(form.attachments.filter((file) => !isFileAttachment(file))))
    appendField(
        fd,
        'receivableAttachmentsExisting',
        JSON.stringify(form.receivableAttachments.filter((file) => !isFileAttachment(file))),
    )
    form.orderImages.filter(isFileAttachment).forEach((file) => fd.append('orderImages', file))
    form.attachments.filter(isFileAttachment).forEach((file) => fd.append('attachments', file))
    form.receivableAttachments.filter(isFileAttachment).forEach((file) => fd.append('receivableAttachments', file))
    return fd
}

const createOrder = async (status: string) => {
    const isDraft = isDraftLikeStatus(status)
    if (!validateForm(!isDraft)) return
    submitting.value = true
    try {
        const res: any = await addSalesOrder()(buildSubmitData(status))
        if (res?.code !== 200) {
            showOrderMessage('error', res?.msg || '新增订单失败')
            return
        }
        showOrderMessage('success', isDraft ? '草稿已保存' : '订单已提交审核')
        emit('created')
        visible.value = false
    } catch (err: any) {
        console.error('新增订单失败:', err)
        showOrderMessage('error', err?.data?.msg || err?.message || '新增订单失败')
    } finally {
        submitting.value = false
    }
}

const updateOrder = async (status = props.order?.status || '待审核') => {
    if (isSalesOrderEditLocked(props.order || {})) {
        showOrderMessage("warning", SALES_ORDER_REJECTION_LOCK_MESSAGE);
        return;
    }
    const isDraft = isDraftLikeStatus(status)
    if (!validateForm(!isDraft)) return
    submitting.value = true
    try {
        const res: any = await updateSalesOrder()(buildSubmitData(status) as any)
        if (res?.code !== 200) {
            showOrderMessage('error', res?.msg || '保存订单失败')
            return
        }
        showOrderMessage(
            'success',
            isDraft
                ? (status === '已驳回' ? '修改已保存' : '草稿已保存')
                : (isRejectedOrder.value
                    ? '订单已重新提交审核'
                    : (props.order?.status === '草稿' ? '订单已提交审核' : '订单已保存')),
        )
        emit('updated')
        visible.value = false
    } catch (err: any) {
        console.error('保存订单失败:', err)
        showOrderMessage('error', err?.data?.msg || err?.message || '保存订单失败')
    } finally {
        submitting.value = false
    }
}

const submitOrder = () => {
    if (isEditMode.value) {
        void updateOrder(isDraftLikeStatus(props.order?.status) ? '待审核' : (props.order?.status || '待审核'))
        return
    }
    void createOrder('待审核')
}

const saveDraftOrder = () => {
    if (isEditMode.value) {
        void updateOrder(isRejectedOrder.value ? '已驳回' : '草稿')
        return
    }
    void createOrder('草稿')
}
</script>

<style lang="less" scoped>
:global(.add-order-message) {
    z-index: 5000 !important;
}

.order-dialog-mask {
    z-index: 3000;
}

.order-detail-dialog {
    max-width: 95vw;
    max-height: 90vh;
}

.order-detail-dialog :deep(.erp-dialog-frame__body) {
    align-content: start;
}

.dialog-body {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    gap: var(--erp-spacing-12);
}

.rejection-banner {
    display: flex;
    align-items: flex-start;
    gap: var(--erp-spacing-8);
    margin-bottom: var(--erp-spacing-16);
    padding: var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-error);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-bg-status-error-subtle);
    color: var(--erp-color-text-status-error);

    :deep(.iconify) {
        flex-shrink: 0;
        margin-top: 2px;
        font-size: var(--erp-size-icon-default);
    }

    div {
        display: grid;
        gap: var(--erp-spacing-4);
        min-width: 0;
    }

    strong {
        font-size: var(--erp-typography-content1-font-size);
        line-height: var(--erp-typography-content1-line-height);
    }

    span {
        color: var(--erp-color-text-status-error);
        font-size: var(--erp-typography-content1-font-size);
        line-height: var(--erp-typography-content1-line-height);
        white-space: pre-wrap;
        word-break: break-word;
    }

}

.form-section {
    min-width: 0;
    padding: var(--erp-spacing-12);
    margin: 0;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);

    h4 {
        margin: 0 0 var(--erp-spacing-12);
        color: var(--erp-color-text-primary);
        font-size: var(--erp-typography-title3-font-size);
        font-weight: var(--erp-typography-title3-font-weight);
        line-height: var(--erp-typography-title3-line-height);
    }
}

.section-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;

    button {
        border: none;
        background: transparent;
        color: var(--erp-color-text-status-error);
        cursor: pointer;
    }
}

.form-grid {
    display: grid;
    gap: var(--erp-spacing-12) var(--erp-spacing-20);
}

.customer-grid,
.three-cols {
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.order-info-grid {
    .requirement-field {
        grid-row: 5;
    }

    .shooting-requirement-field {
        grid-column: 1 / -1;
        grid-row: 4;
    }

    .sample-requirement-field {
        grid-column: 1;
    }

    .installation-requirement-field {
        grid-column: 2;
    }

    .testing-requirement-field {
        grid-column: 3;
    }

    .order-image-field {
        grid-column: 1 / 2;
        grid-row: 6;
    }
}

.receivable-grid {
    row-gap: var(--erp-spacing-12);
}

.planned-payments {
    grid-column: 1 / -1;
    grid-row: 3;
    display: grid;
    gap: var(--erp-spacing-12);
    min-width: 0;
}

.planned-payment-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: center;
    gap: var(--erp-spacing-12) var(--erp-spacing-20);

    &.has-remove {
        grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
    }
}

.planned-payment-totals {
    display: flex;
    flex-wrap: wrap;
    gap: var(--erp-spacing-8) var(--erp-spacing-16);
    font-size: var(--erp-typography-content1-font-size);
}

.add-planned-payment {
    justify-self: start;

    &:disabled {
        color: var(--erp-color-text-disabled);
        cursor: not-allowed;
    }
}

.contract-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--erp-spacing-12) var(--erp-spacing-20);
    align-items: start;

    .invoice-field {
        grid-column: 1 / 2;
        grid-row: 2;
    }

    .upload-field {
        grid-column: 2 / 3;
        grid-row: 2;
        max-width: 430px;

        small {
            grid-column: 2;
        }
    }
}

label {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: var(--erp-spacing-12);
    min-width: 0;

    span {
        color: var(--erp-color-text-primary);
        font-size: var(--erp-typography-content1-font-size);
        text-align: right;

        i {
            color: var(--erp-color-text-required);
            font-style: normal;
        }
    }

    input,
    select,
    textarea {
        width: 100%;
        min-width: 0;
        border: 1px solid var(--erp-color-border-default);
        border-radius: var(--erp-radius-control-default);
        color: var(--erp-color-text-primary);
        font-size: var(--erp-typography-content1-font-size);
        outline: none;
        background: var(--erp-color-fill-default);
        box-sizing: border-box;

        &:focus {
            border-color: var(--erp-color-border-brand);
        }

        &:disabled {
            color: var(--erp-color-text-disabled);
            background: var(--erp-color-fill-disabled);
        }
    }

    input,
    select {
        height: var(--erp-size-control-height-sm);
        padding: 0 10px;
    }

    :deep(.searchable-select) {
        --searchable-select-height: var(--erp-size-control-height-sm);
        --searchable-select-border: var(--erp-color-border-default);
        --searchable-select-radius: var(--erp-radius-control-default);
        --searchable-select-font-size: var(--erp-typography-content1-font-size);
        --searchable-select-active-border: var(--erp-color-border-brand);

        width: 100%;
    }

    :deep(.searchable-select-input) {
        padding: 0 30px 0 10px;
    }

    textarea {
        height: 92px;
        padding: 10px;
        resize: vertical;
    }
}

.machine-no-field {
    textarea {
        min-height: 34px;
        height: 52px;
        line-height: 1.5;
    }
}

.textarea-label,
.upload-field {
    align-items: flex-start;

    span {
        padding-top: 9px;
    }
}

.form-grid .upload-field {
    grid-column: span 2;

    small {
        grid-column: 2;
        color: var(--erp-color-text-placeholder);
        font-size: var(--erp-typography-note-font-size);
    }
}

.receivable-remark-field {
    grid-column: 3;
    grid-row: 2;
    align-self: stretch;

    textarea {
        min-height: 72px;
        height: 100%;
    }
}

.upload-field {
    small {
        color: var(--erp-color-text-placeholder);
        font-size: var(--erp-typography-note-font-size);
    }

    :deep(.upload-area) {
        padding: 24px 18px;
        border-radius: var(--erp-radius-control-default);
    }
}

.invoice-field {
    align-items: center;
}

.segmented {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;

    button {
        height: var(--erp-size-control-height-sm);
        padding: 0 12px;
        border: 1px solid var(--erp-color-border-default);
        border-radius: 999px;
        background: var(--erp-color-fill-default);
        color: var(--erp-color-text-secondary-strong);
        cursor: pointer;

        &.active {
            color: var(--erp-color-text-white);
            border-color: var(--erp-color-action-primary);
            background: var(--erp-color-action-primary);
        }

        &:disabled {
            cursor: not-allowed;
            opacity: 0.75;
        }
    }
}

.delivery-date-input {
    display: grid;
    gap: 6px;

    small {
        color: var(--erp-color-text-placeholder);
        font-size: var(--erp-typography-note-font-size);
    }
}

.add-receivable-btn,
.link-action,
.plain-action,
.danger-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: transparent;
    cursor: pointer;
}

.add-receivable-btn {
    display: flex;
    margin: 0 auto;
    color: var(--erp-color-text-brand);
}

.product-section {
    margin-bottom: 0;
}

.product-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
}

.link-action,
.plain-action {
    color: var(--erp-color-text-brand);
}

.danger-action {
    color: var(--erp-color-text-status-error);
}

.product-actions {
    display: flex;
    align-items: center;
    gap: 14px;
}

.product-table {
    --product-grid-columns: 56px 140px 170px 100px 110px 90px 70px 96px 110px 90px 90px 110px 72px;
    --product-grid-width: 1424px;

    width: 100%;
    min-width: 0;
    max-width: 100%;
    overflow-x: auto;

    &.is-view-mode {
        --product-grid-columns: 56px 140px 170px 100px 110px 90px 70px 96px 110px 90px 90px 110px;
        --product-grid-width: 1344px;

        border: 1px solid var(--erp-color-border-muted);
        border-radius: var(--erp-radius-surface-default);

        .product-header {
            min-height: 48px;
            border-radius: 0;
        }

        .product-row {
            min-height: 64px;
            margin-top: 0;
            border-top: 1px solid var(--erp-color-divider-default);
            border-radius: 0;
            box-shadow: none;
        }
    }
}

.product-table-inner {
    width: 100%;
    min-width: var(--product-grid-width);
}

.product-grid {
    display: grid;
    grid-template-columns: var(--product-grid-columns);
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    box-sizing: border-box;
    width: 100%;

    > * {
        min-width: 0;
    }
}

.product-action-cell {
    position: sticky;
    right: 0;
    z-index: 2;
    height: calc(100% + 20px);
    margin: -10px -12px -10px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: inherit;
    box-shadow: -8px 0 12px rgba(255, 255, 255, 0.88);
}

.product-header {
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-table-header);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-title3-font-weight);

    > div {
        overflow: hidden;
        text-align: center;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .product-action-cell {
        z-index: 3;
        height: 100%;
        margin: 0 -12px 0 0;
        background: var(--erp-color-fill-table-header);
    }
}

.product-row {
    margin-top: 8px;
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    box-shadow: inset 0 0 0 1px var(--erp-color-border-muted);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);

    input,
    select,
    textarea {
        width: 100%;
        height: 28px;
        border: 1px solid var(--erp-color-border-default);
        border-radius: var(--erp-radius-control-default);
        padding: 0 8px;
        box-sizing: border-box;
    }

    > div:first-child {
        text-align: center;
    }
}

.readonly-cell {
    min-width: 0;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.text-strong {
    font-weight: 600;
}

.number-input {
    text-align: center;
}

.product-row .remark-input {
    height: auto;
    min-height: 64px;
    padding: 6px 8px;
    font: inherit;
    line-height: 1.5;
    text-align: left;
    resize: vertical;
}

.amount-cell {
    font-weight: 600;
}

.row-delete-btn {
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: var(--erp-radius-control-default);
    background: transparent;
    color: var(--erp-color-text-status-error);
    cursor: pointer;

    &:hover {
        background: var(--erp-color-bg-status-error-subtle);
    }
}

.product-image {
    width: 70px;
    height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    justify-self: center;
    background: var(--erp-color-fill-control-secondary);
    color: var(--erp-color-text-placeholder);

    img {
        width: 100%;
        height: 100%;
        cursor: zoom-in;
        object-fit: contain;
    }
}

.empty-products {
    padding: 28px 0;
    color: var(--erp-color-text-placeholder);
    text-align: center;
}

.order-detail-dialog :deep(.dialog-button.draft) {
    border: 1px solid var(--erp-color-border-brand);
    color: var(--erp-color-text-brand);
    background: var(--erp-color-fill-nav-selected);
}

@media (max-width: 900px) {
    .customer-grid,
    .three-cols,
    .contract-grid {
        grid-template-columns: 1fr;
    }

    .order-info-grid {
        .requirement-field,
        .shooting-requirement-field,
        .sample-requirement-field,
        .installation-requirement-field,
        .testing-requirement-field,
        .order-image-field {
            grid-column: 1;
            grid-row: auto;
        }
    }

    .contract-grid {
        .invoice-field,
        .upload-field {
            grid-column: 1;
            grid-row: auto;
            max-width: none;
        }
    }

    .upload-field {
        grid-column: span 1;
    }

    .receivable-remark-field {
        grid-column: 1;
        grid-row: auto;

        textarea {
            height: 92px;
        }
    }

    .planned-payments {
        grid-column: 1;
        grid-row: auto;
    }

    .planned-payment-row,
    .planned-payment-row.has-remove {
        grid-template-columns: 1fr;

        > button {
            justify-self: end;
        }
    }

    label {
        grid-template-columns: 82px minmax(0, 1fr);
    }
}
</style>
