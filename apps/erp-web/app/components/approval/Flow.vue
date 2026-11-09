<template>
    <section class="flow-section">
        <header class="section-title">
            <span />
            <h3>流程</h3>
        </header>

        <div class="flow-card">
            <article
                v-for="(step, index) in sortedSteps"
                :key="step.key"
                class="flow-step"
            >
                <div class="step-marker">
                    <span class="step-index" :class="`step-${step.status}`">
                        <Icon :name="getStepIcon(step)" />
                    </span>
                    <span v-if="index < sortedSteps.length - 1" class="step-line" />
                </div>

                <div class="step-content">
                    <div class="step-heading">
                        <div>
                            <strong>{{ step.name }}</strong>
                        </div>
                        <span class="step-status">{{ stepStatusLabels[step.status] }}</span>
                    </div>

                    <div class="step-users">
                        <div
                            v-for="stepUser in step.users"
                            :key="stepUser.user.adminId"
                            class="step-user"
                        >
                            <span class="avatar">{{ getUserName(stepUser.user).slice(0, 1) }}</span>
                            <span class="user-info">
                                <strong>{{ getUserLabel(stepUser.user) }}</strong>
                                <span :class="`user-${stepUser.status}`">
                                    {{ getUserStatus(step, stepUser) }}
                                </span>
                                <span v-if="stepUser.paymentConfirmedAt" class="user-approved">
                                    已确认用户打款 · {{ formatTime(stepUser.paymentConfirmedAt) }}
                                </span>
                            </span>
                            <time v-if="stepUser.processedAt" :datetime="String(stepUser.processedAt)">
                                {{ formatTime(stepUser.processedAt) }}
                            </time>
                        </div>
                    </div>
                </div>
            </article>
        </div>
    </section>
</template>

<script setup lang="ts">
import type {
    ApprovalDate,
    ApprovalStep,
    ApprovalStepStatus,
    ApprovalStepUser,
    ApprovalUser,
} from "~/types/approval";
import { ADMIN_ROLE, ADMIN_ROLE_NAME } from "~~/shared/enums";

const props = defineProps<{
    steps: ApprovalStep[];
    applicant: ApprovalUser;
    createTime: ApprovalDate;
}>();

type ApplicantStep = {
    key: "applicant";
    name: "发起申请";
    order: 0;
    status: "completed";
    users: ApprovalStepUser[];
};

type DisplayStep = ApprovalStep | ApplicantStep;

const sortedSteps = computed<DisplayStep[]>(() => [
    {
        key: "applicant",
        name: "发起申请",
        order: 0,
        status: "completed",
        users: [{
            user: props.applicant,
            status: "approved",
            processedAt: props.createTime,
        }],
    },
    ...[...props.steps].sort((left, right) => left.order - right.order),
]);

const stepStatusLabels: Record<ApprovalStepStatus, string> = {
    waiting: "等待前序",
    pending: "处理中",
    rejected: "已驳回",
    completed: "已完成",
    skipped: "已跳过",
};

const getStepIcon = (step: DisplayStep) => {
    if (step.key === "applicant") return "lucide:send";
    if (step.key === "cc") return "lucide:mail";
    if (step.key === "shooting-cc") return "lucide:camera";
    if (step.status === "completed") return "lucide:check";
    if (step.status === "rejected") return "lucide:x";
    return "lucide:user-round-check";
};

const getUserStatus = (step: DisplayStep, stepUser: ApprovalStepUser) => {
    if (step.key === "applicant") return "已发起";
    if (stepUser.status === "pending") {
        return stepUser.firstViewedAt ? "已读 · 待处理" : "未查看";
    }

    return {
        waiting: "等待前序",
        approved: "已通过",
        rejected: "已驳回",
        skipped: "其他审批人已处理",
        completed: stepUser.firstViewedAt ? "已查看 · 已抄送" : "已抄送",
    }[stepUser.status];
};

const getUserName = (user: ApprovalUser) => user.name || user.username;

const getUserLabel = (user: ApprovalUser) => {
    const roleName = ADMIN_ROLE_NAME[user.role as ADMIN_ROLE];
    const name = getUserName(user);
    return roleName ? `${name}（${roleName}）` : name;
};

const formatTime = (value: ApprovalDate) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    return `${month}-${day} ${hour}:${minute}`;
};
</script>

<style scoped>
.flow-section {
    min-width: 0;
    padding: var(--erp-spacing-20);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.section-title {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-8);
    margin-bottom: var(--erp-spacing-20);
}

.section-title > span {
    width: 2px;
    height: 20px;
    background: var(--erp-color-text-primary);
}

.section-title h3 {
    margin: 0;
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
}

.flow-card {
    min-width: 0;
    padding: 0 var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
}

.flow-step {
    min-width: 0;
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr);
    gap: var(--erp-spacing-16);
}

.step-marker {
    position: relative;
    display: flex;
    justify-content: center;
}

.step-index {
    position: relative;
    z-index: 1;
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    margin-top: var(--erp-spacing-16);
    border-radius: 50%;
    color: var(--erp-color-text-status-review);
    background: var(--erp-color-bg-status-review);
}

.step-index :deep(svg) {
    width: 16px;
    height: 16px;
}

.step-completed {
    color: var(--erp-color-text-status-complete);
    background: var(--erp-color-bg-status-complete);
}

.step-rejected {
    color: var(--erp-color-text-status-error);
    background: var(--erp-color-bg-status-error-subtle);
}

.step-waiting,
.step-skipped {
    color: var(--erp-color-text-tertiary);
    background: var(--erp-color-fill-disabled);
}

.step-line {
    position: absolute;
    top: 48px;
    bottom: -16px;
    width: 1px;
    background: var(--erp-color-divider-subtle);
}

.step-content {
    min-width: 0;
    display: grid;
    gap: var(--erp-spacing-12);
    padding: var(--erp-spacing-16) 0;
    border-bottom: 1px solid var(--erp-color-divider-default);
}

.flow-step:last-child .step-content {
    border-bottom: 0;
}

.step-heading,
.step-heading > div,
.step-user,
.user-info {
    min-width: 0;
    display: flex;
    align-items: center;
}

.step-heading {
    justify-content: space-between;
    gap: var(--erp-spacing-12);
}

.step-heading > div {
    flex-wrap: wrap;
    gap: var(--erp-spacing-8);
}

.step-heading strong {
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
}

.step-status,
.user-info span,
.step-user time {
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.step-status {
    flex: 0 0 auto;
}

.step-users {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--erp-spacing-8);
}

.step-user {
    gap: var(--erp-spacing-8);
    padding: var(--erp-spacing-8);
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-fill-control-secondary);
}

.avatar {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: var(--erp-color-text-status-review);
    background: var(--erp-color-bg-status-review);
    font-size: var(--erp-typography-note-font-size);
}

.user-info {
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
}

.user-info strong {
    max-width: 100%;
    overflow: hidden;
    font-size: var(--erp-typography-content2-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-content2-line-height);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.user-info .user-approved {
    color: var(--erp-color-text-status-complete);
}

.user-info .user-rejected {
    color: var(--erp-color-text-status-error);
}

.user-info .user-pending {
    color: var(--erp-color-text-status-review);
}

.step-user time {
    flex: 0 0 auto;
}
</style>
