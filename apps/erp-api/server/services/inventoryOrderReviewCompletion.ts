import type mongoose from "mongoose";
import type { InventoryReviewDemandLine, InventoryReviewMaterial, InventoryReviewOrder, InventoryReviewResult } from "~~/shared/types/inventoryReview";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import { InventoryWarehouse } from "~~/server/models/inventoryBase.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { usePurchaseMaterialRequirementModel } from "~~/server/models/purchaseMaterialRequirement.model";
import { reconcileInventoryReviewStock } from "./inventoryOrderReviewStock";
import { reserveInventoryForSalesOrder } from "./salesOrderInventoryReservation";
import { refreshSalesOrderFulfillmentStatus } from "./salesOrderFulfillment";
import { InventoryHttpError, toObjectId, toText } from "./inventory";
import { normalizeStockQuantity } from "./inventoryStockMath";

export async function completeInventoryOrderReview(
    snapshot: InventoryReviewOrder,
    order: any,
    actor: string,
    session: mongoose.ClientSession,
): Promise<InventoryReviewResult> {
    if (!session?.inTransaction()) throw new InventoryHttpError(400, 400, "完成仓库复核必须使用事务");
    const now = new Date();
    // 事务提交前外部不可见；后续任一步失败，完成标记、库存、预占和缺口全部回滚。
    await useSalesOrderModel().order.updateOne({ _id: order._id, _isDeleted: { $ne: true } }, {
        $set: { inventoryReviewCompletedAt: now, status: "待生产", updatedBy: actor },
    }, { session });
    await reconcileInventoryReviewStock(snapshot, actor, session);
    const currentOrder = await useSalesOrderModel().order.findOne({ _id: order._id, _isDeleted: { $ne: true } }).session(session).lean();
    if (!currentOrder) throw new InventoryHttpError(409, 409, "订单状态已变化");
    const reservation = await reserveInventoryForSalesOrder(currentOrder, actor, session, { allowReleasedHistory: true });
    await usePurchaseMaterialRequirementModel().refreshForSalesOrder({
        salesOrderId: snapshot.id,
        requirements: reservation.requirements,
    }, actor, { session });
    await refreshSalesOrderFulfillmentStatus(snapshot.id, actor, { session });

    const items = new Map<string, any>();
    function collectMaterials(materials: InventoryReviewMaterial[]) {
        for (const material of materials) {
            items.set(material.productId || material.id, material);
            collectMaterials(material.children || []);
        }
    }
    for (const product of snapshot.products) {
        if (product.productId) items.set(product.productId, product);
        const bom = product.boms.find((item) => item.id === product.activeBomId);
        collectMaterials(bom?.materials || []);
    }
    const demandMap = new Map<string, { quantity: number; types: Set<string> }>();
    for (const demand of reservation.demands) {
        const item = demandMap.get(demand.productId) || { quantity: 0, types: new Set<string>() };
        item.quantity = normalizeStockQuantity(item.quantity + demand.requiredQuantity);
        item.types.add(demand.demandType);
        demandMap.set(demand.productId, item);
    }
    const productIds = [...demandMap.keys()];
    const stocks: any[] = await InventoryStock.find({ productId: { $in: productIds.map(toObjectId) }, _isDeleted: { $ne: true } })
        .select("productId warehouseId locationId quantity lockedQuantity").session(session).lean();
    const warehouses: any[] = await InventoryWarehouse.find({ _isDeleted: { $ne: true } })
        .select("_id includeInAvailable").session(session).lean();
    const availableWarehouses = new Set(warehouses.filter((warehouse) => warehouse.includeInAvailable !== false).map((warehouse) => String(warehouse._id)));
    const reservations: any[] = await SalesOrderStockReservation.find({ salesOrderId: order._id, status: "active" })
        .select("stockProductId reservedQuantity consumedQuantity releasedQuantity").session(session).lean();
    const lines: InventoryReviewDemandLine[] = [];
    for (const [productId, demand] of demandMap) {
        const item = items.get(productId);
        if (!item) throw new InventoryHttpError(409, 409, "生产物料已变化，请重新核对 BOM");
        let actualQuantity = 0;
        let availableQuantity = 0;
        let lockedQuantity = 0;
        let reservedQuantity = 0;
        for (const stock of stocks) {
            if (String(stock.productId) !== productId) continue;
            actualQuantity += Number(stock.quantity || 0);
            lockedQuantity += Number(stock.lockedQuantity || 0);
            if (!stock.warehouseId || availableWarehouses.has(String(stock.warehouseId))) {
                availableQuantity += Math.max(Number(stock.quantity || 0) - Number(stock.lockedQuantity || 0), 0);
            }
        }
        for (const row of reservations) {
            if (String(row.stockProductId) !== productId) continue;
            reservedQuantity += Math.max(Number(row.reservedQuantity || 0) - Number(row.consumedQuantity || 0) - Number(row.releasedQuantity || 0), 0);
        }
        const demandType = demand.types.size === 1 ? [...demand.types][0] as InventoryReviewDemandLine["demandType"] : undefined;
        lines.push({
            productId, productCode: item.productCode, model: item.model, unit: item.unit,
            requiredQuantity: demand.quantity,
            actualQuantity: normalizeStockQuantity(actualQuantity),
            availableQuantity: normalizeStockQuantity(availableQuantity),
            lockedQuantity: normalizeStockQuantity(lockedQuantity),
            reservedQuantity: normalizeStockQuantity(reservedQuantity),
            shortageQuantity: normalizeStockQuantity(Math.max(demand.quantity - reservedQuantity, 0)),
            differenceReason: toText(item.differenceReason),
            remark: toText(item.remark),
            demandType,
        });
    }
    const result: InventoryReviewResult = { route: reservation.requirements.length ? "purchase" : "production", lines };
    await useSalesOrderModel().order.updateOne({ _id: order._id, _isDeleted: { $ne: true } }, {
        $set: { inventoryReviewResult: result },
    }, { session });
    return result;
}
