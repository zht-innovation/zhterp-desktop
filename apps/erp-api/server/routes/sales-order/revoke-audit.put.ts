import mongoose from "mongoose";
import { useApprovalInstanceModel } from "~~/server/models/approvalInstance.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { cancelInstance } from "~~/server/services/approvalLifecycle";
import {
    getSalesOrderAccess,
    getSalesOrderActor,
} from "~~/server/services/salesOrderAccess";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event).catch(() => ({}));
        const id = String(body?.id || body?._id || "").trim();
        const access = await getSalesOrderAccess(event.context.auth);
        const actor = getSalesOrderActor(event);
        const orderModel = useSalesOrderModel();
        let updated: any = null;
        const applicantId = access.adminId;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error("缺少有效订单ID");
        }
        if (!applicantId) {
            throw new Error("当前登录用户不存在");
        }

        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const instance = await useApprovalInstanceModel()
                    .findPendingByBusinessId(
                        "sales-order",
                        new mongoose.Types.ObjectId(id),
                        session,
                    );
                if (!instance) throw new Error("当前订单没有待审批实例");

                await cancelInstance({
                    instanceId: instance._id,
                    actorId: applicantId,
                    session,
                    onCancelled: async (context) => {
                        updated = await orderModel.updateStatus(
                            context.instance.businessId.toString(),
                            "草稿",
                            actor,
                            context.session,
                        );
                    },
                });
            });
        } finally {
            await session.endSession();
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
        logger.error("Revoke sales order audit error", err);
        setResponseStatus(event, 400);
        return {
            code: CODE.SERVER_ERROR,
            msg: err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
