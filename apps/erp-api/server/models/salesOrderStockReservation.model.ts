import mongoose from "mongoose";
import {
    isValidObjectId,
    throwInventoryError,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import { CODE } from "~~/server/utils/code";
import { normalizeStockQuantity } from "~~/server/services/inventoryStockMath";
import { groupSalesOrderShipmentItems } from "~~/server/services/salesOrderShipmentMath";

const { Schema } = mongoose;

export type SalesOrderReservationType = "finished-product" | "production-material";
export type SalesOrderReservationStatus = "active" | "consumed" | "released";

const salesOrderStockReservationSchema = new Schema(
    {
        salesOrderId: { type: Schema.Types.ObjectId, ref: "SalesOrder", required: true, index: true },
        salesOrderNo: { type: String, required: true, trim: true, index: true },
        demandProductId: { type: Schema.Types.ObjectId, ref: "InventoryProduct", required: true, index: true },
        stockProductId: { type: Schema.Types.ObjectId, ref: "InventoryProduct", required: true, index: true },
        warehouseId: { type: Schema.Types.ObjectId, ref: "InventoryWarehouse", default: null, index: true },
        locationId: { type: Schema.Types.ObjectId, ref: "InventoryLocation", default: null, index: true },
        reservationType: {
            type: String,
            enum: ["finished-product", "production-material"],
            required: true,
            index: true,
        },
        requiredQuantity: { type: Number, required: true, min: 0 },
        reservedQuantity: { type: Number, required: true, min: 0 },
        consumedQuantity: { type: Number, default: 0, min: 0 },
        releasedQuantity: { type: Number, default: 0, min: 0 },
        productionAllocatedQuantity: { type: Number, default: 0, min: 0 },
        purchaseBomRevision: { type: Number, select: false },
        sourceProductionOrderId: { type: Schema.Types.ObjectId, ref: "ProductionOrder", default: null, index: true },
        sourceAllocationId: { type: Schema.Types.ObjectId, ref: "PurchaseOrderAllocation", default: null, index: true },
        sourceInboundId: { type: Schema.Types.ObjectId, ref: "InventoryInbound", default: null, index: true },
        status: { type: String, enum: ["active", "consumed", "released"], default: "active", index: true },
        createdBy: { type: String, default: "" },
        updatedBy: { type: String, default: "" },
    },
    {
        versionKey: false,
        timestamps: { createdAt: "createTime", updatedAt: "updateTime" },
    },
);

salesOrderStockReservationSchema.index({ salesOrderId: 1, status: 1, stockProductId: 1 });
salesOrderStockReservationSchema.index({ sourceAllocationId: 1, status: 1 });
salesOrderStockReservationSchema.index({ sourceInboundId: 1, status: 1 });

export const SalesOrderStockReservation =
    mongoose.models.SalesOrderStockReservation
    || mongoose.model("SalesOrderStockReservation", salesOrderStockReservationSchema);

class SalesOrderStockReservationModel {
    async updateLocation(
        reservations: any[],
        position: {
            warehouseId: mongoose.Types.ObjectId | null;
            locationId: mongoose.Types.ObjectId | null;
        },
        actor: string,
        session: mongoose.ClientSession,
    ) {
        for (const reservation of reservations) {
            if (Number(reservation.productionAllocatedQuantity || 0) > 0) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "该物料已分配给生产发料单，请先撤销未出库分配后再修改库位");
            }
            const consumedQuantity = normalizeStockQuantity(reservation.consumedQuantity || 0);
            const releasedQuantity = normalizeStockQuantity(reservation.releasedQuantity || 0);
            const historyQuantity = normalizeStockQuantity(consumedQuantity + releasedQuantity);
            const remainingQuantity = normalizeStockQuantity(reservation.reservedQuantity - historyQuantity);
            if (remainingQuantity <= 0) continue;

            if (historyQuantity === 0) {
                await SalesOrderStockReservation.updateOne(
                    { _id: reservation._id },
                    { $set: { ...position, updatedBy: actor } },
                    { session, runValidators: true },
                );
                continue;
            }

            // 已出库、已释放部分留在原库位，供历史出库撤销及来源入库校验使用。
            await SalesOrderStockReservation.updateOne(
                { _id: reservation._id },
                {
                    $set: {
                        reservedQuantity: historyQuantity,
                        status: consumedQuantity > 0 ? "consumed" : "released",
                        updatedBy: actor,
                    },
                },
                { session, runValidators: true },
            );
            const { _id, createTime, updateTime, ...data } = reservation;
            await SalesOrderStockReservation.create([{
                ...data,
                ...position,
                reservedQuantity: remainingQuantity,
                consumedQuantity: 0,
                releasedQuantity: 0,
                status: "active",
                createdBy: actor,
                updatedBy: actor,
            }], { session });
        }
    }

    async listBySalesOrder(salesOrderId: string) {
        return await SalesOrderStockReservation.find({
            salesOrderId: toObjectId(salesOrderId),
        }).sort({ createTime: 1 }).lean();
    }

    async listActiveByOrderNo(salesOrderNo: string) {
        return await SalesOrderStockReservation.find({
            salesOrderNo: toText(salesOrderNo),
            status: "active",
            $expr: {
                $gt: [
                    "$reservedQuantity",
                    { $add: ["$consumedQuantity", "$releasedQuantity"] },
                ],
            },
        }).sort({ createTime: 1 }).lean();
    }

    async assertCanConsume(salesOrderId: string, items: any[], session?: mongoose.ClientSession) {
        for (const item of groupSalesOrderShipmentItems(items)) {
            const query = SalesOrderStockReservation.find({
                salesOrderId: toObjectId(salesOrderId),
                stockProductId: item.productId,
                warehouseId: item.warehouseId || null,
                locationId: item.locationId || null,
                reservationType: "finished-product",
                status: "active",
            }).lean();
            if (session) query.session(session);
            const reservations = await query as any[];
            const available = normalizeStockQuantity(reservations.reduce((sum, row) =>
                sum + Math.max(Number(row.reservedQuantity || 0)
                    - Number(row.consumedQuantity || 0)
                    - Number(row.releasedQuantity || 0), 0), 0));
            if (available < Number(item.quantity || 0)) {
                throwInventoryError(409, CODE.INVENTORY_REFERENCED, "当前订单在所选仓位的预占库存不足，无法完成订单出库");
            }
        }
    }

    async consume(salesOrderId: string, items: any[], actor: string, session?: mongoose.ClientSession) {
        for (const item of groupSalesOrderShipmentItems(items)) {
            let remaining = Number(item.quantity || 0);
            const query = SalesOrderStockReservation.find({
                salesOrderId: toObjectId(salesOrderId),
                stockProductId: item.productId,
                warehouseId: item.warehouseId || null,
                locationId: item.locationId || null,
                reservationType: "finished-product",
                status: "active",
            }).sort({ createTime: 1 });
            if (session) query.session(session);
            const reservations = await query as any[];
            for (const row of reservations as any[]) {
                if (remaining <= 0) break;
                const available = Math.max(row.reservedQuantity - row.consumedQuantity - row.releasedQuantity, 0);
                const quantity = Math.min(available, remaining);
                row.consumedQuantity = normalizeStockQuantity(row.consumedQuantity + quantity);
                row.status = row.consumedQuantity + row.releasedQuantity >= row.reservedQuantity ? "consumed" : "active";
                row.updatedBy = actor;
                await row.save(session ? { session } : {});
                remaining = normalizeStockQuantity(remaining - quantity);
            }
            if (remaining > 0) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "订单成品预占已变化，请刷新后重试");
        }
    }

    async reverseConsumption(salesOrderId: string, items: any[], actor: string, session?: mongoose.ClientSession) {
        for (const item of groupSalesOrderShipmentItems(items)) {
            let remaining = Number(item.quantity || 0);
            const query = SalesOrderStockReservation.find({
                salesOrderId: toObjectId(salesOrderId),
                stockProductId: item.productId,
                warehouseId: item.warehouseId || null,
                locationId: item.locationId || null,
                reservationType: "finished-product",
                consumedQuantity: { $gt: 0 },
            }).sort({ updateTime: -1 });
            if (session) query.session(session);
            const reservations = await query as any[];
            for (const row of reservations as any[]) {
                if (remaining <= 0) break;
                const quantity = Math.min(row.consumedQuantity, remaining);
                row.consumedQuantity = normalizeStockQuantity(row.consumedQuantity - quantity);
                row.status = row.releasedQuantity >= row.reservedQuantity ? "released" : "active";
                row.updatedBy = actor;
                await row.save(session ? { session } : {});
                remaining = normalizeStockQuantity(remaining - quantity);
            }
            if (remaining > 0) throwInventoryError(409, CODE.INVENTORY_REFERENCED, "订单已出库预占记录不足，无法撤销出库");
        }
    }

    async createProductionInboundReservations(
        sourceInboundId: string,
        reservations: any[],
        actor: string,
        session: mongoose.ClientSession,
    ) {
        if (!isValidObjectId(sourceInboundId) || !reservations.length) return [];
        return await SalesOrderStockReservation.insertMany(
            reservations.map((reservation) => ({
                ...reservation,
                sourceInboundId: toObjectId(sourceInboundId),
                createdBy: actor,
                updatedBy: actor,
            })),
            { session },
        );
    }

    async assertProductionInboundCanBeReversed(
        sourceInboundId: string,
        session: mongoose.ClientSession,
    ) {
        const consumed = await SalesOrderStockReservation.exists({
            sourceInboundId: toObjectId(sourceInboundId),
            reservationType: "finished-product",
            consumedQuantity: { $gt: 0 },
        }).session(session);
        if (consumed) {
            throwInventoryError(
                409,
                CODE.INVENTORY_REFERENCED,
                "该生产入库已支撑订单出库，请先撤销关联出库单",
            );
        }
    }

    async releaseProductionInboundReservations(
        sourceInboundId: string,
        actor: string,
        session: mongoose.ClientSession,
    ) {
        const reservations = await SalesOrderStockReservation.find({
            sourceInboundId: toObjectId(sourceInboundId),
            reservationType: "finished-product",
        }).select("salesOrderId reservedQuantity releasedQuantity").session(session) as any[];
        const salesOrderIds = [
            ...new Set(reservations.map((item) => item.salesOrderId?.toString?.() || "").filter(Boolean)),
        ];

        for (const reservation of reservations) {
            reservation.releasedQuantity = reservation.reservedQuantity;
            reservation.status = "released";
            reservation.updatedBy = actor;
            await reservation.save({ session });
        }
        return salesOrderIds;
    }
}

export const useSalesOrderStockReservationModel = () =>
    new SalesOrderStockReservationModel();
