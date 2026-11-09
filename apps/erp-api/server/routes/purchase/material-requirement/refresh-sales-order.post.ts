import { getInventoryActor, InventoryHttpError } from "~~/server/services/inventory";
import { usePurchaseMaterialRequirementModel } from "~~/server/models/purchaseMaterialRequirement.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const result = await usePurchaseMaterialRequirementModel().refreshForSalesOrder(
            body || {},
            getInventoryActor(event),
        );

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        logger.error("Refresh purchase material requirements for sales order error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
