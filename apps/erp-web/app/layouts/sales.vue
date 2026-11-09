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
import { FEATURE_FLAGS } from "~/config/features";

const adminInfo = useState<any>("admin_info", () => ({}));
const route = useRoute();
const contentInset = computed(() =>
    route.path === "/configuration/sales/order"
    || route.path.startsWith("/configuration/sales/order/receipt"),
);
const roleNumber = computed(() => Number(adminInfo.value?.role));
const isSalesperson = computed(() => roleNumber.value === 3);
const canAuditSalesOrder = computed(() => Boolean(adminInfo.value?.canAuditSalesOrder));
const canAuditSalesReceipt = computed(() => Boolean(adminInfo.value?.canAuditSalesReceipt));
const isOrderAuditorOnly = computed(() =>
    (canAuditSalesOrder.value || canAuditSalesReceipt.value) && roleNumber.value > 3,
);
const canViewOrderMenu = computed(() =>
    (roleNumber.value <= 3 || canAuditSalesOrder.value) && FEATURE_FLAGS.SALES_ORDER,
);

const sidebarSections = computed(() => {
    const sections = [];

    if (
        FEATURE_FLAGS.SALES_DASHBOARD
        && !isSalesperson.value
        && !isOrderAuditorOnly.value
    ) {
        sections.push({
            id: "sales.dashboard",
            label: "仪表盘",
            icon: "material-symbols:dashboard-outline",
            path: "/configuration/sales/dashboard",
        });
    }

    if (
        FEATURE_FLAGS.SALES_DATA_CENTER
        && !isSalesperson.value
        && !isOrderAuditorOnly.value
    ) {
        sections.push({
            id: "sales.data-center",
            label: "数据中心",
            icon: "lucide:bar-chart-3",
            path: "/configuration/sales/data-center",
        });
    }

    if (isSalesperson.value) {
        sections.push({
            id: "sales.bulletin",
            label: "公告栏",
            icon: "mdi:bullhorn-outline",
            path: "/configuration/sales/bulletin",
        });
    }

    if (FEATURE_FLAGS.SALES_CUSTOMER && !isOrderAuditorOnly.value) {
        sections.push({
            id: "sales.customer",
            label: "客户管理",
            icon: "material-symbols:manage-accounts-outline",
            path: "/configuration/sales/customer",
        });
    }

    if (canViewOrderMenu.value) {
        sections.push({
            id: "sales.order",
            label: "订单记录",
            icon: "material-symbols:receipt-long-outline",
            path: "/configuration/sales/order",
        });
    }

    if (!isOrderAuditorOnly.value) {
        sections.push(
            {
                id: "sales.sale",
                label: "销售管理",
                icon: "material-symbols:shopping-bag-outline",
                path: "/configuration/sales/sale",
            },
            {
                id: "sales.logs",
                label: "项目日志",
                icon: "material-symbols:flight-takeoff",
                path: "/configuration/sales/logs",
            },
        );
    }

    return sections;
});

const defaultSelectedId = computed(() =>
    sidebarSections.value[0]?.id ?? "sales.dashboard",
);
</script>
