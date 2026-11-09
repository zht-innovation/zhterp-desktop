import { useCustomerModel } from "~~/server/models/customer.model"
import { logger } from "~~/server/utils/logger"
import { ADMIN_ROLE } from "~~/shared/enums"

const RESULT_LIMIT = 30

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

export default defineEventHandler(async (event) => {
    try {
        const auth = event.context.auth
        const role = Number(auth?.role)
        if (!auth || Number.isNaN(role)) {
            setResponseStatus(event, 401)
            return {
                code: 401,
                msg: "权限不足",
                data: null
            }
        }

        const query = getQuery(event)
        const keyword = typeof query.keyword === "string" ? query.keyword.trim() : ""

        const customerModel = useCustomerModel()
        const match: Record<string, any> = {
            _isFakeDel: { $ne: true },
            company: { $exists: true, $type: "string", $ne: "" },
        }
        if (keyword) {
            match.company = { $regex: escapeRegex(keyword), $options: "i" }
        }

        if (role === ADMIN_ROLE.SELLER) {
            const salespersonId = typeof query.id === "string" ? query.id.trim() : ""
            if (!salespersonId) {
                setResponseStatus(event, 400)
                return {
                    code: CODE.SERVER_ERROR,
                    msg: "缺少销售ID",
                    data: null
                }
            }
            match._isAssigned = true
            match._assignSalespersonId = salespersonId
        }

        const records = await customerModel.customer
            .find(match)
            .sort({ _addTime: -1 })
            .select("company companyDetail companyWebsite")
            .lean()

        const companyMap = new Map<string, { company: string; companyDetail: string; companyWebsite: string }>()
        for (const item of records) {
            const company = typeof item?.company === "string" ? item.company.trim() : ""
            if (!company || companyMap.has(company)) continue
            companyMap.set(company, {
                company,
                companyDetail: typeof item?.companyDetail === "string" ? item.companyDetail : "",
                companyWebsite: typeof item?.companyWebsite === "string" ? item.companyWebsite : "",
            })
            if (companyMap.size >= RESULT_LIMIT) break
        }

        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                companies: Array.from(companyMap.values())
            }
        }
    } catch (err: any) {
        logger.error("Retrieve customer company options error", err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
        }
    }
})
