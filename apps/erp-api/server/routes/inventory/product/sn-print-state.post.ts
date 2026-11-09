import { getInventoryActor, InventoryHttpError, toText } from "~~/server/services/inventory";
import { useInventoryProductModel } from "~~/server/models/inventoryProduct.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const updated = await useInventoryProductModel().updateSnPrintState(
            toText(body?.id || body?._id),
            {
                monthKey: body?.monthKey,
                lastSerial: body?.lastSerial,
            },
            getInventoryActor(event),
        );

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                snPrintState: updated?.snPrintState || null,
            },
        };
    } catch (err: any) {
        logger.error("Update product SN print state error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
