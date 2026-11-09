import { getInventoryActor, InventoryHttpError, toText } from "~~/server/services/inventory";
import { useInventoryOutboundModel } from "~~/server/models/inventoryOutbound.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const actor = getInventoryActor(event);
        const created = await useInventoryOutboundModel().create(body || {}, actor);

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                id: toText(created?._id),
                detail: created,
            },
        };
    } catch (err: any) {
        logger.error("Create inventory outbound error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
