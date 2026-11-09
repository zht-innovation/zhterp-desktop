import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { useInventoryOutboundModel } from "~~/server/models/inventoryOutbound.model";
import { getInventoryOutboundReadScope } from "~~/server/services/inventoryOutboundAccess";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const scope = await getInventoryOutboundReadScope(event.context.auth);
        const detail = await useInventoryOutboundModel().detail(toText(query.id), scope);

        if (!detail) {
            setResponseStatus(event, 404);
            return {
                code: CODE.INVENTORY_NOT_FOUND,
                msg: codeToMsg[CODE.INVENTORY_NOT_FOUND],
            };
        }

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                detail,
            },
        };
    } catch (err: any) {
        logger.error("Retrieve inventory outbound detail error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
