import { getProductionOverview } from "~~/server/services/productionOverview";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    const query = getQuery(event);
    try {
        const data = await getProductionOverview({
            page: Number(query.page || 1),
            limit: Number(query.limit || 10),
            keyword: String(query.keyword || ""),
            status: String(query.status || "全部"),
            salesOrderId: String(query.salesOrderId || ""),
            candidateOnly: String(query.candidateOnly || "") === "true",
        });
        return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data };
    } catch (error: any) {
        if (error?.message === "INVALID_SALES_ORDER_ID") {
            setResponseStatus(event, 400);
            return { code: CODE.INVALID_PARAMS, msg: "销售订单 ID 不合法" };
        }
        if (error?.message === "INVALID_STATUS") {
            setResponseStatus(event, 400);
            return { code: CODE.INVALID_PARAMS, msg: "订单状态筛选值不合法" };
        }
        logger.error("Retrieve production order overview error", error);
        setResponseStatus(event, 500);
        return { code: CODE.SERVER_ERROR, msg: codeToMsg[CODE.SERVER_ERROR] };
    }
});
