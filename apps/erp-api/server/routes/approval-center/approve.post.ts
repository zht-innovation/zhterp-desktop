import {
    ApprovalCenterError,
    approveApproval,
    confirmOrderPayment,
    getApprovalCenterErrorStatus,
} from "~~/server/services/approvalCenter";
import { CODE, codeToMsg } from "~~/server/utils/code";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        if (body?.action !== undefined && !["approve", "confirm-payment"].includes(body.action)) {
            throw new ApprovalCenterError(400, "审批操作不合法");
        }
        const detail = body?.action === "confirm-payment"
            ? await confirmOrderPayment(event.context.auth, body?.id)
            : await approveApproval(event.context.auth, body?.id);

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: { detail },
        };
    } catch (error: any) {
        logger.error("Approve approval center instance error", error);
        const status = getApprovalCenterErrorStatus(error) || 500;
        setResponseStatus(event, status);
        return {
            code: status,
            msg: error?.message || codeToMsg[CODE.SERVER_ERROR],
            data: null,
        };
    }
});
