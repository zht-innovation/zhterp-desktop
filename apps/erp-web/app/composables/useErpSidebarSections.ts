import type { ComputedRef } from "vue";
import { FEATURE_FLAGS } from "~/config/features";
import { ADMIN_ROLE } from "~~/shared/enums";
import {
    canAccessConfigurationPath,
    canAccessHomeTechnicalDashboard,
    canAccessPurchaseSupplier,
    canManageApprovalFlow,
    canSubmitPurchaseRequest,
    isElectronicsWarehouseKeeper,
    isSellerInventoryReadonly,
} from "~~/shared/utils/adminPermission";

export type ErpModuleId = "home" | "sales" | "inventory" | "production" | "purchase" | "finance" | "approval" | "notification" | "settings";

export interface SidebarItem {
    id: string;
    label: string;
    path?: string;
    badge?: boolean;
    icon?: string;
}

export interface SidebarSection extends SidebarItem {
    icon: string;
    children?: SidebarItem[];
}

// 共用原有板块菜单条件；板块可见性继续由已授权的导航入口控制。
export function useErpSidebarSections(): ComputedRef<Record<ErpModuleId, SidebarSection[]>> {
    const adminInfo = useState<any>("admin_info", () => ({}));
    const role = computed(() => Number(adminInfo.value?.role));

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

    const isFinanceReadonly = computed(() => Number(adminInfo.value?.role) === ADMIN_ROLE.FINANCE_MANAGER);
    const isOperatorReadonly = computed(() => Number(adminInfo.value?.role) === ADMIN_ROLE.OPERATOR);
    const isSellerReadonly = computed(() => isSellerInventoryReadonly(Number(adminInfo.value?.role)));

    const canViewSupplier = computed(() =>
        canAccessPurchaseSupplier(Number(adminInfo.value?.role)),
    );
    const canViewPurchaseRequest = computed(() =>
        canSubmitPurchaseRequest(Number(adminInfo.value?.role)),
    );

    const canCurrency = computed(() =>
        role.value === ADMIN_ROLE.SUPER
        || role.value === ADMIN_ROLE.FINANCE
        || role.value === ADMIN_ROLE.FINANCE_MANAGER,
    );

    const canManageFlow = computed(() => canManageApprovalFlow(
        Number(adminInfo.value?.role),
        adminInfo.value?.canManageApprovalFlow,
    ));

    const isProductionManager = computed(() =>
        Number(adminInfo.value?.role) === ADMIN_ROLE.PRODUCTION_MANAGER,
    );

    const home = computed<SidebarSection[]>(() => {
        const sections = [
            {
                id: "home.workbench",
                label: "工作台",
                icon: "lucide:layout-dashboard",
                path: "/configuration/home",
            },
        ];

        if (canAccessHomeTechnicalDashboard(role.value)) {
            sections.push({
                id: "home.dashboard",
                label: "技术看板",
                icon: "lucide:chart-no-axes-combined",
                path: "/configuration/home/dashboard",
            });
        }

        return sections;
    });

    const sales = computed<SidebarSection[]>(() => {
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

    const inventory = computed<SidebarSection[]>(() => {
        const sections: SidebarSection[] = [];

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

    const production = computed<SidebarSection[]>(() => [
        {
            id: "production.orders",
            label: "订单总览",
            icon: "lucide:clipboard-list",
            path: "/configuration/production/orders",
        },
        {
            id: "production.production-orders",
            label: "生产单",
            icon: "lucide:clipboard-check",
            path: "/configuration/production/production-orders",
        },
        {
            id: "production.requisitions",
            label: "发料管理",
            icon: "lucide:package-open",
            path: "/configuration/production/requisitions",
        },
        {
            id: "production.completion",
            label: "完工入库",
            icon: "lucide:package-check",
            path: "/configuration/production/completion",
        },
    ].filter((section) => canAccessConfigurationPath(Number(adminInfo.value?.role), section.path)));

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

    const purchase = computed<SidebarSection[]>(() => allSidebarSections.filter((section) => {
        if (isElectronicsWarehouseKeeper(Number(adminInfo.value?.role))) {
            return section.id === "purchase.request" || section.id === "purchase.order";
        }
        if (section.id === "purchase.supplier") return canViewSupplier.value;
        if (section.id === "purchase.request") return canViewPurchaseRequest.value;
        return true;
    }));

    const finance = computed<SidebarSection[]>(() => {
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

    const approval = computed<SidebarSection[]>(() => {
        const sections: SidebarSection[] = [
            {
                id: "approval.workbench",
                label: "审批",
                icon: "lucide:clipboard-check",
                path: "/configuration/approval",
            },
        ];
        if (!isProductionManager.value) {
            sections.push({
                id: "approval.initiate",
                label: "发起审批",
                icon: "lucide:circle-plus",
                path: "/configuration/approval/initiate",
            });
        }
        if (canManageFlow.value) {
            sections.push({
                id: "approval.settings",
                label: "审批权限",
                icon: "lucide:workflow",
                path: "/configuration/approval/settings",
            });
        }
        return sections;
    });

    const notification: SidebarSection[] = [
        {
            id: "notification.center",
            label: "通知中心",
            icon: "mdi:bell-outline",
            path: "/configuration/notification",
        },
    ];

    const settings: SidebarSection[] = [
        {
            id: "settings.index",
            label: "申请类别",
            icon: "lucide:clipboard-list",
            path: "/configuration/settings",
        },
    ];

    return computed(() => ({
        home: home.value,
        sales: sales.value,
        inventory: inventory.value,
        production: production.value,
        purchase: purchase.value,
        finance: finance.value,
        approval: approval.value,
        notification,
        settings,
    }));
}
