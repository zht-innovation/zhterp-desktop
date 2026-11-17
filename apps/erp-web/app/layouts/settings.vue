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
import { useErpSidebarSections } from "~/composables/useErpSidebarSections";

const sidebarMenus = useErpSidebarSections();
const sidebarSections = computed(() => sidebarMenus.value.settings);
</script>
