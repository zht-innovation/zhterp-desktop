import mongoose from "mongoose";

const { Schema } = mongoose;
const allocationSchema = new Schema({
    stockId: { type: Schema.Types.ObjectId, required: true },
    reservationId: { type: Schema.Types.ObjectId, default: null },
    warehouseId: { type: Schema.Types.ObjectId, required: true },
    locationId: { type: Schema.Types.ObjectId, default: null },
    quantity: { type: Number, required: true },
    issued: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 },
    returned: { type: Number, default: 0 },
    pendingReturn: { type: Number, default: 0 },
});
const lineSchema = new Schema({
    productId: { type: Schema.Types.ObjectId, required: true },
    materialCode: { type: String, required: true },
    name: String,
    unit: String,
    per: Number,
    quantity: Number,
    allocations: { type: [allocationSchema], default: [] },
}, { _id: false });
const recordSchema = new Schema({
    date: { type: Date, default: Date.now }, action: String, materialCode: String,
    quantity: Number, unit: String, documentNo: String, remark: String,
    warehouseId: { type: Schema.Types.ObjectId, default: null },
    locationId: { type: Schema.Types.ObjectId, default: null },
}, { _id: false });
const requisitionSchema = new Schema({
    documentNo: { type: String, unique: true, required: true },
    productionOrderId: { type: Schema.Types.ObjectId, required: true, index: true },
    salesOrderId: { type: Schema.Types.ObjectId, default: null, index: true },
    salesOrderNo: String, productionOrderNo: String, productName: String, productCode: String,
    applicant: { type: String, required: true }, remark: String,
    status: { type: String, required: true, default: "待出库", index: true },
    hasPendingReturn: { type: Boolean, default: false },
    version: { type: Number, default: 1 },
    lines: { type: [lineSchema], default: [] }, records: { type: [recordSchema], default: [] },
    createdBy: String, updatedBy: String,
}, { versionKey: false, timestamps: { createdAt: "createTime", updatedAt: "updateTime" } });
const completionSchema = new Schema({
    documentNo: { type: String, required: true, unique: true },
    productionOrderId: { type: Schema.Types.ObjectId, required: true, index: true },
    salesOrderId: { type: Schema.Types.ObjectId, default: null, index: true },
    salesOrderNo: String, productionOrderNo: String, productName: String, productCode: String,
    quantity: { type: Number, required: true }, receivedQty: { type: Number, default: 0 },
    version: { type: Number, default: 1 }, date: { type: Date, required: true },
    person: { type: String, required: true }, remark: String, createdBy: String,
}, { versionKey: false, timestamps: { createdAt: "createTime", updatedAt: "updateTime" } });
const materialLossSchema = new Schema({
    productionOrderId: { type: Schema.Types.ObjectId, ref: "ProductionOrder", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "InventoryProduct", required: true },
    materialCode: { type: String, required: true },
    materialName: { type: String, default: "" },
    unit: { type: String, default: "个" },
    quantity: { type: Number, required: true, min: 0.001 },
    remark: { type: String, default: "" },
    createdBy: { type: String, required: true },
}, { versionKey: false, timestamps: { createdAt: "createTime", updatedAt: "updateTime" } });
materialLossSchema.index({ productionOrderId: 1, productId: 1, createTime: -1 });
const operationSchema = new Schema({
    idempotencyKey: { type: String, required: true, unique: true },
    requestHash: { type: String, required: true }, action: { type: String, required: true },
    actor: { type: String, required: true }, result: { type: Schema.Types.Mixed, required: true },
}, { versionKey: false, timestamps: { createdAt: "createTime", updatedAt: "updateTime" } });

export const ProductionRequisition = mongoose.models.ProductionRequisition || mongoose.model("ProductionRequisition", requisitionSchema);
export const ProductionCompletion = mongoose.models.ProductionCompletion || mongoose.model("ProductionCompletion", completionSchema);
export const ProductionMaterialLoss = mongoose.models.ProductionMaterialLoss || mongoose.model("ProductionMaterialLoss", materialLossSchema);
export const ProductionExecutionOperation = mongoose.models.ProductionExecutionOperation || mongoose.model("ProductionExecutionOperation", operationSchema);
