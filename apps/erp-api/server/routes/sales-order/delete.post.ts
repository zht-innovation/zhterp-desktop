import mongoose from "mongoose";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { getSalesOrderAccess, getSalesOrderActor, isSalesOrderSuperAdmin } from "~~/server/services/salesOrderAccess";
import { previewSalesOrderPurge, purgeSalesOrders } from "~~/server/services/salesOrderPurge";
import { restoreSalesOrderDeletion } from "~~/server/services/salesOrderDeletion";
import { logger } from "~~/server/utils/logger";

// Restore uses the existing /sales-order/delete permission mapping so the
// authentication middleware remains unchanged.
export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event).catch(() => ({}));
        const ids = Array.isArray(body?.ids) ? body.ids : [String(body?.id || "")];
        if (!event.context.auth) throw new Error("未登录");
        const access = await getSalesOrderAccess(event.context.auth);
        if (body?.action === "purge-preview") {
            if (!isSalesOrderSuperAdmin(access.role)) throw new Error("仅超级管理员可以彻底删除订单");
            setResponseStatus(event, 200);
            return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: await previewSalesOrderPurge(ids) };
        }
        if (body?.action === "purge") {
            if (!isSalesOrderSuperAdmin(access.role)) throw new Error("仅超级管理员可以彻底删除订单");
            setResponseStatus(event, 200);
            return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: await purgeSalesOrders(ids, { id: access.adminId || "", name: getSalesOrderActor(event) }) };
        }
        if (!body?.restore) throw new Error("无效操作");
        const session = await mongoose.startSession();
        let data: any;
        try {
            await session.withTransaction(async () => {
                data = await useSalesOrderModel().restoreWithAccess(ids, access, getSalesOrderActor(event), session);
                await restoreSalesOrderDeletion(ids, session);
            });
        } finally {
            await session.endSession();
        }
        setResponseStatus(event, 200);
        return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data };
    } catch (err: any) {
        logger.error("Restore sales order error", err);
        setResponseStatus(event, 400);
        return { code: CODE.SERVER_ERROR, msg: err?.message || codeToMsg[CODE.SERVER_ERROR] };
    }
});
