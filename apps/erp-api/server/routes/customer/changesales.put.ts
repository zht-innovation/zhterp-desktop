import { useCustomerModel } from "~~/server/models/customer.model"
import { useCustomerTermModel } from "~~/server/models/customerTerm.model"
import { useSalespersonModel } from "~~/server/models/salesperson.model"
import { useNewsModel } from "~~/server/models/news.model"
import { logger } from "~~/server/utils/logger"

export default defineEventHandler(async (event) => {
    try {
        const { customerId, newSalespersonId, appDays } = await readBody(event)

        if (!customerId || !newSalespersonId || !appDays) {
            setResponseStatus(event, 400)
            return {
                code: CODE.SERVER_ERROR,
                msg: '参数不完整'
            }
        }

        const customerModel = useCustomerModel()
        const salespersonModel = useSalespersonModel()
        const termModel = useCustomerTermModel()
        const newsModel = useNewsModel()
        const auth = event.context.auth
        const actorName = auth?.nickname || auth?.username || '管理员'

        // 获取客户当前信息
        let customer: any = await customerModel.customer.findById(customerId)
            .select('_assignSalespersonId _isAssigned _isFakeDel name expireDate')
        
        if (!customer) {
            setResponseStatus(event, 404)
            return {
                code: CODE.SERVER_ERROR,
                msg: '客户不存在'
            }
        }

        if (customer._isFakeDel) {
            setResponseStatus(event, 400)
            return {
                code: CODE.SERVER_ERROR,
                msg: '客户已被删除'
            }
        }

        // 验证新销售人员存在
        let newSalesperson: any = await salespersonModel.salesperson.findById(newSalespersonId)
            .select('_isFakeDel name nameCn')
        
        if (!newSalesperson || newSalesperson._isFakeDel) {
            setResponseStatus(event, 400)
            return {
                code: CODE.SERVER_ERROR,
                msg: '销售人员不存在或已被删除'
            }
        }

        let oldSalespersonId = ''
        let oldSalespersonName = ''
        let wasAssigned = false
        let isSameSalesperson = false
        let oldExpireDate: Date | null = null
        let expireDate = new Date()

        customer = await customerModel.customer
            .findById(customerId)
            .select('_assignSalespersonId _isAssigned _isFakeDel name expireDate')
        newSalesperson = await salespersonModel.salesperson
            .findById(newSalespersonId)
            .select('_isFakeDel name nameCn')
        if (!customer || customer._isFakeDel || !newSalesperson || newSalesperson._isFakeDel) {
            throw new Error('客户或销售状态已变化')
        }

        oldSalespersonId = customer._assignSalespersonId?.toString() || ''
        wasAssigned = Boolean(customer._isAssigned)
        isSameSalesperson = Boolean(oldSalespersonId && oldSalespersonId === newSalespersonId)
        oldExpireDate = customer.expireDate ? new Date(customer.expireDate) : null

        const oldSalesperson = oldSalespersonId === newSalespersonId
            ? newSalesperson
            : oldSalespersonId
                ? await salespersonModel.salesperson
                    .findById(oldSalespersonId)
                    .select('name nameCn')
                : null
        oldSalespersonName = oldSalesperson?.nameCn || oldSalesperson?.name || ''

        if (wasAssigned && oldSalespersonId && oldSalespersonId !== newSalespersonId) {
            await salespersonModel.removeAContact(oldSalespersonId)
        }

        const today = new Date()
        expireDate = new Date(today)
        expireDate.setDate(today.getDate() + Number(appDays))

        const shouldBoostSort = !wasAssigned || !isSameSalesperson
        const updatePayload: Record<string, any> = {
            _isAssigned: true,
            _isApplying: false,
            _assignSalespersonId: newSalespersonId,
            expireDate,
        }
        if (shouldBoostSort) {
            updatePayload._addTime = new Date()
            updatePayload._assignedByAdmin = true
        }

        await customerModel.customer.findByIdAndUpdate(
            customerId,
            updatePayload,
            shouldBoostSort ? { overwriteImmutable: true } : undefined
        )

        if (!wasAssigned || (oldSalespersonId && oldSalespersonId !== newSalespersonId)) {
            await salespersonModel.addAContact(newSalespersonId)
        }

        await termModel.addManual({
            customerId,
            days: Number(appDays),
            oldExpire: oldExpireDate,
            newExpire: expireDate,
            oldSalesId: wasAssigned ? oldSalespersonId : null,
            oldSalesName: wasAssigned ? oldSalespersonName : '',
            newSalesId: newSalespersonId,
            newSalesName: newSalesperson.nameCn || newSalesperson.name || '',
            createdBy: {
                name: actorName,
                role: Number(auth?.role ?? 2),
            },
        })

        // 通知新销售：客户已分配
        if (!isSameSalesperson || !wasAssigned) {
            try {
                await newsModel.add({
                    scope: 'personal',
                    type: 'customer_assigned',
                    actorName,
                    recipientSalespersonId: newSalespersonId,
                    salespersonId: newSalespersonId,
                    salespersonName: (newSalesperson as any)?.nameCn || newSalesperson.name || '',
                    customerId,
                    customerName: customer.name || '',
                    eventKey: `customer_assigned:${customerId}:${newSalespersonId}:${expireDate.toISOString().slice(0, 10)}`,
                })
            } catch (newsErr) {
                logger.error('Add customer assigned news failed', newsErr as Error)
            }
        }

        // 修改销售后要检查是否为延长维护还是缩短维护
        if (oldExpireDate && isSameSalesperson) {
            const oldTime = oldExpireDate.getTime()
            const newTime = expireDate.getTime()
            if (newTime !== oldTime) {
                const type = newTime > oldTime ? 'maintenance_extended' : 'maintenance_shortened'
                const eventKey = `${type}:${customerId}:${expireDate.toISOString()}`
                try {
                    await newsModel.add({
                        scope: 'personal',
                        type,
                        recipientSalespersonId: newSalespersonId,
                        actorName,
                        customerId,
                        customerName: customer.name || '',
                        salespersonId: newSalespersonId,
                        salespersonName: (newSalesperson as any)?.nameCn || newSalesperson.name || '',
                        expireDate,
                        eventKey,
                    })
                } catch (newsErr) {
                    logger.error('Add maintenance update news failed', newsErr as Error)
                }
            }
        }

        logger.info(`Customer ${customer.name}(${customerId}) assigned to ${newSalesperson.name}(${newSalespersonId})`)

        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS]
        }

    } catch (err: any) {
        logger.error('Change salesperson error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }
})
