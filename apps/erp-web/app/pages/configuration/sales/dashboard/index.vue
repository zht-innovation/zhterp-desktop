<template>
    <div class="dashboard-page">
        <BulletinBoard />

        <!-- 顶部统计行 -->
        <div class="stats-row">
            <div class="stat-title">仪表盘</div>
            <div class="stat-items">
                <div v-for="(item, index) in stats" :key="index" class="stat-item">
                    <span class="label" v-if="item.label != '累计成交次数' && item.label != '本月成交次数'">{{ item.label }}</span>
                    <span class="value" v-if="item.label != '累计成交次数' && item.label != '本月成交次数'">{{ item.value }}</span>
                </div>
            </div>
        </div>

        <!-- 中间内容区 -->
        <el-row :gutter="20" class="mid-section">
            <!-- 1. 销售总览 -->
            <el-col :span="13">
                <div class="card-box full-height">
                    <div class="card-header">
                        <h3>销售总览</h3>
                        <NuxtLink class="link" to="/configuration/sales/sale">查看全部 ></NuxtLink>
                    </div>
                    <div class="sales-grid">
                        <div v-for="person in salesTeam" :key="person.id" class="sales-card">
                            <div class="avatar-row">
                                <el-avatar
                                    class="avatar"
                                    :src="person.avatar || undefined"
                                    style="background:#d9ecff; color:#409eff;"
                                >
                                    {{ getNameInitial(person.name) }}
                                </el-avatar>
                            </div>
                            <div class="name">{{ person.name }}</div>
                            <div class="region">{{ person.region }}</div>
                            <div class="tags">
                                <span class="tag clickable" font @click="goToSalesCustomers(person)">
                                    客户
                                    <span class="tag-item">{{ person.clients }}</span>
                                </span>
                                <span class="tag" font>
                                    成交
                                    <span class="tag-item">{{ person.deals }}</span>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </el-col>

            <!-- 2. 最新信息 -->
            <el-col :span="5">
                <div class="card-box full-height">
                    <div class="card-header">
                        <h3>最新信息</h3>
                        <NuxtLink class="link" to="/configuration/sales/dashboard/news">查看全部 ></NuxtLink>
                    </div>
                    <div class="news-list">
                        <div v-for="news in displayedNews" :key="news.id" class="news-item">
                            <div class="line-deco"></div>
                            <div class="news-content">
                                <p class="news-title">{{ news.title }}</p>
                                <div class="news-meta">
                                    <span>{{ news.date }} | {{ news.time }}</span>
                                    <el-button v-if="news.type=='log'" size="small" round class="detail-btn" @click="openCustomerDetail(news)">
                                        <Icon name="material-symbols:arrow-circle-right-outline" />
                                        客户
                                    </el-button>
                                    <el-button size="small" round class="detail-btn" @click="openLatestDetail(news)">
                                        <Icon name="material-symbols:arrow-circle-right-outline" />
                                        详细查看
                                    </el-button>
                                </div>
                            </div>
                        </div>
                        <div v-if="hasMoreNews" class="more-indicator">
                            <span class="dots">...</span>
                            <NuxtLink to="/configuration/sales/dashboard/news" class="more-text">
                                还有 {{ remainingNewsCount }} 条消息
                            </NuxtLink>
                        </div>
                    </div>
                </div>
            </el-col>

            <!-- 3. 项目日志 -->
            <el-col :span="6">
                <div class="card-box full-height">
                    <div class="card-header">
                        <h3>项目日志</h3>
                        <NuxtLink class="link" to="/configuration/sales/logs">查看全部 ></NuxtLink>
                    </div>
                    <div class="log-list">
                        <div v-for="log in displayedLogs" :key="log.id" class="log-item">
                            <div class="log-user">
                                <el-avatar
                                    class="avatar"
                                    :size="30"
                                    :src="log.avatar || undefined"
                                    style="background:#fde2e2; color:#f56c6c;"
                                >
                                    {{ getNameInitial(log.salesperson) }}
                                </el-avatar>
                                <div class="user-info">
                                    <div class="u-name">{{ log.salesperson || '未知' }}</div>
                                    <div class="u-region">{{ log.customer || '-' }}</div>
                                </div>
                            </div>
                            <div class="log-box">
                                <Icon name="material-symbols:description" class="icon-file"/>
                                <div class="log-text">{{ log.subject || log.content || '无内容' }}</div>
                                <el-button size="small" round class="detail-btn" @click="openLogDetail(log)">
                                    <Icon name="material-symbols:arrow-circle-right-outline" />
                                    详细查看
                                </el-button>
                            </div>
                        </div>
                        <div v-if="projectLogs.length === 0" class="empty-tip">
                            暂无日志
                        </div>
                        <div v-if="hasMoreLogs" class="more-indicator">
                            <span class="dots">...</span>
                            <NuxtLink to="/configuration/sales/logs" class="more-text">
                                还有 {{ remainingLogsCount }} 条日志
                            </NuxtLink>
                        </div>
                    </div>
                </div>
            </el-col>
        </el-row>

        <!-- 底部内容区 -->
        <el-row :gutter="20" class="bottom-section">
            <!-- 客户圆形统计 -->
            <el-col :span="16">
                <div class="title">
                    <h3>客户总览</h3>
                    <NuxtLink to="/configuration/sales/customer" class="link">查看全部 ></NuxtLink>
                </div>
                <div class="client-grid">
                    <div
                        v-for="(client, index) in clientStats"
                        :key="index"
                        class="client-card"
                        @click="goToCategoryCustomers(client)"
                    >
                        <div :class="{
                            'circle-progress': 1,
                            'b-g-border': client.label == 'B端客户' || client.label == 'G端客户',
                        }">
                            <div class="customer-number">{{ client.count }}</div>
                        </div>
                        <div class="client-info">
                            <div class="c-label">{{ client.label }}</div>
                            <div class="c-sub">{{ client.sub }}</div>
                        </div>
                    </div>
                </div>
            </el-col>

            <!-- 折线图区域 -->
            <el-col :span="8">
                <div class="chart-opts">
                    <span>获客折线图</span>
                    <span class="link">显示日期</span>
                </div>
                <div class="chart-placeholder">
                    <LineChart :data="chartData" :labels="chartLabels" />
                </div>
            </el-col>
        </el-row>

        <!-- 这里需要添加 NewsCardDetail 组件来支持详情查看 -->
        <NewsCardDetail
            v-model:visible="showModal" 
            :data="currentNews"
            @refresh="fetchApplications"
        />
        <LogCustomerModal
            v-model:visible="showCustomerModal"
            :readonly="true"
            :customer=customerDetailInfo
            :initial-data="currentLogData"
        />
        <LogFormModal
            v-model:visible="showLogModal"
            :readonly="true"
            :customer-name="currentLog?.customerInfo || ''"
            :initial-data="currentLogData"
        />
    </div>
</template>

<style lang="less" scoped>
.dashboard-page {
    padding: 20px;
    color: #202122;
    height: 100vh;
    overflow: auto;
}

@media (min-aspect-ratio: 21/9) {
    .dashboard-page {
        overflow: auto;
    }
}

// 统计行
.stats-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;

    .stat-title {
        font-size: 28px;
        font-weight: bold;
        color: #333;
        margin-right: 40px;
    }

    .stat-items {
        flex: 1;
        display: flex;
        justify-content: space-around;

        .stat-item {
            display: flex;
            gap: 10px;
            align-items: baseline;

            .label {
                color: #606266;
                font-size: 20px;
            }

            .value {
                color: #409EFF;
                font-size: 28px;
                font-weight: bold;
            }
        }
    }
}

// 通用卡片样式
.card-box {
    background: #fff;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.02);
    margin-bottom: 20px;

    &.full-height {
        height: 460px;
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;

        h3 {
            margin: 0;
            font-size: 20px;
            font-weight: 600;
        }

        .link {
            font-size: 18px;
            color: #409eff;
            cursor: pointer;
        }
    }
}

// 销售 Grid
.sales-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 15px;

    .sales-card {
        background: #f8f9fa;
        border-radius: 8px;
        padding: 15px;
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        height: fit-content; // 让卡片高度自适应内容

	        .avatar-row {
	            height: 40px;
	            margin-bottom: 8px;
	            display: flex;
	            justify-content: center;
	            align-items: center;

	            .avatar {
	                width: 40px;
	                height: 40px;
	                display: flex;
	                justify-content: center;
	                align-items: center;
	            }

	            // Avoid inline-image baseline causing extra row height in some browsers/styles.
	            :deep(.el-avatar img) {
	                display: block;
	            }
	        }

        .name {
            font-weight: 600;
            font-size: 18px;
            margin-bottom: 4px;
        }

        .region {
            font-size: 18px;
            margin-bottom: 10px;
        }

        .tags {
            display: flex;
            gap: 10px;
            align-items: center;
            justify-content: center;

            .tag {
                background: #fff;
                border: 1px solid #909399;
                ;
                border-radius: 8px;
                padding: 2px 4px;
                font-size: 18px;
                color: #606266;
            }

            .tag.clickable {
                cursor: pointer;
                transition: background 0.2s, color 0.2s, border-color 0.2s;
            }

            .tag.clickable:hover {
                background: #e6f0ff;
                color: #2563eb;
                border-color: #93c5fd;
            }

            .tag-item {
                font-size: 20px;
                color: black;
                font-weight: 600;
            }
        }
    }
}

// 最新信息 List
.news-list {
    display: flex;
    flex-direction: column;
    
    .news-item {
        border-left: 6px solid #409eff;
        padding-left: 15px;
        margin-bottom: 25px;
        position: relative;

        .news-title {
            font-size: 18px;
            font-weight: 500;
            margin-bottom: 25px;
        }

        .news-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: #909399;
            font-size: 16px;

            .detail-btn {
                padding: 5px 7px;
                font-size: 16px;
            }
        }
    }

    .more-indicator {
        text-align: center;
        padding: 10px 0;
        
        .dots {
            font-size: 24px;
            color: #909399;
            letter-spacing: 4px;
            display: block;
            margin-bottom: 8px;
        }
        
        .more-text {
            font-size: 16px;
            color: #409eff;
            text-decoration: none;
            
            &:hover {
                text-decoration: underline;
            }
        }
    }
}

// 项目日志 List
.log-list {
    .log-item {
        margin-bottom: 20px;

        .log-user {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 6%;

            .avatar {
                width: 35px;
                height: 35px;
                display: flex;
                justify-content: center;
                align-items: center;
            }

            .user-info {
                .u-name {
                    font-size: 18px;
                    font-weight: 600;
                }

                .u-region {
                    font-size: 16px;
                    color: #909399;
                }
            }
        }

        .log-box {
            background: #f4f6f8;
            padding: 10px;
            border-radius: 8px;
            display: flex;
            gap: 8px;
            margin-bottom: 20px;
            align-items: center;

            .icon-file {
                color: #409eff;
                margin-top: 2px;
                font-size: 24px;
                flex-shrink: 0;
            }

            .log-text {
                font-size: 18px;
                color: #606266;
                line-height: 1.6;
                overflow: hidden;
                text-overflow: ellipsis;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                flex: 1;
            }
        }
    }

    .empty-tip {
        text-align: center;
        padding: 40px 0;
        color: #909399;
        font-size: 14px;
    }

    .more-indicator {
        text-align: center;
        padding: 10px 0;
        
        .dots {
            font-size: 24px;
            color: #909399;
            letter-spacing: 4px;
            display: block;
            margin-bottom: 8px;
        }
        
        .more-text {
            font-size: 16px;
            color: #409eff;
            text-decoration: none;
            
            &:hover {
                text-decoration: underline;
            }
        }
    }
}

.bottom-section {
    .title {
        display: flex;
        justify-content: space-between;
        margin-bottom: 15px;
    }

    h3 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
    }

    .link {
        font-size: 18px;
        color: #409eff;
        cursor: pointer;
    }

    .chart-opts {
        text-align: right;
        font-size: 18px;
        cursor: pointer;

        span {
            padding: 0 7px;
        }

        link {
            color: #409eff;
        }
    }
}

// 客户总览 Grid
.client-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;

    .client-card {
        background: #fff;
        padding: 20px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 15px;
        box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.02);
        cursor: pointer;

        .circle-progress {
            width: 80px;
            aspect-ratio: 1;
            border-radius: 50%;
            border: 3.5px solid #409eff;
            border-right: none;
            transform: rotate(-45deg);
            display: flex;
            justify-content: center;
            align-items: center;

            .customer-number {
                font-size: 24px;
                font-weight: bold;
                transform: rotate(45deg);
            }
        }

        .b-g-border {
            border: 3.5px solid rgb(202, 28, 28);
            border-right: none;
        }

        .client-info {
            .c-label {
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 4px;
            }

            .c-sub {
                font-size: 18px;
                color: #909399;
            }
        }
    }
}
</style>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { retrieveApplicationList } from '~/composables/api/useAppApi'
import { retrieveSalespersonList } from '~/composables/api/useSalespersonApi'
import { getCustomerStats, retrieveCustomerDetail } from '~/composables/api/useCustomerApi'
import { retrieveLogList } from '~/composables/api/useLogApi'
import LogFormModal from '~/components/configuration/sales/LogFormModal.vue'

definePageMeta({
    layout: 'sales'
})

const router = useRouter()

// 1. 顶部统计
const stats = ref([
    { label: '客户总人数', value: 0, unit: '' },
    { label: '销售总人数', value: 0, unit: '' },
    { label: '本月新增客户', value: 0, unit: '' },
    { label: '累计成交次数', value: 0, unit: '' },
    { label: '本月成交次数', value: 0, unit: '' },
])

// 2. 销售总览
type SalesTeamMember = {
    id: string
    name: string
    avatar?: string
    region: string
    clients: number
    deals: number
}

const salesTeam = ref<SalesTeamMember[]>([])

const customerDetailInfo = ref<{ customer?: any }>({})

const getNameInitial = (name: string) => (name || '?').trim().slice(0, 1) || '?'

const goToSalesCustomers = (person: SalesTeamMember) => {
    router.push({
        path: '/configuration/sales/customer',
        query: {
            salesperson: person.name || ''
        }
    })
}

const goToCategoryCustomers = (client: { category?: string }) => {
    if (!client?.category) return
    router.push({
        path: '/configuration/sales/customer',
        query: {
            category: client.category
        }
    })
}

// 获取销售人员列表
const fetchSalespeople = async () => {
    try {
        const res: any = await retrieveSalespersonList()()

        if (res?.data?.salesperson) {
            // 过滤掉已删除的销售，只显示前8个
            const activeSalespeople = res.data.salesperson
                .filter((sp: any) => !sp._isFakeDel)
                .slice(0, 8)
                .map((sp: any) => ({
                    id: sp._id,
                    name: sp.nameCn || sp.name || '暂无',
                    avatar: sp.avatar || '',
                    region: [sp.country || '暂无', sp.city || '暂无'].filter(Boolean).join('/'),
                    clients: sp._customerNum || 0,
                    deals: sp._dealCount || 0,
                }))
            
            salesTeam.value = activeSalespeople
            
            // 更新统计数据中的销售总人数
            stats.value[1].value = res.data.salesperson.filter((sp: any) => !sp._isFakeDel).length
        }
    } catch (error) {
        console.error('获取销售列表失败:', error)
    }
}

// 3. 最新信息
const latestNews = ref<any[]>([])

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

const isWithinLastDays = (timestamp: number, days = 7) => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    startOfToday.setDate(startOfToday.getDate() - (days - 1))
    return timestamp >= startOfToday.getTime()
}

// 转换申请数据为消息格式
const transformApplicationToNews = (app: any) => {
    const monthsText = app.appDays >= 30 ? `${Math.floor(app.appDays / 30)}个月` : `${app.appDays}天`
    const applyTimeText = new Date(app._appDate).toLocaleString('zh-CN')
    const expireDateText = new Date(app.customer.expireDate).toLocaleString('zh-CN')
    const isExtend = app.appType === 'extend'

    return {
        id: app._id,
        title: `${app.salesperson?.nameCn || '未知销售'}提交了${isExtend ? '维护延期' : '新的客户对接'}申请`,
        date: formatNewsDate(app._appDate),
        time: formatNewsTime(app._appDate),
        timestamp: new Date(app._appDate).getTime(),
        type: 'application',
        hasNotification: true,
        salesName: app.salesperson?.name || app.salesperson?.nameCn || '未知销售',
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
        title: `${log.salesperson?.nameCn || '未知销售'}提交了客户${log.customer?.name || '未知客户'}跟进日志`,
        date: formatNewsDate(log._createDate || log.logDate),
        time: formatNewsTime(log._createDate || log.logDate),
        timestamp: new Date(log._createDate || log.logDate).getTime(),
        type: 'log',
        customerInfo: log.customer?.name || '未知客户',
        customerId: log.customer?._id || '',
        customerCompany: log.customer?.company || '-',
        customerRegion: log.customer?.country || '-',
        customerContant: log.customer?.phone || '-',
        customerEmail: log.customer?.email || '-',
        subject: log.subject,
        logDate: log.logDate ? new Date(log.logDate).toISOString().split('T')[0] : '',
        followUpMethod: log.followUpMethod,
        currentStage: log.currentStage,
        feedbackAttitude: log.feedbackAttitude,
        followUpResult: log.followUpResult,
        logContent: log.content,
        attachments: log.attachments || []
    }
}

// 获取申请列表
const fetchApplications = async () => {
    try {
        const [appRes, logRes]: any[] = await Promise.all([
            retrieveApplicationList()(),
            retrieveLogList()({})
        ])

        const newsItems: any[] = []
        
        // 添加申请消息
        if (appRes?.data?.applications) {
            const applicationNews = appRes.data.applications.map(transformApplicationToNews)
            newsItems.push(...applicationNews)
        }
        
        // 添加日志消息
        if (logRes?.data?.logs) {
            const logNews = logRes.data.logs.map(transformLogToNews)
            newsItems.push(...logNews)
        }

        const recentNews = newsItems.filter(
            item => item.type === 'application' || isWithinLastDays(item.timestamp, 7)
        )

        // 按时间戳倒序排列
        recentNews.sort((a, b) => b.timestamp - a.timestamp)

        latestNews.value = recentNews
    } catch (error) {
        console.error('获取消息列表失败:', error)
    }
}

// 只显示前3条消息
const displayedNews = computed(() => latestNews.value.slice(0, 3))

// 是否有更多消息
const hasMoreNews = computed(() => latestNews.value.length > 3)

// 剩余消息数量
const remainingNewsCount = computed(() => Math.max(0, latestNews.value.length - 3))

// 4. 项目日志
const projectLogs = ref<any[]>([])

// 获取项目日志
const fetchProjectLogs = async () => {
    try {
        const res: any = await retrieveLogList()({})
        
        if (res?.data?.logs) {
            projectLogs.value = res.data.logs.map((log: any) => ({
                id: log._id,
                salesperson: log.salesperson?.name || '未知',
                avatar: log.salesperson?.avatar || '',
                customer: log.customer?.id || '-',
                customerInfo: log.customer?.id || '未知客户',
                subject: log.subject || '',
                content: log.content || '',
                logDate: log.logDate ? new Date(log.logDate).toISOString().split('T')[0] : '',
                followUpMethod: log.followUpMethod,
                currentStage: log.currentStage,
                feedbackAttitude: log.feedbackAttitude,
                followUpResult: log.followUpResult,
                logContent: log.content,
                attachments: log.attachments || [],
                date: log.logDate
            }))
        }
    } catch (error) {
        console.error('获取项目日志失败:', error)
    }
}

// 只显示前3条日志
const displayedLogs = computed(() => projectLogs.value.slice(0, 2))

// 是否有更多日志
const hasMoreLogs = computed(() => projectLogs.value.length > 3)

// 剩余日志数量
const remainingLogsCount = computed(() => Math.max(0, projectLogs.value.length - 3))

const openLatestDetail = (item: any) => {
    if (item.type === 'log') {
        currentLog.value = item
        showLogModal.value = true
    } else {
        currentNews.value = item
        showModal.value = true
    }
}

const openCustomerDetail = (item: any) => {
    try {
        (async () => {
    const res = await (retrieveCustomerDetail()(item.customerId)) as any
    customerDetailInfo.value = res.data?.customer
    console.error('获取客户信息对:', customerDetailInfo.value)
})()
    
        
    }
     catch (error) {
        console.error('获取客户信息失败:', error)
    }
    
    showCustomerModal.value = true
    
}

const openLogDetail = (item: any) => {
    currentLog.value = item
    showLogModal.value = true
}

// 5. 客户总览 (圆形进度条数据)
const clientStats = ref([
    { label: '国外客户', sub: '企业、学校', count: 0, color: '#00d2d3', category: 'foreign' },
    { label: '国内客户', sub: '企业、学校', count: 0, color: '#00d2d3', category: 'domestic' },
    { label: '一般客户', sub: '已成单', count: 0, color: '#00d2d3', category: 'general' },
    { label: 'B端客户', sub: '企业、学校', count: 0, color: '#ff6b6b', category: 'bType' },
    { label: '战略合作', sub: '代理商', count: 0, color: '#00d2d3', category: 'strategic' },
    { label: '优质客户', sub: '已成单', count: 0, color: '#00d2d3', category: 'quality' },
    { label: '潜在客户', sub: '未成单', count: 0, color: '#00d2d3', category: 'potential' },
    { label: 'G端客户', sub: '政府', count: 0, color: '#ff6b6b', category: 'gType' },
])

// 获取客户统计数据
const fetchCustomerStats = async () => {
    try {
        const res: any = await getCustomerStats()()
        
        if (res?.data?.stats) {
            const statsData = res.data.stats
            
            // 更新客户总览数据
            clientStats.value = [
                { label: '国外客户', sub: '企业、学校', count: statsData.foreign || 0, color: '#00d2d3', category: 'foreign' },
                { label: '国内客户', sub: '企业、学校', count: statsData.domestic || 0, color: '#00d2d3', category: 'domestic' },
                { label: '一般客户', sub: '已成单', count: statsData.general || 0, color: '#00d2d3', category: 'general' },
                { label: 'B端客户', sub: '企业、学校', count: statsData.bType || 0, color: '#ff6b6b', category: 'bType' },
                { label: '战略合作', sub: '代理商', count: statsData.strategic || 0, color: '#00d2d3', category: 'strategic' },
                { label: '优质客户', sub: '已成单', count: statsData.quality || 0, color: '#00d2d3', category: 'quality' },
                { label: '潜在客户', sub: '未成单', count: statsData.potential || 0, color: '#00d2d3', category: 'potential' },
                { label: 'G端客户', sub: '政府', count: statsData.gType || 0, color: '#ff6b6b', category: 'gType' },
            ]
            
            // 更新顶部统计中的客户总人数
            stats.value[0].value = statsData.total || 0
            
            // 更新累计成交次数（一般客户 + 优质客户）
            stats.value[2].value = (statsData.general || 0) + (statsData.quality || 0)
        }

        // 更新折线图：最近12个月（含当月）新增客户数
        if (res?.data?.acquisition) {
            chartLabels.value = res.data.acquisition.labels || []
            chartData.value = res.data.acquisition.data || []

            // 本月新增客户
            const latest = chartData.value[chartData.value.length - 1] ?? 0
            stats.value[3].value = Number(latest) || 0
        }
    } catch (error) {
        console.error('获取客户统计失败:', error)
    }
}

// 6. 折线图数据
const chartData = ref<number[]>([])
const chartLabels = ref<string[]>([])

const searchQuery = ref('')

// 添加弹窗相关状态
const showModal = ref(false)
const currentNews = ref<any>(null)
const showLogModal = ref(false)
const showCustomerModal = ref(false)
const currentLog = ref<any>(null)

const currentLogData = computed(() => {
    if (!currentLog.value) return {}
    return {
        logDate: currentLog.value.logDate || '',
        subject: currentLog.value.subject || '',
        followUpMethod: currentLog.value.followUpMethod || '',
        currentStage: currentLog.value.currentStage || '',
        feedbackAttitude: currentLog.value.feedbackAttitude || '',
        followUpResult: currentLog.value.followUpResult || '',
        content: currentLog.value.logContent || currentLog.value.content || '',
        attachments: currentLog.value.attachments || []
    }
})

onMounted(() => {
    fetchSalespeople()
    fetchApplications()
    fetchCustomerStats()
    fetchProjectLogs()
})
</script>
