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
import { isElectronicsWarehouseKeeper, isSellerInventoryReadonly } from "~~/shared/utils/adminPermission";
import ConfigurationSidebarLayout from "~/components/configuration/ConfigurationSidebarLayout.vue";
import { useInventoryTableCopy } from "~/composables/inventory/useInventoryTableCopy";
import { FEATURE_FLAGS } from "~/config/features";

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

/**
 * 侧边栏菜单配置
 * 根据功能开关（FEATURE_FLAGS）控制菜单显示
 * 配置文件位置：app/config/features.ts
 */
const sidebarSections = computed(() => {
    const sections = [];

    if (isOperatorReadonly.value) {
        if (FEATURE_FLAGS.INVENTORY_STOCK) {
            sections.push({
                id: "inventory.realtime",
                label: "实时库存",
                icon: "lucide:house",
                path: "/configuration/inventory/realtime",
            });
        }
        return sections;
    }

    if (isSellerReadonly.value) {
        if (FEATURE_FLAGS.INVENTORY_STOCK) {
            sections.push({
                id: "inventory.realtime",
                label: "实时库存",
                icon: "lucide:house",
                path: "/configuration/inventory/realtime",
            });
        }
        if (FEATURE_FLAGS.INVENTORY_OUTBOUND) {
            sections.push({
                id: "inventory.outbound",
                label: "出库单",
                icon: "lucide:package-minus",
                path: "/configuration/inventory/outbound",
            });
        }
        if (FEATURE_FLAGS.INVENTORY_WAYBILL) {
            sections.push({
                id: "inventory.delivery",
                label: "运单记录",
                icon: "lucide:truck",
                path: "/configuration/inventory/waybill",
            });
        }
        return sections;
    }

    if (isFinanceReadonly.value) {
        if (FEATURE_FLAGS.INVENTORY_STOCK) {
            sections.push({
                id: "inventory.realtime",
                label: "实时库存",
                icon: "lucide:house",
                path: "/configuration/inventory/realtime",
            });
        }
        if (FEATURE_FLAGS.INVENTORY_STOCKTAKE) {
            sections.push({
                id: "inventory.stocktake",
                label: "盘点单",
                icon: "lucide:clipboard-check",
                path: "/configuration/inventory/stocktake",
            });
        }
        if (FEATURE_FLAGS.INVENTORY_WAYBILL) {
            sections.push({
                id: "inventory.delivery",
                label: "运单记录",
                icon: "lucide:truck",
                path: "/configuration/inventory/waybill",
            });
        }
        return sections;
    }

    // 基础数据模块
    if (FEATURE_FLAGS.INVENTORY_BASIC_DATA) {
        const basicDataChildren = [];

        if (FEATURE_FLAGS.INVENTORY_UNIT) {
            basicDataChildren.push({
                id: "basic-data.unit",
                label: "单位管理",
                icon: "lucide:ruler",
                path: "/configuration/inventory/basic-data/unit",
            });
        }

        if (FEATURE_FLAGS.INVENTORY_MATERIAL) {
            basicDataChildren.push({
                id: "basic-data.material",
                label: "材质管理",
                icon: "lucide:layers-3",
                path: "/configuration/inventory/basic-data/material",
            });
        }

        if (FEATURE_FLAGS.INVENTORY_CATEGORY) {
            basicDataChildren.push({
                id: "basic-data.classification",
                label: "分类管理",
                icon: "lucide:tag",
                path: "/configuration/inventory/basic-data/classification",
            });
        }

        if (FEATURE_FLAGS.INVENTORY_WAREHOUSE) {
            basicDataChildren.push({
                id: "basic-data.warehouse",
                label: "仓库管理",
                icon: "lucide:warehouse",
                path: "/configuration/inventory/basic-data/warehouse",
            });
        }

        // 只有当有子菜单时才显示基础数据模块
        if (basicDataChildren.length > 0) {
            sections.push({
                id: "basic-data",
                label: "基本数据",
                icon: "lucide:layers-3",
                children: basicDataChildren,
            });
        }

        if (FEATURE_FLAGS.INVENTORY_PRODUCT) {
            sections.push({
                id: "basic-data.product",
                label: "产品管理",
                icon: "lucide:package",
                path: "/configuration/inventory/basic-data/product",
            });
        }

        if (FEATURE_FLAGS.INVENTORY_BOM) {
            sections.push({
                id: "basic-data.bom",
                label: "BOM管理",
                icon: "lucide:workflow",
                path: "/configuration/inventory/basic-data/bom",
            });
        }
    }

    // 实时库存
    if (FEATURE_FLAGS.INVENTORY_STOCK) {
        sections.push({
            id: "inventory.realtime",
            label: "实时库存",
            icon: "lucide:house",
            path: "/configuration/inventory/realtime",
        });
    }

    // 仓库复核
    if (FEATURE_FLAGS.INVENTORY_REVIEW) {
        sections.push({
            id: "inventory.review",
            label: "仓库复核",
            icon: "lucide:clipboard-check",
            path: "/configuration/inventory/review",
        });
    }

    // 调拨单
    if (FEATURE_FLAGS.INVENTORY_TRANSFER) {
        sections.push({
            id: "inventory.transfer",
            label: "调拨单",
            icon: "lucide:refresh-cw",
            path: "/configuration/inventory/transfer",
        });
    }

    // 入库单
    if (FEATURE_FLAGS.INVENTORY_INBOUND) {
        sections.push({
            id: "inventory.inbound",
            label: "入库单",
            icon: "lucide:package-plus",
            path: "/configuration/inventory/inbound",
        });
    }

    // 出库单
    if (FEATURE_FLAGS.INVENTORY_OUTBOUND) {
        sections.push({
            id: "inventory.outbound",
            label: "出库单",
            icon: "lucide:package-minus",
            path: "/configuration/inventory/outbound",
        });
    }

    // 盘点单
    if (FEATURE_FLAGS.INVENTORY_STOCKTAKE) {
        sections.push({
            id: "inventory.stocktake",
            label: "盘点单",
            icon: "lucide:clipboard-check",
            path: "/configuration/inventory/stocktake",
        });
    }

    // 运单记录
    if (FEATURE_FLAGS.INVENTORY_WAYBILL && !isElectronicsWarehouseKeeper(Number(adminInfo.value?.role))) {
        sections.push({
            id: "inventory.delivery",
            label: "运单记录",
            icon: "lucide:truck",
            path: "/configuration/inventory/waybill",
        });
    }

    return sections;
});
</script>
