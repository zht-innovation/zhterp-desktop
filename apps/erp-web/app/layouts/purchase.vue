<template>
    <ConfigurationSidebarLayout
        module-id="purchase"
        content-inset
        layout-class="purchase-layout purchase-admin-layout"
        content-class="purchase-content"
        :default-selected-id="defaultSelectedId"
        :sections="sidebarSections"
    >
        <slot />
    </ConfigurationSidebarLayout>
</template>

<script setup lang="ts">
import ConfigurationSidebarLayout from "~/components/configuration/ConfigurationSidebarLayout.vue";
import { useErpSidebarSections } from "~/composables/useErpSidebarSections";
import { canAccessPurchaseSupplier } from "~~/shared/utils/adminPermission";

const adminInfo = useState<any>("admin_info", () => ({}));
const canViewSupplier = computed(() =>
    canAccessPurchaseSupplier(Number(adminInfo.value?.role)),
);
const sidebarMenus = useErpSidebarSections();
const sidebarSections = computed(() => sidebarMenus.value.purchase);

const defaultSelectedId = computed(() =>
    canViewSupplier.value ? "purchase.supplier" : "purchase.order",
);
</script>
