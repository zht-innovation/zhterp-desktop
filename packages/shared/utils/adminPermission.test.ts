import { describe, expect, it } from "bun:test";
import { ADMIN_ROLE } from "../enums";
import {
    canAccessConfigurationPath,
    canAccessFeedback,
    canAccessErp,
    canAccessInventory,
    canAccessProductionExecution,
    canAccessPublicCustomerPool,
    canExecuteProductionAction,
    canSelectSalesOrderForPurchaseRequest,
    canSellerAccessInventoryPath,
    canSubmitBorrowRequest,
    canViewProductionRequisitions,
    canWarehouseKeeperAccessConfigurationPath,
    getHomeWorkbenchCapabilities,
    getInventoryModuleLandingPath,
    hasFullInventoryAccess,
    isOperatorInventoryReadonly,
    isSellerInventoryReadonly,
} from "./adminPermission";

describe("seller production overview permissions", () => {
    it("opens only the exact production overview page", () => {
        expect(canAccessConfigurationPath(ADMIN_ROLE.SELLER, "/configuration/production/orders")).toBe(true);
        for (const path of [
            "/configuration/production",
            "/configuration/production/orders/other",
            "/configuration/production/orders-other",
            "/configuration/production/production-orders",
            "/configuration/production/requisitions",
            "/configuration/production/completion",
        ]) {
            expect(canAccessConfigurationPath(ADMIN_ROLE.SELLER, path)).toBe(false);
        }
    });

    it("keeps salespeople out of every production operation", () => {
        expect(hasFullInventoryAccess(ADMIN_ROLE.SELLER)).toBe(false);
        expect(canAccessProductionExecution(ADMIN_ROLE.SELLER)).toBe(false);
        for (const action of [
            "create-requisition", "cancel-requisition", "issue-requisition", "request-return",
            "receive-return", "register-completion", "receive-completion", "register-material-loss",
            "confirm-order-completion", "allocate-public-materials",
        ]) {
            expect(canExecuteProductionAction(ADMIN_ROLE.SELLER, action)).toBe(false);
        }
    });
});

describe("finance manager production requisition permissions", () => {
    it("opens only the exact requisition page", () => {
        expect(canAccessConfigurationPath(ADMIN_ROLE.FINANCE_MANAGER, "/configuration/production/requisitions")).toBe(true);
        for (const path of [
            "/configuration/production",
            "/configuration/production/orders",
            "/configuration/production/production-orders",
            "/configuration/production/completion",
            "/configuration/production/requisitions/other",
            "/configuration/production/requisitions-other",
        ]) {
            expect(canAccessConfigurationPath(ADMIN_ROLE.FINANCE_MANAGER, path)).toBe(false);
        }
    });

    it("adds finance managers to requisition viewers without admitting unrelated roles", () => {
        for (const role of [ADMIN_ROLE.SUPER, ADMIN_ROLE.PRODUCTION_MANAGER, ADMIN_ROLE.WAREHOUSE_KEEPER, ADMIN_ROLE.FINANCE_MANAGER]) {
            expect(canViewProductionRequisitions(role)).toBe(true);
        }
        for (const role of [
            ADMIN_ROLE.DEVELOPER, ADMIN_ROLE.OPERATOR, ADMIN_ROLE.SELLER, ADMIN_ROLE.VENDOR,
            ADMIN_ROLE.FINANCE, ADMIN_ROLE.PURCHASER, ADMIN_ROLE.ORDINARY_USER, ADMIN_ROLE.CONTENT_MANAGER,
        ]) {
            expect(canViewProductionRequisitions(role)).toBe(false);
        }
    });

    it("keeps finance managers out of every production operation", () => {
        expect(hasFullInventoryAccess(ADMIN_ROLE.FINANCE_MANAGER)).toBe(false);
        expect(canAccessProductionExecution(ADMIN_ROLE.FINANCE_MANAGER)).toBe(false);
        for (const action of [
            "create-requisition", "cancel-requisition", "issue-requisition", "request-return",
            "receive-return", "register-completion", "receive-completion", "register-material-loss",
            "confirm-order-completion", "allocate-public-materials", "unknown-action",
        ]) {
            expect(canExecuteProductionAction(ADMIN_ROLE.FINANCE_MANAGER, action)).toBe(false);
        }
    });
});

describe("warehouse production execution permissions", () => {
    it("opens both execution pages through both existing route checks", () => {
        const allowedPaths = [
            "/configuration/production/requisitions",
            "/configuration/production/completion",
        ];
        for (const path of allowedPaths) {
            expect(canAccessConfigurationPath(ADMIN_ROLE.WAREHOUSE_KEEPER, path)).toBe(true);
            expect(canWarehouseKeeperAccessConfigurationPath(path)).toBe(true);
        }

        const deniedPaths = [
            "/configuration/production",
            "/configuration/production/orders",
            "/configuration/production/production-orders",
            "/configuration/production/completion-other",
        ];
        for (const path of deniedPaths) {
            expect(canAccessConfigurationPath(ADMIN_ROLE.WAREHOUSE_KEEPER, path)).toBe(false);
            expect(canWarehouseKeeperAccessConfigurationPath(path)).toBe(false);
        }
    });

    it("allows warehouse confirmations without production applications or full inventory access", () => {
        expect(canAccessProductionExecution(ADMIN_ROLE.WAREHOUSE_KEEPER)).toBe(true);
        expect(hasFullInventoryAccess(ADMIN_ROLE.WAREHOUSE_KEEPER)).toBe(false);
        for (const action of ["issue-requisition", "receive-return", "receive-completion"]) {
            expect(canExecuteProductionAction(ADMIN_ROLE.WAREHOUSE_KEEPER, action)).toBe(true);
        }
        for (const action of ["create-requisition", "cancel-requisition", "request-return", "register-completion", "register-material-loss", "confirm-order-completion"]) {
            expect(canExecuteProductionAction(ADMIN_ROLE.WAREHOUSE_KEEPER, action)).toBe(false);
            expect(canExecuteProductionAction(ADMIN_ROLE.SUPER, action)).toBe(true);
            expect(canExecuteProductionAction(ADMIN_ROLE.PRODUCTION_MANAGER, action)).toBe(true);
        }
    });

    it("keeps unrelated roles and unknown actions out of production execution", () => {
        const deniedRoles = [
            ADMIN_ROLE.DEVELOPER, ADMIN_ROLE.OPERATOR, ADMIN_ROLE.SELLER, ADMIN_ROLE.VENDOR,
            ADMIN_ROLE.FINANCE, ADMIN_ROLE.PURCHASER, ADMIN_ROLE.FINANCE_MANAGER,
            ADMIN_ROLE.ORDINARY_USER, ADMIN_ROLE.CONTENT_MANAGER,
        ];
        for (const role of deniedRoles) {
            expect(canAccessProductionExecution(role)).toBe(false);
            expect(canExecuteProductionAction(role, "issue-requisition")).toBe(false);
            expect(canExecuteProductionAction(role, "receive-completion")).toBe(false);
            expect(canExecuteProductionAction(role, "register-material-loss")).toBe(false);
            expect(canExecuteProductionAction(role, "confirm-order-completion")).toBe(false);
        }
        for (const role of [ADMIN_ROLE.SUPER, ADMIN_ROLE.PRODUCTION_MANAGER, ADMIN_ROLE.WAREHOUSE_KEEPER]) {
            expect(canExecuteProductionAction(role, "unknown-action")).toBe(false);
        }
    });
});

describe("public customer pool permissions", () => {
    it("allows only super administrators and salespeople", () => {
        expect(canAccessPublicCustomerPool(ADMIN_ROLE.SUPER)).toBe(true);
        expect(canAccessPublicCustomerPool(ADMIN_ROLE.SELLER)).toBe(true);

        const deniedRoles = [
            ADMIN_ROLE.DEVELOPER,
            ADMIN_ROLE.OPERATOR,
            ADMIN_ROLE.VENDOR,
            ADMIN_ROLE.FINANCE,
            ADMIN_ROLE.PURCHASER,
            ADMIN_ROLE.WAREHOUSE_KEEPER,
            ADMIN_ROLE.FINANCE_MANAGER,
            ADMIN_ROLE.PRODUCTION_MANAGER,
            ADMIN_ROLE.ORDINARY_USER,
        ];

        deniedRoles.forEach((role) => {
            expect(canAccessPublicCustomerPool(role)).toBe(false);
        });
    });
});

describe("sales order purchase request permissions", () => {
    it("allows production managers to select sales orders for purchase requests", () => {
        expect(canSelectSalesOrderForPurchaseRequest(ADMIN_ROLE.PRODUCTION_MANAGER)).toBe(true);
        expect(canSelectSalesOrderForPurchaseRequest(ADMIN_ROLE.SELLER)).toBe(false);
        expect(canSelectSalesOrderForPurchaseRequest(ADMIN_ROLE.PURCHASER)).toBe(false);
        expect(canSelectSalesOrderForPurchaseRequest(ADMIN_ROLE.ORDINARY_USER)).toBe(false);
    });
});

describe("configuration user management permission", () => {
    it("allows only super administrators to access user management", () => {
        expect(canAccessConfigurationPath(ADMIN_ROLE.SUPER, "/configuration/user")).toBe(true);

        const deniedRoles = [
            ADMIN_ROLE.DEVELOPER,
            ADMIN_ROLE.OPERATOR,
            ADMIN_ROLE.SELLER,
            ADMIN_ROLE.VENDOR,
            ADMIN_ROLE.FINANCE,
            ADMIN_ROLE.PURCHASER,
            ADMIN_ROLE.WAREHOUSE_KEEPER,
            ADMIN_ROLE.FINANCE_MANAGER,
            ADMIN_ROLE.PRODUCTION_MANAGER,
            ADMIN_ROLE.ORDINARY_USER,
        ];

        deniedRoles.forEach((role) => {
            expect(canAccessConfigurationPath(role, "/configuration/user")).toBe(false);
        });
    });

    it("also blocks nested user management paths", () => {
        expect(canAccessConfigurationPath(ADMIN_ROLE.OPERATOR, "/configuration/user/detail")).toBe(false);
    });

    it("limits ordinary users to the ERP home, approval, and notification pages", () => {
        expect(canAccessConfigurationPath(ADMIN_ROLE.ORDINARY_USER, "/configuration")).toBe(true);
        expect(canAccessConfigurationPath(ADMIN_ROLE.ORDINARY_USER, "/configuration/home")).toBe(true);
        expect(canAccessConfigurationPath(ADMIN_ROLE.ORDINARY_USER, "/configuration/approval")).toBe(true);
        expect(canAccessConfigurationPath(ADMIN_ROLE.ORDINARY_USER, "/configuration/approval/initiate")).toBe(true);
        expect(canAccessConfigurationPath(ADMIN_ROLE.ORDINARY_USER, "/configuration/purchase/request")).toBe(true);
        expect(canAccessConfigurationPath(ADMIN_ROLE.ORDINARY_USER, "/configuration/notification")).toBe(true);
        expect(canAccessConfigurationPath(ADMIN_ROLE.ORDINARY_USER, "/configuration/approval/settings")).toBe(false);
        expect(canAccessConfigurationPath(ADMIN_ROLE.ORDINARY_USER, "/configuration/inventory")).toBe(false);
    });
});

describe("operator ERP permissions", () => {
    it("allows only the configured operator ERP pages", () => {
        expect(canAccessConfigurationPath(ADMIN_ROLE.OPERATOR, "/configuration/home")).toBe(true);
        expect(canAccessConfigurationPath(ADMIN_ROLE.OPERATOR, "/configuration/approval/initiate")).toBe(true);
        expect(canAccessConfigurationPath(ADMIN_ROLE.OPERATOR, "/configuration/inventory/realtime")).toBe(true);
        expect(canAccessConfigurationPath(ADMIN_ROLE.OPERATOR, "/configuration/notification")).toBe(true);
        expect(canAccessConfigurationPath(ADMIN_ROLE.OPERATOR, "/configuration/sales/order")).toBe(false);
        expect(canAccessConfigurationPath(ADMIN_ROLE.OPERATOR, "/configuration/inventory/inbound")).toBe(false);
        expect(canAccessConfigurationPath(ADMIN_ROLE.OPERATOR, "/configuration/purchase/order")).toBe(false);
        expect(canAccessConfigurationPath(ADMIN_ROLE.OPERATOR, "/configuration/finance/cost")).toBe(false);
    });

    it("separates borrow submission from inventory write access", () => {
        expect(canSubmitBorrowRequest(ADMIN_ROLE.OPERATOR)).toBe(true);
        expect(canSubmitBorrowRequest(ADMIN_ROLE.DEVELOPER)).toBe(false);
        expect(canSubmitBorrowRequest(ADMIN_ROLE.VENDOR)).toBe(false);
        expect(isOperatorInventoryReadonly(ADMIN_ROLE.OPERATOR)).toBe(true);
        expect(isOperatorInventoryReadonly(ADMIN_ROLE.WAREHOUSE_KEEPER)).toBe(false);
        expect(getHomeWorkbenchCapabilities(ADMIN_ROLE.OPERATOR)).toEqual({
            approval: true,
            notification: true,
            sales: false,
        });
    });
});

describe("seller readonly inventory permissions", () => {
    it("lands sales, operator and finance manager on the realtime page", () => {
        expect(getInventoryModuleLandingPath(ADMIN_ROLE.SELLER)).toBe("/configuration/inventory/realtime");
        expect(getInventoryModuleLandingPath(ADMIN_ROLE.OPERATOR)).toBe("/configuration/inventory/realtime");
        expect(getInventoryModuleLandingPath(ADMIN_ROLE.FINANCE_MANAGER)).toBe("/configuration/inventory/realtime");
        expect(getInventoryModuleLandingPath(ADMIN_ROLE.WAREHOUSE_KEEPER)).toBe("/configuration/inventory/basic-data/unit");
        expect(getInventoryModuleLandingPath(ADMIN_ROLE.PURCHASER)).toBe("/configuration/inventory/basic-data/unit");
    });

    it("allows sales only the realtime, outbound and waybill inventory paths", () => {
        expect(canSellerAccessInventoryPath("/configuration/inventory/realtime")).toBe(true);
        expect(canSellerAccessInventoryPath("/configuration/inventory/realtime/detail")).toBe(true);
        expect(canSellerAccessInventoryPath("/configuration/inventory/outbound")).toBe(true);
        expect(canSellerAccessInventoryPath("/configuration/inventory/outbound/detail")).toBe(true);
        expect(canSellerAccessInventoryPath("/configuration/inventory/waybill")).toBe(true);
        expect(canSellerAccessInventoryPath("/configuration/inventory/waybill/detail")).toBe(true);
        expect(canSellerAccessInventoryPath("/configuration/inventory/waybill-other")).toBe(false);
        expect(canSellerAccessInventoryPath("/configuration/inventory/outbound-other")).toBe(false);
        expect(canSellerAccessInventoryPath("/configuration/inventory/inbound")).toBe(false);
        expect(canSellerAccessInventoryPath("/configuration/inventory/basic-data/product")).toBe(false);
        expect(canSellerAccessInventoryPath("/configuration/inventory/stocktake")).toBe(false);
        expect(canSellerAccessInventoryPath("/configuration/inventory/transfer")).toBe(false);
    });

    it("keeps the inventory module ceiling away from vendor and finance", () => {
        expect(isSellerInventoryReadonly(ADMIN_ROLE.SELLER)).toBe(true);
        expect(isSellerInventoryReadonly(ADMIN_ROLE.OPERATOR)).toBe(false);
        expect(canAccessInventory(ADMIN_ROLE.SELLER)).toBe(true);
        expect(canAccessInventory(ADMIN_ROLE.VENDOR)).toBe(false);
        expect(canAccessInventory(ADMIN_ROLE.FINANCE)).toBe(false);
    });
});


describe("feedback access", () => {
    it("opens feedback to every existing role without widening other modules", () => {
        Object.values(ADMIN_ROLE).filter((role): role is ADMIN_ROLE => typeof role === "number").forEach((role) => {
            expect(canAccessFeedback(role)).toBe(true);
            expect(canAccessConfigurationPath(role, "/configuration/feedback")).toBe(true);
            expect(canAccessConfigurationPath(role, "/configuration/feedback?feedbackId=example")).toBe(true);
        });
        expect(canAccessErp(ADMIN_ROLE.DEVELOPER)).toBe(false);
        expect(canAccessConfigurationPath(ADMIN_ROLE.DEVELOPER, "/configuration/inventory")).toBe(false);
        expect(canAccessConfigurationPath(ADMIN_ROLE.CONTENT_MANAGER, "/configuration/notification")).toBe(false);
    });

    it("rejects unknown and non-integer role values", () => {
        [-1, 12, 1.5, NaN, Infinity].forEach((role) => {
            expect(canAccessFeedback(role)).toBe(false);
            expect(canAccessConfigurationPath(role, "/configuration/feedback")).toBe(false);
        });
    });
});
