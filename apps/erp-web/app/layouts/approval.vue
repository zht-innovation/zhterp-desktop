<template>
    <ConfigurationSidebarLayout
        module-id="approval"
        contentInset
        layout-class="approval-layout approval-admin-layout"
        content-class="approval-content"
        :default-selected-id="defaultSelectedId"
        :sections="sidebarSections"
    >
        <slot />
    </ConfigurationSidebarLayout>
</template>

<script setup lang="ts">
import ConfigurationSidebarLayout from "~/components/configuration/ConfigurationSidebarLayout.vue";
import { canManageApprovalFlow } from "~~/shared/utils/adminPermission";
import { ADMIN_ROLE } from "~~/shared/enums";

const adminInfo = useState<any>("admin_info", () => ({}));

type ApprovalSidebarSection = {
    id: string;
    label: string;
    icon: string;
    path: string;
};

const canManageFlow = computed(() => canManageApprovalFlow(
    Number(adminInfo.value?.role),
    adminInfo.value?.canManageApprovalFlow,
));

const isProductionManager = computed(() =>
    Number(adminInfo.value?.role) === ADMIN_ROLE.PRODUCTION_MANAGER,
);

const sidebarSections = computed(() => {
    const sections: ApprovalSidebarSection[] = [
        {
            id: "approval.workbench",
            label: "审批",
            icon: "lucide:clipboard-check",
            path: "/configuration/approval",
        },
    ];
    if (!isProductionManager.value) {
        sections.push({
            id: "approval.initiate",
            label: "发起审批",
            icon: "lucide:circle-plus",
            path: "/configuration/approval/initiate",
        });
    }
    if (canManageFlow.value) {
        sections.push({
            id: "approval.settings",
            label: "审批权限",
            icon: "lucide:workflow",
            path: "/configuration/approval/settings",
        });
    }
    return sections;
});

const defaultSelectedId = "approval.workbench";
</script>
