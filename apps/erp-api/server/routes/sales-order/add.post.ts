import mongoose from "mongoose";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import {
    getSalesOrderAccess,
    getSalesOrderActor,
    isSalesOrderSuperAdmin,
} from "~~/server/services/salesOrderAccess";
import { createApprovalInstance } from "~~/server/services/approvalInstance";
import { readSalesOrderPayload } from "~~/server/services/salesOrderPayload";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readSalesOrderPayload(event);
        if (!body) {
            setResponseStatus(event, 400);
            return {
                code: CODE.INVALID_PARAMS,
                msg: codeToMsg[CODE.INVALID_PARAMS],
            };
        }

        const access = await getSalesOrderAccess(event.context.auth);
        if (!isSalesOrderSuperAdmin(access.role)) {
            if (!access.salespersonId) {
                setResponseStatus(event, 403);
                return {
                    code: 403,
                    msg: "权限不足",
                };
            }
            body.salespersonId = access.salespersonId;
        }

        const isDraft = String(body?.status || "").trim() === "草稿";
        const orderModel = useSalesOrderModel();
        const actor = getSalesOrderActor(event);
        let created: any;
        if (isDraft) {
            created = await orderModel.create(body || {}, actor);
        } else {
            const applicantId = access.adminId;
            if (!applicantId) {
                throw new Error("当前登录用户不存在");
            }

            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    created = await orderModel.create(body || {}, actor, session);
                    await createApprovalInstance({
                        type: "sales-order",
                        businessId: created._id,
                        businessSnapshot: created.toObject(),
                        applicantId,
                        session,
                    });
                });
            } finally {
                await session.endSession();
            }
        }

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                id: created._id?.toString?.(),
                detail: created,
            },
        };
    } catch (err: any) {
        logger.error("Create sales order error", err);
        setResponseStatus(event, 400);
        return {
            code: CODE.SERVER_ERROR,
            msg: err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
