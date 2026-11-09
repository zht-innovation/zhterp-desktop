import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryBom } from "~~/server/models/inventoryBom.model";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import { InventoryWarehouse } from "~~/server/models/inventoryBase.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import type { SalesOrderProductSnapshot } from "~~/shared/types/approval";
import type { OrderKitAnalysisResult, OrderKitAnalysisRow } from "~~/shared/types/orderKitAnalysis";
import { CODE } from "~~/server/utils/code";
import { InventoryHttpError, isValidObjectId, toObjectId, toText } from "./inventory";
import { normalizeStockQuantity as qty } from "./inventoryStockMath";
import { resolveProductionReservationOrigins } from "./productionMaterialPool";

type KitProduct = {
    id: string;
    code: string;
    name: string;
    model: string;
    image: string;
    unitName: string;
};

type KitBomItem = { productId: string; quantity: number; unitName: string };
type KitStock = { publicQuantity: number; ownQuantities: Map<string, number> };
const id = (value: any) => toText(value?.toString?.() || value);
const positionKey = (row: any) => `${id(row.warehouseId)}:${id(row.locationId)}`;
const invalid = (message: string): never => {
    throw new InventoryHttpError(400, CODE.INVALID_PARAMS, message);
};
const positiveQuantity = (value: unknown, message: string) => {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) invalid(message);
    const normalized = qty(number);
    if (normalized <= 0) invalid(message);
    return normalized;
};

export const analyzeOrderKit = async (
    salesOrderId: string,
    products: SalesOrderProductSnapshot[],
): Promise<OrderKitAnalysisResult> => {
    if (!isValidObjectId(salesOrderId)) invalid("销售订单 ID 不合法，无法进行齐套分析");
    if (!Array.isArray(products) || !products.length) invalid("审批快照中没有可分析的产品");
    const productCache = new Map<string, KitProduct>();
    const codeCache = new Map<string, KitProduct>();
    const bomCache = new Map<string, KitBomItem[]>();
    const stockCache = new Map<string, KitStock>();

    const readProduct = async (productId: string, productCode = ""): Promise<KitProduct> => {
        if (productId && !isValidObjectId(productId)) invalid("产品资料关联不合法，无法完成齐套分析");
        const cached = productId ? productCache.get(productId) : codeCache.get(productCode);
        if (cached) return cached;
        if (!productId && !productCode) invalid("审批快照中的产品缺少编号或关联 ID");
        const filter = productId ? { _id: toObjectId(productId) } : { code: productCode };
        const matches = await InventoryProduct.find({ ...filter, _isDeleted: { $ne: true } })
            .select("code name model image unitName").limit(2).lean() as any[];
        if (matches.length !== 1) invalid("产品资料缺失、已删除或编号不唯一，无法完成齐套分析");
        const row = matches[0];
        const product: KitProduct = {
            id: id(row._id), code: toText(row.code), name: toText(row.name), model: toText(row.model),
            image: toText(row.image), unitName: toText(row.unitName),
        };
        productCache.set(product.id, product);
        if (productCode) codeCache.set(productCode, product);
        return product;
    };

    const readBom = async (productId: string): Promise<KitBomItem[]> => {
        const cached = bomCache.get(productId);
        if (cached) return cached;
        const bom = await InventoryBom.findOne({
            productId: toObjectId(productId), isEnabled: true, _isDeleted: { $ne: true },
        }).select("items").lean() as any;
        const items: KitBomItem[] = [];
        const sorted = Array.isArray(bom?.items) ? [...bom.items].sort((left, right) => Number(left.sort || 0) - Number(right.sort || 0)) : [];
        for (const item of sorted) {
            const childId = id(item.productId);
            if (!isValidObjectId(childId)) invalid("BOM 中存在无效的物料关联，请先维护资料");
            const quantity = Number(item.quantity);
            if (!Number.isFinite(quantity) || quantity <= 0) invalid("BOM 物料用量必须是有效正数");
            items.push({
                productId: childId,
                quantity,
                unitName: toText(item.unitName),
            });
        }
        bomCache.set(productId, items);
        return items;
    };

    const demandProducts = new Map<string, { product: KitProduct; quantity: number }>();
    for (const snapshot of products) {
        if (!snapshot || typeof snapshot !== "object") invalid("审批快照中存在无效产品行");
        const quantity = positiveQuantity(snapshot.quantity, "审批快照中的销售数量必须是有效正数");
        const product = await readProduct(id(snapshot.productId), toText(snapshot.productCode));
        const existing = demandProducts.get(product.id);
        if (existing) {
            existing.quantity = positiveQuantity(existing.quantity + quantity, "合计销售数量超出有效范围");
        } else {
            demandProducts.set(product.id, { product, quantity });
        }
    }

    const validateBom = async (productId: string, path: Set<string>, depth: number): Promise<void> => {
        if (depth > 20) invalid("BOM 超过 20 层，无法完成齐套分析");
        if (path.has(productId)) invalid("BOM 存在循环引用，无法完成齐套分析");
        await readProduct(productId);
        const nextPath = new Set(path);
        nextPath.add(productId);
        for (const item of await readBom(productId)) {
            await validateBom(item.productId, nextPath, depth + 1);
        }
    };
    for (const productId of demandProducts.keys()) await validateBom(productId, new Set(), 1);

    const [warehouses, rawReservations] = await Promise.all([
        InventoryWarehouse.find({ _isDeleted: { $ne: true }, includeInAvailable: { $ne: false } }).select("_id").lean() as Promise<any[]>,
        SalesOrderStockReservation.find({
            salesOrderId: toObjectId(salesOrderId), status: "active",
            reservationType: { $in: ["finished-product", "production-material"] },
        }).select("salesOrderId demandProductId stockProductId warehouseId locationId reservationType sourceAllocationId reservedQuantity consumedQuantity releasedQuantity")
            .sort({ createTime: 1, _id: 1 }).lean() as Promise<any[]>,
    ]);
    const warehouseIds = warehouses.map((row) => row._id);
    const reservations = await resolveProductionReservationOrigins(rawReservations);
    const reservationsByProduct = new Map<string, any[]>();
    for (const reservation of reservations) {
        const productId = id(reservation.stockProductId);
        const rows = reservationsByProduct.get(productId) || [];
        rows.push(reservation);
        reservationsByProduct.set(productId, rows);
    }

    const readStock = async (productId: string): Promise<KitStock> => {
        const cached = stockCache.get(productId);
        if (cached) return cached;
        const rows = warehouseIds.length ? await InventoryStock.find({
            productId: toObjectId(productId), warehouseId: { $in: warehouseIds }, _isDeleted: { $ne: true },
        }).select("warehouseId locationId quantity lockedQuantity").lean() as any[] : [];
        const stock: KitStock = { publicQuantity: 0, ownQuantities: new Map() };
        const lockedByPosition = new Map<string, number>();
        for (const row of rows) {
            const quantity = Math.max(0, qty(row.quantity));
            const locked = Math.max(0, qty(row.lockedQuantity));
            stock.publicQuantity = qty(stock.publicQuantity + Math.max(0, quantity - locked));
            const key = positionKey(row);
            lockedByPosition.set(key, qty((lockedByPosition.get(key) || 0) + Math.min(quantity, locked)));
        }
        for (const reservation of reservationsByProduct.get(productId) || []) {
            const rootProductId = id(reservation.demandProductId);
            if (!demandProducts.has(rootProductId)) continue;
            const key = positionKey(reservation);
            const locked = lockedByPosition.get(key) || 0;
            const remaining = qty(Math.max(0, qty(reservation.reservedQuantity)
                - qty(reservation.consumedQuantity) - qty(reservation.releasedQuantity)));
            const available = Math.min(remaining, locked);
            if (available <= 0) continue;
            stock.ownQuantities.set(rootProductId, qty((stock.ownQuantities.get(rootProductId) || 0) + available));
            lockedByPosition.set(key, qty(locked - available));
        }
        stockCache.set(productId, stock);
        return stock;
    };

    const createRow = async (
        productId: string,
        demandQuantity: number,
        rootProductId: string,
        key: string,
        parentKey: string,
        level: number,
        unitName = "",
    ): Promise<OrderKitAnalysisRow> => {
        const product = await readProduct(productId);
        const stock = await readStock(productId);
        const ownQuantity = stock.ownQuantities.get(rootProductId) || 0;
        const availableQuantity = qty(stock.publicQuantity + ownQuantity);
        const ownUsed = Math.min(ownQuantity, demandQuantity);
        const publicUsed = Math.min(stock.publicQuantity, qty(demandQuantity - ownUsed));
        stock.ownQuantities.set(rootProductId, qty(ownQuantity - ownUsed));
        stock.publicQuantity = qty(stock.publicQuantity - publicUsed);
        const shortageQuantity = qty(availableQuantity - demandQuantity);
        const items = await readBom(productId);
        const children: OrderKitAnalysisRow[] = [];
        if (shortageQuantity < 0) {
            for (let index = 0; index < items.length; index += 1) {
                const item = items[index]!;
                const expandedDemand = -shortageQuantity * item.quantity;
                if (!Number.isFinite(expandedDemand) || expandedDemand <= 0) invalid("BOM 展开需求数量超出有效范围");
                const demand = qty(expandedDemand);
                // 与库存保持三位精度，归一为零的子需求不生成明细。
                if (demand <= 0) continue;
                children.push(await createRow(item.productId, demand, rootProductId, `${key}/${index}`, key, level + 1, item.unitName));
            }
        }
        return {
            key, parentKey, level, productId: product.id, productCode: product.code, productName: product.name,
            model: product.model, image: product.image, demandQuantity, unitName: unitName || product.unitName,
            availableQuantity, shortageQuantity, status: shortageQuantity < 0 ? "缺货" : "正常",
            suggestion: shortageQuantity >= 0 ? "--" : items.length ? "需要车间组装" : "需要采购", children,
        };
    };

    const rows: OrderKitAnalysisRow[] = [];
    let index = 0;
    for (const [productId, demand] of demandProducts) {
        rows.push(await createRow(productId, demand.quantity, productId, `analysis/${index}`, "analysis", 1));
        index += 1;
    }
    return { rows, analyzedAt: new Date().toISOString() };
};
