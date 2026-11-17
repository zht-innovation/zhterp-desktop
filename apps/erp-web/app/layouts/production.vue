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
import { useErpSidebarSections } from "~/composables/useErpSidebarSections";

const sidebarMenus = useErpSidebarSections();
const sections = computed(() => sidebarMenus.value.production);
</script>
