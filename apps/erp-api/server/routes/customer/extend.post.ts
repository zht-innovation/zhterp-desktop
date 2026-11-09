import { useCustomerModel } from "~~/server/models/customer.model"
import { useCustomerTermModel } from "~~/server/models/customerTerm.model"
import { useSalespersonModel } from "~~/server/models/salesperson.model"

export default defineEventHandler(async (event) => {
    const customerModel = useCustomerModel()
    const termModel = useCustomerTermModel()
    const salespersonModel = useSalespersonModel()
    const body = await readBody(event)
    const ids = body.ids
    const extendDays = Number(body.extendDays)
    const auth = event.context.auth
    const createdBy = {
        name: auth?.nickname || auth?.username || "管理员",
        role: Number(auth?.role ?? 2),
    }

    const changes = await customerModel.extendContact(ids, extendDays)
    const salesIds = Array.from(new Set(
        changes
            .map((change: any) => change.salesId?.toString())
            .filter(Boolean)
    ))
    const salespeople = salesIds.length
        ? await salespersonModel.salesperson
            .find({ _id: { $in: salesIds } })
            .select('_id name nameCn')
        : []
    const salesNameMap = new Map(
        salespeople.map((salesperson: any) => [
            salesperson._id.toString(),
            salesperson.nameCn || salesperson.name || '',
        ])
    )

    await termModel.addManualMany(
        changes.map((change: any) => {
            const salesId = change.salesId || null
            const salesName = salesId
                ? salesNameMap.get(salesId.toString()) || ''
                : ''
            return {
                customerId: change.customerId,
                days: extendDays,
                oldExpire: change.oldExpire,
                newExpire: change.newExpire,
                oldSalesId: salesId,
                oldSalesName: salesName,
                newSalesId: salesId,
                newSalesName: salesName,
                createdBy,
            }
        })
    )

    setResponseStatus(event, 200)
    return {
        code: CODE.SUCCESS,
        msg: codeToMsg[CODE.SUCCESS]
    }
})
