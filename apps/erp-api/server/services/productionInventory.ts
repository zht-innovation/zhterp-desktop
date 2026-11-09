import mongoose from "mongoose";
import { INVENTORY_ORDER_STATUS } from "~~/shared/enums";
import { InventoryInbound } from "~~/server/models/inventoryInbound.model";
import { InventoryOutbound } from "~~/server/models/inventoryOutbound.model";
import { useInventoryStockModel, type InventoryStockApplyItem } from "~~/server/models/inventoryStock.model";
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { isValidObjectId, throwInventoryError, toObjectId, toText } from "~~/server/services/inventory";
import { normalizeStockQuantity } from "~~/server/services/inventoryStockMath";
import { CODE } from "~~/server/utils/code";

export interface ProductionInventoryLine {
    productId: string;
    quantity: number;
    warehouseId: string;
    locationId: string;
    lockedQuantity: number;
    productionOrderId: string;
    requisitionId?: string;
    completionId?: string;
    rootProductId: string;
}

export interface ProductionInventoryInput {
    sourceKey: string;
    relatedNo: string;
    salesOrderId?: string;
    date: string;
    person: string;
    remark: string;
    lines: ProductionInventoryLine[];
}

// 仅供生产执行事务调用，不经过通用单据创建入口，也不在此重复处理订单预占。
export const postProductionInventoryDocument = async (
    kind: "issue" | "return" | "receipt",
    input: ProductionInventoryInput,
    actor: string,
    session: mongoose.ClientSession,
): Promise<{ id: string; documentNo: string }> => {
    if (!session?.inTransaction()) throw new Error("生产库存过账必须在事务中执行");
    if (!input.sourceKey || !input.lines?.length) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "生产库存来源或明细不能为空");
    }
    const dateCheck = new Date(`${input.date}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(dateCheck.getTime()) || dateCheck.toISOString().slice(0, 10) !== input.date) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "库存日期不合法");
    }
    const changedAt = dateCheck;
    const stock = useInventoryStockModel();
    const items: any[] = [];
    const applyItems: InventoryStockApplyItem[] = [];
    for (const line of input.lines) {
        if (!isValidObjectId(line.productionOrderId) || !isValidObjectId(line.rootProductId)
            || !isValidObjectId(line.warehouseId) || !isValidObjectId(line.locationId)
            || (line.requisitionId && !isValidObjectId(line.requisitionId))
            || (line.completionId && !isValidObjectId(line.completionId))) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "生产单、仓库或库位不合法");
        }
        const quantity = normalizeStockQuantity(line.quantity);
        const lockedQuantity = normalizeStockQuantity(line.lockedQuantity);
        if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(lockedQuantity)
            || lockedQuantity < 0 || lockedQuantity > quantity) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "库存数量或锁定数量不合法");
        }
        const applyItem: InventoryStockApplyItem = {
            productId: line.productId,
            quantity,
            lockedQuantity,
            warehouseId: line.warehouseId,
            locationId: line.locationId,
        };
        const snapshot = kind === "issue"
            ? await stock.buildOutboundItemSnapshot(applyItem, session)
            : await stock.buildInboundItemSnapshot(applyItem, session);
        // 禁止产品默认库位回退改变上游已分配的实际仓位。
        if (toText(snapshot.warehouseId) !== line.warehouseId || toText(snapshot.locationId) !== line.locationId) {
            throwInventoryError(409, CODE.INVALID_PARAMS, "实际仓库或库位与生产分配不一致");
        }
        items.push({
            ...snapshot,
            lockedQuantity,
            productionOrderId: toObjectId(line.productionOrderId),
            requisitionId: toObjectId(line.requisitionId),
            completionId: toObjectId(line.completionId),
            rootProductId: toObjectId(line.rootProductId),
        });
        applyItems.push(applyItem);
    }
    const productionOrderIds = [...new Set(input.lines.map((line) => line.productionOrderId))];
    const productionOrders = await ProductionOrder.find({ _id: { $in: productionOrderIds.map(toObjectId) } })
        .select("documentNo owner").session(session).lean() as any[];
    if (productionOrders.length !== productionOrderIds.length) {
        throwInventoryError(409, CODE.INVENTORY_NOT_FOUND, "关联生产单不存在");
    }
    const salesOrder = input.salesOrderId
        ? await useSalesOrderModel().order.findById(input.salesOrderId).select("orderNo").session(session).lean() as any
        : null;
    const uniqueReference = (field: "productionOrderId" | "requisitionId" | "completionId" | "rootProductId") => {
        const ids = [...new Set(input.lines.map((line) => line[field]).filter(Boolean))];
        return ids.length === 1 ? toObjectId(ids[0]) : null;
    };
    const dateKey = input.date.replace(/-/g, "");
    const outgoing = kind === "issue";
    const serial = await useInventoryCounterModel().nextNumber(`inventory:${outgoing ? "outbound" : "inbound"}:${dateKey}`, session);
    const documentNo = `${outgoing ? "CK" : "RK"}-${dateKey}-${String(serial).padStart(2, "0")}`;
    const type = outgoing ? "生产领料" : kind === "return" ? "退料" : "生产";
    const document: Record<string, any> = {
        type,
        relatedNo: toText(input.relatedNo),
        totalQuantity: normalizeStockQuantity(items.reduce((sum, item) => sum + item.quantity, 0)),
        handler: toText(input.person) || actor,
        status: INVENTORY_ORDER_STATUS.COMPLETED,
        stockApplied: true,
        salesOrderId: toObjectId(input.salesOrderId),
        salesOrderNo: toText(salesOrder?.orderNo),
        sourceType: "production-execution",
        sourceKey: input.sourceKey,
        productionOrderId: uniqueReference("productionOrderId"),
        requisitionId: uniqueReference("requisitionId"),
        completionId: uniqueReference("completionId"),
        rootProductId: uniqueReference("rootProductId"),
        remark: toText(input.remark),
        items,
        createdBy: actor,
        updatedBy: actor,
    };
    if (outgoing) {
        document.outboundNo = documentNo;
        document.outboundDate = changedAt;
        document.contractOrderNo = toText(salesOrder?.orderNo);
    } else {
        document.inboundNo = documentNo;
        document.inboundDate = changedAt;
        document.processingOrderNo = productionOrders.map((order) => order.documentNo).join("、");
        document.productionOwner = [...new Set(productionOrders.map((order) => order.owner))].join("、");
    }
    const documents = outgoing
        ? await InventoryOutbound.create([document], { session })
        : await InventoryInbound.create([document], { session });
    const id = documents[0]._id.toString();
    const source = {
        sourceType: outgoing ? "outbound" : "inbound",
        sourceId: id,
        sourceNo: documentNo,
        businessType: outgoing ? "生产领料出库" : `${type}入库`,
        changedAt,
        operator: toText(input.person) || actor,
        remark: toText(input.remark),
    };
    if (outgoing) await stock.applyOutbound(applyItems, source, actor, session);
    else await stock.applyInbound(applyItems, source, actor, session);
    return { id, documentNo };
};
