import mongoose from "mongoose";

const { Schema } = mongoose;
const inventoryBomHistorySchema = new Schema(
    {
        bomId: { type: Schema.Types.ObjectId, required: true, ref: "InventoryBom" },
        revision: { type: Number, required: true, min: 1 },
        action: { type: String, required: true, enum: ["create", "baseline", "update"] },
        operator: { type: String, default: "" },
        createdAt: { type: Date, required: true },
        snapshot: { type: Schema.Types.Mixed, required: true },
        changes: { type: Schema.Types.Mixed, required: true },
    },
    { versionKey: false },
);

inventoryBomHistorySchema.index({ bomId: 1, revision: 1 }, { unique: true });
inventoryBomHistorySchema.index({ bomId: 1, createdAt: -1 });

export const InventoryBomHistory = mongoose.models.InventoryBomHistory
    || mongoose.model("InventoryBomHistory", inventoryBomHistorySchema);
