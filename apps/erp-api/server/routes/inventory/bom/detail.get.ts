import { InventoryHttpError, toBoolean, toText } from "~~/server/services/inventory";
import { useInventoryBomModel } from "~~/server/models/inventoryBom.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const id = toText(query.id);
        const bomModel = useInventoryBomModel();
        const detail = await bomModel.detail(id, {
            includeStructure: toBoolean(query.includeStructure, false),
        });

        if (!detail) {
            setResponseStatus(event, 404);
            return {
                code: CODE.INVENTORY_NOT_FOUND,
                msg: codeToMsg[CODE.INVENTORY_NOT_FOUND],
            };
        }

        const history = toBoolean(query.includeHistory, false)
            ? await bomModel.history(id, { page: Number(query.page || 1), limit: Number(query.limit || 20) })
            : undefined;

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                detail,
                ...(history ? { history } : {}),
            },
        };
    } catch (err: any) {
        logger.error("Retrieve inventory BOM detail error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
