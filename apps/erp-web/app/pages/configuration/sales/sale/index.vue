<template>
    <div class="sales-root">
        <Search 
            v-if="!isSalesperson"
            v-model:searchQuery="searchQuery" 
            @search="handleSearch" 
            @clear="handleClearSearch" 
            :placeholder="'搜索姓名、区域、联系方式、邮箱...'"
        />

        <div class="header">
            <div class="title">销售管理</div>
        </div>

        <!-- 搜索结果提示 -->
        <div v-if="isSearchMode" class="search-result-hint">
            <span>搜索 <span class="search-keyword">"{{ currentKeyword }}"</span> 的结果，共 {{ searchTotal }} 条</span>
            <button class="btn-clear-search" @click="handleClearSearch">清除搜索</button>
        </div>

        <div class="tabs" v-if="!isSearchMode">
            <div :class="{ tab: true, active: select === 0 }" @click="select = 0" v-if="!isSalesperson">全部销售</div>
            <div :class="{ tab: true, active: select === 1 }" @click="select = 1" v-if="isSalesperson">个人主页</div>
        </div>

        <div class="list-header" v-if="(select === 0 && !isSalesperson) || isSearchMode">
            <div class="col name">
                <span>姓名</span>
            </div>
            <div class="col join">入职时间</div>
            <div class="col region">常驻地区</div>
            <div class="col contact">联系方式</div>
            <div class="col email">邮箱</div>
            <div class="col skill">擅长</div>
            <div class="col domain">擅长领域</div>
            <div class="col count">维护客户数</div>
            <div class="col count">已成交次数</div>
            <div class="col actions-placeholder"></div>
        </div>

        <el-scrollbar v-if="(select === 0 && !isSalesperson) || isSearchMode" class="sales-list">
            <SalesItem
                v-for="salesperson in displaySalespeople"
                :key="salesperson.id"
                :salesperson="salesperson"
                :highlightKeyword="isSearchMode ? currentKeyword : ''"
                :matchedFields="salesperson._matchedFields || []"
                @view-home="openHome"
                @updated="onSalespersonUpdated"
            />

            <!-- 空状态 -->
            <div v-if="displaySalespeople.length === 0" class="empty-state">
                <span>{{ isSearchMode ? '没有找到匹配的销售人员' : '暂无销售人员数据' }}</span>
            </div>
        </el-scrollbar>

        <SalesPersonalHome v-if="isSalesperson && select === 1 && !isSearchMode" :profile="currentSalesperson" @updated="onSalespersonUpdated" />
    </div>
</template>

<script setup lang="ts">
import SalesPersonalHome from '~/components/configuration/sales/SalesPersonalHome.vue'
import { retrieveSalespersonList, searchSalesperson } from '~/composables/api/useSalespersonApi'

definePageMeta({
    layout: 'sales',
})

const role = useState('admin_info', () => {}).value.role;
const username = useState('admin_info', () => {}).value.username;
const isSalesperson = computed(() => Number(role) === 3);
const salespersonId = useState<string | null>('salesperson_id', () => null)
const salespersonCache = useState<any>('salesperson_self_cache', () => null)
console.log(isSalesperson.value)
const select = ref(isSalesperson.value ? 1 : 0)

// 搜索相关状态
const searchQuery = ref('')
const isSearchMode = ref(false)
const currentKeyword = ref('')
const searchResults = ref<UiSalesperson[]>([])
const searchTotal = ref(0)

const currentSalesperson = ref<UiSalesperson | null>(null)

// 当前显示的销售人员列表
const displaySalespeople = computed(() => {
    if (isSearchMode.value) {
        return searchResults.value
    }
    return salespeople.value
})

const openHome = (salesperson: any) => {
    currentSalesperson.value = salesperson
    select.value = 1
}

type UiDomainTagType = 'blue' | 'orange' | 'purple' | 'red' | 'green'
type UiDomainTag = { label: string; type: UiDomainTagType }

type UiSalesperson = {
    id: string
    avatar?: string
    name: string
    nameCn: string
    nameEn: string
    joinDate: string
    joinDesc: string
    country: string
    city: string
    phone: string
    whatsapp: string
    email: string
    languages: string[]
    markets: string[]
    domains: UiDomainTag[]
    customerCount: number
    dealCount: number
    plans?: string[]
    plansUpdatedAt?: string
    _matchedFields?: string[]
}

type BackendSalesperson = {
    _id: string
    name: string
    avatar?: string
    nameCn?: string
    nameEn?: string
    joinDate?: string
    joinDesc?: string
    country?: string
    city?: string
    phone?: string
    whatsapp?: string
    email?: string
    region?: string
    language?: string
    languages?: string[]
    markets?: string[]
    domains?: string[]
    _customerNum?: number
    dealCount?: number
    _dealCount?: number
    _addTime?: string
    plans?: string[]
    plansUpdatedAt?: string
    _matchedFields?: string[]
}

const salespeople = ref<UiSalesperson[]>([])

const domainColorTypes: UiDomainTagType[] = ['blue', 'orange', 'purple', 'red', 'green']

const hashString = (input: string) => {
    let hash = 0
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 31 + input.charCodeAt(i)) | 0
    }
    return hash
}


const pickDomainType = (label: string): UiDomainTagType => {
    const idx = Math.abs(hashString(label)) % domainColorTypes.length
    return domainColorTypes[idx]
}

const formatDateOnly = (input?: string | Date | null) => {
    if (!input) return ''
    const date = input instanceof Date ? input : new Date(input)
    if (Number.isNaN(date.getTime())) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

const normalizeFromApi = (sp: BackendSalesperson): UiSalesperson => {
    const domainLabels = sp.domains || []
    return {
        id: sp._id,
        name: sp.name || '',
        avatar: sp.avatar || '',
        nameCn: sp.nameCn || '暂无',
        nameEn: sp.nameEn || '暂无',
        joinDate: formatDateOnly(sp.joinDate),
        joinDesc: sp.joinDesc || '',
        city: sp.city || '',
        country: sp.country || '',
        phone: sp.phone || '',
        whatsapp: sp.whatsapp || sp.phone || '',
        email: sp.email || '',
        languages: sp.languages || [],
        markets: sp.markets || [],
        domains: domainLabels.map(label => ({ label, type: pickDomainType(label) })),
        customerCount: sp._customerNum ?? 0,
        dealCount: sp._dealCount ?? 0,
        plans: sp.plans || [],
        plansUpdatedAt: sp.plansUpdatedAt || '',
        _matchedFields: sp._matchedFields || [],
    }
}

// 搜索处理函数
const handleSearch = async () => {
    const keyword = searchQuery.value.trim()
    if (!keyword) {
        handleClearSearch()
        return
    }

    isSearchMode.value = true
    currentKeyword.value = keyword

    try {
        const res = await searchSalesperson()({
            keyword,
            page: 1,
            limit: 50
        })

        if (res.code !== 200) {
            ElMessage.error(res.msg || '搜索失败')
            return
        }

        const list = res?.data?.salespeople ?? []
        searchResults.value = Array.isArray(list) ? list.map(normalizeFromApi) : []
        searchTotal.value = res?.data?.pagination?.total ?? 0
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '搜索失败')
    }
}

// 清除搜索
const handleClearSearch = () => {
    isSearchMode.value = false
    currentKeyword.value = ''
    searchQuery.value = ''
    searchResults.value = []
    searchTotal.value = 0
}

const onSalespersonUpdated = (updated: Partial<UiSalesperson> & { id: string }) => {
    const idx = salespeople.value.findIndex(sp => sp.id === updated.id)
    if (idx >= 0) {
        salespeople.value[idx] = { ...salespeople.value[idx], ...updated }
    }
    if (currentSalesperson.value?.id === updated.id) {
        currentSalesperson.value = { ...currentSalesperson.value, ...updated }
    }
    // 同步更新搜索结果
    const searchIdx = searchResults.value.findIndex(sp => sp.id === updated.id)
    if (searchIdx >= 0) {
        searchResults.value[searchIdx] = { ...searchResults.value[searchIdx], ...updated }
    }
}

const fetchSalespeople = async () => {
    if (isSalesperson.value && salespersonCache.value) {
        const cached = normalizeFromApi(salespersonCache.value as BackendSalesperson)
        salespeople.value = [cached]
        if (select.value === 1) {
            currentSalesperson.value = cached
        }
        return
    }

    const res = await retrieveSalespersonList()()
    if (!res || typeof res !== 'object' || !('code' in res)) return
    const anyRes = res as any
    if (anyRes.code !== 200) {
        ElMessage.error(anyRes.msg || '获取销售列表失败')
        return
    }
    const list: BackendSalesperson[] = anyRes.data?.salesperson || []
    salespeople.value = list.map(normalizeFromApi)
    if (isSalesperson.value) {
        let matched = null
        if (salespersonId.value) {
            matched = list.find(sp => sp._id === salespersonId.value) || null
        }
        if (!matched && username.value) {
            matched = list.find(sp => sp.name === username.value) || null
        }
        salespersonCache.value = matched
    }
    if (select.value === 1) {
        if (isSalesperson.value && salespersonId.value) {
            currentSalesperson.value =
                salespeople.value.find(sp => sp.id === salespersonId.value) ||
                null
        } else if (isSalesperson.value && username.value) {
            currentSalesperson.value =
                salespeople.value.find(sp => sp.name === username.value) ||
                salespeople.value[0] ||
                null
        } else if (!currentSalesperson.value) {
            currentSalesperson.value = salespeople.value[0] || null
        }
    }
}

watch(
    () => select.value,
    (val) => {
        // 切换 tab 时清除搜索状态
        if (isSearchMode.value) {
            handleClearSearch()
        }
        if (val !== 1) return
        if (isSalesperson.value && salespersonId.value) {
            currentSalesperson.value =
                salespeople.value.find(sp => sp.id === salespersonId.value) ||
                null
            return
        }
        if (isSalesperson.value && username.value) {
            currentSalesperson.value =
                salespeople.value.find(sp => sp.name === username.value) ||
                salespeople.value[0] ||
                null
            return
        }
        if (!currentSalesperson.value) currentSalesperson.value = salespeople.value[0] || null
    },
    { immediate: true }
)

onMounted(() => {
    fetchSalespeople()
})
</script>

<style lang="less" scoped>
.sales-root {
    height: 100vh;
    padding: 20px;
    background-color: #f1f7fb;
    overflow: hidden;
    display: flex;
    flex-direction: column;

    .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;

        .title {
            font-size: 28px;
            font-weight: bold;
            color: #333;
        }
    }

    .search-result-hint {
        height: 50px;
        margin-bottom: 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        background-color: #e6f0ff;
        border-radius: 8px;
        color: #333;
        font-size: 14px;

        .search-keyword {
            font-weight: bold;
            color: #3f8cff;
        }

        .btn-clear-search {
            padding: 6px 12px;
            background-color: #3f8cff;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;
            color: #fff;

            &:hover {
                background: #2d7ae8;
            }
        }
    }

    .tabs {
        display: flex;
        align-items: center;
        background: white;
        border-radius: 8px;
        padding: 0 20px;
        margin-bottom: 20px;
        gap: 40px;

        .tab {
            padding: 16px 0;
            cursor: pointer;
            color: #a6a6a6;
            font-size: 17px;
            font-weight: bold;
            position: relative;
            white-space: nowrap;


            &.active {
                color: #0a1629;
                font-weight: 500;

                &::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 2px;
                    background: #667eea;
                }
            }
        }
    }

    .list-header {
        display: flex;
        align-items: center;
        background-color: #e6edf5;
        padding: 12px 30px;
        border-radius: 12px;
        margin-bottom: 16px;
        color: #333;
        font-size: 14px;
        font-weight: 500;

        .col {
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: bold;
            font-size: 16px;
            white-space: nowrap;
            justify-content: center;

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
                color: #666;

                &::placeholder {
                    color: #ccc;
                }
            }

            &.name { width: 100px; flex-shrink: 0; margin-right: 40px; justify-content: flex-start; }
            &.join { width: 140px; flex-shrink: 0; margin-right: 40px; }
            &.region { width: 100px; flex-shrink: 0; margin-right: 40px; }
            &.contact { width: 150px; flex-shrink: 0; margin-right: 40px; }
            &.email { width: 150px; flex-shrink: 0; margin-right: 40px; }
            &.skill { width: 140px; flex-shrink: 0; margin-right: 40px; }
            &.domain { width: 150px; flex-shrink: 0; margin-right: 40px; }
            &.count { width: 80px; flex-shrink: 0; margin-right: 40px;}
            &.actions-placeholder { flex: 1; min-width: 80px; }
        }
    }

    .sales-list {
        flex: 1;
        min-height: 0;
    }

    .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px;
        color: #999;
        font-size: 14px;
    }
}
</style>
