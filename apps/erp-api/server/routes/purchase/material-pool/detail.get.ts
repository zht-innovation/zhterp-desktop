import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { getPurchaseMaterialPoolDetail } from "~~/server/services/purchaseMaterialPool";
import { getPurchaseVisibilityScope } from "~~/server/services/purchaseVisibility";
import { logger } from "~~/server/utils/logger";
import { canViewPurchasePrice } from "~~/shared/utils/adminPermission";
import { omitPurchaseMaterialPoolPrices } from "~~/server/utils/purchasePriceVisibility";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const scope = await getPurchaseVisibilityScope(event.context.auth);
        const result = await getPurchaseMaterialPoolDetail(toText(query.productId || query.id), { scope });

        if (result) {
            delete (result as any).suggestedSupplier;
            delete (result as any).suggestedSupplierId;
            (result as any).purchaseHistory?.forEach((history: any) => delete history.supplierName);
            if (!canViewPurchasePrice(Number(event.context.auth?.role))) {
                omitPurchaseMaterialPoolPrices(result);
            }
        }
        setHeader(event, "Cache-Control", "private, no-store");
        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        logger.error("Retrieve purchase material pool detail error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
