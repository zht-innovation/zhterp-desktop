import type { ADMIN_ROLE } from "~~/shared/enums";

export interface AdminListItem {
    _id: string;
    username: string;
    nickname?: string;
    role: ADMIN_ROLE | `${ADMIN_ROLE}`;
    departmentId: string | null;
    departmentName: string | null;
    canManageApprovalFlow: boolean;
    canAuditSalesOrder: boolean;
    canAuditSalesReceipt: boolean;
    canAuditBorrowRequest: boolean;
    _time: string;
}

export interface AdminListResponse {
    code: number;
    msg: string;
    data: {
        admins: AdminListItem[];
    };
}

// 管理员登陆校验
export function adminLogin() {
    return (username: string, password: string) => $fetch('/admin/login', {
        method: 'POST',
        body: {
            username,
            password
        }
    })
}

// 获取管理员列表
export function retrieveAdminList() {
    return () => $fetch<AdminListResponse>('/admin/retrieve', {
        method: 'GET',
        headers: {
            "Token": getToken() || '',
        }
    })
}

export function retrieveAdminProfile() {
    return () => $fetch<{ code: number; msg: string; data: { user: Omit<AdminListItem, "_id" | "_time"> } }>('/admin/profile', {
        method: 'GET',
        headers: {
            "Token": getToken() || '',
        }
    })
}

// 删除管理员
export function deleteAdmin() {
    return (_id: string) => $fetch('/admin/del', {
        method: 'DELETE',
        body: {
            _id
        },
        headers: {
            "Token": getToken() || '',
        }
    })
}

// 修改管理员信息
export function modifyAdmin() {
    return (
        _id: string,
        password: string,
        nickname: string,
        role: number,
        canManageApprovalFlow?: boolean,
        canAuditSalesOrder?: boolean,
        canAuditSalesReceipt?: boolean,
        canAuditBorrowRequest?: boolean,
        departmentId?: string
    ) => $fetch('/admin/modify', {
        method: 'PUT',
        body: {
            _id,
            password,
            nickname,
            role,
            departmentId,
            ...(canManageApprovalFlow !== undefined ? { canManageApprovalFlow } : {}),
            canAuditSalesOrder,
            canAuditSalesReceipt,
            canAuditBorrowRequest
        },
        headers: {
            "Token": getToken() || '',
        }
    })
}


// 新增管理员
export function signupAdmin() {
    return (
        username: string, 
        password: string, 
        nickname: string, 
        role: number,
        canManageApprovalFlow?: boolean,
        canAuditSalesOrder?: boolean,
        canAuditSalesReceipt?: boolean,
        canAuditBorrowRequest?: boolean,
        departmentId?: string
    ) => $fetch('/admin/signup', {
        method: 'POST',
        body: {
            username,
            password,
            nickname,
            role,
            departmentId,
            ...(canManageApprovalFlow !== undefined ? { canManageApprovalFlow } : {}),
            canAuditSalesOrder,
            canAuditSalesReceipt,
            canAuditBorrowRequest
        },
        headers: {
            "Token": getToken() || '',
        }
    })
}
