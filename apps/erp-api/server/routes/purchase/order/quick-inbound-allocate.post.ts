import { getInventoryActor, InventoryHttpError, toText } from "~~/server/services/inventory";
import { usePurchaseOrderModel } from "~~/server/models/purchaseOrder.model";
import { usePurchaseOrderAllocationModel } from "~~/server/models/purchaseOrderAllocation.model";
import { CODE } from "~~/server/utils/code";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const orderNo = toText(body?.orderNo);
        const items = Array.isArray(body?.items) ? body.items : [];
        const actor = getInventoryActor(event);

        if (!orderNo) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "缺少采购单号");
        }
        if (!items.length) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "缺少入库产品明细");
        }

        const order = await usePurchaseOrderModel().order
            .findOne({ orderNo, _isDeleted: { $ne: true } })
            .select("_id orderNo")
            .lean();
        if (!order) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "采购单不存在");
        }

        const inboundItems = items.map((item: any) => ({
            productId: item.productId,
            lockedQuantity: Number(item.quantity || 0),
        }));

        await usePurchaseOrderAllocationModel().markInboundLocked(
            orderNo,
            inboundItems,
            actor,
        );

        setResponseStatus(event, 200);
        return {
            code: 200,
            msg: "ok",
            data: { count: items.length },
        };
    } catch (err: any) {
        logger.error("Quick inbound allocate error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
