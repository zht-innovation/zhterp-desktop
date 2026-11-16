import { getToken } from "~/utils/auth";
import type { PurchaseRequestCategory } from "~~/shared/types/approval";
import type { Department } from "~~/shared/types/department";

const request = async <T>(path: string, method: "GET" | "PUT", body?: object) => {
    try {
        const result = await $fetch<{ code: number; msg: string; data: T }>(`/department/${path}`, {
            method,
            headers: { Token: getToken() || "" },
            ...(body ? { body } : {}),
        });
        if (result.code !== 200) throw new Error(result.msg || "部门操作失败");
        return result.data;
    } catch (error: any) {
        throw new Error(error.data?.msg || error.message || "部门操作失败");
    }
};

export const retrieveDepartments = async () => {
    const result = await request<{ departments: Department[] }>("retrieve", "GET");
    return result.departments;
};

export const updateDepartment = (id: string, updates: {
    purchaseRequestCategories: PurchaseRequestCategory[];
}) => request<null>("update", "PUT", {
    id,
    purchaseRequestCategories: updates.purchaseRequestCategories,
});
