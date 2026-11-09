import mongoose from "mongoose";

const productionWorkshopSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 40, unique: true },
    createdBy: { type: String, required: true },
}, {
    versionKey: false,
    autoIndex: false,
    autoCreate: false,
    timestamps: { createdAt: "createTime", updatedAt: "updateTime" },
});

export const ProductionWorkshop = mongoose.models.ProductionWorkshop
    || mongoose.model("ProductionWorkshop", productionWorkshopSchema);
