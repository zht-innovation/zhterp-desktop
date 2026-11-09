import { createError, getQuery } from "h3";
import { Department } from "../../models/department.model";
import { withDepartment } from "../../services/department";
import { ADMIN_ROLE } from "~~/shared/enums";

export default defineEventHandler((event) => withDepartment(event, false, async (admin) => {
    const { includeDisabled } = getQuery(event);
    if (includeDisabled !== undefined && !["true", "false"].includes(String(includeDisabled))) {
        throw createError({ statusCode: 400, message: "部门查询参数无效" });
    }
    if (includeDisabled === "true" && Number(admin.role) !== ADMIN_ROLE.SUPER) {
        throw createError({ statusCode: 403, message: "无权查看停用部门" });
    }
    const rows: any[] = await Department.find(includeDisabled === "true" ? {} : { status: "enabled" }).sort({ createdAt: 1, _id: 1 }).lean();
    return { departments: rows.map((row) => ({ id: String(row._id), name: row.name, status: row.status })) };
}));
