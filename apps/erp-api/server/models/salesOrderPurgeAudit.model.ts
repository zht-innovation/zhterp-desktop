import mongoose from "mongoose";

const { Schema } = mongoose;

const salesOrderPurgeAuditSchema = new Schema(
    {
        orderIdHash: { type: String, required: true, index: true },
        operatorId: { type: String, default: "" },
        operatorName: { type: String, default: "" },
        deletedAt: { type: Date, default: Date.now },
        deletedCount: { type: Number, default: 0 },
        releasedReservationCount: { type: Number, default: 0 },
        removedRequirementCount: { type: Number, default: 0 },
        retainedHistoryCount: { type: Number, default: 0 },
        result: { type: String, enum: ["success", "failed"], required: true },
    },
    { collection: "salesorderpurgeaudits", versionKey: false },
);

export const SalesOrderPurgeAudit = mongoose.models.SalesOrderPurgeAudit
    || mongoose.model("SalesOrderPurgeAudit", salesOrderPurgeAuditSchema);
