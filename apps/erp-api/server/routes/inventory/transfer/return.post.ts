import { getInventoryActor, InventoryHttpError, toText } from "~~/server/services/inventory";
import { useInventoryTransferModel } from "~~/server/models/inventoryTransfer.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const id = toText(body?.id || body?._id);
        const updated = await useInventoryTransferModel().returnBorrowed(
            id,
            body?.actualReturnTime,
            getInventoryActor(event),
        );

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                id: toText(updated?._id),
                detail: updated,
            },
        };
    } catch (err: any) {
        logger.error("Return inventory transfer error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
