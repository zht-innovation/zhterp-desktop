// 更新销售信息，需要更新的信息填在body中

import { useSalespersonModel } from "~~/server/models/salesperson.model"

export default defineEventHandler(async (event) => {
    const salespersonModel = useSalespersonModel()
    const body = await readBody(event)
    const id = body._id

    if (!id) {
        setResponseStatus(event, 400)
        return {
            code: CODE.SERVER_ERROR,
            msg: 'Missing id'
        }
    }

    const updates = {
        avatar: body.avatar,
        phone: body.phone,
        email: body.email,
        region: body.region,
        nameCn: body.nameCn,
        nameEn: body.nameEn,
        joinDate: body.joinDate,
        joinDesc: body.joinDesc,
        country: body.country,
        city: body.city,
        whatsapp: body.whatsapp,
        languages: body.languages,
        markets: body.markets,
        domains: body.domains,
        _dealCount: body._dealCount,
        plans: body.plans,
        plansUpdatedAt: body.plansUpdatedAt,
    }

    await salespersonModel.update(id, updates)

    setResponseStatus(event, 200)
    return {
        code: CODE.SUCCESS,
        msg: codeToMsg[CODE.SUCCESS]
    }
})
