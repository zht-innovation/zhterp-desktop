<template>
    <ConfigurationSidebarLayout
        module-id="notification"
        layout-class="notification-layout notification-admin-layout"
        content-class="notification-content"
        default-selected-id="notification.center"
        :sections="sidebarSections"
    >
        <slot />
    </ConfigurationSidebarLayout>
</template>

<script setup lang="ts">
import ConfigurationSidebarLayout from "~/components/configuration/ConfigurationSidebarLayout.vue";

const sidebarSections = [
    {
        id: "notification.center",
        label: "通知中心",
        icon: "mdi:bell-outline",
        path: "/configuration/notification",
    },
];
</script>
