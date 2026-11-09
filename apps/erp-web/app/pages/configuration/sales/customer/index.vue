<template>
    <div class="customer-root">
        <Search 
            v-model:searchQuery="searchQuery" 
            @search="handleSearch" 
            @clear="handleClearSearch" 
            :placeholder="'搜索客户姓名、国家、城市、联系方式、邮箱、公司、维护销售...'"
        />

        <div class="header">
            <div class="title">客户管理</div>
            <div class="actions">
                <div class="filter-group">
                    <span class="filter-label">客户等级</span>
                    <select v-model="filterLevel" class="filter-select">
                        <option value="">全部等级</option>
                        <option v-for="level in customerLevels" :key="level.value" :value="level.value">
                            {{ level.label }}
                        </option>
                    </select>
                </div>
                <button
                    v-if="!isSalesperson || (isSalesperson && select === 0)"
                    class="btn-batch"
                    :class="{ active: isBatchMode }"
                    @click="toggleBatchMode"
                >
                    <Icon name="mdi:checkbox-multiple-marked-outline" class="btn-icon" />
                    {{ isBatchMode ? '退出多选' : '多选' }}
                </button>
                <button
                    v-if="isCompanyMergeAllowed"
                    class="btn-merge"
                    :class="{ active: isCompanyMergeMode }"
                    @click="toggleCompanyMergeMode"
                >
                    <Icon name="mdi:office-building" class="btn-icon" />
                    {{ isCompanyMergeMode ? '取消公司合并' : '按公司合并' }}
                </button>
                <button class="btn-export" :disabled="isExporting" @click="handleExportCustomers">
                    <Icon name="mdi:download" class="btn-icon" />
                    {{ isExporting ? '导出中...' : '导出全部' }}
                </button>
                <button class="btn-import" @click="showImportDialog = true">
                    <Icon name="mdi:file-excel" class="btn-icon" />
                    批量导入
                </button>
                <button class="btn-add" @click="showAddDialog = true">
                    <span class="icon">+</span>
                    新增客户
                </button>
            </div>
        </div>

        <!-- 搜索结果提示 -->
        <div v-if="isSearchMode" class="search-result-hint">
            <span>搜索 <span class="search-keyword">{{ currentKeyword }}</span> 的结果，共 {{ searchTotal }} 条</span>
            <button class="btn-clear-search" @click="handleClearSearch">清除搜索</button>
        </div>

        <div v-else-if="currentCategoryLabel" class="category-hint">
            <span>当前分类：<span class="category-label">{{ currentCategoryLabel }}</span></span>
            <div class="spacer"></div>
            <button class="btn-clear-category" @click="handleClearCategory">清除分类</button>
        </div>

        <div class="tabs" v-if="!isSearchMode">
            <div :class="{
                tab: true,
                active: select === 0
            }" href="/configuration/sales/customer" @click="select = 0">客户检索</div>
            <div :class="{
                tab: true,
                active: select === 1
            }" v-if="canViewPublicCustomerPool" @click="select = 1">公共客户池（待分配）</div>
            <div :class="{
                tab: true,
                active: select === 2
            }" @click="select = 2" v-if="!isSalesperson">回收站</div>
            <div class="spacer"></div>
            <div class="tab-icons">
                <!-- TODO -->
            </div>
        </div>

        <div v-if="isBatchMode" class="batch-toolbar">
            <div class="batch-info">已选 {{ selectedCount }} 个</div>
            <div class="batch-actions">
                <button
                    class="btn-batch-action"
                    :disabled="selectedCount === 0 || select === 2"
                    @click="openBatchTagDialog"
                >
                    批量贴标签
                </button>
                <button
                    v-if="!isSalesperson"
                    class="btn-batch-action"
                    :disabled="selectedCount === 0 || select === 2"
                    @click="openBatchExtendDialog"
                >
                    批量延长维护时间
                </button>
                <button
                    v-if="!isSalesperson && select === 0"
                    class="btn-batch-action"
                    :disabled="selectedCount === 0"
                    @click="handleBatchUnassign"
                >
                    批量放回客户池
                </button>
                <button
                    v-if="!isSalesperson"
                    class="btn-batch-action danger"
                    :disabled="selectedCount === 0"
                    @click="handleBatchDelete"
                >
                    批量删除
                </button>
                <button
                    class="btn-batch-action"
                    :disabled="selectedCount === 0"
                    @click="handleExportSelected"
                >
                    批量导出
                </button>
            </div>
        </div>

        <div class="customer-table-area">
            <div class="list-header">
                <div ref="headerScrollRef" class="header-info-pane customer-sync-scroll">
                    <div class="header-info-content">
                        <div class="col select" v-if="isBatchMode">
                            <input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" />
                        </div>
                        <div class="col attachments"></div>
                        <div class="col name">
                            <span>姓名</span>
                        </div>
                        <div class="col region">区域</div>
                        <div class="col contact">联系方式</div>
                        <div class="col email">邮箱</div>
                        <div class="col company">
                            <span>公司</span>
                        </div>
                        <div class="col channel">获客渠道</div>
                        <div class="col orders">成交订单数</div>
                        <div class="col sales">维护销售</div>
                    </div>
                </div>
                <div class="actions-placeholder"></div>
            </div>

            <el-scrollbar class="customer-list" ref="scrollbarRef">
                <template v-if="isCompanyMergeMode">
                    <div
                        v-for="group in companyGroups"
                        :key="group.companyKey"
                        class="company-group"
                    >
                        <div class="company-group-header" @click="toggleCompanyGroup(group.companyKey)">
                            <div class="company-group-left">
                                <Icon
                                    name="mdi:chevron-right"
                                    class="group-arrow"
                                    :class="{ expanded: !isCompanyGroupCollapsed(group.companyKey) }"
                                />
                                <span class="company-group-name">{{ group.companyName }}</span>
                                <span class="company-group-count">{{ group.customerCount }} 位客户</span>
                            </div>
                        </div>

                        <div v-if="!isCompanyGroupCollapsed(group.companyKey)" class="company-group-body">
                            <div v-if="isCompanyGroupLoading(group.companyKey)" class="group-loading">
                                <el-icon class="is-loading"><Loading /></el-icon>
                                <span>加载公司客户中...</span>
                            </div>
                            <div v-else-if="getCompanyGroupCustomers(group.companyKey).length === 0" class="group-empty">
                                <span>暂无客户</span>
                            </div>
                            <CustomerItem
                                v-else
                                v-for="customer in getCompanyGroupCustomers(group.companyKey)"
                                :key="customer._id"
                                :customer="customer"
                                :select="select"
                                :isSalesperson="isSalesperson"
                                :enable-select="isBatchMode"
                                :is-selected="selectedCustomerIds.includes(customer._id)"
                                :highlightKeyword="isSearchMode ? currentKeyword : ''"
                                :matchedFields="customer._matchedFields || []"
                                @toggle-select="handleToggleSelect"
                                @refresh="isSearchMode ? handleSearch() : refreshCustomers()"
                            />
                        </div>
                    </div>
                </template>
                <template v-else>
                    <CustomerItem 
                        v-for="customer in displayCustomers" 
                        :key="customer._id" 
                        :customer="customer"
                        :select="select"
                        :isSalesperson="isSalesperson"
                        :enable-select="isBatchMode"
                        :is-selected="selectedCustomerIds.includes(customer._id)"
                        :highlightKeyword="isSearchMode ? currentKeyword : ''"
                        :matchedFields="customer._matchedFields || []"
                        @toggle-select="handleToggleSelect"
                        @refresh="isSearchMode ? handleSearch() : refreshCustomers()"
                    />
                </template>
                
                <!-- 加载状态 -->
                <div v-if="isCurrentLoading" class="loading-more">
                    <el-icon class="is-loading"><Loading /></el-icon>
                    <span>加载中...</span>
                </div>
                
                <!-- 空状态 -->
                <div v-else-if="currentDisplayCount === 0 && !isCurrentLoading" class="empty-state">
                    <span>{{ isSearchMode ? '没有找到匹配的客户' : '暂无客户数据' }}</span>
                </div>
            </el-scrollbar>

            <div class="customer-scroll-footer">
                <div class="customer-bottom-scroll customer-sync-scroll">
                    <div class="customer-bottom-scroll-content"></div>
                </div>
                <div class="actions-placeholder"></div>
            </div>
        </div>

        <div v-if="currentTotal > 0" class="pagination-bar">
            <div class="pagination-info">
                当前页 {{ currentDisplayCount }} {{ paginationUnit }}，共 {{ currentTotalPages }} 页
            </div>
            <el-config-provider :locale="paginationLocale">
                <el-pagination
                    background
                    layout="prev, pager, next, jumper"
                    :current-page="currentPaginationPage"
                    :page-size="currentPageSize"
                    :total="currentTotal"
                    :pager-count="7"
                    @current-change="handlePageChange"
                />
            </el-config-provider>
        </div>

        <AddCustomerDialog v-model="showAddDialog" @submit="handleAddCustomer" />
        <BatchImportCustomerDialog
            v-model="showImportDialog"
            :loading="isImporting"
            @submit="handleImportCustomers"
        />

        <div v-if="showBatchTagDialog" class="dialog-overlay" @click.self="closeBatchTagDialog">
            <div class="dialog-box batch-tag-dialog">
                <h3 class="dialog-title">批量贴标签</h3>
                <div class="dialog-content">
                    <div class="form-group">
                        <label>客户类型</label>
                        <select v-model="batchTagForm.customerType" class="select-input">
                            <option value="">不修改</option>
                            <option v-for="type in customerTypes" :key="type.value" :value="type.value">
                                {{ type.label }}
                            </option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>客户等级</label>
                        <select v-model="batchTagForm.customerLevel" class="select-input">
                            <option value="">不修改</option>
                            <option v-for="level in customerLevels" :key="level.value" :value="level.value">
                                {{ level.label }}
                            </option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>自定义标签</label>
                        <input
                            v-model="batchTagForm.customTags"
                            type="text"
                            placeholder="标签1, 标签2（逗号分隔）"
                        />
                        <div class="form-hint">留空表示不修改</div>
                    </div>
                </div>
                <div class="dialog-actions">
                    <button class="btn-cancel" @click="closeBatchTagDialog" :disabled="isBatchUpdating">
                        取消
                    </button>
                    <button class="btn-confirm" @click="applyBatchTags" :disabled="isBatchUpdating">
                        {{ isBatchUpdating ? '处理中...' : '应用' }}
                    </button>
                </div>
            </div>
        </div>

        <div v-if="showBatchExtendDialog" class="dialog-overlay" @click.self="closeBatchExtendDialog">
            <div class="dialog-box batch-tag-dialog">
                <h3 class="dialog-title">批量延长维护时间</h3>
                <div class="dialog-content">
                    <div class="form-group">
                        <label>延长时间</label>
                        <select v-model="batchExtend" class="select-input">
                            <option value=3>3个月</option>
                            <option value=6>6个月</option>
                            <option value=9>9个月</option>
                            <option value=12>12个月</option>
                        </select>
                    </div>
                </div>
                <div class="dialog-actions">
                    <button class="btn-cancel" @click="closeBatchExtendDialog" :disabled="isBatchUpdating">
                        取消
                    </button>
                    <button class="btn-confirm" @click="applyBatchExtend" :disabled="isBatchUpdating">
                        {{ isBatchUpdating ? '处理中...' : '应用' }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { escapeHtml } from "~/utils/highlightText";
import { downloadBlob } from "~/utils/fileActions";
import { Loading } from '@element-plus/icons-vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import AddCustomerDialog from '~/components/configuration/sales/AddCustomerDialog.vue'
import BatchImportCustomerDialog from '~/components/configuration/sales/BatchImportCustomerDialog.vue'
import {
    addCustomer,
    importCustomers,
    retrieveCompanyCustomers,
    retrieveCustomerDetail,
    retrieveCustomerCompanyGroups,
    retrieveCustomerList,
    searchCustomer,
    updateCustomer,
    unassignCustomer,
    fakeDelCustomer,
    deleteCustomer,
    extendContact,
} from '~/composables/api/useCustomerApi'
import { ADMIN_ROLE } from '~~/shared/enums'
import { canAccessPublicCustomerPool } from '~~/shared/utils/adminPermission'

definePageMeta({
    layout: 'sales'
})

const paginationLocale = {
    ...zhCn,
    el: {
        ...zhCn.el,
        pagination: {
            ...zhCn.el.pagination,
            goto: '跳转到',
            pageClassifier: '页',
        },
    },
}

const searchQuery = ref('')
const select = ref(0)
const showAddDialog = ref(false)
const showImportDialog = ref(false)
const isImporting = ref(false)
const isExporting = ref(false)
const isBatchMode = ref(false)
const selectedCustomerIds = ref<string[]>([])
const selectedCustomerMap = ref<Record<string, any>>({})
const showBatchTagDialog = ref(false)
const showBatchExtendDialog = ref(false)
const isBatchUpdating = ref(false)
const filterLevel = ref('')
const batchTagForm = reactive({
    customerType: '',
    customerLevel: '',
    customTags: '',
})
const batchExtend = ref(3)

type CompanyGroup = {
    companyKey: string
    companyName: string
    customerCount: number
}

const customerTypes = [
    { value: 'B端客户', label: 'B端客户 (企业/贸易商)' },
    { value: 'B端客户-院校', label: 'B端客户 (院校)' },
    { value: 'C端客户', label: 'C端客户 (个人)' },
    { value: 'G端客户', label: 'G端客户 (政府)' },
    { value: '战略合作', label: '战略合作 (代理商)' },
]

const customerLevels = [
    { value: '优质客户', label: '优质客户' },
    { value: '一般客户', label: '一般客户' },
    { value: '潜在客户', label: '潜在客户' },
    { value: '问题客户', label: '问题客户' },
    { value: '风险客户', label: '风险客户' },
]

const userInfo = useState<any>('admin_info', () => ({}))
const role = computed(() => Number(userInfo.value.role))
const isSalesperson = computed(() => role.value === ADMIN_ROLE.SELLER)
const canViewPublicCustomerPool = computed(() => canAccessPublicCustomerPool(role.value))
const salespersonId = useState<string | null>('salesperson_id', () => null)

// 分页相关状态
const PAGE_SIZE = 20
const currentPage = ref(1)
const listTotal = ref(0)
const hasMore = ref(true)
const isLoading = ref(false)
const scrollbarRef = ref<any>(null)
const headerScrollRef = ref<HTMLElement | null>(null)
let syncingCustomerScroll = false

const isCompanyMergeMode = ref(false)
const isCompanyMergeAllowed = computed(() => !(isSalesperson.value && select.value === 1))
const GROUP_PAGE_SIZE = 20
const companyGroups = ref<CompanyGroup[]>([])
const groupPage = ref(1)
const groupTotal = ref(0)
const groupHasMore = ref(true)
const groupLoading = ref(false)
const collapsedCompanyMap = ref<Record<string, boolean>>({})
// 点击展开公司时，向后端请求客户，数据会存储到companyCustomersCache中
const companyCustomersCache = ref<Record<string, any[]>>({})
const companyCustomersLoadingMap = ref<Record<string, boolean>>({})
const companyCustomersRequestMap = new Map<string, Promise<void>>()

// 搜索相关状态
const isSearchMode = ref(false)
const currentKeyword = ref('')
const searchResults = ref<any[]>([])
const searchPage = ref(1)
const searchHasMore = ref(true)
const searchTotal = ref(0)
const route = useRoute()
const router = useRouter()
const currentCategory = ref('')
const currentCustomerId = ref('')
const categoryLabelMap: Record<string, string> = {
    foreign: '国外客户',
    domestic: '国内客户',
    general: '一般客户',
    bType: 'B端客户',
    strategic: '战略合作',
    quality: '优质客户',
    potential: '潜在客户',
    gType: 'G端客户',
}
const currentCategoryLabel = computed(() => categoryLabelMap[currentCategory.value] || '')

const handleClearCategory = async () => {
    if (!currentCategory.value) return
    if (route.query.category) {
        const query = { ...route.query }
        delete query.category
        await router.replace({ query })
        return
    }
    currentCategory.value = ''
    await refreshCustomers()
}

// 当前显示的客户列表和分页状态
const displayCustomers = computed(() => {
    if (isSearchMode.value) {
        return searchResults.value
    }
    return customers.value
})

const companyQuerySignature = computed(() =>
    JSON.stringify({
        mode: isSearchMode.value ? 'search' : 'list',
        keyword: isSearchMode.value ? currentKeyword.value.trim() : '',
        tab: select.value,
        filterLevel: filterLevel.value,
        category: currentCategory.value,
        salespersonId: salespersonId.value || '',
    })
)

// `{companyQuerySignature.value}::${companyKey}`作为
const getCompanyCacheKey = (companyKey: string) =>
    `${companyQuerySignature.value}::${companyKey}`

const visibleCustomersForSelect = computed(() => {
    if (!isCompanyMergeMode.value) {
        return displayCustomers.value
    }
    const visible: any[] = []
    companyGroups.value.forEach((group) => {
        if (collapsedCompanyMap.value[group.companyKey]) return
        const cacheKey = getCompanyCacheKey(group.companyKey)
        const customersInGroup = companyCustomersCache.value[cacheKey] || []
        visible.push(...customersInGroup)
    })
    return visible
})

const isCurrentLoading = computed(() =>
    isCompanyMergeMode.value ? groupLoading.value : isLoading.value
)

const currentDisplayCount = computed(() =>
    isCompanyMergeMode.value ? companyGroups.value.length : displayCustomers.value.length
)

const currentPaginationPage = computed(() => {
    if (isCompanyMergeMode.value) return groupPage.value
    if (isSearchMode.value) return searchPage.value
    return currentPage.value
})

const currentPageSize = computed(() =>
    isCompanyMergeMode.value ? GROUP_PAGE_SIZE : PAGE_SIZE
)

const currentTotal = computed(() => {
    if (isCompanyMergeMode.value) return groupTotal.value
    if (isSearchMode.value) return searchTotal.value
    return listTotal.value
})

const currentTotalPages = computed(() =>
    currentTotal.value > 0 ? Math.ceil(currentTotal.value / currentPageSize.value) : 0
)

const paginationUnit = computed(() =>
    isCompanyMergeMode.value ? '组公司' : '个客户'
)

const selectedCount = computed(() => selectedCustomerIds.value.length)
const selectedCustomers = computed(() =>
    selectedCustomerIds.value
        .map((id) => selectedCustomerMap.value[id])
        .filter(Boolean)
)
const isAllSelected = computed(() =>
    visibleCustomersForSelect.value.length > 0 &&
    visibleCustomersForSelect.value.every((c) => selectedCustomerIds.value.includes(c._id))
)

const allCustomers = ref<any[]>([])
const customers = computed(() => {
    const list = allCustomers.value
    if (select.value === 2) return list.filter((c) => Boolean(c?._isFakeDel))
    if (select.value === 1) return list.filter((c) => !c?._isFakeDel && !c?._isAssigned)
    
    // select === 0 (客户检索)
    // 如果是超级管理员(role === 0)或运营(role <= 2)，显示所有非回收站客户
    if (role.value <= ADMIN_ROLE.OPERATOR) {
        return list.filter((c) => !c?._isFakeDel)
    }

    // 销售人员，只显示分配给自己的客户
    if (isSalesperson.value && salespersonId.value) {
        return list.filter((c) => {
            const customerSalesId = c?._assignSalespersonId?.toString()
            const mySalesId = salespersonId.value?.toString()
            return !c?._isFakeDel && c?._isAssigned && customerSalesId === mySalesId
        })
    }

    // 其他角色，只显示已分配的客户
    return list.filter((c) => !c?._isFakeDel && Boolean(c?._isAssigned))
})

const clearCompanyCustomerCaches = () => {
    companyCustomersCache.value = {}
    companyCustomersLoadingMap.value = {}
    companyCustomersRequestMap.clear()
}

const resetCompanyMergeData = () => {
    companyGroups.value = []
    groupPage.value = 1
    groupTotal.value = 0
    groupHasMore.value = true
    clearCompanyCustomerCaches()
    collapsedCompanyMap.value = {}
}

const buildCompanyMergeParams = () => {
    if (isSalesperson.value && !salespersonId.value) {
        throw new Error('未获取到销售ID')
    }
    const params: any = {
        ...(isSalesperson.value && salespersonId.value ? { id: salespersonId.value } : {}),
        ...(filterLevel.value ? { customerLevel: filterLevel.value } : {}),
    }

    if (isSearchMode.value) {
        const keyword = currentKeyword.value.trim() || searchQuery.value.trim()
        if (keyword) {
            params.keyword = keyword
        }
        if (isSalesperson.value) {
            params.onlyAssigned = true
        }
        return params
    }

    if (select.value === 1 && canViewPublicCustomerPool.value) {
        params.onlyUnassigned = true
    } else if (select.value === 2) {
        params.onlyDeleted = true
    } else if (isSalesperson.value) {
        params.onlyAssigned = true
    }

    if (currentCategory.value) {
        params.category = currentCategory.value
    }

    return params
}

const loadCompanyGroups = async (page: number = 1, append: boolean = false) => {
    if (groupLoading.value) return
    groupLoading.value = true
    try {
        const params = {
            ...buildCompanyMergeParams(),
            page,
            limit: GROUP_PAGE_SIZE
        }
        const res = await retrieveCustomerCompanyGroups()(params)
        const list = Array.isArray(res?.data?.groups) ? res.data.groups : []
        const pagination = res?.data?.pagination
        const normalizedList = list.map((group: any) => ({
            companyKey: String(group?.companyKey || '未填写公司'),
            companyName: String(group?.companyName || '未填写公司'),
            customerCount: Number(group?.customerCount || 0),
        }))

        if (append) {
            const existingKeys = new Set(companyGroups.value.map((item) => item.companyKey))
            const merged = normalizedList.filter((item) => !existingKeys.has(item.companyKey))
            companyGroups.value = [...companyGroups.value, ...merged]
            const nextCollapsed = { ...collapsedCompanyMap.value }
            merged.forEach((item) => {
                if (typeof nextCollapsed[item.companyKey] !== 'boolean') {
                    nextCollapsed[item.companyKey] = true
                }
            })
            collapsedCompanyMap.value = nextCollapsed
        } else {
            companyGroups.value = normalizedList
            const nextCollapsed: Record<string, boolean> = {}
            normalizedList.forEach((item) => {
                nextCollapsed[item.companyKey] = true
            })
            collapsedCompanyMap.value = nextCollapsed
        }

        groupPage.value = pagination?.page ?? page
        groupTotal.value = Number(pagination?.totalGroups || 0)
        groupHasMore.value = pagination?.hasMore ?? false
        if (isSearchMode.value) {
            searchTotal.value = Number(res?.data?.totalCustomers || 0)
        }
    } catch (err: any) {
        if (!append) {
            companyGroups.value = []
            groupTotal.value = 0
            collapsedCompanyMap.value = {}
            groupHasMore.value = false
        }
        ElMessage.error(err?.data?.msg || err?.message || '加载公司分组失败')
    } finally {
        groupLoading.value = false
    }
}

const getCompanyGroupCacheKey = (companyKey: string) => getCompanyCacheKey(companyKey)

const hasCompanyGroupCache = (companyKey: string) =>
    Object.prototype.hasOwnProperty.call(
        companyCustomersCache.value,
        getCompanyGroupCacheKey(companyKey)
    )

const ensureCompanyCustomersLoaded = async (companyKey: string) => {
    const cacheKey = getCompanyGroupCacheKey(companyKey)
    if (hasCompanyGroupCache(companyKey)) return

    const existingRequest = companyCustomersRequestMap.get(cacheKey)
    if (existingRequest) {
        await existingRequest
        return
    }

    const request = (async () => {
        companyCustomersLoadingMap.value = {
            ...companyCustomersLoadingMap.value,
            [cacheKey]: true,
        }
        try {
            const params = {
                ...buildCompanyMergeParams(),
                companyKey,
            }
            const res = await retrieveCompanyCustomers()(params)
            const list = Array.isArray(res?.data?.customers) ? res.data.customers : []
            const normalizedList = list.map(normalizeCustomer)
            companyCustomersCache.value = {
                ...companyCustomersCache.value,
                [cacheKey]: normalizedList,
            }
        } catch (err: any) {
            const message = err?.data?.msg || err?.message || '加载公司客户失败'
        } finally {
            companyCustomersLoadingMap.value = {
                ...companyCustomersLoadingMap.value,
                [cacheKey]: false,
            }
            companyCustomersRequestMap.delete(cacheKey)
        }
    })()

    companyCustomersRequestMap.set(cacheKey, request)
    await request
}

const isCompanyGroupCollapsed = (companyKey: string) =>
    collapsedCompanyMap.value[companyKey] !== false

const isCompanyGroupLoading = (companyKey: string) =>
    Boolean(companyCustomersLoadingMap.value[getCompanyGroupCacheKey(companyKey)])

const getCompanyGroupCustomers = (companyKey: string) =>
    companyCustomersCache.value[getCompanyGroupCacheKey(companyKey)] || []

const toggleCompanyGroup = async (companyKey: string) => {
    const collapsed = isCompanyGroupCollapsed(companyKey)
    collapsedCompanyMap.value = {
        ...collapsedCompanyMap.value,
        [companyKey]: !collapsed,
    }
    if (collapsed) {
        await ensureCompanyCustomersLoaded(companyKey)
        await nextTick()
        bindCustomerHorizontalScroll()
        if (headerScrollRef.value) {
            syncCustomerHorizontalScroll(headerScrollRef.value)
        }
    }
}

onMounted(async () => {
    (window as any).__companyCustomersCache = companyCustomersCache;
    (window as any).__allCustomers = allCustomers;
    await nextTick()
    bindCustomerHorizontalScroll()
});

const toggleCompanyMergeMode = async () => {
    if (!isCompanyMergeAllowed.value) return
    isCompanyMergeMode.value = !isCompanyMergeMode.value
    clearSelection()
    resetCompanyMergeData()
    if (isSearchMode.value && searchQuery.value.trim()) {
        await handleSearch(1)
        return
    }
    await refreshCustomers()
}

const clearSelection = () => {
    selectedCustomerIds.value = []
    selectedCustomerMap.value = {}
}

const toggleBatchMode = () => {
    isBatchMode.value = !isBatchMode.value
    if (!isBatchMode.value) {
        clearSelection()
    }
}

const handleToggleSelect = (payload: { id: string; checked: boolean; customer: any }) => {
    const { id, checked, customer } = payload || {}
    if (!id) return
    if (checked) {
        if (!selectedCustomerIds.value.includes(id)) {
            selectedCustomerIds.value = [...selectedCustomerIds.value, id]
        }
        selectedCustomerMap.value = { ...selectedCustomerMap.value, [id]: customer }
    } else {
        selectedCustomerIds.value = selectedCustomerIds.value.filter((item) => item !== id)
        const nextMap = { ...selectedCustomerMap.value }
        delete nextMap[id]
        selectedCustomerMap.value = nextMap
    }
}

const toggleSelectAll = () => {
    if (isAllSelected.value) {
        const removeIds = new Set(visibleCustomersForSelect.value.map((c) => c._id))
        selectedCustomerIds.value = selectedCustomerIds.value.filter((id) => !removeIds.has(id))
        const nextMap = { ...selectedCustomerMap.value }
        removeIds.forEach((id) => {
            delete nextMap[id]
        })
        selectedCustomerMap.value = nextMap
        return
    }
    const nextMap = { ...selectedCustomerMap.value }
    const nextIds = new Set(selectedCustomerIds.value)
    visibleCustomersForSelect.value.forEach((customer) => {
        if (!customer?._id) return
        nextIds.add(customer._id)
        nextMap[customer._id] = customer
    })
    selectedCustomerIds.value = Array.from(nextIds)
    selectedCustomerMap.value = nextMap
}

const openBatchTagDialog = () => {
    showBatchTagDialog.value = true
}

const closeBatchTagDialog = () => {
    showBatchTagDialog.value = false
    batchTagForm.customerType = ''
    batchTagForm.customerLevel = ''
    batchTagForm.customTags = ''
}

const parseBatchTags = (value: string) =>
    value
        .split(/[,，;；|\/]+/)
        .map((item) => item.trim())
        .filter(Boolean)

const applyBatchTags = async () => {
    if (selectedCount.value === 0) {
        ElMessage.warning('请先选择客户')
        return
    }
    const editableCustomers = selectedCustomers.value
    const tags = parseBatchTags(batchTagForm.customTags || '')
    const hasType = Boolean(batchTagForm.customerType)
    const hasLevel = Boolean(batchTagForm.customerLevel)
    const hasTags = tags.length > 0
    if (!hasType && !hasLevel && !hasTags) {
        ElMessage.warning('请至少选择一个要更新的标签')
        return
    }

    isBatchUpdating.value = true
    let successCount = 0
    try {
        for (const customer of editableCustomers) {
            if (!customer?._id) continue
            const payload: any = { id: customer._id }
            if (hasType) payload.customerType = batchTagForm.customerType
            if (hasLevel) payload.customerLevel = batchTagForm.customerLevel
            if (hasTags) {
                const existing = Array.isArray(customer.customTags) ? customer.customTags : []
                payload.customTags = Array.from(new Set([...existing, ...tags]))
            }
            await updateCustomer()(payload)
            successCount += 1
        }
        const skipped = selectedCount.value - editableCustomers.length
        ElMessage.success(
            skipped > 0
                ? `已更新 ${successCount} 个客户，跳过 ${skipped} 个无权限客户`
                : `已更新 ${successCount} 个客户`
        )
        closeBatchTagDialog()
        if (isSearchMode.value) {
            await handleSearch()
        } else {
            await refreshCustomers()
        }
        clearSelection()
        isBatchMode.value = false
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '批量贴标签失败')
    } finally {
        isBatchUpdating.value = false
    }
}

const openBatchExtendDialog = () => {
    showBatchExtendDialog.value = true
}
const closeBatchExtendDialog = () => {
    showBatchExtendDialog.value = false
    batchExtend.value = 3
}
const applyBatchExtend = async () => {
    if (selectedCount.value === 0) return
    const ids = selectedCustomers.value
        .filter((c) => c?._isAssigned)
        .map((c) => c._id)
    if (ids.length === 0) {
        ElMessage.warning('没有可以延长维护时间的用户')
        return
    }
    try {
        await ElMessageBox.confirm(
            `确定将选中的 ${ids.length} 个客户延长维护时间${batchExtend.value}个月吗？`,
            '批量延长维护时间',
            {
                confirmButtonText: '确认',
                cancelButtonText: '取消',
                type: 'info',
            }
        )
    } catch {
        return
    }
    try {
        extendContact()({ids: ids, extendDays: batchExtend.value*30})
        ElMessage.success(`已为 ${ids.length} 个客户延长维护时间${batchExtend.value}个月`)
        if (isSearchMode.value) {
            await handleSearch()
        } else {
            await refreshCustomers()
        }
        clearSelection()
        isBatchMode.value = false
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '批量延长维护时间失败')
    }
    showBatchExtendDialog.value = false
    batchExtend.value = 3
}

const handleBatchUnassign = async () => {
    if (selectedCount.value === 0) return
    const ids = selectedCustomers.value
        .filter((c) => c?._isAssigned)
        .map((c) => c._id)
    if (ids.length === 0) {
        ElMessage.warning('选中的客户没有可放回公共池的')
        return
    }
    try {
        await ElMessageBox.confirm(
            `确定将选中的 ${ids.length} 个客户放回公共客户池吗？`,
            '批量放回公共池',
            {
                confirmButtonText: '确认',
                cancelButtonText: '取消',
                type: 'warning',
            }
        )
    } catch {
        return
    }
    try {
        for (const id of ids) {
            await unassignCustomer()({ customerId: id })
        }
        ElMessage.success(`已放回 ${ids.length} 个客户`)
        if (isSearchMode.value) {
            await handleSearch()
        } else {
            await refreshCustomers()
        }
        clearSelection()
        isBatchMode.value = false
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '批量放回客户池失败')
    }
}

const handleBatchDelete = async () => {
    if (selectedCount.value === 0) return
    const isRecycle = select.value === 2
    const message = isRecycle
        ? `确定永久删除选中的 ${selectedCount.value} 个客户吗？此操作不可撤销！`
        : `确定将选中的 ${selectedCount.value} 个客户放入回收站吗？`
    try {
        await ElMessageBox.confirm(message, '批量删除', {
            confirmButtonText: '确认',
            cancelButtonText: '取消',
            type: 'warning',
        })
    } catch {
        return
    }
    try {
        if (isRecycle) {
            await deleteCustomer()(selectedCustomerIds.value)
            ElMessage.success('已永久删除选中的客户')
        } else {
            const eligible = selectedCustomers.value.filter(
                (c) => !c?._isAssigned && !c?._isApplying
            )
            const ids = eligible.map((c) => c._id)
            if (ids.length === 0) {
                ElMessage.warning('选中的客户不可放入回收站')
                return
            }
            await fakeDelCustomer()(ids)
            const skipped = selectedCount.value - ids.length
            ElMessage.success(
                skipped > 0
                    ? `已放入回收站 ${ids.length} 个客户，跳过 ${skipped} 个`
                    : `已放入回收站 ${ids.length} 个客户`
            )
        }
        if (isSearchMode.value) {
            await handleSearch()
        } else {
            await refreshCustomers()
        }
        clearSelection()
        isBatchMode.value = false
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '批量删除失败')
    }
}

const buildTags = (customer: any) => {
    const tags: Array<{
        label: string
        type:
            | 'cyan'
            | 'yellow'
            | 'level-good'
            | 'level-normal'
            | 'level-potential'
            | 'level-problem'
            | 'level-risk'
    }> = []
    const levelTypeMap: Record<string, typeof tags[number]['type']> = {
        '优质客户': 'level-good',
        '一般客户': 'level-normal',
        '潜在客户': 'level-potential',
        '问题客户': 'level-problem',
        '风险客户': 'level-risk',
    }
    if (customer?.customerType) tags.push({ label: customer.customerType, type: 'cyan' })
    if (customer?.customerLevel) {
        tags.push({
            label: customer.customerLevel,
            type: levelTypeMap[customer.customerLevel] || 'cyan',
        })
    }
    const customTags = Array.isArray(customer?.customTags) ? customer.customTags : []
    customTags.forEach((tag: string) => {
        if (tag) tags.push({ label: tag, type: 'yellow' })
    })
    return tags
}

const toFiniteNumber = (value: any) => {
    const num = Number(value)
    return Number.isFinite(num) ? num : 0
}

const normalizeCustomer = (c: any) => {
    const dealOrderCount = toFiniteNumber(c?.dealOrderCount ?? c?.orderCount)
    const dealTotalAmount = toFiniteNumber(c?.dealTotalAmount ?? c?.totalDealAmount)

    return {
        ...c,
        tags: buildTags(c),
        orderCount: dealOrderCount,
        dealOrderCount,
        dealTotalAmount,
        totalDealAmount: dealTotalAmount,
        salesPerson: c?.salesPerson || '暂无',
        startDate: c?.startDate || '',
        endDate: c?.endDate || '',
    }
}

// 搜索处理函数
const handleSearch = async (page: number = 1) => {
    const keyword = searchQuery.value.trim()
    if (!keyword) {
        handleClearSearch()
        return
    }

    isSearchMode.value = true
    currentKeyword.value = keyword
    if (isBatchMode.value) {
        clearSelection()
    }

    if (isCompanyMergeMode.value) {
        if (page === 1) {
            searchTotal.value = 0
            resetCompanyMergeData()
        }
        await loadCompanyGroups(page, false)
        return
    }

    isLoading.value = true
    try {
        const res = await searchCustomer()({
            keyword,
            page,
            limit: PAGE_SIZE,
            ...(filterLevel.value ? { customerLevel: filterLevel.value } : {})
        })

        const list = res?.data?.customers ?? []
        const pagination = res?.data?.pagination

        const normalizedList = Array.isArray(list) ? list.map(normalizeCustomer) : []

        searchResults.value = normalizedList

        searchPage.value = pagination?.page ?? page
        searchHasMore.value = pagination?.hasMore ?? false
        searchTotal.value = pagination?.total ?? 0
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '搜索失败')
    } finally {
        isLoading.value = false
    }
}

const toCsvValue = (value: any) => {
    const text = value == null ? '' : String(value)
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`
    }
    return text
}

// 公共客户导出时脱敏姓名
const exportCustomerName = (customer: any) => {
    if (isSalesperson.value && !customer?._isAssigned) {
        const raw = (customer?.name == null ? '' : String(customer.name)).trim()
        return `${raw.slice(0, 1)}****`
    }
    return customer.name
}

const formatDealAmountForExport = (customer: any) =>
    toFiniteNumber(customer?.dealTotalAmount ?? customer?.totalDealAmount).toFixed(2)

const downloadCsv = (headers: string[], rows: string[][], filename: string) => {
    const csvContent = [headers, ...rows].map((row) => row.map(toCsvValue).join(',')).join('\n')
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
    return downloadBlob(blob, filename)
}

const handleExportSelected = () => {
    if (selectedCount.value === 0) {
        ElMessage.warning('请先选择客户')
        return
    }
    const headers = [
        '姓名',
        '国家',
        '城市',
        '电话',
        'WhatsApp',
        '微信',
        '邮箱',
        '公司名称',
        '公司详情',
        '公司网站',
        '客户类型',
        '客户等级',
        '获客渠道',
        '详细渠道',
        '成交订单数',
        '成交总金额',
        '维护销售',
    ]

    const rows: string[][] = selectedCustomers.value.map((c) => [
        exportCustomerName(c),
        c?.country || '',
        c?.city || '',
        c?.phone || '',
        c?.whatsapp || '',
        c?.wechat || '',
        c?.email || '',
        c?.company || '',
        c?.companyDetail || '',
        c?.companyWebsite || '',
        c?.customerType || '',
        c?.customerLevel || '',
        c?.source || '',
        c?.sourceDetail || '',
        String(toFiniteNumber(c?.dealOrderCount ?? c?.orderCount)),
        formatDealAmountForExport(c),
        c?.assignSalespersonName || c?.salesPerson || '',
    ])

    const filename = `客户导出_选中_${new Date().toISOString().slice(0, 10)}.csv`
    void downloadCsv(headers, rows, filename).catch(() => ElMessage.error('保存客户导出文件失败'))
}

// 导出逻辑
// 1. 客户检索页面点击导出按钮，管理员导出所有已分配和公共客户，不隐藏信息，销售只导出分配给自己的客户
// 2. 公共客户池页面点击导出按钮，管理员导出公共客户，不隐藏信息，销售导出公共客户，隐藏信息
// 3. 回收站页面点击导出按钮，管理员导出所有已删除客户，不隐藏信息
// 4. 在搜索时，导出搜索得到的客户信息
const handleExportCustomers = async () => {
    if (isExporting.value) return
    isExporting.value = true
    try {
        const headers = [
            '姓名',
            '国家',
            '城市',
            '电话',
            'WhatsApp',
            '微信',
            '邮箱',
            '公司名称',
            '公司详情',
            '公司网站',
            '客户类型',
            '客户等级',
            '获客渠道',
            '详细渠道',
            '成交订单数',
            '成交总金额',
            '维护销售',
        ]

        const rows: string[][] = []

        if (isSearchMode.value) {
            let page = 1
            let hasMoreSearch = true
            const keyword = currentKeyword.value.trim()
            while (hasMoreSearch) {
                const res = await searchCustomer()({
                    keyword,
                    page,
                    limit: PAGE_SIZE,
                })
                const list = res?.data?.customers ?? []
                const pagination = res?.data?.pagination
                const normalizedList = Array.isArray(list) ? list.map(normalizeCustomer) : []
                normalizedList.forEach((c) => {
                    rows.push([
                        exportCustomerName(c),
                        c.country,
                        c.city,
                        c.phone,
                        c.whatsapp,
                        c.wechat,
                        c.email,
                        c.company,
                        c.companyDetail,
                        c.companyWebsite,
                        c.customerType,
                        c.customerLevel,
                        c.source,
                        c.sourceDetail,
                        String(toFiniteNumber(c?.dealOrderCount ?? c?.orderCount)),
                        formatDealAmountForExport(c),
                        c.assignSalespersonName || c.salesPerson || '',
                    ])
                })
                hasMoreSearch = Boolean(pagination?.hasMore)
                page = (pagination?.page || page) + 1
                if (!hasMoreSearch) break
            }
        } else {
            let page = 1
            let hasMoreList = true
            while (hasMoreList) {
                const params = {
                    page,
                    limit: PAGE_SIZE,
                    ...(isSalesperson.value && select.value === 0 ? { onlyAssigned: true } : {}),
                    ...(select.value === 1 && canViewPublicCustomerPool.value ? { onlyUnassigned: true } : {}),
                    ...(select.value === 2 ? { onlyDeleted: true } : {}),
                    ...(isSalesperson.value && salespersonId.value ? { id: salespersonId.value } : {}),
                    ...(currentCategory.value ? { category: currentCategory.value } : {}),
                }
                if (isSalesperson.value && !salespersonId.value) {
                    throw new Error('未获取到销售ID')
                }
                const res = await retrieveCustomerList()(params)
                const list = res?.data?.customers ?? []
                const pagination = res?.data?.pagination
                const normalizedList = Array.isArray(list) ? list.map(normalizeCustomer) : []
                normalizedList.forEach((c) => {
                    rows.push([
                        exportCustomerName(c),
                        c.country,
                        c.city,
                        c.phone,
                        c.whatsapp,
                        c.wechat,
                        c.email,
                        c.company,
                        c.companyDetail,
                        c.companyWebsite,
                        c.customerType,
                        c.customerLevel,
                        c.source,
                        c.sourceDetail,
                        String(toFiniteNumber(c?.dealOrderCount ?? c?.orderCount)),
                        formatDealAmountForExport(c),
                        c.assignSalespersonName || c.salesPerson || '',
                    ])
                })
                hasMoreList = Boolean(pagination?.hasMore)
                page = (pagination?.page || page) + 1
                if (!hasMoreList) break
            }
        }

        const filename = `客户导出_${new Date().toISOString().slice(0, 10)}.csv`
        await downloadCsv(headers, rows, filename)
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '批量导出失败')
    } finally {
        isExporting.value = false
    }
}

// 清除搜索
const handleClearSearch = (shouldReload: boolean = true) => {
    isSearchMode.value = false
    currentKeyword.value = ''
    searchQuery.value = ''
    searchResults.value = []
    searchPage.value = 1
    searchHasMore.value = true
    searchTotal.value = 0
    if (isBatchMode.value) {
        clearSelection()
    }
    if (isCompanyMergeMode.value) {
        resetCompanyMergeData()
        if (shouldReload) {
            void refreshCustomers()
        }
    }
}

const loadCustomerById = async (customerId: string) => {
    if (!customerId) return
    isLoading.value = true
    try {
        const res: any = await retrieveCustomerDetail()(customerId)
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '获取客户详情失败')
            return
        }
        const customer = res?.data?.customer
        if (!customer) {
            ElMessage.warning('未找到客户信息')
            return
        }
        allCustomers.value = [normalizeCustomer(customer)]
        currentPage.value = 1
        listTotal.value = 1
        hasMore.value = false
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '获取客户详情失败')
    } finally {
        isLoading.value = false
    }
}

// 加载客户列表（支持分页）
const loadCustomers = async (page: number = 1, append: boolean = false) => {
    if (isLoading.value) return
    
    isLoading.value = true
    try {
        const params = {
            page,
            limit: PAGE_SIZE,
            ...(select.value === 1 && canViewPublicCustomerPool.value ? { onlyUnassigned: true } : {}),
            ...(select.value === 2 ? { onlyDeleted: true } : {}),
            ...(isSalesperson.value && select.value === 0 ? { onlyAssigned: true } : {}),
            ...(isSalesperson.value && salespersonId.value ? { id: salespersonId.value } : {}),
            ...(currentCategory.value ? { category: currentCategory.value } : {}),
            ...(filterLevel.value ? { customerLevel: filterLevel.value } : {}),
        }
        
        if (isSalesperson.value && !salespersonId.value) {
            throw new Error('未获取到销售ID')
        }
        
        const res = await retrieveCustomerList()(params)
        const list = res?.data?.customers ?? []
        const pagination = res?.data?.pagination
        
        const normalizedList = Array.isArray(list) ? list.map(normalizeCustomer) : []
        
        allCustomers.value = normalizedList
        
        currentPage.value = pagination?.page ?? page
        listTotal.value = pagination?.total ?? normalizedList.length
        hasMore.value = pagination?.hasMore ?? false
    } finally {
        isLoading.value = false
    }
}

// 刷新客户列表（从头开始加载）
const refreshCustomers = async () => {
    if (isCompanyMergeMode.value) {
        resetCompanyMergeData()
        await loadCompanyGroups(1, false)
        await resetCustomerHorizontalScroll()
        return
    }
    currentPage.value = 1
    hasMore.value = true
    await loadCustomers(1, false)
    await resetCustomerHorizontalScroll()
}

const scrollToListTop = async () => {
    await nextTick()
    const wrapRef = scrollbarRef.value?.wrapRef
    if (!wrapRef) return
    wrapRef.scrollTo({ top: 0, behavior: 'auto' })
}

const getCustomerScrollPanes = () =>
    Array.from(document.querySelectorAll<HTMLElement>('.customer-sync-scroll'))

const syncCustomerHorizontalScroll = (source: HTMLElement) => {
    if (syncingCustomerScroll) return
    syncingCustomerScroll = true
    const left = source.scrollLeft
    getCustomerScrollPanes().forEach((pane) => {
        if (pane !== source && pane.scrollLeft !== left) {
            pane.scrollLeft = left
        }
    })
    requestAnimationFrame(() => {
        syncingCustomerScroll = false
    })
}

const bindCustomerHorizontalScroll = () => {
    getCustomerScrollPanes().forEach((pane) => {
        if (pane.dataset.customerScrollBound === 'true') return
        pane.dataset.customerScrollBound = 'true'
        pane.addEventListener('scroll', () => syncCustomerHorizontalScroll(pane), { passive: true })
    })
}

const resetCustomerHorizontalScroll = async () => {
    await nextTick()
    bindCustomerHorizontalScroll()
    const firstPane = headerScrollRef.value
    if (!firstPane) return
    firstPane.scrollLeft = 0
    syncCustomerHorizontalScroll(firstPane)
}

const handlePageChange = async (page: number) => {
    if (isCurrentLoading.value) return
    if (isCompanyMergeMode.value) {
        await loadCompanyGroups(page, false)
    } else if (isSearchMode.value) {
        await handleSearch(page)
    } else {
        await loadCustomers(page, false)
    }
    await scrollToListTop()
    await resetCustomerHorizontalScroll()
}

// 切换 tab 时重新加载
watch(select, () => {
    // 前端过滤，无需重新请求
    // 切换 tab 时清除搜索状态
    if (isSearchMode.value) {
        handleClearSearch(false)
    }
    if (!isCompanyMergeAllowed.value && isCompanyMergeMode.value) {
        isCompanyMergeMode.value = false
        resetCompanyMergeData()
    }
    if (isBatchMode.value) {
        clearSelection()
    }
    refreshCustomers()
})

watch(filterLevel, async () => {
    if (isBatchMode.value) {
        clearSelection()
    }
    if (isSearchMode.value) {
        if (searchQuery.value.trim()) {
            await handleSearch(1)
            return
        }
    }
    await refreshCustomers()
})

watch(searchQuery, () => {
    if (!isCompanyMergeMode.value) return
    clearCompanyCustomerCaches()
})

watch(currentCategory, () => {
    if (!isCompanyMergeMode.value) return
    clearCompanyCustomerCaches()
})

watch(
    () => [displayCustomers.value.length, companyGroups.value.length, currentDisplayCount.value, isCompanyMergeMode.value],
    async () => {
        await nextTick()
        bindCustomerHorizontalScroll()
        if (headerScrollRef.value) {
            syncCustomerHorizontalScroll(headerScrollRef.value)
        }
    }
)

const applyRouteQuery = async () => {
    const tab = (route.query.tab as string || '').trim()
    const customerId = (route.query.customerId as string || '').trim()
    if (customerId) {
        if (isCompanyMergeMode.value) {
            isCompanyMergeMode.value = false
            resetCompanyMergeData()
        }
        currentCustomerId.value = customerId
        if (currentCategory.value) currentCategory.value = ''
        if (isSearchMode.value) {
            handleClearSearch(false)
        }
        select.value = tab === 'public' && canViewPublicCustomerPool.value ? 1 : 0
        await loadCustomerById(customerId)
        return true
    }

    const salesperson = (route.query.salesperson as string || '').trim()
    if (salesperson) {
        if (currentCustomerId.value) currentCustomerId.value = ''
        if (currentCategory.value) currentCategory.value = ''
        select.value = 0
        searchQuery.value = salesperson
        await handleSearch(1)
        return true
    }

    const category = (route.query.category as string || '').trim()
    if (category) {
        currentCategory.value = category
        if (isSearchMode.value) {
            handleClearSearch(false)
        }
        select.value = 0
        await refreshCustomers()
        return true
    }

    if (currentCategory.value) {
        currentCategory.value = ''
        await refreshCustomers()
        return true
    }

    if (tab === 'public') {
        select.value = canViewPublicCustomerPool.value ? 1 : 0
        await refreshCustomers()
        return true
    }

    if (currentCustomerId.value) {
        currentCustomerId.value = ''
        await refreshCustomers()
        return true
    }

    return false
}

onMounted(async () => {
    try {
        const applied = await applyRouteQuery()
        if (!applied) {
            await refreshCustomers()
        }
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '获取客户列表失败')
    }
})

watch(
    () => [route.query.salesperson, route.query.category, route.query.customerId, route.query.tab],
    async ([newSalesperson, newCategory, newCustomerId, newTab], [oldSalesperson, , oldCustomerId, oldTab]) => {
        if (isCompanyMergeMode.value) {
            clearCompanyCustomerCaches()
        }
        if (!newSalesperson && oldSalesperson && isSearchMode.value) {
            handleClearSearch(false)
            await refreshCustomers()
            return
        }
        if (!newCategory && currentCategory.value && !newSalesperson && !newCustomerId && !newTab) {
            await applyRouteQuery()
            return
        }
        if (!newCustomerId && oldCustomerId && currentCustomerId.value) {
            await applyRouteQuery()
            return
        }
        if (!newTab && oldTab) {
            await applyRouteQuery()
            return
        }
        await applyRouteQuery()
    }
)

const handleAddCustomer = async (payload: any) => {
    const customerList = Array.isArray(payload?.customers) ? payload.customers : [payload]
    const assignType = payload?.assignType || 'public'
    const selectedSalesPersonId = payload?.salesPersonId || ''
    let currentIndex = 0

    try {
        for (currentIndex = 0; currentIndex < customerList.length; currentIndex++) {
            const formData = customerList[currentIndex]
            const formDataToSend = new FormData()

            let source = ''
            let sourceDetail = ''
            if (Array.isArray(formData.source) && formData.source.length > 0) {
                source = formData.source[0]
                sourceDetail = formData.source[formData.source.length - 1]
            }

            formDataToSend.append('name', formData.name)
            formDataToSend.append('country', formData.country)
            formDataToSend.append('city', formData.city || '')
            formDataToSend.append('phone', formData.phone || '')
            formDataToSend.append('whatsapp', formData.whatsapp || '')
            formDataToSend.append('wechat', formData.wechat || '')
            const emailText = typeof formData.email === 'string' ? formData.email.trim() : ''
            formDataToSend.append('email', emailText === '无' ? '----------------------' : (formData.email || ''))
            formDataToSend.append('company', formData.company || '')
            formDataToSend.append('companyDetail', formData.companyDetail || '')
            formDataToSend.append('companyWebsite', formData.companyWebsite || '')
            formDataToSend.append('customerType', formData.customerType)
            formDataToSend.append('customerLevel', formData.customerLevel)
            formDataToSend.append('source', source)
            formDataToSend.append('sourceDetail', sourceDetail)

            if (Array.isArray(formData.customTags)) {
                formData.customTags.forEach((tag: string) => {
                    formDataToSend.append('customTags', tag)
                })
            }

            if (isSalesperson.value && salespersonId.value) {
                formDataToSend.append('_assignSalespersonId', salespersonId.value)
            } else if (role.value <= ADMIN_ROLE.OPERATOR && assignType === 'salesperson' && selectedSalesPersonId) {
                formDataToSend.append('_assignSalespersonId', selectedSalesPersonId)
                formDataToSend.append('_isAssigned', 'true')
            }

            if (Array.isArray(formData.attachments)) {
                formData.attachments.forEach((file: File) => {
                    formDataToSend.append('attachments', file)
                })
            }

            const res: any = await addCustomer()(formDataToSend)
            if (!res || typeof res !== 'object' || res.code !== 200) {
                ElMessage.error(
                    customerList.length > 1
                        ? `新增客户${currentIndex + 1}失败：${res?.msg || '新增客户失败'}`
                        : (res?.msg || '新增客户失败')
                )
                await refreshCustomers()
                return
            }
        }

        ElMessage.success(customerList.length > 1 ? `新增客户成功，共 ${customerList.length} 条` : '新增客户成功')
        await refreshCustomers()
    } catch (err: any) {
        ElMessage.error(
            customerList.length > 1
                ? `新增客户${currentIndex + 1}失败：${err?.data?.msg || err?.message || '新增客户失败'}`
                : (err?.data?.msg || err?.message || '新增客户失败')
        )
        await refreshCustomers()
    }
}

const handleImportCustomers = async (file: File) => {
    if (!file) return
    if (isSalesperson.value && !salespersonId.value) {
        ElMessage.error('未获取到销售ID')
        return
    }
    const formData = new FormData()
    formData.append('file', file)
    if (isSalesperson.value && salespersonId.value) {
        formData.append('_assignSalespersonId', salespersonId.value)
    }

    try {
        isImporting.value = true
        const res: any = await importCustomers()(formData)
        const result = res?.data || {}
        const success = Number(result.success || 0)
        const failed = Number(result.failed || 0)

        if (success > 0) {
            ElMessage.success(`导入完成：成功 ${success} 条${failed ? `，失败 ${failed} 条` : ''}`)
        } else {
            ElMessage.warning(`导入完成：成功 ${success} 条，失败 ${failed} 条`)
        }

        if (failed > 0 && Array.isArray(result.errors) && result.errors.length > 0) {
            const detail = result.errors
                .slice(0, 20)
                .map((item: any) => escapeHtml(`第${item.row}行：${item.message || item.msg || '导入失败'}`))
                .join('<br/>')
            await ElMessageBox.alert(detail, '导入失败明细', {
                confirmButtonText: '知道了',
                type: 'warning',
                dangerouslyUseHTMLString: true,
            })
        }

        showImportDialog.value = false
        if (isSearchMode.value) {
            await handleSearch()
        } else {
            await refreshCustomers()
        }
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '批量导入失败')
    } finally {
        isImporting.value = false
    }
}
</script>

<style lang="less" scoped>
.customer-root {
    --customer-info-width: 1321px;
    --customer-actions-width: 135px;
    --d-color: #3dabee;
    --gray-b15: #262626;
    --gray-b40: #666666;
    --gray-b70: #b3b3b3;
    --gray-b95: #f2f2f2;
    --table-bg: #e6edf5;
    --page-bg: #f5f7fa;

    height: 100vh;
    padding: 20px;
    background-color: var(--page-bg);
    overflow: hidden;
    display: flex;
    flex-direction: column;

    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;

        .title {
            font-size: 18px;
            font-weight: 500;
            color: var(--gray-b15);
            font-family: 'PingFang SC', sans-serif;
        }

        .actions {
            display: flex;
            gap: 12px;
            align-items: center;

            button {
                padding: 7px 18px;
                border: none;
                border-radius: 10px;
                font-size: 14px;
                font-family: 'PingFang SC', sans-serif;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 6px;
                transition: all 0.3s;
                background-color: var(--d-color);
                color: #fff;

                &:hover {
                    opacity: 0.9;
                }

                &:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                .icon {
                    font-size: 20px;
                }
            }

            .btn-batch {
                background-color: var(--d-color);

                &.active {
                    background-color: #2d96d6;
                }
            }

            .btn-merge {
                background-color: var(--d-color);

                &.active {
                    background-color: #2d96d6;
                }
            }

            .btn-import {
                background-color: var(--d-color);
            }

            .btn-export {
                background-color: var(--d-color);
            }

            .btn-icon {
                font-size: 18px;
            }

            .filter-group {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 10px;
                border-radius: 10px;
                background: #fff;
                border: 1px solid var(--gray-b70);

                .filter-label {
                    font-size: 13px;
                    color: var(--gray-b40);
                    white-space: nowrap;
                    font-family: 'PingFang SC', sans-serif;
                }

                .filter-select {
                    height: 30px;
                    padding: 0 8px;
                    border-radius: 10px;
                    border: 1px solid var(--gray-b70);
                    background: #fff;
                    font-size: 13px;
                    color: var(--gray-b40);
                    cursor: pointer;
                    font-family: 'PingFang SC', sans-serif;

                    &:focus {
                        outline: none;
                        border-color: var(--d-color);
                    }
                }
            }
        }
    }

    .batch-toolbar {
        margin-bottom: 16px;
        padding: 12px 16px;
        background: #fff;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;

        .batch-info {
            font-size: 14px;
            color: var(--gray-b15);
            font-weight: 500;
            font-family: 'PingFang SC', sans-serif;
        }

        .batch-actions {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;

            .btn-batch-action {
                padding: 6px 14px;
                border-radius: 10px;
                border: 1px solid var(--gray-b70);
                background: #fff;
                font-size: 13px;
                color: var(--gray-b40);
                cursor: pointer;
                transition: all 0.2s;
                font-family: 'PingFang SC', sans-serif;

                &:hover:not(:disabled) {
                    border-color: var(--d-color);
                    color: var(--d-color);
                }

                &:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }

                &.danger {
                    border-color: #fecaca;
                    color: #ef4444;

                    &:hover:not(:disabled) {
                        border-color: #ef4444;
                        color: #ef4444;
                    }
                }
            }
        }
    }

    .search-result-hint {
        height: 50px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        background-color: #e6f7ff;
        border-radius: 10px;
        color: var(--gray-b15);
        font-size: 14px;
        font-family: 'PingFang SC', sans-serif;

        .search-keyword {
            font-weight: bold;
            color: var(--d-color);
        }

        .btn-clear-search {
            padding: 6px 12px;
            background-color: var(--d-color);
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
            color: #fff;

            &:hover {
                opacity: 0.9;
            }
        }
    }

    .category-hint {
        height: 50px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        padding: 0 20px;
        background-color: #e6f7ff;
        border-radius: 10px;
        color: var(--gray-b15);
        font-size: 14px;
        font-family: 'PingFang SC', sans-serif;

        .category-label {
            font-weight: bold;
            color: var(--d-color);
        }

        .spacer {
            flex: 1;
        }

        .btn-clear-category {
            padding: 6px 12px;
            background-color: var(--d-color);
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
            color: #fff;

            &:hover {
                opacity: 0.9;
            }
        }
    }

    .tabs {
        display: flex;
        align-items: center;
        background: white;
        border-radius: 10px;
        height: 50px;
        padding: 0 20px;
        margin-bottom: 20px;
        gap: 40px;

        .tab {
            padding: 16px 0;
            cursor: pointer;
            color: var(--gray-b70);
            font-size: 16px;
            font-family: 'PingFang SC', sans-serif;
            font-weight: 500;
            position: relative;
            white-space: nowrap;

            &.active {
                color: var(--gray-b15);
                font-weight: 600;

                &::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 2px;
                    background: var(--d-color);
                }
            }
        }

        .spacer {
            flex: 1;
        }

        .tab-icons {
            display: flex;
            gap: 16px;
            font-size: 18px;
            color: var(--gray-b40);

            span {
                cursor: pointer;

                &:hover {
                    color: var(--gray-b15);
                }
            }
        }
    }

    .customer-table-area {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        padding-right: 2px;
    }

    .list-header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) var(--customer-actions-width);
        align-items: center;
        background-color: var(--table-bg);
        border-radius: 10px;
        margin-bottom: 16px;
        color: var(--gray-b15);
        font-size: 14px;
        font-weight: 500;
        overflow: hidden;
        font-family: 'PingFang SC', sans-serif;

        .header-info-pane {
            min-width: 0;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: none;

            &::-webkit-scrollbar {
                display: none;
            }
        }

        .header-info-content {
            width: var(--customer-info-width);
            min-width: var(--customer-info-width);
            display: flex;
            align-items: center;
            padding: 12px 30px;
            box-sizing: border-box;
        }

        .col {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 600;
            font-size: 16px;
            white-space: nowrap;
            font-family: 'PingFang SC', sans-serif;

            input {
                border: none;
                background: #fff;
                border-radius: 10px;
                padding: 2px 0;
                font-size: 14px;
                width: 80px;
                margin-top: 1px;
                text-align: center;
                outline: none;
                color: var(--gray-b40);

                &::placeholder {
                    color: var(--gray-b70);
                }
            }

            &.name { width: 240px; flex-shrink: 0; margin-right: 40px; }
            &.region { width: 100px; flex-shrink: 0; margin-right: 50px; }
            &.contact { width: 100px; flex-shrink: 0; margin-right: 40px; }
            &.email { width: 180px; flex-shrink: 0; margin-right: 30px; }
            &.company { width: 150px; flex-shrink: 0; margin-right: 67px; }
            &.channel { width: 120px; flex-shrink: 0; margin-right: 24px; }
            &.orders { width: 110px; flex-shrink: 0; padding-left: 18px; margin-right: 20px; }
            &.sales { width: 85px; flex-shrink: 0; margin-right: 30px; }
            &.select { width: 36px; flex-shrink: 0; margin-right: 8px; }
        }

        .actions-placeholder {
            width: var(--customer-actions-width);
            min-width: var(--customer-actions-width);
            align-self: stretch;
            background-color: var(--table-bg);
            border-radius: 0 10px 10px 0;
        }
    }

    .customer-list {
        height: calc(100% - 78px);
        min-height: 0;

        :deep(.el-scrollbar__wrap) {
            overflow-x: hidden !important;
        }

        .company-group {
            margin-bottom: 14px;

            .company-group-header {
                background: #fff;
                border-radius: 10px;
                padding: 12px 16px;
                cursor: pointer;
                transition: box-shadow 0.2s;

                &:hover {
                    box-shadow: 0 2px 8px rgba(61, 171, 238, 0.1);
                }
            }

            .company-group-left {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .group-arrow {
                font-size: 18px;
                color: var(--d-color);
                transition: transform 0.2s ease;

                &.expanded {
                    transform: rotate(90deg);
                }
            }

            .company-group-name {
                font-size: 16px;
                font-weight: 600;
                color: var(--gray-b15);
                font-family: 'PingFang SC', sans-serif;
            }

            .company-group-count {
                padding: 2px 9px;
                border-radius: 999px;
                background: #e6f7ff;
                color: var(--d-color);
                font-size: 12px;
                font-weight: 500;
                font-family: 'PingFang SC', sans-serif;
            }

            .company-group-body {
                margin-top: 10px;
            }
        }

        .group-loading,
        .group-empty,
        .group-error {
            margin: 8px 0 10px;
            padding: 14px;
            border-radius: 10px;
            background: #fff;
            color: var(--gray-b40);
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 8px;
            justify-content: center;
            font-family: 'PingFang SC', sans-serif;
        }

        .group-loading {
            color: var(--d-color);
        }

        .group-error {
            justify-content: center;
            padding: 12px 14px;
        }

        .btn-retry-group {
            border: none;
            background: var(--d-color);
            color: #fff;
            border-radius: 10px;
            padding: 4px 12px;
            cursor: pointer;
            font-size: 12px;

            &:hover {
                opacity: 0.9;
            }
        }

        .loading-more,
        .empty-state {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 20px;
            color: var(--gray-b70);
            font-size: 14px;

            .el-icon {
                font-size: 18px;
            }
        }

        .loading-more {
            color: var(--d-color);
        }
    }

    .customer-scroll-footer {
        display: grid;
        grid-template-columns: minmax(0, 1fr) var(--customer-actions-width);
        align-items: center;
        height: 20px;
        flex-shrink: 0;
        margin-top: 2px;

        .customer-bottom-scroll {
            min-width: 0;
            overflow-x: auto;
            overflow-y: hidden;
            scrollbar-width: thin;
            scrollbar-color: var(--gray-b70) transparent;

            &::-webkit-scrollbar {
                height: 8px;
            }

            &::-webkit-scrollbar-thumb {
                border-radius: 999px;
                background: var(--gray-b70);
            }

            &::-webkit-scrollbar-track {
                background: transparent;
            }
        }

        .customer-bottom-scroll-content {
            width: var(--customer-info-width);
            min-width: var(--customer-info-width);
            height: 1px;
        }

        .actions-placeholder {
            width: var(--customer-actions-width);
            min-width: var(--customer-actions-width);
        }
    }

    .pagination-bar {
        margin-top: 16px;
        padding: 14px 18px;
        background: #fff;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;

        .pagination-info {
            color: var(--gray-b40);
            font-size: 14px;
            white-space: nowrap;
            font-family: 'PingFang SC', sans-serif;
        }
    }

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
        z-index: 1000;
    }

    .dialog-box {
        background: #fff;
        padding: 20px 24px;
        border-radius: 10px;
        width: 520px;
        max-width: 90vw;
        box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);

        .dialog-title {
            margin: 0 0 12px;
            font-size: 17px;
            color: var(--gray-b15);
            font-family: 'PingFang SC', sans-serif;
        }

        .dialog-content {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .form-group {
            display: flex;
            flex-direction: column;
            gap: 6px;

            label {
                font-size: 14px;
                color: var(--gray-b40);
                font-weight: 500;
                font-family: 'PingFang SC', sans-serif;
            }

            input,
            select {
                padding: 8px 12px;
                border: 1px solid var(--gray-b70);
                border-radius: 10px;
                font-size: 14px;
                outline: none;
                font-family: 'PingFang SC', sans-serif;

                &:focus {
                    border-color: var(--d-color);
                }
            }

            .form-hint {
                font-size: 12px;
                color: var(--gray-b70);
            }
        }

        .dialog-actions {
            margin-top: 16px;
            display: flex;
            justify-content: flex-end;
            gap: 8px;

            .btn-cancel,
            .btn-confirm {
                padding: 6px 14px;
                border-radius: 10px;
                border: 1px solid var(--gray-b70);
                background: #fff;
                cursor: pointer;
                font-size: 14px;
                font-family: 'PingFang SC', sans-serif;
            }

            .btn-confirm {
                background: var(--d-color);
                border-color: var(--d-color);
                color: #fff;
            }

            .btn-confirm:disabled,
            .btn-cancel:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
        }
    }
}
</style>
