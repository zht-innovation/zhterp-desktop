import mongoose from "mongoose";
import { logger } from "~~/server/utils/logger";
import { INVENTORY_STOCK_WARNING_STATUS } from "~~/shared/enums";

/**
 * GET /dashboard/stats
 * 数据中心看板 — 聚合销售、回款、采购、库存、订单状态数据
 */
export default defineEventHandler(async (event) => {
    try {
        const db = mongoose.connection.db!;

        const now = new Date();
        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
        const daysAgo30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // ─── 并行执行所有聚合查询 ───
        const [
            monthlySalesResult,
            lastMonthSalesResult,
            receivableResult,
            purchaseWarningCount,
            lastPurchaseWarningCount,
            productionCount,
            lastProductionCount,
            dailySalesTrend,
            dailyCollectTrend,
            topCustomers,
            orderPipeline,
            stockSummary,
        ] = await Promise.all([
            // 1. 本月销售总额
            db.collection("salesorders").aggregate([
                { $match: { _isDeleted: { $ne: true }, orderDate: { $gte: thisMonthStart, $lt: now } } },
                { $group: { _id: null, total: { $sum: "$amount" } } },
            ]).toArray(),

            // 1b. 上月销售总额（用于环比）
            db.collection("salesorders").aggregate([
                { $match: { _isDeleted: { $ne: true }, orderDate: { $gte: lastMonthStart, $lt: lastMonthEnd } } },
                { $group: { _id: null, total: { $sum: "$amount" } } },
            ]).toArray(),

            // 2. 待回款总额 = sum(amount) where hasReceivable=true & paymentProgress < 100
            db.collection("salesorders").aggregate([
                { $match: { _isDeleted: { $ne: true }, hasReceivable: true, paymentProgress: { $lt: 100 } } },
                { $group: { _id: null, total: { $sum: { $subtract: ["$amount", { $multiply: ["$amount", { $divide: ["$paymentProgress", 100] }] }] } } } },
            ]).toArray(),

            // 3. 待采购/备料预警 — 采购中订单数
            db.collection("purchaseorders").countDocuments({ _isDeleted: { $ne: true }, status: "采购中" }),

            // 3b. 上月同期待采购数
            db.collection("purchaseorders").countDocuments({
                _isDeleted: { $ne: true },
                status: "采购中",
                purchaseDate: { $gte: lastMonthStart, $lt: lastMonthEnd },
            }),

            // 4. 生产中订单数
            db.collection("salesorders").countDocuments({ _isDeleted: { $ne: true }, status: "生产中" }),

            // 4b. 上月同期生产中订单数
            db.collection("salesorders").countDocuments({
                _isDeleted: { $ne: true },
                status: "生产中",
                orderDate: { $gte: lastMonthStart, $lt: lastMonthEnd },
            }),

            // 5. 近30天每日销售金额趋势
            db.collection("salesorders").aggregate([
                { $match: { _isDeleted: { $ne: true }, orderDate: { $gte: daysAgo30 } } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%m-%d", date: "$orderDate" } },
                        amount: { $sum: "$amount" },
                    },
                },
                { $sort: { _id: 1 } },
            ]).toArray(),

            // 6. 近30天每日回款金额趋势
            db.collection("salesorderreceipts").aggregate([
                { $match: { _isDeleted: { $ne: true }, status: "已通过", paymentDate: { $gte: daysAgo30 } } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%m-%d", date: "$paymentDate" } },
                        amount: { $sum: "$amount" },
                    },
                },
                { $sort: { _id: 1 } },
            ]).toArray(),

            // 7. 客户业绩 Top 5（已出库订单按客户分组）
            db.collection("salesorders").aggregate([
                { $match: { _isDeleted: { $ne: true }, status: "已出库" } },
                {
                    $group: {
                        _id: "$customerId",
                        customerName: { $first: { $ifNull: ["$customerCompany", "$customerName"] } },
                        amount: { $sum: "$amount" },
                    },
                },
                { $sort: { amount: -1 } },
                { $limit: 5 },
            ]).toArray(),

            // 8. 订单履约进度（各状态数量）
            db.collection("salesorders").aggregate([
                { $match: { _isDeleted: { $ne: true } } },
                { $group: { _id: "$status", count: { $sum: 1 } } },
            ]).toArray(),

            // 9. 库存物料情况
            db.collection("inventorystocks").aggregate([
                { $match: {} },
                {
                    $lookup: {
                        from: "inventoryproducts",
                        localField: "productId",
                        foreignField: "_id",
                        as: "product",
                    },
                },
                { $unwind: { path: "$product", preserveNullAndEmptyArrays: true } },
                {
                    $group: {
                        _id: "$productId",
                        totalQuantity: { $sum: "$quantity" },
                        stockLowerLimit: { $first: { $ifNull: ["$product.stockLowerLimit", 0] } },
                        stockUpperLimit: { $first: { $ifNull: ["$product.stockUpperLimit", 0] } },
                    },
                },
                {
                    $project: {
                        status: {
                            $switch: {
                                branches: [
                                    {
                                        case: {
                                            $and: [
                                                { $gt: ["$stockLowerLimit", 0] },
                                                { $lt: ["$totalQuantity", "$stockLowerLimit"] },
                                            ],
                                        },
                                        then: INVENTORY_STOCK_WARNING_STATUS.LOW,
                                    },
                                    {
                                        case: {
                                            $and: [
                                                { $gt: ["$stockUpperLimit", 0] },
                                                { $gt: ["$totalQuantity", "$stockUpperLimit"] },
                                            ],
                                        },
                                        then: INVENTORY_STOCK_WARNING_STATUS.HIGH,
                                    },
                                ],
                                default: INVENTORY_STOCK_WARNING_STATUS.NORMAL,
                            },
                        },
                    },
                },
                { $group: { _id: "$status", count: { $sum: 1 } } },
            ]).toArray(),
        ]);

        // ─── 组装日期序列（补全30天） ───
        const dateLabels: string[] = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
            dateLabels.push(`${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        }

        const salesMap = new Map(dailySalesTrend.map((r: any) => [r._id, r.amount]));
        const collectMap = new Map(dailyCollectTrend.map((r: any) => [r._id, r.amount]));

        // ─── 计算环比 ───
        const thisMonthSales = monthlySalesResult[0]?.total || 0;
        const lastMonthSales = lastMonthSalesResult[0]?.total || 0;
        const salesChange = lastMonthSales > 0 ? ((thisMonthSales - lastMonthSales) / lastMonthSales) * 100 : 0;

        const pipelineMap = new Map(orderPipeline.map((r: any) => [r._id, r.count]));
        const currentProduction = pipelineMap.get("生产中") || 0;
        const lastProd = lastProductionCount || 0;
        const prodChange = lastProd > 0 ? ((currentProduction - lastProd) / lastProd) * 100 : 0;

        const currentPurchaseWarning = purchaseWarningCount || 0;
        const lastPurchase = lastPurchaseWarningCount || 0;
        const purchaseChange = lastPurchase > 0 ? ((currentPurchaseWarning - lastPurchase) / lastPurchase) * 100 : 0;

        // ─── 库存统计 ───
        const stockMap = new Map(stockSummary.map((r: any) => [r._id, r.count]));
        const lowCount = stockMap.get(INVENTORY_STOCK_WARNING_STATUS.LOW) || 0;
        const highCount = stockMap.get(INVENTORY_STOCK_WARNING_STATUS.HIGH) || 0;
        const normalCount = stockMap.get(INVENTORY_STOCK_WARNING_STATUS.NORMAL) || 0;
        const stockTotal = lowCount + highCount + normalCount;

        return {
            code: 200,
            data: {
                summaryCards: {
                    monthlySales: {
                        value: Math.round(thisMonthSales / 100) / 100, // 万元, 保留2位
                        unit: "万元",
                        change: Math.round(salesChange * 10) / 10,
                    },
                    pendingReceivable: {
                        value: Math.round((receivableResult[0]?.total || 0) / 100) / 100,
                        unit: "万元",
                        change: 0, // 待回款暂不计算环比
                    },
                    purchaseWarning: {
                        value: currentPurchaseWarning,
                        unit: "条",
                        change: Math.round(purchaseChange * 10) / 10,
                    },
                    productionOrders: {
                        value: currentProduction,
                        unit: "单",
                        change: Math.round(prodChange * 10) / 10,
                    },
                },
                salesTrend: {
                    dates: dateLabels,
                    salesAmount: dateLabels.map((d) => Math.round((salesMap.get(d) || 0) / 100) / 100),
                    collectAmount: dateLabels.map((d) => Math.round((collectMap.get(d) || 0) / 100) / 100),
                },
                topCustomers: topCustomers.map((c: any) => ({
                    name: c.customerName || "未知客户",
                    amount: Math.round((c.amount || 0) / 100) / 100,
                })),
                stockSummary: {
                    total: stockTotal,
                    low: lowCount,
                    lowPercent: stockTotal > 0 ? Math.round((lowCount / stockTotal) * 100) : 0,
                    high: highCount,
                    highPercent: stockTotal > 0 ? Math.round((highCount / stockTotal) * 100) : 0,
                    normal: normalCount,
                    normalPercent: stockTotal > 0 ? Math.round((normalCount / stockTotal) * 100) : 0,
                },
                orderPipeline: {
                    pendingAudit: pipelineMap.get("待审核") || 0,
                    pendingPurchase: pipelineMap.get("待采购") || 0,
                    producing: pipelineMap.get("生产中") || 0,
                    pendingShip: pipelineMap.get("待出库") || 0,
                    shipped: pipelineMap.get("已出库") || 0,
                },
            },
        };
    } catch (error) {
        logger.error("Dashboard stats error:", error);
        return { code: 500, msg: "获取看板数据失败" };
    }
});
