// 根据id将销售信息放入回收站

import { useSalespersonModel } from "~~/server/models/salesperson.model"

export default defineEventHandler(async (event) => {
	const SalespersonModel = useSalespersonModel()
	const body = await readBody(event)
	const ids = body.ids

	await SalespersonModel.fakeDel(ids)

	setResponseStatus(event, 200)
	return {
		code: CODE.SUCCESS,
		msg: codeToMsg[CODE.SUCCESS]
	}
})