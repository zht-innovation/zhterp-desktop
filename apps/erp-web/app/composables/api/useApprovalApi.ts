import { getToken } from "~/utils/auth";
import type { OrderKitAnalysisResult } from "~~/shared/types/orderKitAnalysis";
import type { InventoryReviewLockDetails } from "~~/shared/types/inventoryReview";
import type { PurchaseBomPreview } from "~~/shared/types/purchaseBom";
import type {
    ApprovalActionData,
    ApprovalApplicantsData,
    ApprovalApiResponse,
    ApprovalDeleteData,
    ApprovalDetailData,
    ApprovalFlowConfig,
    ApprovalFlowListData,
    ApprovalFlowUpdateData,
    ApprovalListData,
    ApprovalQuery,
    ApprovalReadData,
    PurchaseRequestListItem,
    PurchaseRequestPageData,
    PurchaseRequestPageQuery,
} from "~/types/approval";

const approvalHeaders = () => ({
    Token: getToken() || "",
});

const normalizeQuery = ({ type, status, ...query }: ApprovalQuery) => ({
    ...query,
    type: type === "all" ? undefined : type,
    status: status === "all" ? undefined : status,
});

export const retrieveApprovalApplicants = () =>
    $fetch<ApprovalApiResponse<ApprovalApplicantsData>>("/approval-center/applicants", {
        method: "GET",
        headers: approvalHeaders(),
    });

export const retrieveApprovals = (query: ApprovalQuery) =>
    $fetch<ApprovalApiResponse<ApprovalListData>>("/approval-center/retrieve", {
        method: "GET",
        headers: approvalHeaders(),
        query: normalizeQuery(query),
    });

export const retrieveApprovalDetail = (id: string) =>
    $fetch<ApprovalApiResponse<ApprovalDetailData>>("/approval-center/retrieve", {
        method: "GET",
        headers: approvalHeaders(),
        query: { id },
    });

export const retrieveApprovalKitAnalysis = (id: string) =>
    $fetch<ApprovalApiResponse<{ analysis: OrderKitAnalysisResult }>>("/approval-center/retrieve", {
        method: "GET",
        headers: approvalHeaders(),
        query: { resource: "kit-analysis", id },
    });

export const retrieveApprovalInventoryReviewLocks = (id: string, productId: string) =>
    $fetch<ApprovalApiResponse<{ details: InventoryReviewLockDetails }>>("/approval-center/retrieve", {
        method: "GET",
        headers: approvalHeaders(),
        query: { resource: "inventory-review-locks", id, productId },
    });

export const approveApproval = (id: string) =>
    $fetch<ApprovalApiResponse<ApprovalActionData>>("/approval-center/approve", {
        method: "POST",
        headers: approvalHeaders(),
        body: { id },
    });

export const confirmOrderPayment = (id: string) =>
    $fetch<ApprovalApiResponse<{
        detail: { id: string; paymentConfirmed: boolean };
    }>>("/approval-center/approve", {
        method: "POST",
        headers: approvalHeaders(),
        body: { id, action: "confirm-payment" },
    });

export const exportApprovalProductSn = (id: string, productIndex: number) =>
    $fetch<Blob>("/approval-center/retrieve", {
        method: "POST",
        headers: approvalHeaders(),
        query: { resource: "product-sn-export" },
        body: { id, productIndex },
        responseType: "blob",
    });

export const rejectApproval = (id: string, reason: string) =>
    $fetch<ApprovalApiResponse<ApprovalActionData>>("/approval-center/reject", {
        method: "POST",
        headers: approvalHeaders(),
        body: { id, reason },
    });

export const cancelApproval = (id: string) =>
    $fetch<ApprovalApiResponse<ApprovalActionData>>("/approval-center/cancel", {
        method: "POST",
        headers: approvalHeaders(),
        body: { id },
    });

export const readApproval = (id: string) =>
    $fetch<ApprovalApiResponse<ApprovalReadData>>("/approval-center/read", {
        method: "POST",
        headers: approvalHeaders(),
        body: { id },
    });

export const deleteApproval = (id: string, reason = "") =>
    $fetch<ApprovalApiResponse<ApprovalDeleteData>>("/approval-center/delete", {
        method: "DELETE",
        headers: approvalHeaders(),
        body: { id, reason },
    });

export const retrieveApprovalFlows = () =>
    $fetch<ApprovalApiResponse<ApprovalFlowListData>>("/approval-flow/retrieve", {
        method: "GET",
        headers: approvalHeaders(),
    });

export const updateApprovalFlow = (config: ApprovalFlowConfig) =>
    $fetch<ApprovalApiResponse<ApprovalFlowUpdateData>>("/approval-flow/update", {
        method: "POST",
        headers: approvalHeaders(),
        body: config,
    });

export const submitPurchaseRequest = (formData: FormData) =>
    $fetch<ApprovalApiResponse<{
        action: "save-draft" | "submit" | "confirm-bom-covered";
        id?: string;
        requestNo?: string;
        approvalId?: string;
        approvalNo?: string;
    }>>("/approval-center/retrieve", {
        method: "POST",
        headers: approvalHeaders(),
        body: formData,
    });

export const retrievePurchaseRequestBomPreview = (salesOrderId: string, requestId?: string) =>
    $fetch<ApprovalApiResponse<PurchaseBomPreview>>("/purchase/material-requirement/retrieve", {
        method: "GET",
        headers: approvalHeaders(),
        query: { purchaseRequestBomPreview: true, salesOrderId, requestId },
    });

export const retrievePurchaseRequestPage = (query: PurchaseRequestPageQuery) =>
    $fetch<ApprovalApiResponse<PurchaseRequestPageData>>("/approval-center/retrieve", {
        method: "GET",
        headers: approvalHeaders(),
        query: {
            resource: "purchase-request",
            ...query,
        },
    });

export const retrievePurchaseRequestDraft = (id: string) =>
    $fetch<ApprovalApiResponse<{ detail: PurchaseRequestListItem }>>(
        "/approval-center/retrieve",
        {
            method: "GET",
            headers: approvalHeaders(),
            query: { resource: "purchase-request", id },
        },
    );

export const retrievePurchaseRequestDetail = (id: string) =>
    $fetch<ApprovalApiResponse<ApprovalDetailData>>("/approval-center/retrieve", {
        method: "GET",
        headers: approvalHeaders(),
        query: { resource: "purchase-request-detail", id },
    });

export const deletePurchaseRequestDraft = (id: string) =>
    $fetch<ApprovalApiResponse<{ id: string; requestNo: string; scope: "draft" }>>(
        "/approval-center/retrieve",
        {
            method: "DELETE",
            headers: approvalHeaders(),
            body: { resource: "purchase-request", id, scope: "draft" },
        },
    );

export const deleteSubmittedPurchaseRequest = (id: string) =>
    $fetch<ApprovalApiResponse<{ id: string; requestNo: string; scope: "request" }>>(
        "/approval-center/retrieve",
        {
            method: "DELETE",
            headers: approvalHeaders(),
            body: { resource: "purchase-request", id, scope: "request" },
        },
    );
