<template>
    <ConfigurationSidebarLayout
        module-id="home"
        layout-class="home-layout home-admin-layout"
        content-class="home-content"
        :default-selected-id="defaultSelectedId"
        :sections="sidebarSections"
    >
        <slot />
    </ConfigurationSidebarLayout>
</template>

<script setup lang="ts">
import ConfigurationSidebarLayout from "~/components/configuration/ConfigurationSidebarLayout.vue";
import { canAccessHomeTechnicalDashboard } from "~~/shared/utils/adminPermission";

const adminInfo = useState<any>("admin_info", () => ({}));
const role = computed(() => Number(adminInfo.value?.role));

const sidebarSections = computed(() => {
    const sections = [
        {
            id: "home.workbench",
            label: "工作台",
            icon: "lucide:layout-dashboard",
            path: "/configuration/home",
        },
    ];

    if (canAccessHomeTechnicalDashboard(role.value)) {
        sections.push({
            id: "home.dashboard",
            label: "技术看板",
            icon: "lucide:chart-no-axes-combined",
            path: "/configuration/home/dashboard",
        });
    }

    return sections;
});

const defaultSelectedId = computed(() => sidebarSections.value[0]?.id ?? "home.workbench");
</script>
