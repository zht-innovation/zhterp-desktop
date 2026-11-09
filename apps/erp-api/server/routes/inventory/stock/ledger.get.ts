import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { useInventoryStockModel } from "~~/server/models/inventoryStock.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const result = await useInventoryStockModel().ledgerList({
            productId: toText(query.productId),
            keyword: toText(query.keyword),
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
        logger.error("Retrieve inventory stock ledger error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
