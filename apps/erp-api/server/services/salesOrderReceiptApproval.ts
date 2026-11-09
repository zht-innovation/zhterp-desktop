import mongoose from "mongoose";
import {
    useSalesOrderReceiptModel,
    type SalesOrderReceiptStatus,
} from "~~/server/models/salesOrderReceipt.model";

type SalesOrderReceiptApprovalInput = {
    receiptId: string;
    actor: string;
    session: mongoose.ClientSession;
};

const requireTransaction = (session: mongoose.ClientSession) => {
    if (!session?.inTransaction()) {
        throw new Error("回款审批业务处理必须在 MongoDB transaction 中执行");
    }
};

const updateReceiptStatus = async (
    input: SalesOrderReceiptApprovalInput,
    status: Exclude<SalesOrderReceiptStatus, "待审核">,
) => {
    requireTransaction(input.session);
    return await useSalesOrderReceiptModel().updateStatus(
        input.receiptId,
        status,
        input.actor,
        input.session,
    );
};

export const finalizeSalesOrderReceiptApproval = async (
    input: SalesOrderReceiptApprovalInput,
) => await useSalesOrderReceiptModel().approveAndIncrement(
    input.receiptId,
    input.actor,
    input.session,
);

export const rejectSalesOrderReceiptApproval = async (
    input: SalesOrderReceiptApprovalInput,
) => await updateReceiptStatus(input, "已驳回");

export const cancelSalesOrderReceiptApproval = async (
    input: SalesOrderReceiptApprovalInput,
) => await updateReceiptStatus(input, "已撤销");
