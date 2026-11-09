import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { useInventoryWaybillModel } from "~~/server/models/inventoryWaybill.model";
import { logger } from "~~/server/utils/logger";
import { attachPurchaseLogisticsToWaybills } from "~~/server/services/purchaseLogistics";
import {
    getInventoryWaybillReadScope,
    sanitizeInventoryWaybillForRead,
} from "~~/server/services/inventoryWaybillAccess";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const id = toText(query.id);
        const scope = await getInventoryWaybillReadScope(event.context.auth);
        const detail = await useInventoryWaybillModel().detail(id, scope);

        if (!detail) {
            setResponseStatus(event, 404);
            return {
                code: CODE.INVENTORY_NOT_FOUND,
                msg: codeToMsg[CODE.INVENTORY_NOT_FOUND],
            };
        }

        const [displayDetail] = await attachPurchaseLogisticsToWaybills([detail]);
        setHeader(event, "Cache-Control", "no-store");
        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                detail: sanitizeInventoryWaybillForRead(displayDetail, scope),
            },
        };
    } catch (err: any) {
        logger.error("Retrieve inventory waybill detail error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
