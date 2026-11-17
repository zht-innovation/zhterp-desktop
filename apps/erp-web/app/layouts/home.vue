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
import { useErpSidebarSections } from "~/composables/useErpSidebarSections";

const sidebarMenus = useErpSidebarSections();
const sidebarSections = computed(() => sidebarMenus.value.home);

const defaultSelectedId = computed(() => sidebarSections.value[0]?.id ?? "home.workbench");
</script>
