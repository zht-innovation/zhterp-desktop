import { getInventoryActor, InventoryHttpError, toText } from "~~/server/services/inventory";
import {
    toPurchaseOrderResponse,
    usePurchaseOrderModel,
} from "~~/server/models/purchaseOrder.model";
import { syncPurchaseOrderWaybills } from "~~/server/services/inventoryWaybillSync";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const actor = getInventoryActor(event);
        const orderModel = usePurchaseOrderModel();
        const created = body?.creationSource === "purchase-request"
            ? await orderModel.createFromPurchaseRequest(body || {}, actor)
            : await orderModel.create(body || {}, actor);
        await syncPurchaseOrderWaybills(created, actor);

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                id: toText(created?._id),
                detail: toPurchaseOrderResponse(created),
            },
        };
    } catch (err: any) {
        logger.error("Create purchase order error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
