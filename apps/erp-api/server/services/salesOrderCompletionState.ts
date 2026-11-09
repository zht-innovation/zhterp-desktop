import mongoose from "mongoose";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { CODE } from "~~/server/utils/code";
import { throwInventoryError, toObjectId, toText } from "./inventory";
import { hasSalesOrderCompletionRelease, salesOrderCompletionInitialization } from "./salesOrderCompletionStateMath";
import { isSalesOrderWaitingInventoryReview } from "./salesOrderInventoryReviewGate";

export { hasSalesOrderCompletionRelease } from "./salesOrderCompletionStateMath";

// 使用原始文档识别缺失标记，避免 Mongoose 默认值把历史订单误认为新订单。
export const ensureSalesOrderCompletionState = async (
    input: any,
    session?: mongoose.ClientSession,
    options: { readOnly?: boolean } = {},
): Promise<any> => {
    const orderId = toText(input?._id || input?.id);
    if (!mongoose.isValidObjectId(orderId)) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "销售订单 ID 格式错误");
    }
    const collection = useSalesOrderModel().order.collection;
    const order = await collection.findOne({ _id: toObjectId(orderId), _isDeleted: { $ne: true } }, { session });
    if (!order) throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "销售订单不存在");
    if (order.productionCompletionInitialized === true) return order;

    const production = await ProductionOrder.collection.findOne({ salesOrderId: order._id, $or: [
        { status: { $nin: ["草稿", "已取消"] } },
        { releaseIdempotencyKey: { $type: "string", $ne: "" } },
        { releaseRequestId: { $type: "string", $ne: "" } },
    ] }, { session });
    const inbound = await mongoose.connection.collection("inventoryinbounds").findOne({
        salesOrderId: order._id, type: "生产", stockApplied: true, _isDeleted: { $ne: true },
    }, { session });
    const shipment = await SalesOrderStockReservation.collection.findOne({
        salesOrderId: order._id, reservationType: "finished-product", consumedQuantity: { $gt: 0 },
    }, { session });
    const issued = await mongoose.connection.collection("productionrequisitions").findOne({
        salesOrderId: order._id, "lines.allocations.issued": { $gt: 0 },
    }, { session });
    const completed = await mongoose.connection.collection("productioncompletions").findOne({
        salesOrderId: order._id, quantity: { $gt: 0 },
    }, { session });
    const outbound = await mongoose.connection.collection("inventoryoutbounds").findOne({
        type: "订单", stockApplied: true, _isDeleted: { $ne: true },
        $or: [{ salesOrderId: order._id }, ...(order.orderNo ? [{ contractOrderNo: order.orderNo }] : [])],
    }, { session });
    const fields = salesOrderCompletionInitialization(order, Boolean(production || inbound || issued || completed), Boolean(shipment || outbound));
    if (options.readOnly) return { ...order, ...fields };
    const changed = await collection.updateOne({ _id: order._id, productionCompletionInitialized: { $ne: true } }, { $set: fields }, { session });
    if (changed.matchedCount === 1) return { ...order, ...fields };
    const current = await collection.findOne({ _id: order._id, _isDeleted: { $ne: true } }, { session });
    if (!current) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "销售订单状态已变化，请刷新。");
    return current;
};

type ProductionLockOptions = { requireCompletion?: boolean; version?: number; allowPendingApproval?: boolean };

export const lockSalesOrderForProduction = async (
    salesOrderId: string,
    actor: string,
    session: mongoose.ClientSession,
    options: ProductionLockOptions = {},
): Promise<any> => {
    const order = await ensureSalesOrderCompletionState({ _id: salesOrderId }, session);
    if (isSalesOrderWaitingInventoryReview(order)) {
        throwInventoryError(409, CODE.INVENTORY_REFERENCED, "订单尚未完成仓库复核，不能进行生产或采购操作。");
    }
    if (hasSalesOrderCompletionRelease(order)) {
        throwInventoryError(409, CODE.INVENTORY_REFERENCED, "订单已放行出库，不能继续生产、采购分配或重新锁定生产物料。");
    }
    const statuses = ["待采购", "待生产", "生产中", "待出库"];
    if (options.allowPendingApproval) statuses.push("待审核");
    if (!statuses.includes(order.status)) {
        throwInventoryError(409, CODE.INVENTORY_REFERENCED, "销售订单状态已变化，不能继续此操作。");
    }
    if (options.version !== undefined && (!Number.isInteger(options.version) || options.version !== Number(order.productionPlanVersion || 0))) {
        throwInventoryError(409, CODE.INVENTORY_REFERENCED, "订单版本已变化，请刷新后重试。");
    }
    const fields: Record<string, any> = { updatedBy: actor };
    if (options.requireCompletion) fields.productionCompletionRequired = true;
    const result = await useSalesOrderModel().order.findOneAndUpdate({
        _id: order._id,
        _isDeleted: { $ne: true },
        status: order.status,
        productionCompletion: null,
        productionPlanVersion: order.productionPlanVersion === undefined ? { $exists: false } : order.productionPlanVersion,
    }, { $set: fields, $inc: { productionPlanVersion: 1 } }, { new: true, session }).lean();
    if (!result) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "订单已被其他操作更新，请刷新后重试。");
    return result;
};

export const assertSalesOrderProductionReversalAllowed = async (salesOrderId: string, session?: mongoose.ClientSession) => {
    const order = await ensureSalesOrderCompletionState({ _id: salesOrderId }, session);
    if (hasSalesOrderCompletionRelease(order)) {
        throwInventoryError(409, CODE.INVENTORY_REFERENCED, "订单已确认完工或历史放行，不能直接冲销支撑该订单的入库及生产记录。");
    }
    return order;
};

export const initializeSalesOrderCompletionState = async () => {
    const orders = useSalesOrderModel().order.collection.find({
        productionCompletionInitialized: { $ne: true }, _isDeleted: { $ne: true },
    }, { projection: { _id: 1 } });
    for await (const order of orders) await ensureSalesOrderCompletionState(order);
};
