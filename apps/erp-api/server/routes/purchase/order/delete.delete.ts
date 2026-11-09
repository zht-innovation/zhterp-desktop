import {
    getInventoryActor,
    InventoryHttpError,
    parseIds,
} from "~~/server/services/inventory";
import { usePurchaseOrderModel } from "~~/server/models/purchaseOrder.model";
import { logger } from "~~/server/utils/logger";
import { canDeletePurchaseOrder } from "~~/shared/utils/adminPermission";

export default defineEventHandler(async (event) => {
    try {
        if (!event.context.auth?.username || !canDeletePurchaseOrder(Number(event.context.auth.role))) {
            throw new InventoryHttpError(403, 403, "无采购单删除权限");
        }
        const body = await readBody(event);
        const ids = parseIds(body);
        await usePurchaseOrderModel().delete(ids, getInventoryActor(event));

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
        };
    } catch (err: any) {
        logger.error("Delete purchase order error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
