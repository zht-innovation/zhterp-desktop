<template>
    <div v-if="visible" class="modal-overlay">
        <div class="modal-content log-modal">
            <div class="modal-header">
                <h3>{{ title }}</h3>
                <button class="close-btn" @click="handleClose" v-if="!readonly">
                    <Icon name="heroicons:x-mark" />
                </button>
            </div>
            
            <div class="form-row">
                <div class="form-group half">
                    <label>日志日期</label>
                    <input 
                        v-if="!readonly"
                        v-model="formData.logDate" 
                        type="date"
                        :min="minDate"
                        :max="maxDate"
                    />
                    <div v-else class="readonly-value">{{ formData.logDate }}</div>
                </div>
                <div class="form-group half">
                    <label>客户 <span class="required" v-if="!readonly">*</span></label>
                    <el-select
                        v-if="!readonly && !isEditing"
                        v-model="formData.customerId"
                        class="select-input"
                        filterable
                        remote
                        clearable
                        :remote-method="handleCustomerSearch"
                        :loading="isCustomerSearchLoading"
                        :disabled="customerDisabled"
                        placeholder="请选择客户（可搜索）"
                    >
                        <el-option
                            v-for="c in customerOptions"
                            :key="c._id"
                            :label="formatCustomerOption(c)"
                            :value="c._id"
                        />
                    </el-select>
                    <div v-else class="readonly-value">{{ customerName }}</div>
                    <div class="form-hint" v-if="!readonly && customerHint">
                        {{ customerHint }}
                    </div>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group full">
                    <label>跟进主题 <span class="required" v-if="!readonly">*</span></label>
                    <input 
                        v-if="!readonly"
                        v-model="formData.subject" 
                        type="text" 
                        placeholder="请输入跟进主题" 
                    />
                    <div v-else class="readonly-value">{{ formData.subject || '-' }}</div>
                    <div class="form-hint" v-if="!readonly">
                        明确本次沟通核心目的（如需求挖掘/方案报价/异议处理/合同洽谈）
                    </div>
                </div>
            </div>

            <div class="form-group">
                <label>跟进方式 <span class="required" v-if="!readonly">*</span></label>
                <div class="radio-group" v-if="!readonly">
                    <label 
                        v-for="method in FOLLOW_UP_METHODS" 
                        :key="method" 
                        class="radio-item"
                        :class="{ active: formData.followUpMethod === method }"
                    >
                        <input 
                            type="radio" 
                            :value="method" 
                            v-model="formData.followUpMethod"
                        />
                        <span>{{ method }}</span>
                    </label>
                </div>
                <div v-else class="readonly-value tag-value">
                    <span class="tag blue">{{ formData.followUpMethod || '-' }}</span>
                </div>
            </div>

            <div class="form-group">
                <label>当前阶段 <span class="required" v-if="!readonly">*</span></label>
                <div class="radio-group" v-if="!readonly">
                    <label 
                        v-for="stage in CURRENT_STAGES" 
                        :key="stage" 
                        class="radio-item"
                        :class="{ active: formData.currentStage === stage }"
                    >
                        <input 
                            type="radio" 
                            :value="stage" 
                            v-model="formData.currentStage"
                        />
                        <span>{{ stage }}</span>
                    </label>
                </div>
                <div v-else class="readonly-value tag-value">
                    <span class="tag gray">{{ formData.currentStage || '-' }}</span>
                </div>
            </div>

            <template v-if="formData.currentStage === '售后维护'">
                <div class="section-divider">
                    <span>售后维护信息</span>
                </div>

                <div class="form-group">
                    <label>维护产品 <span class="required" v-if="!readonly">*</span></label>
                    <div class="radio-group" v-if="!readonly">
                        <label 
                            v-for="type in MAINTENANCE_TYPES" 
                            :key="type" 
                            class="radio-item"
                            :class="{ active: formData.maintenanceType === type }"
                        >
                            <input 
                                type="radio" 
                                :value="type" 
                                v-model="formData.maintenanceType"
                            />
                            <span>{{ type }}</span>
                        </label>
                    </div>
                    <div v-else class="readonly-value tag-value">
                        <span class="tag blue">{{ formData.maintenanceType || '-' }}</span>
                    </div>
                </div>

                <!-- 机型选择（仅当维护类型为"机型"时显示） -->
                <div class="form-group" v-if="formData.maintenanceType === '机型'">
                    <label>机型 <span class="required" v-if="!readonly">*</span></label>
                    <div class="radio-group" v-if="!readonly">
                        <label 
                            v-for="model in PRODUCT_MODELS" 
                            :key="model" 
                            class="radio-item"
                            :class="{ active: formData.productModel === model }"
                        >
                            <input 
                                type="radio" 
                                :value="model" 
                                v-model="formData.productModel"
                            />
                            <span>{{ model }}</span>
                        </label>
                    </div>
                    <div v-else class="readonly-value tag-value">
                        <span class="tag blue">{{ formData.productModel || '-' }}</span>
                    </div>
                </div>

                <div class="form-group">
                    <label>产品序列号 <span class="required" v-if="!readonly">*</span></label>
                    <input 
                        v-if="!readonly"
                        v-model="formData.productSerialNumber" 
                        type="text" 
                        placeholder="请输入产品序列号" 
                    />
                    <div v-else class="readonly-value">{{ formData.productSerialNumber || '-' }}</div>
                </div>

                <div class="form-group">
                    <label>问题描述 <span class="required" v-if="!readonly">*</span></label>
                    <textarea 
                        v-if="!readonly"
                        v-model="formData.problemDescription" 
                        placeholder="请详细描述客户遇到的问题" 
                        rows="3"
                    ></textarea>
                    <div v-else class="readonly-value content-value">{{ formData.problemDescription || '-' }}</div>
                </div>

                <div class="form-group">
                    <label>解决方案与进度 <span class="required" v-if="!readonly">*</span></label>
                    <textarea 
                        v-if="!readonly"
                        v-model="formData.solutionAndProgress" 
                        placeholder="请输入解决方案及当前处理进度" 
                        rows="3"
                    ></textarea>
                    <div v-else class="readonly-value content-value">{{ formData.solutionAndProgress || '-' }}</div>
                </div>
            </template>

            <div class="form-group">
                <label>客户反馈态度 <span class="required" v-if="!readonly">*</span></label>
                <div class="radio-group" v-if="!readonly">
                    <label 
                        v-for="attitude in FEEDBACK_ATTITUDES" 
                        :key="attitude" 
                        class="radio-item attitude-item"
                        :class="{ active: formData.feedbackAttitude === attitude }"
                    >
                        <input 
                            type="radio" 
                            :value="attitude" 
                            v-model="formData.feedbackAttitude"
                        />
                        <span>{{ attitude }}</span>
                    </label>
                </div>
                <div v-else class="readonly-value tag-value">
                    <span class="tag" :class="getAttitudeClass(formData.feedbackAttitude)">
                        {{ formData.feedbackAttitude || '-' }}
                    </span>
                </div>
                <div class="form-hint" v-if="!readonly && formData.feedbackAttitude">
                    {{ getAttitudeHint(formData.feedbackAttitude) }}
                </div>
                <div class="form-hint" v-else-if="!readonly">
                    选择对应态度后将显示详细说明
                </div>
            </div>

            <div class="form-group">
                <label>跟进结果 <span class="required" v-if="!readonly">*</span></label>
                <input 
                    v-if="!readonly"
                    v-model="formData.followUpResult" 
                    type="text" 
                    placeholder="请输入本次跟进结果" 
                />
                <div v-else class="readonly-value">{{ formData.followUpResult || '-' }}</div>
                <div class="form-hint" v-if="!readonly">
                    清晰写明量化/定性成果（如"客户认可方案，要求下周三提供详细报价单"）
                </div>
            </div>

            <div class="form-group">
                <label>关键沟通内容 <span class="required" v-if="!readonly">*</span></label>
                <textarea 
                    v-if="!readonly"
                    v-model="formData.content" 
                    placeholder="请输入关键沟通内容" 
                    rows="4"
                ></textarea>
                <div v-else class="readonly-value content-value">{{ formData.content || '-' }}</div>
                <div class="form-hint" v-if="!readonly">
                    记录客户明确需求、关注点、提出的异议（如价格/交付周期）；<br/>
                    记录销售的核心动作（如发送定制方案、提供实测、邀请实地考察、给出优惠等）
                </div>
            </div>

            <div class="section-divider" v-if="existingAttachments.length > 0">
                <span>已上传附件</span>
            </div>

            <div class="attachments-list" v-if="existingAttachments.length > 0">
                <div
                    v-for="(attachment, idx) in existingAttachments"
                    :key="getAttachmentKey(attachment) || `attachment-${idx}`"
                    class="attachment-item"
                    @click="handleAttachmentClick(attachment)"
                >
                    <Icon :name="getFileIcon(attachment)" class="file-icon" />
                    <span class="file-name">{{ getFileName(attachment) }}</span>
                    <button
                        v-if="isImageFile(attachment)"
                        class="attachment-action"
                        @click.stop="previewAttachment(attachment)"
                    >
                        <Icon name="mdi:eye" />
                    </button>
                    <button
                        class="attachment-action"
                        @click.stop="downloadAttachment(attachment)"
                    >
                        <Icon name="mdi:download" />
                    </button>
                    <button
                        v-if="!readonly"
                        class="remove-attachment"
                        @click.stop="removeExistingAttachment(attachment)"
                    >
                        删除
                    </button>
                </div>
            </div>

            <div class="section-divider" v-if="!readonly">
                <span>附件上传</span>
            </div>

            <div class="form-group" v-if="!readonly">
                <label>上传附件</label>
                <FileUploader 
                    v-model="formData.attachments" 
                    :max-size="10" 
                    :readonly="readonly"
                />
                <div class="form-hint" v-if="!readonly">支持上传图片、文档等文件，单个文件不超过10MB</div>
            </div>

            <div class="modal-actions">
                
                <button @click="handleClose">{{ readonly ? '关闭' : '取消' }}</button>
                <button 
                    v-if="!readonly && isEditing"
                    class="delete" 
                    @click="handleDel" 
                >
                    {{ '删除' }}
                </button>
                <button 
                    v-if="!readonly"
                    class="primary" 
                    @click="handleSave" 
                    :disabled="isSaving || !isFormComplete"
                >
                    {{ isSaving ? '保存中...' : '保存' }}
                </button>
            </div>
        </div>
    </div>

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
</template>

<script setup lang="ts">
import AttachmentImagePreview from '~/components/configuration/sales/AttachmentImagePreview.vue'
import { FOLLOW_UP_METHODS, FEEDBACK_ATTITUDES, CURRENT_STAGES, PRODUCT_MODELS, MAINTENANCE_TYPES } from '~/composables/api/useLogApi'
import { searchCustomer } from '~/composables/api/useCustomerApi'
import {
    downloadAttachmentFile,
    toAbsoluteAttachmentUrl,
} from '~/utils/attachmentPreview'

const props = defineProps<{
    visible: boolean
    readonly?: boolean
    isEditing?: boolean
    customerDisabled?: boolean
    customerHint?: string
    customerName?: string
    customers?: any[]
    customerSearchAssignedTo?: string
    minDate?: string
    maxDate?: string
    initialData?: {
        logDate?: string
        customerId?: string
        subject?: string
        followUpMethod?: string
        currentStage?: string
        feedbackAttitude?: string
        followUpResult?: string
        content?: string
        // 售后维护相关
        maintenanceType?: string
        productModel?: string
        productSerialNumber?: string
        problemDescription?: string
        solutionAndProgress?: string
        attachments?: LogAttachment[]
    }
}>()

type LogAttachment =
    | string
    | {
          path?: string
          originalName?: string
          name?: string
      }

const emit = defineEmits<{
    'update:visible': [value: boolean]
    'save': [data: any]
    'delete': []
}>()

const isSaving = ref(false)

const formData = reactive({
    logDate: '',
    customerId: '',
    subject: '',
    followUpMethod: '',
    currentStage: '',
    feedbackAttitude: '',
    followUpResult: '',
    content: '',
    // 售后维护相关
    maintenanceType: '',
    productModel: '',
    productSerialNumber: '',
    problemDescription: '',
    solutionAndProgress: '',
    // 附件
    attachments: [] as File[]
})

const existingAttachments = ref<LogAttachment[]>([])
const removedAttachments = ref<string[]>([])
const showImagePreview = ref(false)
const previewFileName = ref('')
const previewImageUrl = ref('')
const previewAttachmentPath = ref('')
const customerOptions = ref<any[]>([])
const selectedCustomerOption = ref<any>(null)
const customerSearchQuery = ref('')
const isCustomerSearchLoading = ref(false)
const CUSTOMER_SEARCH_LIMIT = 50
let customerSearchTimer: ReturnType<typeof setTimeout> | null = null

// 标题
const title = computed(() => {
    if (props.readonly) return '日志详情'
    return props.isEditing ? '编辑日志' : '添加日志'
})

const formatCustomerOption = (customer: any) =>
    `${customer?.name || '未命名'} (${customer?.company || customer?.country || '-'})`

const setCustomerOptions = (list: any[]) => {
    const map = new Map<string, any>()
    list.forEach((item) => {
        if (item?._id) map.set(item._id, item)
    })
    if (selectedCustomerOption.value?._id) {
        map.set(selectedCustomerOption.value._id, selectedCustomerOption.value)
    }
    customerOptions.value = Array.from(map.values())
}

const handleCustomerSearch = (query: string) => {
    customerSearchQuery.value = query
    if (customerSearchTimer) clearTimeout(customerSearchTimer)
    customerSearchTimer = setTimeout(async () => {
        const keyword = customerSearchQuery.value.trim()
        if (!keyword) {
            setCustomerOptions(props.customers || [])
            return
        }
        try {
            isCustomerSearchLoading.value = true
            const res: any = await searchCustomer()({
                keyword,
                limit: CUSTOMER_SEARCH_LIMIT,
                assignedTo: props.customerSearchAssignedTo,
            })
            const list = res?.data?.customers ?? []
            setCustomerOptions(Array.isArray(list) ? list : [])
        } catch (err) {
            console.error('搜索客户失败:', err)
        } finally {
            isCustomerSearchLoading.value = false
        }
    }, 250)
}

// 表单是否完整
const isFormComplete = computed(() => {
    const customerIdValid = props.customerDisabled || !!formData.customerId
    
    let baseValid = !!(
        customerIdValid &&
        formData.subject &&
        formData.followUpMethod &&
        formData.currentStage &&
        formData.feedbackAttitude &&
        formData.followUpResult &&
        formData.content
    )

    // 如果是售后维护阶段，需要额外验证
    if (formData.currentStage === '售后维护') {
        const maintenanceValid = !!(
            formData.maintenanceType &&
            formData.productSerialNumber &&
            formData.problemDescription &&
            formData.solutionAndProgress
        )
        // 如果维护类型是"机型"，还需要选择具体机型
        if (formData.maintenanceType === '机型') {
            return baseValid && maintenanceValid && !!formData.productModel
        }
        return baseValid && maintenanceValid
    }
    
    return baseValid
})

// 监听初始数据变化
watch(() => props.initialData, (newData) => {
    if (newData) {
        formData.logDate = newData.logDate || ''
        formData.customerId = newData.customerId || ''
        formData.subject = newData.subject || ''
        formData.followUpMethod = newData.followUpMethod || ''
        formData.currentStage = newData.currentStage || ''
        formData.feedbackAttitude = newData.feedbackAttitude || ''
        formData.followUpResult = newData.followUpResult || ''
        formData.content = newData.content || ''
        // 售后维护相关
        formData.maintenanceType = newData.maintenanceType || ''
        formData.productModel = newData.productModel || ''
        formData.productSerialNumber = newData.productSerialNumber || ''
        formData.problemDescription = newData.problemDescription || ''
        formData.solutionAndProgress = newData.solutionAndProgress || ''
        // 附件
        existingAttachments.value = Array.isArray(newData.attachments) ? [...newData.attachments] : []
        formData.attachments = []
        removedAttachments.value = []
    }
}, { immediate: true, deep: true })

watch(
    () => props.customers,
    (list) => {
        if (!customerSearchQuery.value.trim()) {
            setCustomerOptions(Array.isArray(list) ? list : [])
        }
    },
    { immediate: true }
)

watch(
    () => formData.customerId,
    (id) => {
        if (!id) return
        const found = customerOptions.value.find((item) => item?._id === id)
        if (found) selectedCustomerOption.value = found
    }
)

// 监听当前阶段变化，清空售后维护字段
watch(() => formData.currentStage, (newStage) => {
    if (newStage !== '售后维护') {
        formData.maintenanceType = ''
        formData.productModel = ''
        formData.productSerialNumber = ''
        formData.problemDescription = ''
        formData.solutionAndProgress = ''
    }
})

// 监听维护类型变化，清空机型
watch(() => formData.maintenanceType, (newType) => {
    if (newType !== '机型') {
        formData.productModel = ''
    }
})

const handleClose = () => {
    emit('update:visible', false)
}

const handleSave = async () => {
    if (!isFormComplete.value) return
    
    isSaving.value = true
    try {
        emit('save', { ...formData, removedAttachments: removedAttachments.value })
    } finally {
        isSaving.value = false
    }
}

const handleDel = async () => {
    if (!isFormComplete.value) return
    
    try {
        emit('delete')
    } finally {
    }
}

const getAttachmentPath = (attachment: LogAttachment) =>
    typeof attachment === 'string' ? attachment : attachment?.path || ''

const decodeFileName = (name: string) => {
    if (!name) return ''
    try {
        return decodeURIComponent(name)
    } catch (e) {
        return name
    }
}

const getFileName = (attachment: LogAttachment) => {
    if (!attachment) return ''
    if (typeof attachment === 'object') {
        const original = attachment.originalName || attachment.name || ''
        if (original) return decodeFileName(original)
    }
    const path = getAttachmentPath(attachment)
    if (!path) return ''
    const name = path.split(/[/\\]/).pop() || ''
    return decodeFileName(name)
}

const getAttachmentKey = (attachment: LogAttachment) =>
    getAttachmentPath(attachment) || getFileName(attachment) || ''

const getFileExt = (attachment: LogAttachment) => {
    const name = getFileName(attachment)
    const parts = name.split('.')
    return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : ''
}

const isImageFile = (attachment: LogAttachment) => {
    const ext = getFileExt(attachment)
    return ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico'].includes(ext)
}

const getFileIcon = (attachment: LogAttachment) => {
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
            return 'mdi:file-question'
    }
}

const downloadFile = async (url: string, filename?: string) => {
    if (!url) return
    try {
        await downloadAttachmentFile(url, filename)
    } catch (error) {
        console.error('下载附件失败:', error)
        ElMessage.error('下载附件失败')
    }
}

const handleAttachmentClick = (attachment: LogAttachment) => {
    if (isImageFile(attachment)) {
        previewAttachment(attachment)
        return
    }
    downloadAttachment(attachment)
}

const previewAttachment = (attachment: LogAttachment) => {
    const attachmentPath = getAttachmentPath(attachment)
    if (!attachmentPath) return
    if (!isImageFile(attachment)) {
        downloadFile(attachmentPath, getFileName(attachment))
        return
    }
    previewImageUrl.value = toAbsoluteAttachmentUrl(attachmentPath, window.location.origin)
    previewFileName.value = getFileName(attachment)
    previewAttachmentPath.value = attachmentPath
    showImagePreview.value = true
}

const downloadAttachment = (attachment: LogAttachment) => {
    const attachmentPath = getAttachmentPath(attachment)
    if (!attachmentPath) return
    downloadFile(attachmentPath, getFileName(attachment))
}

const removeExistingAttachment = (attachment: LogAttachment) => {
    const attachmentPath = getAttachmentPath(attachment)
    if (!attachmentPath) return
    existingAttachments.value = existingAttachments.value.filter(
        (item) => getAttachmentPath(item) !== attachmentPath
    )
    if (!removedAttachments.value.includes(attachmentPath)) {
        removedAttachments.value.push(attachmentPath)
    }
}

// 获取态度提示文字
const getAttitudeHint = (attitude: string) => {
    const hints: Record<string, string> = {
        '十分满意，并达成合作': '客户对方案/产品高度认可，已确定合作意向或签约',
        '积极': '主动提问/明确推进意向，对产品或方案表现出浓厚兴趣',
        '中性': '需进一步确认需求，客户态度不明确或在观望比较阶段',
        '消极': '明确拒绝/暂不考虑，客户当前无合作意愿'
    }
    return hints[attitude] || ''
}

// 获取态度样式类
const getAttitudeClass = (attitude: string) => {
    switch (attitude) {
        case '十分满意，并达成合作': return 'green'
        case '积极': return 'blue'
        case '中性': return 'gray'
        case '消极': return 'red'
        default: return 'gray'
    }
}
</script>

<style lang="less" scoped>
::-webkit-scrollbar {
    display: none; /* 隐藏滚动条 */
}

.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-content {
    background: #fff;
    padding: 24px;
    border-radius: 16px;
    width: 600px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    max-height: 90vh;
    overflow-y: auto;

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;

        h3 {
            margin: 0;
            font-size: 18px;
            color: #111827;
        }

        .close-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: #9CA3AF;
            font-size: 20px;
            padding: 4px;

            &:hover {
                color: #374151;
            }
        }
    }

    .form-row {
        display: flex;
        gap: 16px;
    }

    .form-group {
        margin-bottom: 16px;
        
        &.half {
            flex: 1;
        }

        &.full {
            width: 100%;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-size: 14px;
            color: #374151;
            font-weight: 500;

            .required {
                color: #EF4444;
            }
        }

        input, textarea, select {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            font-size: 14px;
            
            &:focus {
                outline: none;
                border-color: #4E8AF4;
            }

            &:disabled {
                background-color: #F3F4F6;
                cursor: not-allowed;
            }
        }

        .select-input {
            appearance: none;
            background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
            background-position: right 8px center;
            background-repeat: no-repeat;
            background-size: 20px;
            padding-right: 32px;
        }

        .readonly-value {
            padding: 8px 12px;
            background: #F9FAFB;
            border-radius: 8px;
            font-size: 14px;
            color: #374151;
            min-height: 38px;
            display: flex;
            align-items: center;

            &.content-value {
                white-space: pre-wrap;
                min-height: 80px;
                align-items: flex-start;
            }

            &.tag-value {
                background: transparent;
                padding: 0;
            }
        }

        .tag {
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 13px;

            &.blue {
                background: #EFF6FF;
                color: #3B82F6;
            }
            &.green {
                background: #ECFDF5;
                color: #10B981;
            }
            &.gray {
                background: #F3F4F6;
                color: #6B7280;
            }
            &.red {
                background: #FEF2F2;
                color: #EF4444;
            }
        }

        .radio-group {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;

            .radio-item {
                display: flex;
                align-items: center;
                padding: 6px 12px;
                border: 1px solid #E5E7EB;
                border-radius: 20px;
                cursor: pointer;
                transition: all 0.2s;

                input[type="radio"] {
                    display: none;
                }

                span {
                    font-size: 13px;
                    color: #374151;
                }

                &:hover {
                    border-color: #4E8AF4;
                }

                &.active {
                    background-color: #4E8AF4;
                    border-color: #4E8AF4;

                    span {
                        color: #fff;
                    }
                }

                &.attitude-item.active {
                    &:has(input[value="十分满意，并达成合作"]) {
                        background-color: #10B981;
                        border-color: #10B981;
                    }
                    &:has(input[value="积极"]) {
                        background-color: #3B82F6;
                        border-color: #3B82F6;
                    }
                    &:has(input[value="中性"]) {
                        background-color: #6B7280;
                        border-color: #6B7280;
                    }
                    &:has(input[value="消极"]) {
                        background-color: #EF4444;
                        border-color: #EF4444;
                    }
                }
            }
        }

        .form-hint {
            margin-top: 6px;
            font-size: 12px;
            color: #9CA3AF;
            line-height: 1.5;
        }
    }

    .attachments-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 16px;

            .attachment-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 12px;
                border-radius: 10px;
                background: #F9FAFB;
                cursor: pointer;
                transition: background 0.2s ease;

            &:hover {
                background: #F3F4F6;
            }

            .file-icon {
                font-size: 18px;
                color: #6B7280;
            }

            .file-name {
                flex: 1;
                font-size: 14px;
                color: #374151;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .attachment-action {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                padding: 0;
                border: none;
                border-radius: 6px;
                background: transparent;
                font-size: 18px;
                color: #9CA3AF;
                cursor: pointer;

                &:hover {
                    color: #4E8AF4;
                    background: #EFF6FF;
                }
            }

            .remove-attachment {
                border: none;
                background: transparent;
                color: #EF4444;
                font-size: 12px;
                cursor: pointer;
                padding: 4px 6px;
                border-radius: 6px;

                &:hover {
                    background: rgba(239, 68, 68, 0.08);
                }
            }
        }
    }

    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 24px;

        button {
            padding: 8px 16px;
            border-radius: 6px;
            border: 1px solid #E5E7EB;
            background: #fff;
            cursor: pointer;

            &.primary {
                background: #4E8AF4;
                color: #fff;
                border-color: #4E8AF4;

                &:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            }

            &.delete {
                background: #f44e4e;
                color: #fff;
                border-color: #f44e4e;

                &:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            }
        }
    }
}

.section-divider {
    display: flex;
    align-items: center;
    margin: 20px 0 16px;
    
    span {
        padding: 0 12px;
        font-size: 14px;
        font-weight: 600;
        color: #10B981;
        white-space: nowrap;
    }

    &::before,
    &::after {
        content: '';
        flex: 1;
        height: 1px;
        background: #E5E7EB;
    }
}
</style>
