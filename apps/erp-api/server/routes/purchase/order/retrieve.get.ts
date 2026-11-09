import { InventoryHttpError, toBoolean, toText } from "~~/server/services/inventory";
import { usePurchaseOrderModel } from "~~/server/models/purchaseOrder.model";
import { logger } from "~~/server/utils/logger";
import { canManagePurchaseOrder, canViewPurchasePrice } from "~~/shared/utils/adminPermission";
import { getPurchaseVisibilityScope } from "~~/server/services/purchaseVisibility";
import { omitPurchaseOrderPrices } from "~~/server/utils/purchasePriceVisibility";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const scope = await getPurchaseVisibilityScope(event.context.auth);
        const result = await usePurchaseOrderModel().retrieve({
            scope,
            orderNo: toText(query.orderNo),
            keyword: toText(query.keyword),
            supplierId: toText(query.supplierId),
            supplierName: toText(query.supplierName),
            productId: toText(query.productId),
            status: toText(query.status),
            trackingNo: toText(query.trackingNo),
            startDate: toText(query.startDate),
            endDate: toText(query.endDate),
            includeDeleted: toBoolean(query.includeDeleted, false),
            page: Number(query.page || 1),
            limit: Number(query.limit || 20),
        });

        const role = Number(event.context.auth?.role);
        const canViewPrice = canViewPurchasePrice(role);
        const canViewGeneratedAmount = canManagePurchaseOrder(role);
        result.list.forEach((item: any) => {
            delete item.supplierName;
            delete item.supplierCode;
            if (!canViewPrice || (item.creationSource === "purchase-request" && !canViewGeneratedAmount)) {
                omitPurchaseOrderPrices(item);
            }
        });
        setHeader(event, "Cache-Control", "private, no-store");
        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        logger.error("Retrieve purchase order list error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
