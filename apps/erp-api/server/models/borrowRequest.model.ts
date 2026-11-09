import mongoose from "mongoose";
import { ADMIN_ROLE, ADMIN_ROLE_NAME, isApprovalApplicantRole } from "~~/shared/enums";
import { CODE } from "~~/server/utils/code";
import {
    InventoryHttpError,
    escapeRegExp,
    getPageParams,
    isValidObjectId,
    throwInventoryError,
    toNumber,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import { useAdminModel } from "~~/server/models/admin.model";
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";
import { useInventoryProductModel } from "~~/server/models/inventoryProduct.model";

const { Schema } = mongoose;

export const BORROW_REQUEST_STATUS = {
    PENDING: "审批中",
    APPROVED: "已通过",
    REJECTED: "已驳回",
    CANCELLED: "已撤销",
} as const;

const LEGACY_PENDING_DEPARTMENT_STATUS = "待主管审批";

const FLOW_CONFIG_KEY = "borrow-request";

const borrowApprovalRecordSchema = new Schema(
    {
        nodeKey: String,
        nodeName: String,
        approverLabel: String,
        approverIds: {
            type: [Schema.Types.ObjectId],
            default: [],
        },
        approverSnapshots: {
            type: [
                {
                    adminId: String,
                    username: String,
                    nickname: String,
                    role: Number,
                },
            ],
            default: [],
        },
        approved: {
            type: Boolean,
            default: false,
        },
        approvedById: {
            type: Schema.Types.ObjectId,
            default: null,
        },
        approvedByName: {
            type: String,
            default: "",
        },
        approvedAt: {
            type: Date,
            default: null,
        },
        rejected: {
            type: Boolean,
            default: false,
        },
        rejectedById: {
            type: Schema.Types.ObjectId,
            default: null,
        },
        rejectedByName: {
            type: String,
            default: "",
        },
        rejectedAt: {
            type: Date,
            default: null,
        },
        rejectReason: {
            type: String,
            default: "",
        },
    },
    { _id: false },
);

const borrowRequestItemSchema = new Schema(
    {
        materialId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryProduct",
            default: null,
        },
        materialCode: {
            type: String,
            default: "",
        },
        materialName: {
            type: String,
            default: "",
        },
        materialModel: {
            type: String,
            default: "",
        },
        materialUnitName: {
            type: String,
            default: "",
        },
        image: {
            type: String,
            default: "",
        },
        quantity: {
            type: Number,
            min: 0,
        },
    },
    { _id: false },
);

const borrowRequestSchema = new Schema(
    {
        requestNo: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        applicantId: {
            type: Schema.Types.ObjectId,
            ref: "Admin",
            default: null,
            index: true,
        },
        applicantUsername: {
            type: String,
            default: "",
        },
        applicantName: {
            type: String,
            default: "",
        },
        applicantRole: {
            type: Number,
            default: ADMIN_ROLE.VENDOR,
            index: true,
        },
        borrower: {
            type: String,
            default: "",
        },
        materialId: {
            type: Schema.Types.ObjectId,
            ref: "InventoryProduct",
            default: null,
            index: true,
        },
        materialCode: {
            type: String,
            default: "",
        },
        materialName: {
            type: String,
            default: "",
        },
        materialModel: {
            type: String,
            default: "",
        },
        materialUnitName: {
            type: String,
            default: "",
        },
        image: {
            type: String,
            default: "",
        },
        quantity: {
            type: Number,
            min: 0,
            default: null,
        },
        items: {
            type: [borrowRequestItemSchema],
            default: [],
        },
        expectedReturnDate: {
            type: Date,
            required: true,
        },
        reason: {
            type: String,
            default: "",
        },
        status: {
            type: String,
            default: BORROW_REQUEST_STATUS.PENDING,
            index: true,
        },
        approvalRecords: {
            type: [borrowApprovalRecordSchema],
            default: undefined,
        },
        createdBy: {
            type: String,
            default: "",
        },
        updatedBy: {
            type: String,
            default: "",
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

borrowRequestSchema.index({ status: 1, updateTime: -1 });
borrowRequestSchema.index({ applicantId: 1, updateTime: -1 });

const flowRuleSchema = new Schema(
    {
        applicantRole: {
            type: Number,
            default: null,
        },
        applicantRoleName: {
            type: String,
            default: "全部角色",
        },
        approverIds: {
            type: [Schema.Types.ObjectId],
            default: [],
        },
        approverSnapshots: {
            type: [
                {
                    adminId: String,
                    username: String,
                    nickname: String,
                    role: Number,
                },
            ],
            default: [],
        },
        enabled: {
            type: Boolean,
            default: true,
        },
        sort: {
            type: Number,
            default: 0,
        },
    },
    { _id: true },
);

const borrowApprovalFlowConfigSchema = new Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            default: FLOW_CONFIG_KEY,
        },
        rules: {
            type: [flowRuleSchema],
            default: [],
        },
        updatedBy: {
            type: String,
            default: "",
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

const BorrowRequest: any =
    mongoose.models.BorrowRequest || mongoose.model("BorrowRequest", borrowRequestSchema);

const BorrowApprovalFlowConfig: any =
    mongoose.models.BorrowApprovalFlowConfig ||
    mongoose.model("BorrowApprovalFlowConfig", borrowApprovalFlowConfigSchema);

export type BorrowRequestItemPayload = {
    materialId?: string;
    quantity?: number;
};

export type BorrowRequestCreatePayload = {
    borrower?: string;
    items?: BorrowRequestItemPayload[];
    expectedReturnDate?: string;
    reason?: string;
    materialId?: string;
    quantity?: number;
};

export type BorrowFlowRulePayload = {
    applicantRole?: number | string | null;
    approverIds?: string[];
    enabled?: boolean;
    sort?: number;
};

const roleName = (role: unknown) => {
    const roleNumber = Number(role);
    return ADMIN_ROLE_NAME[roleNumber as ADMIN_ROLE] || "全部角色";
};

const getAdminName = (admin: any) =>
    toText(admin?.nickname) || toText(admin?.username) || "审批人";

const getAdminId = (admin: any) => admin?._id?.toString?.() || "";

const getAdminSnapshot = (admin: any) => ({
    adminId: getAdminId(admin),
    username: toText(admin?.username),
    nickname: toText(admin?.nickname) || toText(admin?.username),
    role: Number(admin?.role),
});

const uniqueIds = (ids: string[] = []) => [
    ...new Set(ids.map((id) => toText(id)).filter(Boolean)),
];

const normalizeRoleValue = (value: unknown) => {
    const text = toText(value);
    if (!text || text === "default" || text === "all") return null;
    const role = Number(text);
    if (!Number.isInteger(role) || !isApprovalApplicantRole(role)) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "申请人角色条件不合法");
    }
    return role;
};

const normalizeDate = (value: unknown) => {
    const text = toText(value);
    if (!text) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "预计归还日期不能为空");
    }

    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "预计归还日期格式错误");
    }

    return date;
};

const assertQuantity = (value: unknown) => {
    const quantity = toNumber(value, 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "借用数量必须大于0");
    }
    return quantity;
};

export type BorrowRequestLineItem = {
    materialId: any;
    materialCode: string;
    materialName: string;
    materialModel: string;
    materialUnitName: string;
    image: string;
    quantity: number;
};

export const getBorrowRequestItems = (doc: any): BorrowRequestLineItem[] => {
    if (!doc || typeof doc !== "object") return [];
    if (Array.isArray(doc.items) && doc.items.length) {
        return doc.items.map((item: any) => ({
            materialId: item?.materialId ?? null,
            materialCode: toText(item?.materialCode),
            materialName: toText(item?.materialName),
            materialModel: toText(item?.materialModel),
            materialUnitName: toText(item?.materialUnitName),
            image: toText(item?.image),
            quantity: toNumber(item?.quantity, 0),
        }));
    }
    if (doc.materialId || doc.quantity) {
        return [
            {
                materialId: doc.materialId ?? null,
                materialCode: toText(doc.materialCode),
                materialName: toText(doc.materialName),
                materialModel: toText(doc.materialModel),
                materialUnitName: toText(doc.materialUnitName),
                image: toText(doc.image),
                quantity: toNumber(doc.quantity, 0),
            },
        ];
    }
    return [];
};

const buildRequestNo = async (session: mongoose.ClientSession) => {
    const now = new Date();
    const dateKey = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("");
    const serial = await useInventoryCounterModel().nextNumber(
        `borrow-request:${dateKey}`,
        session,
    );
    return `BR${dateKey}${String(serial).padStart(4, "0")}`;
};

class BorrowApprovalFlowConfigModel {
    flow: any;

    constructor(flow: any) {
        this.flow = flow;
    }

    async getConfig() {
        let config: any = await this.flow.findOne({ key: FLOW_CONFIG_KEY }).lean();
        if (!config) {
            config = await this.flow.create({ key: FLOW_CONFIG_KEY, rules: [] });
            config = typeof config.toObject === "function" ? config.toObject() : config;
        }
        return config;
    }

    async updateRules(rules: BorrowFlowRulePayload[], actor = "") {
        const normalized = await this.normalizeRules(rules);
        const config = await this.flow.findOneAndUpdate(
            { key: FLOW_CONFIG_KEY },
            { $set: { rules: normalized, updatedBy: actor } },
            { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean();
        return config;
    }

    async resolveFlow(applicantRole: unknown) {
        const [config, warehouseApprovers] = await Promise.all([
            this.getConfig(),
            useAdminModel().findBorrowWarehouseApprovers(),
        ]);
        if (!warehouseApprovers.length) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "请先配置库管账号作为仓库审批人");
        }

        const role = Number(applicantRole);
        const enabledRules = [...(config.rules || [])]
            .filter((rule: any) => rule.enabled !== false)
            .sort((a: any, b: any) => Number(a.sort || 0) - Number(b.sort || 0));
        const matchedRule =
            enabledRules.find((rule: any) => Number(rule.applicantRole) === role) ||
            enabledRules.find((rule: any) => rule.applicantRole === null || rule.applicantRole === undefined);
        let departmentApprovers = matchedRule?.approverSnapshots || [];
        let departmentLabel = matchedRule
            ? `${matchedRule.applicantRoleName || roleName(matchedRule.applicantRole)}主管`
            : "部门主管";

        if (!departmentApprovers.length) {
            const superAdmins = await useAdminModel().findAdminsByRole(ADMIN_ROLE.SUPER);
            departmentApprovers = superAdmins.map(getAdminSnapshot);
            departmentLabel = "部门主管";
        }

        if (!departmentApprovers.length) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "请先配置部门主管审批人");
        }

        const warehouseSnapshots = warehouseApprovers.map(getAdminSnapshot);

        return {
            warehouseLabel: "仓库管理员",
            departmentLabel,
            warehouseApprovers: warehouseSnapshots,
            departmentApprovers,
            flowText: `仓库管理员 -> ${departmentLabel}`,
        };
    }

    private async normalizeRules(rules: BorrowFlowRulePayload[] = []) {
        if (!Array.isArray(rules)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "审批规则必须是数组");
        }

        const normalized: any[] = [];
        const seenRoles = new Set<string>();
        for (let index = 0; index < rules.length; index += 1) {
            const rule = rules[index] || {};
            const applicantRole = normalizeRoleValue(rule.applicantRole);
            const roleKey = applicantRole === null ? "default" : String(applicantRole);
            if (seenRoles.has(roleKey)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "同一申请人角色只能配置一条审批规则");
            }
            seenRoles.add(roleKey);

            const approverIds = uniqueIds(rule.approverIds || []);
            if (approverIds.length === 0) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "审批规则必须配置审批人员");
            }
            if (approverIds.some((id) => !isValidObjectId(id))) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "审批人员格式错误");
            }

            const approvers = await useAdminModel().findAdminsByIdsWithRole(approverIds);
            if (approvers.length !== approverIds.length) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "存在无效审批人员");
            }

            normalized.push({
                applicantRole,
                applicantRoleName: applicantRole === null ? "全部角色" : roleName(applicantRole),
                approverIds: approverIds.map((id) => toObjectId(id)).filter(Boolean),
                approverSnapshots: approvers.map(getAdminSnapshot),
                enabled: rule.enabled !== false,
                sort: Number.isFinite(Number(rule.sort)) ? Number(rule.sort) : index,
            });
        }

        return normalized.sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
    }
}

class BorrowRequestModel {
    request: any;

    constructor(request: any) {
        this.request = request;
    }

    async retrieve(options: {
        keyword?: string;
        status?: string;
        page?: number;
        limit?: number;
        currentAdminId?: string | null;
        canViewAll?: boolean;
    } = {}) {
        const pageOptions = getPageParams({ page: options.page, limit: options.limit || 10 });
        const filter: Record<string, any> = {};

        if (options.status) {
            filter.status = options.status;
        }

        const keyword = toText(options.keyword);
        if (keyword) {
            const regex = new RegExp(escapeRegExp(keyword), "i");
            filter.$or = [
                { requestNo: regex },
                { applicantUsername: regex },
                { applicantName: regex },
                { borrower: regex },
                { materialCode: regex },
                { materialName: regex },
                { materialModel: regex },
                { "items.materialCode": regex },
                { "items.materialName": regex },
                { "items.materialModel": regex },
                { reason: regex },
            ];
        }

        if (!options.canViewAll && options.currentAdminId && isValidObjectId(options.currentAdminId)) {
            const relatedFilter = [
                { applicantId: toObjectId(options.currentAdminId) },
                { "approvalRecords.approverIds": toObjectId(options.currentAdminId) },
            ];
            if (filter.$or) {
                filter.$and = [{ $or: filter.$or }, { $or: relatedFilter }];
                delete filter.$or;
            } else {
                filter.$or = relatedFilter;
            }
        }

        const [list, total] = await Promise.all([
            this.request
                .find(filter)
                .sort({ updateTime: -1, createTime: -1 })
                .skip(pageOptions.skip)
                .limit(pageOptions.limit)
                .lean(),
            this.request.countDocuments(filter),
        ]);

        return {
            list: list.map((item: any) => this.serialize(item, options.currentAdminId)),
            pagination: {
                page: pageOptions.page,
                limit: pageOptions.limit,
                total,
                hasMore: pageOptions.skip + list.length < total,
            },
        };
    }

    async findByIds(
        ids: mongoose.Types.ObjectId[],
        mode: "summary" | "detail",
    ) {
        if (ids.length === 0) return [];
        const fields = mode === "summary"
            ? [
                "requestNo",
                "items",
                "materialName",
                "materialModel",
                "materialUnitName",
                "quantity",
            ]
            : [
                "requestNo",
                "applicantId",
                "applicantUsername",
                "applicantName",
                "applicantRole",
                "borrower",
                "items",
                "materialId",
                "materialCode",
                "materialName",
                "materialModel",
                "materialUnitName",
                "quantity",
                "expectedReturnDate",
                "reason",
                "status",
                "createTime",
            ];
        return await this.request.find({ _id: { $in: ids } })
            .select(fields)
            .lean();
    }

    async create(
        payload: BorrowRequestCreatePayload,
        auth: any,
        session: mongoose.ClientSession,
    ) {
        if (!session?.inTransaction()) {
            throw new Error("借用申请必须在 MongoDB transaction 中创建");
        }

        const username = toText(auth?.username);
        if (!username) {
            throwInventoryError(401, CODE.INVALID_PARAMS, "申请人不存在");
        }

        const input: BorrowRequestCreatePayload = payload
            && typeof payload === "object"
            && !Array.isArray(payload)
            ? payload
            : {};
        const rawItems = Array.isArray(input.items) && input.items.length
            ? input.items
            : input.materialId
                ? [{ materialId: input.materialId, quantity: input.quantity }]
                : [];
        if (!rawItems.length) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "请选择借用物料");
        }
        if (rawItems.length > 50) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "借用物料不能超过50项");
        }
        const normalizedItems = rawItems.map((item: BorrowRequestItemPayload) => {
            const materialId = typeof item?.materialId === "string"
                ? item.materialId.trim()
                : "";
            if (!isValidObjectId(materialId)) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "借用物料格式错误");
            }
            return {
                materialId,
                quantity: assertQuantity(item?.quantity),
            };
        });
        const uniqueMaterialIds = new Set(normalizedItems.map((item) => item.materialId));
        if (uniqueMaterialIds.size !== normalizedItems.length) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "存在重复借用物料");
        }
        const borrower = toText(input.borrower);
        const expectedReturnDate = normalizeDate(input.expectedReturnDate);
        const reason = toText(input.reason);

        if (!borrower) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "借用人不能为空");
        }

        if (!reason) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "借用事由不能为空");
        }

        const admin = await useAdminModel().findAdminByUsername(username);
        if (!admin) {
            throwInventoryError(401, CODE.INVALID_PARAMS, "申请人不存在");
        }
        const products = await Promise.all(
            [...uniqueMaterialIds].map((materialId) =>
                useInventoryProductModel().findById(materialId)),
        );
        const productByMaterialId = new Map<string, any>();
        products.forEach((product) => {
            const productDoc: any = product;
            if (!productDoc?._id) return;
            productByMaterialId.set(String(productDoc._id), productDoc);
        });
        const items = normalizedItems.map((item) => {
            const productDoc = productByMaterialId.get(item.materialId);
            if (!productDoc) {
                throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "借用物料不存在");
            }
            return {
                materialId: toObjectId(item.materialId),
                materialCode: productDoc.code || "",
                materialName: productDoc.name || productDoc.model || "",
                materialModel: productDoc.model || "",
                materialUnitName: productDoc.unitName || "",
                image: productDoc.image || "",
                quantity: item.quantity,
            };
        });
        const adminDoc: any = admin;
        const actor = getAdminName(adminDoc);
        const doc = new this.request({
            requestNo: await buildRequestNo(session),
            applicantId: adminDoc._id,
            applicantUsername: adminDoc.username || "",
            applicantName: actor,
            applicantRole: Number(adminDoc.role),
            borrower,
            items,
            expectedReturnDate,
            reason,
            status: BORROW_REQUEST_STATUS.PENDING,
            createdBy: actor,
            updatedBy: actor,
        });
        await doc.save({ session });

        const created = doc.toObject();
        return {
            ...created,
            _id: created._id?.toString?.() || created._id,
            applicantId: created.applicantId?.toString?.() || created.applicantId,
            materialId: created.materialId?.toString?.() || created.materialId,
            items: getBorrowRequestItems(created).map((item) => ({
                ...item,
                materialId: item.materialId?.toString?.() || item.materialId,
            })),
        };
    }

    async updateStatus(
        id: string,
        status: string,
        actor: string,
        session: mongoose.ClientSession,
    ) {
        if (!session?.inTransaction()) {
            throw new Error("借用审批业务处理必须在 MongoDB transaction 中执行");
        }
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "借用申请ID格式错误");
        }

        const updated = await this.request.findOneAndUpdate(
            {
                _id: toObjectId(id),
                status: BORROW_REQUEST_STATUS.PENDING,
            },
            {
                $set: {
                    status,
                    updatedBy: toText(actor),
                },
            },
            { new: true, runValidators: true, session },
        );
        if (!updated) {
            throw new Error("借用申请不存在或状态已变化，请刷新后重试");
        }
        return updated;
    }

    async approve(id: string, auth: any) {
        const { request, admin, currentRecord } = await this.getActionContext(id, auth);
        currentRecord.approved = true;
        currentRecord.approvedById = admin._id;
        currentRecord.approvedByName = getAdminName(admin);
        currentRecord.approvedAt = new Date();
        request.updatedBy = getAdminName(admin);

        const nextRecord = this.getCurrentRecord(request);
        request.status = nextRecord
            ? LEGACY_PENDING_DEPARTMENT_STATUS
            : BORROW_REQUEST_STATUS.APPROVED;
        await request.save();
        return this.serialize(request.toObject(), getAdminId(admin));
    }

    async reject(id: string, reason: string, auth: any) {
        const normalizedReason = toText(reason);
        if (!normalizedReason) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "请填写驳回原因");
        }

        const { request, admin, currentRecord } = await this.getActionContext(id, auth);
        currentRecord.rejected = true;
        currentRecord.rejectedById = admin._id;
        currentRecord.rejectedByName = getAdminName(admin);
        currentRecord.rejectedAt = new Date();
        currentRecord.rejectReason = normalizedReason;
        request.status = BORROW_REQUEST_STATUS.REJECTED;
        request.updatedBy = getAdminName(admin);
        await request.save();
        return this.serialize(request.toObject(), getAdminId(admin));
    }

    async getCurrentAdmin(auth: any) {
        const admin = await useAdminModel().findAdminByUsername(toText(auth?.username));
        if (!admin) return null;
        return {
            id: getAdminId(admin),
            admin,
        };
    }

    serialize(item: any, currentAdminId?: string | null) {
        const approvalRecords = Array.isArray(item.approvalRecords) ? item.approvalRecords : [];
        const currentRecord = this.getCurrentRecord(item);
        const currentNodeName = currentRecord?.nodeName || "";
        const canAudit = Boolean(
            currentRecord &&
            currentAdminId &&
            this.recordIncludesApprover(currentRecord, currentAdminId),
        );
        const flowText = approvalRecords
            .map((record: any) => record.approverLabel || record.nodeName)
            .filter(Boolean)
            .join(" -> ");
        const items = getBorrowRequestItems(item).map((lineItem) => ({
            ...lineItem,
            materialId: lineItem.materialId?.toString?.() || lineItem.materialId,
        }));

        return {
            ...item,
            _id: item._id?.toString?.() || item._id,
            applicantId: item.applicantId?.toString?.() || item.applicantId,
            materialId: item.materialId?.toString?.() || item.materialId,
            items,
            itemCount: items.length,
            approvalRecords: approvalRecords.map((record: any) => ({
                ...record,
                approverIds: (record.approverIds || []).map((approverId: any) => approverId?.toString?.() || approverId),
                approvedById: record.approvedById?.toString?.() || record.approvedById,
                rejectedById: record.rejectedById?.toString?.() || record.rejectedById,
            })),
            currentNodeName,
            canAudit,
            flowText,
        };
    }

    private async getActionContext(id: string, auth: any) {
        if (!isValidObjectId(id)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "申请ID格式错误");
        }

        const [request, admin] = await Promise.all([
            this.request.findOne({ _id: id }),
            useAdminModel().findAdminByUsername(toText(auth?.username)),
        ]);
        if (!request) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "借用申请不存在");
        }
        if (!admin) {
            throwInventoryError(401, CODE.INVALID_PARAMS, "审批人不存在");
        }
        const adminDoc: any = admin;
        if ([BORROW_REQUEST_STATUS.APPROVED, BORROW_REQUEST_STATUS.REJECTED].includes(request.status)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "该申请已结束");
        }

        const currentRecord = this.getCurrentRecord(request);
        if (!currentRecord) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "当前没有待审批节点");
        }
        if (!this.recordIncludesApprover(currentRecord, getAdminId(adminDoc))) {
            throwInventoryError(403, CODE.INVALID_PARAMS, "当前账号不是该节点审批人");
        }

        return { request, admin: adminDoc, currentRecord };
    }

    private getCurrentRecord(request: any) {
        const records = Array.isArray(request.approvalRecords) ? request.approvalRecords : [];
        return records.find((record: any) => !record.approved && !record.rejected);
    }

    private recordIncludesApprover(record: any, adminId: string) {
        const id = toText(adminId);
        if (!id) return false;
        return (record.approverIds || []).some((approverId: any) =>
            (approverId?.toString?.() || String(approverId)) === id,
        );
    }
}

export const isBorrowRequestError = (err: unknown): err is InventoryHttpError =>
    err instanceof InventoryHttpError;

export const useBorrowRequestModel = () => new BorrowRequestModel(BorrowRequest);
export const useBorrowApprovalFlowConfigModel = () =>
    new BorrowApprovalFlowConfigModel(BorrowApprovalFlowConfig);

export { BorrowRequest, BorrowApprovalFlowConfig };
