import {
    getInventoryActor,
    InventoryHttpError,
    parseIds,
} from "~~/server/services/inventory";
import { usePurchaseSupplierModel } from "~~/server/models/purchaseSupplier.model";
import { logger } from "~~/server/utils/logger";
import { requirePurchaseSupplierAccess } from "~~/server/utils/purchaseSupplierPermission";

export default defineEventHandler(async (event) => {
    requirePurchaseSupplierAccess(event);

    try {
        const body = await readBody(event);
        const ids = parseIds(body);
        await usePurchaseSupplierModel().delete(ids, getInventoryActor(event));

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
        };
    } catch (err: any) {
        logger.error("Delete purchase supplier error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
