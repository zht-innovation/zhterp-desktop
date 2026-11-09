import { submitPurchaseRequest, PurchaseRequestError } from "~~/server/services/purchaseRequest";
import { CODE, codeToMsg } from "~~/server/utils/code";
import { logger } from "~~/server/utils/logger";
import { getApprovalCenterErrorStatus } from "~~/server/services/approvalCenter";
import { exportSalesOrderProductSn } from "~~/server/services/salesOrderProductSn";
import { isElectronicsWarehouseKeeper } from "~~/shared/utils/adminPermission";

export default defineEventHandler(async (event) => {
    try {
        // 复用现有受保护路径，认证继续由原中间件写入 event.context.auth。
        if (getQuery(event).resource === "product-sn-export") {
            if (isElectronicsWarehouseKeeper(Number(event.context.auth?.role))) {
                throw new PurchaseRequestError(403, "电子部库管无销售订单导出权限");
            }
            const body = await readBody(event);
            const file = await exportSalesOrderProductSn(event.context.auth, body?.id, body?.productIndex);
            setHeader(event, "Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            setHeader(event, "Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
            setHeader(event, "Cache-Control", "private, no-store");
            setResponseStatus(event, 200);
            return file.buffer;
        }
        const data = await submitPurchaseRequest(event);
        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data,
        };
    } catch (error: any) {
        const status = error instanceof PurchaseRequestError ? error.status : getApprovalCenterErrorStatus(error) || 500;
        logger.error("Approval center submission error", error);
        setResponseStatus(event, status);
        return {
            code: status,
            msg: error?.message || codeToMsg[CODE.SERVER_ERROR],
            data: null,
        };
    }
});
