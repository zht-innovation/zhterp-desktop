import mongoose from "mongoose";

const schema = new mongoose.Schema({
    _id: { type: String, required: true },
    lastAttemptAt: { type: Date, required: true },
    nextQueryAt: { type: Date, required: true },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    errorMessage: { type: String, default: "" },
}, { versionKey: false, collection: "logistics_track_cache", bufferCommands: false });

export const LogisticsTrackCache = mongoose.models.LogisticsTrackCache
    || mongoose.model("LogisticsTrackCache", schema);
