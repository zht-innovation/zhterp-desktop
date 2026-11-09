import {
    deletePurchaseRequest,
    PurchaseRequestError,
} from "~~/server/services/purchaseRequest";
import { CODE, codeToMsg } from "~~/server/utils/code";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        if (body?.resource !== "purchase-request") {
            throw new PurchaseRequestError(400, "采购申请资源不合法");
        }
        const data = await deletePurchaseRequest(
            event.context.auth,
            body?.id,
            body?.scope,
        );
        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data,
        };
    } catch (error: any) {
        const status = error instanceof PurchaseRequestError ? error.status : 500;
        logger.error("Delete purchase request error", error);
        setResponseStatus(event, status);
        return {
            code: status,
            msg: error?.message || codeToMsg[CODE.SERVER_ERROR],
            data: null,
        };
    }
});
