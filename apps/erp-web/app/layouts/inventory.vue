<template>
    <ConfigurationSidebarLayout
        layout-class="inventory-layout inventory-admin-layout"
        content-class="inventory-content"
        :default-selected-id="defaultSelectedId"
        :default-expanded-section-ids="defaultExpandedSectionIds"
        :sections="sidebarSections"
        @dblclick="handleInventoryTableDoubleClick"
    >
        <slot />
    </ConfigurationSidebarLayout>
</template>

<script setup lang="ts">
import { ADMIN_ROLE } from "~~/shared/enums";
import { isSellerInventoryReadonly } from "~~/shared/utils/adminPermission";
import ConfigurationSidebarLayout from "~/components/configuration/ConfigurationSidebarLayout.vue";
import { useErpSidebarSections } from "~/composables/useErpSidebarSections";
import { useInventoryTableCopy } from "~/composables/inventory/useInventoryTableCopy";

const { handleInventoryTableDoubleClick } = useInventoryTableCopy();
const adminInfo = useState<any>("admin_info", () => ({}));
const isFinanceReadonly = computed(() => Number(adminInfo.value?.role) === ADMIN_ROLE.FINANCE_MANAGER);
const isOperatorReadonly = computed(() => Number(adminInfo.value?.role) === ADMIN_ROLE.OPERATOR);
const isSellerReadonly = computed(() => isSellerInventoryReadonly(Number(adminInfo.value?.role)));
const defaultSelectedId = computed(() =>
    isFinanceReadonly.value || isOperatorReadonly.value || isSellerReadonly.value
        ? "inventory.realtime"
        : "basic-data.unit",
);
const defaultExpandedSectionIds = computed(() =>
    isFinanceReadonly.value || isOperatorReadonly.value || isSellerReadonly.value
        ? []
        : ["basic-data"],
);

const sidebarMenus = useErpSidebarSections();
const sidebarSections = computed(() => sidebarMenus.value.inventory);
</script>
