import type { OrderApprovalField } from "./orderApproval";

import type { InventoryReviewResult } from "./inventoryReview";
import type { SalesOrderPaymentPlan } from "./salesOrderPayment";
import type { PurchaseBomGroup } from "./purchaseBom";

export const APPROVAL_TYPES = [
    "sales-order",
    "receipt",
    "borrow",
    "purchase-request",
] as const;

export type ApprovalType = typeof APPROVAL_TYPES[number];

export const APPROVAL_STEP_KEYS = [
    "first-approval",
    "second-approval",
    "third-approval",
    "cc",
    "shooting-cc",
] as const;

export type ApprovalStepKey = typeof APPROVAL_STEP_KEYS[number];

export type ApprovalStrategy = "sequential" | "any";

export const APPROVAL_STATUSES = [
    "pending",
    "approved",
    "rejected",
    "cancelled",
] as const;

export type ApprovalStatus = typeof APPROVAL_STATUSES[number];

export const APPROVAL_VIEWS = [
    "pending",
    "processed",
    "mine",
    "cc",
    "all",
] as const;

export type ApprovalView = typeof APPROVAL_VIEWS[number];

export type ApprovalStepStatus =
    | "waiting"
    | "pending"
    | "completed"
    | "rejected"
    | "skipped";

export type ApprovalStepUserStatus =
    | "waiting"
    | "pending"
    | "approved"
    | "rejected"
    | "skipped"
    | "completed";

export type ApprovalDate = Date | string;

export interface ApprovalAttachmentMetadata {
    path?: string;
    url?: string;
    originalName?: string;
    name?: string;
    size?: number;
    type?: string;
    [key: string]: unknown;
}

export type AttachmentRef = string | ApprovalAttachmentMetadata;

export interface SalesOrderProductSnapshot {
    productId?: string;
    productCode?: string;
    productName?: string;
    model?: string;
    image?: string;
    salePrice?: number;
    availableQuantity?: number;
    unitName?: string;
    quantity?: number;
    totalPrice?: number;
    source?: string;
    machineNo?: string;
    remark?: string;
    [key: string]: unknown;
}

export interface SalesOrderApprovalSnapshot {
    customerName: string;
    salespersonId?: string;
    salespersonName: string;
    orderType: string;
    amount: number;
    currency: string;
    orderDate?: ApprovalDate;
    durationDays: number;
    machineNo?: string;
    invoiceStatus?: string;
    contractNo?: string;
    sampleRequirement?: string;
    installationRequirement?: string;
    testingRequirement?: string;
    orderRemark?: string;
    hasShootingTask?: boolean;
    shootingRequirement?: string;
    orderImages: AttachmentRef[];
    attachments: AttachmentRef[];
    products: SalesOrderProductSnapshot[];
    hasReceivable: boolean;
    receivableOrder?: string;
    receivableDate?: ApprovalDate;
    incomeCategory?: string;
    actualReceivableAmount?: number;
    plannedPaymentDate?: ApprovalDate;
    plannedPaymentAmount?: number;
    plannedPayments?: SalesOrderPaymentPlan[];
    baseReceivedAmount?: number;
    receivedAmount?: number;
    receivableRemark?: string;
    receivableAttachments: AttachmentRef[];
}

export interface ReceiptApprovalSnapshot {
    customerName: string;
    receivedAmountBefore: number;
}

export const PURCHASE_REQUEST_CATEGORIES = [
    "销售订单采购",
    "研发设计采购",
    "售后采购",
    "日常备货采购",
    "生产用料采购",
    "办公用品采购",
    "运营宣传采购",
    "其他",
] as const;

export type PurchaseRequestCategory = typeof PURCHASE_REQUEST_CATEGORIES[number];

export const PURCHASE_REQUEST_DEPARTMENTS = [
    "测试",
    "研发",
    "机械研发",
    "行政",
    "运营",
    "生产",
    "其他",
] as const;

export type PurchaseRequestDepartment = typeof PURCHASE_REQUEST_DEPARTMENTS[number];

export const PURCHASE_REQUEST_DISPLAY_STATUSES = [
    ...APPROVAL_STATUSES,
    "draft",
    "partially_ordered",
    "ordered",
] as const;

export type PurchaseRequestDisplayStatus = typeof PURCHASE_REQUEST_DISPLAY_STATUSES[number];

export interface PurchaseRequestItem {
    name: string;
    model: string;
    quantity: number;
    unit: string;
    productId?: string;
    requirementId?: string;
    shortageQuantity?: number;
    minQuantity?: number;
    bomLineKey?: string;
}

export interface PurchaseRequestSnapshot {
    requestNo: string;
    category: PurchaseRequestCategory;
    department?: PurchaseRequestDepartment | "";
    items: PurchaseRequestItem[];
    totalQuantity: number;
    images: AttachmentRef[];
    attachments: AttachmentRef[];
    attachmentText?: string;
    remark: string;
    salesOrderId?: string;
    salesOrderNo?: string;
    productionOrderId?: string;
    productionOrderNo?: string;
    inventoryReview?: InventoryReviewPurchaseContext;
    bomGroups?: PurchaseBomGroup[];
}

export interface InventoryReviewPurchaseContext {
    source: "inventory-review";
    lines: InventoryReviewResult["lines"];
}

export type ApprovalBusinessSnapshot =
    | SalesOrderApprovalSnapshot
    | ReceiptApprovalSnapshot
    | PurchaseRequestSnapshot
    | null;

export interface ApprovalBusinessSnapshotMap {
    "sales-order": SalesOrderApprovalSnapshot;
    receipt: ReceiptApprovalSnapshot;
    borrow: null;
    "purchase-request": PurchaseRequestSnapshot;
}

export interface ApprovalUser {
    adminId: string;
    username: string;
    name: string;
    role: number;
}

export interface ApprovalFlowRule {
    applicantRole: number | null;
    approverIds: string[];
    enabled: boolean;
    visibleFields?: OrderApprovalField[];
    visibleFieldsVersion?: number;
}

export interface FirstApprovalFlowStep {
    key: "first-approval";
    name: "第一审批";
    order: number;
    strategy: "sequential";
    rules: ApprovalFlowRule[];
}

export interface SecondApprovalFlowStep {
    key: "second-approval";
    name: "第二审批";
    order: number;
    strategy: "any";
    rules: ApprovalFlowRule[];
}

export interface ApprovalCcFlowStep {
    key: "cc";
    name: "抄送";
    order: number;
    rules: ApprovalFlowRule[];
    strategy?: never;
}

export interface ApprovalShootingCcFlowStep {
    key: "shooting-cc";
    name: "拍摄任务抄送";
    order: number;
    rules: ApprovalFlowRule[];
    strategy?: never;
}

export interface ThirdApprovalFlowStep {
    key: "third-approval";
    name: "第三审批";
    order: number;
    strategy: "any";
    rules: ApprovalFlowRule[];
}

export type ApprovalFlowStep =
    | FirstApprovalFlowStep
    | SecondApprovalFlowStep
    | ThirdApprovalFlowStep
    | ApprovalCcFlowStep
    | ApprovalShootingCcFlowStep;

export type ApprovalFlowSteps = ApprovalFlowStep[];

export interface ApprovalFlowConfig {
    _id?: string;
    type: ApprovalType;
    steps: ApprovalFlowSteps;
    createTime?: ApprovalDate;
    updateTime?: ApprovalDate;
}

export interface ApprovalStepUser {
    user: ApprovalUser;
    status: ApprovalStepUserStatus;
    firstViewedAt?: ApprovalDate;
    processedAt?: ApprovalDate;
    paymentConfirmedAt?: ApprovalDate;
}

export interface ApprovalStep {
    key: ApprovalStepKey;
    name: string;
    order: number;
    strategy?: ApprovalStrategy;
    status: ApprovalStepStatus;
    users: ApprovalStepUser[];
    visibleFields?: OrderApprovalField[];
    visibleFieldsVersion?: number;
}

export interface ApprovalInstance<T extends ApprovalType = ApprovalType> {
    _id: string;
    approvalNo: string;
    type: T;
    businessId: string;
    businessSnapshot: ApprovalBusinessSnapshotMap[T];
    applicant: ApprovalUser;
    status: ApprovalStatus;
    steps: ApprovalStep[];
    unreadUserIds: string[];
    rejectReason?: string;
    completedAt?: ApprovalDate;
    createTime: ApprovalDate;
    updateTime: ApprovalDate;
}
