import type { PurchaseRequestCategory } from "./approval";

export interface Department {
    id: string;
    name: string;
    status: "enabled" | "disabled";
    purchaseRequestCategories?: PurchaseRequestCategory[];
}

export interface CurrentDepartment {
    departmentId: string | null;
    departmentName: string | null;
}

export interface DepartmentSnapshot {
    departmentId: string;
    departmentName: string;
}
