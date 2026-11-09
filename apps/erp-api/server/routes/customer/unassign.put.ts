import { useCustomerModel } from '~~/server/models/customer.model'
import { useCustomerTermModel } from '~~/server/models/customerTerm.model'
import { useSalespersonModel } from '~~/server/models/salesperson.model'
import { useNewsModel } from '~~/server/models/news.model'
import { logger } from '~~/server/utils/logger'

export default defineEventHandler(async (event) => {
    try {
        const { customerId } = await readBody(event)

        if (!customerId) {
            setResponseStatus(event, 400)
            return {
                code: CODE.SERVER_ERROR,
                msg: '参数不完整',
            }
        }

        const customerModel = useCustomerModel()
        const salespersonModel = useSalespersonModel()
        const termModel = useCustomerTermModel()
        const newsModel = useNewsModel()
        const auth = event.context.auth
        const actorName = auth?.nickname || auth?.username || '管理员'

        let customer: any = await customerModel.customer
            .findById(customerId)
            .select('_assignSalespersonId _isAssigned _isFakeDel name expireDate')

        if (!customer) {
            setResponseStatus(event, 404)
            return {
                code: CODE.SERVER_ERROR,
                msg: '客户不存在',
            }
        }

        if (customer._isFakeDel) {
            setResponseStatus(event, 400)
            return {
                code: CODE.SERVER_ERROR,
                msg: '客户已被删除',
            }
        }

        if (!customer._isAssigned) {
            setResponseStatus(event, 400)
            return {
                code: CODE.SERVER_ERROR,
                msg: '客户未分配销售',
            }
        }

        let salespersonId = ''
        let salesperson: any = null

        customer = await customerModel.customer
            .findById(customerId)
            .select('_assignSalespersonId _isAssigned _isFakeDel name expireDate')
        if (!customer || customer._isFakeDel || !customer._isAssigned) {
            throw new Error('客户分配状态已变化')
        }

        salespersonId = customer._assignSalespersonId?.toString() || ''
        if (salespersonId) {
            salesperson = await salespersonModel.salesperson
                .findById(salespersonId)
                .select('name nameCn')
            await salespersonModel.removeAContact(salespersonId)
        }

        await customerModel.customer.findByIdAndUpdate(
            customerId,
            {
                _isAssigned: false,
                _assignSalespersonId: null,
                _isApplying: false,
                expireDate: null,
            }
        )

        await termModel.addManual({
            customerId,
            oldExpire: customer.expireDate || null,
            newExpire: null,
            oldSalesId: salespersonId || null,
            oldSalesName: salesperson?.nameCn || salesperson?.name || '',
            newSalesId: null,
            newSalesName: '',
            createdBy: {
                name: actorName,
                role: Number(auth?.role ?? 2),
            },
        })

        if (salespersonId) {
            try {
                await newsModel.add({
                    scope: 'personal',
                    type: 'customer_unassigned',
                    actorName,
                    recipientSalespersonId: salespersonId,
                    salespersonId,
                    salespersonName: salesperson?.nameCn || salesperson?.name || '',
                    customerId,
                    customerName: customer.name || '',
                    eventKey: `customer_unassigned:${customerId}:${salespersonId}`,
                })
            } catch (newsErr) {
                logger.error('Add customer unassigned news failed', newsErr as Error)
            }
        }

        logger.info(`Customer ${customer.name}(${customerId}) unassigned to public pool`)

        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
        }
    } catch (err: any) {
        logger.error('Unassign customer error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
        }
    }
})
