import {
    useBorrowApprovalFlowConfigModel,
    isBorrowRequestError,
} from "~~/server/models/borrowRequest.model";
import { logger } from "~~/server/utils/logger";
import { CODE, codeToMsg } from "~~/server/utils/code";

const serializeConfig = (config: any) => ({
    ...config,
    _id: config?._id?.toString?.() || config?._id,
    rules: (config?.rules || []).map((rule: any) => ({
        ...rule,
        _id: rule?._id?.toString?.() || rule?._id,
        approverIds: (rule?.approverIds || []).map((id: any) => id?.toString?.() || id),
    })),
});

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const actor = String(event.context?.auth?.nickname || event.context?.auth?.username || "");
        const config = await useBorrowApprovalFlowConfigModel().updateRules(body?.rules || [], actor);

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                config: serializeConfig(config),
            },
        };
    } catch (err: any) {
        if (isBorrowRequestError(err)) {
            setResponseStatus(event, err.status);
            return { code: err.code, msg: err.message, data: null };
        }

        logger.error("Update borrow approval flow error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
            data: null,
        };
    }
});
