import mongoose from "mongoose";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import {
    getSalesOrderAccess,
    getSalesOrderActor,
} from "~~/server/services/salesOrderAccess";
import { createApprovalInstance } from "~~/server/services/approvalInstance";
import { readSalesOrderPayload } from "~~/server/services/salesOrderPayload";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readSalesOrderPayload(event);
        const id = String(body?.id || body?._id || "");
        const access = await getSalesOrderAccess(event.context.auth);
        const isSubmittingForAudit = String(body?.status || "").trim() === "待审核";
        const orderModel = useSalesOrderModel();
        const actor = getSalesOrderActor(event);
        let updated: any;
        if (isSubmittingForAudit) {
            const applicantId = access.adminId;
            if (!applicantId) {
                throw new Error("当前登录用户不存在");
            }

            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    updated = await orderModel.updateWithAccess(
                        id,
                        body || {},
                        access,
                        actor,
                        session,
                    );
                    await createApprovalInstance({
                        type: "sales-order",
                        businessId: updated._id,
                        businessSnapshot: updated.toObject(),
                        applicantId,
                        session,
                    });
                });
            } finally {
                await session.endSession();
            }
        } else {
            updated = await orderModel.updateWithAccess(
                id,
                body || {},
                access,
                actor,
            );
        }

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                detail: updated,
            },
        };
    } catch (err: any) {
        logger.error("Update sales order error", err);
        setResponseStatus(event, 400);
        return {
            code: CODE.SERVER_ERROR,
            msg: err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
