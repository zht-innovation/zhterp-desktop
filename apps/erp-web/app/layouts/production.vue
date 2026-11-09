<template>
    <ConfigurationSidebarLayout
        module-id="production"
        content-inset
        layout-class="production-layout"
        content-class="production-content"
        :default-selected-id="sections[0]?.id || ''"
        :sections="sections"
    >
        <slot />
    </ConfigurationSidebarLayout>
</template>

<script setup lang="ts">
import ConfigurationSidebarLayout from "~/components/configuration/ConfigurationSidebarLayout.vue";
import { canAccessConfigurationPath } from "~~/shared/utils/adminPermission";

const adminInfo = useState<{ role?: number }>("admin_info", () => ({}));
const sections = computed(() => [
    {
        id: "production.orders",
        label: "订单总览",
        icon: "lucide:clipboard-list",
        path: "/configuration/production/orders",
    },
    {
        id: "production.production-orders",
        label: "生产单",
        icon: "lucide:clipboard-check",
        path: "/configuration/production/production-orders",
    },
    {
        id: "production.requisitions",
        label: "发料管理",
        icon: "lucide:package-open",
        path: "/configuration/production/requisitions",
    },
    {
        id: "production.completion",
        label: "完工入库",
        icon: "lucide:package-check",
        path: "/configuration/production/completion",
    },
].filter((section) => canAccessConfigurationPath(Number(adminInfo.value?.role), section.path)));
</script>
