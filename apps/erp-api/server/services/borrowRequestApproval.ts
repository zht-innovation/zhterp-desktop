import mongoose from "mongoose";
import { useBorrowRequestModel } from "~~/server/models/borrowRequest.model";

type BorrowRequestApprovalInput = {
    borrowRequestId: string;
    actor: string;
    session: mongoose.ClientSession;
};

const updateBorrowRequestStatus = (
    input: BorrowRequestApprovalInput,
    status: string,
) => useBorrowRequestModel().updateStatus(
    input.borrowRequestId,
    status,
    input.actor,
    input.session,
);

export const finalizeBorrowRequestApproval = (
    input: BorrowRequestApprovalInput,
) => updateBorrowRequestStatus(input, "已通过");

export const rejectBorrowRequestApproval = (
    input: BorrowRequestApprovalInput,
) => updateBorrowRequestStatus(input, "已驳回");

export const cancelBorrowRequestApproval = (
    input: BorrowRequestApprovalInput,
) => updateBorrowRequestStatus(input, "已撤销");
