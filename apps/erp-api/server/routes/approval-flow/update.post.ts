import {
    ApprovalFlowInputError,
    updateApprovalFlow,
} from "~~/server/services/approvalFlow";
import { CODE, codeToMsg } from "~~/server/utils/code";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const config = await updateApprovalFlow(await readBody(event));

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: { config },
        };
    } catch (error: any) {
        if (error instanceof ApprovalFlowInputError) {
            setResponseStatus(event, 400);
            return {
                code: 400,
                msg: error.message,
                data: null,
            };
        }

        logger.error("Update approval flow error", error);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
            data: null,
        };
    }
});
