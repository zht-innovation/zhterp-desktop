import mongoose from "mongoose";
import { useAdminModel } from "~~/server/models/admin.model";
import {
    useApprovalFlowConfigModel,
    type ApprovalFlowConfigData,
    type ApprovalFlowRuleData,
    type ApprovalFlowStepData,
} from "~~/server/models/approvalFlowConfig.model";
import {
    useApprovalInstanceModel,
    type ApprovalInstanceBusinessSnapshotMap,
    type SalesOrderApprovalSnapshotData,
} from "~~/server/models/approvalInstance.model";
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";
import { cloneInventoryReviewPurchaseContext } from "./inventoryReviewPurchase";
import type {
    ApprovalBusinessSnapshotMap,
    ApprovalDate,
    ApprovalStep,
    ApprovalType,
    ApprovalUser,
    AttachmentRef,
    PurchaseRequestSnapshot,
    ReceiptApprovalSnapshot,
    SalesOrderApprovalSnapshot,
    SalesOrderProductSnapshot,
} from "~~/shared/types/approval";
import { ADMIN_ROLE, ADMIN_ROLE_NAME } from "~~/shared/enums";
import { getSalesOrderPaymentPlans } from "~~/shared/utils/salesOrderPayment";
import {
    resolveOrderVisibleFields,
    ORDER_APPROVAL_VISIBLE_FIELDS_VERSION,
    SHOOTING_CC_VISIBLE_FIELDS,
} from "~~/shared/types/orderApproval";

type ApprovalApplicantSource = {
    _id?: string | mongoose.Types.ObjectId;
    username?: string | null;
    nickname?: string | null;
    role?: string | number | null;
};

export type CreateApprovalInstanceInput<T extends ApprovalType> = {
    type: T;
    businessId: string | mongoose.Types.ObjectId;
    businessSnapshot: ApprovalBusinessSnapshotMap[T];
    applicantId: string | mongoose.Types.ObjectId;
    session: mongoose.ClientSession;
    submittedAt?: Date;
};

type ObjectIdSource = string | mongoose.Types.ObjectId;

const toObjectId = (value: ObjectIdSource, label: string) => {
    const text = value.toString();
    if (!mongoose.Types.ObjectId.isValid(text)) {
        throw new Error(`${label}不合法`);
    }
    return new mongoose.Types.ObjectId(text);
};

const toOptionalObjectId = (value?: ObjectIdSource) => {
    if (!value) return undefined;
    const text = value.toString();
    return mongoose.Types.ObjectId.isValid(text)
        ? new mongoose.Types.ObjectId(text)
        : undefined;
};

const toText = (value?: string | null) => value?.trim() || "";

const toOptionalDate = (value?: ApprovalDate) => {
    if (value === undefined || value === null || value === "") return undefined;
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
    return Number.isNaN(date.getTime()) ? undefined : date;
};

const cloneAttachments = (value: AttachmentRef[]): AttachmentRef[] =>
    value.map((item) => typeof item === "string" ? item : { ...item });

const cloneProducts = (
    value: SalesOrderProductSnapshot[],
): SalesOrderProductSnapshot[] =>
    value.map((item) => ({ ...item }));

export const buildSalesOrderApprovalSnapshot = (
    source: SalesOrderApprovalSnapshot,
): SalesOrderApprovalSnapshotData => {
    const salespersonId = toOptionalObjectId(source.salespersonId);
    const orderDate = toOptionalDate(source.orderDate);
    const receivableDate = toOptionalDate(source.receivableDate);
    const plannedPaymentDate = toOptionalDate(source.plannedPaymentDate);

    const snapshot: SalesOrderApprovalSnapshotData = {
        customerName: source.customerName.trim(),
        ...(salespersonId ? { salespersonId } : {}),
        salespersonName: source.salespersonName.trim(),
        orderType: source.orderType.trim(),
        amount: source.amount,
        currency: source.currency.trim(),
        ...(orderDate ? { orderDate } : {}),
        durationDays: source.durationDays,
        ...(source.machineNo !== undefined
            ? { machineNo: source.machineNo.trim() }
            : {}),
        ...(source.invoiceStatus !== undefined
            ? { invoiceStatus: source.invoiceStatus.trim() }
            : {}),
        ...(source.contractNo !== undefined
            ? { contractNo: source.contractNo.trim() }
            : {}),
        ...(source.sampleRequirement !== undefined
            ? { sampleRequirement: source.sampleRequirement.trim() }
            : {}),
        ...(source.installationRequirement !== undefined
            ? { installationRequirement: source.installationRequirement.trim() }
            : {}),
        ...(source.testingRequirement !== undefined
            ? { testingRequirement: source.testingRequirement.trim() }
            : {}),
        ...(source.orderRemark !== undefined
            ? { orderRemark: source.orderRemark.trim() }
            : {}),
        hasShootingTask: Boolean(source.hasShootingTask),
        ...(source.shootingRequirement !== undefined
            ? { shootingRequirement: source.shootingRequirement.trim() }
            : {}),
        orderImages: cloneAttachments(source.orderImages),
        attachments: cloneAttachments(source.attachments),
        products: cloneProducts(source.products),
        hasReceivable: source.hasReceivable,
        ...(source.receivableOrder !== undefined
            ? { receivableOrder: source.receivableOrder.trim() }
            : {}),
        ...(receivableDate ? { receivableDate } : {}),
        ...(source.incomeCategory !== undefined
            ? { incomeCategory: source.incomeCategory.trim() }
            : {}),
        ...(source.actualReceivableAmount !== undefined
            ? { actualReceivableAmount: source.actualReceivableAmount }
            : {}),
        ...(plannedPaymentDate ? { plannedPaymentDate } : {}),
        ...(source.plannedPaymentAmount !== undefined
            ? { plannedPaymentAmount: source.plannedPaymentAmount }
            : {}),
        plannedPayments: getSalesOrderPaymentPlans(source).map((plan) => ({
            date: toOptionalDate(plan.date ?? undefined) || null,
            amount: plan.amount,
            currency: plan.currency,
        })),
        ...(source.baseReceivedAmount !== undefined
            ? { baseReceivedAmount: source.baseReceivedAmount }
            : {}),
        ...(source.receivedAmount !== undefined
            ? { receivedAmount: source.receivedAmount }
            : {}),
        ...(source.receivableRemark !== undefined
            ? { receivableRemark: source.receivableRemark.trim() }
            : {}),
        receivableAttachments: cloneAttachments(source.receivableAttachments),
    };

    return snapshot;
};

export const buildReceiptApprovalSnapshot = (
    source: ReceiptApprovalSnapshot,
): ReceiptApprovalSnapshot => ({
    customerName: source.customerName.trim(),
    receivedAmountBefore: source.receivedAmountBefore,
});

export const buildPurchaseRequestSnapshot = (
    source: PurchaseRequestSnapshot,
): PurchaseRequestSnapshot => ({
    requestNo: source.requestNo.trim(),
    category: source.category,
    department: source.department || "",
    items: source.items.map((item) => ({
        name: item.name.trim(),
        model: item.model.trim(),
        quantity: item.quantity,
        unit: item.unit.trim(),
        ...(item.productId ? { productId: item.productId } : {}),
        ...(item.requirementId ? { requirementId: item.requirementId } : {}),
        ...(item.bomLineKey ? { bomLineKey: item.bomLineKey } : {}),
        ...(item.shortageQuantity != null ? { shortageQuantity: item.shortageQuantity } : {}),
    })),
    ...(source.bomGroups ? { bomGroups: JSON.parse(JSON.stringify(source.bomGroups)) } : {}),
    totalQuantity: source.totalQuantity,
    images: cloneAttachments(source.images),
    attachments: cloneAttachments(source.attachments),
    attachmentText: source.attachmentText ?? "",
    remark: source.remark.trim(),
    ...(source.salesOrderId ? { salesOrderId: source.salesOrderId } : {}),
    ...(source.salesOrderNo ? { salesOrderNo: source.salesOrderNo } : {}),
    ...(source.productionOrderId ? { productionOrderId: source.productionOrderId } : {}),
    ...(source.productionOrderNo ? { productionOrderNo: source.productionOrderNo } : {}),
    ...(source.inventoryReview ? { inventoryReview: cloneInventoryReviewPurchaseContext(source.inventoryReview) } : {}),
});

const BUSINESS_SNAPSHOT_BUILDERS: {
    [T in ApprovalType]: (
        snapshot: ApprovalBusinessSnapshotMap[T],
    ) => ApprovalInstanceBusinessSnapshotMap[T];
} = {
    "sales-order": buildSalesOrderApprovalSnapshot,
    receipt: buildReceiptApprovalSnapshot,
    borrow: () => null,
    "purchase-request": buildPurchaseRequestSnapshot,
};

const buildBusinessSnapshot = <T extends ApprovalType>(
    type: T,
    snapshot: ApprovalBusinessSnapshotMap[T],
): ApprovalInstanceBusinessSnapshotMap[T] =>
    BUSINESS_SNAPSHOT_BUILDERS[type](snapshot);

const buildApprovalUser = (admin: ApprovalApplicantSource): ApprovalUser => {
    const adminId = admin._id?.toString?.() || "";
    const username = toText(admin.username);
    const role = Number(admin.role);

    return {
        adminId,
        username,
        name: toText(admin.nickname) || username,
        role,
    };
};

const findMatchedRule = (
    rules: ApprovalFlowRuleData[],
    applicantRole: number,
) => {
    const enabledRules = rules.filter((rule) => rule.enabled);
    return enabledRules.find((rule) =>
        rule.applicantRole !== null && rule.applicantRole === applicantRole,
    ) || enabledRules.find((rule) => rule.applicantRole === null);
};
const findMatchedVisibleFields = (step: ApprovalFlowStepData, applicantRole: number) => {
    const rule = findMatchedRule(step.rules || [], applicantRole);
    const fields = rule?.visibleFields;
    if (fields === undefined) {
        return step.key === "shooting-cc"
            ? [...SHOOTING_CC_VISIBLE_FIELDS]
            : undefined;
    }
    const normalized = resolveOrderVisibleFields(fields, rule?.visibleFieldsVersion);
    return step.key === "shooting-cc"
        ? normalized.filter((field) => SHOOTING_CC_VISIBLE_FIELDS.includes(field as never))
        : normalized;
};

const uniqueApproverIds = (ids: mongoose.Types.ObjectId[]) => {
    const seen = new Set<string>();
    return ids.reduce<string[]>((result, id) => {
        const text = id.toString();
        if (seen.has(text)) {
            return result;
        }
        seen.add(text);
        result.push(text);
        return result;
    }, []);
};

const resolveStepUsers = async (
    step: ApprovalFlowStepData,
    applicant: ApprovalUser,
    session: mongoose.ClientSession,
) => {
    const matchedRule = findMatchedRule(step.rules || [], applicant.role);
    if (
        step.key !== "cc"
        && step.key !== "shooting-cc"
        && !matchedRule
    ) {
        const roleName = ADMIN_ROLE_NAME[applicant.role as ADMIN_ROLE] || String(applicant.role);
        throw new Error(`${step.name}未找到适用于申请人角色“${roleName}”的已启用规则，请在“审批权限”为该角色配置审批人`);
    }
    const approverIds = uniqueApproverIds(matchedRule?.approverIds || []);
    if (
        step.key !== "cc"
        && step.key !== "shooting-cc"
        && approverIds.length === 0
    ) {
        throw new Error(`${step.name}没有可用审批人`);
    }
    if (approverIds.length === 0) return [];

    const admins = await useAdminModel().findAdminsByIdsWithRole(approverIds, session);
    if (
        step.key === "shooting-cc"
        && admins.some((admin: ApprovalApplicantSource) =>
            Number(admin.role) !== ADMIN_ROLE.OPERATOR,
        )
    ) {
        throw new Error("拍摄任务抄送只能选择运营账号");
    }
    const adminMap = new Map(
        admins.map((admin: ApprovalApplicantSource) => [admin._id?.toString?.() || "", admin]),
    );
    const missingApprover = approverIds.find((id) => !adminMap.has(id));
    if (missingApprover) {
        throw new Error(`${step.name}存在无效审批人`);
    }

    return approverIds.map((id) => buildApprovalUser(adminMap.get(id)!));
};

export const buildInitialApprovalSteps = async (
    config: ApprovalFlowConfigData,
    applicant: ApprovalUser,
    session: mongoose.ClientSession,
    includeShootingCc = false,
) => {
    const steps: ApprovalStep[] = [];
    const initialStepKey = config.steps.find((step) =>
        step.key !== "cc" && step.key !== "shooting-cc",
    )?.key;
    const shootingCcConfig = config.steps.find((step) => step.key === "shooting-cc");
    if (includeShootingCc && !shootingCcConfig) {
        throw new Error("订单需要拍摄，请先配置拍摄任务抄送人");
    }

    for (const flowStep of config.steps) {
        const isSkippedShootingCc = flowStep.key === "shooting-cc"
            && !includeShootingCc;
        const users = isSkippedShootingCc
            ? []
            : await resolveStepUsers(flowStep, applicant, session);
        const isInitialStep = flowStep.key === initialStepKey;
        if (
            flowStep.key === "shooting-cc"
            && includeShootingCc
            && users.length === 0
        ) {
            throw new Error("订单需要拍摄，请先配置匹配当前销售角色的运营抄送人");
        }
        steps.push({
            key: flowStep.key,
            name: flowStep.name,
            order: flowStep.order,
            ...(flowStep.strategy ? { strategy: flowStep.strategy } : {}),
            status: isSkippedShootingCc
                ? "skipped"
                : isInitialStep
                ? "pending"
                : "waiting",
            users: users.map((user, index) => ({
                user,
                status: isSkippedShootingCc
                    ? "skipped"
                    : isInitialStep
                    && (flowStep.strategy === "any" || index === 0)
                    ? "pending"
                    : "waiting",
            })),
            ...(config.type === "sales-order"
                ? {
                    visibleFields: findMatchedVisibleFields(flowStep, applicant.role),
                    visibleFieldsVersion: ORDER_APPROVAL_VISIBLE_FIELDS_VERSION,
                }
                : {}),
        });
    }

    const initialStep = steps.find((step) => step.key === initialStepKey);
    const pendingAdminIds = initialStep?.users
        .filter((stepUser) => stepUser.status === "pending")
        .map((stepUser) => stepUser.user.adminId) || [];
    if (pendingAdminIds.length === 0) {
        throw new Error(`${initialStep?.name || "审批步骤"}没有可用审批人`);
    }

    return {
        steps,
        unreadUserIds: pendingAdminIds,
    };
};

const formatApprovalDate = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
].join("");

export const generateApprovalNo = async (
    date: Date,
    session: mongoose.ClientSession,
) => {
    const dateKey = formatApprovalDate(date);
    const serial = await useInventoryCounterModel().nextNumber(
        `approval:${dateKey}`,
        session,
    );
    return `SP-${dateKey}-${String(serial).padStart(4, "0")}`;
};

export const createApprovalInstance = async <T extends ApprovalType>(
    input: CreateApprovalInstanceInput<T>,
) => {
    if (!input.session?.inTransaction()) {
        throw new Error("创建审批实例必须在 MongoDB transaction 中执行");
    }

    const businessId = toObjectId(input.businessId, "业务ID");
    const applicantId = toObjectId(input.applicantId, "申请人ID");
    const applicantAdmin = await useAdminModel().findAdminById(
        applicantId.toString(),
        input.session,
    );
    if (!applicantAdmin) throw new Error("申请人不存在");
    const applicant = buildApprovalUser(applicantAdmin);

    const config = await useApprovalFlowConfigModel().findByType(input.type, input.session);
    if (!config) throw new Error("审批流程尚未配置");

    const { steps, unreadUserIds } = await buildInitialApprovalSteps(
        config,
        applicant,
        input.session,
        input.type === "sales-order"
            && Boolean(
                (input.businessSnapshot as SalesOrderApprovalSnapshot).hasShootingTask,
            ),
    );
    const submittedAt = input.submittedAt || new Date();
    const approvalNo = await generateApprovalNo(submittedAt, input.session);
    return await useApprovalInstanceModel().create({
        approvalNo,
        type: input.type,
        businessId,
        businessSnapshot: buildBusinessSnapshot(input.type, input.businessSnapshot),
        applicant: {
            ...applicant,
            adminId: applicantId,
        },
        status: "pending",
        steps: steps.map((step) => ({
            ...step,
            users: step.users.map((stepUser) => ({
                ...stepUser,
                user: {
                    ...stepUser.user,
                    adminId: new mongoose.Types.ObjectId(stepUser.user.adminId),
                },
            })),
        })),
        unreadUserIds: unreadUserIds.map((id) => new mongoose.Types.ObjectId(id)),
        createTime: submittedAt,
        updateTime: submittedAt,
    }, input.session);
};
