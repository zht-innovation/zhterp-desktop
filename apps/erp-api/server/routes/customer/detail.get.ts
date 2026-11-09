import { useCustomerModel } from '~~/server/models/customer.model'
import { useSalesOrderModel } from '~~/server/models/salesOrder.model'
import { useSalespersonModel } from '~~/server/models/salesperson.model'
import { useAdminModel } from '~~/server/models/admin.model'
import { logger } from '~~/server/utils/logger'

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
    try {
        const auth = event.context.auth
        const query = getQuery(event)
        const id = typeof query.id === 'string' ? query.id : ''

        if (!id) {
            setResponseStatus(event, 400)
            return {
                code: CODE.SERVER_ERROR,
                msg: '缺少客户ID',
            }
        }

        const customerModel = useCustomerModel()
        const customer = await customerModel.customer.findById(id).lean()

        if (!customer || customer?._isFakeDel) {
            setResponseStatus(event, 404)
            return {
                code: CODE.SERVER_ERROR,
                msg: '客户不存在',
            }
        }

        const isSalesRole = Number(auth?.role) === 3
        if (isSalesRole) {
            const salespersonId = await resolveSalespersonId(auth)
            const assignedId = customer?._assignSalespersonId?.toString()
            if (customer?._isAssigned && assignedId && assignedId !== salespersonId) {
                setResponseStatus(event, 403)
                return {
                    code: CODE.SERVER_ERROR,
                    msg: '权限不足',
                }
            }
        }

        const canShowDealStats = !isSalesRole || Boolean(customer?._isAssigned)
        const statsMap = canShowDealStats
            ? await useSalesOrderModel().getCustomerDealStats([customer._id])
            : new Map()
        const stats = statsMap.get(customer._id?.toString?.() || '') || {
            dealOrderCount: 0,
            dealTotalAmount: 0,
        }
        const dealOrderCount = Number(stats.dealOrderCount || 0)
        const dealTotalAmount = Number(stats.dealTotalAmount || 0)

        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                customer: {
                    ...customer,
                    orderCount: dealOrderCount,
                    dealOrderCount,
                    dealTotalAmount,
                    totalDealAmount: dealTotalAmount,
                },
            },
        }
    } catch (err: any) {
        logger.error('Retrieve customer detail error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
        }
    }
})
