<template>
    <div class="erp-dialog-mask flow-dialog-mask">
        <ErpDialogFrame
            v-if="localFlow"
            class="flow-dialog"
            :title="`${title}设置`"
            width="min(960px, calc(100vw - 48px))"
            height="min(606px, calc(100vh - 48px))"
            :form="false"
            @close="emit('close')"
        >
            <div class="flow-editor">
                <div class="flow-config">
                    <section
                        v-for="step in approvalSteps"
                        :key="step.id"
                        class="editor-step"
                    >
                        <header class="editor-step-heading">
                            <h3>{{ step.name }}</h3>
                            <div class="step-actions">
                                <button type="button" @click="addAssignment(step)">
                                    <Icon name="lucide:circle-plus" />
                                </button>
                                <button
                                    type="button"
                                    :disabled="approvalSteps.length === 1"
                                    @click="removeApprovalStep(step)"
                                >
                                    <Icon name="lucide:trash-2" />
                                </button>
                            </div>
                        </header>

                        <div class="assignment-table">
                            <div class="assignment-grid assignment-head">
                                <div>申请人角色</div>
                                <div>{{ step.name }}人</div>
                                <div>启用</div>
                                <div>操作</div>
                            </div>
                            <div
                                v-for="(assignment, assignmentIndex) in step.assignments"
                                :key="assignment.id"
                                class="assignment-grid assignment-row"
                            >
                                <div>
                                    <el-select
                                        :model-value="assignment.roleIds"
                                        multiple
                                        filterable
                                        clearable
                                        collapse-tags
                                        collapse-tags-tooltip
                                        placeholder="请选择申请人角色"
                                        @change="changeRoles(assignment, $event)"
                                    >
                                        <el-option label="全部角色" value="all" />
                                        <el-option
                                            v-for="role in roles"
                                            :key="role.id"
                                            :label="role.name"
                                            :value="role.id"
                                        />
                                    </el-select>
                                </div>
                                <div>
                                    <el-select
                                        v-model="assignment.approvers"
                                        value-key="id"
                                        multiple
                                        filterable
                                        collapse-tags
                                        collapse-tags-tooltip
                                        placeholder="请选择审批人"
                                    >
                                        <el-option
                                            v-for="user in users"
                                            :key="user.id"
                                            :label="getUserLabel(user)"
                                            :value="user"
                                        />
                                    </el-select>
                                </div>
                                <div class="switch-cell">
                                    <el-switch v-model="assignment.enabled" />
                                </div>
                                <div class="assignment-actions">
                                    <a v-if="localFlow?.type === 'sales-order'" href="#" class="field-link" @click.prevent="openFieldPicker(assignment)">详情字段</a>
                                    <button
                                        type="button"
                                        :disabled="assignmentIndex === 0"
                                        @click="moveAssignment(step, assignmentIndex, -1)"
                                    >
                                        <Icon name="lucide:arrow-up" />
                                    </button>
                                    <button
                                        type="button"
                                        :disabled="assignmentIndex === step.assignments.length - 1"
                                        @click="moveAssignment(step, assignmentIndex, 1)"
                                    >
                                        <Icon name="lucide:arrow-down" />
                                    </button>
                                    <button
                                        type="button"
                                        :disabled="step.assignments.length === 1"
                                        @click="removeAssignment(step, assignmentIndex)"
                                    >
                                        <Icon name="lucide:trash-2" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section v-if="ccStep" class="editor-step">
                        <header class="editor-step-heading">
                            <h3>抄送</h3>
                            <div class="step-actions">
                                <button type="button" @click="addCopyAssignment(ccStep)">
                                    <Icon name="lucide:circle-plus" />
                                </button>
                                <button type="button" @click="removeCopyStep('cc')">
                                    <Icon name="lucide:trash-2" />
                                </button>
                            </div>
                        </header>
                        <div class="assignment-table">
                            <div class="assignment-grid assignment-head">
                                <div>申请人角色</div>
                                <div>抄送用户</div>
                                <div>启用</div>
                                <div>操作</div>
                            </div>
                            <div
                                v-for="(assignment, assignmentIndex) in ccStep.assignments"
                                :key="assignment.id"
                                class="assignment-grid assignment-row"
                            >
                                <div>
                                    <el-select
                                        :model-value="assignment.roleIds"
                                        multiple
                                        filterable
                                        clearable
                                        collapse-tags
                                        collapse-tags-tooltip
                                        placeholder="请选择申请人角色"
                                        @change="changeRoles(assignment, $event)"
                                    >
                                        <el-option label="全部角色" value="all" />
                                        <el-option
                                            v-for="role in roles"
                                            :key="role.id"
                                            :label="role.name"
                                            :value="role.id"
                                        />
                                    </el-select>
                                </div>
                                <div>
                                    <el-select
                                        v-model="assignment.users"
                                        value-key="id"
                                        multiple
                                        filterable
                                        collapse-tags
                                        collapse-tags-tooltip
                                        placeholder="请选择抄送用户"
                                    >
                                        <el-option
                                            v-for="user in users"
                                            :key="user.id"
                                            :label="getUserLabel(user)"
                                            :value="user"
                                        />
                                    </el-select>
                                </div>
                                <div class="switch-cell">
                                    <el-switch v-model="assignment.enabled" />
                                </div>
                                <div class="assignment-actions">
                                    <a v-if="localFlow?.type === 'sales-order'" href="#" class="field-link" @click.prevent="openFieldPicker(assignment)">详情字段</a>
                                    <button
                                        type="button"
                                        :disabled="assignmentIndex === 0"
                                        @click="moveCopyAssignment(ccStep, assignmentIndex, -1)"
                                    >
                                        <Icon name="lucide:arrow-up" />
                                    </button>
                                    <button
                                        type="button"
                                        :disabled="assignmentIndex === ccStep.assignments.length - 1"
                                        @click="moveCopyAssignment(ccStep, assignmentIndex, 1)"
                                    >
                                        <Icon name="lucide:arrow-down" />
                                    </button>
                                    <button
                                        type="button"
                                        :disabled="ccStep.assignments.length === 1"
                                        @click="removeCopyAssignment(ccStep, assignmentIndex)"
                                    >
                                        <Icon name="lucide:trash-2" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section v-if="shootingCcStep" class="editor-step">
                        <header class="editor-step-heading">
                            <h3>拍摄任务抄送</h3>
                            <div class="step-actions">
                                <button type="button" @click="addCopyAssignment(shootingCcStep)">
                                    <Icon name="lucide:circle-plus" />
                                </button>
                                <button type="button" @click="removeCopyStep('shooting-cc')">
                                    <Icon name="lucide:trash-2" />
                                </button>
                            </div>
                        </header>
                        <div class="assignment-table">
                            <div class="assignment-grid assignment-head">
                                <div>申请人角色</div>
                                <div>运营收件人</div>
                                <div>启用</div>
                                <div>操作</div>
                            </div>
                            <div
                                v-for="(assignment, assignmentIndex) in shootingCcStep.assignments"
                                :key="assignment.id"
                                class="assignment-grid assignment-row"
                            >
                                <div>
                                    <el-select
                                        :model-value="assignment.roleIds"
                                        multiple
                                        filterable
                                        clearable
                                        collapse-tags
                                        collapse-tags-tooltip
                                        placeholder="请选择申请人角色"
                                        @change="changeRoles(assignment, $event)"
                                    >
                                        <el-option label="全部角色" value="all" />
                                        <el-option
                                            v-for="role in roles"
                                            :key="role.id"
                                            :label="role.name"
                                            :value="role.id"
                                        />
                                    </el-select>
                                </div>
                                <div>
                                    <el-select
                                        v-model="assignment.users"
                                        value-key="id"
                                        multiple
                                        filterable
                                        collapse-tags
                                        collapse-tags-tooltip
                                        placeholder="请选择运营收件人"
                                    >
                                        <el-option
                                            v-for="user in operatorUsers"
                                            :key="user.id"
                                            :label="getUserLabel(user)"
                                            :value="user"
                                        />
                                    </el-select>
                                </div>
                                <div class="switch-cell">
                                    <el-switch v-model="assignment.enabled" />
                                </div>
                                <div class="assignment-actions">
                                    <a href="#" class="field-link" @click.prevent="openFieldPicker(assignment, true)">详情字段</a>
                                    <button
                                        type="button"
                                        :disabled="assignmentIndex === 0"
                                        @click="moveCopyAssignment(shootingCcStep, assignmentIndex, -1)"
                                    >
                                        <Icon name="lucide:arrow-up" />
                                    </button>
                                    <button
                                        type="button"
                                        :disabled="assignmentIndex === shootingCcStep.assignments.length - 1"
                                        @click="moveCopyAssignment(shootingCcStep, assignmentIndex, 1)"
                                    >
                                        <Icon name="lucide:arrow-down" />
                                    </button>
                                    <button
                                        type="button"
                                        :disabled="shootingCcStep.assignments.length === 1"
                                        @click="removeCopyAssignment(shootingCcStep, assignmentIndex)"
                                    >
                                        <Icon name="lucide:trash-2" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    <div class="add-step-actions">
                        <button v-if="!firstStep" class="primary-step-button" type="button" @click="addFirstStep">
                            <Icon name="lucide:circle-plus" />
                            新增第一审批
                        </button>
                        <button v-if="!secondStep" class="primary-step-button" type="button" @click="addSecondStep">
                            <Icon name="lucide:circle-plus" />
                            新增第二审批
                        </button>
                        <button v-if="!thirdStep" class="primary-step-button" type="button" @click="addThirdStep">
                            <Icon name="lucide:circle-plus" />
                            新增第三审批
                        </button>
                        <button v-if="!ccStep" class="primary-step-button" type="button" @click="addCcStep">
                            <Icon name="lucide:circle-plus" />
                            新增抄送环节
                        </button>
                        <button
                            v-if="localFlow?.type === 'sales-order' && !shootingCcStep"
                            class="primary-step-button"
                            type="button"
                            @click="addShootingCcStep"
                        >
                            <Icon name="lucide:camera" />
                            新增拍摄任务抄送
                        </button>
                    </div>
                </div>

                <section class="flow-preview">
                    <h3>审批流程</h3>
                    <div class="preview-track">
                        <div class="preview-node">
                            <span class="preview-marker start-marker">
                                <Icon name="lucide:play" />
                            </span>
                            <span>发起审批</span>
                        </div>
                        <template v-for="(step, index) in orderedSteps" :key="step.id">
                            <span class="preview-line"></span>
                            <div class="preview-node">
                                <span class="preview-marker preview-index">{{ index + 1 }}</span>
                                <span>{{ getPreviewStepName(step) }}</span>
                            </div>
                        </template>
                        <span class="preview-line"></span>
                        <div class="preview-node">
                            <span class="preview-marker end-marker">
                                <Icon name="lucide:check" />
                            </span>
                            <span>审批完成</span>
                        </div>
                    </div>
                </section>
            </div>

            <div v-if="fieldPickerAssignment" class="field-picker-mask" @click.self="closeFieldPicker">
                <div class="field-picker">
                    <header><h3>审批详情展示字段</h3><button type="button" @click="closeFieldPicker">×</button></header>
                    <div class="field-picker-toolbar">
                        <strong>可展示字段</strong>
                        <button type="button" @click="pickerFields = fieldPickerIsShooting ? normalizeShootingCcVisibleFields() : normalizeOrderVisibleFields()">全选</button>
                    </div>
                    <div v-for="group in fieldPickerGroups" :key="group.label" class="field-group">
                        <div class="field-group-heading">
                            <strong>{{ group.label }}</strong>
                            <button type="button" @click="toggleFieldGroup(group.fields.map((field) => field.key))">
                                {{ isFieldGroupSelected(group.fields.map((field) => field.key)) ? "取消全选" : "全选" }}
                            </button>
                        </div>
                        <label v-for="field in group.fields" :key="field.key" class="field-option">
                            <input v-model="pickerFields" type="checkbox" :value="field.key"><span>{{ field.label }}</span>
                        </label>
                    </div>
                    <footer>
                        <button type="button" class="dialog-button cancel" @click="pickerFields = []">清空</button>
                        <button type="button" class="dialog-button confirm" @click="saveFieldPicker">确认</button>
                    </footer>
                </div>
            </div>

            <template #footer>
                <button class="dialog-button cancel" type="button" @click="emit('close')">取消</button>
                <button class="dialog-button confirm" type="button" @click="saveFlow">确认</button>
            </template>
        </ErpDialogFrame>
    </div>
</template>

<script setup lang="ts">
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import type {
    FlowApprovalStep,
    FlowCcStep,
    FlowConfig,
    FlowStep,
    FlowUser,
    RoleApprovers,
    RoleCcUsers,
    RoleOption,
} from "~/types/approval";
import {
    ORDER_APPROVAL_FIELD_GROUPS,
    SHOOTING_CC_VISIBLE_FIELDS,
    normalizeOrderVisibleFields,
    normalizeShootingCcVisibleFields,
    type OrderApprovalField,
} from "~~/shared/types/orderApproval";
import { ADMIN_ROLE } from "~~/shared/enums";

const props = defineProps<{
    title: string;
    flow: FlowConfig;
    roles: RoleOption[];
    users: FlowUser[];
}>();

const emit = defineEmits<{
    close: [];
    save: [flow: FlowConfig];
}>();

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const localFlow = ref<FlowConfig | null>(null);
const approvalStepNames = {
    "first-approval": "第一审批",
    "second-approval": "第二审批",
    "third-approval": "第三审批",
};
const approvalStepOrder: FlowApprovalStep["key"][] = [
    "first-approval",
    "second-approval",
    "third-approval",
];
const fieldPickerAssignment = ref<RoleApprovers | RoleCcUsers | null>(null);
const fieldPickerIsShooting = ref(false);
const pickerFields = ref<OrderApprovalField[]>([]);
const openFieldPicker = (assignment: RoleApprovers | RoleCcUsers, shooting = false) => {
    fieldPickerAssignment.value = assignment;
    fieldPickerIsShooting.value = shooting;
    pickerFields.value = shooting
        ? normalizeShootingCcVisibleFields(assignment.visibleFields)
        : normalizeOrderVisibleFields(assignment.visibleFields);
};
const closeFieldPicker = () => { fieldPickerAssignment.value = null; fieldPickerIsShooting.value = false; };
const saveFieldPicker = () => {
    if (fieldPickerAssignment.value) {
        fieldPickerAssignment.value.visibleFields = fieldPickerIsShooting.value
            ? normalizeShootingCcVisibleFields(pickerFields.value)
            : normalizeOrderVisibleFields(pickerFields.value);
    }
    closeFieldPicker();
};
const isFieldGroupSelected = (fields: readonly OrderApprovalField[]) => fields.every((field) => pickerFields.value.includes(field));
const toggleFieldGroup = (fields: readonly OrderApprovalField[]) => {
    const selected = new Set(pickerFields.value);
    if (isFieldGroupSelected(fields)) fields.forEach((field) => selected.delete(field));
    else fields.forEach((field) => selected.add(field));
    pickerFields.value = fieldPickerIsShooting.value
        ? normalizeShootingCcVisibleFields([...selected])
        : normalizeOrderVisibleFields([...selected]);
};
const fieldPickerGroups = computed(() => ORDER_APPROVAL_FIELD_GROUPS
    .map((group) => ({
        ...group,
        fields: group.fields.filter((field) => !fieldPickerIsShooting.value || SHOOTING_CC_VISIBLE_FIELDS.includes(field.key)),
    }))
    .filter((group) => group.fields.length > 0));

watch(
    () => props.flow,
    (flow) => {
        localFlow.value = clone(flow);
        normalizeOrder();
    },
    { immediate: true },
);

const orderedSteps = computed(() =>
    [...(localFlow.value?.steps || [])].sort((left, right) => left.order - right.order),
);
const operatorUsers = computed(() =>
    props.users.filter((user) => Number(user.roleId) === ADMIN_ROLE.OPERATOR),
);
const approvalSteps = computed(() =>
    orderedSteps.value.filter((step): step is FlowApprovalStep => step.type === "approval"),
);
const firstStep = computed(() =>
    approvalSteps.value.find((step) => step.key === "first-approval") || null,
);
const secondStep = computed(() =>
    approvalSteps.value.find((step) => step.key === "second-approval") || null,
);
const thirdStep = computed(() =>
    approvalSteps.value.find((step) => step.key === "third-approval") || null,
);
const ccStep = computed(() =>
    orderedSteps.value.find((step): step is FlowCcStep =>
        step.type === "cc" && step.key === "cc",
    ) || null,
);
const shootingCcStep = computed(() =>
    orderedSteps.value.find((step): step is FlowCcStep =>
        step.type === "cc" && step.key === "shooting-cc",
    ) || null,
);

function normalizeOrder() {
    if (!localFlow.value) return;
    const approvals = localFlow.value.steps
        .filter((step): step is FlowApprovalStep => step.type === "approval")
        .sort((left, right) => approvalStepOrder.indexOf(left.key) - approvalStepOrder.indexOf(right.key))
        .map((step, index) => {
            step.order = index + 1;
            step.name = approvalStepNames[step.key];
            step.mode = step.key === "first-approval" ? "sequential" : "any";
            return step;
        });
    const copySteps = localFlow.value.steps
        .filter((step): step is FlowCcStep => step.type === "cc")
        .sort((left, right) => Number(left.key === "shooting-cc") - Number(right.key === "shooting-cc"))
        .map((step, index) => ({
            ...step,
            name: step.key === "shooting-cc" ? "拍摄任务抄送" : "抄送",
            order: approvals.length + index + 1,
        }));
    localFlow.value.steps = [...approvals, ...copySteps];
}

let localIdSequence = 0;
const buildLocalId = (prefix: string) =>
    `${prefix}-${Date.now()}-${localIdSequence++}`;

const buildApprovalStep = (
    key: FlowApprovalStep["key"],
): FlowApprovalStep => {
    const stepId = buildLocalId(`${localFlow.value?.type}-${key}`);
    return {
        id: stepId,
        type: "approval",
        key,
        name: approvalStepNames[key],
        order: approvalStepOrder.indexOf(key) + 1,
        mode: key === "first-approval" ? "sequential" : "any",
        assignments: [{
            id: buildLocalId(`${stepId}-assignment`),
            roleIds: ["all"],
            approvers: [],
            enabled: true,
            ...(localFlow.value?.type === "sales-order" ? { visibleFields: normalizeOrderVisibleFields() } : {}),
        }],
    };
};

const addFirstStep = () => {
    if (!localFlow.value || firstStep.value) return;
    localFlow.value.steps.push(buildApprovalStep("first-approval"));
    normalizeOrder();
};

const addSecondStep = () => {
    if (!localFlow.value || secondStep.value) return;
    localFlow.value.steps.push(buildApprovalStep("second-approval"));
    normalizeOrder();
};

const addThirdStep = () => {
    if (!localFlow.value || thirdStep.value) return;
    localFlow.value.steps.push(buildApprovalStep("third-approval"));
    normalizeOrder();
};

const removeApprovalStep = (target: FlowApprovalStep) => {
    if (!localFlow.value || approvalSteps.value.length === 1) return;
    localFlow.value.steps = localFlow.value.steps.filter((step) => step.id !== target.id);
    normalizeOrder();
};

const addCcStep = () => {
    if (!localFlow.value || ccStep.value) return;
    const stepId = buildLocalId(`${localFlow.value.type}-cc`);
    localFlow.value.steps.push({
        id: stepId,
        type: "cc",
        key: "cc",
        name: "抄送",
        order: localFlow.value.steps.length + 1,
        assignments: [{
            id: buildLocalId(`${stepId}-assignment`),
            roleIds: ["all"],
            users: [],
            enabled: true,
            ...(localFlow.value.type === "sales-order" ? { visibleFields: normalizeOrderVisibleFields() } : {}),
        }],
    });
    normalizeOrder();
};

const addShootingCcStep = () => {
    if (!localFlow.value || localFlow.value.type !== "sales-order" || shootingCcStep.value) return;
    const stepId = buildLocalId(`${localFlow.value.type}-shooting-cc`);
    localFlow.value.steps.push({
        id: stepId,
        type: "cc",
        key: "shooting-cc",
        name: "拍摄任务抄送",
        order: localFlow.value.steps.length + 1,
        assignments: [{
            id: buildLocalId(`${stepId}-assignment`),
            roleIds: ["all"],
            users: [],
            enabled: true,
            visibleFields: normalizeOrderVisibleFields(),
        }],
    });
    normalizeOrder();
};

const removeCopyStep = (key: FlowCcStep["key"]) => {
    if (!localFlow.value) return;
    localFlow.value.steps = localFlow.value.steps.filter((step) =>
        step.type !== "cc" || step.key !== key,
    );
    normalizeOrder();
};

const addAssignment = (step: FlowApprovalStep) => {
    step.assignments.push({
        id: buildLocalId(`${step.id}-assignment`),
        roleIds: ["all"],
        approvers: [],
        enabled: true,
        ...(localFlow.value?.type === "sales-order" ? { visibleFields: normalizeOrderVisibleFields() } : {}),
    });
};

const removeAssignment = (step: FlowApprovalStep, index: number) => {
    if (step.assignments.length === 1) return;
    step.assignments.splice(index, 1);
};

const moveAssignment = (step: FlowApprovalStep, index: number, offset: -1 | 1) => {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= step.assignments.length) return;
    const [assignment] = step.assignments.splice(index, 1);
    if (!assignment) return;
    step.assignments.splice(targetIndex, 0, assignment);
};

const addCopyAssignment = (step: FlowCcStep) => {
    step.assignments.push({
        id: buildLocalId(`${step.id}-assignment`),
        roleIds: ["all"],
        users: [],
        enabled: true,
        ...(localFlow.value?.type === "sales-order"
            ? { visibleFields: step.key === "shooting-cc" ? normalizeShootingCcVisibleFields() : normalizeOrderVisibleFields() }
            : {}),
    });
};

const removeCopyAssignment = (step: FlowCcStep, index: number) => {
    if (step.assignments.length === 1) return;
    step.assignments.splice(index, 1);
};

const moveCopyAssignment = (step: FlowCcStep, index: number, offset: -1 | 1) => {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= step.assignments.length) return;
    const [assignment] = step.assignments.splice(index, 1);
    if (!assignment) return;
    step.assignments.splice(targetIndex, 0, assignment);
};

const changeRoles = (assignment: RoleApprovers | RoleCcUsers, roleIds: string[]) => {
    if (roleIds.includes("all") && !assignment.roleIds.includes("all")) {
        assignment.roleIds = ["all"];
        return;
    }
    assignment.roleIds = roleIds.filter((roleId) => roleId !== "all");
};

const getPreviewStepName = (step: FlowStep) => {
    if (step.type === "cc") return step.name;
    return `${step.name}人`;
};

const getUserLabel = (user: FlowUser) => user.roleName
    ? `${user.name}（${user.roleName}）`
    : user.name;

const saveFlow = () => {
    if (!localFlow.value) return;
    for (const step of orderedSteps.value) {
        const roles = new Set<string>();
        for (const assignment of step.assignments) {
            if (assignment.roleIds.length === 0) {
                ElMessage.warning(`请为${step.name}的每条规则选择申请人角色`);
                return;
            }
            for (const roleId of assignment.roleIds) {
                if (roles.has(roleId)) {
                    ElMessage.warning(`${step.name}中同一申请人角色只能配置一条规则`);
                    return;
                }
                roles.add(roleId);
            }
        }
    }
    const stepWithoutEnabledAssignment = approvalSteps.value.find((step) =>
        !step.assignments.some((assignment) => assignment.enabled),
    );
    if (stepWithoutEnabledAssignment) {
        ElMessage.warning(`请为${stepWithoutEnabledAssignment.name}启用至少一条审批规则`);
        return;
    }
    const stepWithIncompleteAssignment = approvalSteps.value.find((step) =>
        step.assignments.some((assignment) =>
            assignment.enabled && assignment.approvers.length === 0,
        ),
    );
    if (stepWithIncompleteAssignment) {
        ElMessage.warning(`请为${stepWithIncompleteAssignment.name}的每条已启用规则配置审批人`);
        return;
    }
    const copySteps = [ccStep.value, shootingCcStep.value].filter(
        (step): step is FlowCcStep => Boolean(step),
    );
    for (const copyStep of copySteps) {
        if (!copyStep.assignments.some((assignment) => assignment.enabled)) {
            ElMessage.warning(`请为${copyStep.name}启用至少一条规则`);
            return;
        }
        if (copyStep.assignments.some((assignment) =>
            assignment.enabled && assignment.users.length === 0,
        )) {
            ElMessage.warning(`请为${copyStep.name}的每条已启用规则配置用户`);
            return;
        }
        if (
            copyStep.key === "shooting-cc"
            && copyStep.assignments.some((assignment) =>
                assignment.users.some((user) => Number(user.roleId) !== ADMIN_ROLE.OPERATOR),
            )
        ) {
            ElMessage.warning("拍摄任务抄送只能选择运营账号");
            return;
        }
    }

    normalizeOrder();
    emit("save", localFlow.value);
};
</script>

<style scoped>
.flow-dialog-mask {
    z-index: 45;
}

.flow-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
    padding: 0;
    overflow: hidden;
}

.flow-editor {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 166px;
    align-items: stretch;
    overflow: hidden;
    background: var(--erp-color-fill-default);
}

.flow-config {
    min-width: 0;
    min-height: 0;
    display: grid;
    align-content: start;
    gap: var(--erp-spacing-16);
    padding: var(--erp-spacing-20);
    overflow-y: auto;
}

.editor-step {
    min-width: 0;
    display: grid;
    gap: var(--erp-spacing-12);
}

.editor-step-heading {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--erp-spacing-12);
}

.flow-preview h3,
.editor-step-heading h3 {
    margin: 0;
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
}

.step-actions,
.add-step-actions,
.assignment-actions {
    display: flex;
    gap: var(--erp-spacing-8);
}

.step-actions button,
.primary-step-button,
.assignment-actions button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    border-radius: var(--erp-radius-control-default);
    cursor: pointer;
}
.field-link { color: var(--erp-color-text-brand); text-decoration: none; white-space: nowrap; }
.field-picker-mask { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; background: rgb(0 0 0 / 35%); }
.field-picker { width: min(560px, calc(100vw - 40px)); padding: 20px; border-radius: var(--erp-radius-surface-default); background: var(--erp-color-fill-default); }
.field-picker > header, .field-picker > footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.field-picker h3 { margin: 0; }
.field-group { margin-top: 16px; }
.field-option { display: inline-flex; width: 33%; gap: 8px; padding: 7px 0; }
.field-picker-toolbar, .field-group-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.field-picker-toolbar button, .field-group-heading button { border: 0; color: var(--erp-color-text-brand); background: transparent; cursor: pointer; }
.field-picker footer { justify-content: flex-end; margin-top: 18px; }

.step-actions button {
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid var(--erp-color-border-default);
    color: var(--erp-color-icon-default);
    background: var(--erp-color-fill-default);
}

.step-actions button:hover:not(:disabled) {
    border-color: var(--erp-color-border-brand);
    color: var(--erp-color-icon-brand);
}

.step-actions button:disabled {
    color: var(--erp-color-icon-disabled);
    cursor: not-allowed;
}

.step-actions button :deep(svg) {
    width: 20px;
    height: 20px;
}

.add-step-actions {
    min-width: 0;
    justify-content: center;
}

.primary-step-button {
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.primary-step-button :deep(svg) {
    width: 18px;
    height: 18px;
}

.assignment-table {
    min-width: 0;
    overflow-x: auto;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-control-default);
}

.assignment-grid {
    min-width: 720px;
    display: grid;
    grid-template-columns: 166px minmax(320px, 1fr) 92px 110px;
    align-items: center;
}

.assignment-grid > div {
    min-width: 0;
    padding: 0 var(--erp-spacing-16);
}

.assignment-head {
    min-height: 44px;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-table-header);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
}

.assignment-row {
    min-height: 66px;
    border-top: 1px solid var(--erp-color-divider-default);
}

.assignment-row :deep(.el-select) {
    width: 100%;
}

.switch-cell {
    display: flex;
    justify-content: center;
}

.assignment-actions button {
    width: 20px;
    height: 28px;
    padding: 0;
    border: 0;
    color: var(--erp-color-icon-secondary);
    background: transparent;
}

.assignment-actions button:disabled {
    color: var(--erp-color-icon-disabled);
    cursor: not-allowed;
}

.assignment-actions button :deep(svg) {
    width: 16px;
    height: 16px;
}

.flow-preview {
    min-width: 0;
    display: grid;
    align-content: start;
    align-self: stretch;
    gap: var(--erp-spacing-12);
    padding: var(--erp-spacing-20);
    border-left: 1px solid var(--erp-color-divider-subtle);
    background: var(--erp-color-bg-page);
}

.preview-track {
    min-width: 0;
    display: grid;
    justify-items: start;
}

.preview-node {
    min-height: 28px;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: var(--erp-spacing-10);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.preview-marker {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 50%;
}

.preview-index {
    border: 1px solid var(--erp-color-border-default);
    color: var(--erp-color-text-secondary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-note-font-size);
}

.start-marker {
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.end-marker {
    color: var(--erp-color-text-status-complete);
    background: var(--erp-color-bg-status-complete);
}

.start-marker :deep(svg),
.end-marker :deep(svg) {
    width: 14px;
    height: 14px;
}

.start-marker :deep(svg) {
    fill: currentColor;
}

.preview-line {
    width: 1px;
    height: 22px;
    margin-left: 13px;
    background: var(--erp-color-border-default);
}

@media (max-width: 900px) {
    .flow-editor {
        grid-template-columns: minmax(0, 1fr);
        overflow: auto;
    }

    .flow-config {
        overflow: visible;
    }

    .flow-preview {
        border-top: 1px solid var(--erp-color-divider-subtle);
        border-left: 0;
    }
}
</style>
