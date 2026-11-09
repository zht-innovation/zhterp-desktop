import mongoose from "mongoose";
import { CODE, codeToMsg } from "~~/server/utils/code";
import { isOperatorInventoryReadonly } from "~~/shared/utils/adminPermission";

export const INVENTORY_BASE_RESOURCES = [
    "unit",
    "category",
    "warehouse",
    "location",
    "currency",
    "bom-category",
    "material",
] as const;

export type InventoryBaseResource = typeof INVENTORY_BASE_RESOURCES[number];

export class InventoryHttpError extends Error {
    status: number;
    statusCode: number;
    code: CODE | number;

    constructor(status: number, code: CODE | number, message?: string) {
        super(
            message
            || (codeToMsg as Record<number, string>)[code]
            || codeToMsg[CODE.SERVER_ERROR],
        );
        this.status = status;
        this.statusCode = status;
        this.code = code;
    }
}

export const isInventoryBaseResource = (resource?: string): resource is InventoryBaseResource => {
    return Boolean(resource && INVENTORY_BASE_RESOURCES.includes(resource as InventoryBaseResource));
};

export const throwInventoryError = (status: number, code: CODE, message?: string): never => {
    throw new InventoryHttpError(status, code, message);
};

export const isValidObjectId = (id?: string | null) => {
    return Boolean(id && mongoose.Types.ObjectId.isValid(id));
};

export const toObjectId = (id?: string | null) => {
    if (!isValidObjectId(id)) return null;
    return new mongoose.Types.ObjectId(id as string);
};

export const assertInventoryWriteAccess = (event: any) => {
    const method = String(event?.method || event?.node?.req?.method || "GET").toUpperCase();
    const requestPath = String(event?.path || event?.node?.req?.url || "").split("?")[0];
    const role = Number(event.context?.auth?.role);
    if (
        requestPath.startsWith("/inventory/")
        && !["GET", "HEAD", "OPTIONS"].includes(method)
        && isOperatorInventoryReadonly(role)
    ) {
        throw new InventoryHttpError(
            403,
            403,
            "运营角色仅可查看实时库存",
        );
    }
};

export const getInventoryActor = (event: any) => {
    assertInventoryWriteAccess(event);
    const auth = event.context?.auth || {};
    return auth.nickname || auth.username || "";
};

export const getInventoryRole = (event: any) => event.context?.auth?.role;

export const toText = (value: unknown) => {
    if (value === null || value === undefined) return "";
    return String(value).trim();
};

export const toNullableText = (value: unknown) => {
    const text = toText(value);
    return text || undefined;
};

export const toBoolean = (value: unknown, defaultValue = false) => {
    if (value === undefined || value === null || value === "") return defaultValue;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;

    const text = String(value).trim().toLowerCase();
    if (["true", "1", "yes", "y", "是", "启用"].includes(text)) return true;
    if (["false", "0", "no", "n", "否", "禁用"].includes(text)) return false;
    return defaultValue;
};

export const toNumber = (value: unknown, defaultValue = 0) => {
    if (value === undefined || value === null || value === "") return defaultValue;
    const num = Number(value);
    return Number.isFinite(num) ? num : defaultValue;
};

export const getPageParams = (query: Record<string, any>) => {
    const page = Math.max(1, parseInt(String(query.page || "1"), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(query.limit || "20"), 10) || 20));
    return { page, limit, skip: (page - 1) * limit };
};

export const parseIds = (body: any) => {
    const rawIds = Array.isArray(body?.ids)
        ? body.ids
        : [body?.id || body?._id].filter(Boolean);

    const ids = rawIds.map((id: unknown) => toText(id)).filter(Boolean);
    if (!ids.length || ids.some((id: string) => !isValidObjectId(id))) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "缺少合法的 id / ids");
    }

    return ids;
};

export const normalizeHeader = (key: string) => {
    return key.replace(/^\uFEFF/, "").replace(/\s+/g, "").trim().toLowerCase();
};

export const escapeRegExp = (text: string) => {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
