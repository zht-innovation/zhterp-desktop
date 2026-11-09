import mongoose from "mongoose";
import type { ExecutionOrder, ProductionPublicMaterials } from "~~/shared/types/production-execution";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import { InventoryWarehouse, InventoryLocation } from "~~/server/models/inventoryBase.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { buildExecutionOrders, executionId as id, executionMaterials } from "./productionExecutionView";
import { hasSalesOrderCompletionRelease } from "./salesOrderCompletionState";
import { normalizeStockQuantity as qty } from "./inventoryStockMath";
import { throwInventoryError, toObjectId, toText } from "./inventory";
import { CODE } from "~~/server/utils/code";

const fail = (status: number, message: string): never => throwInventoryError(status, CODE.INVALID_PARAMS, message);
const withSession = (query: any, session?: mongoose.ClientSession) => session ? query.session(session) : query;

export interface ProductionPublicMaterialSource {
    _id: any;
    productId: any;
    warehouseId: any;
    locationId: any;
    quantity: number;
    lockedQuantity?: number;
    available: number;
}

export const assertProductionPublicMaterialOrder = (order: any, detail: ExecutionOrder) => {
    if (order.sourceType !== "order" || !mongoose.isValidObjectId(order.salesOrderId)
        || !mongoose.isValidObjectId(order.rootProductId)) fail(409, "仅来源订单明确的订单生产单可以额外分配物料。");
    if (!detail.executable) fail(409, detail.blockReason || "生产单已完成，不能继续分配物料。");
};

export const assertProductionPublicMaterialSalesOrder = (order: any, salesOrder: any) => {
    if (!salesOrder || salesOrder._isDeleted || id(salesOrder._id) !== id(order.salesOrderId)
        || !["待采购", "待生产", "生产中", "待出库"].includes(salesOrder.status)
        || hasSalesOrderCompletionRelease(salesOrder)) fail(409, "来源销售订单状态已变化，不能继续分配物料。");
    if (!(salesOrder.products || []).some((product: any) => id(product.productId) === id(order.rootProductId))) {
        fail(409, "生产单的来源订单产品归属已变化，请刷新后重试。");
    }
};

// 只读取已入库且未锁定的合格库存；订单原有分配已包含在 lockedQuantity 中。
export const loadProductionPublicMaterialSources = async (productIds: string[], session?: mongoose.ClientSession) => {
    const sources = new Map<string, ProductionPublicMaterialSource[]>();
    const materialIds = [...new Set(productIds)].filter((productId) => mongoose.isValidObjectId(productId));
    if (!materialIds.length) return sources;
    const products = await withSession(InventoryProduct.find({
        _id: { $in: materialIds.map(toObjectId) }, _isDeleted: { $ne: true },
    }).select("_id").lean(), session) as any[];
    if (!products.length) return sources;
    const warehouses = await withSession(InventoryWarehouse.find({
        _isDeleted: { $ne: true }, includeInAvailable: true,
    }).select("_id").lean(), session) as any[];
    if (!warehouses.length) return sources;
    const locations = await withSession(InventoryLocation.find({
        warehouseId: { $in: warehouses.map((warehouse) => warehouse._id) }, _isDeleted: { $ne: true },
    }).select("_id warehouseId parentId").lean(), session) as any[];
    const parentIds = new Set(locations.map((location) => id(location.parentId)).filter(Boolean));
    const leafLocations = locations.filter((location) => !parentIds.has(id(location._id)));
    if (!leafLocations.length) return sources;
    const locationMap = new Map(leafLocations.map((location) => [id(location._id), location]));
    const stocks = await withSession(InventoryStock.find({
        productId: { $in: products.map((product) => product._id) },
        warehouseId: { $in: warehouses.map((warehouse) => warehouse._id) },
        locationId: { $in: leafLocations.map((location) => location._id) },
        _isDeleted: { $ne: true },
    }).select("productId warehouseId locationId quantity lockedQuantity").sort({ createTime: 1, _id: 1 }).lean(), session) as any[];
    for (const stock of stocks) {
        if (id(locationMap.get(id(stock.locationId))?.warehouseId) !== id(stock.warehouseId)) continue;
        const quantity = Number(stock.quantity || 0);
        const locked = Number(stock.lockedQuantity || 0);
        if (!Number.isFinite(quantity) || !Number.isFinite(locked) || locked < 0) continue;
        const available = qty(Math.max(0, quantity - locked));
        if (available <= 0) continue;
        const productId = id(stock.productId);
        if (!sources.has(productId)) sources.set(productId, []);
        sources.get(productId)!.push({ ...stock, available });
    }
    return sources;
};

export const retrieveProductionPublicMaterials = async (orderId: unknown): Promise<ProductionPublicMaterials> => {
    if (!mongoose.isValidObjectId(orderId)) fail(400, "生产单 ID 不合法。");
    const order = await ProductionOrder.findById(orderId).lean() as any;
    if (!order) fail(404, "生产单不存在。");
    const [detail] = await buildExecutionOrders([order]);
    assertProductionPublicMaterialOrder(order, detail);
    const salesOrder = await useSalesOrderModel().order.findOne({
        _id: order.salesOrderId, _isDeleted: { $ne: true },
    }).select("products status productionCompletion").lean();
    assertProductionPublicMaterialSalesOrder(order, salesOrder);
    const materials = executionMaterials(order);
    const sources = await loadProductionPublicMaterialSources(materials.map((material) => material.productId));
    const relatedProductionOrderCount = await ProductionOrder.countDocuments({
        salesOrderId: order.salesOrderId, status: { $ne: "已取消" },
    });
    const result: ProductionPublicMaterials = {
        orderId: id(order._id), version: order.version, documentNo: toText(order.documentNo),
        salesOrderNo: toText(order.salesOrderNo), productName: toText(order.productName), productCode: toText(order.productCode),
        relatedProductionOrderCount, materials: [],
    };
    for (const material of materials) {
        const publicAvailableQty = qty((sources.get(material.productId) || []).reduce((sum, source) => sum + source.available, 0));
        result.materials.push({
            productId: material.productId, code: toText(material.code), name: toText(material.name),
            unit: toText(material.unit) || "个", publicAvailableQty,
        });
    }
    return result;
};
