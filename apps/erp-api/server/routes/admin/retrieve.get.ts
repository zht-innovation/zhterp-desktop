import { useAdminModel } from "~~/server/models/admin.model"
import { getCurrentDepartments } from "~~/server/services/department"

export default defineEventHandler(async (event) => {
    try {
        const admin = useAdminModel()
        const adminList =  await admin.retrieveAdminList()
        const departments = await getCurrentDepartments(adminList)
        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                admins: adminList.map((row) => ({ ...row.toObject(), ...departments.get(String(row._id)) }))
            }
        }
    } catch (err: any) {
        logger.error(`Failed to retrieve admin list`, err as Error)
        setResponseStatus(event, 613)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }   
})
