import mongoose from "mongoose";

const schema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 40 },
    status: { type: String, enum: ["enabled", "disabled"], default: "enabled", required: true },
}, { versionKey: false, timestamps: true });

schema.index({ name: 1 }, { unique: true });
export const Department = mongoose.models.Department || mongoose.model("Department", schema);

export const departmentSnapshotSchema = new mongoose.Schema({
    departmentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    departmentName: { type: String, required: true },
}, { _id: false });
