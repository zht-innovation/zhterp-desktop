    <template>
    <div class="customer-item" :class="{ 'assigned-highlight': shouldHighlightAssigned, 'has-selection': enableSelect }">
        <div class="customer-info-pane customer-sync-scroll">
            <div class="customer-info-content">
                <div v-if="enableSelect" class="select-col">
                    <input
                        type="checkbox"
                        :checked="isSelected"
                        @change="handleSelectChange"
                    />
                </div>
                <!-- 附件区域 - 放在最前面 -->
                <div class="attachments-col" v-if="customer.attachments && customer.attachments.length > 0">
                    <el-popover
                        trigger="click"
                        placement="right"
                        :width="300"
                        popper-class="attachments-popover"
                    >
                        <template #reference>
                            <div class="attachment-badge">
                                <Icon name="mdi:paperclip" class="attachment-icon" />
                            </div>
                        </template>
                        <div class="attachments-list">
                            <div class="attachments-title">附件列表</div>
                            <div 
                                v-for="(attachment, index) in customer.attachments" 
                                :key="index" 
                                class="attachment-item"
                                @click="handleAttachmentClick(attachment)"
                            >
                                <Icon :name="getFileIcon(attachment)" class="file-icon" />
                                <span class="file-name">{{ getFileName(attachment) }}</span>
                                <Icon 
                                    :name="isImageFile(attachment) ? 'mdi:eye' : 'mdi:download'" 
                                    class="action-icon"
                                />
                            </div>
                        </div>
                    </el-popover>
                </div>

                <!-- Left: Avatar -->
                <div class="avatar-col">
                    <div class="avatar" ref="avatarDom" :style="avatarStyle"></div>
                    <el-popover
                        v-if="!shouldMaskName"
                        trigger="hover"
                        placement="top"
                        :width="200"
                    >
                        <div class="name-popover-content">{{ customer.name }}</div>
                        <template #reference>
                            <div class="name" v-html="highlightText(customer.name, 'name')"></div>
                        </template>
                    </el-popover>
                    <div v-else class="name">{{ maskedName }}</div>
                    <div class="label" style="color: #91929e;">{{ customer._addTime ? customer._addTime.split('T')[0].replace(/-/g, '.') : '' }}</div>
                </div>

                <!-- Middle: Info Grid -->
                <div class="info-grid">
            <!-- Tags -->
            <div class="col tags-wrapper">
                
                <div v-for="(tag, i) in customer.tags" :key="i">
                    <el-popover
                        v-if="tag.type === 'yellow'"
                        trigger="hover"
                        placement="top"
                        :width="260"
                    >
                        <div class="tag-popover-content" v-html="highlightTagText(tag)"></div>
                        <template #reference>
                            <span class="tag" :class="tag.type" v-html="highlightTagText(tag)"></span>
                        </template>
                    </el-popover>
                    <span v-else class="tag" :class="tag.type" v-html="highlightTagText(tag)"></span>
                </div>
            </div>

            <!-- Location -->
            <div class="col">
                <div class="field">
                    <div class="label">国家/地区</div>
                    <div class="value" v-html="highlightText(customer.country, 'country')"></div>
                </div>
                <div class="field mt-2">
                    <div class="label">城市</div>
                    <div class="value" v-html="highlightText(customer.city, 'city')"></div>
                </div>
            </div>

            <!-- Contact -->
            <div class="col contact-col">
                <div class="field">
                    <div class="label">电话</div>
                    <div
                        class="value"
                        v-html="shouldMaskPrivate ? '******' : (customer.phone ? highlightText(customer.phone, 'phone') : '无')"
                    ></div>
                </div>
                <div class="field mt-2">
                    <div class="label">WhatsApp</div>
                    <div class="value" v-html="shouldMaskPrivate ? '******' : highlightText(customer.whatsapp, 'whatsapp')"></div>
                </div>
                <div class="field mt-2">
                    <div class="label">微信</div>
                    <div class="value" v-html="shouldMaskPrivate ? '******' : highlightText(customer.wechat, 'wechat')"></div>
                </div>
            </div>

            <!-- Email -->
            <div class="col">
                <div class="value" v-html="shouldMaskPrivate ? '*********************' : highlightText(customer.email, 'email')"></div>
            </div>

            <!-- Company -->
            <div class="col company-col">
                <div class="value" v-html="shouldMaskPrivate ? '*****' : highlightText(customer.company, 'company')"></div>
                <div class="sub-text mt-1">
                    主营：{{ shouldMaskPrivate ? '******' : (customer.companyDetail || '-') }}
                </div>
                <div class="sub-text mt-1" v-if="customer.companyWebsite">
                    <a
                        class="company-website"
                        :href="toUrl(customer.companyWebsite)"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        网站：{{ shouldMaskPrivate ? '******' : customer.companyWebsite }}
                    </a>
                </div>
            </div>

            <!-- Social -->
            <div class="col">
                <div class="value">{{ customer.source }}</div>
                <div class="sub-text mt-1">{{ customer.sourceDetail }}</div>
            </div>

            <!-- Deal Count -->
            <div class="col">
                <div class="value">{{ dealOrderCount }}</div>
            </div>

            <!-- Sales Person -->
            <div class="col sales-col">
                <div class="value" v-html="customer?._isAssigned ? highlightText(customer.assignSalespersonName ?? customer.salesPerson ?? '-', 'salesperson') : '暂无'"></div>
                <el-tooltip
                    v-if="!isSalesperson && select === 0 && customer._isAssigned"
                    :content="maintenanceTooltip"
                    placement="top"
                    popper-class="maintenance-tooltip"
                >
                    <div class="maintenance-chip" :class="maintenanceChipClass">
                        <Icon name="lucide:alarm-clock" class="maintenance-chip-icon" />
                        <span class="maintenance-chip-text">{{ maintenanceLeftText }}</span>
                    </div>
                </el-tooltip>
            </div>
                </div>
            </div>
        </div>

        <!-- Right: Actions -->
        <div class="actions-col">
            <!-- 销售人员：显示剩余维护时间 -->
            <div
                v-if="isSalesperson && select === 0 && customer._isAssigned"
                class="maintenance-left"
            >
                <div class="maintenance-label">剩余维护时间</div>
                <div class="maintenance-value">{{ maintenanceLeftText }}</div>
            </div>

            <button
                class="btn btn-extend"
                v-if="isSalesperson && select === 0 && customer._isAssigned"
                @click="customer._isApplying ? null : (showExtendDialog = true)"
                :disabled="customer._isApplying"
            >
                <Icon name="mdi:calendar-plus" class="btn-icon" />
                {{ customer._isApplying ? '等待审核' : '延长维护' }}
            </button>

            <button class="btn btn-edit" v-if="!isSalesperson && select !== 2" @click="showEditSalesDialog = true">
                <Icon name="mdi:account-switch" class="btn-icon" />
                修改销售
            </button>
            <button
                class="btn btn-unassign"
                v-if="!isSalesperson && select !== 2 && customer._isAssigned"
                @click="handleUnassignCustomer"
                :disabled="isUnassigning"
            >
                <Icon name="mdi:account-remove" class="btn-icon" />
                放回公共池
            </button>
            <button class="btn btn-edit-customer" v-if="canEditCustomer" @click="openEditCustomerDialog">
                <Icon name="mdi:account-edit" class="btn-icon" />
                编辑客户
            </button>
            <button 
                class="btn" 
                :class="customer._isApplying ? 'btn-pending' : 'btn-apply'"
                v-if="isSalesperson && select === 1" 
                @click="customer._isApplying ? null : showApplyDialog = true"
                :disabled="customer._isApplying"
            >
                <Icon :name="customer._isApplying ? 'mdi:clock-outline' : 'mdi:handshake-outline'" class="btn-icon" />
                {{ customer._isApplying ? '等待审核' : '申请对接' }}
            </button>
            <button class="btn btn-log" v-if="select === 0 && customer._isAssigned" @click="goToLogs">
                <Icon name="mdi:book-open-variant" class="btn-icon" />
                查看日志
            </button>
            <button class="btn btn-order" v-if="canAddOrder" @click="showAddOrderDialog = true">
                <Icon name="material-symbols:add-shopping-cart" class="btn-icon" />
                新增订单
            </button>
            <button
                v-if="!isSalesperson && select !== 2"
                class="btn btn-history"
                @click="showTermHistory = true"
            >
                <Icon name="mdi:history" class="btn-icon" />
                历史记录
            </button>
            <button 
                class="btn btn-fake-del" 
                v-if="!isSalesperson && select !== 2 && !customer._isAssigned && !customer._isApplying"
                @click="handleFakeDel"
            >
                <Icon name="mdi:trash-can-outline" class="btn-icon" />
                入回收站
            </button>
            <button 
                class="btn btn-recover" 
                v-if="!isSalesperson && select === 2"
                @click="handleRecover(customer._id)"
            >恢复客户</button>
            <button 
                class="btn btn-del" 
                v-if="!isSalesperson && select === 2"
                @click="handleDelForever(customer._id)"
            >永久删除</button>
        </div>
    </div>

    <!-- 图片预览弹窗 -->
    <AttachmentImagePreview
        v-model="showImagePreview"
        :title="previewFileName"
        :src="previewImageUrl"
    >
        <template #footer>
            <el-button @click="showImagePreview = false">关闭</el-button>
            <el-button type="primary" @click="downloadFile(previewAttachmentPath, previewFileName)">下载</el-button>
        </template>
    </AttachmentImagePreview>

    <!-- 申请对接弹窗 -->
    <Teleport to="body">
        <div v-if="showApplyDialog" class="dialog-overlay erp-selectable" @click.self="showApplyDialog = false">
            <div class="dialog-box">
                <h3 class="dialog-title">申请对接</h3>
                <div class="dialog-content">
                    <div class="customer-info">
                        <p><strong>客户:</strong> {{ customer.name }}</p>
                        <p><strong>公司:</strong> {{ customer.company }}</p>
                    </div>
                    <div class="form-group">
                        <label>对接时长</label>
                        <select v-model="applyMonths" class="select-input">
                            <option value="3">3个月</option>
                            <option value="6">6个月</option>
                            <option value="9">9个月</option>
                            <option value="12">12个月</option>
                        </select>
                    </div>
                </div>
                <div class="dialog-actions">
                    <button class="btn-cancel" @click="showApplyDialog = false">取消</button>
                    <button class="btn-confirm" @click="handleApplyContact" :disabled="isSubmitting">
                        {{ isSubmitting ? '提交中...' : '确认申请' }}
                    </button>
                </div>
            </div>
        </div>
    </Teleport>

    <!-- 申请延长维护弹窗 -->
    <Teleport to="body">
        <div v-if="showExtendDialog" class="dialog-overlay erp-selectable" @click.self="showExtendDialog = false">
            <div class="dialog-box">
                <h3 class="dialog-title">延长维护</h3>
                <div class="dialog-content">
                    <div class="customer-info">
                        <p><strong>客户:</strong> {{ customer.name }}</p>
                        <p><strong>公司:</strong> {{ customer.company }}</p>
                    </div>
                    <div class="form-group">
                        <label>延长时长</label>
                        <select v-model="extendMonths" class="select-input">
                            <option value="3">3个月</option>
                            <option value="6">6个月</option>
                            <option value="9">9个月</option>
                            <option value="12">12个月</option>
                        </select>
                    </div>
                </div>
                <div class="dialog-actions">
                    <button class="btn-cancel" @click="showExtendDialog = false">取消</button>
                    <button class="btn-confirm" @click="handleRequestExtend" :disabled="isRequestingExtend">
                        {{ isRequestingExtend ? '提交中...' : '确认申请' }}
                    </button>
                </div>
            </div>
        </div>
    </Teleport>

    <!-- 修改销售弹窗 -->
    <Teleport to="body">
        <div v-if="showEditSalesDialog" class="dialog-overlay erp-selectable" @click.self="showEditSalesDialog = false">
            <div class="dialog-box">
                <h3 class="dialog-title">修改销售</h3>
                <div class="dialog-content">
                    <div class="customer-info">
                        <p><strong>客户:</strong> {{ customer.name }}</p>
                        <p><strong>公司:</strong> {{ customer.company }}</p>
                        <p v-if="customer.assignSalespersonName"><strong>当前销售:</strong> {{ customer.assignSalespersonName }}</p>
                    </div>
                    <div class="form-group">
                        <label>选择新的销售人员</label>
                        <select v-model="selectedSalespersonId" class="select-input">
                            <option value="">请选择销售人员</option>
                            <option 
                                v-for="sales in salespersonList" 
                                :key="sales._id" 
                                :value="sales._id"
                            >
                                {{ sales.name }} ({{ sales.country }})
                            </option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>对接时长</label>
                        <select v-model="editApplyMonths" class="select-input">
                            <option value="3">3个月</option>
                            <option value="6">6个月</option>
                            <option value="9">9个月</option>
                            <option value="12">12个月</option>
                        </select>
                    </div>
                </div>
                <div class="dialog-actions">
                    <button class="btn-cancel" @click="showEditSalesDialog = false">取消</button>
                    <button 
                        class="btn-confirm" 
                        @click="handleEditSales" 
                        :disabled="isEditingSales || !selectedSalespersonId"
                    >
                        {{ isEditingSales ? '处理中...' : '确认修改' }}
                    </button>
                </div>
            </div>
        </div>
    </Teleport>

    <AddCustomerDialog
        v-model="showEditCustomerDialog"
        mode="edit"
        :initial-data="editInitialData"
        @submit="handleUpdateCustomer"
    />

    <AddOrderDialog
        v-model="showAddOrderDialog"
        :customer="customer"
        @created="handleOrderCreated"
    />
    <CustomerTermHistoryDialog
        v-model="showTermHistory"
        :customer-id="customer?._id || ''"
        :customer-name="customer?.name || ''"
    />
</template>

<script setup lang="ts">
import { highlightTextHtml } from "~/utils/highlightText";
import { applyContact } from '~/composables/api/useAppApi'
import { changeSalesperson, updateCustomer, fakeDelCustomer, deleteCustomer, recoverCustomer, unassignCustomer } from '~/composables/api/useCustomerApi'
import { retrieveSalespersonList } from '~/composables/api/useSalespersonApi'
import { submitLog } from '~/composables/api/useLogApi'
import useDrop from '~/composables/useDrop'
import { useRouter } from 'vue-router'
import AddCustomerDialog from '~/components/configuration/sales/AddCustomerDialog.vue'
import AddOrderDialog from '~/components/configuration/sales/AddOrderDialog.vue'
import AttachmentImagePreview from '~/components/configuration/sales/AttachmentImagePreview.vue'
import CustomerTermHistoryDialog from '~/components/configuration/sales/CustomerTermHistoryDialog.vue'
import { downloadAttachmentFile, resolveErpImageUrl, toAbsoluteAttachmentUrl } from '~/utils/attachmentPreview'

const props = defineProps<{
    customer: any
    select: number
    isSalesperson: boolean
    highlightKeyword?: string
    matchedFields?: string[]
    enableSelect?: boolean
    isSelected?: boolean
}>()

type CustomerAttachment =
    | string
    | {
          path?: string
          originalName?: string
          name?: string
      }

const emit = defineEmits<{
    refresh: []
    'toggle-select': [payload: { id: string; checked: boolean; customer: any }]
}>()

const router = useRouter()

const shouldMaskPrivate = computed(() => props.isSalesperson && !props.customer?._isAssigned)
const shouldMaskName = computed(() => props.isSalesperson && !props.customer?._isAssigned)
const maskedName = computed(() => {
    const raw = (props.customer?.name || '').trim()
    const initial = raw ? raw.slice(0, 1) : '*'
    return `${initial}****`
})
const isRecycled = computed(() => props.select === 2 || Boolean(props.customer?._isFakeDel))
const shouldHighlightAssigned = computed(
    () => props.isSalesperson && Boolean(props.customer?._assignedByAdmin)
)
const isUnassigning = ref(false)
const toFiniteNumber = (value: any) => {
    const num = Number(value)
    return Number.isFinite(num) ? num : 0
}
const dealOrderCount = computed(() =>
    toFiniteNumber(props.customer?.dealOrderCount ?? props.customer?.orderCount)
)
const dealTotalAmount = computed(() =>
    toFiniteNumber(props.customer?.dealTotalAmount ?? props.customer?.totalDealAmount)
)
const formattedDealAmount = computed(() =>
    dealTotalAmount.value.toLocaleString('zh-CN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
)
const showTermHistory = ref(false)

const handleSelectChange = (event: Event) => {
    const target = event.target as HTMLInputElement
    if (!props.customer?._id) return
    emit('toggle-select', {
        id: props.customer._id,
        checked: target.checked,
        customer: props.customer,
    })
}

// 附件预览弹窗状态
const showImagePreview = ref(false)
const previewFileName = ref('')
const previewImageUrl = ref('')
const previewAttachmentPath = ref('') // 新增：存储原始附件路径

const avatarDom = ref() as Ref<HTMLElement>
const defaultAvatar = '/default-avatar.svg'
const avatarUrl = ref<string>(props.customer.avatar || '')
watch(
    () => props.customer.avatar,
    (v) => {
        avatarUrl.value = v || ''
    }
)
const avatarStyle = computed(() => ({
    backgroundImage: `url(${resolveErpImageUrl(avatarUrl.value) || defaultAvatar})`,
}))

const saveAvatar = async (path: string) => {
    try {
        const res: any = await updateCustomer()({
            id: props.customer?._id,
            avatar: path,
        })
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '更新头像失败')
            return
        }
        avatarUrl.value = path
        ElMessage.success('头像已更新')
        emit('refresh')
    } catch (err) {
        console.error('更新客户头像失败:', err)
        ElMessage.error('更新头像失败')
    }
}

useDrop(
    avatarDom,
    (path) => {
        void saveAvatar(path)
    },
    { accept: 'image/*' }
)

const toUrl = (raw: string) => {
    const val = (raw || '').trim()
    if (!val) return '#'
    if (val.startsWith('http://') || val.startsWith('https://')) return val
    return `https://${val}`
}

const showApplyDialog = ref(false)
const applyMonths = ref(3)
const isSubmitting = ref(false)

// 申请延长维护（销售人员）
const showExtendDialog = ref(false)
const extendMonths = ref(3)
const isRequestingExtend = ref(false)

const showEditSalesDialog = ref(false)
const selectedSalespersonId = ref('')
const editApplyMonths = ref(3)
const isEditingSales = ref(false)
const salespersonList = ref<any[]>([])

const showEditCustomerDialog = ref(false)
const showAddOrderDialog = ref(false)
const isUpdatingCustomer = ref(false)
const editInitialData = computed(() => {
    const c = props.customer || {}
    return {
        name: c.name || '',
        country: c.country || '',
        city: c.city || '',
        phone: c.phone || '',
        whatsapp: c.whatsapp || '',
        wechat: c.wechat || '',
        email: c.email || '',
        company: c.company || '',
        companyDetail: c.companyDetail || '',
        companyWebsite: c.companyWebsite || '',
        customerType: c.customerType || '',
        customerLevel: c.customerLevel || '',
        source: c.source || '',
        sourceDetail: c.sourceDetail || '',
        customTags: Array.isArray(c.customTags) ? c.customTags : [],
        attachments: Array.isArray(c.attachments) ? c.attachments : [],
    }
})

const openEditCustomerDialog = () => {
    showEditCustomerDialog.value = true
}

const salespersonId = useState<string | null>('salesperson_id')
const canEditCustomer = computed(() => {
    if (props.select === 2) return false
    if (!props.isSalesperson) return true
    if (!props.customer?._isAssigned) return false
    const myId = salespersonId.value?.toString()
    const customerSalesId = props.customer?._assignSalespersonId?.toString()
    return Boolean(myId && customerSalesId && myId === customerSalesId)
})
const canAddOrder = computed(() => {
    if (props.select === 2) return false
    if (!props.customer?._isAssigned) return false
    if (!props.isSalesperson) return true
    const myId = salespersonId.value?.toString()
    const customerSalesId = props.customer?._assignSalespersonId?.toString()
    return Boolean(myId && customerSalesId && myId === customerSalesId)
})

const handleOrderCreated = () => {
    emit('refresh')
}

const parseDateOnly = (raw: unknown): Date | null => {
    if (!raw) return null
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
    if (typeof raw === 'number') {
        const dt = new Date(raw)
        return Number.isNaN(dt.getTime()) ? null : dt
    }
    if (typeof raw !== 'string') return null
    const s = raw.trim()
    if (!s) return null

    // 优先支持带时间的字符串（ISO / "YYYY-MM-DD HH:mm:ss"）
    if (/[T ]\d{2}:\d{2}/.test(s)) {
        const dt = new Date(s)
        return Number.isNaN(dt.getTime()) ? null : dt
    }

    // 支持：YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
    const parts = s.split(/[-/.]/).map((p) => p.trim()).filter(Boolean)
    if (parts.length < 3) return null
    const y = Number(parts[0])
    const m = Number(parts[1])
    const d = Number(parts[2])
    if (!y || !m || !d) return null
    // 若只有日期，则按当天结束时间计算（更符合“剩余几小时”的展示）
    const dt = new Date(y, m - 1, d, 23, 59, 59, 999)
    return Number.isNaN(dt.getTime()) ? null : dt
}

const maintenanceEndRaw = computed(() => {
    return (
        props.customer.expireDate
    )
})

const formatYmd = (d: Date): string => {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

const maintenanceEndYmd = computed(() => {
    const end = parseDateOnly(maintenanceEndRaw.value)
    return end ? formatYmd(end) : ''
})

const maintenanceLeftText = computed(() => {
    const end = parseDateOnly(maintenanceEndRaw.value)
    if (!end) return '-'

    const now = new Date()
    const diffMs = end.getTime() - now.getTime()
    if (diffMs <= 0) return '已到期'

    const dayMs = 1000 * 60 * 60 * 24
    const hourMs = 1000 * 60 * 60
    const tenDaysMs = 10 * dayMs

    // 超过 10 天：只显示天数
    if (diffMs > tenDaysMs) {
        const days = Math.ceil(diffMs / dayMs)
        return `${days}天`
    }

    // 不足 10 天：显示“几天几小时”（小时向上取整）
    const days = Math.floor(diffMs / dayMs)
    let hours = Math.ceil((diffMs - days * dayMs) / hourMs)
    if (hours >= 24) {
        return `${days + 1}天0小时`
    }
    return `${days}天${hours}小时`
})

const maintenanceLeftVariant = computed<'ok' | 'warning' | 'expired' | 'muted'>(() => {
    const end = parseDateOnly(maintenanceEndRaw.value)
    if (!end) return 'muted'

    const diffMs = end.getTime() - Date.now()
    if (diffMs <= 0) return 'expired'

    const dayMs = 1000 * 60 * 60 * 24
    const daysLeft = diffMs / dayMs
    if (daysLeft <= 7) return 'warning'
    return 'ok'
})

const maintenanceChipClass = computed(() => {
    return `maintenance-chip--${maintenanceLeftVariant.value}`
})

const maintenanceTooltip = computed(() => {
    const endText = maintenanceEndYmd.value ? `（截止 ${maintenanceEndYmd.value}）` : ''
    return `剩余维护时间：${maintenanceLeftText.value}${endText}`
})

// 获取销售人员列表
const fetchSalespersonList = async () => {
    try {
        const res: any = await retrieveSalespersonList()()
        if (res?.data?.salesperson) {
            salespersonList.value = res.data.salesperson.filter((sp: any) => !sp._isFakeDel)
        }
    } catch (error) {
        console.error('获取销售列表失败:', error)
    }
}

const handleApplyContact = async () => {
    if (!salespersonId.value) {
        return
    }

    isSubmitting.value = true
    
    try {
        const appDays = applyMonths.value * 30
        
        await applyContact()({
            appCustomerId: props.customer._id,
            appSalespersonId: salespersonId.value,
            appDays
        })
        
        ElMessage.success('申请对接成功，等待管理员审核')
        showApplyDialog.value = false
        emit('refresh')
    } catch (error: any) {
        console.error('申请对接失败:', error)
        ElMessage.error('申请对接失败，请稍后重试')
    } finally {
        isSubmitting.value = false
    }
}

const handleRequestExtend = async () => {
    if (!salespersonId.value) {
        ElMessage.error('未获取到销售ID')
        return
    }

    isRequestingExtend.value = true

    try {
        const appDays = extendMonths.value * 30

        await applyContact()({
            appCustomerId: props.customer._id,
            appSalespersonId: salespersonId.value,
            appDays,
        })

        ElMessage.success('已提交延长维护申请，等待管理员审核')
        showExtendDialog.value = false
        emit('refresh')
    } catch (error: any) {
        console.error('申请延长维护失败:', error)
        ElMessage.error('申请延长维护失败，请稍后重试')
    } finally {
        isRequestingExtend.value = false
    }
}

const handleEditSales = async () => {
    if (!selectedSalespersonId.value) {
        ElMessage.warning('请选择销售人员')
        return
    }

    isEditingSales.value = true
    
    try {
        const appDays = editApplyMonths.value * 30
        
        await changeSalesperson()({
            customerId: props.customer._id,
            newSalespersonId: selectedSalespersonId.value,
            appDays
        })
        
        ElMessage.success('销售分配修改成功')
        showEditSalesDialog.value = false
        emit('refresh')
    } catch (error: any) {
        console.error('修改销售失败:', error)
        ElMessage.error('修改销售失败，请稍后重试')
    } finally {
        isEditingSales.value = false
    }
}

const handleUnassignCustomer = async () => {
    if (!props.customer?._id) return
    try {
        await ElMessageBox.confirm(
            `确定将客户「${props.customer.name}」放回公共客户池吗？`,
            '放回公共池',
            {
                confirmButtonText: '确认',
                cancelButtonText: '取消',
                type: 'warning',
            }
        )
    } catch {
        return
    }

    isUnassigning.value = true
    try {
        const res: any = await unassignCustomer()({ customerId: props.customer._id })
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '放回公共池失败')
            return
        }
        ElMessage.success('已放回公共客户池')
        emit('refresh')
    } catch (error: any) {
        console.error('放回公共池失败:', error)
        ElMessage.error(error?.data?.msg || error?.message || '放回公共池失败')
    } finally {
        isUnassigning.value = false
    }
}

const handleUpdateCustomer = async (formData: any) => {
    if (!props.customer?._id) return
    if (!formData?.name || !formData.name.trim()) {
        ElMessage.warning('请填写客户姓名')
        return
    }

    isUpdatingCustomer.value = true

    // 处理 source 数组（后端期望的格式）
    let source = ''
    let sourceDetail = ''
    if (Array.isArray(formData.source) && formData.source.length > 0) {
        source = formData.source[0]
        sourceDetail = formData.source[formData.source.length - 1]
    }

    try {
        const formDataToSend = new FormData()
        formDataToSend.append('id', props.customer._id)
        formDataToSend.append('name', formData.name.trim())
        formDataToSend.append('country', formData.country || '')
        formDataToSend.append('city', formData.city || '')
        formDataToSend.append('phone', formData.phone || '')
        formDataToSend.append('whatsapp', formData.whatsapp || '')
        formDataToSend.append('wechat', formData.wechat || '')
        const emailText = typeof formData.email === 'string' ? formData.email.trim() : ''
        formDataToSend.append('email', emailText === '无' ? '----------------------' : (formData.email || ''))
        formDataToSend.append('company', formData.company || '')
        formDataToSend.append('companyDetail', formData.companyDetail || '')
        formDataToSend.append('companyWebsite', formData.companyWebsite || '')
        formDataToSend.append('customerType', formData.customerType || '')
        formDataToSend.append('customerLevel', formData.customerLevel || '')
        formDataToSend.append('source', source)
        formDataToSend.append('sourceDetail', sourceDetail)

        if (Array.isArray(formData.customTags)) {
            formData.customTags.forEach((tag: string) => {
                formDataToSend.append('customTags', tag)
            })
        }

        if (Array.isArray(formData.removedAttachments)) {
            formData.removedAttachments.forEach((path: string) => {
                formDataToSend.append('removedAttachments', path)
            })
        }

        if (Array.isArray(formData.attachments)) {
            formData.attachments.forEach((file: File) => {
                formDataToSend.append('attachments', file)
            })
        }

        const res: any = await updateCustomer()(formDataToSend)
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '更新客户信息失败')
            return
        }

        ElMessage.success('客户信息已更新')
        showEditCustomerDialog.value = false
        emit('refresh')
    } catch (error: any) {
        console.error('更新客户信息失败:', error)
        ElMessage.error('更新客户信息失败，请稍后重试')
    } finally {
        isUpdatingCustomer.value = false
    }
}

// 跳转到日志页面
const goToLogs = () => {
    const customerId = props.customer._id
    const salespersonId = props.customer._assignSalespersonId
    
    if (customerId && salespersonId) {
        router.push({
            path: '/configuration/sales/logs',
            query: {
                salespersonId,
                customerId
            }
        })
    }
}

// 放入回收站
const handleFakeDel = async () => {
    try {
        await ElMessageBox.confirm(
            `确定要将客户「${props.customer.name}」放入回收站吗？`,
            '放入回收站',
            {
                confirmButtonText: '确定',
                cancelButtonText: '取消',
                type: 'warning',
            }
        )
        
        const res: any = await fakeDelCustomer()([props.customer._id])
        if (res?.code === 200) {
            ElMessage.success('已放入回收站')
            emit('refresh')
        } else {
            ElMessage.error(res?.msg || '操作失败')
        }
    } catch (error: any) {
        if (error !== 'cancel') {
            console.error('放入回收站失败:', error)
            ElMessage.error('操作失败，请稍后重试')
        }
    }
}

const handleDelForever = async (customerId: string) => {
    try {
        await ElMessageBox.confirm(
            `确定要永久删除客户「${props.customer.name}」吗？此操作不可撤销！`,
            '永久删除客户',
            {
                confirmButtonText: '删除',
                cancelButtonText: '取消',
                type: 'error',
            }
        )
        
        const res: any = await deleteCustomer()([customerId])
        if (res?.code === 200) {
            ElMessage.success('客户已永久删除')
            emit('refresh')
        } else {
            ElMessage.error(res?.msg || '操作失败')
        }
    } catch (error: any) {
        if (error !== 'cancel') {
            console.error('永久删除客户失败:', error)
            ElMessage.error('操作失败，请稍后重试')
        }
    }
}

const handleRecover = async (customerId: string) => {
    try {
        await ElMessageBox.confirm(
            `确定要恢复客户「${props.customer.name}」吗？`,
            '客户恢复至客户池',
            {
                confirmButtonText: '恢复',
                cancelButtonText: '取消',
                type: 'info',
            }
        )
        
        const res: any = await recoverCustomer()([customerId])
        if (res?.code === 200) {
            ElMessage.success('客户已恢复')
            emit('refresh')
        } else {
            ElMessage.error(res?.msg || '操作失败')
        }
    } catch (error: any) {
        if (error !== 'cancel') {
            console.error('恢复客户失败:', error)
            ElMessage.error('操作失败，请稍后重试')
        }
    }
}

// 高亮文本函数
const highlightText = (text: string | undefined, ...fields: string[]) => {
    const hasMatch = !props.matchedFields || props.matchedFields.length === 0
        || fields.some(field => props.matchedFields?.includes(field))
    return highlightTextHtml(text || '', hasMatch ? props.highlightKeyword : undefined)
}

const highlightTagText = (tag: { label: string; type: string }) => {
    const label = tag?.label || ''
    if (!label) return ''
    const field =
        tag.type === 'yellow'
            ? 'customTags'
            : tag.type === 'cyan'
                ? 'customerType'
                : tag.type.startsWith('level-')
                    ? 'customerLevel'
                    : ''
    return field ? highlightText(label, field) : highlightTextHtml(label)
}


// 获取文件名称
const getAttachmentPath = (attachment: CustomerAttachment) =>
    typeof attachment === 'string' ? attachment : attachment?.path || ''

const decodeFileName = (name: string) => {
    if (!name) return ''
    try {
        // 处理 URL 编码字符 (例如 %20 转为空格)
        return decodeURIComponent(name)
    } catch (e) {
        return name
    }
}

const getFileName = (attachment: CustomerAttachment) => {
    if (!attachment) return ''
    if (typeof attachment === 'object') {
        const original = attachment.originalName || attachment.name || ''
        if (original) return decodeFileName(original)
    }
    const path = getAttachmentPath(attachment)
    if (!path) return ''
    // 获取路径最后一部分作为文件名
    const name = path.split(/[/\\]/).pop() || ''
    return decodeFileName(name)
}

// 获取文件后缀名 (内部辅助函数)
const getFileExt = (attachment: CustomerAttachment) => {
    const name = getFileName(attachment)
    const parts = name.split('.')
    return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : ''
}

// 判断是否为图片
const isImageFile = (attachment: CustomerAttachment) => {
    const ext = getFileExt(attachment)
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(ext)
}

// 根据文件类型获取对应的 Icon 图标名称
// 这里使用 Material Design Icons (mdi) 命名规范
const getFileIcon = (attachment: CustomerAttachment) => {
    const ext = getFileExt(attachment)
    
    if (isImageFile(attachment)) return 'mdi:file-image'
    
    switch (ext) {
        case 'pdf':
            return 'mdi:file-pdf-box'
        case 'doc':
        case 'docx':
            return 'mdi:file-word'
        case 'xls':
        case 'xlsx':
        case 'csv':
            return 'mdi:file-excel'
        case 'ppt':
        case 'pptx':
            return 'mdi:file-powerpoint'
        case 'zip':
        case 'rar':
        case '7z':
        case 'tar':
        case 'gz':
            return 'mdi:folder-zip'
        case 'txt':
            return 'mdi:file-document-outline'
        case 'mp4':
        case 'avi':
        case 'mov':
            return 'mdi:file-video'
        case 'mp3':
        case 'wav':
            return 'mdi:file-music'
        default:
            return 'mdi:file-question' // 未知文件类型
    }
}

// 下载文件
const downloadFile = async (url: string, filename?: string) => {
    if (!url) return
    try {
        await downloadAttachmentFile(url, filename)
    } catch (error) {
        console.error('下载附件失败:', error)
        ElMessage.error('下载附件失败')
    }
}

// 处理附件点击事件
const handleAttachmentClick = (attachment: CustomerAttachment) => {
    const attachmentPath = getAttachmentPath(attachment)
    if (!attachmentPath) return
    if (isImageFile(attachment)) {
        // 如果是图片，打开预览弹窗
        previewImageUrl.value = toAbsoluteAttachmentUrl(attachmentPath, window.location.origin)
        previewFileName.value = getFileName(attachment)
        previewAttachmentPath.value = attachmentPath // 保存原始路径
        showImagePreview.value = true
    } else {
        // 如果是非图片，直接下载
        downloadFile(attachmentPath, getFileName(attachment))
    }
}

// 监听修改销售弹窗打开，获取销售列表
watch(showEditSalesDialog, (newVal) => {
    if (newVal) {
        fetchSalespersonList()
        // 如果客户已分配，默认选中当前销售
        if (props.customer._assignSalespersonId) {
            selectedSalespersonId.value = props.customer._assignSalespersonId
        }
    } else {
        selectedSalespersonId.value = ''
        editApplyMonths.value = 3
    }
})
</script>

<style lang="less" scoped>
:global(.maintenance-tooltip) {
    font-size: 14px;
    line-height: 1.35;
}

.customer-item {
    position: relative;
    background: #fff;
    border-radius: 20px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 135px;
    align-items: stretch;
    width: 100%;
    min-width: 0;
    margin-bottom: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

    &.assigned-highlight {
        background: #fff7ed;
        box-shadow: 0 6px 22px rgba(245, 158, 11, 0.18);
        border: 1px solid #fdba74;
    }

    &.has-selection {
        .customer-info-content {
            padding-left: 16px;
        }
    }

    .customer-info-pane {
        min-width: 0;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;

        &::-webkit-scrollbar {
            display: none;
        }
    }

    .customer-info-content {
        position: relative;
        width: var(--customer-info-width, 1321px);
        min-width: var(--customer-info-width, 1321px);
        min-height: 180px;
        display: flex;
        align-items: center;
        padding: 20px 30px;
        box-sizing: border-box;
    }

    .select-col {
        width: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: 6px;

        input[type="checkbox"] {
            width: 16px;
            height: 16px;
            cursor: pointer;
        }
    }

    .avatar-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        margin-right: 10px;
        width: 70px;
        flex-shrink: 0;

        .avatar {
            width: 70px;
            height: 70px;
            background-color: #ccc;
            border-radius: 50%;
            margin-bottom: 8px;
            cursor: pointer;
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
        }

        .name {
            font-size: 16px;
            color: #333;
            font-weight: 500;
            max-width: 70px;
            display: -webkit-box;          /* 将对象作为弹性伸缩盒子模型显示 */
            -webkit-box-orient: vertical;  /* 设置或检索伸缩盒子的子元素排列方式 */
            -webkit-line-clamp: 2;         /* 限制在一个块元素显示的文本的行数 */
            overflow: hidden;
            text-overflow: ellipsis;
            overflow-wrap: break-word; 
        }
    }

    .info-grid {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 0; // Remove gap, control via margin-right on cols

        .col {
            display: flex;
            flex-direction: column;
            justify-content: center;
            margin-right: 30px; // Consistent spacing
            flex-shrink: 0;
            
            &.tags-wrapper {
                width: 100px; // Matches region header
                flex-direction: row;
                flex-wrap: wrap;
                align-content: flex-start;
                gap: 6px;
            }
            
            // Tags
            &:nth-child(1) { 
                width: 140px; 
                margin-right: 60px; 
                flex-wrap: wrap;
            } 
            
            // Location -> Region Header
            &:nth-child(2) { width: 100px; margin-right: 50px; } 
            
            // Contact -> Contact Header
            &.contact-col { width: 100px; min-width: auto; margin-right: 40px; }
            
            // Email -> Email Header
            &:nth-child(4) { width: 180px; }

            // Company -> Company Header
            &.company-col { width: 150px; min-width: auto; margin-right: 67px; }

            // Social -> Channel Header
            &:nth-child(6) { width: 120px; margin-right: 24px; }

            // Count -> Deal Orders Header
            &:nth-child(7) { width: 110px; padding-left: 18px; margin-right: 20px; }

            // Sales -> Sales Header
            &.sales-col { 
                width: 85px; min-width: auto; 
                .maintenance-chip {
                    margin-top: 8px;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    max-width: 100%;
                    padding: 4px 6px;
                    border-radius: 999px;
                    border: 1px solid transparent;
                    line-height: 1;
                    user-select: none;

                    .maintenance-chip-icon {
                        font-size: 14px;
                        line-height: 1;
                        flex: 0 0 auto;
                    }

                    .maintenance-chip-text {
                        font-size: 14px;
                        font-weight: 600;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }

                    &.maintenance-chip--ok {
                        background: #ecfdf5;
                        color: #065f46;
                        border-color: #a7f3d0;
                    }

                    &.maintenance-chip--warning {
                        background: #fffbeb;
                        color: #92400e;
                        border-color: #fcd34d;
                    }

                    &.maintenance-chip--expired,
                    &.maintenance-chip--muted {
                        background: #f3f4f6;
                        color: #6b7280;
                        border-color: #e5e7eb;
                    }
                }
            }
        }

        .label {
            font-size: 14px;
            color: #91929e;
            margin-bottom: 2px;
        }

        .value {
            width: 100%;
            font-size: 15px;
            color: #0a1629;
            font-weight: 500;
            line-height: 1.4;
            word-wrap: break-word;      /* 旧标准，兼容性好 */
            overflow-wrap: break-word;  /* 新标准，推荐 */
            white-space: normal;        /* 允许正常换行 */
        }

        .sub-text {
            font-size: 13px;
            color: #91929e;
        }

        .company-website {
            color: inherit;
            text-decoration: underline;
        }
        
        .date-text {
            font-size: 13px;
            color: #91929e;
            line-height: 1.4;
            white-space: nowrap;
        }

        .mt-1 { margin-top: 4px; }
        .mt-2 { margin-top: 12px; }

        .tag {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            
            &.cyan {
                background-color: #e0fbf6;
                color: #00bfa5;
            }
            
            &.yellow {
                background-color: #fff7cc;
                color: #ff9800;
                display: inline-block;
                max-width: 90px;
                overflow: hidden;
                text-overflow: ellipsis;
                cursor: pointer;
            }

            &.level-good {
                background-color: #ecfdf5;
                color: #10b981;
            }

            &.level-normal {
                background-color: #eff6ff;
                color: #3b82f6;
            }

            &.level-potential {
                background-color: #fffbeb;
                color: #f59e0b;
            }

            &.level-problem {
                background-color: #f3f4f6;
                color: #6b7280;
            }

            &.level-risk {
                background-color: #fef2f2;
                color: #ef4444;
            }
        }
    }

    .tag-popover-content {
        white-space: normal;
        word-break: break-word;
        line-height: 1.2;
        font-size: 16px;
    }

    .actions-col {
        display: flex;
        flex-direction: column;
        gap: 8px;
        justify-content: center;
        width: 135px;
        min-width: 135px;
        padding: 20px 10px;
        background: inherit;
        border-radius: 0 20px 20px 0;
        box-shadow: -10px 0 18px rgba(15, 23, 42, 0.04);
        box-sizing: border-box;
        flex-shrink: 0;

        .maintenance-left {
            background: #ebedef;
            border-radius: 12px;
            padding: 8px 10px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);

            .maintenance-label {
                font-size: 12px;
                color: #6b7280;
                line-height: 1.2;
            }

            .maintenance-value {
                margin-top: 4px;
                font-size: 14px;
                font-weight: 600;
                color: #0a1629;
                line-height: 1.2;
            }
        }

        .btn {
            border: none;
            border-radius: 14px;
            padding: 5px 0px;
            font-size: 13.5px;
            box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.3);
            color: #fff;
            cursor: pointer;
            width: 100%;
            text-align: center;
            transition: opacity 0.2s;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            line-height: 1;

            .btn-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                line-height: 1;
                width: 16px;
                height: 16px;
            }

            &:hover:not(:disabled) {
                opacity: 0.9;
            }

            &.btn-edit {
                background: #ff5733;
            }

            &.btn-edit-customer {
                background: #408cff;
            }

            &.btn-unassign {
                background: #6b7280;
            }

            &.btn-log {
                background: #43cf7c;
            }

            &.btn-order {
                background: #3ba8f5;
            }

            &.btn-history {
                background: #64748b;
            }

            &.btn-apply {
                background: #007bff;
            }

            &.btn-pending {
                background: #ffa500;
                cursor: not-allowed;
                opacity: 0.8;
                padding: 7px;
            }

            &.btn-extend {
                background: #7c3aed;
            }

            &.btn-fake-del {
                background: #bdbdbd;
                opacity: 0.8;
            }

            &.btn-del {
                background: #e53935;
            }

            &.btn-recover {
                background: #43cf7c;
            }

            &:disabled {
                cursor: not-allowed;
            }
        }
    }

    .actions {
        display: flex;
        align-items: center;
        margin-left: auto;
        gap: 12px;

        .action-btn {
            background: none;
            border: none;
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            transition: background 0.2s;

            &:hover {
                background: rgba(0, 0, 0, 0.05);
            }

            &.log-btn {
                color: #67c23a;
                
                &:hover {
                    background: #f0f9eb;
                }
            }
        }
    }
}

// 弹窗样式移到外层，不嵌套在 .customer-item 内
.dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
}

.dialog-box {
    background: #fff;
    border-radius: 16px;
    padding: 24px;
    width: 90%;
    max-width: 450px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.dialog-title {
    font-size: 20px;
    font-weight: 600;
    color: #333;
    margin-bottom: 20px;
}

.dialog-content {
    margin-bottom: 24px;

    .customer-info {
        background: #f5f5f5;
        padding: 12px;
        border-radius: 8px;
        margin-bottom: 20px;

        p {
            margin: 6px 0;
            font-size: 14px;
            color: #333;
        }
    }

    .form-group {
        label {
            display: block;
            font-size: 14px;
            color: #666;
            margin-bottom: 8px;
            font-weight: 500;
        }

        .select-input {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-size: 14px;
            color: #333;
            cursor: pointer;
            transition: border-color 0.2s;

            &:focus {
                outline: none;
                border-color: #007bff;
            }
        }
    }
}

.dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;

    button {
        padding: 10px 24px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        border: none;

        &.btn-cancel {
            background: #f5f5f5;
            color: #666;

            &:hover {
                background: #e0e0e0;
            }
        }

        &.btn-confirm {
            background: #007bff;
            color: #fff;

            &:hover:not(:disabled) {
                background: #0056b3;
            }

            &:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
        }
    }
}

// 附件相关样式
.attachments-col {
    position: absolute; 
    top: 0;             
    left: 0px;         
    z-index: 10;        
    
    // 重置之前的布局属性
    width: auto;
    margin-right: 0;
    display: block;     

    .attachment-badge {
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        
        padding: 4px 8px 6px; 
        transition: all 0.2s;

        &:hover {
            transform: translateY(2px); // 悬停时稍微拉长一点的效果
        }

        .attachment-icon {
            font-size: 18px; // 稍微调小一点，比较精致
            color: #409eff;
        }
    }
}

.customer-item.has-selection .attachments-col {
    left: 32px;
}

// 附件列表样式
.attachments-list {
    .attachments-title {
        font-size: 14px;
        font-weight: 600;
        color: #333;
        margin-bottom: 12px;
        padding-bottom: 8px;
        border-bottom: 1px solid #eee;
    }

    .attachment-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 8px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.2s;

        &:hover {
            background: #f5f7fa;

            .action-icon {
                opacity: 1;
            }
        }

        .file-icon {
            font-size: 24px;
            color: #409eff;
            flex-shrink: 0;
        }

        .file-name {
            flex: 1;
            font-size: 14px;
            color: #333;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .action-icon {
            font-size: 18px;
            color: #909399;
            opacity: 0.5;
            transition: opacity 0.2s;
        }
    }
}

</style>
