<template>
    <div class="configuration">
        <ShowRole />
        <h1>中航通 ERP 工作台</h1>
        <div class="bar">
            <!-- <ConfigItem1></ConfigItem1> -->
            <template v-for="{ key, value } in configurationEntries" :key="key">
                <div class="item" v-if="canShowConfigItem(key, value)" :class="{ 'item-disabled': !canAccessConfigItem(key, value) }">
                    {{ value.title }}
                    <div class="btn nose" @click="handleConfigClick(key, value)">进入编辑</div>
                </div>
            </template>
        </div>
        <div class="flex" style="margin-top: 5rem;gap: 5rem;">
            <div @click="version.pop = true" class="versionbtn hoverAuto">
                <Icon name="famicons:newspaper-sharp" class="icon-news" /> 版本说明
            </div>
        </div>
        <popup-any v-model="version.pop" escbtn="1" nomaskback="">
            <div class="flex" style="gap:13rem">
                <h2>系统版本新增内容</h2>
                <content-switch v-if="isDev" v-model="lstore.UI_gen2" True="新版本UI（推荐）" False="旧版本" color="#FF7F7F"></content-switch>
            </div>
            <br class="nose">
            <div style="width: 46rem;display: flex;max-height: 30rem;overflow: hidden;">
                <div style="padding-right: .4rem;overflow: auto;" class="scrollBar">
                    <div :style="{
                        fontSize: '1.3rem',
                        padding: '.4rem 1rem',
                        color: version.tab == idx ? '#ff5b5b' : 'unset',
                        backgroundColor: version.tab == idx ? '#ffe3e3' : 'unset',
                    }" class="pointer nose hoverAuto" @click="version.tab = idx" v-for="i, idx in systemUpdates" :key="i.version">
                        <div>v{{ i.version }}</div>
                        <div style="font-size: 1rem;opacity: .7;">{{ i.date }}</div>
                    </div>
                </div>
                <div style="font-size: 1.6rem;color: #f04141;flex: 1;overflow: auto;margin-left: 1rem;white-space: pre-line;"
                    class="scrollBar">
                    <h3>{{ systemUpdates[version.tab]?.title }}</h3>
                    <ul>
                        <li v-for="item in systemUpdates[version.tab]?.items" :key="item">
                            {{ item }}
                        </li>
                    </ul>
                </div>
            </div>
        </popup-any>
    </div>
</template>

<script setup lang="ts">
import OPTION_CONFIG from '~/config/OPTION_CONFIG'
import { systemUpdates } from '~/config/systemUpdates'
import ShowRole from '~/components/configuration/ShowRole.vue'
import { ADMIN_ROLE } from '~~/shared/enums'
import {
    canAccessAdminFeature,
    canAccessErp,
    canAccessFeedback,
    canAccessSalesModule,
    getInventoryModuleLandingPath,
    isElectronicsWarehouseKeeper,
} from '~~/shared/utils/adminPermission'
import { FEATURE_FLAGS } from '~/config/features'
import type { LocalStorageConfigInfo } from '~/types/configuration'
import { mainSitePage } from '~/utils/mainSitePage'

definePageMeta({
    layout: 'admin'
})

const lstore = shallowRef<LocalStorageConfigInfo>({
    version: '',
    UI_gen2: false,
});
const isDev = import.meta.env.DEV
const { mainSiteOrigin } = useRuntimeConfig().public

const adminInfo = useState<any>('admin_info', () => ({}))
const role = computed(() => Number(adminInfo.value?.role))

const ERP_CONFIG_KEYS = [
    'sales',
    'approval',
    'inventory',
    'purchase',
    'finance',
    'notification',
] as const
const ERP_CONFIG_KEY_SET = new Set<string>(ERP_CONFIG_KEYS)
const ERP_FEATURE_MAP: Record<string, boolean> = {
    inventory: FEATURE_FLAGS.INVENTORY_BASIC_DATA,
    purchase: FEATURE_FLAGS.PURCHASE_MODULE,
    sales: FEATURE_FLAGS.SALES_MODULE,
    finance: FEATURE_FLAGS.FINANCE_MODULE,
    notification: FEATURE_FLAGS.NOTIFICATION_MODULE,
    approval: FEATURE_FLAGS.APPROVAL_MODULE,
}

const configurationEntries = computed(() => {
    const entries: Array<{ key: string; value: any }> = []
    let hasErpEntry = false

    for (const [key, value] of Object.entries(OPTION_CONFIG)) {
        if (ERP_CONFIG_KEY_SET.has(key)) {
            if (!hasErpEntry) {
                entries.push({ key: 'erp', value: { title: 'ERP系统' } })
                hasErpEntry = true
            }
            continue
        }

        entries.push({ key, value })
    }

    return entries
})

const getErpCandidateKeys = () => {
    const roleNumber = Number(role.value)
    if (isElectronicsWarehouseKeeper(roleNumber)) {
        return ['inventory', 'purchase']
    }
    let preferredKeys: string[] = ['sales', 'inventory', 'purchase', 'finance', 'approval', 'notification']

    if (roleNumber === ADMIN_ROLE.OPERATOR) {
        preferredKeys = ['approval', 'inventory', 'notification']
    } else if (roleNumber === ADMIN_ROLE.WAREHOUSE_KEEPER) {
        preferredKeys = ['inventory', 'notification']
    } else if (roleNumber === ADMIN_ROLE.PURCHASER) {
        preferredKeys = ['purchase', 'notification']
    } else if (roleNumber === ADMIN_ROLE.FINANCE) {
        preferredKeys = ['finance', 'notification']
    } else if (roleNumber === ADMIN_ROLE.FINANCE_MANAGER) {
        preferredKeys = ['finance', 'inventory', 'purchase', 'notification']
    } else if (roleNumber === ADMIN_ROLE.SELLER) {
        preferredKeys = ['sales', 'notification']
    } else if (roleNumber === ADMIN_ROLE.ORDINARY_USER) {
        preferredKeys = ['approval', 'notification']
    }

    return [
        ...preferredKeys,
        ...ERP_CONFIG_KEYS.filter((key) => !preferredKeys.includes(key)),
    ]
}

const canShowConfigItem = (key: string | number, value: any) => {
    if (isElectronicsWarehouseKeeper(role.value)) {
        if (key === 'erp') return ERP_FEATURE_MAP.inventory || ERP_FEATURE_MAP.purchase
        if (key !== 'inventory' && key !== 'purchase') return false
    }
    if (key === "feedback") return canAccessFeedback(role.value);
    if (role.value === ADMIN_ROLE.CONTENT_MANAGER) {
        return key === 'article' || key === 'product'
    }
    if (key === 'mcp') {
        return role.value === ADMIN_ROLE.OPERATOR
    }

    // 功能开关检查：根据 FEATURE_FLAGS 控制模块显示
    if (key === 'erp') {
        return ERP_CONFIG_KEYS.some((moduleKey) => ERP_FEATURE_MAP[moduleKey])
    }

    // 如果功能开关关闭，则不显示
    if (key in ERP_FEATURE_MAP && !ERP_FEATURE_MAP[key]) {
        return false
    }

    return true
}

const canAccessConfigItem = (key: string | number, value: any) => {
    const currentRole = role.value
    if (isElectronicsWarehouseKeeper(currentRole) && key !== 'erp') {
        return key === 'inventory' || key === 'purchase'
    }
    if (key === "feedback") return canAccessFeedback(currentRole);

    if (currentRole === ADMIN_ROLE.CONTENT_MANAGER) {
        return key === 'article' || key === 'product'
    }

    if (key === 'mcp') {
        return currentRole === ADMIN_ROLE.OPERATOR
    }

    if (key === 'erp') {
        if (!canAccessErp(currentRole)) return false

        return getErpCandidateKeys().some((moduleKey) => {
            const moduleConfig = OPTION_CONFIG[moduleKey]
            return canShowConfigItem(moduleKey, moduleConfig)
                && canAccessConfigItem(moduleKey, moduleConfig)
        })
    }

    if (currentRole === ADMIN_ROLE.OPERATOR && ERP_CONFIG_KEY_SET.has(String(key))) {
        return ['approval', 'inventory', 'notification'].includes(String(key))
    }

    if (currentRole === ADMIN_ROLE.ORDINARY_USER) {
        return key === 'purchase' || key === 'approval' || key === 'notification'
    }

    if (currentRole === ADMIN_ROLE.DEVELOPER) {
        return key === 'feedback' || key === 'simulator'
    }

    if (key === 'sales' && !canAccessSalesModule(currentRole)) {
        return false
    }

    // 库管只能看到库存模块、意见箱和通知
    if (currentRole === ADMIN_ROLE.WAREHOUSE_KEEPER) {
        return key === 'inventory' || key === 'purchase' || key === 'feedback' || key === 'notification'
    }

    // 采购角色只能看到采购模块、意见箱和通知
    if (currentRole === ADMIN_ROLE.PURCHASER) {
        return key === 'purchase' || key === 'feedback' || key === 'notification'
    }

    // 财务经理拥有采购和财务的合并入口
    if (currentRole === ADMIN_ROLE.FINANCE_MANAGER) {
        return key === 'inventory' || key === 'purchase' || key === 'finance' || key === 'feedback' || key === 'notification'
    }

    if (currentRole === ADMIN_ROLE.PRODUCTION_MANAGER) {
        return key === 'inventory'
            || key === 'purchase'
            || key === 'approval'
            || key === 'feedback'
            || key === 'notification'
    }

    // 销售角色不能看到财务模块；仓储模块对销售仅开放实时库存，具体菜单由仓储侧边栏判定
    if (currentRole === ADMIN_ROLE.SELLER) {
        if (key === 'finance') return false
        if (key === 'inventory') return true
    }

    if (key === 'purchase') {
        return canAccessErp(currentRole)
    }

    return canAccessAdminFeature(role.value, value.permission, value.allowRoles)
}

const handleConfigClick = (key: string | number, value: any) => {
    if (!canAccessConfigItem(key, value)) {
        ElMessage.warning('您没有该模块的访问权限，请联系管理员开通')
        return
    }
    const path = resolveConfigPath(key, value)
    if (key === 'feedback' || key === 'message' || key === 'user') {
        return navigateTo(mainSitePage(path, mainSiteOrigin), { external: true })
    }
    return navigateTo(path)
}

const resolveConfigPath = (key: string | number, value: any) => {
    if (key === 'erp') {
        if (role.value === ADMIN_ROLE.OPERATOR) {
            return '/configuration/home'
        }
        const moduleKey = getErpCandidateKeys().find((candidateKey) => {
            const moduleConfig = OPTION_CONFIG[candidateKey]
            return canShowConfigItem(candidateKey, moduleConfig)
                && canAccessConfigItem(candidateKey, moduleConfig)
        })

        return moduleKey
            ? resolveConfigPath(moduleKey, OPTION_CONFIG[moduleKey])
            : '/configuration'
    }
    if (key === 'sales' && Boolean(adminInfo.value?.canAuditSalesOrder) && role.value > 3) {
        return '/configuration/sales/order'
    }
    if (key === 'sales' && Boolean(adminInfo.value?.canAuditSalesReceipt) && role.value > 3) {
        return '/configuration/sales/order/receipt'
    }
    if (key === 'inventory') {
        return `${getInventoryModuleLandingPath(role.value)}?type=inventory`
    }
    if (key === 'purchase' && isElectronicsWarehouseKeeper(role.value)) {
        return '/configuration/purchase/order?type=purchase'
    }
    return `${value.path}?type=${key}`
}

const version = reactive({
    pop: false,
    tab: 0,
})

onMounted(() => {
    lstore.value = useLocalStorage('config_info', {
        version: '',
        UI_gen2: false,
    })
})
</script>

<style scoped>
.configuration {
    width: 100%;
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    background-color: #F2F2F2;
    background-color: #fff;
    overflow: auto;
}

h1 {
    font-size: 50px;
    color: #f39393;
    border-bottom: dashed 5px #404040;
    margin-top: 140px;
}

.bar {
    margin-top: 64px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 30px;
}

.item {
    height: 110px;
    width: 400px;
    color: #ff5b5b;
    color: #000;
    background-color: #fff;
    border: solid 4px #000;
    border: solid 4px #ff8282;
    border-radius: 70px;
    border-radius: 20px 70px 70px 20px;
    /* padding-left: 10px; */

    font-size: 32px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: space-around;
}

.item:hover {
    transition: .2s;
    transform: scale(1.03);
}

.item-disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.item-disabled .btn {
    background-color: #e0e0e0;
    color: #999;
    cursor: not-allowed;
}

.btn {
    font-size: 24px;
    font-weight: bold;
    padding: 12px 30px;
    background-color: #ffe0e0;
    background-color: #ffe3e3;
    color: #fff;
    color: #ff5b5b;
    border-radius: 60px;
    cursor: pointer;
    transition: .2s;
}

.btn:hover {
    background-color: #ffd5d5;
}

.versionbtn {
    display: flex;
    padding: 14px 20px;
    background-color: #ffffff;
    color: #ff5b5b;
    font-size: 24px;
    border-radius: 50rem;
    border: solid 3px #ff8282;

}
.icon-news {
    align-self: center;
    margin-right: 7px;
}
</style>
