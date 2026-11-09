export type BorrowRequestRetrieveParams = {
    keyword?: string;
    status?: string;
    page?: number;
    limit?: number;
};

export type BorrowRequestLinePayload = {
    materialId: string;
    quantity: number;
};

export type BorrowRequestPayload = {
    borrower: string;
    items: BorrowRequestLinePayload[];
    expectedReturnDate: string;
    reason: string;
};

export type BorrowFlowRulePayload = {
    applicantRole: number | null;
    approverIds: string[];
    enabled: boolean;
    sort: number;
};

const borrowHeaders = () => ({
    Token: getToken() || "",
});

export const retrieveBorrowRequests = (params: BorrowRequestRetrieveParams = {}) =>
    $fetch("/borrow-request/retrieve", {
        method: "GET",
        headers: borrowHeaders(),
        query: params,
    });

export const previewBorrowRequestFlow = () =>
    $fetch("/borrow-request/preview", {
        method: "POST",
        headers: borrowHeaders(),
        body: {},
    });

export const addBorrowRequest = (payload: BorrowRequestPayload) =>
    $fetch("/borrow-request/add", {
        method: "POST",
        headers: borrowHeaders(),
        body: payload,
    });

export const auditBorrowRequest = (payload: { id: string }) =>
    $fetch("/borrow-request/audit", {
        method: "POST",
        headers: borrowHeaders(),
        body: payload,
    });

export const rejectBorrowRequest = (payload: { id: string; reason: string }) =>
    $fetch("/borrow-request/reject", {
        method: "POST",
        headers: borrowHeaders(),
        body: payload,
    });

export const retrieveBorrowApprovalFlow = () =>
    $fetch("/borrow-request/flow", {
        method: "GET",
        headers: borrowHeaders(),
    });

export const updateBorrowApprovalFlow = (payload: { rules: BorrowFlowRulePayload[] }) =>
    $fetch("/borrow-request/flow", {
        method: "PUT",
        headers: borrowHeaders(),
        body: payload,
    });
