// 根据id将客户放入回收站

import { useCustomerModel } from "~~/server/models/customer.model"

export default defineEventHandler(async (event) => {
	const customerModel = useCustomerModel()
	const body = await readBody(event)
	const ids = body.ids

	await customerModel.fakeDel(ids)

	setResponseStatus(event, 200)
	return {
		code: CODE.SUCCESS,
		msg: codeToMsg[CODE.SUCCESS]
	}
})