import mongoose from "mongoose";

const { Schema } = mongoose;

export type TermActor = {
    name: string;
    role: number;
    salesId?: mongoose.Types.ObjectId | string | null;
};

export type ApplyTermReq = {
    appId: mongoose.Types.ObjectId | string;
    customerId: mongoose.Types.ObjectId | string;
    appType: "new" | "extend";
    status: "pending";
    days: number;
    reqExpire?: Date | null;
    newSalesId: mongoose.Types.ObjectId | string;
    newSalesName: string;
    createdBy: TermActor;
};

export type ManualTermReq = {
    customerId: mongoose.Types.ObjectId | string;
    days?: number | null;
    oldExpire?: Date | null;
    newExpire?: Date | null;
    oldSalesId?: mongoose.Types.ObjectId | string | null;
    oldSalesName?: string;
    newSalesId?: mongoose.Types.ObjectId | string | null;
    newSalesName?: string;
    createdBy: TermActor;
};

export type ReviewTermReq = {
    status: "approved" | "rejected";
    oldExpire?: Date | null;
    newExpire?: Date | null;
    oldSalesId?: mongoose.Types.ObjectId | string | null;
    oldSalesName?: string;
    newSalesId?: mongoose.Types.ObjectId | string | null;
    newSalesName?: string;
    reviewBy: TermActor;
};

const actorSchema = new Schema(
    {
        name: { type: String, required: true },
        role: { type: Number, required: true },
        salesId: {
            type: Schema.Types.ObjectId,
            ref: "Salesperson",
            default: null,
        },
    },
    { _id: false }
);

const customerTermSchema = new Schema(
    {
        customerId: {
            type: Schema.Types.ObjectId,
            ref: "Customer",
            required: true,
        },
        type: {
            type: String,
            enum: ["apply", "manual"],
            required: true,
        },
        seed: {
            type: Boolean,
        },
        appId: {
            type: Schema.Types.ObjectId,
            ref: "Application",
        },
        appType: {
            type: String,
            enum: ["new", "extend"],
        },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
        },
        days: {
            type: Number,
            default: null,
        },
        reqExpire: {
            type: Date,
            default: null,
        },
        oldExpire: {
            type: Date,
            default: null,
        },
        newExpire: {
            type: Date,
            default: null,
        },
        oldSalesId: {
            type: Schema.Types.ObjectId,
            ref: "Salesperson",
            default: null,
        },
        oldSalesName: {
            type: String,
            default: "",
        },
        newSalesId: {
            type: Schema.Types.ObjectId,
            ref: "Salesperson",
            default: null,
        },
        newSalesName: {
            type: String,
            default: "",
        },
        createdBy: {
            type: actorSchema,
            required: true,
        },
        reviewBy: {
            type: actorSchema,
            default: null,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        reviewedAt: {
            type: Date,
            default: null,
        },
    },
    { versionKey: false }
);

customerTermSchema.index({ appId: 1 }, { unique: true, sparse: true });
customerTermSchema.index({ customerId: 1, createdAt: -1 });

const CustomerTerm = mongoose.models.CustomerTerm || mongoose.model("CustomerTerm", customerTermSchema);

class CustomerTermModel {
    term: typeof CustomerTerm;

    constructor(term: typeof CustomerTerm) {
        this.term = term;
    }

    async addApply(data: ApplyTermReq) {
        return await this.term.create({ ...data, type: "apply" });
    }

    async addManual(data: ManualTermReq) {
        return await this.term.create({ ...data, type: "manual" });
    }

    async addManualMany(data: ManualTermReq[]) {
        if (!data.length) return [];
        return await this.term.insertMany(
            data.map((record) => ({ ...record, type: "manual" }))
        );
    }

    async reviewApply(
        appId: mongoose.Types.ObjectId | string,
        data: ReviewTermReq
    ) {
        return await this.term.findOneAndUpdate(
            { appId, type: "apply", status: "pending" },
            {
                $set: {
                    ...data,
                    reviewedAt: new Date(),
                },
            },
            { new: true }
        );
    }

    async removeApply(appId: mongoose.Types.ObjectId | string) {
        return await this.term.deleteOne({ appId, type: "apply", status: "pending" });
    }

    async retrieve(customerId: string, page: number, limit: number) {
        const match = {
            customerId: new mongoose.Types.ObjectId(customerId),
        };
        const [records, total] = await Promise.all([
            this.term
                .find(match)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            this.term.countDocuments(match),
        ]);
        return { records, total };
    }
}

export const useCustomerTermModel = () => new CustomerTermModel(CustomerTerm);
