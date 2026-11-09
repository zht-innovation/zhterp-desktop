import mongoose from "mongoose";

const schema = new mongoose.Schema({
    context: { type: String, enum: ["purchase", "inventory"], required: true },
    recordId: { type: String, required: true, index: true },
    trackingNo: { type: String, required: true, uppercase: true, index: true },
    courierCompany: { type: String, default: "" },
    username: { type: String, required: true },
    userName: { type: String, required: true },
    queriedAt: { type: Date, required: true, default: Date.now },
}, {
    versionKey: false,
    collection: "logistics_tracking_audits",
});

schema.index({ context: 1, recordId: 1, trackingNo: 1, queriedAt: -1 });

export const LogisticsTrackingAudit = mongoose.models.LogisticsTrackingAudit
    || mongoose.model("LogisticsTrackingAudit", schema);
