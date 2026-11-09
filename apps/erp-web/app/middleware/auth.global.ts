import { clearAdminSession, getToken } from '~/utils/auth'
import { retrieveAdminProfile } from '~/composables/api/useAdminApi'
import { retrieveSalespersonList } from '~/composables/api/useSalespersonApi'
import { ADMIN_ROLE } from '~~/shared/enums'
import {
    canAccessConfigurationPath,
    canFinanceAccessInventoryPath,
    canAccessInventory,
    canAccessPurchaseSupplier,
    canManageApprovalFlow,
    canAccessSimulatorManagement,
    canSellerAccessInventoryPath,
    canWarehouseKeeperAccessConfigurationPath,
} from '~~/shared/utils/adminPermission'

const resolvePageTitle = (path: string, type?: string) => {
    if (path.startsWith('/configuration/configurationList')) {
        const configType = type || new URLSearchParams(path.split('?')[1]).get('type')
        if (configType === 'article') return '文章管理'
        if (configType === 'product') return '商品管理'
        if (configType === 'picture') return '图库管理'
        if (configType === 'other') return '其他配置项'
        return '配置列表'
    }

    if (path.startsWith('/configuration/home/dashboard')) return '数据看板'
    if (path.startsWith('/configuration/home')) return '工作台'
    if (path.startsWith('/configuration/sales/dashboard/news')) return '最新消息'
    if (path.startsWith('/configuration/sales/dashboard')) return '仪表盘'
    if (path.startsWith('/configuration/sales/bulletin')) return '公告栏'
    if (path.startsWith('/configuration/sales/customer')) return '客户管理'
    if (path.startsWith('/configuration/approval/initiate')) return '发起审批'
    if (path.startsWith('/configuration/approval/settings')) return '审批权限'
    if (path.startsWith('/configuration/approval/order')) return '订单审批'
    if (path.startsWith('/configuration/approval/receipt')) return '回款审批'
    if (path.startsWith('/configuration/approval/borrow')) return '借用审核'
    if (path.startsWith('/configuration/approval')) return '审批中心'
    if (path.startsWith('/configuration/sales/sale')) return '销售管理'
    if (path.startsWith('/configuration/sales/order')) return '订单记录'
    if (path.startsWith('/configuration/sales/logs')) return '项目日志'
    if (path.startsWith('/configuration/user')) return '用户管理'
    if (path.startsWith('/configuration/message')) return '留言管理'
    if (path.startsWith('/configuration/feedback')) return '意见箱'
    if (path.startsWith('/configuration/mcp/authorize')) return 'MCP 授权'
    if (path.startsWith('/configuration/mcp')) return 'MCP 管理'
    if (path.startsWith('/configuration')) return '配置中心'
    return ''
}

export default defineNuxtRouteMiddleware(async (to) => {
    const token = getToken()
    const tokenError = useState<boolean>('token_error', () => false)
    const salespersonId = useState<string | null>('salesperson_id', () => null)
    const salespersonUsername = useState<string | null>('salesperson_username', () => null)
    const lastToken = useState<string | null>('auth_token', () => null)
    const profileSyncedAt = useState<number>('admin_profile_synced_at', () => 0)
    const adminInfo = useState<any>('admin_info', () => ({}))
    const salespersonCache = useState<any>('salesperson_self_cache', () => null)

    if (to.path.startsWith('/configuration')) {
        if (import.meta.client) {
            const pageTitle = resolvePageTitle(to.fullPath, String(to.query?.type || ''))
            if (pageTitle) {
                useHead({ title: pageTitle })
            }
        }
        if (!token) {
            clearAdminSession()
            return navigateTo('/admin?redirect=' + encodeURIComponent(to.fullPath))
        } else {
            // // 使用 useState 在应用运行时存储用户信息
            // const adminInfo = useState<any>('admin_info', () => ({}))

            // // 如果已有用户信息，不再重复解析
            // if (!adminInfo.value.username) {
            //     // 解析 Token 并存入 useState，防止 localStorage 篡改
            if (token !== lastToken.value) {
                try {
                    const base64Url = token.split('.')[1]
                    if (!base64Url) {
                        throw new Error('Invalid token format')
                    }

                    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/')
    
                    const jsonPayload = decodeURIComponent(
                        window
                            .atob(base64)
                            .split('')
                            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                            .join('')
                    )
                    const payload = JSON.parse(jsonPayload)

                    adminInfo.value = {
                        username: payload.username,
                        nickname: payload.nickname,
                        role: payload.role,
                        departmentId: null,
                        departmentName: null,
                        canManageApprovalFlow: false,
                        canAuditSalesOrder: Boolean(payload.canAuditSalesOrder),
                        canAuditSalesReceipt: Boolean(payload.canAuditSalesReceipt),
                        canAuditBorrowRequest: Boolean(payload.canAuditBorrowRequest),
                    }
                    lastToken.value = token
                    profileSyncedAt.value = 0
                    salespersonId.value = null
                    salespersonUsername.value = null
                    salespersonCache.value = null
                } catch (e) {
                    // Token 解析失败，可能是非法 Token
                    console.error('Token parse failed:', e)
                    clearAdminSession()
                    return navigateTo('/admin?redirect=' + encodeURIComponent(to.fullPath))
                }
            }

            if (
                Date.now() - profileSyncedAt.value > 15000
            ) {
                try {
                    const profileRes = await retrieveAdminProfile()()
                    if (getToken() !== token) return
                    const user = profileRes.data.user
                    adminInfo.value = {
                        ...adminInfo.value,
                        username: user.username,
                        nickname: user.nickname,
                        role: user.role,
                        departmentId: user.departmentId,
                        departmentName: user.departmentName,
                        canManageApprovalFlow: user.canManageApprovalFlow,
                        canAuditSalesOrder: user.canAuditSalesOrder,
                        canAuditSalesReceipt: user.canAuditSalesReceipt,
                        canAuditBorrowRequest: user.canAuditBorrowRequest,
                    }
                    profileSyncedAt.value = Date.now()
                } catch (e) {
                    if ((e as { statusCode?: number }).statusCode === 401) {
                        if (getToken() === token) clearAdminSession()
                        if (!getToken()) return navigateTo('/admin?redirect=' + encodeURIComponent(to.fullPath))
                        return
                    }
                    console.error('Fetch admin profile failed:', e)
                    adminInfo.value = {
                        ...adminInfo.value,
                        canManageApprovalFlow: false,
                    }
                }
            }

            const role = Number(adminInfo.value.role)

            const permissionPath = role === ADMIN_ROLE.CONTENT_MANAGER
                ? to.fullPath
                : to.path

            if (!canAccessConfigurationPath(role, permissionPath)) {
                return navigateTo('/configuration')
            }

            if (
                to.path.startsWith('/configuration/purchase/supplier')
                && !canAccessPurchaseSupplier(role)
            ) {
                return role === ADMIN_ROLE.PRODUCTION_MANAGER
                    ? navigateTo('/configuration/purchase/order')
                    : navigateTo('/configuration')
            }

            if (
                to.path.startsWith('/configuration/approval/settings') &&
                !canManageApprovalFlow(
                    role,
                    adminInfo.value?.canManageApprovalFlow,
                )
            ) {
                return navigateTo('/configuration/approval')
            }

            // 若登录用户为销售，获取其 salesperson._id
            if (to.path.startsWith('/configuration/mcp/authorize')) {
                return
            }

            if (
                to.path === '/configuration/mcp' ||
                to.path.startsWith('/configuration/mcp/')
            ) {
                return
            }

            if (role === ADMIN_ROLE.SELLER && adminInfo.value.username) {
                if (salespersonUsername.value !== adminInfo.value.username) {
                    salespersonId.value = null
                    salespersonUsername.value = adminInfo.value.username
                    salespersonCache.value = null
                }

                if (!salespersonId.value) {
                try {
                    const res: any = await retrieveSalespersonList()()
                    const list = res?.data?.salesperson ?? []
                    const match =
                        list.find((sp: any) =>
                            sp.name === adminInfo.value.username ||
                            sp.nameCn === adminInfo.value.username
                        )
                    if (match._id) salespersonId.value = match._id
                } catch (e) {
                    console.error('Fetch salespersonId failed:', e)
                }
                }
            } else {
                salespersonId.value = null
                salespersonUsername.value = null
                salespersonCache.value = null
            }

            if (
                [
                    '/configuration/approval/order',
                    '/configuration/approval/receipt',
                    '/configuration/approval/borrow',
                ].some((path) => to.path === path || to.path.startsWith(`${path}/`))
            ) {
                return navigateTo('/configuration/approval')
            }

            // 在解析完 token 后检查销售仪表盘权限
            if (to.path.startsWith('/configuration/sales/dashboard')) {
                console.log('Redirecting sales dashboard check')
                if (role === ADMIN_ROLE.SELLER) {
                    return navigateTo('/configuration/sales/bulletin')
                }
            }

            if (to.path.startsWith('/configuration/sales/bulletin')) {
                if (role !== ADMIN_ROLE.SELLER) {
                    return navigateTo('/configuration/sales/dashboard')
                }
            }

            if (to.path.startsWith('/configuration/simulator')) {
                if (!canAccessSimulatorManagement(role)) {
                    return navigateTo('/configuration')
                }
            }

            if (role === ADMIN_ROLE.WAREHOUSE_KEEPER) {
                if (!canWarehouseKeeperAccessConfigurationPath(to.path)) {
                    return navigateTo('/configuration/inventory/basic-data/unit')
                }
            }

            if (to.path.startsWith('/configuration/inventory')) {
                if (!canAccessInventory(role)) {
                    return navigateTo('/configuration')
                }
                if (
                    role === ADMIN_ROLE.SELLER
                    && !canSellerAccessInventoryPath(to.path)
                ) {
                    return navigateTo('/configuration/inventory/realtime')
                }
                if (
                    role === ADMIN_ROLE.FINANCE
                    && !canFinanceAccessInventoryPath(to.path)
                ) {
                    return navigateTo('/configuration/inventory/realtime')
                }
            }

            if (to.path.startsWith('/configuration/sales/order/receipt')) {
                return navigateTo('/configuration/approval')
            }
        }
    }

    if (to.path === '/admin' && token && !tokenError.value) {
        try {
            await retrieveAdminProfile()()
            if (getToken() !== token) return
        } catch (e) {
            if ((e as { statusCode?: number }).statusCode === 401) {
                if (getToken() === token) clearAdminSession()
                return
            }
        }
        const redirect = String(to.query.redirect || '')
        if (redirect.startsWith('/') && !redirect.startsWith('//')) {
            return navigateTo(redirect)
        }
        return navigateTo('/configuration')
    }
})
