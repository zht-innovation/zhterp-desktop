import mongoose from "mongoose";

const { Schema } = mongoose;

const inventoryOrderReviewSchema = new Schema(
    {
        salesOrderId: { type: Schema.Types.ObjectId, ref: "SalesOrder", required: true, index: true },
        approvalKey: { type: String, required: true },
        status: { type: String, enum: ["reviewing", "reviewed"], required: true },
        revision: { type: Number, default: 1, required: true, min: 1 },
        // 仅保存服务端按白名单构建的订单、库存和 BOM 复核快照。
        snapshot: { type: Schema.Types.Mixed, required: true },
        createdBy: { type: String, default: "" },
        updatedBy: { type: String, default: "" },
        reviewedBy: { type: String, default: "" },
        reviewedAt: { type: Date, default: null },
        _isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date, default: null },
        deletedBy: { type: String, default: "" },
    },
    {
        versionKey: false,
        timestamps: { createdAt: "createTime", updatedAt: "updateTime" },
    },
);

inventoryOrderReviewSchema.index({ salesOrderId: 1, approvalKey: 1 }, { unique: true });
inventoryOrderReviewSchema.index({ status: 1, updateTime: -1 });

export const InventoryOrderReview =
    mongoose.models.InventoryOrderReview
    || mongoose.model("InventoryOrderReview", inventoryOrderReviewSchema);
