import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { getSalesOrderAuditorSnapshot } from "~~/server/services/salesOrderAccess";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const auditor = await getSalesOrderAuditorSnapshot(event.context.auth);
        if (!auditor) {
            setResponseStatus(event, 403);
            return {
                code: 403,
                msg: "没有订单审核权限",
            };
        }

        const pendingCount = await useSalesOrderModel().countPendingApprovalForAuditor(auditor.adminId);

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                pendingCount,
            },
        };
    } catch (err: any) {
        logger.error("Retrieve sales order approval stats error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
