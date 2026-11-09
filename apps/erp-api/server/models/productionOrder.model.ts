import mongoose from "mongoose";

const { Schema } = mongoose;

const productionMaterialSchema = new Schema({
    productId: { type: Schema.Types.ObjectId, ref: "InventoryProduct", required: true },
    code: { type: String, default: "" },
    name: { type: String, default: "" },
    unit: { type: String, default: "个" },
    unitQty: { type: Number, required: true, min: 0 },
    source: { type: String, default: "" },
    image: { type: String, default: "" },
    sort: { type: Number, default: 0 },
}, { _id: false });

const productionWarningSchema = new Schema({
    key: { type: String, required: true },
    dueDate: { type: Date, required: true },
    warningDays: { type: Number, enum: [3, 5], required: true },
    publishedAt: { type: Date, required: true },
    handlingMethod: { type: String, default: "", maxlength: 1000 },
    handledBy: { type: String, default: "" },
    handledAt: { type: Date, default: null },
});

const productionOrderSchema = new Schema({
    documentNo: { type: String, required: true, unique: true, index: true },
    idempotencyKey: { type: String, required: true },
    requestHash: { type: String, required: true },
    releaseIdempotencyKey: { type: String, default: undefined },
    sourceType: { type: String, enum: ["order", "stock"], required: true },
    salesOrderId: { type: Schema.Types.ObjectId, ref: "SalesOrder", default: null, index: true },
    salesOrderNo: { type: String, default: "" },
    rootProductId: { type: Schema.Types.ObjectId, ref: "InventoryProduct", default: null },
    productId: { type: Schema.Types.ObjectId, ref: "InventoryProduct", required: true },
    productCode: { type: String, required: true },
    productName: { type: String, required: true },
    unitName: { type: String, default: "" },
    bomId: { type: Schema.Types.ObjectId, ref: "InventoryBom", default: null },
    bomVersion: { type: String, default: "" },
    bomMaterials: { type: [productionMaterialSchema], default: [] },
    planQty: { type: Number, required: true, min: 0.000001 },
    status: { type: String, enum: ["草稿", "待发料", "待生产", "生产中", "已完成", "已取消"], required: true },
    workshop: { type: String, required: true },
    owner: { type: String, default: "" },
    priority: { type: String, enum: ["普通", "紧急"], default: "普通" },
    planStart: { type: Date, required: true },
    planFinish: { type: Date, required: true },
    warningDays: { type: Number, enum: [3, 5], default: 3 },
    warnings: { type: [productionWarningSchema], default: [] },
    remark: { type: String, default: "" },
    machineNumbers: { type: [String], default: undefined },
    completedQty: { type: Number, default: 0 },
    receivedQty: { type: Number, default: 0 },
    version: { type: Number, default: 1 },
    createdBy: { type: String, required: true },
}, {
    versionKey: false,
    // 先迁移旧编号，再由生产单初始化显式建索引，避免自动建索引抢跑。
    autoIndex: false,
    autoCreate: false,
    timestamps: { createdAt: "createTime", updatedAt: "updateTime" },
});

productionOrderSchema.index({ salesOrderId: 1, status: 1, productId: 1 });
productionOrderSchema.index({ status: 1, planFinish: 1 });
productionOrderSchema.index({ sourceType: 1, createTime: -1 });
// 历史生产单没有请求幂等键，不为它们伪造请求数据。
productionOrderSchema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });
productionOrderSchema.index({ releaseIdempotencyKey: 1 }, { unique: true, partialFilterExpression: { releaseIdempotencyKey: { $type: "string" } } });
productionOrderSchema.index({ machineNumbers: 1 }, { unique: true, partialFilterExpression: { machineNumbers: { $type: "string" } } });

export const ProductionOrder = mongoose.models.ProductionOrder
    || mongoose.model("ProductionOrder", productionOrderSchema);
