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
import { canAccessPurchaseSupplier, canSubmitPurchaseRequest, isElectronicsWarehouseKeeper } from "~~/shared/utils/adminPermission";

const adminInfo = useState<any>("admin_info", () => ({}));
const canViewSupplier = computed(() =>
    canAccessPurchaseSupplier(Number(adminInfo.value?.role)),
);
const canViewPurchaseRequest = computed(() =>
    canSubmitPurchaseRequest(Number(adminInfo.value?.role)),
);

const allSidebarSections = [
    {
        id: "purchase.supplier",
        label: "供应商管理",
        icon: "lucide:users",
        path: "/configuration/purchase/supplier",
    },
    {
        id: "purchase.request",
        label: "采购申请",
        icon: "lucide:clipboard-plus",
        path: "/configuration/purchase/request",
    },
    {
        id: "purchase.order",
        label: "采购单",
        icon: "lucide:shopping-cart",
        path: "/configuration/purchase/order",
    },
    {
        id: "purchase.material-pool",
        label: "待采购物料池",
        icon: "lucide:package-search",
        path: "/configuration/purchase/material-pool",
    },
];

const sidebarSections = computed(() => allSidebarSections.filter((section) => {
    if (isElectronicsWarehouseKeeper(Number(adminInfo.value?.role))) {
        return section.id === "purchase.request" || section.id === "purchase.order";
    }
    if (section.id === "purchase.supplier") return canViewSupplier.value;
    if (section.id === "purchase.request") return canViewPurchaseRequest.value;
    return true;
}));

const defaultSelectedId = computed(() =>
    canViewSupplier.value ? "purchase.supplier" : "purchase.order",
);
</script>
