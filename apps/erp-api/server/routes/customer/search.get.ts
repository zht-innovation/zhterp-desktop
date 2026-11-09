import { useCustomerModel } from '~~/server/models/customer.model'
import { useAdminModel } from '~~/server/models/admin.model'
import { useSalespersonModel } from '~~/server/models/salesperson.model'

const resolveSalespersonId = async (auth: any) => {
    if (!auth?.username) return null
    const adminModel = useAdminModel()
    const salespersonModel = useSalespersonModel()
    const admin = await adminModel.login(auth.username)
    const adminId = admin?._id

    let salesperson = null
    if (adminId) {
        salesperson = await salespersonModel.salesperson
            .findOne({ linkAdminId: adminId, _isFakeDel: { $ne: true } })
            .select('_id')
    }

    if (!salesperson) {
        salesperson = await salespersonModel.salesperson
            .findOne({
                _isFakeDel: { $ne: true },
                $or: [{ name: auth.username }, { nameCn: auth.username }],
            })
            .select('_id')
    }

    return salesperson?._id?.toString() || null
}

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const keyword = (query.keyword as string || '').trim()
    const page = parseInt(query.page as string) || 1
    const limit = parseInt(query.limit as string) || 20
    const assignedTo = typeof query.assignedTo === 'string' ? query.assignedTo.trim() : ''
    const customerLevel = typeof query.customerLevel === 'string' ? query.customerLevel.trim() : ''
    const auth = event.context.auth
    const role = Number(auth?.role)
    if (!auth || Number.isNaN(role)) {
        setResponseStatus(event, 401)
        return {
            code: 401,
            msg: '权限不足',
            data: null
        }
    }

    if (!keyword) {
        return {
            code: 400,
            msg: '搜索关键字不能为空',
            data: null
        }
    }

    try {
        const customerModel = useCustomerModel()
        let salespersonId: string | null = null
        if (role === 3) {
            salespersonId = await resolveSalespersonId(auth)
            if (!salespersonId) {
                setResponseStatus(event, 403)
                return {
                    code: 403,
                    msg: '权限不足',
                    data: null
                }
            }
        }

        const result = await customerModel.search(keyword, page, limit, {
            role,
            salespersonId,
            assignedTo: assignedTo || null,
            customerLevel: customerLevel || null
        })

        return {
            code: 200,
            msg: 'success',
            data: {
                customers: result.customers,
                pagination: {
                    page,
                    limit,
                    total: result.total,
                    hasMore: result.hasMore
                },
                keyword // 返回关键字供前端高亮使用
            }
        }
    } catch (err: any) {
        console.error('搜索客户失败:', err)
        return {
            code: 500,
            msg: err.message || '搜索客户失败',
            data: null
        }
    }
})
