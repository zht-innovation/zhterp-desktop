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
import { useErpSidebarSections } from "~/composables/useErpSidebarSections";

const sidebarMenus = useErpSidebarSections();
const sidebarSections = computed(() => sidebarMenus.value.notification);
</script>
