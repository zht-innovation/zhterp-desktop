import mongoose from "mongoose";

const { Schema } = mongoose;

const inventoryCounterSchema = new Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        value: {
            type: Number,
            default: 0,
        },
    },
    {
        versionKey: false,
        timestamps: {
            createdAt: "createTime",
            updatedAt: "updateTime",
        },
    }
);

const InventoryCounter =
    mongoose.models.InventoryCounter || mongoose.model("InventoryCounter", inventoryCounterSchema);

class InventoryCounterModel {
    counter: typeof InventoryCounter;

    constructor(counter: typeof InventoryCounter) {
        this.counter = counter;
    }

    async nextNumber(key: string, session?: mongoose.ClientSession) {
        const result = await this.counter.findOneAndUpdate(
            { key },
            { $inc: { value: 1 } },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true,
                ...(session ? { session } : {}),
            }
        );

        return Number(result.value || 1);
    }

    async nextCode(
        key: string,
        prefix: string,
        width: number,
        separator = "",
        session?: mongoose.ClientSession,
    ) {
        const value = await this.nextNumber(key, session);
        return `${prefix}${separator}${String(value).padStart(width, "0")}`;
    }
}

export const useInventoryCounterModel = () => new InventoryCounterModel(InventoryCounter);
