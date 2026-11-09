import { retrieveApprovalFlows } from "~~/server/services/approvalFlow";
import { CODE, codeToMsg } from "~~/server/utils/code";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const configs = await retrieveApprovalFlows();

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: { configs },
        };
    } catch (error: any) {
        logger.error("Retrieve approval flows error", error);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
            data: null,
        };
    }
});
