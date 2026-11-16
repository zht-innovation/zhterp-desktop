import { createError, readBody } from "h3";
import { updateDepartment, withDepartment } from "../../services/department";

export default defineEventHandler((event) => withDepartment(event, true, async () => {
    const body = await readBody(event);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw createError({ statusCode: 400, message: "请求内容无效" });
    }
    if (!Object.hasOwn(body, "purchaseRequestCategories")
        || Object.keys(body).some((key) => key !== "id" && key !== "purchaseRequestCategories")) {
        throw createError({ statusCode: 400, message: "仅支持更新部门采购申请类别" });
    }
    await updateDepartment({ id: body.id, purchaseRequestCategories: body.purchaseRequestCategories });
    return null;
}));
