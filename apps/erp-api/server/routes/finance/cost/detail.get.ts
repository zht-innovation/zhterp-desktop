import { FinanceHttpError, toText } from "~~/server/services/finance";
import { useFinanceCostModel } from "~~/server/models/financeCost.model";
import { CODE, codeToMsg } from "~~/server/utils/code";
import { logger } from "~~/server/utils/logger";
import { getStandardPriceSyncSettings } from "~~/server/services/financeStandardPriceSync";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        if (query.action === "standard-price-sync-settings") {
            const settings = await getStandardPriceSyncSettings();
            setHeader(event, "Cache-Control", "private, no-store");
            setResponseStatus(event, 200);
            return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: settings };
        }
        const productId = toText(query.productId);
        if (!productId) {
            setResponseStatus(event, 400);
            return { code: CODE.INVALID_PARAMS, msg: "缺少 productId 参数" };
        }

        const tree = await useFinanceCostModel().getCostDetail(productId);
        setResponseStatus(event, 200);
        return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: { tree } };
    } catch (err: any) {
        logger.error("Get finance cost detail error", err);
        const knownError = err instanceof FinanceHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
