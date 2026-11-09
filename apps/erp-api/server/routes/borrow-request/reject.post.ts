import { useBorrowRequestModel, isBorrowRequestError } from "~~/server/models/borrowRequest.model";
import { logger } from "~~/server/utils/logger";
import { CODE, codeToMsg } from "~~/server/utils/code";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const id = String(body?.id || body?._id || "");
        const reason = String(body?.reason || "");
        const detail = await useBorrowRequestModel().reject(id, reason, event.context?.auth);

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: { detail },
        };
    } catch (err: any) {
        if (isBorrowRequestError(err)) {
            setResponseStatus(event, err.status);
            return { code: err.code, msg: err.message, data: null };
        }

        logger.error("Reject borrow request error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
            data: null,
        };
    }
});
