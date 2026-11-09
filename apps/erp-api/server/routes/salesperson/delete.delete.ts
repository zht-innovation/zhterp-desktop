// 根据id彻底删除销售

import { useSalespersonModel } from "~~/server/models/salesperson.model"

export default defineEventHandler(async (event) => {
    const SalespersonModel = useSalespersonModel()
    const body = await readBody(event)
    const ids = body.ids

    await SalespersonModel.delete(ids)

    setResponseStatus(event, 200)
    return {
        code: CODE.SUCCESS,
        msg: codeToMsg[CODE.SUCCESS]
    }
})
