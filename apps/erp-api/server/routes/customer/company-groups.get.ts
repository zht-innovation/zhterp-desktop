/**
 * GET /customer/company-groups
 * 作用：返回“当前筛选条件下”的公司分组列表（不包含客户明细）。
 *
 * Query 参数：
 * - page?: number            公司分组分页页码，默认 1
 * - limit?: number           每页公司分组数量，默认 20，最大 50
 * - keyword?: string         搜索关键字（有值时按搜索模式处理）
 * - id?: string              销售人员 ID（role=3 时必填）
 * - onlyUnassigned?: boolean 仅公共池客户
 * - onlyAssigned?: boolean   仅已分配客户
 * - onlyDeleted?: boolean    仅回收站客户
 * - category?: string        分类筛选
 * - customerLevel?: string   客户等级筛选
 * - assignedTo?: string      指定销售人员筛选（管理员侧）
 *
 * 返回：
 * - data.groups: [{ companyKey, companyName, customerCount, latestAddTime }]
 * - data.totalCustomers: number（当前条件下客户总数）
 * - data.pagination: { page, limit, totalGroups, hasMore }
 */

import { useCustomerModel } from '~~/server/models/customer.model'
import { logger } from '~~/server/utils/logger'

const toBool = (v: unknown) => v === true || v === "true" || v === "1";

export default defineEventHandler(async (event) => {
    try {
        logger.info('customer company groups')
        const auth = event.context.auth
        const role = Number(auth?.role)
        if (!auth || Number.isNaN(role)) {
            setResponseStatus(event, 401)
            return {
                code: 401,
                msg: '权限不足',
                data: null
            }
        }

        const query = getQuery(event)
        let onlyUnassigned = toBool(query.onlyUnassigned)
        let onlyAssigned = toBool(query.onlyAssigned)
        const onlyDeleted = toBool(query.onlyDeleted)
        const category = typeof query.category === 'string' ? query.category.trim() : ''
        const assignedTo = typeof query.assignedTo === 'string' ? query.assignedTo.trim() : ''
        const customerLevel =
            typeof query.customerLevel === 'string' ? query.customerLevel.trim() : ''
        const keyword = typeof query.keyword === 'string' ? query.keyword.trim() : ''

        if (onlyAssigned && onlyUnassigned) {
            setResponseStatus(event, 400)
            return {
                code: CODE.SERVER_ERROR,
                msg: 'onlyAssigned 与 onlyUnassigned 不能同时为 true'
            }
        }

        // 销售只能搜索到自己已对接客户
        if (keyword && role === 3 && !onlyAssigned && !onlyUnassigned) {
            onlyAssigned = true
        }

        const page = Math.max(1, parseInt(query.page as string) || 1)
        const limit = Math.min(50, Math.max(1, parseInt(query.limit as string) || 20))

        let salespersonId: string | null = null
        if (role === 3) {
            const id = typeof query.id === 'string' ? query.id.trim() : ''
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
        const { groups, totalGroups, totalCustomers, hasMore } =
            await customerModel.retrieveCompanyGroups(salespersonId, role, page, limit, {
                keyword,
                onlyUnassigned,
                onlyAssigned,
                onlyDeleted,
                category,
                assignedTo,
                customerLevel
            })

        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                groups,
                totalCustomers,
                pagination: {
                    page,
                    limit,
                    totalGroups,
                    hasMore
                }
            }
        }
    } catch (err: any) {
        logger.error('Retrieve customer company groups error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }
})
