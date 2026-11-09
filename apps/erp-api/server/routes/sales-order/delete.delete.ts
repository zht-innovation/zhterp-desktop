import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import {
    getSalesOrderAccess,
    getSalesOrderActor,
} from "~~/server/services/salesOrderAccess";
import mongoose from "mongoose";
import { cleanupSalesOrderDeletion } from "~~/server/services/salesOrderDeletion";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const body = await readBody(event).catch(() => ({}));
        const ids = Array.isArray(body?.ids)
            ? body.ids
            : String(body?.id || query.id || "")
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean);

        const access = await getSalesOrderAccess(event.context.auth);
        const session = await mongoose.startSession();
        let data: any;
        try {
            await session.withTransaction(async () => {
                await useSalesOrderModel().softDeleteWithAccess(ids, access, getSalesOrderActor(event), session);
                data = await cleanupSalesOrderDeletion(ids, getSalesOrderActor(event), session);
            });
        } finally {
            await session.endSession();
        }

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data,
        };
    } catch (err: any) {
        logger.error("Delete sales order error", err);
        setResponseStatus(event, 400);
        return {
            code: CODE.SERVER_ERROR,
            msg: err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
