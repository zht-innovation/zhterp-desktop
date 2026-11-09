// 获取销售列表，返回：
// {
//   "code": 200,
//   "msg": "ok",
//   "data": {
//     "salesperson": [
//       {
//         "_id": "对象ID字符串",
//         "name": "销售人员姓名",
//         "phone": "手机号码",
//         "email": "邮箱地址",
//         "region": "所属区域",
//         "language": "使用语言",
//         "_customerNum": 0,
//         "_isFakeDel": false,
//         "_addTime": "2024-01-01T00:00:00.000Z"
//       },
//       // ... 更多销售人员对象
//     ]
//   }
// }

import { useSalespersonModel } from "~~/server/models/salesperson.model"
import { useAdminModel } from "~~/server/models/admin.model"
import { attachSubmittedOrderCountsToSalespeople } from "~~/server/services/salespersonOrderCount"

export default defineEventHandler(async (event) => {
    try {
        const salesperson = useSalespersonModel()
        const salespersonList = await salesperson.retrieveSalespersonList()
        const needsAdminInfo = salespersonList.filter((sp: any) => {
            return Boolean(sp?.linkAdminId) && (!sp?.nameCn || !sp?.nameEn)
        })
        let hydratedList = salespersonList.map((sp: any) => sp.toObject?.() ?? sp)
        if (needsAdminInfo.length) {
            const adminModel = useAdminModel()
            const adminIds = needsAdminInfo
                .map((sp: any) => sp.linkAdminId?.toString?.() || String(sp.linkAdminId))
                .filter(Boolean)
            const admins = await adminModel.findAdminsByIds(adminIds)
            const adminMap = new Map(
                admins.map((admin: any) => [
                    admin._id?.toString?.() || String(admin._id),
                    { username: admin.username, nickname: admin.nickname }
                ])
            )
            hydratedList = salespersonList.map((sp: any) => {
                const plainSalesperson = sp.toObject?.() ?? sp
                const key = sp.linkAdminId?.toString?.() || String(sp.linkAdminId || '')
                const adminInfo = adminMap.get(key)
                if (!adminInfo) return plainSalesperson
                return {
                    ...plainSalesperson,
                    nameCn: sp.nameCn || adminInfo.username || '',
                    nameEn: sp.nameEn || adminInfo.nickname || '',
                }
            })
        }
        hydratedList = await attachSubmittedOrderCountsToSalespeople(hydratedList)
        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                salesperson: hydratedList
            }
        }
    } catch (err: any) {
        logger.error(`Failed to retrieve salesperson list`, err as Error)
        setResponseStatus(event, 613)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }   
})
