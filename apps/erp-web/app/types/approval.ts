import type {
    ApprovalFlowConfig,
    ApprovalInstance,
    ApprovalStepKey,
    ApprovalStatus,
    ApprovalStrategy,
    ApprovalType,
    ApprovalUser,
    ApprovalView,
    AttachmentRef,
    PurchaseRequestCategory,
    PurchaseRequestDepartment,
    PurchaseRequestDisplayStatus,
    PurchaseRequestItem,
    PurchaseRequestSnapshot,
    SalesOrderApprovalSnapshot,
    SalesOrderProductSnapshot,
} from "~~/shared/types/approval";
import type { OrderApprovalField } from "~~/shared/types/orderApproval";
import type { SalesOrderPaymentPlan } from "~~/shared/types/salesOrderPayment";
import type { PurchaseBomGroup } from "~~/shared/types/purchaseBom";

export type {
    ApprovalDate,
    ApprovalFlowConfig,
    ApprovalStatus,
    ApprovalStep,
    ApprovalStepStatus,
    ApprovalStepUser,
    ApprovalStepUserStatus,
    ApprovalType,
    ApprovalUser,
    ApprovalView,
    AttachmentRef,
    PurchaseRequestCategory,
    PurchaseRequestDepartment,
    PurchaseRequestDisplayStatus,
    PurchaseRequestItem,
    PurchaseRequestSnapshot,
} from "~~/shared/types/approval";

export interface SummaryRow {
    label: string;
    value: string;
}

export interface ApprovalListItem {
    id: string;
    approvalNo: string;
    type: ApprovalType;
    businessId: string;
    title: string;
    applicant: ApprovalUser;
    status: ApprovalStatus;
    unread: boolean;
    createTime: string;
    completedAt?: string;
    summary: SummaryRow[];
}

export interface ApprovalInstancePayload extends Omit<ApprovalInstance, "_id"> {
    id: string;
    unread: boolean;
}

export interface SalesOrderBusinessDetail {
    kind: "sales-order";
    order: SalesOrderApprovalSnapshot & {
        id: string;
        orderNo: string;
        orderName: string;
        customerId: string;
        customerName: string;
        customerCompany: string;
        customerRegion: string;
        actualReceivableAmount: number;
        contractDeliveryDate?: string;
        createTime: string;
    };
    visibleFields?: OrderApprovalField[];
}

export interface ReceiptBusinessDetail {
    kind: "receipt";
    receipt: {
        id: string;
        receiptNo: string;
        salesOrderId: string;
        orderNo: string;
        customerId: string;
        customerName: string;
        salespersonId: string;
        salespersonName: string;
        receivableOrder: string;
        amount: number;
        paymentDate: string;
        currency: string;
        remark: string;
        attachments: AttachmentRef[];
        status: string;
        createTime: string;
    };
    order: {
        id: string;
        orderNo: string;
        customerId: string;
        customerName: string;
        customerCompany: string;
        customerRegion: string;
        salespersonId: string;
        salespersonName: string;
        orderType: string;
        amount: number;
        currency: string;
        orderDate?: string;
        durationDays: number;
        receivableOrder: string;
        receivableDate?: string;
        incomeCategory: string;
        plannedPaymentDate?: string;
        plannedPaymentAmount: number;
        plannedPayments?: SalesOrderPaymentPlan[];
        actualReceivableAmount: number;
        receivableRemark: string;
        receivableAttachments: AttachmentRef[];
    };
    receivedAmountBefore: number;
    receivedAmountAfter: number;
    paymentProgressAfter: number;
}

export interface BorrowRequestLineItem {
    materialId: string;
    materialCode: string;
    materialName: string;
    materialModel: string;
    materialUnitName: string;
    image?: string;
    quantity: number;
}

export interface BorrowBusinessDetail {
    kind: "borrow";
    request: {
        id: string;
        requestNo: string;
        applicantId: string;
        applicantUsername: string;
        applicantName: string;
        applicantRole: number;
        borrower: string;
        items?: BorrowRequestLineItem[];
        materialId?: string;
        materialCode?: string;
        materialName?: string;
        materialModel?: string;
        materialUnitName?: string;
        image?: string;
        quantity?: number;
        expectedReturnDate: string;
        reason: string;
        status: string;
        createTime: string;
    };
}

export interface PurchaseRequestBusinessDetail {
    kind: "purchase-request";
    kitAnalysisVisibleFields?: OrderApprovalField[];
    request: PurchaseRequestSnapshot & {
        id: string;
        applicantId: string;
        applicantUsername: string;
        applicantName: string;
        applicantRole: number;
        category: PurchaseRequestCategory;
        status: string;
        createTime: string;
    };
    order?: {
        orderNo: string;
        salespersonName: string;
        orderType: string;
        products: Array<Pick<
            SalesOrderProductSnapshot,
            "productCode" | "model" | "image" | "availableQuantity" | "unitName" | "source" | "remark"
        >>;
    };
}

export type PurchaseRequestPageStatus = ApprovalStatus | "draft";

export interface PurchaseRequestListItem {
    id: string;
    requestNo: string;
    approvalId: string;
    approvalNo: string;
    category: PurchaseRequestCategory | "";
    department?: PurchaseRequestDepartment | "";
    items: PurchaseRequestItem[];
    bomGroups?: PurchaseBomGroup[];
    totalQuantity: number;
    images: AttachmentRef[];
    attachments: AttachmentRef[];
    attachmentText?: string;
    remark: string;
    salesOrderId?: string;
    salesOrderNo?: string;
    productionOrderId?: string;
    productionOrderNo?: string;
    applicant: ApprovalUser;
    status: PurchaseRequestPageStatus;
    displayStatus: PurchaseRequestDisplayStatus;
    currentStep: string;
    createTime: string;
    updateTime: string;
}

export interface PurchaseRequestPageQuery {
    page?: number;
    limit?: number;
    drafts?: boolean;
    category?: PurchaseRequestCategory | "";
    department?: PurchaseRequestDepartment | "";
    status?: Exclude<PurchaseRequestDisplayStatus, "draft"> | "";
    approvalNo?: string;
    applicant?: string;
    startDate?: string;
    endDate?: string;
}

export interface PurchaseRequestPageData {
    list: PurchaseRequestListItem[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
    draftCount: number;
    canViewAll: boolean;
    canDeleteSubmitted: boolean;
}

export type ApprovalBusinessDetail =
    | SalesOrderBusinessDetail
    | ReceiptBusinessDetail
    | BorrowBusinessDetail
    | PurchaseRequestBusinessDetail;

export interface ApprovalDetailItem extends ApprovalInstancePayload {
    title: string;
    business: ApprovalBusinessDetail;
    canApprove: boolean;
    canReject: boolean;
    canCancel: boolean;
    canReapply?: boolean;
    canConfirmPayment?: boolean;
    paymentConfirmationRequired?: boolean;
    paymentConfirmed?: boolean;
    productSnExportEligible?: boolean;
    productSnExportUnavailableReason?: string;
}

export interface ApprovalQuery {
    view: ApprovalView;
    keyword?: string;
    type?: ApprovalType | "all";
    status?: ApprovalStatus | "all";
    applicantId?: string;
    unreadOnly?: boolean;
    sort?: "asc" | "desc";
    submittedStart?: string;
    submittedEnd?: string;
    completedStart?: string;
    completedEnd?: string;
    cursor?: string;
    pageSize?: number;
}

export interface ApprovalAdvancedFilters {
    applicantId: string;
    submittedStart: string;
    submittedEnd: string;
    completedStart: string;
    completedEnd: string;
}

export interface ApprovalPagination {
    pageSize: number;
    hasMore: boolean;
    nextCursor?: string;
}

export interface ApprovalUnreadCounts {
    pending: number;
    processed: number;
    mine: number;
    cc: number;
    all: number;
    unread: number;
}

export interface ApprovalListData {
    items: ApprovalListItem[];
    pagination: ApprovalPagination;
    unreadCounts: ApprovalUnreadCounts;
    pendingCount: number;
}

export interface ApprovalApplicantsData {
    applicants: ApprovalUser[];
}

export interface ApprovalActionData {
    detail: {
        event: "advanced" | "approved" | "rejected" | "cancelled";
        instance: ApprovalInstancePayload;
    };
}

export interface ApprovalDetailData {
    detail: ApprovalDetailItem;
}

export interface ApprovalReadData {
    detail: ApprovalInstancePayload;
}

export interface ApprovalDeleteData {
    id: string;
    approvalNo: string;
}

export interface ApprovalApiResponse<T> {
    code: number;
    msg: string;
    data: T;
}

export interface ApprovalFlowListData {
    configs: ApprovalFlowConfig[];
}

export interface ApprovalFlowUpdateData {
    config: ApprovalFlowConfig;
}

export interface FlowUser {
    id: string;
    name: string;
    roleId?: string;
    roleName?: string;
}

export interface RoleOption {
    id: string;
    name: string;
}

export interface RoleApprovers {
    id: string;
    roleIds: string[];
    approvers: FlowUser[];
    enabled: boolean;
    visibleFields?: OrderApprovalField[];
}

export interface RoleCcUsers {
    id: string;
    roleIds: string[];
    users: FlowUser[];
    enabled: boolean;
    visibleFields?: OrderApprovalField[];
}

export interface FlowApprovalStep {
    id: string;
    type: "approval";
    key: Extract<ApprovalStepKey, "first-approval" | "second-approval" | "third-approval">;
    name: string;
    order: number;
    mode: ApprovalStrategy;
    assignments: RoleApprovers[];
}

export interface FlowCcStep {
    id: string;
    type: "cc";
    key: Extract<ApprovalStepKey, "cc" | "shooting-cc">;
    name: string;
    order: number;
    assignments: RoleCcUsers[];
}

export type FlowStep = FlowApprovalStep | FlowCcStep;

export interface FlowConfig {
    type: ApprovalType;
    steps: FlowStep[];
}
