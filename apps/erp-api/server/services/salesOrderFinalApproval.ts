import mongoose from "mongoose";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { isValidObjectId, toText } from "~~/server/services/inventory";
import {
    notifyProcurementAfterApproval,
    notifyWarehouseAfterApproval,
} from "~~/server/services/notification";

type SalesOrderFinalApprovalInput = {
    salesOrderId: string;
    actor: string;
    session: mongoose.ClientSession;
};

export const finalizeSalesOrderApproval = async ({
    salesOrderId,
    actor,
    session,
}: SalesOrderFinalApprovalInput) => {
    const orderId = toText(salesOrderId);
    if (!isValidObjectId(orderId)) {
        throw new Error("缺少有效订单ID");
    }
    if (!session?.inTransaction()) {
        throw new Error("销售订单终审必须在 MongoDB transaction 中执行");
    }

    const salesOrderModel = useSalesOrderModel();
    const salesOrder = await salesOrderModel.findActiveById(orderId, session) as any;
    if (!salesOrder) {
        throw new Error("订单不存在");
    }
    if (toText(salesOrder.status) !== "待审核") {
        throw new Error("当前订单已完成终审，不能重复执行");
    }

    // 终审仅转入仓库复核；实际库存校正、订单预占和生产/采购分流在复核完成时执行。
    const updated = await salesOrderModel.order.findOneAndUpdate(
        { _id: salesOrder._id, status: "待审核", _isDeleted: { $ne: true } },
        { $set: {
            status: "待仓库复核",
            inventoryReviewRequiredAt: new Date(),
            inventoryReviewCompletedAt: null,
            inventoryReviewResult: null,
            updatedBy: actor,
        } },
        { new: true, session, runValidators: true },
    );
    if (!updated) {
        throw new Error("订单状态已变化，请刷新后重新审批");
    }
    return updated;
};

export const notifySalesOrderFinalApproval = async (
    salesOrder: any,
    sourceApprovalId: string,
) => {
    await Promise.all([
        notifyProcurementAfterApproval(salesOrder),
        notifyWarehouseAfterApproval(salesOrder, sourceApprovalId),
    ]);
};
