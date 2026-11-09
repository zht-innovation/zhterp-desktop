import { createError, type H3Event } from "h3";
import { canAccessPurchaseSupplier, canReadPurchaseSupplier } from "~~/shared/utils/adminPermission";

export const requirePurchaseSupplierReadAccess = (event: H3Event) => {
    if (!canReadPurchaseSupplier(Number(event.context.auth?.role))) {
        throw createError({
            statusCode: 403,
            statusMessage: "权限不足",
        });
    }
};

export const requirePurchaseSupplierAccess = (event: H3Event) => {
    if (!canAccessPurchaseSupplier(Number(event.context.auth?.role))) {
        throw createError({
            statusCode: 403,
            statusMessage: "权限不足",
        });
    }
};
