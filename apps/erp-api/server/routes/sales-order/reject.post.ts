import mongoose from "mongoose";
import { useApprovalInstanceModel } from "~~/server/models/approvalInstance.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import {
    getSalesOrderAccess,
    getSalesOrderActor,
} from "~~/server/services/salesOrderAccess";
import { rejectInstance } from "~~/server/services/approvalLifecycle";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const id = String(body?.id || body?._id || "").trim();
        const reason = String(body?.reason || body?.rejectionReason || "").trim();
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error("缺少有效订单ID");
        }
        if (!reason) throw new Error("请填写驳回原因");

        const access = await getSalesOrderAccess(event.context.auth);
        const actorId = access.adminId;
        if (!actorId) throw new Error("当前登录用户不存在");

        const actor = getSalesOrderActor(event);
        const orderModel = useSalesOrderModel();
        const session = await mongoose.startSession();
        let updated: any = null;
        try {
            await session.withTransaction(async () => {
                const instance = await useApprovalInstanceModel()
                    .findPendingByBusinessId(
                        "sales-order",
                        new mongoose.Types.ObjectId(id),
                        session,
                    );
                if (!instance) throw new Error("当前订单没有待审批实例");

                await rejectInstance({
                    instanceId: instance._id,
                    actorId,
                    rejectReason: reason,
                    session,
                    onRejected: async (context) => {
                        updated = await orderModel.updateStatus(
                            context.instance.businessId.toString(),
                            "已驳回",
                            actor,
                            context.session,
                            {
                                expectedStatus: "待审核",
                                rejectionReason: reason,
                                rejectionInstanceId: context.instance._id,
                            },
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
        logger.error("Reject sales order error", err);
        setResponseStatus(event, 400);
        return {
            code: CODE.SERVER_ERROR,
            msg: err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
