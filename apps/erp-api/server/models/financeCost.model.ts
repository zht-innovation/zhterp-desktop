import mongoose from "mongoose";
import { CODE } from "~~/server/utils/code";
import {
    escapeRegExp,
    FinanceHttpError,
    getPageParams,
    isValidObjectId,
    throwFinanceError,
    toObjectId,
    toText,
} from "~~/server/services/finance";
import { useInventoryProductModel, InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { useInventoryBomModel, InventoryBom } from "~~/server/models/inventoryBom.model";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import { InventoryWarehouse } from "~~/server/models/inventoryBase.model";
import type {
    FinanceAccessoryCostItem,
    FinanceCostTreeNode,
    FinanceMachineCostItem,
} from "~~/shared/types/finance";
import { INVENTORY_PRODUCT_SOURCE } from "~~/shared/enums";

interface CostRetrieveOptions {
    keyword?: string;
    category?: string;
    source?: string;
    page?: number;
    limit?: number;
}

type FinanceStockSummary = {
    availableQuantity: number;
    lockedQuantity: number;
};

class FinanceCostModel {
    // 查询原料资产（source=外采的产品）
    async retrieveAccessoryCost(options: CostRetrieveOptions = {}) {
        const { page, limit, skip } = getPageParams({
            page: options.page,
            limit: options.limit,
        });

        const filter: Record<string, any> = {
            _isDeleted: { $ne: true },
            source: INVENTORY_PRODUCT_SOURCE.PURCHASED,
        };

        if (options.keyword) {
            const regex = new RegExp(escapeRegExp(options.keyword), "i");
            filter.$or = [
                { code: regex },
                { name: regex },
                { model: regex },
            ];
        }

        if (options.category) {
            if (isValidObjectId(options.category)) {
                filter.categoryId = options.category;
            } else {
                const catRegex = new RegExp(escapeRegExp(options.category), "i");
                filter.categoryName = catRegex;
            }
        }

        const [list, total] = await Promise.all([
            InventoryProduct.find(filter)
                .sort({ updateTime: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            InventoryProduct.countDocuments(filter),
        ]);

        // 批量获取库存汇总
        const productIds = list.map((p: any) => p._id.toString());
        const stockMap = await this.getStockSummary(productIds);

        const items: FinanceAccessoryCostItem[] = list.map((p: any) => {
            const stock = stockMap.get(p._id.toString()) || { availableQuantity: 0, lockedQuantity: 0 };
            return {
                _id: p._id.toString(),
                code: p.code || "",
                name: p.name || "",
                model: p.model || "",
                image: p.image || "",
                unitCode: p.unitCode || "",
                unitName: p.unitName || "",
                standardPrice: p.standardPrice || 0,
                averagePrice: p.averagePrice || 0,
                availableQuantity: stock.availableQuantity,
                lockedQuantity: stock.lockedQuantity,
                categoryId: p.categoryId?.toString() || null,
                categoryName: p.categoryName || "",
            };
        });

        return {
            list: items,
            pagination: { page, limit, total, hasMore: skip + list.length < total },
        };
    }

    // 查询整机/组装件标准成本（source=自组装 或 外包组装的产品）
    async retrieveMachineCost(options: CostRetrieveOptions = {}) {
        const { page, limit, skip } = getPageParams({
            page: options.page,
            limit: options.limit,
        });

        const filter: Record<string, any> = {
            _isDeleted: { $ne: true },
            source: {
                $in: [
                    INVENTORY_PRODUCT_SOURCE.SELF_ASSEMBLED,
                    INVENTORY_PRODUCT_SOURCE.OUTSOURCED_ASSEMBLED,
                ],
            },
        };

        if (options.keyword) {
            const regex = new RegExp(escapeRegExp(options.keyword), "i");
            filter.$or = [
                { code: regex },
                { name: regex },
                { model: regex },
            ];
        }

        if (options.category) {
            if (isValidObjectId(options.category)) {
                filter.categoryId = options.category;
            } else {
                const catRegex = new RegExp(escapeRegExp(options.category), "i");
                filter.categoryName = catRegex;
            }
        }

        if (options.source) {
            filter.source = options.source;
        }

        const [list, total] = await Promise.all([
            InventoryProduct.find(filter)
                .sort({ updateTime: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            InventoryProduct.countDocuments(filter),
        ]);

        // 批量获取库存汇总和 BOM 成本
        const productIds = list.map((p: any) => p._id.toString());
        const stockMap = await this.getStockSummary(productIds);

        const items: FinanceMachineCostItem[] = await Promise.all(
            list.map(async (p: any) => {
                const pid = p._id.toString();
                const stock = stockMap.get(pid) || { availableQuantity: 0, lockedQuantity: 0 };
                const bomCost = await this.calculateProductBomCost(pid);
                return {
                    _id: pid,
                    code: p.code || "",
                    name: p.name || "",
                    model: p.model || "",
                    image: p.image || "",
                    source: p.source || "",
                    standardPrice: p.standardPrice || 0,
                    bomCost,
                    availableQuantity: stock.availableQuantity,
                    lockedQuantity: stock.lockedQuantity,
                    unitName: p.unitName || "",
                    categoryId: p.categoryId?.toString() || null,
                    categoryName: p.categoryName || "",
                };
            }),
        );

        return {
            list: items,
            pagination: { page, limit, total, hasMore: skip + list.length < total },
        };
    }

    // 获取产品成本明细（BOM 树形结构 + 成本计算）
    async getCostDetail(productId: string): Promise<FinanceCostTreeNode> {
        if (!isValidObjectId(productId)) {
            throwFinanceError(400, CODE.INVALID_PARAMS, "productId 格式错误");
        }

        const tree = await this.buildCostTree(productId, 1, new Set<string>());
        return tree;
    }

    // 递归构建成本树
    private async buildCostTree(
        productId: string,
        depth: number,
        visited: Set<string>,
    ): Promise<FinanceCostTreeNode> {
        if (visited.has(productId)) {
            return {
                level: depth,
                productId,
                productCode: "",
                productName: "循环引用",
                quantity: 0,
                unitPrice: 0,
                cost: 0,
                children: [],
                circular: true,
            };
        }

        visited.add(productId);

        const product: any = await InventoryProduct.findById(productId).lean();
        const bom: any = await InventoryBom.findOne({
            productId,
            isEnabled: true,
            _isDeleted: { $ne: true },
        }).lean();

        const unitPrice = product?.standardPrice || 0;

        const node: FinanceCostTreeNode = {
            level: depth,
            productId,
            productCode: product?.code || bom?.productCode || "",
            productName: product?.name || bom?.productName || "",
            model: product?.model || bom?.model || "",
            bomId: bom?._id?.toString() || "",
            bomCode: bom?.code || "",
            bomName: bom?.name || "",
            quantity: depth === 1 ? 1 : 0,
            unitName: product?.unitName || "",
            unitPrice,
            cost: 0,
            children: [],
        };

        if (!bom?.items?.length) {
            // 叶子节点：cost = quantity × unitPrice
            node.cost = node.quantity * unitPrice;
            visited.delete(productId);
            return node;
        }

        // 递归计算子项
        const sortedItems = (bom.items as any[])
            .sort((a: any, b: any) => Number(a.sort || 0) - Number(b.sort || 0));

        const children: FinanceCostTreeNode[] = [];
        for (const item of sortedItems) {
            const childId = item.productId?.toString?.() || "";
            if (!childId) continue;

            const child = await this.buildCostTree(childId, depth + 1, visited);
            // 覆盖子节点的 quantity 和 lossRate（来自 BOM item）
            child.quantity = item.quantity || 0;
            child.lossRate = item.lossRate || 0;
            child.unitName = item.unitName || child.unitName;
            // 成本 = 数量 × 单价 × (1 + 损耗率/100)
            child.cost = child.quantity * child.unitPrice * (1 + (child.lossRate || 0) / 100);
            children.push(child);
        }

        node.children = children;
        // 父节点成本 = 所有子项成本之和
        node.cost = children.reduce((sum, c) => sum + c.cost, 0);

        visited.delete(productId);
        return node;
    }

    // 计算单个产品的 BOM 成本（不含树结构，仅返回总成本）
    private async calculateProductBomCost(productId: string): Promise<number> {
        try {
            const tree = await this.buildCostTree(productId, 1, new Set<string>());
            return tree.cost;
        } catch {
            return 0;
        }
    }

    // 批量获取产品可用数量与锁定数量，口径与实时库存保持一致。
    private async getStockSummary(productIds: string[]): Promise<Map<string, FinanceStockSummary>> {
        const stockRows = await InventoryStock
            .find({ _isDeleted: { $ne: true }, productId: { $in: productIds } })
            .select("productId warehouseId quantity lockedQuantity")
            .lean();

        const warehouseIds = [...new Set(
            (stockRows as any[]).map((r: any) => r.warehouseId?.toString?.() || "").filter(Boolean),
        )];

        const warehouses = warehouseIds.length
            ? await InventoryWarehouse.find({ _id: { $in: warehouseIds }, _isDeleted: { $ne: true } })
                .select("_id includeInAvailable").lean()
            : [];

        const warehouseMap = new Map<string, boolean>(
            (warehouses as any[]).map((w: any) => [w._id?.toString?.() || "", w.includeInAvailable !== false]),
        );

        const summary = new Map<string, FinanceStockSummary>();

        (stockRows as any[]).forEach((row: any) => {
            const pid = row.productId?.toString?.() || "";
            if (!pid) return;
            const wid = row.warehouseId?.toString?.() || "";
            const include = wid ? warehouseMap.get(wid) !== false : true;
            const qty = Number(row.quantity || 0);
            const locked = Number(row.lockedQuantity || 0);
            const s = summary.get(pid) || { availableQuantity: 0, lockedQuantity: 0 };
            if (include) s.availableQuantity += Math.max(qty - locked, 0);
            s.lockedQuantity += locked;
            summary.set(pid, s);
        });

        return summary;
    }
}

export const useFinanceCostModel = () => new FinanceCostModel();
