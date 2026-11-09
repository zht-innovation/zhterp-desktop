import mongoose from "mongoose";
import { useAdminModel } from "~~/server/models/admin.model";
import { useBorrowRequestModel, isBorrowRequestError } from "~~/server/models/borrowRequest.model";
import { createApprovalInstance } from "~~/server/services/approvalInstance";
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
            setResponseStatus(event, 403);
            return { code: 403, msg: "无借用申请提交权限", data: null };
        }

        const body = await readBody(event);
        const model = useBorrowRequestModel();
        const session = await mongoose.startSession();
        let detail: any;
        try {
            await session.withTransaction(async () => {
                detail = await model.create(body, event.context?.auth, session);
                await createApprovalInstance({
                    type: "borrow",
                    businessId: detail._id,
                    businessSnapshot: null,
                    applicantId: detail.applicantId,
                    session,
                });
            });
        } finally {
            await session.endSession();
        }

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

        logger.error("Add borrow request error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
            data: null,
        };
    }
});
