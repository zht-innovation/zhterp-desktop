import mongoose from "mongoose";
import {
    APPROVAL_STEP_KEYS,
    APPROVAL_TYPES,
    type ApprovalStepKey,
    type ApprovalStrategy,
    type ApprovalType,
} from "~~/shared/types/approval";
import { ORDER_APPROVAL_FIELDS, ORDER_APPROVAL_VISIBLE_FIELDS_VERSION, type OrderApprovalField } from "~~/shared/types/orderApproval";

const { Schema } = mongoose;

export interface ApprovalFlowRuleData {
    applicantRole: number | null;
    approverIds: mongoose.Types.ObjectId[];
    enabled: boolean;
    visibleFields?: OrderApprovalField[];
    visibleFieldsVersion?: number;
}

export interface ApprovalFlowStepData {
    key: ApprovalStepKey;
    name: string;
    order: number;
    strategy?: ApprovalStrategy;
    rules: ApprovalFlowRuleData[];
}

export interface ApprovalFlowConfigData {
    _id: mongoose.Types.ObjectId;
    type: ApprovalType;
    steps: ApprovalFlowStepData[];
    createTime?: Date;
    updateTime?: Date;
}

const flowRuleSchema = new Schema<ApprovalFlowRuleData>(
    {
        applicantRole: {
            type: Number,
            default: null,
        },
        approverIds: {
            type: [Schema.Types.ObjectId],
            default: [],
        },
        enabled: {
            type: Boolean,
            required: true,
            default: true,
        },
        visibleFields: { type: [String], enum: ORDER_APPROVAL_FIELDS, default: undefined },
        visibleFieldsVersion: { type: Number, enum: [1, ORDER_APPROVAL_VISIBLE_FIELDS_VERSION], default: undefined },
    },
    { _id: false },
);

const approvalFlowStepSchema = new Schema<ApprovalFlowStepData>(
    {
        key: {
            type: String,
            enum: APPROVAL_STEP_KEYS,
            required: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        order: {
            type: Number,
            required: true,
        },
        strategy: {
            type: String,
            enum: ["sequential", "any"],
            default: undefined,
        },
        rules: {
            type: [flowRuleSchema],
            default: [],
        },
    },
    { _id: false },
);

const approvalFlowConfigSchema = new Schema<ApprovalFlowConfigData>(
    {
        type: {
            type: String,
            enum: APPROVAL_TYPES,
            required: true,
            unique: true,
        },
        steps: {
            type: [approvalFlowStepSchema],
            required: true,
        },
    },
    {
        versionKey: false,
        timestamps: {
            createdAt: "createTime",
            updatedAt: "updateTime",
        },
    },
);

const ApprovalFlowConfig: mongoose.Model<ApprovalFlowConfigData> =
    mongoose.models.ApprovalFlowConfig
    || mongoose.model<ApprovalFlowConfigData>(
        "ApprovalFlowConfig",
        approvalFlowConfigSchema,
    );

class ApprovalFlowConfigModel {
    async create(
        data: Pick<ApprovalFlowConfigData, "type" | "steps">,
        session: mongoose.ClientSession,
    ): Promise<ApprovalFlowConfigData> {
        const [config] = await ApprovalFlowConfig.create([data], { session });
        return config!.toObject<ApprovalFlowConfigData>();
    }

    async findAll(): Promise<ApprovalFlowConfigData[]> {
        return await ApprovalFlowConfig.find({}).lean();
    }

    async findByType(
        type: ApprovalType,
        session?: mongoose.ClientSession,
    ): Promise<ApprovalFlowConfigData | null> {
        const query = ApprovalFlowConfig.findOne({ type });
        if (session) query.session(session);
        return await query.lean();
    }

    async update(
        type: ApprovalType,
        steps: ApprovalFlowStepData[],
    ): Promise<ApprovalFlowConfigData> {
        const config = await ApprovalFlowConfig.findOneAndUpdate(
            { type },
            { $set: { steps } },
            {
                upsert: true,
                new: true,
                runValidators: true,
                setDefaultsOnInsert: true,
            },
        ).lean();
        return config!;
    }
}

export const useApprovalFlowConfigModel = () =>
    new ApprovalFlowConfigModel();

export {
    ApprovalFlowConfig,
    approvalFlowConfigSchema,
};
