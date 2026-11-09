import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { usePurchaseSupplierModel } from "~~/server/models/purchaseSupplier.model";
import { logger } from "~~/server/utils/logger";
import { requirePurchaseSupplierReadAccess } from "~~/server/utils/purchaseSupplierPermission";

export default defineEventHandler(async (event) => {
    requirePurchaseSupplierReadAccess(event);

    try {
        const query = getQuery(event);
        const result = await usePurchaseSupplierModel().retrieveProducts(
            toText(query.supplierId),
            {
                keyword: toText(query.keyword),
                categoryId: toText(query.categoryId),
                page: query.page === undefined ? undefined : Number(query.page),
                limit: query.limit === undefined ? undefined : Number(query.limit),
            }
        );

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        logger.error("Retrieve purchase supplier products error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
