<template>
    <ConfigurationSidebarLayout
        module-id="settings"
        content-inset
        default-selected-id="settings.index"
        :sections="sidebarSections"
    >
        <slot />
    </ConfigurationSidebarLayout>
</template>

<script setup lang="ts">
import ConfigurationSidebarLayout from "~/components/configuration/ConfigurationSidebarLayout.vue";

const sidebarSections = [
    {
        id: "settings.index",
        label: "申请类别",
        icon: "lucide:clipboard-list",
        path: "/configuration/settings",
    },
];
</script>
