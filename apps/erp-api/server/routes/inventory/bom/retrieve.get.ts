import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { useInventoryBomModel } from "~~/server/models/inventoryBom.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const bomModel = useInventoryBomModel();
        const result = await bomModel.retrieve({
            keyword: toText(query.keyword),
            productId: toText(query.productId),
            isEnabled: query.isEnabled,
            includeDeleted: query.includeDeleted === "true",
            page: Number(query.page || 1),
            limit: Number(query.limit || 20),
        });

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        logger.error("Retrieve inventory BOM list error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
