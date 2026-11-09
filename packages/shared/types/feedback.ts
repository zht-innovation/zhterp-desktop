import type { CurrentDepartment, DepartmentSnapshot } from "./department";

export const FEEDBACK_STATUSES = {
    pending: "待评估", processing: "处理中", completed: "已完成", returned: "已退回", withdrawn: "已撤回",
} as const;
export const FEEDBACK_STAGES = {
    waiting_acceptance: "等待受理", evaluation: "需求评估", design: "方案设计", scheduled: "开发排期",
    development: "开发中", testing: "测试验收", completed: "已完成", returned: "已退回", withdrawn: "已撤回",
} as const;
export const FEEDBACK_CATEGORIES = {
    bug: "bug反馈", feature: "功能建议", experience: "体验优化", interface: "界面优化", machine: "机型优化",
} as const;
export const FEEDBACK_IMPACTS = { self: "仅影响我", team: "影响团队", multiple_roles: "影响多个角色", all_users: "影响全部用户" } as const;
export const FEEDBACK_ACTIONS: Record<string, string> = {
    create: "提交意见", update: "修改意见", progress: "调整进度", return: "退回意见", withdraw: "主动撤回",
    resubmit: "重新提交", delete: "删除意见", legacy_solution: "旧修复方案",
};
export const LEGACY_FEEDBACK_CATEGORIES: Record<string, string> = {
    other: "其他",
};
export type FeedbackStatus = keyof typeof FEEDBACK_STATUSES;
export type FeedbackStage = keyof typeof FEEDBACK_STAGES;
export type FeedbackCategory = keyof typeof FEEDBACK_CATEGORIES;
export type FeedbackImpact = keyof typeof FEEDBACK_IMPACTS;
export interface FeedbackAttachment {
    attachmentId: string;
    path: string;
}
export interface FeedbackContent {
    title: string;
    description: string;
    categoryKey: FeedbackCategory;
    impactScope: FeedbackImpact;
    attachments: FeedbackAttachment[];
}
export interface FeedbackAdmin { id: string; username: string; role: number; }
export interface FeedbackAdminOption extends FeedbackAdmin, CurrentDepartment {}
export interface FeedbackPermissions { withdraw: boolean; edit: boolean; resubmit: boolean; delete: boolean; progress: boolean; return: boolean; }
export interface FeedbackSummary {
    feedbackId: string;
    code: string;
    title: string;
    categoryKey: string;
    categoryLabel: string;
    impactScope: FeedbackImpact | null;
    status: FeedbackStatus;
    stage: FeedbackStage;
    progress: number;
    submitter: FeedbackAdmin | null;
    submitterName: string;
    submitterRoleSnapshot: number | null;
    submitterDepartmentSnapshot: DepartmentSnapshot | null;
    owner: FeedbackAdmin | null;
    ownerMissing: boolean;
    ownerDepartmentSnapshot: DepartmentSnapshot | null;
    dueAt: string | null;
    addTime: string;
    updatedAt: string;
    returnReason: string;
    followCount: number;
    isFollowing: boolean;
    hasUnread: boolean;
    allowedActions: FeedbackPermissions;
    version: number;
}
export interface FeedbackHistoryItem {
    id: string;
    feedbackVersion: number;
    action: string;
    operatorNameSnapshot: string | null;
    operatorRoleSnapshot: number | null;
    operatorDepartmentSnapshot: DepartmentSnapshot | null;
    createdAt: string | null;
    note: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    notifySubmitter: boolean;
}
export interface FeedbackDetail extends FeedbackSummary {
    description: string;
    attachments: FeedbackAttachment[];
    currentNote: string;
    completedTime: string | null;
    history: FeedbackHistoryItem[];
    historyPeople: FeedbackAdmin[];
    unreadNotificationIds: string[];
}
export interface FeedbackFilters {
    scope: "all" | "mine" | "following";
    categoryKey: string;
    stage: string;
    submitter: string;
    owner: string;
    sort: "newest" | "followers" | "progressDesc" | "progressAsc";
}
export interface FeedbackQuery extends FeedbackFilters { keyword: string; status: FeedbackStatus | "all"; page: number; pageSize: number; }
export interface FeedbackList { list: FeedbackSummary[]; total: number; page: number; pageSize: number; statusCounts: Record<FeedbackStatus | "all", number>; }
export interface FeedbackOptions {
    currentAdmin: FeedbackAdminOption;
    canManage: boolean;
    owners?: FeedbackAdminOption[];
    statuses: typeof FEEDBACK_STATUSES;
    stages: typeof FEEDBACK_STAGES;
    categories: typeof FEEDBACK_CATEGORIES;
    legacyCategories: Record<string, string>;
    impacts: typeof FEEDBACK_IMPACTS;
}
export interface FeedbackProgress {
    status: "pending" | "processing" | "completed";
    stage: Exclude<FeedbackStage, "returned" | "withdrawn">;
    progress: number;
    ownerAdminId: string;
    dueAt: string | null;
    note: string;
    notifySubmitter: boolean;
}
