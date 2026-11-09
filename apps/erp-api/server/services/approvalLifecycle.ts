import mongoose from "mongoose";
import { canConfirmOrderPayment } from "~~/shared/utils/adminPermission";
import { requiresSalesOrderPaymentConfirmation } from "~~/shared/utils/salesOrderPayment";
import {
    useApprovalInstanceModel,
    type ApprovalInstanceData,
    type ApprovalInstanceStepData,
} from "~~/server/models/approvalInstance.model";

type ObjectIdSource = string | mongoose.Types.ObjectId;

// 单次操作结果，不是 ApprovalInstance.status。
export type ApprovalEvent =
    | "advanced"
    | "approved"
    | "rejected"
    | "cancelled";

export interface ApprovalContext {
    event: ApprovalEvent;
    instance: ApprovalInstanceData;
    actorId: string;
    occurredAt: Date;
}

export type ApprovalTransactionContext = ApprovalContext & {
    session: mongoose.ClientSession;
};

type BusinessHandler = (context: ApprovalTransactionContext) => Promise<void>;

type ActionInput = {
    instanceId: ObjectIdSource;
    actorId: ObjectIdSource;
    session: mongoose.ClientSession;
    occurredAt?: Date;
};

type ApproveInput = ActionInput & {
    actorRole: number;
    onFinalApproved: BusinessHandler;
};

type RejectInput = ActionInput & {
    rejectReason?: string;
    onRejected: BusinessHandler;
};

type CancelInput = ActionInput & {
    onCancelled: BusinessHandler;
};

type ViewInput = {
    instanceId: ObjectIdSource;
    userId: ObjectIdSource;
    viewedAt?: Date;
    canViewAll?: boolean;
    session?: mongoose.ClientSession;
};

class ApprovalLifecycleError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

const STATE_CHANGED_MESSAGE = "审批状态已变化，请刷新后重试";

const toObjectId = (value: ObjectIdSource, label: string) => {
    const text = value.toString();
    if (!mongoose.Types.ObjectId.isValid(text)) {
        throw new ApprovalLifecycleError(400, `${label}不合法`);
    }
    return new mongoose.Types.ObjectId(text);
};

const requireTransaction = (session: mongoose.ClientSession) => {
    if (!session?.inTransaction()) {
        throw new Error("审批状态变更必须在 MongoDB transaction 中执行");
    }
};

const sameObjectId = (
    left: mongoose.Types.ObjectId,
    right: mongoose.Types.ObjectId,
) => left.toString() === right.toString();

const cloneSteps = (steps: ApprovalInstanceStepData[]) =>
    steps.map((step) => ({
        ...step,
        users: step.users.map((stepUser) => ({
            ...stepUser,
            user: { ...stepUser.user },
        })),
    }));

const mergeUnreadUserIds = (
    current: mongoose.Types.ObjectId[],
    additions: mongoose.Types.ObjectId[],
) => {
    const users = new Map<string, mongoose.Types.ObjectId>();
    current.forEach((userId) => users.set(userId.toString(), userId));
    additions.forEach((userId) => users.set(userId.toString(), userId));
    return Array.from(users.values());
};

const findPendingActor = (
    steps: ApprovalInstanceStepData[],
    actorId: mongoose.Types.ObjectId,
) => {
    for (const [stepIndex, step] of steps.entries()) {
        if (step.status !== "pending") continue;
        const userIndex = step.users.findIndex((stepUser) =>
            stepUser.status === "pending"
            && sameObjectId(stepUser.user.adminId, actorId),
        );
        if (userIndex >= 0) return { stepIndex, userIndex };
    }
    throw new ApprovalLifecycleError(403, "当前用户没有可处理的审批步骤");
};

const loadPendingInstance = async (
    instanceId: mongoose.Types.ObjectId,
    session: mongoose.ClientSession,
) => {
    const instance = await useApprovalInstanceModel().findById(instanceId, session);
    if (!instance) throw new ApprovalLifecycleError(404, "审批单不存在");
    if (instance.status !== "pending") {
        throw new ApprovalLifecycleError(409, STATE_CHANGED_MESSAGE);
    }
    return instance;
};

const completeCcSteps = (steps: ApprovalInstanceStepData[]) => {
    const ccSteps = steps.filter((step) =>
        (step.key === "cc" || step.key === "shooting-cc")
        && step.status === "waiting",
    );
    ccSteps.forEach((step) => {
        step.status = "completed";
        step.users.forEach((stepUser) => {
            stepUser.status = "completed";
        });
    });
    return ccSteps.flatMap((step) =>
        step.users.map((stepUser) => stepUser.user.adminId),
    );
};

const activateNextApproval = (steps: ApprovalInstanceStepData[], stepIndex: number) => {
    const nextStep = steps.slice(stepIndex + 1).find((step) =>
        step.key !== "cc" && step.key !== "shooting-cc",
    );
    if (!nextStep) return [];
    if (
        nextStep.status !== "waiting"
        || nextStep.users.length === 0
        || nextStep.users.some((stepUser) => stepUser.status !== "waiting")
    ) {
        throw new Error(`${nextStep.name}流程状态异常`);
    }

    nextStep.status = "pending";
    nextStep.users.forEach((stepUser, index) => {
        if (nextStep.strategy === "any" || index === 0) {
            stepUser.status = "pending";
        }
    });
    return nextStep.users
        .filter((stepUser) => stepUser.status === "pending")
        .map((stepUser) => stepUser.user.adminId);
};

const prepareAction = async (input: ActionInput, actorLabel: string) => {
    requireTransaction(input.session);
    const instanceId = toObjectId(input.instanceId, "审批单ID");
    const actorId = toObjectId(input.actorId, actorLabel);
    const occurredAt = input.occurredAt || new Date();
    const instance = await loadPendingInstance(instanceId, input.session);
    return { instanceId, actorId, occurredAt, instance };
};

export const approveInstance = async (
    input: ApproveInput,
): Promise<ApprovalContext> => {
    const { instanceId, actorId, occurredAt, instance } = await prepareAction(
        input,
        "审批人ID",
    );
    const steps = cloneSteps(instance.steps);
    const { stepIndex, userIndex } = findPendingActor(steps, actorId);
    const currentStep = steps[stepIndex]!;
    const currentUser = currentStep.users[userIndex]!;
    if (
        instance.type === "sales-order"
        && canConfirmOrderPayment(input.actorRole)
        && requiresSalesOrderPaymentConfirmation(instance.businessSnapshot)
        && !currentUser.paymentConfirmedAt
    ) {
        throw new ApprovalLifecycleError(409, "请先确认用户已打款，再同意并流转到下一审批阶段");
    }
    const newlyUnreadUserIds: mongoose.Types.ObjectId[] = [];
    let event: ApprovalEvent = "advanced";
    let completedAt: Date | undefined;

    currentUser.status = "approved";
    currentUser.processedAt = occurredAt;

    if (currentStep.key === "first-approval") {
        const nextUser = currentStep.users.find((stepUser) =>
            stepUser.status === "waiting",
        );
        if (nextUser) {
            nextUser.status = "pending";
            newlyUnreadUserIds.push(nextUser.user.adminId);
        } else {
            currentStep.status = "completed";
        }
    } else if (currentStep.key === "second-approval" || currentStep.key === "third-approval") {
        currentStep.users.forEach((stepUser, index) => {
            if (index !== userIndex && stepUser.status === "pending") {
                stepUser.status = "skipped";
            }
        });
        currentStep.status = "completed";
    } else {
        throw new Error("当前步骤不允许审批");
    }

    if (currentStep.status === "completed") {
        const nextApproverIds = activateNextApproval(steps, stepIndex);
        if (nextApproverIds.length > 0) {
            newlyUnreadUserIds.push(...nextApproverIds);
        } else {
            event = "approved";
            completedAt = occurredAt;
            newlyUnreadUserIds.push(
                instance.applicant.adminId,
                ...completeCcSteps(steps),
            );
        }
    }

    const updated = await useApprovalInstanceModel().transitionPendingStep(
        {
            instanceId,
            stepKey: currentStep.key,
            userId: actorId,
            expectedUpdateTime: instance.updateTime,
            status: event === "approved" ? "approved" : "pending",
            steps,
            unreadUserIds: mergeUnreadUserIds(
                instance.unreadUserIds,
                newlyUnreadUserIds,
            ),
            ...(completedAt ? { completedAt } : {}),
        },
        input.session,
    );
    if (!updated) throw new ApprovalLifecycleError(409, STATE_CHANGED_MESSAGE);

    const context: ApprovalContext = {
        event,
        instance: updated,
        actorId: actorId.toString(),
        occurredAt,
    };
    if (event === "approved") {
        await input.onFinalApproved({ ...context, session: input.session });
    }
    return context;
};

export const rejectInstance = async (
    input: RejectInput,
): Promise<ApprovalContext> => {
    const { instanceId, actorId, occurredAt, instance } = await prepareAction(
        input,
        "审批人ID",
    );
    const steps = cloneSteps(instance.steps);
    const processedUserIds = steps.flatMap((step) =>
        step.users
            .filter((stepUser) =>
                stepUser.status === "approved" || stepUser.status === "rejected",
            )
            .map((stepUser) => stepUser.user.adminId),
    );
    const { stepIndex, userIndex } = findPendingActor(steps, actorId);
    const currentStep = steps[stepIndex]!;
    const currentUser = currentStep.users[userIndex]!;

    currentUser.status = "rejected";
    currentUser.processedAt = occurredAt;
    currentStep.status = "rejected";
    currentStep.users.forEach((stepUser, index) => {
        if (
            index !== userIndex
            && (stepUser.status === "pending" || stepUser.status === "waiting")
        ) {
            stepUser.status = "skipped";
        }
    });
    steps.slice(stepIndex + 1).forEach((step) => {
        step.status = "skipped";
        step.users.forEach((stepUser) => {
            if (stepUser.status === "pending" || stepUser.status === "waiting") {
                stepUser.status = "skipped";
            }
        });
    });

    const rejectReason = input.rejectReason?.trim();
    const updated = await useApprovalInstanceModel().transitionPendingStep(
        {
            instanceId,
            stepKey: currentStep.key,
            userId: actorId,
            expectedUpdateTime: instance.updateTime,
            status: "rejected",
            steps,
            unreadUserIds: mergeUnreadUserIds(
                instance.unreadUserIds,
                [instance.applicant.adminId, ...processedUserIds],
            ),
            ...(rejectReason ? { rejectReason } : {}),
            completedAt: occurredAt,
        },
        input.session,
    );
    if (!updated) throw new ApprovalLifecycleError(409, STATE_CHANGED_MESSAGE);

    const context: ApprovalContext = {
        event: "rejected",
        instance: updated,
        actorId: actorId.toString(),
        occurredAt,
    };
    await input.onRejected({ ...context, session: input.session });
    return context;
};

export const cancelInstance = async (
    input: CancelInput,
): Promise<ApprovalContext> => {
    const { instanceId, actorId, occurredAt, instance } = await prepareAction(
        input,
        "申请人ID",
    );
    if (!sameObjectId(instance.applicant.adminId, actorId)) {
        throw new ApprovalLifecycleError(403, "只有申请人可以撤销审批");
    }

    const steps = cloneSteps(instance.steps);
    steps.forEach((step) => {
        if (step.status === "pending" || step.status === "waiting") {
            step.status = "skipped";
        }
        step.users.forEach((stepUser) => {
            if (stepUser.status === "pending" || stepUser.status === "waiting") {
                stepUser.status = "skipped";
            }
        });
    });

    const updated = await useApprovalInstanceModel().cancelPending(
        {
            instanceId,
            applicantId: actorId,
            expectedUpdateTime: instance.updateTime,
            steps,
            unreadUserIds: instance.unreadUserIds,
            completedAt: occurredAt,
        },
        input.session,
    );
    if (!updated) throw new ApprovalLifecycleError(409, STATE_CHANGED_MESSAGE);

    const context: ApprovalContext = {
        event: "cancelled",
        instance: updated,
        actorId: actorId.toString(),
        occurredAt,
    };
    await input.onCancelled({ ...context, session: input.session });
    return context;
};

export const markInstanceViewed = async (
    input: ViewInput,
) => {
    const instanceId = toObjectId(input.instanceId, "审批单ID");
    const userId = toObjectId(input.userId, "用户ID");
    const updated = await useApprovalInstanceModel().markViewed(
        instanceId,
        userId,
        input.viewedAt || new Date(),
        input.canViewAll,
        input.session,
    );
    if (!updated) {
        throw new ApprovalLifecycleError(404, "审批单不存在或无权查看");
    }
    return updated;
};
