import type { ErpModuleId } from "~/composables/useErpSidebarSections";
import { ADMIN_ROLE } from "~~/shared/enums";
import {
    canAccessAdminFeature,
    canAccessConfigurationPath,
    canAccessErp,
    canAccessInventory,
    canAccessPurchaseSupplier,
    getInventoryModuleLandingPath,
    isElectronicsWarehouseKeeper,
} from "~~/shared/utils/adminPermission";

export interface NavigationModule {
    id: "home" | ErpModuleId;
    label: string;
    title: string;
    icon: string;
    path: string;
    badge?: boolean | number;
}

// 复用原有板块入口与可见性判断，供侧栏和桌面快捷入口共用。
export function useErpNavigationModules() {
    const adminInfo = useState<any>("admin_info", () => ({}));
    const role = computed(() => Number(adminInfo.value?.role));
    const isSalesperson = computed(() => role.value === ADMIN_ROLE.SELLER);

    const allNavigationModules = computed<NavigationModule[]>(() => [
        {
            id: "home",
            label: "首页",
            title: "首页",
            icon: "lucide:house",
            path: "/configuration/home",
        },
        {
            id: "sales",
            label: "销售",
            title: "销售管理",
            icon: "lucide:contact-round",
            path: isSalesperson.value
                ? "/configuration/sales/bulletin"
                : "/configuration/sales/dashboard",
        },
        {
            id: "inventory",
            label: "仓储",
            title: "库存管理",
            icon: "lucide:layers-3",
            path: getInventoryModuleLandingPath(role.value),
        },
        {
            id: "production",
            label: "生产",
            title: "生产管理",
            icon: "lucide:factory",
            path: [ADMIN_ROLE.WAREHOUSE_KEEPER, ADMIN_ROLE.FINANCE_MANAGER].includes(role.value)
                ? "/configuration/production/requisitions"
                : "/configuration/production/orders",
        },
        {
            id: "purchase",
            label: "采购",
            title: "采购管理",
            icon: "lucide:shopping-cart",
            path: canAccessPurchaseSupplier(role.value)
                ? "/configuration/purchase/supplier"
                : "/configuration/purchase/order",
        },
        {
            id: "finance",
            label: "财务",
            title: "财务管理",
            icon: "lucide:wallet-cards",
            path: "/configuration/finance/cost",
        },
        {
            id: "approval",
            label: "审批",
            title: "审批中心",
            icon: "lucide:user-round-check",
            path: "/configuration/approval",
        },
        {
            id: "notification",
            label: "通知",
            title: "通知中心",
            icon: "lucide:volume-2",
            path: "/configuration/notification",
        },
        {
            id: "settings",
            label: "设置",
            title: "系统设置",
            icon: "lucide:settings",
            path: "/configuration/settings",
        },
    ]);

    const canShowModule = (moduleId: NavigationModule["id"]) => {
        if (moduleId === "settings") {
            return canAccessConfigurationPath(role.value, "/configuration/settings");
        }

        if (isElectronicsWarehouseKeeper(role.value)) {
            return moduleId === "inventory" || moduleId === "purchase";
        }
        if (role.value === ADMIN_ROLE.CONTENT_MANAGER) {
            return false;
        }
        if (moduleId === "home") {
            return canAccessErp(role.value);
        }

        if (moduleId === "approval") {
            return true;
        }

        if (role.value === ADMIN_ROLE.OPERATOR) {
            return ["home", "inventory", "approval", "notification"].includes(moduleId);
        }

        if (role.value === ADMIN_ROLE.ORDINARY_USER) {
            return ["purchase", "approval", "notification"].includes(moduleId);
        }

        if (role.value === ADMIN_ROLE.WAREHOUSE_KEEPER) {
            return ["inventory", "production", "purchase", "notification"].includes(moduleId);
        }

        if (role.value === ADMIN_ROLE.PURCHASER) {
            return moduleId === "purchase" || moduleId === "notification";
        }

        if (role.value === ADMIN_ROLE.FINANCE_MANAGER) {
            return ["inventory", "production", "purchase", "finance", "notification"].includes(moduleId);
        }

        if (role.value === ADMIN_ROLE.PRODUCTION_MANAGER) {
            return ["inventory", "production", "purchase", "approval", "notification"].includes(moduleId);
        }

        if (role.value === ADMIN_ROLE.SELLER && moduleId === "finance") {
            return false;
        }

        if (moduleId === "sales") {
            return canAccessAdminFeature(role.value, ADMIN_ROLE.SELLER);
        }
        if (moduleId === "inventory") {
            return canAccessInventory(role.value);
        }
        if (moduleId === "production") {
            return canAccessConfigurationPath(role.value, "/configuration/production/orders");
        }
        if (moduleId === "purchase") {
            return canAccessErp(role.value);
        }
        if (moduleId === "finance") {
            return canAccessAdminFeature(role.value, ADMIN_ROLE.FINANCE, [
                ADMIN_ROLE.FINANCE_MANAGER,
            ]);
        }
        if (moduleId === "notification") {
            return canAccessAdminFeature(role.value, ADMIN_ROLE.SELLER, [
                ADMIN_ROLE.WAREHOUSE_KEEPER,
                ADMIN_ROLE.FINANCE,
                ADMIN_ROLE.FINANCE_MANAGER,
                ADMIN_ROLE.PRODUCTION_MANAGER,
                ADMIN_ROLE.ORDINARY_USER,
            ]);
        }

        return false;
    };

    const visibleNavigationModules = computed(() =>
        allNavigationModules.value.filter((module) => canShowModule(module.id)),
    );

    return { allNavigationModules, visibleNavigationModules, canShowModule };
}
