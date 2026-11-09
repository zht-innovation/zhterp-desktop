import jwt from "jsonwebtoken";
import { useAdminModel } from "~~/server/models/admin.model";

export const getNotificationAdmin = async (event: any) => {
    let username = String(event.context.auth?.username || "").trim();
    if (!username) {
        const token = getHeader(event, "Token") || getCookie(event, "Token");
        const baseToken = String(useRuntimeConfig().baseToken || "");
        if (!token || !baseToken) {
            throw createError({ statusCode: 401, statusMessage: "登录状态无效" });
        }

        try {
            const payload = jwt.verify(token, baseToken) as { username?: string };
            username = String(payload.username || "").trim();
        } catch {
            throw createError({ statusCode: 401, statusMessage: "登录状态无效" });
        }
    }

    if (!username) {
        throw createError({ statusCode: 401, statusMessage: "登录状态无效" });
    }

    const admin = await useAdminModel().findAdminByUsername(username);
    if (!admin?._id) {
        throw createError({ statusCode: 401, statusMessage: "登录状态无效" });
    }

    return admin;
};
