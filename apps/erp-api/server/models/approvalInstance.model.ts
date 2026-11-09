import mongoose from "mongoose";
import {
    APPROVAL_STEP_KEYS,
    APPROVAL_STATUSES,
    APPROVAL_TYPES,
    type ApprovalStatus,
    type ApprovalStepKey,
    type ApprovalStepStatus,
    type ApprovalStepUserStatus,
    type ApprovalStrategy,
    type ApprovalType,
    type ApprovalView,
    type PurchaseRequestSnapshot,
    type ReceiptApprovalSnapshot,
    type SalesOrderApprovalSnapshot,
} from "~~/shared/types/approval";
import { ORDER_APPROVAL_FIELDS, ORDER_APPROVAL_VISIBLE_FIELDS_VERSION, type OrderApprovalField } from "~~/shared/types/orderApproval";

const { Schema } = mongoose;

const approvalUserSchema = new Schema(
    {
        adminId: {
            type: Schema.Types.ObjectId,
            ref: "Admin",
            required: true,
        },
        username: {
            type: String,
            required: true,
            trim: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        role: {
            type: Number,
            required: true,
        },
    },
    { _id: false },
);

const approvalStepUserSchema = new Schema(
    {
        user: {
            type: approvalUserSchema,
            required: true,
        },
        status: {
            type: String,
            enum: ["waiting", "pending", "approved", "rejected", "skipped", "completed"],
            required: true,
        },
        firstViewedAt: {
            type: Date,
            default: undefined,
        },
        processedAt: {
            type: Date,
            default: undefined,
        },
        paymentConfirmedAt: {
            type: Date,
            default: undefined,
        },
    },
    { _id: false },
);

const approvalStepSchema = new Schema(
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
        status: {
            type: String,
            enum: ["waiting", "pending", "completed", "rejected", "skipped"],
            required: true,
        },
        users: {
            type: [approvalStepUserSchema],
            default: [],
        },
        visibleFields: { type: [String], enum: ORDER_APPROVAL_FIELDS, default: undefined },
        visibleFieldsVersion: { type: Number, enum: [1, ORDER_APPROVAL_VISIBLE_FIELDS_VERSION], default: undefined },
    },
    { _id: false },
);

const approvalInstanceSchema = new Schema(
    {
        approvalNo: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        type: {
            type: String,
            enum: APPROVAL_TYPES,
            required: true,
            index: true,
        },
        businessId: {
            type: Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        businessSnapshot: {
            type: Schema.Types.Mixed,
            default: null,
        },
        applicant: {
            type: approvalUserSchema,
            required: true,
        },
        status: {
            type: String,
            enum: APPROVAL_STATUSES,
            default: "pending",
            required: true,
            index: true,
        },
        steps: {
            type: [approvalStepSchema],
            required: true,
        },
        unreadUserIds: {
            type: [Schema.Types.ObjectId],
            ref: "Admin",
            default: [],
        },
        rejectReason: {
            type: String,
            trim: true,
            default: undefined,
        },
        completedAt: {
            type: Date,
            default: undefined,
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

approvalInstanceSchema.index(
    { type: 1, businessId: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "pending" },
    },
);
approvalInstanceSchema.index({ "applicant.adminId": 1, createTime: -1 });
approvalInstanceSchema.index({"steps.users.user.adminId": 1, createTime: -1, _id: -1 });
approvalInstanceSchema.index({ unreadUserIds: 1, createTime: -1 });
approvalInstanceSchema.index({ type: 1, businessId: 1, createTime: -1 });
approvalInstanceSchema.index({ type: 1, createTime: -1 });

export const ApprovalInstance =
    mongoose.models.ApprovalInstance
    || mongoose.model("ApprovalInstance", approvalInstanceSchema);

export interface ApprovalInstanceUserData {
    adminId: mongoose.Types.ObjectId;
    username: string;
    name: string;
    role: number;
}

export interface ApprovalInstanceStepUserData {
    user: ApprovalInstanceUserData;
    status: ApprovalStepUserStatus;
    firstViewedAt?: Date;
    processedAt?: Date;
    paymentConfirmedAt?: Date;
}

export interface ApprovalInstanceStepData {
    key: ApprovalStepKey;
    name: string;
    order: number;
    strategy?: ApprovalStrategy;
    status: ApprovalStepStatus;
    users: ApprovalInstanceStepUserData[];
    visibleFields?: OrderApprovalField[];
    visibleFieldsVersion?: number;
}

export type SalesOrderApprovalSnapshotData = Omit<
    SalesOrderApprovalSnapshot,
    | "salespersonId"
    | "orderDate"
    | "receivableDate"
    | "plannedPaymentDate"
    | "plannedPayments"
> & {
    salespersonId?: mongoose.Types.ObjectId;
    orderDate?: Date;
    receivableDate?: Date;
    plannedPaymentDate?: Date;
    plannedPayments?: Array<{ date: Date | null; amount: number; currency?: string }>;
};

export interface ApprovalInstanceBusinessSnapshotMap {
    "sales-order": SalesOrderApprovalSnapshotData;
    receipt: ReceiptApprovalSnapshot;
    borrow: null;
    "purchase-request": PurchaseRequestSnapshot;
}

export type ApprovalInstanceBusinessSnapshot =
    ApprovalInstanceBusinessSnapshotMap[ApprovalType];

export interface ApprovalInstanceData {
    _id: mongoose.Types.ObjectId;
    approvalNo: string;
    type: ApprovalType;
    businessId: mongoose.Types.ObjectId;
    businessSnapshot: ApprovalInstanceBusinessSnapshot;
    applicant: ApprovalInstanceUserData;
    status: ApprovalStatus;
    steps: ApprovalInstanceStepData[];
    unreadUserIds: mongoose.Types.ObjectId[];
    rejectReason?: string;
    completedAt?: Date;
    createTime: Date;
    updateTime: Date;
}

export type ApprovalInstanceListData = Pick<
    ApprovalInstanceData,
    | "_id"
    | "approvalNo"
    | "type"
    | "businessId"
    | "applicant"
    | "status"
    | "unreadUserIds"
    | "completedAt"
    | "createTime"
> & {
    businessSnapshot: {
        customerName?: string;
        amount?: number;
        currency?: string;
        requestNo?: PurchaseRequestSnapshot["requestNo"];
        category?: PurchaseRequestSnapshot["category"];
        items?: PurchaseRequestSnapshot["items"];
        totalQuantity?: PurchaseRequestSnapshot["totalQuantity"];
    } | null;
};

export interface ApprovalInstanceCreateData {
    approvalNo: string;
    type: ApprovalType;
    businessId: mongoose.Types.ObjectId;
    businessSnapshot: ApprovalInstanceBusinessSnapshot;
    applicant: ApprovalInstanceUserData;
    status: ApprovalStatus;
    steps: ApprovalInstanceStepData[];
    unreadUserIds: mongoose.Types.ObjectId[];
    rejectReason?: string;
    completedAt?: Date;
    createTime?: Date;
    updateTime?: Date;
}

export interface ApprovalInstanceCursor {
    createTime: Date;
    id: mongoose.Types.ObjectId;
}

export type ApprovalInstanceListOptions = {
    view: ApprovalView;
    userId: mongoose.Types.ObjectId;
    keyword?: string;
    type?: ApprovalType;
    status?: ApprovalStatus;
    applicantId?: mongoose.Types.ObjectId;
    unreadOnly?: boolean;
    submittedStart?: Date;
    submittedEnd?: Date;
    completedStart?: Date;
    completedEnd?: Date;
    sort?: "asc" | "desc";
    cursor?: ApprovalInstanceCursor;
    pageSize: number;
    applicantOnly?: boolean;
};

type StepTransition = {
    instanceId: mongoose.Types.ObjectId;
    stepKey: ApprovalStepKey;
    userId: mongoose.Types.ObjectId;
    expectedUpdateTime: Date;
    status: "pending" | "approved" | "rejected";
    steps: ApprovalInstanceStepData[];
    unreadUserIds: mongoose.Types.ObjectId[];
    rejectReason?: string;
    completedAt?: Date;
};

type CancelTransition = {
    instanceId: mongoose.Types.ObjectId;
    applicantId: mongoose.Types.ObjectId;
    expectedUpdateTime: Date;
    steps: ApprovalInstanceStepData[];
    unreadUserIds: mongoose.Types.ObjectId[];
    completedAt: Date;
};

class ApprovalInstanceModel {
    async create(data: ApprovalInstanceCreateData, session: mongoose.ClientSession) {
        const instance = new ApprovalInstance(data);
        return await instance.save({ session });
    }

    async findById(
        instanceId: mongoose.Types.ObjectId,
        session?: mongoose.ClientSession,
    ): Promise<ApprovalInstanceData | null> {
        const query = ApprovalInstance.findById(instanceId);
        if (session) query.session(session);
        return await query.lean<ApprovalInstanceData>();
    }

    async deleteById(
        instanceId: mongoose.Types.ObjectId,
        session?: mongoose.ClientSession,
        expected?: Pick<ApprovalInstanceData, "status" | "updateTime">,
    ) {
        return await ApprovalInstance.deleteOne(
            {
                _id: instanceId,
                ...(expected
                    ? {
                        status: expected.status,
                        updateTime: expected.updateTime,
                    }
                    : {}),
            },
            session ? { session } : {},
        );
    }

    async findByBusinessId(
        type: ApprovalType,
        businessId: mongoose.Types.ObjectId,
        session?: mongoose.ClientSession,
    ): Promise<ApprovalInstanceData | null> {
        const query = ApprovalInstance.findOne({ type, businessId });
        if (session) query.session(session);
        return await query.lean<ApprovalInstanceData>();
    }

    async findVisibleById(
        instanceId: mongoose.Types.ObjectId,
        userId: mongoose.Types.ObjectId,
        canViewAll = false,
        applicantOnly = false,
    ): Promise<ApprovalInstanceData | null> {
        return await ApprovalInstance.findOne({
            _id: instanceId,
            ...(applicantOnly
                ? { "applicant.adminId": userId }
                : canViewAll
                ? {}
                : this.buildVisibleFilter(userId)),
        }).lean<ApprovalInstanceData>();
    }

    async findProcessedById(
        instanceId: mongoose.Types.ObjectId,
        userId: mongoose.Types.ObjectId,
        session?: mongoose.ClientSession,
    ): Promise<ApprovalInstanceData | null> {
        const query = ApprovalInstance.findOne({
            _id: instanceId,
            ...this.buildListViewFilter("processed", userId),
        });
        if (session) query.session(session);
        return await query.lean<ApprovalInstanceData>();
    }

    async retrieve(options: ApprovalInstanceListOptions) {
        const viewFilter = this.buildListViewFilter(
            options.view,
            options.userId,
            options.applicantOnly,
        );
        const filters: Record<string, any>[] = [viewFilter];

        if (options.type) filters.push({ type: options.type });
        if (options.status) filters.push({ status: options.status });
        if (options.applicantId) {
            filters.push({ "applicant.adminId": options.applicantId });
        }
        if (options.unreadOnly) filters.push({ unreadUserIds: options.userId });

        if (options.submittedStart || options.submittedEnd) {
            const createTime: Record<string, Date> = {};
            if (options.submittedStart) createTime.$gte = options.submittedStart;
            if (options.submittedEnd) createTime.$lte = options.submittedEnd;
            filters.push({ createTime });
        }
        if (options.completedStart || options.completedEnd) {
            const completedAt: Record<string, Date> = {};
            if (options.completedStart) completedAt.$gte = options.completedStart;
            if (options.completedEnd) completedAt.$lte = options.completedEnd;
            filters.push({ completedAt });
        }

        const keyword = options.keyword?.trim();
        if (keyword) {
            const regex = new RegExp(
                keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                "i",
            );
            filters.push({
                $or: [
                    { approvalNo: regex },
                    { "applicant.username": regex },
                    { "applicant.name": regex },
                    { "businessSnapshot.customerName": regex },
                    { "businessSnapshot.salespersonName": regex },
                    { "businessSnapshot.orderType": regex },
                    { "businessSnapshot.machineNo": regex },
                    { "businessSnapshot.contractNo": regex },
                    { "businessSnapshot.sampleRequirement": regex },
                    { "businessSnapshot.installationRequirement": regex },
                    { "businessSnapshot.testingRequirement": regex },
                    { "businessSnapshot.orderRemark": regex },
                    { "businessSnapshot.products.productCode": regex },
                    { "businessSnapshot.products.productName": regex },
                    { "businessSnapshot.products.model": regex },
                    { "businessSnapshot.requestNo": regex },
                    { "businessSnapshot.category": regex },
                    { "businessSnapshot.items.name": regex },
                    { "businessSnapshot.items.model": regex },
                    { "businessSnapshot.items.unit": regex },
                    { "businessSnapshot.remark": regex },
                ],
            });
        }

        if (options.cursor) {
            const cursorOperator = options.sort === "asc" ? "$gt" : "$lt";
            filters.push({
                $or: [
                    {
                        createTime: {
                            [cursorOperator]: options.cursor.createTime,
                        },
                    },
                    {
                        createTime: options.cursor.createTime,
                        _id: { [cursorOperator]: options.cursor.id },
                    },
                ],
            });
        }

        const sortDirection = options.sort === "asc" ? 1 : -1;
        const filter = { $and: filters };
        const matches = await ApprovalInstance.find(filter)
            .select([
                "approvalNo",
                "type",
                "businessId",
                "businessSnapshot.customerName",
                "businessSnapshot.amount",
                "businessSnapshot.currency",
                "businessSnapshot.requestNo",
                "businessSnapshot.category",
                "businessSnapshot.items",
                "businessSnapshot.totalQuantity",
                "businessSnapshot.remark",
                "applicant",
                "status",
                "unreadUserIds",
                "completedAt",
                "createTime",
            ])
            .sort({ createTime: sortDirection, _id: sortDirection })
            .limit(options.pageSize + 1)
            .lean<ApprovalInstanceListData[]>();
        const hasMore = matches.length > options.pageSize;
        const list = hasMore ? matches.slice(0, options.pageSize) : matches;

        return {
            list,
            pagination: {
                pageSize: options.pageSize,
                hasMore,
            },
        };
    }

    async countUnreadByView(
        userId: mongoose.Types.ObjectId,
        applicantOnly = false,
    ) {
        const [result] = await ApprovalInstance.aggregate([
            {
                $match: {
                    unreadUserIds: userId,
                    ...(applicantOnly ? { "applicant.adminId": userId } : {}),
                },
            },
            {
                $facet: {
                    pending: [
                        {
                            $match: this.buildListViewFilter(
                                "pending",
                                userId,
                                applicantOnly,
                            ),
                        },
                        { $count: "total" },
                    ],
                    processed: [
                        {
                            $match: this.buildListViewFilter(
                                "processed",
                                userId,
                                applicantOnly,
                            ),
                        },
                        { $count: "total" },
                    ],
                    mine: [
                        {
                            $match: this.buildListViewFilter(
                                "mine",
                                userId,
                                applicantOnly,
                            ),
                        },
                        { $count: "total" },
                    ],
                    cc: [
                        {
                            $match: this.buildListViewFilter(
                                "cc",
                                userId,
                                applicantOnly,
                            ),
                        },
                        { $count: "total" },
                    ],
                    all: [{ $count: "total" }],
                },
            },
        ]);
        const total = (key: ApprovalView) => Number(result?.[key]?.[0]?.total || 0);

        return {
            pending: total("pending"),
            processed: total("processed"),
            mine: total("mine"),
            cc: total("cc"),
            all: total("all"),
            unread: total("all"),
        };
    }

    async countPending(
        userId: mongoose.Types.ObjectId,
        applicantOnly = false,
    ) {
        return await ApprovalInstance.countDocuments(
            this.buildListViewFilter("pending", userId, applicantOnly),
        );
    }

    async findPendingByBusinessId(
        type: ApprovalType,
        businessId: mongoose.Types.ObjectId,
        session?: mongoose.ClientSession,
    ): Promise<ApprovalInstanceData | null> {
        const query = ApprovalInstance.findOne({
            type,
            businessId,
            status: "pending",
        });
        if (session) query.session(session);
        return await query.lean<ApprovalInstanceData>();
    }

    async findLatestStepsByBusinessIds(
        type: ApprovalType,
        businessIds: mongoose.Types.ObjectId[],
    ): Promise<Array<{
        businessId: mongoose.Types.ObjectId;
        steps: ApprovalInstanceStepData[];
    }>> {
        if (businessIds.length === 0) return [];

        return await ApprovalInstance.aggregate<{
            businessId: mongoose.Types.ObjectId;
            steps: ApprovalInstanceStepData[];
        }>([
            {
                $match: {
                    type,
                    businessId: { $in: businessIds },
                },
            },
            { $sort: { createTime: -1, _id: -1 } },
            {
                $group: {
                    _id: "$businessId",
                    steps: { $first: "$steps" },
                },
            },
            {
                $project: {
                    _id: 0,
                    businessId: "$_id",
                    steps: 1,
                },
            },
        ]);
    }

    async transitionPendingStep(
        transition: StepTransition,
        session: mongoose.ClientSession,
    ): Promise<ApprovalInstanceData | null> {
        return await ApprovalInstance.findOneAndUpdate(
            {
                _id: transition.instanceId,
                status: "pending",
                updateTime: transition.expectedUpdateTime,
                steps: {
                    $elemMatch: {
                        key: transition.stepKey,
                        status: "pending",
                        users: {
                            $elemMatch: {
                                "user.adminId": transition.userId,
                                status: "pending",
                            },
                        },
                    },
                },
            },
            {
                $set: {
                    status: transition.status,
                    steps: transition.steps,
                    unreadUserIds: transition.unreadUserIds,
                    ...(transition.rejectReason !== undefined
                        ? { rejectReason: transition.rejectReason }
                        : {}),
                    ...(transition.completedAt
                        ? { completedAt: transition.completedAt }
                        : {}),
                },
            },
            { new: true, runValidators: true, session },
        ).lean<ApprovalInstanceData>();
    }

    async cancelPending(
        transition: CancelTransition,
        session: mongoose.ClientSession,
    ): Promise<ApprovalInstanceData | null> {
        return await ApprovalInstance.findOneAndUpdate(
            {
                _id: transition.instanceId,
                status: "pending",
                updateTime: transition.expectedUpdateTime,
                "applicant.adminId": transition.applicantId,
            },
            {
                $set: {
                    status: "cancelled",
                    steps: transition.steps,
                    unreadUserIds: transition.unreadUserIds,
                    completedAt: transition.completedAt,
                },
            },
            { new: true, runValidators: true, session },
        ).lean<ApprovalInstanceData>();
    }

    async markViewed(
        instanceId: mongoose.Types.ObjectId,
        userId: mongoose.Types.ObjectId,
        viewedAt: Date,
        canViewAll = false,
        session?: mongoose.ClientSession,
    ): Promise<ApprovalInstanceData | null> {
        return await ApprovalInstance.findOneAndUpdate(
            {
                _id: instanceId,
                ...(canViewAll
                    ? {}
                    : this.buildVisibleFilter(userId)),
            },
            {
                $pull: { unreadUserIds: userId },
                $set: {
                    "steps.$[].users.$[viewer].firstViewedAt": viewedAt,
                },
            },
            {
                new: true,
                runValidators: true,
                ...(session ? { session } : {}),
                arrayFilters: [
                    {
                        "viewer.user.adminId": userId,
                        "viewer.firstViewedAt": { $exists: false },
                    },
                ],
            },
        ).lean<ApprovalInstanceData>();
    }

    private buildListViewFilter(
        view: ApprovalView,
        userId: mongoose.Types.ObjectId,
        applicantOnly = false,
    ): Record<string, any> {
        if (!applicantOnly) {
            return this.buildViewFilter(view, userId);
        }

        const applicantFilter = { "applicant.adminId": userId };
        if (view === "pending") {
            return {
                ...applicantFilter,
                status: "pending",
            };
        }
        if (view === "processed") {
            return {
                ...applicantFilter,
                status: { $in: ["approved", "rejected", "cancelled"] },
            };
        }
        if (view === "cc") {
            return {
                $and: [
                    applicantFilter,
                    this.buildViewFilter("cc", userId),
                ],
            };
        }
        return applicantFilter;
    }

    private buildViewFilter(
        view: ApprovalView,
        userId: mongoose.Types.ObjectId,
    ): Record<string, any> {
        if (view === "mine") {
            return { "applicant.adminId": userId };
        }
        if (view === "pending") {
            return {
                status: "pending",
                steps: {
                    $elemMatch: {
                        status: "pending",
                        users: {
                            $elemMatch: {
                                "user.adminId": userId,
                                status: "pending",
                            },
                        },
                    },
                },
            };
        }
        if (view === "processed") {
            return {
                steps: {
                    $elemMatch: {
                        key: { $in: ["first-approval", "second-approval", "third-approval"] },
                        users: {
                            $elemMatch: {
                                "user.adminId": userId,
                                status: { $in: ["approved", "rejected"] },
                            },
                        },
                    },
                },
            };
        }
        if (view === "cc") {
            return {
                steps: {
                    $elemMatch: {
                        key: { $in: ["cc", "shooting-cc"] },
                        status: "completed",
                        users: {
                            $elemMatch: {
                                "user.adminId": userId,
                                status: "completed",
                            },
                        },
                    },
                },
            };
        }
        return {};
    }

    private buildVisibleFilter(userId: mongoose.Types.ObjectId) {
        return {
            $or: [
                { "applicant.adminId": userId },
                { unreadUserIds: userId },
                {
                    steps: {
                        $elemMatch: {
                            users: {
                                $elemMatch: {
                                    "user.adminId": userId,
                                    status: {
                                        $in: [
                                            "pending",
                                            "approved",
                                            "rejected",
                                            "completed",
                                        ],
                                    },
                                },
                            },
                        },
                    },
                },
                {
                    steps: {
                        $elemMatch: {
                            users: {
                                $elemMatch: {
                                    "user.adminId": userId,
                                    status: "skipped",
                                    firstViewedAt: { $exists: true },
                                },
                            },
                        },
                    },
                },
            ],
        };
    }
}

export const useApprovalInstanceModel = () => new ApprovalInstanceModel();
