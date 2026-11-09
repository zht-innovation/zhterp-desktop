<template>
    <Transition name="fade">
        <div v-if="visible" class="modal-overlay" @click.self="close">
            <div class="modal-wrapper">
                <div class="modal-content">
                    <button class="close-btn" @click="close">
                        <Icon name="material-symbols:close" size="24px"></Icon>
                    </button>

                    <div class="modal-title">{{ data?.title }}</div>

                    <div class="form-container">
                    <!-- 1. 销售姓名 (留言类型不显示) -->
                    <div class="form-group" v-if="!isNewLead">
                        <label>销售姓名</label>
                        <div class="input-box">{{ data?.salesName || '未知销售' }}</div>
                    </div>

                    <!-- 2. 客户信息 -->
                    <div class="form-group">
                        <label>客户信息</label>
                        <div
                            class="input-box"
                            :class="{ clickable: canViewCustomer }"
                            @click="handleCustomerClick"
                        >
                            <span>{{ data?.customerInfo || '未知客户' }}</span>
                            <span v-if="canViewCustomer" class="hint">点击查看</span>
                        </div>
                    </div>

                    <!-- 3. 时间显示 -->
                    <!-- 场景 A: 保护期到期 -->
                    <div class="date-row" v-if="isExpiry">
                        <div class="form-group">
                            <label>开始时间</label>
                            <div class="input-box">{{ data?.startDate }}</div>
                        </div>
                        <div class="form-group">
                            <label>到期时间</label>
                            <div class="input-box">{{ data?.endDate }}</div>
                        </div>
                    </div>

                    <!-- 场景 B: 客户下单 -->
                    <div class="form-group" v-else-if="isOrder">
                        <label>更新时间</label>
                        <div class="input-box">{{ data?.date }} {{ data?.time }}</div>
                    </div>

                    <!-- 场景 C: 普通留言或日志 -->
                    <div class="form-group" v-else>
                        <label>记录时间</label>
                        <div class="input-box">{{ data?.date }} {{ data?.time }}</div>
                    </div>

                    <!-- 4. 细则/内容 -->
                    <div class="form-group">
                        <div class="form-label-row">
                            <label>详细内容</label>
                            <button
                                v-if="data?.type === 'application' && data?.customerId"
                                type="button"
                                class="term-history-trigger"
                                @click="showTermHistory = true"
                            >
                                <Icon name="mdi:history" />
                                查看维护记录
                            </button>
                        </div>
                        <div class="input-box textarea">
                            <div v-if="Array.isArray(data?.contentLines)" class="content-lines">
                                <div v-for="(line, idx) in data.contentLines" :key="idx" class="content-line">
                                    {{ line }}
                                </div>
                            </div>
                            <div v-else>{{ data?.content || '暂无详细内容...' }}</div>
                        </div>
                    </div>
                </div>

                    <div class="modal-footer">
                        <!-- 只有到期才显示延长时间 -->
                        <button v-if="isExpiry" class="btn btn-secondary">延长时间</button>
                        <button class="btn btn-danger" @click="handleReject" :loading="rejecting">拒绝</button>
                        <button class="btn btn-primary" @click="handleApprove" :loading="approving">批准</button>
                        <!-- <button class="btn btn-primary" @click="handleConfirm">确认已读</button> -->
                    </div>
                </div>

                <Transition name="slide-x">
                    <div v-if="showCustomerPanel" class="customer-panel">
                        <div class="panel-header">
                            <div class="panel-title">客户详情</div>
                            <button class="panel-close" @click="closeCustomerPanel">
                                <Icon name="material-symbols:close" size="20px" />
                            </button>
                        </div>
                        <div v-if="customerLoading" class="panel-loading">加载中...</div>
                        <div v-else class="panel-body">
                            <div class="panel-row">
                                <span class="label">客户姓名</span>
                                <span class="value">{{ customerDetail?.name || '-' }}</span>
                            </div>
                            <div class="panel-row">
                                <span class="label">公司名称</span>
                                <span class="value">{{ customerDetail?.company || '-' }}</span>
                            </div>
                            <div class="panel-row">
                                <span class="label">公司详情</span>
                                <span class="value">{{ customerDetail?.companyDetail || '-' }}</span>
                            </div>
                            <div class="panel-row">
                                <span class="label">公司网站</span>
                                <span class="value">{{ customerDetail?.companyWebsite || '-' }}</span>
                            </div>
                            <div class="panel-row">
                                <span class="label">国家/城市</span>
                                <span class="value">
                                    {{ [customerDetail?.country, customerDetail?.city].filter(Boolean).join('/') || '-' }}
                                </span>
                            </div>
                            <div class="panel-row">
                                <span class="label">电话</span>
                                <span class="value">{{ customerDetail?.phone || '-' }}</span>
                            </div>
                            <div class="panel-row">
                                <span class="label">WhatsApp</span>
                                <span class="value">{{ customerDetail?.whatsapp || '-' }}</span>
                            </div>
                            <div class="panel-row">
                                <span class="label">微信</span>
                                <span class="value">{{ customerDetail?.wechat || '-' }}</span>
                            </div>
                            <div class="panel-row">
                                <span class="label">邮箱</span>
                                <span class="value">{{ customerDetail?.email || '-' }}</span>
                            </div>
                        </div>
                    </div>
                </Transition>
            </div>
        </div>
    </Transition>

    <CustomerTermHistoryDialog
        v-model="showTermHistory"
        :customer-id="data?.customerId || ''"
        :customer-name="data?.customerInfo || ''"
        :current-app-id="data?.applicationId || ''"
    />
</template>

<script setup lang="ts">
import { handleApplication } from '~/composables/api/useAppApi'
import { retrieveCustomerDetail } from '~/composables/api/useCustomerApi'
import CustomerTermHistoryDialog from '~/components/configuration/sales/CustomerTermHistoryDialog.vue'

const props = defineProps<{
    visible: boolean
    data: any
}>()

const approving = ref(false)
const rejecting = ref(false)
const showCustomerPanel = ref(false)
const showTermHistory = ref(false)
const customerLoading = ref(false)
const customerDetail = ref<any>(null)
const customerCache = new Map<string, any>()

const emit = defineEmits<{
    'update:visible': [value: boolean]
    'confirm': [id: string]
    'refresh': []
}>()

const close = () => {
    showCustomerPanel.value = false
    showTermHistory.value = false
    emit('update:visible', false)
}

const handleConfirm = () => {
    emit('confirm', props.data?.id)
    close()
}

// 批准申请
const handleApprove = async () => {
    if (!props.data?.applicationId) {
        ElMessage.error('申请信息不存在')
        return
    }

    approving.value = true
    try {
        await handleApplication()({
            _id: props.data.applicationId,
            agreed: true
        })
        
        ElMessage.success(props.data?.appType === 'extend' ? '已批准延期申请，维护期已延长' : '已批准申请，客户已分配给销售')
        emit('refresh')
        close()
    } catch (error: any) {
        console.error('批准申请失败:', error)
        ElMessage.error('批准申请失败，请稍后重试')
    } finally {
        approving.value = false
    }
}

// 拒绝申请
const handleReject = async () => {
    if (!props.data?.applicationId) {
        ElMessage.error('申请信息不存在')
        return
    }

    rejecting.value = true
    try {
        await handleApplication()({
            _id: props.data.applicationId,
            agreed: false
        })
        
        ElMessage.success(props.data?.appType === 'extend' ? '已拒绝延期申请' : '已拒绝申请，客户已放回公共池')
        emit('refresh')
        close()
    } catch (error: any) {
        console.error('拒绝申请失败:', error)
        ElMessage.error('拒绝申请失败，请稍后重试')
    } finally {
        rejecting.value = false
    }
}

// 计算属性：判断是否为客户保护到期（根据标题关键字或后续新增的 subType 字段）
const isExpiry = computed(() => props.data?.title?.includes('到期'))
const isOrder = computed(() => props.data?.title?.includes('下单'))
const isNewLead = computed(() => props.data?.type === 'leavemsg')
const canViewCustomer = computed(() => Boolean(props.data?.customerId))

watch(
    () => [props.visible, props.data?.customerId] as const,
    async ([visible, customerId]) => {
        if (!visible || !customerId) return
        if (customerCache.has(customerId)) {
            customerDetail.value = customerCache.get(customerId)
            return
        }
        try {
            const res: any = await retrieveCustomerDetail()(customerId)
            const detail = res?.data?.customer || null
            customerCache.set(customerId, detail)
            if (props.data?.customerId === customerId) {
                customerDetail.value = detail
            }
        } catch (error) {
            console.error('预加载客户详情失败:', error)
        }
    }
)

const closeCustomerPanel = () => {
    showCustomerPanel.value = false
}

const handleCustomerClick = async () => {
    if (!canViewCustomer.value) return
    showCustomerPanel.value = true
    try {
        const customerId = props.data.customerId
        if (customerCache.has(customerId)) {
            customerDetail.value = customerCache.get(customerId)
            customerLoading.value = false
            return
        }
        customerLoading.value = true
        const res: any = await retrieveCustomerDetail()(customerId)
        const detail = res?.data?.customer || null
        customerCache.set(customerId, detail)
        customerDetail.value = detail
    } catch (error) {
        console.error('获取客户详情失败:', error)
        ElMessage.error('获取客户详情失败')
    } finally {
        customerLoading.value = false
    }
}

// 获取用户角色，判断是否显示批准/拒绝按钮
const adminInfo = useState<any>('admin_info', () => ({}))
</script>

<style lang="less" scoped>
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999;
}

.modal-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-content {
    background: white;
    width: 560px;
    max-width: 90%;
    padding: 30px;
    border-radius: 20px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    position: relative;
    animation: slideIn 0.3s ease-out;
}

.close-btn {
    position: absolute;
    top: 20px;
    right: 20px;
    background: none;
    border: none;
    cursor: pointer;
    color: #94a3b8;

    &:hover {
        color: #333;
    }
}

.modal-title {
    font-size: 20px;
    font-weight: bold;
    color: #333;

    margin-bottom: 24px;
    text-align: center;
}

.form-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.date-row {
    display: flex;
    gap: 16px;

    .form-group {
        flex: 1;
    }
}

.form-group {
    label {
        display: block;
        font-size: 18px;
        color: #94a3b8;
        margin-bottom: 6px;
    }
}

.form-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 6px;

    label {
        margin-bottom: 0;
    }
}

.term-history-trigger {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px;
    border: 1px solid #bfdbfe;
    border-radius: 6px;
    color: #2563eb;
    background: #eff6ff;
    font-size: 12px;
    cursor: pointer;

    &:hover {
        border-color: #93c5fd;
        background: #dbeafe;
    }
}

.input-box {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-size: 18px;
    color: #333;

    &.textarea {
        min-height: 80px;
        max-height: 160px;
        overflow-x: auto;
        overflow-wrap: break-word;
    }

    &.clickable {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        transition: border-color 0.2s, background 0.2s;
        background: #fafcff;
        border-color: #dbeafe;
    }

    &.clickable:hover {
        background: #f0f7ff;
        border-color: #bfdbfe;
    }

    .hint {
        font-size: 12px;
        color: #3f8cff;
    }
}

.modal-footer {
    margin-top: 30px;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
}

.btn {
    padding: 8px 20px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    transition: all 0.2s;
}

.btn-primary {
    background: #3f8cff;
    color: white;
    box-shadow: 0 4px 6px -1px rgba(63, 140, 255, 0.2);

    &:hover {
        background: #2563eb;
    }
}

.btn-secondary {
    background: #eff6ff;
    color: #3b82f6;
    box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.2);

    &:hover {
        background: #dbeafe;
    }
}

/* 动画 */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.slide-x-enter-active,
.slide-x-leave-active {
    transition: all 0.25s ease;
}

.slide-x-enter-from,
.slide-x-leave-to {
    opacity: 0;
    transform: translateX(20px);
}

.customer-panel {
    background: #fff;
    width: 360px;
    max-width: 90%;
    padding: 24px;
    border-radius: 20px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    margin-left: 20px;
    position: relative;
}

.panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
}

.panel-title {
    font-size: 16px;
    font-weight: 600;
    color: #333;
}

.panel-close {
    background: none;
    border: none;
    cursor: pointer;
    color: #94a3b8;
}

.panel-loading {
    font-size: 14px;
    color: #909399;
}

.panel-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.panel-row {
    display: flex;
    gap: 8px;
    font-size: 14px;
    color: #303133;
}

.panel-row .label {
    min-width: 72px;
    color: #909399;
}

.panel-row .value {
    flex: 1;
    word-break: break-all;
}

.content-lines {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 16px;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
    }

    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.detail-content {
    .info-row {
        display: flex;
        margin-bottom: 16px;
        font-size: 16px;

        .label {
            font-weight: 600;
            color: #606266;
            min-width: 100px;
        }

        .value {
            color: #303133;
            flex: 1;
        }
    }

    .content-box {
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid #EBEEF5;

        .label {
            font-weight: 600;
            color: #606266;
            font-size: 16px;
            margin-bottom: 12px;
        }

        .content-text {
            color: #303133;
            font-size: 15px;
            line-height: 1.8;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
    }
}

.dialog-footer {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
}
</style>
