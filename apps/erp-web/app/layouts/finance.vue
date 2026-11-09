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
import { ADMIN_ROLE } from "~~/shared/enums";
import ConfigurationSidebarLayout from "~/components/configuration/ConfigurationSidebarLayout.vue";

const adminInfo = useState<any>("admin_info", () => ({}));
const role = computed(() => Number(adminInfo.value?.role));
const canCurrency = computed(() =>
    role.value === ADMIN_ROLE.SUPER
    || role.value === ADMIN_ROLE.FINANCE
    || role.value === ADMIN_ROLE.FINANCE_MANAGER,
);

const sidebarSections = computed(() => {
    const sections = [
        {
            id: "finance.cost",
            label: "成本核算",
            icon: "lucide:calculator",
            path: "/configuration/finance/cost",
        },
    ];

    if (canCurrency.value) {
        sections.push({
            id: "finance.currency",
            label: "币种管理",
            icon: "lucide:coins",
            path: "/configuration/finance/currency",
        });
    }

    return sections;
});
</script>
