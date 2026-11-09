import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { usePurchaseMaterialRequirementModel } from "~~/server/models/purchaseMaterialRequirement.model";
import { usePurchaseRequestOrderAllocationModel } from "~~/server/models/purchaseRequestOrderAllocation.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const result = toText(query.source) === "purchase-request"
            ? await usePurchaseRequestOrderAllocationModel().candidates({
                productId: toText(query.productId),
                purchaseOrderId: toText(query.purchaseOrderId),
                keyword: toText(query.keyword),
                page: Number(query.page || 1),
                limit: Number(query.limit || 20),
            })
            : await usePurchaseMaterialRequirementModel().salesCandidates({
            productId: toText(query.productId),
            keyword: toText(query.keyword),
            orderType: toText(query.orderType),
            page: Number(query.page || 1),
            limit: Number(query.limit || 20),
            });

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        logger.error("Retrieve purchase order sales candidates error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
