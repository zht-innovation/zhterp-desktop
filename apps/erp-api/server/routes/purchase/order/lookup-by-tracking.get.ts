import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { usePurchaseOrderModel } from "~~/server/models/purchaseOrder.model";
import { logger } from "~~/server/utils/logger";
import { canViewPurchasePrice } from "~~/shared/utils/adminPermission";
import { omitPurchaseOrderPrices } from "~~/server/utils/purchasePriceVisibility";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const trackingNo = toText(query.trackingNo);

        if (!trackingNo) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "trackingNo 不能为空");
        }

        const purchaseOrderModel = usePurchaseOrderModel();
        const order = await purchaseOrderModel.findByTrackingNo(trackingNo);

        if (!order) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "未找到匹配的采购单");
        }
        const inboundDetail = await purchaseOrderModel.inboundDetail({
            orderNo: order.orderNo,
        });

        if (!canViewPurchasePrice(Number(event.context.auth?.role))) {
            omitPurchaseOrderPrices(inboundDetail);
        }
        setHeader(event, "Cache-Control", "private, no-store");
        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: inboundDetail,
        };
    } catch (err: any) {
        logger.error("Lookup purchase order by tracking number error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
