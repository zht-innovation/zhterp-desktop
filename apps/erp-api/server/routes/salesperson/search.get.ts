import { useSalespersonModel } from '~~/server/models/salesperson.model'
import { attachSubmittedOrderCountsToSalespeople } from '~~/server/services/salespersonOrderCount'

export default defineEventHandler(async (event) => {
    const query = getQuery(event)
    const keyword = (query.keyword as string || '').trim()
    const page = parseInt(query.page as string) || 1
    const limit = parseInt(query.limit as string) || 20

    if (!keyword) {
        return {
            code: 400,
            msg: '搜索关键字不能为空',
            data: null
        }
    }

    try {
        const salespersonModel = useSalespersonModel()
        const result = await salespersonModel.search(keyword, page, limit)
        const salespeople = await attachSubmittedOrderCountsToSalespeople(result.salespeople)

        return {
            code: 200,
            msg: 'success',
            data: {
                salespeople,
                pagination: {
                    page,
                    limit,
                    total: result.total,
                    hasMore: result.hasMore
                },
                keyword
            }
        }
    } catch (err: any) {
        console.error('搜索销售人员失败:', err)
        return {
            code: 500,
            msg: err.message || '搜索销售人员失败',
            data: null
        }
    }
})
