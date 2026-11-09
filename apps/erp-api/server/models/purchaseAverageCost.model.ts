import mongoose from "mongoose";

const { Schema } = mongoose;
const options = { versionKey: false, timestamps: true, autoCreate: false, autoIndex: false } as const;

// 订单、产品各自复用业务 ID 作为内部状态主键，不给公开文档添加计价字段。
const orderSchema = new Schema({
    _id: { type: Schema.Types.ObjectId, required: true },
    version: { type: Number, required: true, default: 1 },
    active: { type: Boolean, required: true, default: true },
}, options);

const stateSchema = new Schema({
    _id: { type: Schema.Types.ObjectId, required: true },
    baselineAveragePrice: { type: Number, required: true },
    lastSequence: { type: Number, required: true, default: 0 },
    revision: { type: Number, required: true, default: 0 },
}, options);

const eventSchema = new Schema({
    productId: { type: Schema.Types.ObjectId, required: true },
    sequence: { type: Number, required: true },
    kind: { type: String, enum: ["purchase", "reset"], required: true },
    purchaseOrderId: { type: Schema.Types.ObjectId },
    purchaseOrderNo: { type: String, default: "" },
    active: { type: Boolean, required: true, default: true },
    stockQuantity: { type: Number },
    standardPriceZero: { type: Boolean },
    quantity: { type: Number },
    unitPrice: { type: Number },
    totalAmount: { type: Number },
    averagePrice: { type: Number },
    createdBy: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
}, options);

eventSchema.index({ productId: 1, sequence: 1 }, { unique: true });
eventSchema.index({ purchaseOrderId: 1, productId: 1 }, {
    unique: true,
    partialFilterExpression: { kind: "purchase" },
});

export const PurchaseAverageCostOrder = mongoose.models.PurchaseAverageCostOrder
    || mongoose.model("PurchaseAverageCostOrder", orderSchema);
export const ProductAverageCostState = mongoose.models.ProductAverageCostState
    || mongoose.model("ProductAverageCostState", stateSchema);
export const ProductAverageCostEvent = mongoose.models.ProductAverageCostEvent
    || mongoose.model("ProductAverageCostEvent", eventSchema);
