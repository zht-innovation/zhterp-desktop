import { getInventoryActor, InventoryHttpError, toText } from "~~/server/services/inventory";
import {
    toPurchaseOrderResponse,
    usePurchaseOrderModel,
} from "~~/server/models/purchaseOrder.model";
import { syncPurchaseOrderWaybills } from "~~/server/services/inventoryWaybillSync";
import { logger } from "~~/server/utils/logger";
import { canEditPurchaseOrder, canManagePurchaseOrder } from "~~/shared/utils/adminPermission";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const id = toText(body?.id || body?._id);
        const actor = getInventoryActor(event);
        const orderModel = usePurchaseOrderModel();
        if (!event.context.auth?.username || !canManagePurchaseOrder(Number(event.context.auth.role))) {
            throw new InventoryHttpError(403, 403, "无采购单管理权限");
        }
        if (body?.action && body.action !== "sync-taobao-waybills") {
            throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "操作不正确");
        }
        if (body?.action !== "sync-taobao-waybills" && !canEditPurchaseOrder(Number(event.context.auth.role))) {
            throw new InventoryHttpError(403, 403, "无采购单编辑权限");
        }
        let updated;
        if (body?.action === "sync-taobao-waybills") {
            updated = await orderModel.syncTaobaoWaybills(id, actor);
        } else if (body?.creationSource === "purchase-request") {
            updated = await orderModel.updateFromPurchaseRequest(id, body, actor);
        } else {
            updated = await orderModel.update(id, body || {}, actor);
        }
        await syncPurchaseOrderWaybills(updated, actor);

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                id: toText(updated?._id),
                detail: toPurchaseOrderResponse(updated),
            },
        };
    } catch (err: any) {
        logger.error("Update purchase order error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
