import { useSalesOrderReceiptModel } from "~~/server/models/salesOrderReceipt.model";
import {
    getSalesOrderAccess,
    getSalesOrderActor,
} from "~~/server/services/salesOrderAccess";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const access = await getSalesOrderAccess(event.context.auth);
        if (!access.canAuditSalesReceipt) {
            setResponseStatus(event, 403);
            return {
                code: 403,
                msg: "仅回款单审核人可审核回款单",
                data: null,
            };
        }

        const body = await readBody(event);
        const id = String(body?.id || body?._id || "");
        const updated = await useSalesOrderReceiptModel().approve(id, getSalesOrderActor(event));

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                detail: updated,
            },
        };
    } catch (err: any) {
        logger.error("Audit sales order receipt error", err);
        setResponseStatus(event, 400);
        return {
            code: CODE.SERVER_ERROR,
            msg: err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
