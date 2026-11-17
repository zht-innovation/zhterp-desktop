<template>
    <ConfigurationSidebarLayout
        module-id="sales"
        :content-inset="contentInset"
        layout-class="sales-layout sales-admin-layout"
        content-class="sales-content"
        :default-selected-id="defaultSelectedId"
        :sections="sidebarSections"
    >
        <slot />
    </ConfigurationSidebarLayout>
</template>

<script setup lang="ts">
import ConfigurationSidebarLayout from "~/components/configuration/ConfigurationSidebarLayout.vue";
import { useErpSidebarSections } from "~/composables/useErpSidebarSections";

const route = useRoute();
const contentInset = computed(() =>
    route.path === "/configuration/sales/order"
    || route.path.startsWith("/configuration/sales/order/receipt"),
);
const sidebarMenus = useErpSidebarSections();
const sidebarSections = computed(() => sidebarMenus.value.sales);

const defaultSelectedId = computed(() =>
    sidebarSections.value[0]?.id ?? "sales.dashboard",
);
</script>
