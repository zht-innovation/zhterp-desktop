import mongoose from "mongoose";
import { Buffer } from "node:buffer";
import { useAdminModel } from "~~/server/models/admin.model";
import {
    useApprovalInstanceModel,
    type ApprovalInstanceCursor,
    type ApprovalInstanceData,
    type ApprovalInstanceListData,
} from "~~/server/models/approvalInstance.model";
import { getBorrowRequestItems, useBorrowRequestModel } from "~~/server/models/borrowRequest.model";
import { PurchaseRequest, usePurchaseRequestModel, type PurchaseRequestData } from "~~/server/models/purchaseRequest.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { useSalesOrderReceiptModel } from "~~/server/models/salesOrderReceipt.model";
import {
    approveInstance,
    cancelInstance,
    markInstanceViewed,
    rejectInstance,
    type ApprovalContext,
    type ApprovalTransactionContext,
} from "~~/server/services/approvalLifecycle";
import {
    cancelBorrowRequestApproval,
    finalizeBorrowRequestApproval,
    rejectBorrowRequestApproval,
} from "~~/server/services/borrowRequestApproval";
import {
    cancelSalesOrderReceiptApproval,
    finalizeSalesOrderReceiptApproval,
    rejectSalesOrderReceiptApproval,
} from "~~/server/services/salesOrderReceiptApproval";
import {
    finalizeSalesOrderApproval,
    notifySalesOrderFinalApproval,
} from "~~/server/services/salesOrderFinalApproval";
import {
    cancelPurchaseRequestApproval,
    finalizePurchaseRequestApproval,
    rejectPurchaseRequestApproval,
} from "~~/server/services/purchaseRequestApproval";
import { deletePurchaseRequest } from "~~/server/services/purchaseRequest";
import { logger } from "~~/server/utils/logger";
import {
    APPROVAL_STATUSES,
    APPROVAL_TYPES,
    APPROVAL_VIEWS,
    type ApprovalStatus,
    type ApprovalType,
    type ApprovalView,
} from "~~/shared/types/approval";
import type { OrderApprovalField } from "~~/shared/types/orderApproval";
import { getOrderVisibleFields, redactOrderDetail } from "~~/server/services/orderApprovalVisibility";
import { ADMIN_ROLE } from "~~/shared/enums";
import { canConfirmOrderPayment, canSubmitBorrowRequest, isElectronicsWarehouseKeeper, isReadonlyProductionRole } from "~~/shared/utils/adminPermission";
import { getSalesOrderProductSnRule, PRODUCT_SN_MAX_EXCEL_QUANTITY } from "~~/shared/utils/salesOrderProductSn";
import { getSalesOrderProductSnActivationTime, isSalesOrderProductSnEligible } from "~~/server/models/salesOrderProductSn.model";
import type { PurchaseRequestSnapshot, SalesOrderApprovalSnapshot, SalesOrderProductSnapshot } from "~~/shared/types/approval";
import type { OrderKitAnalysisRow } from "~~/shared/types/orderKitAnalysis";
import { analyzeOrderKit } from "~~/server/services/orderKitAnalysis";
import { buildInventoryReviewLockDetails } from "~~/server/services/inventoryReviewLockDetails";
import { getSalesOrderPaymentPlans, requiresSalesOrderPaymentConfirmation } from "~~/shared/utils/salesOrderPayment";

type CurrentAdmin = {
    adminId: mongoose.Types.ObjectId;
    name: string;
    role: number;
};

type BusinessRows = {
    salesOrders: Map<string, any>;
    receipts: Map<string, any>;
    borrows: Map<string, any>;
    purchaseRequests: Map<string, any>;
};

const PURCHASE_REQUEST_KIT_ANALYSIS_FIELDS: OrderApprovalField[] = [
    "productCode", "productModel", "productImage", "unitName", "quantity", "availableQuantity",
];

const supportsPurchaseRequestKitAnalysis = (
    request: Pick<PurchaseRequestData, "category" | "salesOrderId" | "inventoryReview">,
) => request.category === "销售订单采购" && Boolean(request.inventoryReview && request.salesOrderId);

export class ApprovalCenterError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

export const getApprovalCenterErrorStatus = (error: unknown) => {
    if (!(error instanceof Error)) return undefined;
    const source = error as Error & {
        status?: number;
        statusCode?: number;
    };
    return source.status ?? source.statusCode;
};

const toText = (value: unknown) => {
    const source = Array.isArray(value) ? value[0] : value;
    return source == null ? "" : String(source).trim();
};

const toObjectId = (value: unknown, label: string) => {
    const text = toText(value);
    if (!mongoose.Types.ObjectId.isValid(text)) {
        throw new ApprovalCenterError(400, `${label}不合法`);
    }
    return new mongoose.Types.ObjectId(text);
};

const toPositiveInteger = (
    value: unknown,
    fallback: number,
    maximum?: number,
) => {
    const text = toText(value);
    if (!text) return fallback;
    const number = Number(text);
    if (!Number.isInteger(number) || number <= 0) return fallback;
    return maximum ? Math.min(number, maximum) : number;
};

const toDate = (value: unknown, endOfDay = false) => {
    const text = toText(value);
    if (!text) return undefined;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
    const normalized = dateOnly
        ? `${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+08:00`
        : text;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? undefined : date;
};

const parseCursor = (value: unknown): ApprovalInstanceCursor | undefined => {
    const text = toText(value);
    if (!text) return undefined;

    try {
        const source = JSON.parse(
            Buffer.from(text, "base64url").toString("utf8"),
        ) as { createTime?: unknown; id?: unknown };
        const createTime = new Date(toText(source.createTime));
        const id = toText(source.id);
        if (Number.isNaN(createTime.getTime()) || !mongoose.Types.ObjectId.isValid(id)) {
            throw new Error("Invalid approval cursor");
        }
        return {
            createTime,
            id: new mongoose.Types.ObjectId(id),
        };
    } catch {
        throw new ApprovalCenterError(400, "分页游标不合法");
    }
};

const encodeCursor = (instance: ApprovalInstanceListData) =>
    Buffer.from(JSON.stringify({
        createTime: instance.createTime.toISOString(),
        id: instance._id.toString(),
    })).toString("base64url");

const getCurrentAdmin = async (auth: any): Promise<CurrentAdmin> => {
    const username = toText(auth?.username);
    if (!username) throw new ApprovalCenterError(401, "当前登录用户不存在");

    const admin = await useAdminModel().findAdminByUsername(username);
    if (!admin) throw new ApprovalCenterError(401, "当前登录用户不存在");
    return {
        adminId: admin._id,
        name: toText(admin.nickname) || toText(admin.username),
        role: Number(admin.role),
    };
};

const canViewEveryApproval = (role: number) =>
    role !== ADMIN_ROLE.ORDINARY_USER && role !== ADMIN_ROLE.OPERATOR;

const assertApprovalTypeAccess = (role: number, type: ApprovalType) => {
    if (isElectronicsWarehouseKeeper(role) && type !== "purchase-request") {
        throw new ApprovalCenterError(403, "电子部库管仅可处理采购申请审批");
    }
};

const assertApprovalActionAccess = async (
    admin: CurrentAdmin,
    instanceId: mongoose.Types.ObjectId,
    session?: mongoose.ClientSession,
) => {
    if (!isElectronicsWarehouseKeeper(admin.role)) return;
    const instance = await useApprovalInstanceModel().findById(instanceId, session);
    if (!instance) throw new ApprovalCenterError(404, "审批单不存在");
    assertApprovalTypeAccess(admin.role, instance.type);
};

const findPaymentConfirmationStep = (instance: ApprovalInstanceData, adminId: string) =>
    instance.steps.find((step) =>
        step.key !== "cc" && step.key !== "shooting-cc"
        && step.status === "pending"
        && step.users.some((stepUser) =>
            stepUser.status === "pending"
            && stepUser.user.adminId.toString() === adminId,
        ),
    );

const parseListQuery = (query: Record<string, unknown>, admin: CurrentAdmin) => {
    const viewText = toText(query.view) || "pending";
    const view = APPROVAL_VIEWS.includes(viewText as ApprovalView)
        ? viewText as ApprovalView
        : "pending";
    const typeText = toText(query.type);
    const type = APPROVAL_TYPES.includes(typeText as ApprovalType)
        ? typeText as ApprovalType
        : undefined;

    const statusText = toText(query.status);
    const status = APPROVAL_STATUSES.includes(statusText as ApprovalStatus)
        ? statusText as ApprovalStatus
        : undefined;
    const sort = toText(query.sort) === "asc" ? "asc" : "desc";

    const applicantText = toText(query.applicantId);
    const submittedStart = toDate(query.submittedStart);
    const submittedEnd = toDate(query.submittedEnd, true);
    const completedStart = toDate(query.completedStart);
    const completedEnd = toDate(query.completedEnd, true);
    const cursor = parseCursor(query.cursor);

    return {
        view,
        keyword: toText(query.keyword),
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
        ...(applicantText
            ? { applicantId: toObjectId(applicantText, "申请人ID") }
            : {}),
        unreadOnly: toText(query.unreadOnly) === "true",
        sort,
        ...(submittedStart ? { submittedStart } : {}),
        ...(submittedEnd ? { submittedEnd } : {}),
        ...(completedStart ? { completedStart } : {}),
        ...(completedEnd ? { completedEnd } : {}),
        ...(cursor ? { cursor } : {}),
        pageSize: toPositiveInteger(query.pageSize, 20, 100),
    };
};

const loadBusinessRows = async (
    instances: Array<Pick<ApprovalInstanceData, "type" | "businessId">>,
    mode: "summary" | "detail",
): Promise<BusinessRows> => {
    const idsByType = instances.reduce<Record<ApprovalType, mongoose.Types.ObjectId[]>>(
        (result, instance) => {
            result[instance.type].push(instance.businessId);
            return result;
        },
        { "sales-order": [], receipt: [], borrow: [], "purchase-request": [] },
    );
    const [salesOrders, receipts, borrows, purchaseRequests] = await Promise.all([
        useSalesOrderModel().findByIds(idsByType["sales-order"], mode),
        useSalesOrderReceiptModel().findByIds(idsByType.receipt, mode),
        useBorrowRequestModel().findByIds(idsByType.borrow, mode),
        usePurchaseRequestModel().findByIds(idsByType["purchase-request"]),
    ]);
    const toMap = (rows: any[]) => new Map(
        rows.map((row) => [row._id?.toString?.() || "", row]),
    );
    return {
        salesOrders: toMap(salesOrders),
        receipts: toMap(receipts),
        borrows: toMap(borrows),
        purchaseRequests: toMap(purchaseRequests),
    };
};

const serializeUser = (user: ApprovalInstanceData["applicant"]) => ({
    adminId: user.adminId.toString(),
    username: user.username,
    name: user.name,
    role: user.role,
});

const serializeSnapshot = (instance: ApprovalInstanceData) => {
    if (instance.type !== "sales-order" || !instance.businessSnapshot) {
        return instance.businessSnapshot;
    }
    const snapshot = instance.businessSnapshot as Record<string, any>;
    return {
        ...snapshot,
        ...(snapshot.salespersonId
            ? { salespersonId: snapshot.salespersonId.toString() }
            : {}),
    };
};

const serializeInstance = (instance: ApprovalInstanceData, currentAdminId: string) => ({
    id: instance._id.toString(),
    approvalNo: instance.approvalNo,
    type: instance.type,
    businessId: instance.businessId.toString(),
    businessSnapshot: serializeSnapshot(instance),
    applicant: serializeUser(instance.applicant),
    status: instance.status,
    steps: (instance.steps || []).map((step) => ({
        ...step,
        users: step.users.map((stepUser) => ({
            ...stepUser,
            user: serializeUser(stepUser.user),
        })),
    })),
    unreadUserIds: (instance.unreadUserIds || []).map((userId) => userId.toString()),
    unread: (instance.unreadUserIds || []).some(
        (userId) => userId.toString() === currentAdminId,
    ),
    ...(instance.rejectReason ? { rejectReason: instance.rejectReason } : {}),
    ...(instance.completedAt ? { completedAt: instance.completedAt } : {}),
    createTime: instance.createTime,
    updateTime: instance.updateTime,
});

const typeName = (type: ApprovalType) => ({
    "sales-order": "销售订单审批",
    receipt: "回款申请",
    borrow: "借用申请",
    "purchase-request": "采购申请",
})[type];

const SALES_ORDER_SUMMARY_VISIBLE_ROLES = new Set<number>([
    ADMIN_ROLE.SUPER,
    ADMIN_ROLE.FINANCE,
    ADMIN_ROLE.FINANCE_MANAGER,
]);

const canViewSalesOrderSummary = (
    instance: ApprovalInstanceListData,
    currentAdminId: string,
    currentRole: number,
) => instance.applicant.adminId.toString() === currentAdminId
    || SALES_ORDER_SUMMARY_VISIBLE_ROLES.has(currentRole);

const getBusinessRow = (
    instance: ApprovalInstanceData | ApprovalInstanceListData,
    rows: BusinessRows,
) => {
    const id = instance.businessId.toString();
    if (instance.type === "sales-order") return rows.salesOrders.get(id);
    if (instance.type === "receipt") return rows.receipts.get(id);
    if (instance.type === "purchase-request") {
        const request = rows.purchaseRequests.get(id);
        const snapshot = instance.businessSnapshot as Partial<PurchaseRequestSnapshot> | null;
        if (!request && !snapshot) return undefined;
        const category = snapshot?.category ?? request?.category;
        const sameCategory = !snapshot?.category || snapshot.category === request?.category;
        const bomGroups = snapshot ? snapshot.bomGroups : request?.bomGroups;
        return {
            ...request,
            ...snapshot,
            _id: instance.businessId,
            applicantId: instance.applicant.adminId,
            applicantUsername: instance.applicant.username,
            applicantName: instance.applicant.name,
            applicantRole: instance.applicant.role,
            category,
            salesOrderId: category === "销售订单采购"
                ? snapshot?.salesOrderId ?? (sameCategory ? request?.salesOrderId : undefined)
                : undefined,
            salesOrderNo: category === "销售订单采购"
                ? snapshot?.salesOrderNo ?? (sameCategory ? request?.salesOrderNo : undefined)
                : undefined,
            productionOrderId: category === "生产用料采购"
                ? snapshot?.productionOrderId ?? (sameCategory ? request?.productionOrderId : undefined)
                : undefined,
            productionOrderNo: category === "生产用料采购"
                ? snapshot?.productionOrderNo ?? (sameCategory ? request?.productionOrderNo : undefined)
                : undefined,
            bomGroups: category === "销售订单采购" ? bomGroups ?? [] : [],
            inventoryReview: category === "销售订单采购"
                ? snapshot?.inventoryReview ?? request?.inventoryReview
                : undefined,
            status: instance.status,
            createTime: instance.createTime,
        };
    }
    return rows.borrows.get(id);
};

const toSummary = (
    instance: ApprovalInstanceListData,
    business: any,
    currentAdminId: string,
    currentRole: number,
) => {
    if (!business) return [];
    if (instance.type === "sales-order") {
        const snapshot = instance.businessSnapshot;
        const canViewSensitiveData = canViewSalesOrderSummary(
            instance,
            currentAdminId,
            currentRole,
        );
        return [
            { label: "订单编号", value: toText(business.orderNo) },
            {
                label: "客户",
                value: canViewSensitiveData ? snapshot?.customerName || "" : "******",
            },
            {
                label: "订单金额",
                value: canViewSensitiveData
                    ? `${snapshot?.amount ?? 0} ${snapshot?.currency || ""}`.trim()
                    : "******",
            },
        ];
    }
    if (instance.type === "receipt") {
        return [
            { label: "回款单号", value: toText(business.receiptNo) },
            { label: "关联订单", value: toText(business.orderNo) },
            {
                label: "回款金额",
                value: `${Number(business.amount || 0)} ${toText(business.currency)}`.trim(),
            },
        ];
    }
    if (instance.type === "purchase-request") {
        return [
            { label: "申请编号", value: toText(business.requestNo) },
            { label: "采购类别", value: toText(business.category) },
            {
                label: "明细/总数量",
                value: `${business.items?.length || 0}项 / ${Number(business.totalQuantity || 0)}`,
            },
        ];
    }
    const borrowItems = getBorrowRequestItems(business);
    const firstBorrowItem = borrowItems[0];
    const totalBorrowQuantity = borrowItems.reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0,
    );
    const firstBorrowMaterial = firstBorrowItem
        ? (firstBorrowItem.materialName || firstBorrowItem.materialModel)
        : "";
    return [
        { label: "借用单号", value: toText(business.requestNo) },
        {
            label: "借用物料",
            value: borrowItems.length > 1
                ? `${firstBorrowMaterial}等 ${borrowItems.length}项`
                : firstBorrowMaterial,
        },
        {
            label: "借用数量",
            value: `${borrowItems.length} 项`,
        },
    ];
};

const toListItem = (
    instance: ApprovalInstanceListData,
    business: any,
    currentAdminId: string,
    currentRole: number,
) => ({
    id: instance._id.toString(),
    approvalNo: instance.approvalNo,
    type: instance.type,
    businessId: instance.businessId.toString(),
    title: `${instance.applicant.name}提交的${typeName(instance.type)}`,
    applicant: serializeUser(instance.applicant),
    status: instance.status,
    unread: (instance.unreadUserIds || []).some(
        (userId) => userId.toString() === currentAdminId,
    ),
    createTime: instance.createTime,
    ...(instance.completedAt ? { completedAt: instance.completedAt } : {}),
    summary: toSummary(instance, business, currentAdminId, currentRole),
});

const buildBusinessDetail = (instance: ApprovalInstanceData, rows: BusinessRows) => {
    const business = getBusinessRow(instance, rows);

    if (instance.type === "sales-order") {
        const snapshotValue = serializeSnapshot(instance);
        const snapshot = (snapshotValue || {}) as Record<string, any>;
        if (!business && !snapshotValue) {
            throw new ApprovalCenterError(404, "审批关联业务数据不存在");
        }

        return {
            kind: "sales-order",
            order: {
                id: business?._id?.toString?.() || instance.businessId.toString(),
                orderNo: toText(business?.orderNo) || toText(snapshot?.orderNo),
                orderName: toText(business?.orderName) || toText(snapshot?.orderName),
                customerId: business?.customerId?.toString?.() || toText(snapshot?.customerId),
                customerName: toText(business?.customerName) || toText(snapshot?.customerName),
                customerCompany: toText(business?.customerCompany) || toText(snapshot?.customerCompany),
                customerRegion: toText(business?.customerRegion) || toText(snapshot?.customerRegion),
                ...snapshot,
                machineNo: business ? toText(business.machineNo) : toText(snapshot.machineNo),
                createTime: business?.createTime || instance.createTime,
            },
        };
    }

    if (!business) {
        throw new ApprovalCenterError(404, "审批关联业务数据不存在");
    }

    if (instance.type === "receipt") {
        const order = rows.salesOrders.get(business.salesOrderId?.toString?.() || "");
        if (!order) {
            throw new ApprovalCenterError(404, "回款关联销售订单不存在");
        }
        const snapshot = instance.businessSnapshot as Record<string, any>;
        const receivedAmountBefore = Number(snapshot?.receivedAmountBefore || 0);
        const receivedAmountAfter = receivedAmountBefore + Number(business.amount || 0);
        const actualReceivableAmount = Number(order.actualReceivableAmount || 0);
        return {
            kind: "receipt",
            receipt: {
                id: business._id.toString(),
                receiptNo: toText(business.receiptNo),
                salesOrderId: business.salesOrderId.toString(),
                orderNo: toText(business.orderNo),
                customerId: business.customerId?.toString?.() || "",
                customerName: toText(business.customerName),
                salespersonId: business.salespersonId?.toString?.() || "",
                salespersonName: toText(business.salespersonName),
                receivableOrder: toText(business.receivableOrder),
                amount: Number(business.amount || 0),
                paymentDate: business.paymentDate,
                currency: toText(business.currency),
                remark: toText(business.remark),
                attachments: Array.isArray(business.attachments)
                    ? business.attachments
                    : [],
                status: toText(business.status),
                createTime: business.createTime,
            },
            order: {
                id: order._id.toString(),
                orderNo: toText(order.orderNo),
                customerId: order.customerId?.toString?.() || "",
                customerName: toText(order.customerName),
                customerCompany: toText(order.customerCompany),
                customerRegion: toText(order.customerRegion),
                salespersonId: order.salespersonId?.toString?.() || "",
                salespersonName: toText(order.salespersonName),
                orderType: toText(order.orderType),
                amount: Number(order.amount || 0),
                currency: toText(order.currency),
                orderDate: order.orderDate,
                durationDays: Number(order.durationDays || 0),
                receivableOrder: toText(order.receivableOrder),
                receivableDate: order.receivableDate,
                incomeCategory: toText(order.incomeCategory),
                plannedPaymentDate: order.plannedPaymentDate,
                plannedPaymentAmount: Number(order.plannedPaymentAmount || 0),
                plannedPayments: getSalesOrderPaymentPlans(order),
                actualReceivableAmount,
                receivableRemark: toText(order.receivableRemark),
                receivableAttachments: Array.isArray(order.receivableAttachments)
                    ? order.receivableAttachments
                    : [],
            },
            receivedAmountBefore,
            receivedAmountAfter,
            paymentProgressAfter: actualReceivableAmount > 0
                ? Math.min(
                    100,
                    Number(((receivedAmountAfter / actualReceivableAmount) * 100).toFixed(2)),
                )
                : 0,
        };
    }

    if (instance.type === "purchase-request") {
        const order = business.category === "销售订单采购"
            ? rows.salesOrders.get(business.salesOrderId?.toString?.() || "")
            : null;
        return {
            kind: "purchase-request",
            kitAnalysisVisibleFields: supportsPurchaseRequestKitAnalysis(business) && order && !order._isDeleted
                ? [...PURCHASE_REQUEST_KIT_ANALYSIS_FIELDS]
                : [],
            request: {
                id: business._id.toString(),
                requestNo: toText(business.requestNo),
                applicantId: business.applicantId?.toString?.() || "",
                applicantUsername: toText(business.applicantUsername),
                applicantName: toText(business.applicantName),
                applicantRole: Number(business.applicantRole),
                category: toText(business.category),
                department: toText(business.department),
                items: Array.isArray(business.items) ? business.items : [],
                ...(Array.isArray(business.bomGroups) ? { bomGroups: business.bomGroups } : {}),
                totalQuantity: Number(business.totalQuantity || 0),
                ...(business.inventoryReview ? { inventoryReview: business.inventoryReview } : {}),
                images: Array.isArray(business.images) ? business.images : [],
                attachments: Array.isArray(business.attachments) ? business.attachments : [],
                attachmentText: typeof business.attachmentText === "string" ? business.attachmentText : "",
                remark: toText(business.remark),
                ...(business.salesOrderId
                    ? { salesOrderId: business.salesOrderId.toString?.() || String(business.salesOrderId) }
                    : {}),
                ...(business.salesOrderNo ? { salesOrderNo: toText(business.salesOrderNo) } : {}),
                ...(business.productionOrderId
                    ? { productionOrderId: business.productionOrderId.toString?.() || String(business.productionOrderId) }
                    : {}),
                ...(business.productionOrderNo ? { productionOrderNo: toText(business.productionOrderNo) } : {}),
                status: toText(business.status),
                createTime: business.createTime,
            },
            ...(order ? {
                order: {
                    orderNo: toText(order.orderNo),
                    salespersonName: toText(order.salespersonName),
                    orderType: toText(order.orderType),
                    products: Array.isArray(order.products)
                        ? order.products.map((product: any) => ({
                            productCode: toText(product?.productCode),
                            model: toText(product?.model),
                            image: toText(product?.image),
                            availableQuantity: product?.availableQuantity == null
                                ? undefined
                                : Number(product.availableQuantity),
                            unitName: toText(product?.unitName),
                            source: toText(product?.source),
                            remark: toText(product?.remark),
                        }))
                        : [],
                },
            } : {}),
        };
    }

    const borrowItems = getBorrowRequestItems(business).map((item) => ({
        ...item,
        materialId: item.materialId?.toString?.() || "",
    }));
    const firstBorrowItem = borrowItems[0] || {
        materialId: "",
        materialCode: "",
        materialName: "",
        materialModel: "",
        materialUnitName: "",
        image: "",
        quantity: 0,
    };
    return {
        kind: "borrow",
        request: {
            id: business._id.toString(),
            requestNo: toText(business.requestNo),
            applicantId: business.applicantId?.toString?.() || "",
            applicantUsername: toText(business.applicantUsername),
            applicantName: toText(business.applicantName),
            applicantRole: Number(business.applicantRole),
            borrower: toText(business.borrower),
            items: borrowItems,
            materialId: business.materialId?.toString?.() || firstBorrowItem.materialId,
            materialCode: toText(business.materialCode) || firstBorrowItem.materialCode,
            materialName: toText(business.materialName) || firstBorrowItem.materialName,
            materialModel: toText(business.materialModel) || firstBorrowItem.materialModel,
            materialUnitName: toText(business.materialUnitName) || firstBorrowItem.materialUnitName,
            image: toText(business.image) || firstBorrowItem.image,
            quantity: Number(business.quantity || firstBorrowItem.quantity || 0),
            expectedReturnDate: business.expectedReturnDate,
            reason: toText(business.reason),
            status: toText(business.status),
            createTime: business.createTime,
        },
    };
};

export const retrieveApprovals = async (
    auth: any,
    rawQuery: Record<string, unknown>,
) => {
    const admin = await getCurrentAdmin(auth);
    if (isElectronicsWarehouseKeeper(admin.role)) {
        throw new ApprovalCenterError(403, "请通过采购申请页面查看采购申请");
    }
    const query = parseListQuery(rawQuery, admin);
    if (query.view === "all" && admin.role !== ADMIN_ROLE.SUPER) {
        throw new ApprovalCenterError(403, "仅超级管理员可以查看全部审批单");
    }
    const approvalModel = useApprovalInstanceModel();
    const [result, unreadCounts, pendingCount] = await Promise.all([
        approvalModel.retrieve({
            ...query,
            userId: admin.adminId,
            applicantOnly: admin.role === ADMIN_ROLE.ORDINARY_USER,
        }),
        approvalModel.countUnreadByView(
            admin.adminId,
            admin.role === ADMIN_ROLE.ORDINARY_USER,
        ),
        approvalModel.countPending(
            admin.adminId,
            admin.role === ADMIN_ROLE.ORDINARY_USER,
        ),
    ]);
    const businessRows = await loadBusinessRows(result.list, "summary");
    const currentAdminId = admin.adminId.toString();

    return {
        items: result.list.map((instance) =>
            toListItem(
                instance,
                getBusinessRow(instance, businessRows),
                currentAdminId,
                admin.role,
            ),
        ),
        pagination: {
            ...result.pagination,
            ...(result.pagination.hasMore && result.list.length > 0
                ? { nextCursor: encodeCursor(result.list[result.list.length - 1]!) }
                : {}),
        },
        unreadCounts,
        pendingCount,
    };
};

export const retrieveApprovalInventoryReviewLocks = async (auth: any, id: unknown, productId: unknown) => {
    const admin = await getCurrentAdmin(auth);
    const instanceId = toObjectId(id, "审批单ID");
    const instance = await useApprovalInstanceModel().findVisibleById(
        instanceId,
        admin.adminId,
        canViewEveryApproval(admin.role),
        admin.role === ADMIN_ROLE.ORDINARY_USER,
    );
    if (!instance) throw new ApprovalCenterError(404, "审批单不存在或无权查看");
    assertApprovalTypeAccess(admin.role, instance.type);
    if (instance.type !== "purchase-request") throw new ApprovalCenterError(400, "该审批类型不支持仓库复核锁定明细");

    const normalizedProductId = toObjectId(productId, "产品ID").toString();
    const request = await PurchaseRequest.findById(instance.businessId)
        .select("+inventoryReviewLockSnapshot").lean<PurchaseRequestData>();
    if (!request) throw new ApprovalCenterError(404, "审批关联采购申请不存在");
    if (!supportsPurchaseRequestKitAnalysis(request)) {
        throw new ApprovalCenterError(400, "仅带仓库复核依据的销售订单采购申请支持锁定明细");
    }
    const line = request.inventoryReview?.lines.find((item) => item.productId === normalizedProductId);
    if (!line) throw new ApprovalCenterError(404, "该产品不在本次仓库复核依据中");
    return await buildInventoryReviewLockDetails(auth, line, request.inventoryReviewLockSnapshot);
};

export const retrieveApprovalDetail = async (auth: any, id: unknown) => {
    const admin = await getCurrentAdmin(auth);
    const instanceId = toObjectId(id, "审批单ID");
    const instance = await useApprovalInstanceModel().findVisibleById(
        instanceId,
        admin.adminId,
        canViewEveryApproval(admin.role),
        admin.role === ADMIN_ROLE.ORDINARY_USER,
    );
    if (!instance) {
        throw new ApprovalCenterError(404, "审批单不存在或无权查看");
    }
    assertApprovalTypeAccess(admin.role, instance.type);
    const businessRows = await loadBusinessRows([instance], "detail");
    if (instance.type === "receipt") {
        const receipt = businessRows.receipts.get(instance.businessId.toString());
        const orderId = receipt?.salesOrderId;
        if (orderId) {
            const orders = await useSalesOrderModel().findByIds([orderId], "detail");
            businessRows.salesOrders = new Map(
                orders.map((order: any) => [order._id.toString(), order]),
            );
        }
    }
    if (instance.type === "purchase-request") {
        const request = getBusinessRow(instance, businessRows);
        if (request?.category === "销售订单采购" && request.salesOrderId) {
            const order = await useSalesOrderModel().findPurchaseRequestOrderDetail(request.salesOrderId);
            if (order) {
                businessRows.salesOrders.set(request.salesOrderId.toString(), order);
            }
        }
    }
    const currentAdminId = admin.adminId.toString();
    const visibleOrderFields = instance.type === "sales-order"
        ? getOrderVisibleFields(instance, currentAdminId)
        : null;
    const serializedInstance = serializeInstance(instance, currentAdminId);
    const canReview = instance.status === "pending" && instance.steps.some((step) =>
        step.status === "pending"
        && step.users.some((stepUser) =>
            stepUser.status === "pending"
            && stepUser.user.adminId.toString() === currentAdminId,
        ),
    );
    const paymentStep = instance.type === "sales-order" && canReview
        ? findPaymentConfirmationStep(instance, currentAdminId)
        : undefined;
    const paymentUser = paymentStep?.users.find((stepUser) =>
        stepUser.user.adminId.toString() === currentAdminId,
    );
    const canConfirmPayment = Boolean(paymentUser) && canConfirmOrderPayment(admin.role);

    let productSnExportEligible = false;
    let productSnExportUnavailableReason = "";
    if (instance.type === "sales-order" && instance.status === "approved"
        && isReadonlyProductionRole(admin.role)
        && visibleOrderFields?.includes("productCode") && visibleOrderFields.includes("quantity")) {
        const [processed, order] = await Promise.all([
            useApprovalInstanceModel().findProcessedById(instanceId, admin.adminId),
            useSalesOrderModel().findProductSnExportOrder(instance.businessId),
        ]);
        productSnExportEligible = Boolean(processed && isSalesOrderProductSnEligible(order?.createTime));
        if (processed && order && !productSnExportEligible) {
            const activationTime = getSalesOrderProductSnActivationTime();
            const activationText = activationTime ? new Date(activationTime).toLocaleString("zh-CN", {
                timeZone: "Asia/Shanghai", hour12: false,
            }) : "";
            productSnExportUnavailableReason = activationTime
                ? `该订单创建于 S/N 下载启用时间（${activationText}）之前，暂不提供下载。`
                : "S/N 下载暂未就绪，请联系管理员。";
        }
    }

    return {
        ...serializedInstance,
        ...(visibleOrderFields
            ? {
                businessSnapshot: redactOrderDetail(
                    { order: serializedInstance.businessSnapshot || {} },
                    visibleOrderFields,
                ).order,
            }
            : {}),
        title: `${instance.applicant.name}提交的${typeName(instance.type)}`,
        business: instance.type === "sales-order"
            ? redactOrderDetail(
                buildBusinessDetail(instance, businessRows),
                visibleOrderFields!,
            )
            : buildBusinessDetail(instance, businessRows),
        canApprove: canReview,
        canReject: canReview,
        canConfirmPayment,
        paymentConfirmationRequired: canConfirmPayment && requiresSalesOrderPaymentConfirmation(instance.businessSnapshot),
        paymentConfirmed: Boolean(paymentUser?.paymentConfirmedAt),
        canCancel: instance.status === "pending"
            && instance.applicant.adminId.toString() === currentAdminId,
        canReapply: instance.type === "borrow"
            && instance.status === "rejected"
            && instance.applicant.adminId.toString() === currentAdminId
            && canSubmitBorrowRequest(admin.role)
            && businessRows.borrows.has(instance.businessId.toString()),
        productSnExportEligible,
        productSnExportUnavailableReason,
    };
};

export const retrieveApprovalKitAnalysis = async (auth: any, id: unknown) => {
    const admin = await getCurrentAdmin(auth);
    const instanceId = toObjectId(id, "审批单ID");
    const instance = await useApprovalInstanceModel().findVisibleById(
        instanceId,
        admin.adminId,
        canViewEveryApproval(admin.role),
        admin.role === ADMIN_ROLE.ORDINARY_USER,
    );
    if (!instance) throw new ApprovalCenterError(404, "审批单不存在或无权查看");
    assertApprovalTypeAccess(admin.role, instance.type);
    let fields: OrderApprovalField[];
    let salesOrderId: string;
    let products: SalesOrderProductSnapshot[];
    if (instance.type === "sales-order") {
        fields = getOrderVisibleFields(instance, admin.adminId.toString());
        const snapshot = instance.businessSnapshot as SalesOrderApprovalSnapshot | null;
        salesOrderId = instance.businessId.toString();
        products = snapshot?.products || [];
    } else if (instance.type === "purchase-request") {
        const [request] = await usePurchaseRequestModel().findByIds([instance.businessId]);
        if (!request) throw new ApprovalCenterError(404, "审批关联采购申请不存在");
        if (!supportsPurchaseRequestKitAnalysis(request)) {
            throw new ApprovalCenterError(400, "仅带仓库复核依据的销售订单采购申请支持齐套分析");
        }
        const orderId = toObjectId(request.salesOrderId, "关联销售订单ID");
        const order = await useSalesOrderModel().findPurchaseRequestOrderDetail(orderId);
        if (!order || order._isDeleted) {
            throw new ApprovalCenterError(404, "关联销售订单不存在或已删除");
        }
        fields = [...PURCHASE_REQUEST_KIT_ANALYSIS_FIELDS];
        salesOrderId = orderId.toString();
        products = Array.isArray(order.products) ? order.products : [];
    } else {
        throw new ApprovalCenterError(400, "该审批类型不支持齐套分析");
    }
    if (!fields.includes("productCode") || !fields.includes("quantity") || !fields.includes("availableQuantity")) {
        throw new ApprovalCenterError(403, "无权查看产品编号、销售数量或可用数量，无法进行齐套分析");
    }
    const analysis = await analyzeOrderKit(salesOrderId, products);
    const redactRows = (rows: OrderKitAnalysisRow[]): OrderKitAnalysisRow[] => {
        const result: OrderKitAnalysisRow[] = [];
        for (const row of rows) {
            result.push({
                ...row,
                productId: undefined,
                productName: fields.includes("productModel") ? row.productName : "",
                model: fields.includes("productModel") ? row.model : "",
                image: fields.includes("productImage") ? row.image : "",
                unitName: fields.includes("unitName") ? row.unitName : "",
                children: redactRows(row.children),
            });
        }
        return result;
    };
    return { ...analysis, rows: redactRows(analysis.rows), visibleFields: fields };
};

export const getSalesOrderProductSnExportContext = async (
    auth: any,
    id: unknown,
    productIndex: unknown,
    session: mongoose.ClientSession,
) => {
    const admin = await getCurrentAdmin(auth);
    if (!isReadonlyProductionRole(admin.role)) {
        throw new ApprovalCenterError(403, "仅生产管理可以下载销售订单 S/N");
    }
    if (typeof productIndex !== "number" || !Number.isInteger(productIndex) || productIndex < 0) {
        throw new ApprovalCenterError(400, "产品行索引不合法");
    }
    const instanceId = toObjectId(id, "审批单ID");
    const instance = await useApprovalInstanceModel().findProcessedById(instanceId, admin.adminId, session);
    if (!instance) throw new ApprovalCenterError(404, "审批单不存在或不在本人已处理中");
    if (instance.type !== "sales-order" || instance.status !== "approved") {
        throw new ApprovalCenterError(403, "仅审核通过的销售订单可以下载 S/N");
    }
    const fields = getOrderVisibleFields(instance, admin.adminId.toString());
    if (!fields.includes("productCode") || !fields.includes("quantity")) {
        throw new ApprovalCenterError(403, "无权查看产品编号或销售数量");
    }
    const order = await useSalesOrderModel().findProductSnExportOrder(instance.businessId, session);
    if (!order) throw new ApprovalCenterError(404, "销售订单不存在或已删除");
    if (!isSalesOrderProductSnEligible(order.createTime)) {
        throw new ApprovalCenterError(403, "S/N 下载未启用或该订单为启用前创建的历史订单");
    }
    const snapshot = instance.businessSnapshot as SalesOrderApprovalSnapshot | null;
    const product = snapshot?.products?.[productIndex];
    if (!product) throw new ApprovalCenterError(400, "审批快照中不存在该产品行");
    const productCode = product.productCode || "";
    if (!getSalesOrderProductSnRule(productCode)) {
        throw new ApprovalCenterError(400, "该产品未配置起始 S/N");
    }
    const quantity = product.quantity;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
        throw new ApprovalCenterError(400, "销售数量必须为正整数");
    }
    if (quantity > PRODUCT_SN_MAX_EXCEL_QUANTITY) {
        throw new ApprovalCenterError(400, "销售数量超出 Excel 单表容量");
    }
    return { admin, instance, productCode, quantity, productIndex };
};

const finalizeBusiness = async (
    context: ApprovalTransactionContext,
    actor: string,
) => {
    const input = {
        actor,
        session: context.session,
    };
    const businessId = context.instance.businessId.toString();
    if (context.instance.type === "sales-order") {
        return await finalizeSalesOrderApproval({
            ...input,
            salesOrderId: businessId,
        });
    }
    if (context.instance.type === "receipt") {
        return await finalizeSalesOrderReceiptApproval({
            ...input,
            receiptId: businessId,
        });
    }
    if (context.instance.type === "purchase-request") {
        return await finalizePurchaseRequestApproval({
            ...input,
            purchaseRequestId: businessId,
        });
    }
    return await finalizeBorrowRequestApproval({
        ...input,
        borrowRequestId: businessId,
    });
};

const rejectBusiness = async (
    context: ApprovalTransactionContext,
    actor: string,
) => {
    const businessId = context.instance.businessId.toString();
    if (context.instance.type === "sales-order") {
        return await useSalesOrderModel().updateStatus(
            businessId,
            "已驳回",
            actor,
            context.session,
            {
                expectedStatus: "待审核",
                rejectionReason: context.instance.rejectReason,
                rejectionInstanceId: context.instance._id,
            },
        );
    }
    if (context.instance.type === "receipt") {
        return await rejectSalesOrderReceiptApproval({
            receiptId: businessId,
            actor,
            session: context.session,
        });
    }
    if (context.instance.type === "purchase-request") {
        return await rejectPurchaseRequestApproval({
            purchaseRequestId: businessId,
            actor,
            session: context.session,
        });
    }
    return await rejectBorrowRequestApproval({
        borrowRequestId: businessId,
        actor,
        session: context.session,
    });
};

const cancelBusiness = async (
    context: ApprovalTransactionContext,
    actor: string,
) => {
    const businessId = context.instance.businessId.toString();
    if (context.instance.type === "sales-order") {
        return await useSalesOrderModel().updateStatus(
            businessId,
            "草稿",
            actor,
            context.session,
        );
    }
    if (context.instance.type === "receipt") {
        return await cancelSalesOrderReceiptApproval({
            receiptId: businessId,
            actor,
            session: context.session,
        });
    }
    if (context.instance.type === "purchase-request") {
        return await cancelPurchaseRequestApproval({
            purchaseRequestId: businessId,
            actor,
            session: context.session,
        });
    }
    return await cancelBorrowRequestApproval({
        borrowRequestId: businessId,
        actor,
        session: context.session,
    });
};

const actionResult = (context: ApprovalContext, adminId: string) => ({
    event: context.event,
    instance: serializeInstance(context.instance, adminId),
});

export const confirmOrderPayment = async (auth: any, id: unknown) => {
    const admin = await getCurrentAdmin(auth);
    if (!canConfirmOrderPayment(admin.role)) {
        throw new ApprovalCenterError(403, "仅超级管理员和财务经理可以确认用户打款");
    }
    const instanceId = toObjectId(id, "审批单ID");
    const adminId = admin.adminId.toString();
    const approvalModel = useApprovalInstanceModel();
    const session = await mongoose.startSession();
    let confirmed: ApprovalInstanceData | null = null;
    try {
        await session.withTransaction(async () => {
            const instance = await approvalModel.findById(instanceId, session);
            if (!instance || instance.type !== "sales-order") {
                throw new ApprovalCenterError(404, "订单审批单不存在");
            }
            if (instance.status !== "pending") {
                throw new ApprovalCenterError(409, "审批状态已变化，请刷新后重试");
            }
            const step = findPaymentConfirmationStep(instance, adminId);
            if (!step) {
                throw new ApprovalCenterError(403, "当前用户没有可处理的订单审批步骤");
            }
            const order = await useSalesOrderModel().findActiveById(
                instance.businessId.toString(),
                session,
            );
            if (!order || order.status !== "待审核") {
                throw new ApprovalCenterError(409, "订单不存在或已不在待审核状态");
            }
            const stepUser = step.users.find((user) =>
                user.status === "pending" && user.user.adminId.toString() === adminId,
            )!;
            if (stepUser.paymentConfirmedAt) {
                confirmed = instance;
                return;
            }
            stepUser.paymentConfirmedAt = new Date();
            confirmed = await approvalModel.transitionPendingStep({
                instanceId,
                stepKey: step.key,
                userId: admin.adminId,
                expectedUpdateTime: instance.updateTime,
                status: "pending",
                steps: instance.steps,
                unreadUserIds: instance.unreadUserIds,
            }, session);
            if (!confirmed) {
                throw new ApprovalCenterError(409, "审批状态已变化，请刷新后重试");
            }
        });
    } finally {
        await session.endSession();
    }
    if (!confirmed) throw new Error("打款确认未完成");
    return { id: instanceId.toString(), paymentConfirmed: true };
};

export const approveApproval = async (auth: any, id: unknown) => {
    const admin = await getCurrentAdmin(auth);
    const instanceId = toObjectId(id, "审批单ID");
    const session = await mongoose.startSession();
    let context: ApprovalContext | null = null;
    let approvedSalesOrder: any = null;
    try {
        await session.withTransaction(async () => {
            await assertApprovalActionAccess(admin, instanceId, session);
            context = await approveInstance({
                instanceId,
                actorId: admin.adminId,
                actorRole: admin.role,
                session,
                onFinalApproved: async (approvalContext) => {
                    const result = await finalizeBusiness(approvalContext, admin.name);
                    if (approvalContext.instance.type === "sales-order") {
                        approvedSalesOrder = result;
                    }
                },
            });
        });
    } finally {
        await session.endSession();
    }
    if (!context) throw new Error("审批操作未完成");

    if (approvedSalesOrder) {
        try {
            await notifySalesOrderFinalApproval(
                approvedSalesOrder,
                context.instance._id.toString(),
            );
        } catch (error) {
            logger.error("Notify sales order final approval error", error);
        }
    }
    return actionResult(context, admin.adminId.toString());
};

export const rejectApproval = async (
    auth: any,
    id: unknown,
    reason: unknown,
) => {
    const admin = await getCurrentAdmin(auth);
    const instanceId = toObjectId(id, "审批单ID");
    const rejectReason = toText(reason);
    if (!rejectReason) throw new ApprovalCenterError(400, "请填写驳回原因");

    const session = await mongoose.startSession();
    let context: ApprovalContext | null = null;
    try {
        await session.withTransaction(async () => {
            await assertApprovalActionAccess(admin, instanceId, session);
            context = await rejectInstance({
                instanceId,
                actorId: admin.adminId,
                rejectReason,
                session,
                onRejected: async (approvalContext) => {
                    await rejectBusiness(approvalContext, admin.name);
                },
            });
        });
    } finally {
        await session.endSession();
    }
    if (!context) throw new Error("驳回操作未完成");
    return actionResult(context, admin.adminId.toString());
};

export const cancelApproval = async (auth: any, id: unknown) => {
    const admin = await getCurrentAdmin(auth);
    const instanceId = toObjectId(id, "审批单ID");
    const session = await mongoose.startSession();
    let context: ApprovalContext | null = null;
    try {
        await session.withTransaction(async () => {
            await assertApprovalActionAccess(admin, instanceId, session);
            context = await cancelInstance({
                instanceId,
                actorId: admin.adminId,
                session,
                onCancelled: async (approvalContext) => {
                    await cancelBusiness(approvalContext, admin.name);
                },
            });
        });
    } finally {
        await session.endSession();
    }
    if (!context) throw new Error("撤销操作未完成");
    return actionResult(context, admin.adminId.toString());
};

export const readApproval = async (auth: any, id: unknown) => {
    const admin = await getCurrentAdmin(auth);
    const instanceId = toObjectId(id, "审批单ID");
    await assertApprovalActionAccess(admin, instanceId);
    const instance = await markInstanceViewed({
        instanceId,
        userId: admin.adminId,
        canViewAll: canViewEveryApproval(admin.role),
    });
    return serializeInstance(instance, admin.adminId.toString());
};

export const deleteApproval = async (
    auth: any,
    id: unknown,
    reason?: unknown,
) => {
    const admin = await getCurrentAdmin(auth);
    if (admin.role !== ADMIN_ROLE.SUPER) {
        throw new ApprovalCenterError(403, "仅超级管理员可以删除审批单");
    }
    const instanceId = toObjectId(id, "审批单ID");
    const approvalModel = useApprovalInstanceModel();
    const instance = await approvalModel.findById(instanceId);
    if (!instance) {
        throw new ApprovalCenterError(404, "审批单不存在");
    }

    if (instance.type === "purchase-request") {
        await deletePurchaseRequest(
            auth,
            instance.businessId,
            "request",
            true,
        );
        return {
            id: instanceId.toString(),
            approvalNo: instance.approvalNo,
        };
    }

    if (instance.type === "sales-order" && instance.status === "pending") {
        const deletionReason = toText(reason);
        if (!deletionReason) {
            throw new ApprovalCenterError(400, "请填写删除理由");
        }

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const currentInstance = await approvalModel.findById(instanceId, session);
                if (!currentInstance) {
                    throw new ApprovalCenterError(404, "审批单不存在");
                }
                if (
                    currentInstance.type !== "sales-order"
                    || currentInstance.status !== "pending"
                ) {
                    throw new ApprovalCenterError(409, "审批状态已变化，请刷新后重试");
                }

                const rejectedAt = new Date();
                try {
                    await useSalesOrderModel().updateStatus(
                        currentInstance.businessId.toString(),
                        "已驳回",
                        admin.name,
                        session,
                        {
                            expectedStatus: "待审核",
                            rejectionReason: `审批单删除：${deletionReason}`,
                            rejectedBy: admin.name,
                            rejectedAt,
                        },
                    );
                } catch (error: any) {
                    throw new ApprovalCenterError(
                        409,
                        error?.message || "销售订单状态已变化，请刷新后重试",
                    );
                }

                const result = await approvalModel.deleteById(
                    instanceId,
                    session,
                    {
                        status: currentInstance.status,
                        updateTime: currentInstance.updateTime,
                    },
                );
                if (result.deletedCount !== 1) {
                    throw new ApprovalCenterError(409, "审批状态已变化，请刷新后重试");
                }
            });
        } finally {
            await session.endSession();
        }

        return {
            id: instanceId.toString(),
            approvalNo: instance.approvalNo,
        };
    }

    if (instance.type === "sales-order" && instance.status === "rejected") {
        await useSalesOrderModel().preserveRejectionCount(instance.businessId.toString());
    }
    const result = await approvalModel.deleteById(instanceId);
    if (result.deletedCount !== 1) {
        throw new ApprovalCenterError(404, "审批单不存在");
    }

    return {
        id: instanceId.toString(),
        approvalNo: instance.approvalNo,
    };
};
