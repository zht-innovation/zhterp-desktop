import type mongoose from "mongoose";
import { usePurchaseRequestModel } from "~~/server/models/purchaseRequest.model";
import { usePurchaseMaterialRequirementModel } from "~~/server/models/purchaseMaterialRequirement.model";

type PurchaseRequestApprovalInput = {
    purchaseRequestId: string;
    actor: string;
    session: mongoose.ClientSession;
};

const updatePurchaseRequestStatus = async (
    input: PurchaseRequestApprovalInput,
    status: "approved" | "rejected" | "cancelled" | "draft",
) => {
    const request = await usePurchaseRequestModel().updateStatus(
        input.purchaseRequestId,
        status,
        input.actor,
        input.session,
    );
    if (!request) throw new Error("采购申请状态已变化，请刷新后重试");
    return request;
};

const cleanupPurchaseRequestAddedRequirements = async (
    input: PurchaseRequestApprovalInput,
    status: "rejected" | "draft",
) => {
    const request = await updatePurchaseRequestStatus(input, status);
    await usePurchaseMaterialRequirementModel().deletePurchaseRequestAddedRequirements(
        request._id.toString(),
        input.session,
    );
    return request;
};

export const finalizePurchaseRequestApproval = async (input: PurchaseRequestApprovalInput) => {
    const request = await updatePurchaseRequestStatus(input, "approved");
    await usePurchaseMaterialRequirementModel().releaseToPoolByRequest(
        request._id.toString(),
        input.actor,
        input.session,
    );
    return request;
};

export const rejectPurchaseRequestApproval = (input: PurchaseRequestApprovalInput) =>
    cleanupPurchaseRequestAddedRequirements(input, "rejected");

export const cancelPurchaseRequestApproval = (input: PurchaseRequestApprovalInput) =>
    cleanupPurchaseRequestAddedRequirements(input, "draft");
