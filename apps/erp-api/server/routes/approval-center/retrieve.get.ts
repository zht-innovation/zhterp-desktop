import {
    ApprovalCenterError,
    getApprovalCenterErrorStatus,
    retrieveApprovalDetail,
    retrieveApprovalInventoryReviewLocks,
    retrieveApprovalKitAnalysis,
    retrieveApprovals,
} from "~~/server/services/approvalCenter";
import {
    assertPurchaseRequestDetailAccess,
    retrievePurchaseRequests,
} from "~~/server/services/purchaseRequest";
import { CODE, codeToMsg } from "~~/server/utils/code";
import { logger } from "~~/server/utils/logger";
import { isElectronicsWarehouseKeeper } from "~~/shared/utils/adminPermission";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const resource = Array.isArray(query.resource) ? query.resource[0] : query.resource;
        const id = Array.isArray(query.id) ? query.id[0] : query.id;
        if (
            isElectronicsWarehouseKeeper(Number(event.context.auth?.role))
            && !["purchase-request", "purchase-request-detail", "inventory-review-locks", "kit-analysis"].includes(String(resource || ""))
        ) {
            throw new ApprovalCenterError(403, "电子部库管仅可查询采购申请资源");
        }
        let data;
        if (resource === "inventory-review-locks") {
            setHeader(event, "Cache-Control", "private, no-store");
            data = { details: await retrieveApprovalInventoryReviewLocks(event.context.auth, id, query.productId) };
        } else if (resource === "kit-analysis") {
            data = { analysis: await retrieveApprovalKitAnalysis(event.context.auth, id) };
        } else if (resource === "purchase-request-detail") {
            await assertPurchaseRequestDetailAccess(event.context.auth, id);
            data = { detail: await retrieveApprovalDetail(event.context.auth, id) };
            setHeader(event, "Cache-Control", "private, no-store");
        } else if (resource === "purchase-request") {
            data = await retrievePurchaseRequests(
                event.context.auth,
                query as Record<string, unknown>,
            );
        } else if (id) {
            data = { detail: await retrieveApprovalDetail(event.context.auth, id) };
        } else {
            data = await retrieveApprovals(event.context.auth, query as Record<string, unknown>);
        }

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data,
        };
    } catch (error: any) {
        logger.error("Retrieve approval center error", error);
        const status = getApprovalCenterErrorStatus(error) || 500;
        setResponseStatus(event, status);
        return {
            code: status,
            msg: error?.message || codeToMsg[CODE.SERVER_ERROR],
            data: null,
        };
    }
});
