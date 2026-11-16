import { createError } from "h3";
import { ADMIN_ROLE } from "~~/shared/enums";
import {
    PURCHASE_REQUEST_CATEGORIES,
    type PurchaseRequestCategory,
    type PurchaseRequestOptions,
} from "~~/shared/types/approval";

export const parsePurchaseRequestCategories = (value: unknown): PurchaseRequestCategory[] => {
    if (!Array.isArray(value)) {
        throw createError({ statusCode: 400, message: "采购类别必须为数组" });
    }
    for (const category of value) {
        if (typeof category !== "string" || !PURCHASE_REQUEST_CATEGORIES.includes(category as PurchaseRequestCategory)) {
            throw createError({ statusCode: 400, message: "包含无效的采购类别" });
        }
    }
    return PURCHASE_REQUEST_CATEGORIES.filter((category) => value.includes(category));
};

export const resolvePurchaseRequestOptions = (
    admin: { role: number; departmentId: string | null },
    department: { name: string; status: string; purchaseRequestCategories?: unknown } | null,
): PurchaseRequestOptions => {
    const options: PurchaseRequestOptions = {
        departmentId: admin.departmentId,
        departmentName: department?.name || null,
        categories: [],
    };
    if (admin.role === ADMIN_ROLE.SUPER) {
        options.categories = [...PURCHASE_REQUEST_CATEGORIES];
        return options;
    }
    if (!admin.departmentId) {
        options.unavailableReason = "请先联系管理员分配所属部门";
        return options;
    }
    if (!department || department.status !== "enabled") {
        options.unavailableReason = "所属部门不存在或已停用，请联系管理员调整";
        return options;
    }
    if (department.purchaseRequestCategories === undefined) {
        options.categories = [...PURCHASE_REQUEST_CATEGORIES];
        return options;
    }
    if (!Array.isArray(department.purchaseRequestCategories)) {
        options.unavailableReason = "所属部门的采购类别配置无效，请联系管理员调整";
        return options;
    }
    const configuredCategories = department.purchaseRequestCategories;
    options.categories = PURCHASE_REQUEST_CATEGORIES.filter((category) => configuredCategories.includes(category));
    if (!options.categories.length) {
        options.unavailableReason = "所属部门暂无可发起的采购类别，请联系管理员配置";
    }
    return options;
};

export const assertPurchaseRequestCategoryAllowed = (options: PurchaseRequestOptions, category: string): void => {
    if (!options.categories.includes(category as PurchaseRequestCategory)) {
        throw createError({
            statusCode: 403,
            message: options.unavailableReason || "当前所属部门不允许发起该采购类别",
        });
    }
};
