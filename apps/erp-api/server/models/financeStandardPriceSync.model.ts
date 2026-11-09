import mongoose from "mongoose";

const { Schema } = mongoose;
const options = { versionKey: false, timestamps: true, autoCreate: false, autoIndex: false } as const;

const resultSchema = new Schema({
    scheduledAt: { type: Date, required: true },
    completedAt: { type: Date, required: true },
    updatedCount: { type: Number, required: true },
    skippedCount: { type: Number, required: true },
}, { _id: false });

const configSchema = new Schema({
    _id: { type: String, required: true },
    enabled: { type: Boolean, required: true, default: false },
    frequency: { type: String, enum: ["daily", "weekly", "monthly"], required: true },
    time: { type: String, required: true },
    weekDay: { type: Number, min: 1, max: 7, required: true },
    monthDay: { type: Number, min: 1, max: 31, required: true },
    version: { type: Number, required: true },
    nextRunAt: { type: Date, default: null },
    leaseToken: { type: String, default: null },
    leaseUntil: { type: Date, default: null },
    lastRun: { type: resultSchema, default: null },
    lastError: { type: String, default: "" },
    updatedBy: { type: String, default: "" },
}, options);

const runSchema = new Schema({
    configVersion: { type: Number, required: true },
    scheduledAt: { type: Date, required: true },
    completedAt: { type: Date, required: true },
    updatedCount: { type: Number, required: true },
    skippedCount: { type: Number, required: true },
}, options);
runSchema.index({ configVersion: 1, scheduledAt: 1 }, { unique: true });

export const FinanceStandardPriceSyncConfig = mongoose.models.FinanceStandardPriceSyncConfig
    || mongoose.model("FinanceStandardPriceSyncConfig", configSchema);
export const FinanceStandardPriceSyncRun = mongoose.models.FinanceStandardPriceSyncRun
    || mongoose.model("FinanceStandardPriceSyncRun", runSchema);
