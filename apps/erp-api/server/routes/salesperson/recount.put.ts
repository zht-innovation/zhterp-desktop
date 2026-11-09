// 重新计算销售的 _customerNum 字段

import { useCustomerModel } from "~~/server/models/customer.model"
import { useSalespersonModel } from "~~/server/models/salesperson.model"
import { logger } from "~~/server/utils/logger"

export default defineEventHandler(async (event) => {
    try {
        const customerModel = useCustomerModel()
        const salespersonModel = useSalespersonModel()

        const grouped: Array<{ _id: any; count: number }> = await customerModel.customer.aggregate([
            {
                $match: {
                    _isFakeDel: { $ne: true },
                    _isAssigned: true,
                    _assignSalespersonId: { $ne: null },
                },
            },
            {
                $group: {
                    _id: '$_assignSalespersonId',
                    count: { $sum: 1 },
                },
            },
        ])

        const countMap = new Map<string, number>()
        for (const row of grouped) {
            if (!row?._id) continue
            countMap.set(row._id.toString(), row.count || 0)
        }

        const salespeople: Array<{ _id: any }> = await salespersonModel.salesperson
            .find({})
            .select('_id')
            .lean()

        const ops = salespeople.map((sp) => ({
            updateOne: {
                filter: { _id: sp._id },
                update: { $set: { _customerNum: countMap.get(sp._id.toString()) || 0 } },
            },
        }))

        if (ops.length) {
            await salespersonModel.salesperson.bulkWrite(ops, { ordered: false })
        }

        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                updated: ops.length,
            },
        }
    } catch (err: any) {
        logger.error('Recount salesperson customer numbers error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
        }
    }
})

