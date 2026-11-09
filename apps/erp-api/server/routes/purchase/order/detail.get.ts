import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { usePurchaseOrderModel } from "~~/server/models/purchaseOrder.model";
import { logger } from "~~/server/utils/logger";
import { canManagePurchaseOrder, canViewPurchasePrice } from "~~/shared/utils/adminPermission";
import { getPurchaseVisibilityScope } from "~~/server/services/purchaseVisibility";
import { omitPurchaseOrderPrices } from "~~/server/utils/purchasePriceVisibility";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const scope = await getPurchaseVisibilityScope(event.context.auth);
        const result: any = await usePurchaseOrderModel().detail({
            id: toText(query.id || query._id),
            orderNo: toText(query.orderNo),
        }, scope);
        const role = Number(event.context.auth?.role);
        if (
            !canViewPurchasePrice(role)
            || (result?.creationSource === "purchase-request" && !canManagePurchaseOrder(role))
        ) {
            omitPurchaseOrderPrices(result);
        }

        setHeader(event, "Cache-Control", "private, no-store");
        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        logger.error("Retrieve purchase order detail error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
