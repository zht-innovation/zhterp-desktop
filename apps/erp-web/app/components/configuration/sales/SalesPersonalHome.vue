<template>
    <div class="home-grid">
        <!-- 左：个人信息 -->
        <div class="card profile-card">
            <div class="profile-head">
                <div class="profile-basic">
                    <div class="profile-basic-left">
                        <div class="avatar-wrap">
                            <div class="avatar-ring">
                                <div
                                    class="avatar-inner"
                                    :class="{ empty: !localProfile.avatar }"
                                    ref="avatarDom"
                                    :style="avatarStyle"
                                ></div>
                            </div>
                        </div>
                        <div class="name-block">
                            <div class="name-cn">{{ localProfile.nameCn }}</div>
                            <div class="name-en">{{ localProfile.nameEn }}</div>
                        </div>
                    </div>
                    <div class="profile-basic-right">
                        <div class="section basic-section">
                            <div class="section-title">基础信息</div>
                            <div class="info-row">
                                <div class="label">入职时间</div>
                                <div class="pill">{{ formatDateOnly(localProfile.joinDate) }}</div>
                                <div class="hint">{{ localProfile.joinDesc }}</div>
                            </div>
	                        <div class="info-row">
	                            <div class="label">常驻地区</div>
	                            <div class="pill">{{ [localProfile.country, localProfile.city].filter(Boolean).join('/') }}</div>
	                            <Icon class="loc" name="material-symbols:location-on-outline" />
	                        </div>
	                    </div>
                    </div>
                </div>
                <button v-if="canEdit" class="icon-btn" type="button" @click="openEdit">
                    <Icon name="material-symbols:edit-square-outline" />
                </button>
            </div>

            <div class="divider"></div>

            <el-scrollbar class="profile-scroll">
                <div class="profile-body">
                    <div class="section">
                        <div class="section-title">联系方式</div>
                        <div class="kv-grid">
                            <div class="kv-item">
                                <div class="label">联系电话</div>
                                <div class="pill wide">{{ localProfile.phone }}</div>
                            </div>
                            <div class="kv-item">
                                <div class="label">电子邮件</div>
                                <div class="pill wide">{{ localProfile.email }}</div>
                            </div>
                            <div class="kv-item">
                                <div class="label">WhatsApp</div>
                                <div class="pill wide">{{ localProfile.whatsapp }}</div>
                            </div>
                        </div>
                    </div>

                    <div class="section split">
                        <div class="split-col">
                            <div class="section-title">擅长语言</div>
                            <div class="chips">
                                <span v-for="(lang, i) in localProfile.languages" :key="`lang-${i}`" class="chip">{{ lang }}</span>
                            </div>
                        </div>
                        <div class="split-col">
                            <div class="section-title">擅长市场</div>
                            <div class="chips">
                                <span v-for="(m, i) in localProfile.markets" :key="`market-${i}`" class="chip">{{ m }}</span>
                            </div>
                        </div>
                    </div>

                    <div class="section">
                        <div class="section-title">擅长领域</div>
                        <div class="domain-chips">
                            <span
                                v-for="(tag, i) in localProfile.domains"
                                :key="`domain-${i}`"
                                class="domain-tag"
                                :class="tag.type"
                            >
                                {{ tag.label }}
                            </span>
                        </div>
                    </div>

                    <div class="section">
                        <div class="section-title">客户情况</div>
                        <div class="stats-row">
                            <div class="stat">
                                <div class="label">维护客户数</div>
                                <div class="stat-value">{{ localProfile.customerCount }}</div>
                            </div>
                            <div class="stat">
                                <div class="label">已成交次数</div>
                                <div class="stat-value">{{ localProfile.dealCount }}</div>
                            </div>
                        </div>
                    </div>

                    <div class="section">
                        <div class="plan-head">
                            <div class="section-title">近期主要计划</div>
                            <div class="plan-date">{{ plansUpdatedText }}</div>
                        </div>
                        <div class="plan-box" :class="{ editable: canEdit }" @click="canEdit && openPlanEdit()">
                            <ol v-if="localProfile.plans?.length" class="plan-list">
                                <li v-for="(p, i) in localProfile.plans" :key="`plan-${i}`">{{ p }}</li>
                            </ol>
                            <div v-else class="plan-empty">暂无计划</div>
                        </div>
                    </div>
                </div>
            </el-scrollbar>
        </div>

        <!-- 中：个人最新消息 -->
        <div class="card news-card">
            <div class="card-title">个人最新消息</div>
            <el-scrollbar class="news-scroll">
                <div class="news-list">
                    <div
                        v-for="(item, i) in personalNews"
                        :key="`p-${i}`"
                        class="news-item"
                        :class="{ clickable: Boolean(item.action) }"
                        @click="handleNewsClick(item)"
                    >
                        <div class="news-line blue"></div>
                        <div class="news-main">
                            <div class="news-head">
                                <Icon class="news-icon blue" name="material-symbols:calendar-month-outline" />
                                <div class="news-text">
                                    <span
                                        v-for="(part, j) in item.titleParts"
                                        :key="`p-${i}-t-${j}`"
                                        class="part"
                                        :class="part.tone"
                                    >
                                        {{ part.text }}
                                    </span>
                                </div>
                            </div>
                            <div class="news-foot">
                                <div class="news-time">{{ item.time }}</div>
                                <button class="detail-btn" style="opacity: 0;" type="button">
                                    <Icon name="material-symbols:arrow-circle-right-outline" />
                                    详细查看
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </el-scrollbar>
        </div>

        <!-- 右：其他最新消息 -->
        <div class="card news-card">
            <div class="card-title">其他最新消息</div>
            <el-scrollbar class="news-scroll">
                <div class="news-list">
                    <div
                        v-for="(item, i) in otherNews"
                        :key="`o-${i}`"
                        class="news-item"
                        :class="{ clickable: Boolean(item.action) }"
                        @click="handleNewsClick(item)"
                    >
                        <div class="news-line orange"></div>
                        <div class="news-main">
                            <div class="news-head">
                                <Icon class="news-icon orange" name="material-symbols:description-outline" />
                                <div class="news-text">
                                    <span
                                        v-for="(part, j) in item.titleParts"
                                        :key="`o-${i}-t-${j}`"
                                        class="part"
                                        :class="part.tone"
                                    >
                                        {{ part.text }}
                                    </span>
                                </div>
                            </div>
                            <div class="news-foot">
                                <div class="news-time">{{ item.time }}</div>
                                <button class="detail-btn" style="opacity: 0;" type="button">
                                    <Icon name="material-symbols:arrow-circle-right-outline" />
                                    详细查看
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </el-scrollbar>
        </div>
    </div>

    <!-- 修改个人信息弹窗 -->
    <div v-if="editDialog.visible" class="modal-overlay" @click.self="handleCloseEdit">
        <div class="modal-content">
            <div class="modal-header">
                <h3>修改个人信息</h3>
                <button class="close-btn" @click="handleCloseEdit">
                    <Icon name="heroicons:x-mark" />
                </button>
            </div>

            <div class="section-divider">
                <span>基础信息</span>
            </div>

            <div class="form-row">
                <div class="form-group half">
                    <label>中文名 <span class="required">*</span></label>
                    <input v-model="editForm.nameCn" type="text" placeholder="请输入中文名" />
                </div>
                <div class="form-group half">
                    <label>英文名</label>
                    <input v-model="editForm.nameEn" type="text" placeholder="请输入英文名" />
                </div>
            </div>

            <div class="form-row">
                <div class="form-group half">
                    <label>入职时间</label>
                    <input v-model="editForm.joinDate" type="date" placeholder="请选择入职时间" />
                </div>
                <div class="form-group half">
                    <label>入职描述</label>
                    <input v-model="editForm.joinDesc" type="text" placeholder="如：已入职2年" />
                </div>
            </div>

            <div class="form-row">
                <div class="form-group half">
                    <label>国家</label>
                    <input v-model="editForm.country" type="text" placeholder="国家" list="sales-country-options" />
                    <datalist id="sales-country-options">
                        <option v-for="country in countryOptions" :key="country" :value="country" />
                    </datalist>
                </div>
                <div class="form-group half">
                    <label>城市</label>
                    <input v-model="editForm.city" type="text" placeholder="城市" />
                </div>
            </div>

            <div class="section-divider">
                <span>联系方式</span>
            </div>

            <div class="form-row">
                <div class="form-group half">
                    <label>电话</label>
                    <input v-model="editForm.phone" type="text" placeholder="联系电话" />
                </div>
                <div class="form-group half">
                    <label>WhatsApp</label>
                    <input v-model="editForm.whatsapp" type="text" placeholder="WhatsApp" />
                </div>
            </div>

            <div class="form-group">
                <label>邮箱</label>
                <input v-model="editForm.email" type="text" placeholder="电子邮件" />
            </div>

            <div class="section-divider">
                <span>擅长领域</span>
            </div>

            <div class="form-group">
                <label>语言</label>
                <div class="tags-container">
                    <span v-for="lang in editForm.languages" :key="`lang-${lang}`" class="tag blue closable">
                        {{ lang }}
                        <button class="tag-close" @click="removeLanguage(lang)">×</button>
                    </span>
                    <input 
                        v-if="langInputVisible" 
                        ref="langInputRef" 
                        v-model="langInputValue" 
                        class="tag-input" 
                        @keyup.enter="handleLangInputConfirm" 
                        @blur="handleLangInputConfirm" 
                        placeholder="输入语言"
                    />
                    <button v-else class="add-tag-btn" @mousedown.prevent="showLangInput">+ 添加语言</button>
                </div>
            </div>

            <div class="form-group">
                <label>市场</label>
                <div class="tags-container">
                    <span v-for="m in editForm.markets" :key="`market-${m}`" class="tag orange closable">
                        {{ m }}
                        <button class="tag-close" @click="removeMarket(m)">×</button>
                    </span>
                    <input 
                        v-if="marketInputVisible" 
                        ref="marketInputRef" 
                        v-model="marketInputValue" 
                        class="tag-input" 
                        @keyup.enter="handleMarketInputConfirm" 
                        @blur="handleMarketInputConfirm" 
                        placeholder="输入市场"
                    />
                    <button v-else class="add-tag-btn" @mousedown.prevent="showMarketInput">+ 添加市场</button>
                </div>
            </div>

            <div class="form-group">
                <label>领域</label>
                <div class="tags-container">
                    <span v-for="d in editForm.domains" :key="`domain-${d}`" class="tag purple closable">
                        {{ d }}
                        <button class="tag-close" @click="removeDomain(d)">×</button>
                    </span>
                    <input 
                        v-if="domainInputVisible" 
                        ref="domainInputRef" 
                        v-model="domainInputValue" 
                        class="tag-input" 
                        @keyup.enter="handleDomainInputConfirm" 
                        @blur="handleDomainInputConfirm" 
                        placeholder="输入领域"
                    />
                    <button v-else class="add-tag-btn" @mousedown.prevent="showDomainInput">+ 添加领域</button>
                </div>
            </div>

            <div class="modal-actions">
                <button @click="handleCloseEdit">取消</button>
                <button class="primary" @click="submitEdit" :disabled="editDialog.loading || !editForm.nameCn">
                    {{ editDialog.loading ? '保存中...' : '保存' }}
                </button>
            </div>
        </div>
    </div>

    <!-- 编辑计划弹窗 -->
    <div v-if="planDialog.visible" class="modal-overlay" @click.self="handleClosePlanEdit">
        <div class="modal-content plan-modal">
            <div class="modal-header">
                <h3>编辑近期主要计划</h3>
                <button class="close-btn" @click="handleClosePlanEdit">
                    <Icon name="heroicons:x-mark" />
                </button>
            </div>

            <div class="plan-edit-list">
                <div v-for="(_, index) in planEditForm.plans" :key="index" class="plan-edit-item">
                    <span class="plan-index">{{ index + 1 }}.</span>
                    <input 
                        v-model="planEditForm.plans[index]" 
                        type="text" 
                        placeholder="请输入计划内容"
                        @keyup.enter="addPlanEditItem"
                    />
                    <button 
                        class="remove-plan-btn" 
                        @click="removePlanEditItem(index)"
                        :disabled="planEditForm.plans.length <= 1"
                    >
                        <Icon name="heroicons:x-mark" />
                    </button>
                </div>
            </div>

            <button class="add-plan-btn" @click="addPlanEditItem">
                <Icon name="heroicons:plus" />
                添加计划
            </button>

            <div class="modal-actions">
                <button @click="handleClosePlanEdit">取消</button>
                <button class="primary" @click="submitPlanEdit" :disabled="planDialog.loading">
                    {{ planDialog.loading ? '保存中...' : '保存' }}
                </button>
            </div>
        </div>
    </div>
</template>


<script setup lang="ts">
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import { nextTick } from 'vue'
import { countryOptions } from '~/utils/countryOptions'
import { updateSalesperson } from '~/composables/api/useSalespersonApi'
import { retrieveNewsList } from '~/composables/api/useNewsApi'
import useDrop from '~/composables/useDrop'

type DomainTagType = 'blue' | 'orange' | 'purple' | 'red' | 'green'

type SalespersonProfile = {
    id: string
    name?: string
    avatar?: string
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
    domains: { label: string; type: DomainTagType }[]
    customerCount: number
    dealCount: number
    plans?: string[]
    plansUpdatedAt?: string
}

type NewsTitlePart = { text: string; tone?: 'blue' | 'orange' }
type NewsAction = { type: 'public_customer' | 'assigned_customer'; customerId?: string }
type NewsItem = {
    titleParts: NewsTitlePart[]
    time: string
    tone: 'blue' | 'orange'
    action?: NewsAction | null
}
type RawNews = {
    _id: string
    scope: 'personal' | 'public'
    type: string
    actorName?: string
    customerName?: string
    customerId?: string
    expireDate?: string | Date | null
    _createdAt?: string | Date
}

const props = defineProps<{
    profile: SalespersonProfile | null
}>()

const emit = defineEmits<{
    (e: 'updated', payload: Partial<SalespersonProfile> & { id: string }): void
}>()

const router = useRouter()

const emptyProfile: SalespersonProfile = {
    id: '',
    nameCn: '',
    nameEn: '',
    avatar: '',
    joinDate: '',
    joinDesc: '',
    country: '',
    city: '',
    phone: '',
    whatsapp: '',
    email: '',
    languages: [],
    markets: [],
    domains: [],
    customerCount: 0,
    dealCount: 0,
    plans: [],
    plansUpdatedAt: '',
}

const adminInfo = useState('admin_info', () => ({}))
const role = computed(() => adminInfo.value?.role)
const canEdit = computed(() => Number(role.value) === 3)

const formatDateOnly = (input?: string | Date | null) => {
    if (!input) return ''
    const date = input instanceof Date ? input : new Date(input)
    if (Number.isNaN(date.getTime())) return ''
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

const localProfile = ref<SalespersonProfile>({ ...emptyProfile })
watch(
    () => props.profile,
    (p) => {
        localProfile.value = {
            ...emptyProfile,
            ...(p ?? {}),
        }
    },
    { immediate: true }
)

const avatarDom = ref() as Ref<HTMLElement>
const avatarStyle = computed(() =>
    localProfile.value.avatar ? { backgroundImage: `url(${resolveErpImageUrl(localProfile.value.avatar)})` } : {}
)

const saveAvatar = async (path: string) => {
    if (!localProfile.value.id) return
    try {
        const res: any = await updateSalesperson()({
            _id: localProfile.value.id,
            avatar: path,
        } as any)
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '更新头像失败')
            return
        }
        localProfile.value = { ...localProfile.value, avatar: path }
        emit('updated', { id: localProfile.value.id, avatar: path })
        ElMessage.success('头像已更新')
    } catch (err) {
        console.error('更新销售头像失败:', err)
        ElMessage.error('更新头像失败')
    }
}

const openEdit = () => {
    // 填充表单数据
    editForm.nameCn = localProfile.value.nameCn
    editForm.nameEn = localProfile.value.nameEn
    editForm.joinDate = formatDateOnly(localProfile.value.joinDate)
    editForm.joinDesc = localProfile.value.joinDesc
    editForm.country = localProfile.value.country
    editForm.city = localProfile.value.city
    editForm.phone = localProfile.value.phone
    editForm.whatsapp = localProfile.value.whatsapp
    editForm.email = localProfile.value.email
    editForm.languages = [...localProfile.value.languages]
    editForm.markets = [...localProfile.value.markets]
    editForm.domains = normalizeDomainLabels(localProfile.value.domains.map(d => ({ label: d.label })))
    
    // 填充计划数据
    const currentPlans = localProfile.value.plans || []
    editForm.plans = currentPlans.length > 0 ? [...currentPlans] : ['']

    editDialog.visible = true
}

const avatarDropReady = ref(false)
watch(
    canEdit,
    (val) => {
        if (!val || avatarDropReady.value) return
        avatarDropReady.value = true
        useDrop(
            avatarDom,
            (path) => {
                void saveAvatar(path)
            },
            { accept: 'image/*' }
        )
    },
    { immediate: true }
)

type EditForm = {
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
    domains: string[]
    plans: string[]
}

const editDialog = reactive({
    visible: false,
    loading: false,
})

// 计划编辑弹窗状态
const planDialog = reactive({
    visible: false,
    loading: false,
})

const planEditForm = reactive({
    plans: [''] as string[],
})

const openPlanEdit = () => {
    const currentPlans = localProfile.value.plans || []
    planEditForm.plans = currentPlans.length > 0 ? [...currentPlans] : ['']
    planDialog.visible = true
}

const handleClosePlanEdit = () => {
    planDialog.visible = false
    planEditForm.plans = ['']
}

const addPlanEditItem = () => {
    planEditForm.plans.push('')
    nextTick(() => {
        const inputs = document.querySelectorAll('.plan-modal .plan-edit-item input')
        const lastInput = inputs[inputs.length - 1] as HTMLInputElement
        lastInput?.focus()
    })
}

const removePlanEditItem = (index: number) => {
    if (planEditForm.plans.length > 1) {
        planEditForm.plans.splice(index, 1)
    }
}

const submitPlanEdit = async () => {
    if (!localProfile.value.id) return

    planDialog.loading = true
    try {
        const filteredPlans = planEditForm.plans.map(p => p.trim()).filter(Boolean)
        
        const payload = {
            _id: localProfile.value.id,
            plans: filteredPlans,
            plansUpdatedAt: new Date().toISOString(),
        }

        const res: any = await updateSalesperson()(payload as any)
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '更新计划失败')
            return
        }

        localProfile.value = {
            ...localProfile.value,
            plans: filteredPlans,
            plansUpdatedAt: payload.plansUpdatedAt,
        }
        
        emit('updated', {
            id: localProfile.value.id,
            plans: filteredPlans,
            plansUpdatedAt: payload.plansUpdatedAt,
        })
        
        ElMessage.success('计划已更新')
        planDialog.visible = false
    } catch (err) {
        console.error('更新计划失败:', err)
        ElMessage.error('更新计划失败')
    } finally {
        planDialog.loading = false
    }
}

const editFormRef = ref()
const editForm = reactive<EditForm>({
    nameCn: '',
    nameEn: '',
    joinDate: '',
    joinDesc: '',
    country: '',
    city: '',
    phone: '',
    whatsapp: '',
    email: '',
    languages: [],
    markets: [],
    domains: [],
    plans: [''],
})

const editRules = {
    nameCn: [{ required: true, message: '请输入中文名', trigger: 'blur' }],
    email: [{ type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }],
}

const hashString = (input: string) => {
    let hash = 0
    for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0
    return hash
}

const domainColorTypes: DomainTagType[] = ['blue', 'orange', 'purple', 'red', 'green']
const pickDomainType = (label: string): DomainTagType => {
    const idx = Math.abs(hashString(label)) % domainColorTypes.length
    return domainColorTypes[idx]
}

const normalizeDomainLabels = (input: Array<{ label: string }> | undefined) =>
    (input ?? []).map(d => (d?.label ?? '').trim()).filter(Boolean)

const toDomainTags = (labels: string[]) =>
    labels.map(label => ({ label, type: pickDomainType(label) }))

// 语言标签输入
const langInputVisible = ref(false)
const langInputValue = ref('')
const langInputRef = ref<HTMLInputElement>()

const showLangInput = () => {
    langInputVisible.value = true
    nextTick(() => langInputRef.value?.focus())
}

const handleLangInputConfirm = () => {
    if (langInputValue.value && !editForm.languages.includes(langInputValue.value)) {
        editForm.languages.push(langInputValue.value)
    }
    langInputValue.value = ''
    langInputVisible.value = false
}

const removeLanguage = (lang: string) => {
    const idx = editForm.languages.indexOf(lang)
    if (idx > -1) editForm.languages.splice(idx, 1)
}

// 市场标签输入
const marketInputVisible = ref(false)
const marketInputValue = ref('')
const marketInputRef = ref<HTMLInputElement>()

const showMarketInput = () => {
    marketInputVisible.value = true
    nextTick(() => marketInputRef.value?.focus())
}

const handleMarketInputConfirm = () => {
    if (marketInputValue.value && !editForm.markets.includes(marketInputValue.value)) {
        editForm.markets.push(marketInputValue.value)
    }
    marketInputValue.value = ''
    marketInputVisible.value = false
}

const removeMarket = (m: string) => {
    const idx = editForm.markets.indexOf(m)
    if (idx > -1) editForm.markets.splice(idx, 1)
}

// 领域标签输入
const domainInputVisible = ref(false)
const domainInputValue = ref('')
const domainInputRef = ref<HTMLInputElement>()

const showDomainInput = () => {
    domainInputVisible.value = true
    nextTick(() => domainInputRef.value?.focus())
}

const handleDomainInputConfirm = () => {
    if (domainInputValue.value && !editForm.domains.includes(domainInputValue.value)) {
        editForm.domains.push(domainInputValue.value)
    }
    domainInputValue.value = ''
    domainInputVisible.value = false
}

const removeDomain = (d: string) => {
    const idx = editForm.domains.indexOf(d)
    if (idx > -1) editForm.domains.splice(idx, 1)
}

// 关闭弹窗
const handleCloseEdit = () => {
    editDialog.visible = false
    resetEdit()
}

const resetEdit = () => {
    editDialog.loading = false
    // 重置标签输入状态
    langInputVisible.value = false
    langInputValue.value = ''
    marketInputVisible.value = false
    marketInputValue.value = ''
    domainInputVisible.value = false
    domainInputValue.value = ''
}

// 销售个人主页只能修改namecn和nameen
const submitEdit = async () => {
    if (!localProfile.value.id) return
    if (!editForm.nameCn) {
        ElMessage.warning('请输入中文名')
        return
    }

    editDialog.loading = true
    try {
        // 过滤空计划
        const filteredPlans = editForm.plans.map(p => p.trim()).filter(Boolean)
        
        const payload = {
            _id: localProfile.value.id,
            nameCn: editForm.nameCn,
            nameEn: editForm.nameEn,
            joinDate: editForm.joinDate,
            joinDesc: editForm.joinDesc,
            country: editForm.country,
            city: editForm.city,
            phone: editForm.phone,
            whatsapp: editForm.whatsapp,
            email: editForm.email,
            languages: editForm.languages,
            markets: editForm.markets,
            domains: editForm.domains,
            plans: filteredPlans,
            plansUpdatedAt: new Date().toISOString(),
        }

        const res: any = await updateSalesperson()(payload as any)
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '更新失败')
            return
        }

        const updated: SalespersonProfile = {
            ...localProfile.value,
            nameCn: payload.nameCn,
            nameEn: payload.nameEn,
            joinDate: payload.joinDate,
            joinDesc: payload.joinDesc,
            country: payload.country,
            city: payload.city,
            phone: payload.phone,
            whatsapp: payload.whatsapp,
            email: payload.email,
            languages: payload.languages,
            markets: payload.markets,
            domains: toDomainTags(payload.domains),
            plans: filteredPlans,
            plansUpdatedAt: payload.plansUpdatedAt,
        }

        localProfile.value = updated
        emit('updated', updated)
        ElMessage.success('已更新')
        editDialog.visible = false
    } finally {
        editDialog.loading = false
    }
}

// 计划更新时间显示
const plansUpdatedText = computed(() => {
    if (!localProfile.value.plansUpdatedAt) return '暂未更新'
    const date = new Date(localProfile.value.plansUpdatedAt)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}/${month}/${day} 更新`
})

const rawNews = ref<RawNews[]>([])

const getNewsDate = (news: RawNews) => {
    const raw = news._createdAt
    const date = raw ? new Date(raw) : new Date()
    return Number.isNaN(date.getTime()) ? new Date() : date
}

const isWithinRecentDays = (date: Date, days = 3) => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const cutoff = new Date(todayStart)
    cutoff.setDate(cutoff.getDate() - (days - 1))
    return date >= cutoff
}

const formatNewsTime = (dateInput: Date) => {
    const date = new Date(dateInput)
    if (Number.isNaN(date.getTime())) return ''
    const month = date.getMonth() + 1
    const day = date.getDate()
    const hours = date.getHours()
    const minutes = date.getMinutes().toString().padStart(2, '0')
    const period = hours >= 12 ? '下午' : '上午'
    const hourText = hours.toString().padStart(2, '0')
    return `${month}月${day}日 | ${period}${hourText}:${minutes}`
}

const calcDaysLeft = (expireDate: Date) => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const expireStart = new Date(expireDate.getFullYear(), expireDate.getMonth(), expireDate.getDate())
    const diff = expireStart.getTime() - todayStart.getTime()
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

const buildTitleParts = (news: RawNews): NewsTitlePart[] => {
    const actorName = news.actorName || '管理员'
    const customerName = news.customerName || '未知客户'

    switch (news.type) {
        case 'application_approved':
            return [
                { text: actorName, tone: 'blue' },
                { text: '通过了您对客户' },
                { text: customerName, tone: 'blue' },
                { text: '的维护申请' },
            ]
        case 'application_rejected':
            return [
                { text: actorName, tone: 'blue' },
                { text: '拒绝了您对客户' },
                { text: customerName, tone: 'blue' },
                { text: '的维护申请' },
            ]
        case 'maintenance_due': {
            const expireDate = news.expireDate ? new Date(news.expireDate) : null
            const daysLeft = expireDate ? calcDaysLeft(expireDate) : 7
            return [
                { text: '您对客户' },
                { text: customerName, tone: 'blue' },
                { text: `的维护还剩${daysLeft}天` },
            ]
        }
        case 'maintenance_extended':
            return [
                { text: actorName, tone: 'blue' },
                { text: '延长了您对客户' },
                { text: customerName, tone: 'blue' },
                { text: '的维护' },
            ]
        case 'maintenance_shortened':
            return [
                { text: actorName, tone: 'blue' },
                { text: '提前结束了您对客户' },
                { text: customerName, tone: 'blue' },
                { text: '的维护' },
            ]
        case 'maintenance_ended':
            return [
                { text: actorName, tone: 'blue' },
                { text: '结束了您对客户' },
                { text: customerName, tone: 'blue' },
                { text: '的维护' },
            ]
        case 'public_customer_added':
            return [
                { text: actorName, tone: 'orange' },
                { text: '上传了新的客户信息' },
            ]
        case 'customer_assigned':
            return [
                { text: actorName, tone: 'blue' },
                { text: '将客户' },
                { text: customerName, tone: 'blue' },
                { text: '分配给了你' },
            ]
        case 'customer_unassigned':
            return [
                { text: actorName, tone: 'blue' },
                { text: '已收回你维护的客户' },
                { text: customerName, tone: 'blue' },
            ]
        default:
            return [{ text: '最新消息' }]
    }
}

const buildNewsAction = (news: RawNews): NewsAction | null => {
    if (news.type === 'customer_assigned') {
        return { type: 'assigned_customer', customerId: news.customerId }
    }
    if (news.type === 'public_customer_added') {
        return { type: 'public_customer', customerId: news.customerId }
    }
    return null
}

const handleNewsClick = (item: NewsItem) => {
    if (!item.action?.customerId) return
    if (item.action.type === 'public_customer') {
        router.push({
            path: '/configuration/sales/customer',
            query: { customerId: item.action.customerId, tab: 'public' },
        })
        return
    }
    router.push({
        path: '/configuration/sales/customer',
        query: { customerId: item.action.customerId },
    })
}

const toNewsItem = (news: RawNews): NewsItem => {
    const createdAt = getNewsDate(news)
    return {
        tone: news.scope === 'public' ? 'orange' : 'blue',
        titleParts: buildTitleParts(news),
        time: formatNewsTime(createdAt),
        action: buildNewsAction(news),
    }
}

const recentNews = computed(() => {
    return rawNews.value
        .filter((item) => isWithinRecentDays(getNewsDate(item), 3))
        .sort((a, b) => getNewsDate(b).getTime() - getNewsDate(a).getTime())
})

const personalNews = computed(() =>
    recentNews.value.filter((item) => item.scope === 'personal').map(toNewsItem)
)

const otherNews = computed(() =>
    recentNews.value.filter((item) => item.scope === 'public').map(toNewsItem)
)

const fetchNews = async () => {
    try {
        const res: any = await retrieveNewsList()()
        rawNews.value = res?.data?.news ?? []
    } catch (err) {
        console.error('获取最新消息失败:', err)
    }
}

onMounted(() => {
    fetchNews()
})

</script>


<style lang="less" scoped>
:deep(.sales-edit-dialog .el-dialog) {
    border-radius: 20px;
}

:deep(.sales-edit-dialog .el-dialog__title) {
    font-size: 16px;
    font-weight: 700;
    color: #0a1629;
}

.edit-section-title {
    font-size: 14px;
    font-weight: 700;
    color: #0a1629;
    margin: 12px 0 8px;
}

.home-grid {
    height: calc(100vh - 180px);
    display: grid;
    grid-template-columns: 1.05fr 1fr 1fr;
    gap: 24px;
    align-items: stretch;
}

.card {
    background: #fff;
    border-radius: 24px;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
    overflow: hidden;
}

.profile-card {
    display: flex;
    flex-direction: column;
}

.profile-head {
    padding: 22px 22px 0px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.profile-basic {
    display: flex;
    align-items: center;
    gap: 16px;
}

.profile-basic-left {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    
    .name-block{
        display: flex;
        flex-direction: column;
        align-items: center;
    }
}

.profile-basic-right {
    margin-left:20px;
    flex: 1;
}

.basic-section {
    margin-top: 0;
}

.avatar-wrap {
    width: 64px;
    height: 64px;
    flex-shrink: 0;
}

.avatar-ring {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: conic-gradient(from 90deg, #3f8cff 0 270deg, #e6edf5 0);
    display: grid;
    place-items: center;
}

.avatar-inner {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background-color: #fff;
    cursor: pointer;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    position: relative;
    display: grid;
    place-items: center;
}

.avatar-inner.empty {
    background-color: #f1f5f9;
}

.avatar-inner.empty::before {
    content: '+';
    font-size: 28px;
    font-weight: 700;
    color: #94a3b8;
}

.name-cn {
    font-size: 18px;
    font-weight: 600;
    color: #0a1629;
    line-height: 1.2;
}

.name-en {
    margin-top: 4px;
    font-size: 14px;
    font-weight: 500;
    color: #91929e;
    line-height: 1.2;
}

.icon-btn {
    font-size: 25px; 
    border: none;
    background: transparent;
    color: #0a1629;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
}

.divider {
    height: 4px;
    background: #e4e6e8;
    margin-top: 16px;
}

.profile-scroll {
    flex: 1;
}

.profile-body {
    padding: 18px 22px 22px;
}

.section {
    margin-top: 18px;
}

.section:first-child {
    margin-top: 0;
}

.section-title {
    font-size: 16px;
    font-weight: 600;
    color: #0a1629;
    margin-bottom: 12px;
}

.info-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
}

.label {
    font-size: 14px;
    color: #91929e;
    font-weight: 500;
    white-space: nowrap;
}

.hint {
    margin-left: auto;
    font-size: 14px;
    color: #91929e;
    white-space: nowrap;
}

.pill {
    background: #f1f5f9;
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 14px;
    color: #64748b;
    border: 1px solid #eef2f7;
    line-height: 1;
    white-space: nowrap;
}

.pill.wide {
    min-width: 170px;
    text-align: center;
}

.loc {
    color: #94a3b8;
    font-size: 20px;
}

.kv-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px 18px;
}

.kv-item {
    display: flex;
    align-items: center;
    gap: 10px;
}

.split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
}

.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.chip {
    background: #f1f5f9;
    color: #64748b;
    border: 1px solid #eef2f7;
    border-radius: 999px;
    font-size: 12px;
    padding: 5px 12px;
    line-height: 1;
}

.chip.muted {
    background: #f3f4f6;
    color: #9ca3af;
}

.domain-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.domain-tag {
    border-radius: 999px;
    font-size: 12px;
    padding: 5px 12px;
    line-height: 1;
    color: #fff;
}

.domain-tag.blue {
    background: #3f8cff;
}

.domain-tag.orange {
    background: #f59e0b;
}

.domain-tag.red {
    background: #ef4444;
}

.domain-tag.purple {
    background: #8b5cf6;
}

.domain-tag.green {
    background: #22c55e;
}

.domain-tag.muted {
    background: #f3f4f6;
    color: #9ca3af;
}

.stats-row {
    display: flex;
    gap: 26px;
}

.stat {
    display: flex;
    align-items: baseline;
    gap: 12px;
}

.stat-value {
    font-size: 20px;
    font-weight: 700;
    color: #0a1629;
}

.plan-head {
    display: flex;
    align-items: center;
    gap: 10px;
}

.plan-date {
    font-size: 12px;
    color: #cbd5e1;
    font-weight: 500;
}

.plan-empty {
    color: #94a3b8;
    font-size: 13px;
}

.plan-box {
    margin-top: 12px;
    border-radius: 16px;
    border: 1px solid #e6edf5;
    padding: 14px 16px;
    min-height: 140px;
    
    &.editable {
        cursor: pointer;
        transition: all 0.2s ease;
        
        &:hover {
            border-color: #3f8cff;
            background-color: #f8faff;
        }
    }
}

.plan-list {
    margin: 0;
    padding-left: 18px;
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.9;
}

.news-card {
    padding: 20px 18px;
    display: flex;
    flex-direction: column;
}

.card-title {
    padding: 0 6px 10px;
    font-size: 16px;
    font-weight: 600;
    color: #0a1629;
}

.news-scroll {
    flex: 1;
}

.news-list {
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.news-item {
    background: #fff;
    border-radius: 16px;
    box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
    display: flex;
    overflow: hidden;
}

.news-item.clickable {
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.news-item.clickable:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 22px rgba(15, 23, 42, 0.12);
}

.news-line {
    width: 6px;
    flex-shrink: 0;
}

.news-line.blue {
    background: #3f8cff;
}

.news-line.orange {
    background: #ff5a3c;
}

.news-main {
    flex: 1;
    padding: 18px 18px 14px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.news-head {
    display: flex;
    align-items: flex-start;
    gap: 12px;
}

.news-icon {
    font-size: 22px;
    margin-top: 2px;
    flex-shrink: 0;
}

.news-icon.blue {
    color: #3f8cff;
}

.news-icon.orange {
    color: #ff5a3c;
}

.news-text {
    font-size: 16px;
    font-weight: 600;
    color: #0a1629;
    line-height: 1.55;
}

.part.blue {
    color: #3f8cff;
}

.part.orange {
    color: #ff5a3c;
}

.news-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.news-time {
    font-size: 14px;
    color: #94a3b8;
    font-weight: 500;
}

.detail-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    cursor: pointer;
    background: #f1f7ff;
    color: #64748b;
    padding: 8px 12px;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 600;
}

.detail-btn :deep(svg) {
    width: 18px;
    height: 18px;
}

// 新增模态框样式
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

    &::-webkit-scrollbar {
        display: none;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;

        h3 {
            margin: 0;
            font-size: 18px;
            color: #111827;
            font-weight: 700;
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
        flex-wrap: wrap;
    }

    .form-group {
        margin-bottom: 16px;
        
        &.half {
            flex: 1;
            min-width: 200px;
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

        input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            font-size: 14px;
            box-sizing: border-box;
            
            &:focus {
                outline: none;
                border-color: #4E8AF4;
            }

            &:disabled {
                background-color: #F3F4F6;
                cursor: not-allowed;
            }
        }
    }

    .tags-container {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;

        .tag {
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 13px;
            display: inline-flex;
            align-items: center;
            gap: 4px;

            &.blue {
                background: #EFF6FF;
                color: #3B82F6;
            }

            &.orange {
                background: #FFF7ED;
                color: #F59E0B;
            }

            &.purple {
                background: #F5F3FF;
                color: #8B5CF6;
            }

            &.closable .tag-close {
                background: none;
                border: none;
                cursor: pointer;
                font-size: 14px;
                color: inherit;
                padding: 0;
                margin-left: 2px;

                &:hover {
                    opacity: 0.7;
                }
            }
        }

        .tag-input {
            width: 80px;
            padding: 4px 8px;
            border: 1px solid #E5E7EB;
            border-radius: 16px;
            font-size: 13px;

            &:focus {
                outline: none;
                border-color: #4E8AF4;
            }
        }

        .add-tag-btn {
            padding: 4px 12px;
            border: 1px dashed #E5E7EB;
            border-radius: 16px;
            background: none;
            cursor: pointer;
            font-size: 13px;
            color: #9CA3AF;

            &:hover {
                border-color: #4E8AF4;
                color: #4E8AF4;
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
            font-size: 14px;

            &.primary {
                background: #4E8AF4;
                color: #fff;
                border-color: #4E8AF4;

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
        color: #4E8AF4;
        white-space: nowrap;
    }

    &::before,
    &::after {
        content: '';
        flex: 1;
        height: 1px;
        background: #E5E7EB;
    }

    &:first-of-type {
        margin-top: 0;
    }
}

// 计划编辑弹窗样式
.plan-modal {
    width: 500px;
}

.plan-edit-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 16px;
}

.plan-edit-item {
    display: flex;
    align-items: center;
    gap: 8px;

    .plan-index {
        font-size: 14px;
        color: #6B7280;
        min-width: 20px;
    }

    input {
        flex: 1;
        padding: 10px 12px;
        border: 1px solid #E5E7EB;
        border-radius: 8px;
        font-size: 14px;
        
        &:focus {
            outline: none;
            border-color: #4E8AF4;
        }
    }

    .remove-plan-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: #9CA3AF;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        
        &:hover:not(:disabled) {
            color: #EF4444;
        }
        
        &:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }
    }
}

.add-plan-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 10px;
    border: 1px dashed #E5E7EB;
    border-radius: 8px;
    background: none;
    cursor: pointer;
    font-size: 14px;
    color: #9CA3AF;
    transition: all 0.2s ease;
    
    &:hover {
        border-color: #4E8AF4;
        color: #4E8AF4;
    }
}
</style>
