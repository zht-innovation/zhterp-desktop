import { FinanceHttpError, toText } from "~~/server/services/finance";
import { useFinanceCostModel } from "~~/server/models/financeCost.model";
import { CODE, codeToMsg } from "~~/server/utils/code";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const result = await useFinanceCostModel().retrieveMachineCost({
            keyword: toText(query.keyword),
            category: toText(query.category),
            source: toText(query.source),
            page: Number(query.page || 1),
            limit: Number(query.limit || 20),
        });
        setResponseStatus(event, 200);
        return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: result };
    } catch (err: any) {
        logger.error("Retrieve finance machine cost error", err);
        const knownError = err instanceof FinanceHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
