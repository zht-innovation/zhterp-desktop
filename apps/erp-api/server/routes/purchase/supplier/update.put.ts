import {
    getInventoryActor,
    InventoryHttpError,
    toText,
} from "~~/server/services/inventory";
import { usePurchaseSupplierModel } from "~~/server/models/purchaseSupplier.model";
import { logger } from "~~/server/utils/logger";
import { requirePurchaseSupplierAccess } from "~~/server/utils/purchaseSupplierPermission";

export default defineEventHandler(async (event) => {
    requirePurchaseSupplierAccess(event);

    try {
        const body = await readBody(event);
        const id = toText(body?.id || body?._id);
        const updated = await usePurchaseSupplierModel().update(
            id,
            body || {},
            getInventoryActor(event)
        );

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                id: updated._id.toString(),
                detail: updated,
            },
        };
    } catch (err: any) {
        logger.error("Update purchase supplier error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
