import {
    deleteApproval,
    getApprovalCenterErrorStatus,
} from "~~/server/services/approvalCenter";
import { CODE, codeToMsg } from "~~/server/utils/code";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const data = await deleteApproval(event.context.auth, body?.id, body?.reason);

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data,
        };
    } catch (error: any) {
        logger.error("Delete approval center instance error", error);
        const status = getApprovalCenterErrorStatus(error) || 500;
        setResponseStatus(event, status);
        return {
            code: status,
            msg: error?.message || codeToMsg[CODE.SERVER_ERROR],
            data: null,
        };
    }
});
