import mongoose from "mongoose";
import {
    isValidObjectId,
    toObjectId,
} from "~~/server/services/inventory";
import { normalizeStockQuantity } from "~~/server/services/inventoryStockMath";

const IN_TRANSIT_EXCLUDED_STATUSES = ["已完成"];

export type PurchaseInTransitSummary = {
    productId: string;
    orderedQuantity: number;
    inboundQuantity: number;
    allocatedQuantity: number;
    lockedAfterInboundQuantity: number;
    inTransitQuantity: number;
    allocatedInTransitQuantity: number;
};

export const getPurchaseInTransitSummaryMap = async (productIds: string[] = []) => {
    const uniqueProductIds = [...new Set(productIds.filter((id) => isValidObjectId(id)))];
    const productObjectIds = uniqueProductIds.map((id) => toObjectId(id));
    const productMatch = productObjectIds.length
        ? { "items.productId": { $in: productObjectIds } }
        : {};

    const purchaseOrders = await mongoose.connection
        .collection("purchaseorders")
        .aggregate([
            {
                $match: {
                    _isDeleted: { $ne: true },
                    status: { $nin: IN_TRANSIT_EXCLUDED_STATUSES },
                    ...productMatch,
                },
            },
            { $unwind: "$items" },
            ...(productObjectIds.length
                ? [{ $match: { "items.productId": { $in: productObjectIds } } }]
                : []),
            {
                $group: {
                    _id: "$items.productId",
                    orderedQuantity: { $sum: "$items.quantity" },
                    orderNos: { $addToSet: "$orderNo" },
                },
            },
        ]).toArray();
    const orderNos = [
        ...new Set(
            purchaseOrders
                .flatMap((row: any) => Array.isArray(row.orderNos) ? row.orderNos : [])
                .filter(Boolean),
        ),
    ];
    const summaryMap = new Map<string, PurchaseInTransitSummary>();

    purchaseOrders.forEach((row: any) => {
        const productId = row._id?.toString?.() || "";
        summaryMap.set(productId, {
            productId,
            orderedQuantity: normalizeStockQuantity(row.orderedQuantity || 0),
            inboundQuantity: 0,
            allocatedQuantity: 0,
            lockedAfterInboundQuantity: 0,
            inTransitQuantity: 0,
            allocatedInTransitQuantity: 0,
        });
    });

    if (orderNos.length) {
        const [inboundRows, allocationRows] = await Promise.all([
            mongoose.connection
                .collection("inventoryinbounds")
                .aggregate([
                    {
                        $match: {
                            purchaseOrderNo: { $in: orderNos },
                            type: "采购",
                            stockApplied: true,
                            _isDeleted: { $ne: true },
                        },
                    },
                    { $unwind: "$items" },
                    ...(productObjectIds.length
                        ? [{ $match: { "items.productId": { $in: productObjectIds } } }]
                        : []),
                    {
                        $group: {
                            _id: "$items.productId",
                            inboundQuantity: { $sum: "$items.quantity" },
                        },
                    },
                ]).toArray(),
            mongoose.connection
                .collection("purchaseorderallocations")
                .aggregate([
                    {
                        $match: {
                            purchaseOrderNo: { $in: orderNos },
                            ...(productObjectIds.length ? { productId: { $in: productObjectIds } } : {}),
                        },
                    },
                    {
                        $group: {
                            _id: "$productId",
                            allocatedQuantity: { $sum: "$allocatedQuantity" },
                            lockedAfterInboundQuantity: { $sum: "$lockedAfterInboundQuantity" },
                        },
                    },
                ]).toArray(),
        ]);

        inboundRows.forEach((row: any) => {
            const summary = summaryMap.get(row._id?.toString?.() || "");
            if (summary) {
                summary.inboundQuantity = normalizeStockQuantity(row.inboundQuantity || 0);
            }
        });
        allocationRows.forEach((row: any) => {
            const summary = summaryMap.get(row._id?.toString?.() || "");
            if (summary) {
                summary.allocatedQuantity = normalizeStockQuantity(row.allocatedQuantity || 0);
                summary.lockedAfterInboundQuantity = normalizeStockQuantity(row.lockedAfterInboundQuantity || 0);
            }
        });
    }

    summaryMap.forEach((summary) => {
        summary.inTransitQuantity = normalizeStockQuantity(
            Math.max(summary.orderedQuantity - summary.inboundQuantity, 0),
        );
        summary.allocatedInTransitQuantity = normalizeStockQuantity(
            Math.max(summary.allocatedQuantity - summary.lockedAfterInboundQuantity, 0),
        );
    });

    return summaryMap;
};
