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
import { useErpSidebarSections } from "~/composables/useErpSidebarSections";

const sidebarMenus = useErpSidebarSections();
const sidebarSections = computed(() => sidebarMenus.value.approval);

const defaultSelectedId = "approval.workbench";
</script>
