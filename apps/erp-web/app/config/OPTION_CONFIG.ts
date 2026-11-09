import { ADMIN_ROLE } from "~~/shared/enums";

const OPTION_CONFIG = {
    message: { path: "/configuration/message", title: "留言管理", permission: ADMIN_ROLE.SUPER },
    user: { path: "/configuration/user", title: "用户管理", permission: ADMIN_ROLE.SUPER },
    sales: {
        type: "SalesConfig",
        path: "/configuration/sales/dashboard",
        title: "客户管理",
        permission: ADMIN_ROLE.SELLER, // 访问权限限制, <= 这个数字的角色可以访问
    },
    approval: {
        type: "DefaultConfig",
        path: "/configuration/approval",
        title: "审批中心",
        permission: ADMIN_ROLE.SUPER,
    },
    // 意见箱
    feedback: {
        type: "DefaultConfig",
        path: "/configuration/feedback",
        title: "意见箱",
        permission: ADMIN_ROLE.SELLER, // 访问权限限制, <= 这个数字的角色可以访问
        allowRoles: Object.values(ADMIN_ROLE).filter((role): role is ADMIN_ROLE => typeof role === "number"), // 所有现有有效登录角色
    },
    inventory: {
        type: "DefaultConfig",
        path: "/configuration/inventory/basic-data/unit",
        title: "库存管理",
        permission: ADMIN_ROLE.SELLER,
        allowRoles: [ADMIN_ROLE.WAREHOUSE_KEEPER, ADMIN_ROLE.FINANCE_MANAGER, ADMIN_ROLE.ELECTRONICS_WAREHOUSE_KEEPER],
    },
    purchase: {
        type: "DefaultConfig",
        path: "/configuration/purchase/supplier",
        title: "采购区块",
        permission: ADMIN_ROLE.SELLER,
        allowRoles: [ADMIN_ROLE.PURCHASER, ADMIN_ROLE.FINANCE_MANAGER, ADMIN_ROLE.ELECTRONICS_WAREHOUSE_KEEPER],
    },
    finance: {
        type: "DefaultConfig",
        path: "/configuration/finance/cost",
        title: "财务区块",
        permission: ADMIN_ROLE.FINANCE,
        allowRoles: [ADMIN_ROLE.FINANCE_MANAGER],
    },
    notification: {
        type: "DefaultConfig",
        path: "/configuration/notification",
        title: "通知中心",
        permission: ADMIN_ROLE.SELLER,
        allowRoles: [ADMIN_ROLE.WAREHOUSE_KEEPER, ADMIN_ROLE.FINANCE, ADMIN_ROLE.FINANCE_MANAGER],
    },
};

export default OPTION_CONFIG;
