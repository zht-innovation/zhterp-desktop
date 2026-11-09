// 返回客户信息，不同权限返回内容不同
// 管理员返回全部客户的全部信息以及对接状态
// 普通销售返回自己对接客户的全部信息以及未对接客户的部分信息

import { useCustomerModel } from '~~/server/models/customer.model'
import { logger } from '~~/server/utils/logger'

export default defineEventHandler(async (event) => {
    try {
        logger.info("customer retrieve")
        const auth = event.context.auth

        let salespersonId: string | null = null
        const query = getQuery(event)
        const onlyUnassigned =
            query.onlyUnassigned === 'true' ||
            query.onlyUnassigned === true ||
            query.onlyUnassigned === '1'
        const onlyAssigned =
            query.onlyAssigned === 'true' ||
            query.onlyAssigned === true ||
            query.onlyAssigned === '1'
        const onlyDeleted =
            query.onlyDeleted === 'true' ||
            query.onlyDeleted === true ||
            query.onlyDeleted === '1'
        const category = typeof query.category === 'string' ? query.category : ''
        const assignedTo = typeof query.assignedTo === 'string' ? query.assignedTo : ''
        const customerLevel = typeof query.customerLevel === 'string' ? query.customerLevel : ''

        if (onlyAssigned && onlyUnassigned) {
            setResponseStatus(event, 400)
            return {
                code: CODE.SERVER_ERROR,
                msg: 'onlyAssigned 与 onlyUnassigned 不能同时为 true'
            }
        }

        // 分页参数
        const page = Math.max(1, parseInt(query.page as string) || 1)
        const limit = Math.min(50, Math.max(1, parseInt(query.limit as string) || 20))

        // 前端直接用 query.id 传递销售ID
        if (auth.role == 3) {
            const id = typeof query.id === 'string' ? query.id : null
            if (!id) {
                setResponseStatus(event, 400)
                return {
                    code: CODE.SERVER_ERROR,
                    msg: '缺少销售ID'
                }
            }
            salespersonId = id
        }

        const customerModel = useCustomerModel()
        const { customers, total, hasMore } = await customerModel.retrieveCustomerList(
            salespersonId,
            auth.role,
            page,
            limit,
            { onlyUnassigned, onlyAssigned, onlyDeleted, category, assignedTo, customerLevel }
        )


        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                customers,
                pagination: {
                    page,
                    limit,
                    total,
                    hasMore
                }
            }
        }

    } catch (err: any) {
        logger.error('Retrieve customers error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }
})
