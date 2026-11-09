<template>
    <div class="logs-root">
        <div class="main-container">
            <!-- Header Section -->
            <div class="page-header">
                <div class="left-section">
                    <h1 class="title">项目日志</h1>
                    <div class="tabs">
                        <span 
                            class="tab" 
                            :class="{ active: activeTab === 'all' }"
                            @click="switchTab('all')"
                            v-if="!isSalesperson"
                        >全部日志</span>
                        <span 
                            class="tab" 
                            :class="{ active: activeTab === 'personal' }"
                            @click="switchTab('personal')"
                            v-else
                        >个人日志</span>
                    </div>
                </div>
                <div class="right-section">
                    <div class="toggle-switch">
                        <div 
                            class="toggle-option" 
                            :class="{ active: viewMode === 'customer' }"
                            @click="setViewMode('customer')"
                        >
                            特定客户日志
                        </div>
                        <div 
                            class="toggle-option" 
                            :class="{ active: viewMode === 'monthly' }"
                            @click="setViewMode('monthly')"
                        >
                            销售当月日志
                        </div>
                    </div>
                </div>
            </div>

            <!-- Content Grid -->
            <div 
                class="content-grid" 
                :class="{ 
                    'full-width': activeTab === 'personal' && viewMode === 'monthly',
                    'two-columns': (activeTab === 'all' && viewMode === 'monthly') || (activeTab === 'personal' && viewMode === 'customer')
                }"
            >
                <!-- Column 1: Sales Person List -->
                <div v-if="activeTab === 'all' && !isSalesperson" class="panel list-panel">
                    <div class="panel-header">
                        <span class="label">销售人员</span>
                        <span class="count">共 {{ salesPeople.length }} 人</span>
                    </div>
                    <el-scrollbar class="list-content">
                        <div 
                            v-for="person in salesPeople" 
                            :key="person.id" 
                            class="list-item" 
                            :class="{ active: selectedSalesPersonId === person.id }"
                            @click="selectSalesPerson(person)"
                        >
                            <div class="item-info">
                                <span class="sub-text">{{ person.location }}</span>
                                <span class="main-text">{{ person.name }}</span>
                            </div>
                            <Icon name="heroicons:chevron-right" class="arrow-icon" />
                        </div>
                        <div v-if="salesPeople.length === 0" class="empty-tip">
                            暂无销售人员
                        </div>
                    </el-scrollbar>
                </div>

                <!-- Column 2: Customer List (Visible in 'customer' mode) -->
                <div v-if="viewMode === 'customer'" class="panel list-panel">
                    <div class="panel-header">
                        <span class="label">{{ selectedSalesPerson }}的客户</span>
                        <span class="count">
                            <template v-if="customerSearchQuery">
                                匹配 {{ customerSearchTotal }} / 共 {{ customerTotal }} 人
                            </template>
                            <template v-else>
                                共 {{ customerTotal }} 人
                            </template>
                        </span>
                    </div>
                    <div class="panel-search">
                        <Icon name="heroicons:magnifying-glass" class="search-icon" />
                        <input
                            v-model="customerSearchQuery"
                            type="text"
                            placeholder="搜索客户姓名"
                        />
                        <button
                            v-if="customerSearchQuery"
                            class="clear-btn"
                            @click="customerSearchQuery = ''"
                        >
                            清除
                        </button>
                    </div>
                    <el-scrollbar ref="customerScrollbarRef" class="list-content" @scroll="handleCustomerScroll">
                         <div 
                            v-for="customer in filteredCustomers" 
                            :key="customer._id" 
                            class="list-item customer-item"
                            :class="{ active: selectedCustomerId === customer._id }"
                            @click="selectCustomer(customer)"
                        >
                            <div class="item-info">
                                <span class="sub-text">{{ customer.country }} / {{ customer.city || '-' }}</span>
                                <span class="main-text">{{ customer.name }}</span>
                                <div v-if="selectedCustomerId === customer._id" class="view-logs-link">
                                    查看日志 <Icon name="heroicons:chevron-right" class="link-icon" />
                                </div>
                            </div>
                        </div>
                        <div v-if="filteredCustomers.length === 0" class="empty-tip">
                            {{ customerSearchQuery ? '没有匹配客户' : '该销售暂无对接客户' }}
                        </div>
                    </el-scrollbar>
                </div>

                <!-- Column 3: Calendar -->
                <div class="panel calendar-panel">
                    <Calendar 
                        :events="filteredEvents" 
                        :can-add="isSalesperson"
                        :can-edit="isSalesperson"
                        @add-event="openAddEventModal"
                        @edit-event="handleEditEvent"
                    />
                </div>
            </div>
        </div>

        <!-- 使用日志表单组件 -->
        <LogFormModal
            v-model:visible="showModal"
            :readonly="!isSalesperson"
            :is-editing="!!editingEvent"
            :customer-disabled="viewMode === 'customer' || !!editingEvent"
            :customer-hint="getCustomerHint()"
            :customer-name="editingEvent?.customer || selectedCustomer || ''"
            :customers="customers"
            :customer-search-assigned-to="isSalesperson ? salespersonId : selectedSalesPersonId"
            :min-date="logRange.min"
            :max-date="logRange.max"
            :initial-data="modalFormData"
            @save="handleFormSave"
            @delete="handleFormDelete"
        />
    </div>
</template>

<script setup lang="ts">
import Calendar from '~/components/configuration/sales/Calendar.vue'
import LogFormModal from '~/components/configuration/sales/LogFormModal.vue'
import { retrieveSalespersonList } from '~/composables/api/useSalespersonApi'
import { retrieveCustomerList, searchCustomer } from '~/composables/api/useCustomerApi'
import { submitLog, modifyLog, deleteLog, retrieveLogList, FOLLOW_UP_METHODS, FEEDBACK_ATTITUDES, CURRENT_STAGES } from '~/composables/api/useLogApi'
import { useRoute } from 'vue-router'
import { getLogRange, inLogRange } from '~~/shared/utils/logDate'

definePageMeta({
    layout: 'sales',
})

// State
const adminInfo = useState<any>('admin_info', () => ({}))
const role = computed(() => adminInfo.value?.role)
const isSalesperson = computed(() => Number(role.value) === 3)
const activeTab = ref<'all' | 'personal'>(isSalesperson.value ? 'personal' : 'all')
const viewMode = ref<'monthly' | 'customer'>('monthly')
const selectedSalesPerson = ref<string | null>(null)
const selectedSalesPersonId = ref<string | null>(null)
const selectedCustomer = ref<string | null>(null)
const selectedCustomerId = ref<string | null>(null)
const showModal = ref(false)
const newEventDate = ref('')
const editingEvent = ref<any>(null)
const isSaving = ref(false)
const logRange = getLogRange()
const logDateMsg = '日志日期仅限今天及往前7个工作日'

const checkLogDate = (value: string) => {
    if (inLogRange(value)) return true
    ElMessage.warning(logDateMsg)
    return false
}

// const newEventForm = reactive({
//     logDate: '',
//     customerId: '',  // 新增客户ID字段
//     subject: '',
//     followUpMethod: '' as string,
//     currentStage: '' as string,
//     feedbackAttitude: '' as string,
//     followUpResult: '',
//     content: '',
//     // 售后维护相关
//     maintenanceType: '' as string,
//     productModel: '' as string,
//     productSerialNumber: '' as string,
//     problemDescription: '' as string,
//     solutionAndProgress: '' as string,
// })

const salespersonId = useState<string | null>('salesperson_id', () => null)

watch(isSalesperson, (value) => {
    if (value) {
        activeTab.value = 'personal'
    }
})

// 真实数据
const salesPeople = ref<any[]>([])
const allCustomers = ref<any[]>([])
const customerScrollbarRef = ref<any>(null)
const customerPage = ref(1)
const customerHasMore = ref(true)
const isCustomerLoading = ref(false)
const CUSTOMER_PAGE_LIMIT = 20
const isAutoCustomerLoading = ref(false)
const customerSearchQuery = ref('')
const customerSearchResults = ref<any[]>([])
const customerSearchPage = ref(1)
const customerSearchHasMore = ref(true)
const customerSearchTotal = ref(0)
const isCustomerSearchLoading = ref(false)
let customerSearchTimer: ReturnType<typeof setTimeout> | null = null

// 所有日志数据（不按客户筛选）
const allLogs = ref<any[]>([])

// 当前销售的客户列表
const customers = computed(() => {
    const currentSalesId = isSalesperson.value ? salespersonId.value : selectedSalesPersonId.value
    if (!currentSalesId) return []
    
    return allCustomers.value.filter(c => {
        // 确保比较时都是字符串
        const customerSalesId = c._assignSalespersonId?.toString()
        const targetSalesId = currentSalesId?.toString()
        
        return c._isAssigned && 
               customerSalesId === targetSalesId &&
               !c._isFakeDel
    })
})

const isSearchingCustomers = computed(() => Boolean(customerSearchQuery.value.trim()))
const filteredCustomers = computed(() => {
    if (isSearchingCustomers.value) return customerSearchResults.value
    return customers.value
})

// 显示用总人数（来自 salesperson._customerNum）
const customerTotal = computed(() => {
    const currentSalesId = isSalesperson.value ? salespersonId.value : selectedSalesPersonId.value
    if (!currentSalesId) return customers.value.length
    const sp = salesPeople.value.find((p: any) => p?.id?.toString?.() === currentSalesId?.toString?.())
    const n = Number(sp?.customerNum)
    return Number.isFinite(n) ? Math.max(n, customers.value.length) : customers.value.length
})

// 获取销售人员列表
const fetchSalespeople = async () => {
    try {
        const res: any = await retrieveSalespersonList()()
        
        if (res?.data?.salesperson) {
            const activeSalespeople = res.data.salesperson
                .filter((sp: any) => !sp._isFakeDel)
                .map((sp: any) => ({
                    id: sp._id,
                    location: [sp.country, sp.city].filter(Boolean).join('/') || sp.region || '未分配区域',
                    name: sp.name || '未知',
                    customerNum: Number(sp._customerNum) || 0,
                }))
            
            salesPeople.value = activeSalespeople
            
            // 如果是销售人员，自动选中自己
            if (isSalesperson.value && salespersonId.value) {
                const self = activeSalespeople.find((sp: any) => sp.id === salespersonId.value)
                if (self) {
                    selectedSalesPerson.value = self.name
                    selectedSalesPersonId.value = self.id
                }
            } else if (activeSalespeople.length > 0) {
                // 默认选中第一个销售
                selectedSalesPerson.value = activeSalespeople[0].name
                selectedSalesPersonId.value = activeSalespeople[0].id
            }
        }
    } catch (error) {
        console.error('获取销售列表失败:', error)
    }
}

// 获取客户列表
const fetchCustomers = async (opts: { reset?: boolean } = {}) => {
    const reset = Boolean(opts.reset)
    if (isCustomerLoading.value) return
    if (!reset && !customerHasMore.value) return
    if (!selectedSalesPersonId.value) return

    try {
        isCustomerLoading.value = true
        if (reset) {
            customerPage.value = 1
            customerHasMore.value = true
            allCustomers.value = []
        }

        const res: any = await retrieveCustomerList()({
            ...(isSalesperson.value
                ? { id: selectedSalesPersonId.value as string }
                : { assignedTo: selectedSalesPersonId.value as string }),
            page: customerPage.value,
            limit: CUSTOMER_PAGE_LIMIT,
        })
        
        if (res?.data?.customers) {
            const list = res.data.customers
            allCustomers.value = reset ? list : allCustomers.value.concat(list)
            customerHasMore.value = Boolean(res?.data?.pagination?.hasMore)
            if (customerHasMore.value) customerPage.value += 1
            nextTick(() => {
                ensureCustomerFilled()
            })
        }
    } catch (error) {
        console.error('获取客户列表失败:', error)
    } finally {
        isCustomerLoading.value = false
    }
}

const resetCustomerSearch = () => {
    customerSearchResults.value = []
    customerSearchPage.value = 1
    customerSearchHasMore.value = true
    customerSearchTotal.value = 0
}

const fetchCustomerSearch = async (opts: { reset?: boolean } = {}) => {
    const keyword = customerSearchQuery.value.trim()
    if (!keyword) {
        resetCustomerSearch()
        return
    }
    const reset = Boolean(opts.reset)
    if (isCustomerSearchLoading.value) return
    if (!reset && !customerSearchHasMore.value) return

    const currentSalesId = isSalesperson.value ? salespersonId.value : selectedSalesPersonId.value
    if (!currentSalesId) return

    try {
        isCustomerSearchLoading.value = true
        if (reset) {
            customerSearchPage.value = 1
            customerSearchHasMore.value = true
            customerSearchResults.value = []
        }

        const res: any = await searchCustomer()({
            keyword,
            page: customerSearchPage.value,
            limit: CUSTOMER_PAGE_LIMIT,
            assignedTo: currentSalesId as string,
        })

        if (res?.data?.customers) {
            const list = res.data.customers
            const normalized = Array.isArray(list) ? list : []
            if (reset) {
                customerSearchResults.value = normalized
            } else {
                const existingIds = new Set(customerSearchResults.value.map(c => c._id))
                const newCustomers = normalized.filter(c => !existingIds.has(c._id))
                customerSearchResults.value = [...customerSearchResults.value, ...newCustomers]
            }
            const pagination = res?.data?.pagination || {}
            customerSearchHasMore.value = Boolean(pagination?.hasMore)
            customerSearchTotal.value = Number(pagination?.total || 0)
            if (customerSearchHasMore.value) customerSearchPage.value += 1
            nextTick(() => {
                ensureCustomerFilled()
            })
        }
    } catch (error) {
        console.error('搜索客户失败:', error)
    } finally {
        isCustomerSearchLoading.value = false
    }
}

const ensureCustomerFilled = async () => {
    if (isAutoCustomerLoading.value || isCustomerLoading.value || !customerHasMore.value) return
    const wrap = customerScrollbarRef.value?.wrapRef?.value || customerScrollbarRef.value?.wrapRef
    if (!wrap) return

    isAutoCustomerLoading.value = true
    try {
        let guard = 0
        while (wrap.scrollHeight <= wrap.clientHeight && guard < 5) {
            guard += 1
            if (isSearchingCustomers.value) {
                if (!customerSearchHasMore.value) break
                await fetchCustomerSearch()
            } else {
                if (!customerHasMore.value) break
                await fetchCustomers()
            }
            await nextTick()
        }
    } finally {
        isAutoCustomerLoading.value = false
    }
}
const handleCustomerScroll = () => {
    // Element Plus ElScrollbar exposes wrapRef as a Ref<HTMLElement>
    const wrap = customerScrollbarRef.value?.wrapRef?.value || customerScrollbarRef.value?.wrapRef
    if (!wrap) return
    const nearBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 80
    if (nearBottom) {
        if (isSearchingCustomers.value) {
            fetchCustomerSearch()
        } else {
            fetchCustomers()
        }
    }
}

// 获取日志列表 - 获取该销售的所有日志
const fetchLogs = async () => {
    try {
        const currentSalesId = isSalesperson.value ? salespersonId.value : selectedSalesPersonId.value
        const params: any = {}
        if (currentSalesId) {
            params.salespersonId = currentSalesId
        }
        
        const res: any = await retrieveLogList()(params)
    
        if (res?.data?.logs) {
            allLogs.value = res.data.logs.map((log: any) => ({
                id: log._id,
                date: new Date(log.logDate).toISOString().split('T')[0],
                title: log.subject || '日志',
                content: log.content,
                type: getEventType(log.feedbackAttitude),
                customer: log.customer?.name || 'ALL',
                customerId: log.customer?._id?.toString() || log.logCustomerId?.toString(),
                salesPerson: log.salesperson?.name || 'ALL',
                salesPersonId: log.salesperson?._id?.toString() || log.logSalespersonId?.toString(),
                followUpMethod: log.followUpMethod,
                currentStage: log.currentStage,
                feedbackAttitude: log.feedbackAttitude,
                followUpResult: log.followUpResult,
                // 售后维护相关
                maintenanceType: log.maintenanceType,
                productModel: log.productModel,
                productSerialNumber: log.productSerialNumber,
                problemDescription: log.problemDescription,
                solutionAndProgress: log.solutionAndProgress,
                attachments: Array.isArray(log.attachments)
                    ? log.attachments
                    : (log.attachments ? [log.attachments] : [])
            }))
        }
    } catch (error) {
        console.error('获取日志列表失败:', error)
    }
}

// 根据反馈态度返回事件类型颜色
const getEventType = (attitude: string) => {
    switch (attitude) {
        case '十分满意，并达成合作': return 'green'
        case '积极': return 'blue'
        case '中性': return 'gray'
        case '消极': return 'red'
        default: return 'blue'
    }
}

// Computed - 根据当前模式筛选日志
const filteredEvents = computed(() => {
    let filtered = allLogs.value

    // 按销售筛选
    const currentSalesId = isSalesperson.value ? salespersonId.value : selectedSalesPersonId.value
    if (currentSalesId) {
        filtered = filtered.filter(e => 
            e.salesPersonId === currentSalesId?.toString()
        )
    }

    // 特定客户模式：按客户筛选
    if (viewMode.value === 'customer' && selectedCustomerId.value) {
        filtered = filtered.filter(e => 
            e.customerId === selectedCustomerId.value?.toString()
        )
    }

    return filtered
})

// 弹窗表单数据
const modalFormData = computed(() => ({
    logDate: editingEvent.value?.date || newEventDate.value || '',
    customerId: editingEvent.value?.customerId || (viewMode.value === 'customer' ? selectedCustomerId.value : '') || '',
    subject: editingEvent.value?.title || '',
    followUpMethod: editingEvent.value?.followUpMethod || '',
    currentStage: editingEvent.value?.currentStage || '',
    feedbackAttitude: editingEvent.value?.feedbackAttitude || '',
    followUpResult: editingEvent.value?.followUpResult || '',
    content: editingEvent.value?.content || '',
    // 售后维护相关
    maintenanceType: editingEvent.value?.maintenanceType || '',
    productModel: editingEvent.value?.productModel || '',
    productSerialNumber: editingEvent.value?.productSerialNumber || '',
    problemDescription: editingEvent.value?.problemDescription || '',
    solutionAndProgress: editingEvent.value?.solutionAndProgress || '',
    attachments: editingEvent.value?.attachments || []
}))

// 获取客户提示
const getCustomerHint = () => {
    if (editingEvent.value) {
        return `已选择客户：${editingEvent.value.customer}`
    }
    if (viewMode.value === 'customer') {
        return `已选择客户：${selectedCustomer.value}`
    }
    return '请选择该销售对接的客户'
}

// Methods
const switchTab = (tab: 'all' | 'personal') => {
    activeTab.value = tab
    setViewMode('monthly')
}

const route = useRoute()

// 监听销售人员变化，重新获取日志
watch(selectedSalesPersonId, async (newId) => {
    if (newId) {
        await fetchLogs()
        await fetchCustomers({ reset: true })
        if (customerSearchQuery.value.trim()) {
            await fetchCustomerSearch({ reset: true })
        }
    }
})

// 监听 viewMode 变化，确保客户选中
watch(viewMode, (newMode) => {
    if (newMode === 'customer') {
        // 切换到特定客户模式时，确保有选中的客户
        nextTick(() => {
            if (customers.value.length > 0 && !selectedCustomerId.value) {
                selectCustomer(customers.value[0])
            }
        })
    }
})

const setViewMode = (mode: 'monthly' | 'customer') => {
    viewMode.value = mode
    customerSearchQuery.value = ''
    resetCustomerSearch()
    if (mode === 'monthly') {
        selectedCustomer.value = null
        selectedCustomerId.value = null
    } else {
        // 切换到特定客户模式，选中第一个客户
        if (customers.value.length > 0) {
            selectCustomer(customers.value[0])
        }
    }
}

const selectSalesPerson = (person: any) => {
    selectedSalesPerson.value = person.name
    selectedSalesPersonId.value = person.id
    customerSearchQuery.value = ''
    resetCustomerSearch()
    customerSearchQuery.value = ''
    
    // 重置客户选择
    selectedCustomer.value = null
    selectedCustomerId.value = null
    
    if (viewMode.value === 'customer') {
        nextTick(() => {
            if (customers.value.length > 0) {
                selectCustomer(customers.value[0])
            }
        })
    }
    
    // fetchLogs 会通过 watch 触发
}

watch(
    () => customerSearchQuery.value,
    (value) => {
        if (customerSearchTimer) clearTimeout(customerSearchTimer)
        customerSearchTimer = setTimeout(() => {
            if (!value.trim()) {
                resetCustomerSearch()
                return
            }
            fetchCustomerSearch({ reset: true })
        }, 250)
    }
)

const selectCustomer = (customer: any) => {
    selectedCustomer.value = customer.name
    selectedCustomerId.value = customer._id
}

const openAddEventModal = (date: string) => {
    if (!isSalesperson.value) {
        ElMessage.warning('仅销售人员可以添加日志')
        return
    }
    if (!checkLogDate(date)) return
    if (!selectedSalesPersonId.value && !isSalesperson.value) {
        ElMessage.warning('请先选择销售人员')
        return
    }

    if (customers.value.length === 0) {
        ElMessage.warning('该销售暂无对接客户，无法添加日志')
        return
    }

    editingEvent.value = null
    newEventDate.value = date
    showModal.value = true
}

const handleEditEvent = (event: any) => {
    if (isSalesperson.value) {
        if (!checkLogDate(event?.date)) return
    }
    editingEvent.value = event
    newEventDate.value = event.date
    showModal.value = true
}

// 表单保存处理
const handleFormSave = async (formData: any) => {
    try {
        const salesId = isSalesperson.value ? salespersonId.value : selectedSalesPersonId.value
        if (!salesId) {
            ElMessage.warning('请选择销售人员')
            return
        }

        if (isSalesperson.value && !checkLogDate(formData.logDate || newEventDate.value)) {
            return
        }

        const logData: any = {
            content: formData.content,
            logDate: formData.logDate,
            followUpMethod: formData.followUpMethod,
            subject: formData.subject,
            feedbackAttitude: formData.feedbackAttitude,
            currentStage: formData.currentStage,
            followUpResult: formData.followUpResult
        }

        // 如果是售后维护，添加相关字段
        if (formData.currentStage === '售后维护') {
            logData.maintenanceType = formData.maintenanceType
            logData.productModel = formData.productModel || null
            logData.productSerialNumber = formData.productSerialNumber
            logData.problemDescription = formData.problemDescription
            logData.solutionAndProgress = formData.solutionAndProgress
        }

        if (editingEvent.value) {
            const removedAttachments = Array.isArray(formData.removedAttachments)
                ? formData.removedAttachments
                : []
            const hasNewAttachments = Array.isArray(formData.attachments) && formData.attachments.length > 0
            const hasAttachmentChanges = removedAttachments.length > 0 || hasNewAttachments

            if (hasAttachmentChanges) {
                const formDataToSend = new FormData()
                formDataToSend.append('_id', editingEvent.value.id)
                if (logData.content !== undefined) formDataToSend.append('content', logData.content)
                if (logData.logDate) formDataToSend.append('logDate', logData.logDate)
                if (logData.followUpMethod) formDataToSend.append('followUpMethod', logData.followUpMethod)
                if (logData.subject) formDataToSend.append('subject', logData.subject)
                if (logData.feedbackAttitude) formDataToSend.append('feedbackAttitude', logData.feedbackAttitude)
                if (logData.currentStage) formDataToSend.append('currentStage', logData.currentStage)
                if (logData.followUpResult) formDataToSend.append('followUpResult', logData.followUpResult)

                if (logData.maintenanceType) {
                    formDataToSend.append('maintenanceType', logData.maintenanceType)
                    if (logData.productModel) {
                        formDataToSend.append('productModel', logData.productModel)
                    }
                    if (logData.productSerialNumber) {
                        formDataToSend.append('productSerialNumber', logData.productSerialNumber)
                    }
                    if (logData.problemDescription) {
                        formDataToSend.append('problemDescription', logData.problemDescription)
                    }
                    if (logData.solutionAndProgress) {
                        formDataToSend.append('solutionAndProgress', logData.solutionAndProgress)
                    }
                }

                removedAttachments.forEach((path: string) => {
                    formDataToSend.append('removedAttachments', path)
                })

                if (Array.isArray(formData.attachments)) {
                    formData.attachments.forEach((file: File) => {
                        formDataToSend.append('attachments', file)
                    })
                }

                await modifyLog()(formDataToSend)
            } else {
                await modifyLog()({
                    _id: editingEvent.value.id,
                    ...logData
                })
            }
            ElMessage.success('日志修改成功')
        } else {
            const customerId = formData.customerId || selectedCustomerId.value
            if (!customerId) {
                ElMessage.warning('请选择客户')
                return
            }

            const formDataToSend = new FormData()
            formDataToSend.append('logSalespersonId', salesId)
            formDataToSend.append('logCustomerId', customerId)
            formDataToSend.append('content', logData.content)
            formDataToSend.append('logDate', logData.logDate || '')
            formDataToSend.append('followUpMethod', logData.followUpMethod || '')
            formDataToSend.append('subject', logData.subject || '')
            formDataToSend.append('feedbackAttitude', logData.feedbackAttitude || '')
            formDataToSend.append('currentStage', logData.currentStage || '')
            formDataToSend.append('followUpResult', logData.followUpResult || '')

            if (logData.maintenanceType) {
                formDataToSend.append('maintenanceType', logData.maintenanceType)
                if (logData.productModel) {
                    formDataToSend.append('productModel', logData.productModel)
                }
                formDataToSend.append('productSerialNumber', logData.productSerialNumber || '')
                formDataToSend.append('problemDescription', logData.problemDescription || '')
                formDataToSend.append('solutionAndProgress', logData.solutionAndProgress || '')
            }

            if (Array.isArray(formData.attachments)) {
                formData.attachments.forEach((file: File) => {
                    formDataToSend.append('attachments', file)
                })
            }

            await submitLog()(formDataToSend)
            ElMessage.success('日志保存成功')
        }
        
        showModal.value = false
        editingEvent.value = null
        await fetchLogs()
    } catch (error: any) {
        console.error('保存日志失败:', error)
        ElMessage.error(editingEvent.value ? '修改日志失败' : '保存日志失败')
    }
}

const handleFormDelete = async () => {
    if (editingEvent.value) {
        await deleteLog()(editingEvent.value.id)
    }
    ElMessage.success('日志删除成功')
    showModal.value = false
    editingEvent.value = null
    await fetchLogs()
}

onMounted(async () => {
    await fetchSalespeople()
    await fetchCustomers({ reset: true })
    
    // 从 URL 参数中读取 salespersonId 和 customerId
    const querySalespersonId = route.query.salespersonId as string
    const queryCustomerId = route.query.customerId as string
    
    if (isSalesperson.value) {
        switchTab('personal')
        // 销售人员直接获取自己的日志
        await fetchLogs()
    } else if (querySalespersonId) {
        // 如果 URL 中有 salespersonId，自动选中该销售
        const targetSales = salesPeople.value.find(sp => sp.id === querySalespersonId)
        if (targetSales) {
            selectedSalesPerson.value = targetSales.name
            selectedSalesPersonId.value = targetSales.id
            // 获取该销售的日志
            await fetchLogs()
        }
        
        // 如果有 customerId，切换到特定客户模式
        if (queryCustomerId) {
            await nextTick()
            const targetCustomer = customers.value.find(c => c._id === queryCustomerId)
            if (targetCustomer) {
                setViewMode('customer')
                await nextTick()
                selectCustomer(targetCustomer)
            }
        }
        // 没有 customerId，保持默认的"销售当月日志"模式
    } else {
        // 默认获取第一个销售的日志
        await fetchLogs()
    }
})
</script>

<style scoped lang="less">
.logs-root {
    height: 100vh;
    padding: 20px;
    background-color: #f5f7fa;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;

    .main-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
        flex-shrink: 0;

        .left-section {
            display: flex;
            align-items: baseline;
            gap: 24px;

            .title {
                font-size: 28px;
                font-weight: 700;
                color: #333;
                margin: 0;
            }

            .tabs {
                display: flex;
                gap: 20px;
                
                .tab {
                    font-size: 16px;
                    color: #9CA3AF;
                    cursor: pointer;
                    position: relative;
                    padding-bottom: 4px;

                    &.active {
                        color: #111827;
                        font-weight: 600;
                        
                        &::after {
                            content: '';
                            position: absolute;
                            bottom: -4px;
                            left: 0;
                            width: 100%;
                            height: 3px;
                            background-color: #4E8AF4;
                            border-radius: 2px;
                        }
                    }
                }
            }
        }

        .right-section {
            .toggle-switch {
                display: flex;
                background-color: #E5E7EB; // Light gray background
                border-radius: 999px;
                padding: 4px;
                position: relative;

                .toggle-option {
                    padding: 8px 24px;
                    border-radius: 999px;
                    font-size: 14px;
                    font-weight: 500;
                    color: #374151;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    z-index: 1;

                    &.active {
                        background-color: #3B82F6; // Blue active background
                        color: #FFFFFF;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }

                    &:hover:not(.active) {
                        color: #111827;
                    }
                }
            }
        }
    }

    .content-grid {
        flex: 1;
        display: grid;
        grid-template-columns: 240px 240px 1fr; // Default 3 columns
        gap: 20px;
        overflow: hidden;
        transition: all 0.3s ease;

        &.full-width {
            grid-template-columns: 1fr;
        }

        &.two-columns {
            grid-template-columns: 240px 1fr; // 2 columns when customer list is hidden
        }

        .panel {
            background: #fff;
            border-radius: 20px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }

        .list-panel {
            .panel-header {
                padding: 16px 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-bottom: 1px solid #F3F4F6;
                
                .label {
                    font-size: 14px;
                    color: #111827;
                    font-weight: 500;
                }

                .count {
                    font-size: 12px;
                    color: #9CA3AF;
                }
            }

            .list-content {
                flex: 1;
                overflow-y: auto;
                padding: 10px 0;

                .list-item {
                    padding: 12px 20px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    border-left: 3px solid transparent;

                    &:hover {
                        background-color: #F9FAFB;
                    }

                    // Default active style for Sales Person list (Column 1)
                    &.active {
                        background-color: #F0F7FF;
                        border-left-color: #4E8AF4;
                        
                        .item-info .main-text {
                            color: #4E8AF4;
                        }
                    }

                    // Specific styling for Customer List (Column 2)
                    &.customer-item {
                        margin: 0 12px 4px; // Add margin for card look
                        border-radius: 12px;
                        border-left: none; // Remove left border
                        padding: 12px 16px;

                        &.active {
                            background-color: #F0F7FF; // Light blue background
                            
                            .item-info .main-text {
                                color: #111827; // Keep text dark
                            }
                        }
                    }

                    .item-info {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        width: 100%;

                        .sub-text {
                            font-size: 12px;
                            color: #9CA3AF;
                        }

                        .main-text {
                            font-size: 15px;
                            font-weight: 500;
                            color: #374151;
                        }

                        .view-logs-link {
                            margin-top: 4px;
                            font-size: 13px;
                            color: #3B82F6;
                            display: flex;
                            align-items: center;
                            gap: 4px;
                            font-weight: 500;

                            .link-icon {
                                font-size: 12px;
                            }
                        }
                    }

                    .arrow-icon {
                        color: #9CA3AF;
                        font-size: 16px;
                    }
                }

                .empty-tip {
                    padding: 40px 20px;
                    text-align: center;
                    color: #9CA3AF;
                    font-size: 14px;
                }
            }

            .panel-search {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 16px;
                border-bottom: 1px solid #F3F4F6;

                .search-icon {
                    color: #9CA3AF;
                    font-size: 16px;
                }

                input {
                    flex: 1;
                    border: 1px solid #E5E7EB;
                    border-radius: 8px;
                    padding: 6px 10px;
                    font-size: 13px;
                    color: #374151;

                    &:focus {
                        outline: none;
                        border-color: #4E8AF4;
                    }
                }

                .clear-btn {
                    border: none;
                    background: none;
                    color: #4E8AF4;
                    font-size: 12px;
                    cursor: pointer;
                    padding: 4px 6px;

                    &:hover {
                        color: #1D4ED8;
                    }
                }
            }
        }
        
        .calendar-panel {
            padding: 20px;
        }
    }
}
</style>
