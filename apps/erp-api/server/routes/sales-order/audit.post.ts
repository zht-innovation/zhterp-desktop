import mongoose from "mongoose";
import { useApprovalInstanceModel } from "~~/server/models/approvalInstance.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import {
    getSalesOrderAccess,
    getSalesOrderActor,
} from "~~/server/services/salesOrderAccess";
import { approveInstance } from "~~/server/services/approvalLifecycle";
import {
    finalizeSalesOrderApproval,
    notifySalesOrderFinalApproval,
} from "~~/server/services/salesOrderFinalApproval";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const id = String(body?.id || body?._id || "").trim();
        if (!mongoose.Types.ObjectId.isValid(id)) {
            throw new Error("缺少有效订单ID");
        }

        const access = await getSalesOrderAccess(event.context.auth);
        const actorId = access.adminId;
        if (!actorId) throw new Error("当前登录用户不存在");

        const actor = getSalesOrderActor(event);
        const orderModel = useSalesOrderModel();
        const session = await mongoose.startSession();
        let updated: any = null;
        let finalized = false;
        let sourceApprovalId = "";
        try {
            await session.withTransaction(async () => {
                const instance = await useApprovalInstanceModel()
                    .findPendingByBusinessId(
                        "sales-order",
                        new mongoose.Types.ObjectId(id),
                        session,
                    );
                if (!instance) throw new Error("当前订单没有待审批实例");

                const context = await approveInstance({
                    instanceId: instance._id,
                    actorId,
                    actorRole: access.role,
                    session,
                    onFinalApproved: async (approvalContext) => {
                        updated = await finalizeSalesOrderApproval({
                            salesOrderId: approvalContext.instance.businessId.toString(),
                            actor,
                            session: approvalContext.session,
                        });
                    },
                });
                finalized = context.event === "approved";
                sourceApprovalId = context.instance._id.toString();
                if (!updated) {
                    updated = await orderModel.findActiveById(id, session);
                }
            });
        } finally {
            await session.endSession();
        }
        if (finalized) {
            try {
                await notifySalesOrderFinalApproval(updated, sourceApprovalId);
            } catch (notificationError) {
                logger.error(
                    "Notify sales order final approval error",
                    notificationError,
                );
            }
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
        logger.error("Audit sales order error", err);
        setResponseStatus(event, 400);
        return {
            code: CODE.SERVER_ERROR,
            msg: err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
