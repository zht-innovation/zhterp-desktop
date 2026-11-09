import { useSalesOrderReceiptModel } from "~~/server/models/salesOrderReceipt.model";
import {
    getSalesOrderAccess,
    toSalesOrderText,
} from "~~/server/services/salesOrderAccess";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const access = await getSalesOrderAccess(event.context.auth);
        if (!access.canAuditSalesReceipt) {
            setResponseStatus(event, 403);
            return {
                code: 403,
                msg: "仅回款单审核人可查看回款单表",
                data: null,
            };
        }

        const query = getQuery(event);
        const result = await useSalesOrderReceiptModel().retrieve({
            keyword: toSalesOrderText(query.keyword),
            status: toSalesOrderText(query.status),
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
        logger.error("Retrieve sales order receipt list error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
