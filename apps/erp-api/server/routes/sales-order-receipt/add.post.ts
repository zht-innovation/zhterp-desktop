import mongoose from "mongoose";
import { useSalesOrderReceiptModel } from "~~/server/models/salesOrderReceipt.model";
import {
    getSalesOrderAccess,
    getSalesOrderActor,
} from "~~/server/services/salesOrderAccess";
import { createApprovalInstance } from "~~/server/services/approvalInstance";
import { readSalesOrderReceiptPayload } from "~~/server/services/salesOrderReceiptPayload";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readSalesOrderReceiptPayload(event);
        const access = await getSalesOrderAccess(event.context.auth);
        const applicantId = access.adminId;
        if (!applicantId) throw new Error("当前登录用户不存在");

        const actor = getSalesOrderActor(event);
        const receiptModel = useSalesOrderReceiptModel();
        const session = await mongoose.startSession();
        let result: any;
        try {
            await session.withTransaction(async () => {
                result = await receiptModel.create(
                    body || {},
                    access,
                    actor,
                    session,
                );
                await createApprovalInstance({
                    type: "receipt",
                    businessId: result.receipt._id,
                    businessSnapshot: {
                        customerName: result.receipt.customerName,
                        receivedAmountBefore: result.receivedAmountBefore,
                    },
                    applicantId,
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
            data: {
                id: result.receipt._id?.toString?.(),
                detail: result.receipt,
                order: result.order,
                receivedAmount: result.receivedAmount,
                receivableAmount: result.receivableAmount,
                paymentProgress: result.paymentProgress,
            },
        };
    } catch (err: any) {
        logger.error("Create sales order receipt error", err);
        setResponseStatus(event, 400);
        return {
            code: CODE.SERVER_ERROR,
            msg: err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
