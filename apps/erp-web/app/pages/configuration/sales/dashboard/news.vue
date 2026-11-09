<template>
    <div class="news-root">
        <div class="title-section">
            <NuxtLink to="/configuration/sales/dashboard" class="back-link">
                <svg class="back-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
                返回仪表盘
            </NuxtLink>
            <div class="title-row">
                <div class="page-title">最新消息</div>
                <div class="filter-section">
                    <div class="filter-label">分类筛选：</div>
                    <div class="filter-tags">
                        <div
                            v-for="tag in filterTags"
                            :key="tag.value"
                            :class="['filter-tag', { active: activeFilter === tag.value }]"
                            @click="activeFilter = tag.value"
                        >
                            {{ tag.label }}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 卡片网格 -->
        <div v-if="loading" class="loading">加载中...</div>
        <div v-else class="news-grid">
            <NewsCard
                v-for="item in filteredNewsItems" 
                :key="item.id" 
                v-bind="item"
                @view-detail="openModal(item)" 
            />
        </div>

        <!-- 申请详情弹窗 -->
        <NewsCardDetail
            v-model:visible="showApplicationModal" 
            :data="currentNews"
            @confirm="handleConfirmRead"
            @refresh="fetchApplications"
        />

        <!-- 日志详情弹窗（只读模式） -->
        <LogFormModal
            v-model:visible="showLogModal"
            :readonly="true"
            :customer-name="currentLog?.customerInfo || ''"
            :initial-data="currentLogData"
        />
    </div>
</template>

<script setup lang="ts">
import { retrieveApplicationList } from '~/composables/api/useAppApi'
import { retrieveLogList } from '~/composables/api/useLogApi'
import LogFormModal from '~/components/configuration/sales/LogFormModal.vue'

const searchQuery = ref('')
const loading = ref(true)

// 分类筛选
const filterTags = [
    { label: '全部', value: 'all' },
    { label: '新对接申请', value: 'new' },
    { label: '延长维护', value: 'extend' },
    { label: '跟进日志', value: 'log' },
]
const activeFilter = ref('all')

// 弹窗状态管理
const showApplicationModal = ref(false)
const showLogModal = ref(false)
const currentNews = ref<any>(null)
const currentLog = ref<any>(null)

// 当前日志数据
const currentLogData = computed(() => {
    if (!currentLog.value) return {}
    return {
        logDate: currentLog.value.logDate || '',
        subject: currentLog.value.subject || '',
        followUpMethod: currentLog.value.followUpMethod || '',
        currentStage: currentLog.value.currentStage || '',
        feedbackAttitude: currentLog.value.feedbackAttitude || '',
        followUpResult: currentLog.value.followUpResult || '',
        content: currentLog.value.logContent || '',
        attachments: currentLog.value.attachments || []
    }
})

const newsItems = ref<any[]>([])
const DAYS_LIMIT = 30
const isWithinLastDays = (timestamp: number, days = DAYS_LIMIT) => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    startOfToday.setDate(startOfToday.getDate() - (days - 1))
    return timestamp >= startOfToday.getTime()
}

// 打开弹窗的方法
const openModal = (item: any) => {
    if (item.type === 'log') {
        currentLog.value = item
        showLogModal.value = true
    } else {
        currentNews.value = item
        showApplicationModal.value = true
    }
}

// 确认已读的回调
const handleConfirmRead = (id: string) => {
    const target = newsItems.value.find(i => i.id === id)
    if (target) target.hasNotification = false
}

// 格式化日期显示
const formatNewsDate = (date: Date) => {
    const now = new Date()
    const newsDate = new Date(date)

    // 将时间部分置零，只比较日期部分
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const newsDateStart = new Date(newsDate.getFullYear(), newsDate.getMonth(), newsDate.getDate())
    
    const diffTime = todayStart.getTime() - newsDateStart.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) {
        return '今天'
    } else if (diffDays === 1) {
        return '昨天'
    } else {
        return newsDate.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
    }
}

// 格式化时间显示
const formatNewsTime = (date: Date) => {
    const newsDate = new Date(date)
    const hours = newsDate.getHours().toString().padStart(2, '0')
    const minutes = newsDate.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
}

const formatYmd = (raw: any) => {
    if (!raw) return '-'
    const dt = new Date(raw)
    if (Number.isNaN(dt.getTime())) return '-'
    return dt.toISOString().slice(0, 10)
}

// 转换申请数据为消息格式
const transformApplicationToNews = (app: any) => {
    const monthsText = app.appDays >= 30 ? `${Math.floor(app.appDays / 30)}个月` : `${app.appDays}天`
    const applyTimeText = new Date(app._appDate).toLocaleString('zh-CN')
    const expireDateText = new Date(app.customer.expireDate).toLocaleString('zh-CN')
    const isExtend = app.appType === 'extend'
    
    return {
        id: app._id,
        title: `${app.salesperson?.nameCn || '未知销售'}提交了${isExtend ? '延长维护' : '新的客户对接'}申请`,
        date: formatNewsDate(app._appDate),
        time: formatNewsTime(app._appDate),
        timestamp: new Date(app._appDate).getTime(),
        type: 'application',
        hasNotification: true,
        salesName: app.salesperson?.name || '未知销售',
        customerInfo: app.customer?.name || '未知客户',
        customerId: app.customer?._id || app.appCustomerId,
        appType: app.appType || (isExtend ? 'extend' : 'new'),
        contentLines: isExtend
            ? [
                  `延期客户：${app.customer?.company || '未知公司'}`,
                  `当前到期日：${expireDateText}`,
                  `延长时长：${monthsText}`,
                  `申请时间：${applyTimeText}`,
              ]
            : [
                  `申请对接客户：${app.customer?.company || '未知公司'}`,
                  `对接时长：${monthsText}`,
                  `申请时间：${applyTimeText}`,
              ],
        applicationId: app._id,
        appDays: app.appDays
    }
}

// 转换日志数据为消息格式
const transformLogToNews = (log: any) => {
    return {
        id: log._id,
        title: `${log.salesperson?.nameCn || '未知销售'}提交了客户跟进日志`,
        date: formatNewsDate(log._createDate || log.logDate),
        time: formatNewsTime(log._createDate || log.logDate),
        timestamp: new Date(log._createDate || log.logDate).getTime(),
        type: 'log',
        hasNotification: false,
        salesName: log.salesperson?.name || '未知销售',
        customerInfo: log.customer?.name || '未知客户',
        subject: log.subject,
        // 保存完整日志信息用于详情展示
        logDate: log.logDate ? new Date(log.logDate).toISOString().split('T')[0] : '',
        followUpMethod: log.followUpMethod,
        currentStage: log.currentStage,
        feedbackAttitude: log.feedbackAttitude,
        followUpResult: log.followUpResult,
        logContent: log.content,
        attachments: log.attachments || []
    }
}

// 获取消息列表
const fetchApplications = async () => {
    try {
        loading.value = true
        
        const [appRes, logRes]: any[] = await Promise.all([
            retrieveApplicationList()(),
            retrieveLogList()({})
        ])
        
        const items: any[] = []
        
        // 添加申请消息
        if (appRes?.data?.applications) {
            const applicationNews = appRes.data.applications.map(transformApplicationToNews)
            items.push(...applicationNews)
        }
        
        // 添加日志消息
        if (logRes?.data?.logs) {
            const logNews = logRes.data.logs.map(transformLogToNews)
            items.push(...logNews)
        }

        const recentItems = items.filter(
            item => item.type === 'application' || isWithinLastDays(item.timestamp, DAYS_LIMIT)
        )
        
        // 按时间戳倒序排列
        recentItems.sort((a, b) => b.timestamp - a.timestamp)
        
        newsItems.value = recentItems
    } catch (error) {
        console.error('获取消息列表失败:', error)
        ElMessage.error('获取消息失败')
    } finally {
        loading.value = false
    }
}

// 根据搜索和分类过滤消息
const filteredNewsItems = computed(() => {
    let items = newsItems.value

    // 按分类筛选
    if (activeFilter.value !== 'all') {
        if (activeFilter.value === 'log') {
            // 只显示跟进日志
            items = items.filter(item => item.type === 'log')
        } else {
            // 按 appType 筛选申请类型（new 或 extend）
            items = items.filter(item => item.type === 'application' && item.appType === activeFilter.value)
        }
    }

    // 按搜索关键词筛选
    if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        items = items.filter(item =>
            item.title?.toLowerCase().includes(query) ||
            item.salesName?.toLowerCase().includes(query) ||
            item.customerInfo?.toLowerCase().includes(query)
        )
    }

    return items
})

// 页面加载时获取数据
onMounted(() => {
    fetchApplications()
})

definePageMeta({
    layout: 'sales'
})
</script>

<style lang="less" scoped>
.news-root {
    height: 100vh;
    padding: 20px;
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
}

/* 标题区 */
.title-section {
    margin-bottom: 20px;
}

.back-link {
    display: inline-flex;
    align-items: center;
    font-size: 20px;
    color: #3f8cff;
    margin-bottom: 16px;
}

.back-link:hover {
    text-decoration: underline;
}

.back-icon {
    width: 20px;
    height: 20px;
    margin-right: 4px;
}

.title-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.page-title {
    font-size: 28px;
    font-weight: bold;
    color: #333;
}

/* 分类筛选 */
.filter-section {
    display: flex;
    align-items: center;
    gap: 12px;
}

.filter-label {
    font-size: 14px;
    color: #666;
    white-space: nowrap;
}

.filter-tags {
    display: flex;
    gap: 8px;
}

.filter-tag {
    padding: 6px 16px;
    font-size: 14px;
    border-radius: 20px;
    cursor: pointer;
    transition: all 0.2s;
    background-color: #f5f5f5;
    color: #666;
    user-select: none;
}

.filter-tag:hover {
    background-color: #e8e8e8;
}

.filter-tag.active {
    background-color: #3f8cff;
    color: #fff;
}

/* Grid 网格布局 */
.news-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    /* 3列等分 */
    gap: 24px;
    /* 卡片间距 */
}

@media (max-width: 1024px) {
    .news-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (max-width: 768px) {
    .news-grid {
        grid-template-columns: 1fr;
    }
}

.loading {
    text-align: center;
    padding: 40px;
    font-size: 16px;
    color: #666;
}
</style>
