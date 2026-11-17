<template>
    <ConfigurationSidebarLayout
        module-id="finance"
        content-inset
        layout-class="finance-layout finance-admin-layout"
        content-class="finance-content"
        default-selected-id="finance.cost-accessory"
        :sections="sidebarSections"
    >
        <slot />
    </ConfigurationSidebarLayout>
</template>

<script setup lang="ts">
import ConfigurationSidebarLayout from "~/components/configuration/ConfigurationSidebarLayout.vue";
import { useErpSidebarSections } from "~/composables/useErpSidebarSections";

const sidebarMenus = useErpSidebarSections();
const sidebarSections = computed(() => sidebarMenus.value.finance);
</script>
