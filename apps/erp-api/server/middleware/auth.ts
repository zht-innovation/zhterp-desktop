import jwt from 'jsonwebtoken';
import {logger} from '~~/server/utils/logger';
import {useAdminModel} from '~~/server/models/admin.model';
import {ADMIN_ROLE} from '~~/shared/enums.js';
import {canManageApprovalFlow, PURCHASE_ORDER_MANAGER_ROLES} from '~~/shared/utils/adminPermission';

// 权限映射表：路由 -> 最低允许的角色等级 (数值越小权限越高)
// 0: 超级管理员, 1: 开发者, 2: 运营, 3: 销售, 4: 厂商, 5: 财务, 6: 采购, 7: 库管, 8: 财务经理, 9: 生产管理, 10: 普通用户，11.文章商品用户
type RoutePermission = number | {
    role: number;
    allowRoles?: ADMIN_ROLE[];
};

const financeRoles = [ADMIN_ROLE.FINANCE, ADMIN_ROLE.FINANCE_MANAGER];
const purchaseRoles = [ADMIN_ROLE.PURCHASER, ADMIN_ROLE.FINANCE_MANAGER];

const inventoryOperatorPermission: RoutePermission = {
    role: ADMIN_ROLE.OPERATOR,
    allowRoles: [ADMIN_ROLE.WAREHOUSE_KEEPER, ADMIN_ROLE.PRODUCTION_MANAGER],//放开生产管理可以进行新增
};

const inventoryViewerPermission: RoutePermission = {
    role: ADMIN_ROLE.SELLER,
    allowRoles: [ADMIN_ROLE.WAREHOUSE_KEEPER, ADMIN_ROLE.PRODUCTION_MANAGER, ADMIN_ROLE.ORDINARY_USER],
};

// 指定仓储查询接口的数值上限是财务经理（8），即放行角色 0~8（含销售 3），与 docs/inventory-interface.md「读接口 0~3」一致。
// 销售只被允许查看实时库存页面，其余仓储页面由 app/middleware/auth.global.ts 的 canSellerAccessInventoryPath 拦截回落。
// 库存写接口继续使用原权限。
const financeInventoryViewerPermission: RoutePermission = {
    role: ADMIN_ROLE.FINANCE_MANAGER,
    allowRoles: [ADMIN_ROLE.FINANCE, ADMIN_ROLE.WAREHOUSE_KEEPER, ADMIN_ROLE.PRODUCTION_MANAGER],
};

const inventoryCategoryViewerPermission: RoutePermission = {
    role: ADMIN_ROLE.SELLER,
    allowRoles: [ADMIN_ROLE.WAREHOUSE_KEEPER, ...financeRoles, ADMIN_ROLE.PURCHASER, ADMIN_ROLE.PRODUCTION_MANAGER, ADMIN_ROLE.ORDINARY_USER],
};

const financeViewerPermission: RoutePermission = {
    role: ADMIN_ROLE.SELLER,
    allowRoles: [...financeRoles, ADMIN_ROLE.WAREHOUSE_KEEPER],
};

const currencyPermission: RoutePermission = {
    role: ADMIN_ROLE.SUPER,
    allowRoles: [...financeRoles, ADMIN_ROLE.PRODUCTION_MANAGER],
};

const inventoryPrivilegedPermission: RoutePermission = {
    role: ADMIN_ROLE.SUPER,
    allowRoles: [ADMIN_ROLE.PRODUCTION_MANAGER],
};

const purchasePermission: RoutePermission = {
    role: ADMIN_ROLE.SELLER,
    allowRoles: [...purchaseRoles, ADMIN_ROLE.PRODUCTION_MANAGER],
};

const purchaseViewerPermission: RoutePermission = {
    role: ADMIN_ROLE.SELLER,
    allowRoles: [
        ADMIN_ROLE.VENDOR,
        ADMIN_ROLE.FINANCE,
        ADMIN_ROLE.PURCHASER,
        ADMIN_ROLE.WAREHOUSE_KEEPER,
        ADMIN_ROLE.FINANCE_MANAGER,
        ADMIN_ROLE.PRODUCTION_MANAGER,
        ADMIN_ROLE.ORDINARY_USER,
    ],
};

const purchaseOrderManagerPermission: RoutePermission = {
    role: ADMIN_ROLE.SUPER,
    allowRoles: [...PURCHASE_ORDER_MANAGER_ROLES],
};

const purchaseInventoryViewerPermission: RoutePermission = {
    role: ADMIN_ROLE.SELLER,
    allowRoles: [ADMIN_ROLE.WAREHOUSE_KEEPER, ...purchaseRoles, ADMIN_ROLE.PRODUCTION_MANAGER, ADMIN_ROLE.ORDINARY_USER],
};

const purchaseInventoryCreatePermission: RoutePermission = {
    role: ADMIN_ROLE.OPERATOR,
    allowRoles: [ADMIN_ROLE.WAREHOUSE_KEEPER, ...purchaseRoles, ADMIN_ROLE.PRODUCTION_MANAGER],
};

const purchaseOrderInboundPermission: RoutePermission = {
    role: ADMIN_ROLE.SELLER,
    allowRoles: [...purchaseRoles, ADMIN_ROLE.WAREHOUSE_KEEPER, ADMIN_ROLE.PRODUCTION_MANAGER],
};

// 仅在指定业务接口追加角色，不扩大运单、生产、财务共用权限对象。
const withElectronicsWarehouseRole = (permission: RoutePermission): RoutePermission => {
    if (typeof permission === "number") {
        return { role: permission, allowRoles: [ADMIN_ROLE.ELECTRONICS_WAREHOUSE_KEEPER] };
    }
    return {
        role: permission.role,
        allowRoles: [...(permission.allowRoles || []), ADMIN_ROLE.ELECTRONICS_WAREHOUSE_KEEPER],
    };
};

const routePermissions: Record<string, RoutePermission> = {
    '/production/orders/retrieve': inventoryPrivilegedPermission,
    '/production/orders/list': { role: ADMIN_ROLE.SUPER, allowRoles: [ADMIN_ROLE.PRODUCTION_MANAGER, ADMIN_ROLE.WAREHOUSE_KEEPER, ADMIN_ROLE.FINANCE_MANAGER] },
    '/production/orders/detail': { role: ADMIN_ROLE.SUPER, allowRoles: [ADMIN_ROLE.PRODUCTION_MANAGER, ADMIN_ROLE.WAREHOUSE_KEEPER, ADMIN_ROLE.FINANCE_MANAGER] },
    '/production/orders/add': { role: ADMIN_ROLE.SUPER, allowRoles: [ADMIN_ROLE.PRODUCTION_MANAGER, ADMIN_ROLE.WAREHOUSE_KEEPER] },
    '/production/orders/release': inventoryPrivilegedPermission,
    '/production/products/retrieve': inventoryPrivilegedPermission,
    // Admin management - 仅超级管理员 (0)
    '/admin/del': ADMIN_ROLE.SUPER,
    '/admin/modify': ADMIN_ROLE.SUPER,
    '/admin/retrieve': ADMIN_ROLE.SUPER,
    '/admin/signup': ADMIN_ROLE.SUPER,

    // Devloper - 开发者及以上 (1)

    // Operator - 运营及以上 (2)
    '/admin/profile': withElectronicsWarehouseRole(ADMIN_ROLE.CONTENT_MANAGER),
    '/department/retrieve': ADMIN_ROLE.CONTENT_MANAGER,
    '/department/add': ADMIN_ROLE.SUPER,
    '/department/update': ADMIN_ROLE.SUPER,

    '/confs/upload': 2,
    '/confs/brochure/upload': 2,

    '/docs/delall': 2,
    '/docs/update': 2,
    '/docs/upload': 2,

    '/file/delete': 2,
    '/file/upload': 2,

    'GET /mcp/oauth/request': ADMIN_ROLE.WAREHOUSE_KEEPER,
    'POST /mcp/oauth/authorize': ADMIN_ROLE.WAREHOUSE_KEEPER,
    'GET /mcp/resources': ADMIN_ROLE.WAREHOUSE_KEEPER,
    'GET /mcp/admin/overview': ADMIN_ROLE.OPERATOR,
    'POST /mcp/admin/grants/revoke': ADMIN_ROLE.OPERATOR,

    '/msg/check': 2,
    '/msg/delall': 2,
    '/msg/delete': 2,
    '/msg/fakedel': 2, // 放入回收站
    '/msg/markpool': 2,
    '/msg/retrieve': 2,

    '/salesperson/add': 2,
    '/salesperson/delete': 2,
    '/salesperson/fakedel': 2,
    '/salesperson/recount': 2,
    '/salesperson/search': 3,

    '/application/handle': 2,

    '/contact/remove': 2,
    '/customer/stats': 2,
    '/customer/extend': 2,

    // '/log/delete': 2,  // 只有运营及以上可以删除日志


    // Sales - 销售及以上 (3)
    '/customer/add': 3,
    '/customer/company-groups': 3,
    '/customer/company-customers': 3,
    '/customer/company-options': 3,
    '/customer/detail': 3,
    '/customer/import': 3,
    '/customer/search': 3,
    '/customer/retrieve': 3,
    '/customer/update': 3,
    '/customer/delete': ADMIN_ROLE.SUPER,
    '/customer/fakedel': ADMIN_ROLE.SUPER,
    '/customer/recover': ADMIN_ROLE.SUPER,
    '/customer/term-log': 2,
    '/customer/changesales': 2,  // 只有运营及以上可以修改销售分配
    '/customer/unassign': 2,  // 只有运营及以上可以放回公共池
    '/salesperson/retrieve': 3,
    '/salesperson/update': 3,

    '/sales-order/add': 3,
    '/sales-order/update': 3,
    '/sales-order/delete': 3,
    '/sales-order/revoke-audit': 3,
    '/sales-order/retrieve': 3,
    '/sales-order/approval-stats': 3,
    '/sales-order/audit': 3,
    '/sales-order/reject': 3,
    '/sales-order/import': 3,
    '/sales-order/export': 3,
    '/sales-order-receipt/add': 3,
    '/sales-order-receipt/retrieve': 3,
    '/sales-order-receipt/audit': 3,
    '/approval-center/applicants': withElectronicsWarehouseRole({ role: ADMIN_ROLE.FINANCE_MANAGER, allowRoles: [ADMIN_ROLE.PRODUCTION_MANAGER, ADMIN_ROLE.ORDINARY_USER] }),
    '/approval-center/retrieve': withElectronicsWarehouseRole({ role: ADMIN_ROLE.FINANCE_MANAGER, allowRoles: [ADMIN_ROLE.PRODUCTION_MANAGER, ADMIN_ROLE.ORDINARY_USER] }),
    '/approval-center/approve': withElectronicsWarehouseRole({ role: ADMIN_ROLE.FINANCE_MANAGER, allowRoles: [ADMIN_ROLE.PRODUCTION_MANAGER] }),
    '/approval-center/reject': withElectronicsWarehouseRole({ role: ADMIN_ROLE.FINANCE_MANAGER, allowRoles: [ADMIN_ROLE.PRODUCTION_MANAGER] }),
    '/approval-center/cancel': withElectronicsWarehouseRole({ role: ADMIN_ROLE.FINANCE_MANAGER, allowRoles: [ADMIN_ROLE.ORDINARY_USER] }),
    '/approval-center/read': withElectronicsWarehouseRole({ role: ADMIN_ROLE.FINANCE_MANAGER, allowRoles: [ADMIN_ROLE.PRODUCTION_MANAGER, ADMIN_ROLE.ORDINARY_USER] }),
    '/approval-center/delete': ADMIN_ROLE.FINANCE_MANAGER,
    '/approval-flow/retrieve': ADMIN_ROLE.FINANCE_MANAGER,
    '/approval-flow/update': ADMIN_ROLE.FINANCE_MANAGER,
    '/borrow-request/retrieve': { role: ADMIN_ROLE.WAREHOUSE_KEEPER, allowRoles: [ADMIN_ROLE.ORDINARY_USER] },
    '/borrow-request/preview': { role: ADMIN_ROLE.WAREHOUSE_KEEPER, allowRoles: [ADMIN_ROLE.ORDINARY_USER] },
    '/borrow-request/add': { role: ADMIN_ROLE.WAREHOUSE_KEEPER, allowRoles: [ADMIN_ROLE.ORDINARY_USER] },
    '/borrow-request/audit': ADMIN_ROLE.WAREHOUSE_KEEPER,
    '/borrow-request/reject': ADMIN_ROLE.WAREHOUSE_KEEPER,
    'GET /borrow-request/flow': ADMIN_ROLE.SUPER,
    'PUT /borrow-request/flow': ADMIN_ROLE.SUPER,

    '/application/retrieve': 3,
    '/application/add': 3,
    '/application/revoke': 3,

    '/contact/retrieve': 3,

    '/log/delete': 3,    // 只有运营及以上可以删除日志
    '/log/fakedel': 3,
    '/log/submit': 3,    // 销售可以提交日志
    '/log/retrieve': 3,  // 销售可以查看日志
    '/log/modify': 3,    // 销售可以修改日志

    '/news/retrieve': 3,

    '/notification/add': ADMIN_ROLE.SUPER,
    '/notification/delete': ADMIN_ROLE.SUPER,

    "/feedback/add": ADMIN_ROLE.CONTENT_MANAGER,
    "/feedback/retrieve": ADMIN_ROLE.CONTENT_MANAGER,
    "/feedback/getdetail": ADMIN_ROLE.CONTENT_MANAGER,
    "/feedback/options": ADMIN_ROLE.CONTENT_MANAGER,
    "/feedback/update": ADMIN_ROLE.CONTENT_MANAGER,
    "/feedback/resubmit": ADMIN_ROLE.CONTENT_MANAGER,
    "/feedback/withdraw": ADMIN_ROLE.CONTENT_MANAGER,
    "/feedback/delete": ADMIN_ROLE.CONTENT_MANAGER,
    "/feedback/progress": ADMIN_ROLE.CONTENT_MANAGER,
    "/feedback/return": ADMIN_ROLE.CONTENT_MANAGER,
    "/feedback/follow": ADMIN_ROLE.CONTENT_MANAGER,
    "/feedback/read": ADMIN_ROLE.CONTENT_MANAGER,

    '/simulator/options/createOrUpdate': 2,

    '/inventory/unit/add': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/unit/update': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/unit/delete': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/material/add': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/material/update': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/material/delete': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/category/add': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/category/update': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/category/delete': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/warehouse/add': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/warehouse/update': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/warehouse/delete': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/currency/add': currencyPermission,
    '/inventory/currency/update': currencyPermission,
    '/inventory/currency/delete': currencyPermission,
    '/inventory/location/add': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/location/update': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/location/delete': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/bom-category/add': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/bom-category/update': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/bom-category/delete': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/product/add': withElectronicsWarehouseRole(purchaseInventoryCreatePermission),
    '/inventory/product/update': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/product/sn-print-state': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/product/delete': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/product/import': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/product/export': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/bom/add': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/bom/update': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/bom/delete': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/bom/import': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/bom/export': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/waybill/add': inventoryOperatorPermission,
    '/inventory/waybill/update': inventoryOperatorPermission,
    '/inventory/waybill/delete': inventoryOperatorPermission,
    '/inventory/waybill/import': inventoryOperatorPermission,
    '/inventory/inbound/add': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/inbound/update': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/inbound/import': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/inbound/export': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/inbound/delete': withElectronicsWarehouseRole(inventoryPrivilegedPermission),
    '/inventory/transfer/add': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/transfer/update': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/transfer/return': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/transfer/import': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/transfer/export': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/transfer/delete': withElectronicsWarehouseRole(inventoryPrivilegedPermission),
    '/inventory/outbound/add': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/outbound/update': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/outbound/import': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/outbound/export': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/outbound/delete': withElectronicsWarehouseRole(inventoryPrivilegedPermission),
    '/inventory/stocktake/add': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/stocktake/update': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/stocktake/delete': withElectronicsWarehouseRole(inventoryPrivilegedPermission),
    '/inventory/stocktake/complete': withElectronicsWarehouseRole(inventoryOperatorPermission),
    '/inventory/attachment/upload': withElectronicsWarehouseRole(purchaseInventoryCreatePermission),
    
    // Vendor - 厂商及以上 (4)
    '/simulator/records/createOrUpdate': 4,
    '/simulator/records/delete': 4,

    '/inventory/unit/retrieve': withElectronicsWarehouseRole(purchaseInventoryViewerPermission),
    '/inventory/unit/detail': withElectronicsWarehouseRole(purchaseInventoryViewerPermission),
    '/inventory/unit/tree': withElectronicsWarehouseRole(purchaseInventoryViewerPermission),
    '/inventory/material/retrieve': withElectronicsWarehouseRole(inventoryCategoryViewerPermission),
    '/inventory/material/detail': withElectronicsWarehouseRole(inventoryCategoryViewerPermission),
    '/inventory/material/tree': withElectronicsWarehouseRole(inventoryCategoryViewerPermission),
    '/inventory/category/retrieve': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/category/detail': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/category/tree': withElectronicsWarehouseRole(inventoryCategoryViewerPermission),
    '/inventory/warehouse/retrieve': withElectronicsWarehouseRole(financeInventoryViewerPermission),
    '/inventory/warehouse/detail': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/warehouse/tree': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/currency/retrieve': currencyPermission,
    '/inventory/currency/detail': currencyPermission,
    '/inventory/currency/tree': currencyPermission,
    '/inventory/location/retrieve': withElectronicsWarehouseRole(financeInventoryViewerPermission),
    '/inventory/location/detail': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/location/tree': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/location-scan': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/bom-category/retrieve': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/bom-category/detail': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/bom-category/tree': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/product/retrieve': withElectronicsWarehouseRole(purchaseInventoryViewerPermission),
    '/inventory/product/detail': withElectronicsWarehouseRole(purchaseInventoryViewerPermission),
    '/inventory/bom/retrieve': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/bom/detail': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/bom/structure': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/waybill/retrieve': financeInventoryViewerPermission,
    '/inventory/waybill/detail': financeInventoryViewerPermission,
    '/inventory/waybill/attachments': financeInventoryViewerPermission,
    '/inventory/waybill/export': financeInventoryViewerPermission,
    '/inventory/inbound/retrieve': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/inbound/detail': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/transfer/retrieve': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/transfer/detail': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/outbound/retrieve': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/outbound/detail': withElectronicsWarehouseRole(inventoryViewerPermission),
    '/inventory/stocktake/retrieve': withElectronicsWarehouseRole(financeInventoryViewerPermission),
    '/inventory/stocktake/detail': withElectronicsWarehouseRole(financeInventoryViewerPermission),
    '/inventory/stock/retrieve': withElectronicsWarehouseRole(financeInventoryViewerPermission),
    '/inventory/stock/ledger': withElectronicsWarehouseRole(financeInventoryViewerPermission),
    '/inventory/reservation/retrieve': withElectronicsWarehouseRole(purchaseInventoryViewerPermission),


    '/purchase/supplier/add': purchasePermission,
    '/purchase/supplier/update': purchasePermission,
    '/purchase/supplier/delete': purchasePermission,
    '/purchase/supplier/status': purchasePermission,
    '/purchase/supplier/products': purchasePermission,
    '/purchase/supplier/retrieve': purchasePermission,
    'GET /purchase/supplier/retrieve': withElectronicsWarehouseRole(purchasePermission),
    'GET /purchase/supplier/products': withElectronicsWarehouseRole(purchasePermission),

    '/purchase/order/retrieve': withElectronicsWarehouseRole(purchaseViewerPermission),
    '/purchase/order/detail': withElectronicsWarehouseRole(purchaseViewerPermission),
    '/purchase/order/inbound-candidates': withElectronicsWarehouseRole(purchaseOrderInboundPermission),
    '/purchase/order/inbound-detail': withElectronicsWarehouseRole(purchaseOrderInboundPermission),
    '/purchase/order/lookup-by-tracking': withElectronicsWarehouseRole(purchaseOrderInboundPermission),
    '/purchase/order/add': purchaseOrderManagerPermission,
    '/purchase/order/update': purchaseOrderManagerPermission,
    '/purchase/order/delete': withElectronicsWarehouseRole(ADMIN_ROLE.SUPER),
    '/purchase/order/sales-candidates': purchaseOrderManagerPermission,
    '/purchase/material-pool/retrieve': purchaseViewerPermission,
    '/purchase/material-pool/detail': purchaseViewerPermission,
    '/purchase/material-requirement/retrieve': withElectronicsWarehouseRole(purchasePermission),
    '/purchase/material-requirement/add': purchasePermission,
    '/purchase/material-requirement/refresh-sales-order': purchasePermission,

    // Dashboard - 数据中心看板
    '/dashboard/stats': 3,

    // Finance - 成本核算
    '/finance/cost/accessory-retrieve': financeViewerPermission,
    '/finance/cost/machine-retrieve': financeViewerPermission,
    '/finance/cost/detail': financeViewerPermission,
    '/finance/cost/update-price': financeViewerPermission,
};

export default defineEventHandler(async (event) => {
    // 注意：在某些运行时（如 bun dev）里 event.path 可能包含 query（例如 /customer/retrieve?id=xxx）
    // 这里统一只取 pathname，避免权限表匹配失败导致 event.context.auth 未写入
    const path = (event.path || '').split('?')[0];
    const method = (event.method || event.node?.req?.method || '').toUpperCase();
    const methodPath = `${method} ${path}`;
    const permissionKey = routePermissions.hasOwnProperty(methodPath) ? methodPath : path;

    if (!routePermissions.hasOwnProperty(permissionKey)) {
        return;
    }

    const permission = routePermissions[permissionKey];
    const requiredRole = typeof permission === 'number' ? permission : permission.role;
    const allowRoles = typeof permission === 'number' ? [] : permission.allowRoles || [];
    const token = getHeader(event, 'Token') || getCookie(event, 'Token');

    if (!token) {
        logger.warn(`Missing token in request to protected route: ${path}`);
        setResponseStatus(event, 401);
        return {
            code: 401,
            msg: '权限不足',
        }
    }

    const config = useRuntimeConfig()

    try {
        const baseToken = config.baseToken;
        // 验证 token 并获取用户信息
        const decodedPayload = jwt.verify(token, baseToken as string) as {
            username: string,
            role: number,
            canAuditSalesOrder?: boolean,
            canAuditSalesReceipt?: boolean,
            canAuditBorrowRequest?: boolean,
        };
        const role = Number(decodedPayload.role) as ADMIN_ROLE;

        const isApprovalFlowRoute =
            permissionKey === '/approval-flow/retrieve'
            || permissionKey === '/approval-flow/update';
        if (isApprovalFlowRoute) {
            const admin = await useAdminModel().findAdminByUsername(decodedPayload.username);
            if (
                !admin
                || !canManageApprovalFlow(
                    Number(admin.role),
                    admin.canManageApprovalFlow,
                )
            ) {
                setResponseStatus(event, 403);
                return {
                    code: 403,
                    msg: '权限不足',
                };
            }
        }

        // 检查角色权限
        // 角色数值越小，权限越大。用户的 role 必须 <= 路由要求的 role
        let canPassSalesAuditRoute = false;
        if (
            role > requiredRole &&
            [
                '/sales-order/retrieve',
                '/sales-order/approval-stats',
                '/sales-order/audit',
                '/sales-order/reject',
                '/sales-order/export',
            ].includes(permissionKey)
        ) {
            if (Boolean(decodedPayload.canAuditSalesOrder)) {
                canPassSalesAuditRoute = true;
            } else if (decodedPayload.username) {
                const admin = await useAdminModel().findAdminByUsername(decodedPayload.username);
                canPassSalesAuditRoute = Boolean(admin?.canAuditSalesOrder);
            }
        }
        if (
            role > requiredRole &&
            [
                '/sales-order-receipt/retrieve',
                '/sales-order-receipt/audit',
            ].includes(permissionKey)
        ) {
            if (Boolean(decodedPayload.canAuditSalesReceipt)) {
                canPassSalesAuditRoute = true;
            } else if (decodedPayload.username) {
                const admin = await useAdminModel().findAdminByUsername(decodedPayload.username);
                canPassSalesAuditRoute = Boolean(admin?.canAuditSalesReceipt);
            }
        }
        if (
            role > requiredRole &&
            [
                '/borrow-request/retrieve',
                '/borrow-request/preview',
                '/borrow-request/add',
                '/borrow-request/audit',
                '/borrow-request/reject',
            ].includes(permissionKey)
        ) {
            if (Boolean(decodedPayload.canAuditBorrowRequest)) {
                canPassSalesAuditRoute = true;
            } else if (decodedPayload.username) {
                const admin = await useAdminModel().findAdminByUsername(decodedPayload.username);
                canPassSalesAuditRoute = Boolean(admin?.canAuditBorrowRequest);
            }
        }

        const canPassByExplicitRole = allowRoles.includes(role);

        if (role > requiredRole && !canPassSalesAuditRoute && !canPassByExplicitRole) {
            logger.warn(`Insufficient permissions for user ${decodedPayload.username} (Role: ${role}) accessing ${path} (Required: ${requiredRole})`);
            setResponseStatus(event, 403);
            return {
                code: 403,
                msg: '权限不足',
            }
        }
        event.context.auth = decodedPayload; // 将信息存储至event.context，方便接口获取用户等级

    } catch (error) {
        logger.warn(`Token verification failed: ${(error as Error).message}`);
        setResponseStatus(event, 401);
        return {
            code: 401,
            msg: '校验失败',
        }
    }
});
