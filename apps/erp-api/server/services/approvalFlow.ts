import mongoose from "mongoose";
import { useAdminModel } from "~~/server/models/admin.model";
import {
    useApprovalFlowConfigModel,
    type ApprovalFlowConfigData,
    type ApprovalFlowRuleData,
    type ApprovalFlowStepData,
} from "~~/server/models/approvalFlowConfig.model";
import { ADMIN_ROLE, isApprovalApplicantRole } from "~~/shared/enums";
import { canSubmitPurchaseRequest, isElectronicsWarehouseKeeper } from "~~/shared/utils/adminPermission";
import {
    APPROVAL_TYPES,
    type ApprovalFlowConfig,
    type ApprovalFlowRule,
    type ApprovalFlowStep,
    type ApprovalType,
} from "~~/shared/types/approval";
import {
    isOrderApprovalField,
    normalizeOrderVisibleFields,
    resolveOrderVisibleFields,
    ORDER_APPROVAL_VISIBLE_FIELDS_VERSION,
    type OrderApprovalField,
} from "~~/shared/types/orderApproval";

const STEP_NAMES = {
    "first-approval": "第一审批",
    "second-approval": "第二审批",
    "third-approval": "第三审批",
    cc: "抄送",
    "shooting-cc": "拍摄任务抄送",
};

const APPROVAL_STEP_SEQUENCES = [
    "first-approval",
    "first-approval,second-approval",
    "second-approval",
    "third-approval",
    "first-approval,third-approval",
    "second-approval,third-approval",
    "first-approval,second-approval,third-approval",
];
const COPY_STEP_SEQUENCES = ["", "cc", "shooting-cc", "cc,shooting-cc"];
const STEP_SEQUENCES = new Set(
    APPROVAL_STEP_SEQUENCES.flatMap((approvalSteps) =>
        COPY_STEP_SEQUENCES.map((copySteps) =>
            copySteps ? `${approvalSteps},${copySteps}` : approvalSteps,
        ),
    ),
);
const APPROVAL_TYPE_SET = new Set(APPROVAL_TYPES);

export class ApprovalFlowInputError extends Error {}

const invalid = (message: string): never => {
    throw new ApprovalFlowInputError(message);
};

const isApplicantRole = (value: number | null, type: ApprovalType) =>
    value === null || (type === "purchase-request" ? canSubmitPurchaseRequest(value) : isApprovalApplicantRole(value));

const parseRules = (
    value: ApprovalFlowRule[],
    stepName: string,
    approverIds: Set<string>,
    type: ApprovalType,
): ApprovalFlowRuleData[] => {
    const isOrder = type === "sales-order";
    if (value.length === 0) {
        return invalid(`${stepName}至少需要一条角色规则`);
    }

    const applicantRoles = new Set<string>();
    const rules = value.map((item) => {
        if (!isApplicantRole(item.applicantRole, type)) {
            return invalid(`${stepName}存在无效申请人角色`);
        }

        const roleKey = item.applicantRole === null
            ? "all"
            : String(item.applicantRole);
        if (applicantRoles.has(roleKey)) {
            return invalid(`${stepName}中同一申请人角色只能配置一条规则`);
        }
        applicantRoles.add(roleKey);

        if (item.enabled && item.approverIds.length === 0) {
            return invalid(`${stepName}的角色规则至少需要一名审批人`);
        }

        const ruleApproverIds = item.approverIds.map((id) => {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return invalid(`${stepName}存在无效审批人`);
            }
            const objectId = new mongoose.Types.ObjectId(id);
            approverIds.add(objectId.toString());
            return objectId;
        });
        let visibleFields: OrderApprovalField[] | undefined;
        if (isOrder && item.visibleFields !== undefined) {
            if (!Array.isArray(item.visibleFields)) {
                return invalid(`${stepName}存在无效详情字段`);
            }
            visibleFields = item.visibleFields.filter(isOrderApprovalField);
            if (visibleFields.length !== item.visibleFields.length) {
                return invalid(`${stepName}存在无效详情字段`);
            }
        }

        return {
            applicantRole: item.applicantRole,
            approverIds: ruleApproverIds,
            enabled: item.enabled,
            ...(visibleFields ? { visibleFields: normalizeOrderVisibleFields(visibleFields) } : {}),
            ...(isOrder ? { visibleFieldsVersion: ORDER_APPROVAL_VISIBLE_FIELDS_VERSION } : {}),
        };
    });

    if (!rules.some((rule) => rule.enabled)) {
        return invalid(`${stepName}至少需要启用一条角色规则`);
    }

    return rules;
};

const parseSteps = (
    value: ApprovalFlowStep[],
    approverIds: Set<string>,
    type: ApprovalType,
): ApprovalFlowStepData[] => {
    const isOrder = type === "sales-order";
    const stepKeys = value.map((item) => item.key);
    if (!STEP_SEQUENCES.has(stepKeys.join(","))) {
        return invalid("审批步骤组合不合法");
    }

    return value.map((item, index) => {
        const key = item.key;
        const name = STEP_NAMES[key];
        if (item.name !== name || item.order !== index + 1) {
            return invalid(`${name}的名称或顺序不合法`);
        }

        if (key === "cc" || key === "shooting-cc") {
            if (item.strategy !== undefined) {
                return invalid(`${name}不能设置审批策略`);
            }
            if (key === "shooting-cc" && !isOrder) {
                return invalid("仅销售订单可以配置拍摄任务抄送");
            }
            return {
                key,
                name,
                order: index + 1,
                rules: parseRules(item.rules, name, approverIds, type),
            };
        }

        const strategy = key === "first-approval" ? "sequential" : "any";
        if (item.strategy !== strategy) {
            return invalid(`${name}的审批策略不合法`);
        }
        return {
            key,
            name,
            order: index + 1,
            strategy,
            rules: parseRules(item.rules, name, approverIds, type),
        };
    });
};

const parseConfig = async (value: ApprovalFlowConfig) => {
    if (!APPROVAL_TYPE_SET.has(value.type)) {
        return invalid("审批类型不合法");
    }

    const approverIds = new Set<string>();
    const steps = parseSteps(value.steps, approverIds, value.type);
    const admins = await useAdminModel().findAdminsByIdsWithRole([...approverIds]);
    if (admins.length !== approverIds.size) {
        return invalid("流程配置存在无效审批人");
    }
    if (value.type !== "purchase-request" && admins.some((admin: any) => isElectronicsWarehouseKeeper(Number(admin.role)))) {
        return invalid("电子部库管仅可配置为采购申请的审批人或抄送人");
    }
    const adminMap = new Map(
        admins.map((admin: any) => [admin._id?.toString?.() || "", admin]),
    );
    const shootingCc = steps.find((step) => step.key === "shooting-cc");
    const hasNonOperatorRecipient = shootingCc?.rules.some((rule) =>
        rule.approverIds.some((id) =>
            Number(adminMap.get(id.toString())?.role) !== ADMIN_ROLE.OPERATOR,
        ),
    );
    if (hasNonOperatorRecipient) {
        return invalid("拍摄任务抄送只能选择运营账号");
    }

    return {
        type: value.type,
        steps,
    };
};

const serializeConfig = (config: ApprovalFlowConfigData) => ({
    ...config,
    _id: config._id.toString(),
    steps: config.steps.map((step) => ({
        ...step,
        rules: step.rules.map((rule) => ({
            ...rule,
            approverIds: rule.approverIds.map((id) => id.toString()),
            ...(config.type === "sales-order" && rule.visibleFields !== undefined
                ? { visibleFields: resolveOrderVisibleFields(rule.visibleFields, rule.visibleFieldsVersion) }
                : {}),
        })),
    })),
});

export const retrieveApprovalFlows = async () => {
    const configs = await useApprovalFlowConfigModel().findAll();
    return configs.map(serializeConfig);
};

export const updateApprovalFlow = async (input: ApprovalFlowConfig) => {
    const config = await parseConfig(input);
    const updated = await useApprovalFlowConfigModel().update(
        config.type,
        config.steps,
    );
    return serializeConfig(updated);
};
