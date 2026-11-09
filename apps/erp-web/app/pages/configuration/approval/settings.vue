<template>
    <div class="settings-page">
        <header class="page-header">
            <ErpBreadcrumb icon="lucide:layers" :items="breadcrumbItems" />
            <ErpSearchBox
                v-model="searchText"
                placeholder="搜索审批流程"
                @search="applySearch"
            />
        </header>

        <main class="settings-content">
            <div v-if="filteredFlows.length" class="flow-grid">
                <article v-for="flow in filteredFlows" :key="flow.type" class="flow-card">
                    <div class="flow-copy">
                        <h2>{{ flowMetadata[flow.type].title }}</h2>
                        <p>{{ flowMetadata[flow.type].description }}</p>
                    </div>
                    <button class="primary-button" type="button" @click="openFlowDialog(flow)">
                        流程设置
                    </button>
                </article>
            </div>
            <div v-else class="empty-state">
                <Icon name="lucide:search-x" />
                <span>未找到匹配的审批流程</span>
            </div>
        </main>

        <FlowDialog
            v-if="editingFlow"
            :title="flowMetadata[editingFlow.type].title"
            :flow="editingFlow"
            :roles="roleOptions"
            :users="userOptions"
            @close="editingFlow = null"
            @save="saveFlow"
        />
    </div>
</template>

<script setup lang="ts">
import FlowDialog from "~/components/approval/FlowDialog.vue";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import {
    getApprovalErrorMessage,
    useApproval,
} from "~/composables/useApproval";
import type {
    ApprovalFlowConfig,
    ApprovalType,
    FlowUser,
    FlowConfig,
    RoleOption,
} from "~/types/approval";
import { ADMIN_ROLE, ADMIN_ROLE_NAME, APPROVAL_APPLICANT_ROLES } from "~~/shared/enums";
import { normalizeOrderVisibleFields, type OrderApprovalField } from "~~/shared/types/orderApproval";

definePageMeta({
    layout: "approval",
});

const {
    applicantOptions,
    flowConfigs,
    loadApplicantOptions,
    loadFlowConfigs,
    updateFlow,
} = useApproval();
const applicantRoles = [...APPROVAL_APPLICANT_ROLES]
    .sort((left, right) => left - right);
const approverRoles = new Set<ADMIN_ROLE>([
    ADMIN_ROLE.SUPER,
    ADMIN_ROLE.OPERATOR,
    ADMIN_ROLE.SELLER,
    ADMIN_ROLE.FINANCE,
    ADMIN_ROLE.PURCHASER,
    ADMIN_ROLE.WAREHOUSE_KEEPER,
    ADMIN_ROLE.FINANCE_MANAGER,
    ADMIN_ROLE.PRODUCTION_MANAGER,
]);

// 申请人角色
const roleOptions = computed<RoleOption[]>(() => {
    const roles: ADMIN_ROLE[] = [...applicantRoles];
    if (editingFlow.value?.type === "purchase-request") {
        roles.push(ADMIN_ROLE.ELECTRONICS_WAREHOUSE_KEEPER);
    }
    return roles.map((role) => ({ id: String(role), name: ADMIN_ROLE_NAME[role] }));
});
const breadcrumbItems = [
    { label: "审批中心" },
    { label: "审批权限" },
];
const flowMetadata: Record<ApprovalType, { title: string; description: string }> = {
    borrow: {
        title: "借用审批",
        description: "提交物资借用申请单",
    },
    "sales-order": {
        title: "订单审批",
        description: "提交销售订单申请单",
    },
    receipt: {
        title: "回款单审批",
        description: "提交订单收款记录申请单",
    },
    "purchase-request": {
        title: "采购申请审批",
        description: "提交采购申请单",
    },
};
const searchText = ref("");
const appliedSearch = ref("");
const editingFlow = ref<FlowConfig | null>(null);

// 审批人/抄送
const userOptions = computed(() => applicantOptions.value
    .map((admin): FlowUser | null => {
        const role = admin.role as ADMIN_ROLE;
        if (!approverRoles.has(role)
            && !(editingFlow.value?.type === "purchase-request" && role === ADMIN_ROLE.ELECTRONICS_WAREHOUSE_KEEPER)) return null;
        return {
            id: admin.adminId,
            name: admin.username,
            roleId: String(role),
            roleName: ADMIN_ROLE_NAME[role],
        };
    })
    .filter((user: FlowUser | null): user is FlowUser => user !== null));

const getFlowUser = (adminId: string, type: ApprovalType): FlowUser => {
    const admin = applicantOptions.value.find((user) => user.adminId === adminId);
    const role = admin?.role as ADMIN_ROLE;
    if (admin && (approverRoles.has(role)
        || (type === "purchase-request" && role === ADMIN_ROLE.ELECTRONICS_WAREHOUSE_KEEPER))) {
        return {
            id: adminId,
            name: admin.username,
            roleId: String(role),
            roleName: ADMIN_ROLE_NAME[role],
        };
    }
    return { id: adminId, name: adminId };
};

const uniqueUsers = (ids: string[], type: ApprovalType) => {
    const seen = new Set<string>();
    const users: FlowUser[] = [];
    ids.forEach((id) => {
        if (seen.has(id)) return;
        seen.add(id);
        users.push(getFlowUser(id, type));
    });
    return users;
};

const createDefaultFlow = (type: ApprovalType): FlowConfig => ({
    type,
    steps: [{
        id: `${type}-first-approval`,
        type: "approval",
        key: "first-approval",
        name: "第一审批",
        order: 1,
        mode: "sequential",
        assignments: [{
            id: `${type}-first-approval-rule-0`,
            roleIds: ["all"],
            approvers: [],
            enabled: true,
            ...(type === "sales-order" ? { visibleFields: normalizeOrderVisibleFields() } : {}),
        }],
    }],
});

const groupRoleRules = (
    rules: ApprovalFlowConfig["steps"][number]["rules"],
    isOrder: boolean,
) => {
    const groups: {
        roleIds: string[];
        approverIds: string[];
        enabled: boolean;
        visibleFields?: OrderApprovalField[];
    }[] = [];
    const groupIndexes = new Map<string, number>();

    for (const rule of rules) {
        const visibleFields = isOrder
            ? normalizeOrderVisibleFields(rule.visibleFields)
            : undefined;
        const groupKey = JSON.stringify([rule.approverIds, rule.enabled, visibleFields]);
        const groupIndex = rule.applicantRole === null
            ? undefined
            : groupIndexes.get(groupKey);
        if (groupIndex !== undefined) {
            groups[groupIndex]!.roleIds.push(String(rule.applicantRole));
            continue;
        }

        if (rule.applicantRole !== null) {
            groupIndexes.set(groupKey, groups.length);
        }
        groups.push({
            roleIds: [rule.applicantRole === null ? "all" : String(rule.applicantRole)],
            approverIds: [...rule.approverIds],
            enabled: rule.enabled,
            ...(visibleFields !== undefined ? { visibleFields } : {}),
        });
    }

    return groups;
};

const toEditorFlow = (config: ApprovalFlowConfig): FlowConfig => ({
    type: config.type,
    steps: [...config.steps]
        .sort((left, right) => left.order - right.order)
        .map((step) => {
            const id = `${config.type}-${step.key}`;
            const rules = groupRoleRules(step.rules, config.type === "sales-order");
            if (step.key === "cc" || step.key === "shooting-cc") {
                return {
                    id,
                    type: "cc",
                    key: step.key,
                    name: step.name,
                    order: step.order,
                    assignments: rules.map((rule, index) => ({
                        id: `${id}-rule-${index}`,
                        roleIds: rule.roleIds,
                        users: uniqueUsers(rule.approverIds, config.type),
                        enabled: rule.enabled,
                        ...(rule.visibleFields !== undefined ? { visibleFields: rule.visibleFields } : {}),
                    })),
                };
            }

            return {
                id,
                type: "approval",
                key: step.key,
                name: step.name,
                order: step.order,
                mode: step.strategy,
                assignments: rules.map((rule, index) => ({
                    id: `${id}-rule-${index}`,
                    roleIds: rule.roleIds,
                    approvers: rule.approverIds.map((adminId) => getFlowUser(adminId, config.type)),
                    enabled: rule.enabled,
                    ...(rule.visibleFields !== undefined ? { visibleFields: rule.visibleFields } : {}),
                })),
            };
        }),
});

const flows = computed(() => {
    const configuredFlows = new Map<ApprovalType, FlowConfig>(
        flowConfigs.value.map((config) => [
            config.type,
            toEditorFlow(config),
        ] as const),
    );
    return (Object.keys(flowMetadata) as ApprovalType[]).map((type) =>
        configuredFlows.get(type) || createDefaultFlow(type),
    );
});

const filteredFlows = computed(() => {
    const keyword = appliedSearch.value.toLowerCase();
    if (!keyword) return flows.value;
    return flows.value.filter((flow) => {
        const metadata = flowMetadata[flow.type];
        return [metadata.title, metadata.description]
            .some((value) => value.toLowerCase().includes(keyword));
    });
});

const applySearch = () => {
    appliedSearch.value = searchText.value.trim();
};

const openFlowDialog = (flow: FlowConfig) => {
    editingFlow.value = flow;
};

const toApprovalFlowConfig = (flow: FlowConfig): ApprovalFlowConfig => ({
    type: flow.type,
    steps: [...flow.steps]
        .sort((left, right) => left.order - right.order)
        .map((step, index) => {
            const order = index + 1;
            const rules: ApprovalFlowConfig["steps"][number]["rules"] = [];
            if (step.type === "cc") {
                for (const assignment of step.assignments) {
                    for (const roleId of assignment.roleIds) {
                        rules.push({
                            applicantRole: roleId === "all" ? null : Number(roleId),
                            approverIds: assignment.users.map((user) => user.id),
                            enabled: assignment.enabled,
                            ...(flow.type === "sales-order" ? { visibleFields: assignment.visibleFields || [] } : {}),
                        });
                    }
                }
                return {
                    key: step.key,
                    name: step.key === "shooting-cc" ? "拍摄任务抄送" : "抄送",
                    order,
                    rules,
                };
            }

            for (const assignment of step.assignments) {
                for (const roleId of assignment.roleIds) {
                    rules.push({
                        applicantRole: roleId === "all" ? null : Number(roleId),
                        approverIds: assignment.approvers.map((user) => user.id),
                        enabled: assignment.enabled,
                        ...(flow.type === "sales-order" ? { visibleFields: assignment.visibleFields || [] } : {}),
                    });
                }
            }
            if (step.key === "first-approval") {
                return {
                    key: "first-approval",
                    name: "第一审批",
                    order,
                    strategy: "sequential",
                    rules,
                };
            }
            if (step.key === "third-approval") {
                return {
                    key: "third-approval",
                    name: "第三审批",
                    order,
                    strategy: "any",
                    rules,
                };
            }
            return {
                key: "second-approval",
                name: "第二审批",
                order,
                strategy: "any",
                rules,
            };
        }) as ApprovalFlowConfig["steps"],
});

const saveFlow = async (flow: FlowConfig) => {
    try {
        await updateFlow(toApprovalFlowConfig(flow));
        editingFlow.value = null;
        ElMessage.success("审批流程已保存");
    } catch (error) {
        ElMessage.error(getApprovalErrorMessage(error, "保存审批流程失败"));
    }
};

const loadSettings = async () => {
    try {
        await loadApplicantOptions();
    } catch (error) {
        ElMessage.error(getApprovalErrorMessage(error, "获取审批人列表失败"));
    }

    try {
        await loadFlowConfigs();
    } catch (error) {
        ElMessage.error(getApprovalErrorMessage(error, "获取审批流程失败"));
    }
};

onMounted(() => {
    void loadSettings();
});
</script>

<style scoped>
.settings-page {
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: 40px minmax(0, 1fr);
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
}

.page-header {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--erp-spacing-20);
}

.settings-content {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
    padding: var(--erp-spacing-20);
}

.flow-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: var(--erp-spacing-20);
}

.flow-card {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--erp-spacing-16);
    padding: var(--erp-spacing-20);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
}

.flow-copy {
    min-width: 0;
}

.flow-copy h2 {
    margin: 0;
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.flow-copy p,
.flow-copy span {
    margin: var(--erp-spacing-4) 0 0;
    overflow: hidden;
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.flow-copy span {
    display: block;
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.primary-button {
    height: var(--erp-size-control-height-sm);
    flex: 0 0 auto;
    padding: 0 var(--erp-spacing-12);
    border: 1px solid var(--erp-color-action-primary);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    cursor: pointer;
}

.empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: var(--erp-spacing-8);
    color: var(--erp-color-text-tertiary);
}

.empty-state {
    min-height: 240px;
}

.empty-state :deep(svg) {
    width: var(--erp-spacing-40);
    height: var(--erp-spacing-40);
}

@media (max-width: 1000px) {
    .flow-grid {
        grid-template-columns: 1fr;
    }
}
</style>
