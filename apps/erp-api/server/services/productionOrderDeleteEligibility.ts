import type mongoose from "mongoose";
import { ProductionRequisition, ProductionCompletion, ProductionMaterialLoss, ProductionExecutionOperation } from "~~/server/models/productionExecution.model";
import { PurchaseRequest } from "~~/server/models/purchaseRequest.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { InventoryInbound } from "~~/server/models/inventoryInbound.model";
import { InventoryOutbound } from "~~/server/models/inventoryOutbound.model";

export interface ProductionOrderDeleteState {
    canDelete: boolean;
    deleteBlockReason: string;
}

const text = (value: unknown) => String(value ?? "").trim();

export const getProductionOrderDeleteStates = async (
    rows: any[],
    session?: mongoose.ClientSession,
): Promise<Map<string, ProductionOrderDeleteState>> => {
    const states = new Map<string, ProductionOrderDeleteState>();
    const orderIds: string[] = [];
    const orderIdsByNumber = new Map<string, string[]>();
    for (const row of rows) {
        const orderId = text(row._id || row.id);
        if (!orderId) continue;
        let deleteBlockReason = "";
        if (!["待发料", "待生产"].includes(row.status)) {
            deleteBlockReason = "仅待生产且未产生关联业务的生产单可以删除。";
        } else if (Number(row.completedQty ?? 0) !== 0 || Number(row.receivedQty ?? 0) !== 0) {
            deleteBlockReason = "生产单已有完工或入库数量，不能删除。";
        }
        states.set(orderId, { canDelete: !deleteBlockReason, deleteBlockReason });
        if (deleteBlockReason) continue;
        orderIds.push(orderId);
        for (const value of [row.documentNo, row.productionNo]) {
            const number = text(value);
            if (!number) continue;
            const ids = orderIdsByNumber.get(number) || [];
            if (!ids.includes(orderId)) ids.push(orderId);
            orderIdsByNumber.set(number, ids);
        }
    }
    if (!orderIds.length) return states;

    const block = (orderId: unknown, reason: string) => {
        const state = states.get(text(orderId));
        if (state?.canDelete) {
            state.canDelete = false;
            state.deleteBlockReason = reason;
        }
    };
    const blockReferences = (references: any[], field: string, reason: string) => {
        for (const reference of references) block(reference[field], reason);
    };
    const read = async (query: any): Promise<any[]> => {
        if (session) query.session(session);
        return await query.lean();
    };
    const productionOrderFilter = { productionOrderId: { $in: orderIds } };

    // 每种关联按整页批量读取；同一事务内不能并行执行 Mongoose 查询。
    const requisitions = await read(ProductionRequisition.find(productionOrderFilter).select("productionOrderId"));
    blockReferences(requisitions, "productionOrderId", "生产单已有发料单，不能删除。");
    const completions = await read(ProductionCompletion.find(productionOrderFilter).select("productionOrderId"));
    blockReferences(completions, "productionOrderId", "生产单已有完工记录，不能删除。");
    const losses = await read(ProductionMaterialLoss.find(productionOrderFilter).select("productionOrderId"));
    blockReferences(losses, "productionOrderId", "生产单已有损耗记录，不能删除。");

    const purchaseReferences: Record<string, any>[] = [productionOrderFilter];
    if (orderIdsByNumber.size) purchaseReferences.push({ productionOrderNo: { $in: [...orderIdsByNumber.keys()] } });
    const requests = await read(PurchaseRequest.find({ $or: purchaseReferences }).select("productionOrderId productionOrderNo"));
    for (const request of requests) {
        block(request.productionOrderId, "生产单已有采购申请（含草稿），不能删除。");
        for (const orderId of orderIdsByNumber.get(text(request.productionOrderNo)) || []) {
            block(orderId, "生产单已有采购申请（含草稿），不能删除。");
        }
    }

    const reservations = await read(SalesOrderStockReservation.find({
        sourceProductionOrderId: { $in: orderIds },
    }).select("sourceProductionOrderId"));
    blockReferences(reservations, "sourceProductionOrderId", "生产单已有库存预占关联，不能删除。");

    for (const model of [InventoryInbound, InventoryOutbound]) {
        const documents = await read(model.find({ $or: [
            productionOrderFilter,
            { "items.productionOrderId": { $in: orderIds } },
        ] }).select("productionOrderId items.productionOrderId"));
        for (const document of documents) {
            block(document.productionOrderId, "生产单已有入库或出库单据，不能删除。");
            for (const item of Array.isArray(document.items) ? document.items : []) {
                block(item.productionOrderId, "生产单已有入库或出库单据，不能删除。");
            }
        }
    }

    // 额外分配物料的预占归属订单，生产单关联保存在执行操作结果中。
    const operations = await read(ProductionExecutionOperation.find({
        "result.affectedOrderIds": { $in: orderIds },
    }).select("result.affectedOrderIds"));
    for (const operation of operations) {
        const affectedOrderIds = operation.result?.affectedOrderIds;
        for (const orderId of Array.isArray(affectedOrderIds) ? affectedOrderIds : []) {
            block(orderId, "生产单已有生产执行或物料分配记录，不能删除。");
        }
    }
    return states;
};
