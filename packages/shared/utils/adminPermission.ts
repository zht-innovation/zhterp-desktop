import { ADMIN_ROLE, ADMIN_ROLE_NAME, isApprovalApplicantRole } from "../enums";

export const isElectronicsWarehouseKeeper = (role: number) =>
    role === ADMIN_ROLE.ELECTRONICS_WAREHOUSE_KEEPER;

export const canAccessFeedback = (role: number) => Number.isInteger(role) && Object.hasOwn(ADMIN_ROLE_NAME, role);

export const canAccessAdminFeature = (
    role: number,
    permission: number,
    allowRoles: readonly ADMIN_ROLE[] = [],
) => {
    if (!Number.isInteger(role)) {
        return false;
    }

    return role <= permission || allowRoles.includes(role as ADMIN_ROLE);
};

export const canManageApprovalFlow = (
    role: number,
    permission?: boolean,
) => role === ADMIN_ROLE.SUPER || permission === true;

export const canConfirmOrderPayment = (role: number) =>
    role === ADMIN_ROLE.SUPER || role === ADMIN_ROLE.FINANCE_MANAGER;

export const canAccessInventory = (role: number) => {
    return canAccessAdminFeature(role, ADMIN_ROLE.SELLER, [
        ADMIN_ROLE.FINANCE_MANAGER,
        ADMIN_ROLE.WAREHOUSE_KEEPER,
        ADMIN_ROLE.PRODUCTION_MANAGER,
        ADMIN_ROLE.ELECTRONICS_WAREHOUSE_KEEPER,
    ]);
};

export const canEditInventoryInbound = (role: number) => {
    return [
        ADMIN_ROLE.SUPER,
        ADMIN_ROLE.WAREHOUSE_KEEPER,
        ADMIN_ROLE.PRODUCTION_MANAGER,
        ADMIN_ROLE.ELECTRONICS_WAREHOUSE_KEEPER,
    ].includes(role as ADMIN_ROLE);
};

export const canEditInventoryOutboundRemark = (role: number) => {
    return role === ADMIN_ROLE.WAREHOUSE_KEEPER;
};

export const canAcceptPurchaseLogistics = (role: number) => {
    return [
        ADMIN_ROLE.SUPER,
        ADMIN_ROLE.WAREHOUSE_KEEPER,
    ].includes(role as ADMIN_ROLE);
};

export const hasFullInventoryAccess = (role: number) => {
    return role === ADMIN_ROLE.SUPER || role === ADMIN_ROLE.PRODUCTION_MANAGER;
};

// 仓库管理能力独立于生产执行，避免新增仓库角色获得生产权限。
export const canManageInventory = (role: number) =>
    hasFullInventoryAccess(role) || isElectronicsWarehouseKeeper(role);

export const canAccessProductionExecution = (role: number) => {
    return hasFullInventoryAccess(role) || role === ADMIN_ROLE.WAREHOUSE_KEEPER;
};

export const canViewProductionRequisitions = (role: number) => {
    return canAccessProductionExecution(role) || role === ADMIN_ROLE.FINANCE_MANAGER;
};

export const canExecuteProductionAction = (role: number, action: string) => {
    switch (action) {
        case "issue-requisition":
            return canAccessProductionExecution(role);
        case "receive-return":
        case "receive-completion":
            return canAccessProductionExecution(role) && canEditInventoryInbound(role);
        case "create-requisition":
        case "cancel-requisition":
        case "request-return":
        case "register-completion":
        case "register-material-loss":
        case "confirm-order-completion":
        case "allocate-public-materials":
            return hasFullInventoryAccess(role);
        default:
            return false;
    }
};

export const canAccessPurchaseSupplier = (role: number) => {
    return [
        ADMIN_ROLE.SUPER,
        ADMIN_ROLE.PURCHASER,
        ADMIN_ROLE.FINANCE_MANAGER,
    ].includes(role as ADMIN_ROLE);
};

export const canReadPurchaseSupplier = (role: number) =>
    canAccessPurchaseSupplier(role) || isElectronicsWarehouseKeeper(role);

export const canSubmitPurchaseRequest = (role: number) =>
    isApprovalApplicantRole(role) || isElectronicsWarehouseKeeper(role);

export const canDeleteSubmittedPurchaseRequest = (role: number) =>
    canAccessPurchaseSupplier(role) || isElectronicsWarehouseKeeper(role);

export const canDeletePurchaseOrder = (role: number) =>
    role === ADMIN_ROLE.SUPER || isElectronicsWarehouseKeeper(role);

export const PURCHASE_ORDER_MANAGER_ROLES = [
    ADMIN_ROLE.SUPER,
    ADMIN_ROLE.PURCHASER,
    ADMIN_ROLE.FINANCE_MANAGER,
    ADMIN_ROLE.ELECTRONICS_WAREHOUSE_KEEPER,
] as const;

export const canManagePurchaseOrder = (role: number) => {
    return PURCHASE_ORDER_MANAGER_ROLES.includes(
        role as typeof PURCHASE_ORDER_MANAGER_ROLES[number],
    );
};

export const canEditPurchaseOrder = (role: number) =>
    canManagePurchaseOrder(role) && !isElectronicsWarehouseKeeper(role);

export const canViewAllPurchaseRequests = (role: number) =>
    canManagePurchaseOrder(role) || role === ADMIN_ROLE.PRODUCTION_MANAGER;

export const canViewPurchasePrice = (role: number) =>
    Number.isInteger(role)
    && Object.hasOwn(ADMIN_ROLE_NAME, role)
    && role !== ADMIN_ROLE.PRODUCTION_MANAGER;

export const canSelectSalesOrderForPurchaseRequest = (role: number) =>
    role === ADMIN_ROLE.PRODUCTION_MANAGER || isElectronicsWarehouseKeeper(role);

export const canSubmitBorrowRequest = (role: number) => {
    return Number.isInteger(role) && isApprovalApplicantRole(role);
};

export const isOperatorInventoryReadonly = (role: number) =>
    role === ADMIN_ROLE.OPERATOR;
export const CONTENT_PRODUCT_ROUTES = [
    "/admin/articles",
    "/admin/products",
    "/admin/content-product",
];
const FINANCE_INVENTORY_PATHS = [
    "/configuration/inventory/realtime",
    "/configuration/inventory/stocktake",
    "/configuration/inventory/waybill",
] as const;

export const canFinanceAccessInventoryPath = (path: string) =>
    FINANCE_INVENTORY_PATHS.some(
        (allowedPath) => path === allowedPath || path.startsWith(`${allowedPath}/`),
    );

// 销售角色仅开放实时库存与本人订单出库、运单查看，其余仓储页面不可直达。
const SELLER_INVENTORY_PATHS = [
    "/configuration/inventory/realtime",
    "/configuration/inventory/outbound",
    "/configuration/inventory/waybill",
] as const;

export const canSellerAccessInventoryPath = (path: string) =>
    SELLER_INVENTORY_PATHS.some(
        (allowedPath) => path === allowedPath || path.startsWith(`${allowedPath}/`),
    );

export const isSellerInventoryReadonly = (role: number) =>
    role === ADMIN_ROLE.SELLER;

export const getInventoryModuleLandingPath = (role: number) => {
    if (
        role === ADMIN_ROLE.FINANCE_MANAGER
        || role === ADMIN_ROLE.OPERATOR
        || isSellerInventoryReadonly(role)
    ) {
        return "/configuration/inventory/realtime";
    }

    return "/configuration/inventory/basic-data/unit";
};

const WAREHOUSE_KEEPER_CONFIGURATION_PATHS = [
    "/configuration/approval",
    "/configuration/feedback",
    "/configuration/inventory",
    "/configuration/notification",
    "/configuration/production/requisitions",
    "/configuration/production/completion",
    "/configuration/purchase",
] as const;

const PRODUCTION_MANAGER_CONFIGURATION_PATHS = [
    "/configuration/approval",
    "/configuration/feedback",
    "/configuration/production",
    "/configuration/inventory",
    "/configuration/purchase",
    "/configuration/notification",
] as const;

export const canWarehouseKeeperAccessConfigurationPath = (path: string) => {
    if (
        path === "/configuration"
        || path === "/configuration/home"
    ) {
        return true;
    }

    return WAREHOUSE_KEEPER_CONFIGURATION_PATHS.some(
        (allowedPath) => path === allowedPath || path.startsWith(`${allowedPath}/`),
    );
};

export const canProductionManagerAccessConfigurationPath = (path: string) => {
    if (
        path === "/configuration"
        || path === "/configuration/home"
    ) {
        return true;
    }

    return PRODUCTION_MANAGER_CONFIGURATION_PATHS.some(
        (allowedPath) => path === allowedPath || path.startsWith(`${allowedPath}/`),
    );
};

export const canAccessSalesModule = (role: number) => {
    return role === ADMIN_ROLE.SUPER || role === ADMIN_ROLE.SELLER;
};

export const canAccessHomeTechnicalDashboard = (role: number) => {
    return canAccessSalesModule(role);
};

export const canAccessPublicCustomerPool = (role: number) => {
    return role === ADMIN_ROLE.SUPER || role === ADMIN_ROLE.SELLER;
};

export const canAccessSimulatorManagement = (role: number) => {
    return role === ADMIN_ROLE.SUPER || role === ADMIN_ROLE.DEVELOPER;
};

export const canAccessErp = (role: number) => {
    if (!Number.isInteger(role)) {
        return false;
    }

    return role !== ADMIN_ROLE.DEVELOPER;
};

export type HomeWorkbenchCapabilities = {
    approval: boolean;
    notification: boolean;
    sales: boolean;
};

const HOME_NOTIFICATION_ROLES = [
    ADMIN_ROLE.SUPER,
    ADMIN_ROLE.OPERATOR,
    ADMIN_ROLE.SELLER,
    ADMIN_ROLE.FINANCE,
    ADMIN_ROLE.PURCHASER,
    ADMIN_ROLE.WAREHOUSE_KEEPER,
    ADMIN_ROLE.FINANCE_MANAGER,
    ADMIN_ROLE.PRODUCTION_MANAGER,
    ADMIN_ROLE.ORDINARY_USER,
] as const;

export const getHomeWorkbenchCapabilities = (
    role: number,
): HomeWorkbenchCapabilities => {
    const canAccessWorkbench = canAccessErp(role);

    return {
        approval: canAccessWorkbench,
        notification: canAccessWorkbench
            && HOME_NOTIFICATION_ROLES.includes(role as typeof HOME_NOTIFICATION_ROLES[number]),
        sales: canAccessWorkbench && canAccessSalesModule(role),
    };
};

const ERP_CONFIGURATION_PATHS = [
    "/configuration/home",
    "/configuration/sales",
    "/configuration/approval",
    "/configuration/inventory",
    "/configuration/purchase",
    "/configuration/finance",
    "/configuration/notification",
] as const;

const matchesConfigurationPath = (path: string, allowedPath: string) => {
    return path === allowedPath || path.startsWith(`${allowedPath}/`);
};

const ELECTRONICS_WAREHOUSE_CONFIGURATION_PATHS = [
    "/configuration/purchase/request",
    "/configuration/purchase/order",
    "/configuration/inventory/basic-data/unit",
    "/configuration/inventory/basic-data/material",
    "/configuration/inventory/basic-data/classification",
    "/configuration/inventory/basic-data/warehouse",
    "/configuration/inventory/basic-data/product",
    "/configuration/inventory/basic-data/bom",
    "/configuration/inventory/basic-data/bom-category",
    "/configuration/inventory/realtime",
    "/configuration/inventory/review",
    "/configuration/inventory/transfer",
    "/configuration/inventory/inbound",
    "/configuration/inventory/outbound",
    "/configuration/inventory/stocktake",
] as const;

export const isErpConfigurationPath = (path: string) => {
    return ERP_CONFIGURATION_PATHS.some((allowedPath) => {
        return matchesConfigurationPath(path, allowedPath);
    });
};

export const canAccessConfigurationPath = (role: number, path: string) => {
    if (!Number.isInteger(role)) {
        return false;
    }

    if (path === "/configuration") {
        return true;
    }

    if (isElectronicsWarehouseKeeper(role)) {
        const pathname = path.split("?")[0];
        return ELECTRONICS_WAREHOUSE_CONFIGURATION_PATHS.some((allowedPath) =>
            matchesConfigurationPath(pathname, allowedPath),
        );
    }

    if (path.split("?")[0] === "/configuration/feedback" || path.startsWith("/configuration/feedback/")) {
        return canAccessFeedback(role);
    }

    if (role === ADMIN_ROLE.CONTENT_MANAGER) {
        return path.startsWith("/configuration/configurationList")
            && ["article", "product"].includes(path.split("?")[1]?.split("=")[1] || "");
    }


    if (path.startsWith("/configuration/mcp/authorize")) {
        return true;
    }

    if (path.startsWith("/configuration/mcp")) {
        return role === ADMIN_ROLE.OPERATOR;
    }

    if (path.startsWith("/configuration/user")) {
        return role === ADMIN_ROLE.SUPER;
    }

    if (role === ADMIN_ROLE.ORDINARY_USER) {
        return path === "/configuration/home"
            || path.startsWith("/configuration/purchase/request")
            || path.startsWith("/configuration/purchase/order")
            || path.startsWith("/configuration/purchase/material-pool")
            || path === "/configuration/approval"
            || path === "/configuration/approval/initiate"
            || path === "/configuration/notification";
    }

    if (role === ADMIN_ROLE.DEVELOPER) {
        return [
            "/configuration/feedback",
            "/configuration/simulator",
        ].some((allowedPath) => matchesConfigurationPath(path, allowedPath));
    }

    if (role === ADMIN_ROLE.OPERATOR && isErpConfigurationPath(path)) {
        return path === "/configuration/home"
            || path.startsWith("/configuration/approval")
            || path === "/configuration/inventory/realtime"
            || path.startsWith("/configuration/inventory/realtime/")
            || path === "/configuration/notification"
            || path.startsWith("/configuration/notification/");
    }

    if (path.startsWith("/configuration/sales")) {
        return canAccessSalesModule(role);
    }

    if (path.startsWith("/configuration/simulator")) {
        return canAccessSimulatorManagement(role);
    }

    if (path.startsWith("/configuration/production")) {
        if (role === ADMIN_ROLE.FINANCE_MANAGER) {
            return path === "/configuration/production/requisitions";
        }
        if (role === ADMIN_ROLE.SELLER) {
            return path === "/configuration/production/orders";
        }
        if (role === ADMIN_ROLE.WAREHOUSE_KEEPER) {
            return canWarehouseKeeperAccessConfigurationPath(path);
        }
        return role === ADMIN_ROLE.SUPER || role === ADMIN_ROLE.PRODUCTION_MANAGER;
    }

    if (role === ADMIN_ROLE.PRODUCTION_MANAGER) {
        return canProductionManagerAccessConfigurationPath(path);
    }

    return true;
};

export const isReadonlyProductionRole = (role: number) =>
    role === ADMIN_ROLE.PRODUCTION_MANAGER;
