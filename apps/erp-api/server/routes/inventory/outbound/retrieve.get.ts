import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { useInventoryOutboundModel } from "~~/server/models/inventoryOutbound.model";
import { getInventoryOutboundReadScope } from "~~/server/services/inventoryOutboundAccess";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const scope = await getInventoryOutboundReadScope(event.context.auth);
        const result = await useInventoryOutboundModel().retrieve({
            keyword: toText(query.keyword),
            type: toText(query.type),
            outboundDate: toText(query.outboundDate),
            startDate: toText(query.startDate),
            endDate: toText(query.endDate),
            includeDeleted: query.includeDeleted === "true",
            ids: query.ids as string | string[] | undefined,
            page: Number(query.page || 1),
            limit: Number(query.limit || 20),
            ...scope,
        });

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        logger.error("Retrieve inventory outbound list error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
