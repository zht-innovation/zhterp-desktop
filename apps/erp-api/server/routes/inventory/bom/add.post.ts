import { getInventoryActor, InventoryHttpError } from "~~/server/services/inventory";
import { useInventoryBomModel } from "~~/server/models/inventoryBom.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const created = await useInventoryBomModel().create(body || {}, getInventoryActor(event));

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                id: created._id.toString(),
                detail: created,
            },
        };
    } catch (err: any) {
        logger.error("Create inventory BOM error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
