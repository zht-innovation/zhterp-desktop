import mongoose from "mongoose";
import { createError, setHeader, setResponseStatus, type H3Event } from "h3";
import { Department } from "../models/department.model";
import { useAdminModel } from "../models/admin.model";
import { getNotificationAdmin } from "./notificationAdmin";
import { ADMIN_ROLE, ADMIN_ROLE_NAME } from "~~/shared/enums";
import type { CurrentDepartment, DepartmentSnapshot } from "~~/shared/types/department";

const handleDepartmentLookupError = (error: unknown) => {
    if (error instanceof mongoose.Error.CastError && error.path === "_id") return null;
    throw error;
};

export const parseDepartmentName = (value: unknown) => {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 40) {
        throw createError({ statusCode: 400, message: "部门名称不能为空且最多 40 字" });
    }
    return value.trim();
};

export const serializeDepartmentSnapshot = (value: any): DepartmentSnapshot | null => {
    if (!value?.departmentId || !value.departmentName) return null;
    return { departmentId: String(value.departmentId), departmentName: value.departmentName };
};

export const getDepartmentSnapshot = async (id: unknown, session?: mongoose.ClientSession): Promise<DepartmentSnapshot | null> => {
    if (id === null || id === undefined) return null;
    const department = await Department.findOne({ _id: String(id), status: "enabled" })
        .select("name").session(session || null).lean<{ _id: mongoose.Types.ObjectId; name: string } | null>()
        .catch(handleDepartmentLookupError);
    if (!department) throw createError({ statusCode: 409, message: "人员关联的部门不存在或已停用，请先调整人员部门" });
    return { departmentId: String(department._id), departmentName: department.name };
};

export const getCurrentDepartments = async (admins: { _id: unknown; departmentId?: unknown }[]) => {
    const ids = [...new Set(admins.filter((a) => a.departmentId).map((a) => String(a.departmentId)))];
    const departments: any[] = ids.length ? await Department.find({ _id: { $in: ids } }).select("name").lean() : [];
    const names = new Map(departments.map((d) => [String(d._id), d.name as string]));
    return new Map(admins.map((admin): [string, CurrentDepartment] => {
        const id = admin.departmentId ? String(admin.departmentId) : null;
        return [String(admin._id), { departmentId: id, departmentName: id ? names.get(id) || null : null }];
    }));
};

// Assignment and disabling both write this record, so their transactions cannot pass each other.
// Advance the existing timestamp even within the same millisecond to guarantee a real write.
const lockDepartment = (id: unknown, session: mongoose.ClientSession, enabledOnly = false) => Department.findOneAndUpdate(
    { _id: String(id ?? ""), ...(enabledOnly ? { status: "enabled" } : {}) },
    [{ $set: { updatedAt: { $max: ["$$NOW", { $add: [{ $ifNull: ["$updatedAt", new Date(0)] }, 1] }] } } }],
    { new: true, session, timestamps: false },
).lean().catch(handleDepartmentLookupError);

export const assignDepartment = async (value: unknown, session: mongoose.ClientSession) => {
    const department = await lockDepartment(value, session, true);
    if (!department) {
        throw createError({ statusCode: 400, message: "部门不存在或已停用，请重新选择" });
    }
    return department._id as mongoose.Types.ObjectId;
};

export const updateDepartment = async (body: any) => {
    const updates: { name?: string; status?: "enabled" | "disabled" } = {};
    if (Object.hasOwn(body, "name")) updates.name = parseDepartmentName(body.name);
    if (Object.hasOwn(body, "status")) {
        if (!["enabled", "disabled"].includes(body.status)) throw createError({ statusCode: 400, message: "部门状态无效" });
        updates.status = body.status;
    }
    if (!Object.keys(updates).length) throw createError({ statusCode: 400, message: "请提供部门名称或状态" });
    await mongoose.connection.transaction(async (session) => {
        const department = await lockDepartment(body.id, session);
        if (!department) throw createError({ statusCode: 404, message: "部门不存在" });
        const id = department._id;
        if (updates.status === "disabled") {
            const count = await useAdminModel().admin.countDocuments({ departmentId: id }).session(session);
            if (count) throw createError({ statusCode: 409, message: `仍有 ${count} 名人员关联此部门，请先调整人员部门` });
        }
        await Department.updateOne({ _id: id }, { $set: updates }, { session, runValidators: true, timestamps: false });
    });
};

export const withDepartment = async <T>(event: H3Event, manage: boolean, operation: (admin: Awaited<ReturnType<typeof getNotificationAdmin>>) => Promise<T>) => {
    setHeader(event, "Cache-Control", "private, no-store");
    try {
        const admin = await getNotificationAdmin(event);
        if (!String(admin.role ?? "").trim() || !Object.hasOwn(ADMIN_ROLE_NAME, Number(admin.role)) || (manage && Number(admin.role) !== ADMIN_ROLE.SUPER)) {
            throw createError({ statusCode: 403, message: "无权管理部门" });
        }
        return { code: 200, msg: "成功", data: await operation(admin) };
    } catch (error: any) {
        const code = error.code === 11000 ? 409 : [400, 401, 403, 404, 409].includes(error.statusCode) ? error.statusCode : 500;
        setResponseStatus(event, code);
        if (code === 500) console.error("部门操作失败", error);
        return { code, msg: error.code === 11000 ? "部门名称已存在" : code === 500 ? "部门操作失败，请稍后重试" : error.message, data: null };
    }
};
