import { InventoryHttpError, toBoolean, toText } from "~~/server/services/inventory";
import { usePurchaseSupplierModel } from "~~/server/models/purchaseSupplier.model";
import { logger } from "~~/server/utils/logger";
import { requirePurchaseSupplierReadAccess } from "~~/server/utils/purchaseSupplierPermission";

export default defineEventHandler(async (event) => {
    requirePurchaseSupplierReadAccess(event);

    try {
        const query = getQuery(event);
        const result = await usePurchaseSupplierModel().retrieve({
            keyword: toText(query.keyword),
            isEnabled: query.isEnabled,
            productId: toText(query.productId),
            includeDeleted: toBoolean(query.includeDeleted, false),
            page: Number(query.page || 1),
            limit: Number(query.limit || 20),
        });

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        logger.error("Retrieve purchase supplier list error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
