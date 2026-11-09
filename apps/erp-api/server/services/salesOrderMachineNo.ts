import type mongoose from "mongoose";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";

// 仅在持有来源销售订单写锁的生产单下达或编辑事务内调用。
export const syncSalesOrderMachineNo = async (
    salesOrderId: mongoose.Types.ObjectId,
    session: mongoose.ClientSession,
    options: { allowEmpty?: boolean } = {},
) => {
    const orders = await ProductionOrder.find({
        sourceType: "order",
        salesOrderId,
        status: { $nin: ["草稿", "已取消"] },
        $expr: { $eq: ["$productId", "$rootProductId"] },
    }).select("machineNumbers").sort({ createTime: 1, _id: 1 }).session(session).lean();

    const machineNumbers: string[] = [];
    const seen = new Set<string>();
    for (const order of orders) {
        for (const value of order.machineNumbers || []) {
            const machineNo = String(value || "").trim();
            const key = machineNo.toUpperCase();
            if (!machineNo || seen.has(key)) continue;
            seen.add(key);
            machineNumbers.push(machineNo);
        }
    }
    if (!machineNumbers.length && !options.allowEmpty) return;

    const result = await useSalesOrderModel().order.updateOne(
        { _id: salesOrderId, _isDeleted: { $ne: true } },
        { $set: { machineNo: machineNumbers.join("\n") } },
        { session, runValidators: true },
    );
    if (result.matchedCount !== 1) throw new Error("销售订单不存在，机器号回填失败");
};
