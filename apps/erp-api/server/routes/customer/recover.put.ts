

import { useCustomerModel } from "~~/server/models/customer.model"

export default defineEventHandler(async (event) => {
    const customerModel = useCustomerModel()
    const body = await readBody(event)
    const ids = body.ids

    await customerModel.recover(ids)

    setResponseStatus(event, 200)
    return {
        code: CODE.SUCCESS,
        msg: codeToMsg[CODE.SUCCESS]
    }
})