import mongoose from 'mongoose'

import { useCustomerModel } from '~~/server/models/customer.model'
import { useNewsModel } from '~~/server/models/news.model'
import { useSalespersonModel } from '~~/server/models/salesperson.model'
import { useAdminModel } from '~~/server/models/admin.model'
import { logger } from '~~/server/utils/logger'

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

const getMaintenanceDueWindow = () => {
    const todayStart = startOfDay(new Date())
    const targetStart = new Date(todayStart)
    targetStart.setDate(todayStart.getDate())
    const targetEnd = new Date(targetStart)
    targetEnd.setDate(targetStart.getDate() + 7)
    return { targetStart, targetEnd }
}

const ensureMaintenanceDueNews = async (salespersonId: string | null, role: number) => {
    try {
        const customerModel = useCustomerModel()
        const newsModel = useNewsModel()

        const { targetStart, targetEnd } = getMaintenanceDueWindow()
        console.log('Maintenance due window:', targetStart, targetEnd)

        const match: Record<string, any> = {
            _isFakeDel: { $ne: true },
            _isAssigned: true,
            _assignSalespersonId: { $ne: null },
            expireDate: {
                $gte: targetStart,
                $lt: targetEnd,
            },
        }

        if (Number(role) === 3 && salespersonId) {
            match._assignSalespersonId = new mongoose.Types.ObjectId(salespersonId)
        }

        const customers = await customerModel.customer.aggregate([
            { $match: match },
            {
                $lookup: {
                    from: 'salespeople',
                    localField: '_assignSalespersonId',
                    foreignField: '_id',
                    as: 'salespersonInfo',
                },
            },
            {
                $unwind: {
                    path: '$salespersonInfo',
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $project: {
                    _id: 1,
                    expireDate: 1,
                    customerName: '$name',
                    salespersonId: '$_assignSalespersonId',
                    salespersonName: {
                        $ifNull: ['$salespersonInfo.nameCn', '$salespersonInfo.name'],
                    },
                },
            },
        ])

        if (!customers.length) return

        for (const customer of customers) {
            const expireDate = customer.expireDate ? new Date(customer.expireDate) : null
            const eventKey = `maintenance_due:${customer._id}:${expireDate ? expireDate.toISOString().slice(0, 10) : 'unknown'}`
            await newsModel.add({
                scope: 'personal',
                type: 'maintenance_due',
                recipientSalespersonId: customer.salespersonId,
                customerId: customer._id,
                customerName: customer.customerName || '',
                salespersonId: customer.salespersonId,
                salespersonName: customer.salespersonName || '',
                expireDate,
                eventKey,
            })
        }
    } catch (err) {
        logger.error('Ensure maintenance due news failed', err as Error)
    }
}

export default defineEventHandler(async (event) => {
    try {
        const auth = event.context.auth
        let salespersonId: string | null = null

        if (auth.role == 3) {
            const salespersonModel = useSalespersonModel()
            const adminModel = useAdminModel()
            const admin = await adminModel.login(auth.username)
            const adminId = admin?._id

            let salesperson = null
            if (adminId) {
                salesperson = await salespersonModel.salesperson
                    .findOne({
                        linkAdminId: adminId,
                        _isFakeDel: { $ne: true },
                    })
                    .select('_id')
            }

            if (!salesperson) {
                salesperson = await salespersonModel.salesperson
                    .findOne({
                        _isFakeDel: { $ne: true },
                        $or: [
                            { name: auth.username },
                            { nameCn: auth.username },
                        ],
                    })
                    .select('_id')
            }

            if (!salesperson) {
                logger.warn(`Salesperson not found for username: ${auth.username}`)
                setResponseStatus(event, 404)
                return {
                    code: CODE.SERVER_ERROR,
                    msg: '销售人员信息不存在',
                }
            }

            salespersonId = salesperson._id.toString()
        }

        await ensureMaintenanceDueNews(salespersonId, auth.role)

        const newsModel = useNewsModel()
        const news = await newsModel.retrieveNewsList(salespersonId, auth.role)

        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                news,
            },
        }
    } catch (err: any) {
        logger.error('Retrieve news error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
        }
    }
})
