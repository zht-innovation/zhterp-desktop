import { useAdminModel } from "~~/server/models/admin.model";
import {
    useBorrowApprovalFlowConfigModel,
    isBorrowRequestError,
} from "~~/server/models/borrowRequest.model";
import { logger } from "~~/server/utils/logger";
import { CODE, codeToMsg } from "~~/server/utils/code";
import { canSubmitBorrowRequest } from "~~/shared/utils/adminPermission";

export default defineEventHandler(async (event) => {
    try {
        const username = String(event.context?.auth?.username || "").trim();
        const admin = username
            ? await useAdminModel().findAdminByUsername(username)
            : null;
        if (!admin || !canSubmitBorrowRequest(Number(admin.role))) {
            setResponseStatus(event, admin ? 403 : 401);
            return {
                code: admin ? 403 : 401,
                msg: admin ? "无借用申请提交权限" : "权限不足",
                data: null,
            };
        }

        const flow = await useBorrowApprovalFlowConfigModel().resolveFlow(Number(admin.role));
        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: flow,
        };
    } catch (err: any) {
        if (isBorrowRequestError(err)) {
            setResponseStatus(event, err.status);
            return { code: err.code, msg: err.message, data: null };
        }

        logger.error("Preview borrow approval flow error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
            data: null,
        };
    }
});
