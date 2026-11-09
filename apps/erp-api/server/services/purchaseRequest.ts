import { getErpAttachmentRoot } from "~~/server/utils/erpAttachmentRoot";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import { getHeader, readMultipartFormData } from "h3";
import { useAdminModel } from "~~/server/models/admin.model";
import { ApprovalInstance } from "~~/server/models/approvalInstance.model";
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryBom } from "~~/server/models/inventoryBom.model";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import {
    PurchaseRequest,
    usePurchaseRequestModel,
    type PurchaseRequestData,
} from "~~/server/models/purchaseRequest.model";
import { PurchaseRequestOrderAllocation } from "~~/server/models/purchaseRequestOrderAllocation.model";
import {
    PurchaseMaterialRequirement,
    usePurchaseMaterialRequirementModel,
} from "~~/server/models/purchaseMaterialRequirement.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { createApprovalInstance } from "~~/server/services/approvalInstance";
import { buildExecutionOrders } from "~~/server/services/productionExecutionView";
import { getPurchaseRequestDisplayStatusMap } from "~~/server/services/purchaseRequestOrderStatus";
import { hasSalesOrderCompletionRelease, lockSalesOrderForProduction } from "~~/server/services/salesOrderCompletionState";
import { InventoryHttpError } from "~~/server/services/inventory";
import { logger } from "~~/server/utils/logger";
import { normalizeStockQuantity } from "~~/server/services/inventoryStockMath";
import { applyPurchaseRequestBom } from "./purchaseRequestBom";
import { refreshSalesOrderFulfillmentStatus } from "./salesOrderFulfillment";
import type { PurchaseBomExpansion, PurchaseBomGroup } from "~~/shared/types/purchaseBom";
import { cloneInventoryReviewPurchaseContext } from "./inventoryReviewPurchase";
import {
    PURCHASE_REQUEST_CATEGORIES,
    PURCHASE_REQUEST_DEPARTMENTS,
    PURCHASE_REQUEST_DISPLAY_STATUSES,
    type ApprovalAttachmentMetadata,
    type AttachmentRef,
    type PurchaseRequestCategory,
    type PurchaseRequestDepartment,
    type PurchaseRequestDisplayStatus,
    type PurchaseRequestItem,
    type PurchaseRequestSnapshot,
} from "~~/shared/types/approval";
import { canDeleteSubmittedPurchaseRequest, canSubmitPurchaseRequest, canViewAllPurchaseRequests, hasFullInventoryAccess } from "~~/shared/utils/adminPermission";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_IMAGES = 9;
const MAX_ATTACHMENTS = 20;
const MAX_ITEMS = 100;

export class PurchaseRequestError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

type CurrentRequestAdmin = {
    adminId: mongoose.Types.ObjectId;
    username: string;
    name: string;
    role: number;
    canViewAll: boolean;
    canDeleteSubmitted: boolean;
};

type SavedFile = {
    metadata: ApprovalAttachmentMetadata;
    filepath: string;
};

type PurchaseRequestAction = "save-draft" | "submit" | "confirm-bom-covered";

type ParsedPayload = {
    action: PurchaseRequestAction;
    requestId: string;
    expectedUpdateTime: string;
    category: PurchaseRequestCategory | "";
    department: PurchaseRequestDepartment | "";
    items: PurchaseRequestItem[];
    attachmentText?: string;
    remark: string;
    existingImages: AttachmentRef[];
    existingAttachments: AttachmentRef[];
    imageParts: any[];
    attachmentParts: any[];
    salesOrderId: string;
    salesOrderNo: string;
    productionOrderId: string;
    productionOrderNo: string;
    bomExpansion?: PurchaseBomExpansion;
};

const textValue = (value: unknown) => value == null ? "" : String(value).trim();

const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toObjectId = (value: unknown, label: string) => {
    const text = textValue(value);
    if (!mongoose.Types.ObjectId.isValid(text)) {
        throw new PurchaseRequestError(400, `${label}不合法`);
    }
    return new mongoose.Types.ObjectId(text);
};

const toPositiveInteger = (value: unknown, fallback: number, maximum: number) => {
    const number = Number(value);
    if (!Number.isInteger(number) || number <= 0) return fallback;
    return Math.min(number, maximum);
};

const toDate = (value: unknown, endOfDay = false) => {
    const text = textValue(value);
    if (!text) return undefined;
    const date = new Date(
        /^\d{4}-\d{2}-\d{2}$/.test(text)
            ? `${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+08:00`
            : text,
    );
    return Number.isNaN(date.getTime()) ? undefined : date;
};

const getCurrentAdmin = async (auth: any): Promise<CurrentRequestAdmin> => {
    const username = textValue(auth?.username);
    if (!username) throw new PurchaseRequestError(401, "当前登录用户不存在");
    const admin = await useAdminModel().findAdminByUsername(username);
    if (!admin) throw new PurchaseRequestError(401, "当前登录用户不存在");
    const role = Number(admin.role);
    return {
        adminId: admin._id,
        username: textValue(admin.username),
        name: textValue(admin.nickname) || textValue(admin.username),
        role,
        canViewAll: canViewAllPurchaseRequests(role),
        canDeleteSubmitted: canDeleteSubmittedPurchaseRequest(role),
    };
};

const parseJsonArray = (value: string, label: string): unknown[] => {
    if (!value) return [];
    try {
        const result = JSON.parse(value);
        if (!Array.isArray(result)) throw new Error("not array");
        return result;
    } catch {
        throw new PurchaseRequestError(400, `${label}格式不合法`);
    }
};

const parseItems = (value: string, requireComplete: boolean, precision = 1): PurchaseRequestItem[] => {
    const source = parseJsonArray(value, "采购明细");
    if (requireComplete && source.length === 0) {
        throw new PurchaseRequestError(400, "至少需要一条采购明细");
    }
    if (source.length > MAX_ITEMS) {
        throw new PurchaseRequestError(400, `采购明细不能超过${MAX_ITEMS}条`);
    }

    return source.map((raw, index) => {
        const item = raw && typeof raw === "object"
            ? raw as Record<string, unknown>
            : {};
        const name = textValue(item.name);
        const model = textValue(item.model);
        const unit = textValue(item.unit);
        const quantityText = textValue(item.quantity);
        const quantity = quantityText ? Number(quantityText) : 0;
        const itemLabel = `采购明细${index + 1}`;

        if (name.length > 100) {
            throw new PurchaseRequestError(400, `${itemLabel}名称不能超过100字`);
        }
        if (model.length > 200) {
            throw new PurchaseRequestError(400, `${itemLabel}型号规格不能超过200字`);
        }
        if (unit.length > 20) {
            throw new PurchaseRequestError(400, `${itemLabel}单位不能超过20字`);
        }
        if (
            !Number.isFinite(quantity)
            || quantity < 0
            || Math.abs(quantity * 10 ** precision - Math.round(quantity * 10 ** precision)) > 1e-6
        ) {
            throw new PurchaseRequestError(400, `${itemLabel}数量最多保留${precision === 3 ? "三" : "一"}位小数`);
        }
        if (requireComplete && (!name || !model || !unit || quantity <= 0)) {
            throw new PurchaseRequestError(400, `${itemLabel}信息不完整`);
        }

        const productId = textValue(item.productId);
        const requirementId = textValue(item.requirementId);
        return {
            name,
            model,
            quantity,
            unit,
            ...(productId ? { productId } : {}),
            ...(requirementId ? { requirementId } : {}),
            ...(textValue(item.bomLineKey) ? { bomLineKey: textValue(item.bomLineKey) } : {}),
            ...(Number.isFinite(Number(item.shortageQuantity))
                ? { shortageQuantity: Number(item.shortageQuantity) }
                : {}),
        };
    });
};

const parseExistingFiles = (value: string, label: string): AttachmentRef[] =>
    parseJsonArray(value, label).map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") return { ...item } as ApprovalAttachmentMetadata;
        throw new PurchaseRequestError(400, `${label}格式不合法`);
    });

const getAttachmentPath = (file: AttachmentRef) => {
    if (typeof file === "string") return file;
    return textValue(file.path || file.url);
};

const getUploadDirectory = (folder: "images" | "attachments") => {
    return path.join(getErpAttachmentRoot(), "main", "purchase-request", folder);
};

const saveFile = async (part: any, folder: "images" | "attachments"): Promise<SavedFile> => {
    const uploadDir = getUploadDirectory(folder);
    await mkdir(uploadDir, { recursive: true });
    const originalName = path.basename(part.filename || "file");
    const extension = path.extname(originalName);
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${extension}`;
    const filepath = path.join(uploadDir, filename);
    await writeFile(filepath, part.data);
    return {
        filepath,
        metadata: {
            path: `/main/purchase-request/${folder}/${filename}`,
            originalName,
            name: originalName,
            size: part.data.length,
            type: part.type || "",
        },
    };
};

const cleanupSavedFiles = async (files: SavedFile[]) => {
    await Promise.allSettled(files.map((file) => unlink(file.filepath)));
};

const cleanupAttachmentRefs = async (files: AttachmentRef[]) => {
    const paths = [...new Set(files.map(getAttachmentPath))].filter((filePath) =>
        /^\/main\/purchase-request\/(images|attachments)\/([^/]+)$/.test(filePath),
    );
    if (!paths.length) return;

    const referencedPaths = new Set<string>();
    try {
        const instances = await ApprovalInstance.find({
            type: "purchase-request",
            $or: [
                { "businessSnapshot.images": { $in: paths } },
                { "businessSnapshot.images.path": { $in: paths } },
                { "businessSnapshot.images.url": { $in: paths } },
                { "businessSnapshot.attachments": { $in: paths } },
                { "businessSnapshot.attachments.path": { $in: paths } },
                { "businessSnapshot.attachments.url": { $in: paths } },
            ],
        }).select("businessSnapshot.images businessSnapshot.attachments")
            .lean<{ businessSnapshot?: Partial<PurchaseRequestSnapshot> }[]>();
        for (const instance of instances) {
            const snapshot = instance.businessSnapshot;
            const images = Array.isArray(snapshot?.images) ? snapshot.images : [];
            const attachments = Array.isArray(snapshot?.attachments) ? snapshot.attachments : [];
            for (const file of [...images, ...attachments]) {
                referencedPaths.add(getAttachmentPath(file));
            }
        }
    } catch (error) {
        logger.error("Check purchase request attachment references error", error);
        return;
    }

    const filepaths = paths.flatMap((filePath) => {
        if (referencedPaths.has(filePath)) return [];
        const match = filePath.match(/^\/main\/purchase-request\/(images|attachments)\/([^/]+)$/);
        if (!match) return [];
        const folder = match[1] as "images" | "attachments";
        return [path.join(getUploadDirectory(folder), path.basename(match[2]!))];
    });
    await Promise.allSettled(filepaths.map((filepath) => unlink(filepath)));
};

const readPayload = async (event: any): Promise<ParsedPayload> => {
    const contentType = textValue(getHeader(event, "content-type")).toLowerCase();
    if (!contentType.includes("multipart/form-data")) {
        throw new PurchaseRequestError(400, "采购申请必须使用表单文件格式提交");
    }
    const parts = await readMultipartFormData(event);
    if (!parts) throw new PurchaseRequestError(400, "采购申请内容不能为空");

    const fields = new Map<string, string>();
    const imageParts: any[] = [];
    const attachmentParts: any[] = [];
    for (const part of parts) {
        if (!part.name) continue;
        if (!part.filename) {
            fields.set(part.name, part.data?.toString("utf-8") || "");
            continue;
        }
        if (part.data.length > MAX_FILE_SIZE) {
            throw new PurchaseRequestError(400, `文件${part.filename}不能超过10MB`);
        }
        if (part.name === "images") {
            if (!String(part.type || "").startsWith("image/")) {
                throw new PurchaseRequestError(400, `文件${part.filename}不是有效图片`);
            }
            imageParts.push(part);
        } else if (part.name === "attachments") {
            attachmentParts.push(part);
        }
    }

    const actionText = textValue(fields.get("action")) || "submit";
    if (!["save-draft", "submit", "confirm-bom-covered"].includes(actionText)) {
        throw new PurchaseRequestError(400, "采购申请操作不合法");
    }
    const action = actionText as PurchaseRequestAction;
    let bomExpansion: PurchaseBomExpansion | undefined;
    if (fields.get("bomExpansion")) {
        try {
            const expansion = JSON.parse(fields.get("bomExpansion")!);
            if (!expansion || typeof expansion.version !== "string" || !expansion.version
                || !Array.isArray(expansion.sourceRequirementIds) || !expansion.sourceRequirementIds.length
                || expansion.sourceRequirementIds.length > MAX_ITEMS
                || expansion.sourceRequirementIds.some((id: unknown) => typeof id !== "string" || !mongoose.isValidObjectId(id))
                || new Set(expansion.sourceRequirementIds).size !== expansion.sourceRequirementIds.length) {
                throw new Error("invalid expansion");
            }
            bomExpansion = { version: expansion.version, sourceRequirementIds: expansion.sourceRequirementIds };
        } catch {
            throw new PurchaseRequestError(400, "BOM 拆分信息不合法，请刷新后重试");
        }
    }
    const categoryText = textValue(fields.get("category"));
    if (
        categoryText
        && !PURCHASE_REQUEST_CATEGORIES.includes(categoryText as PurchaseRequestCategory)
    ) {
        throw new PurchaseRequestError(400, "请选择有效的采购类别");
    }
    if (action === "submit" && !categoryText) {
        throw new PurchaseRequestError(400, "请选择采购类别");
    }
    const departmentText = textValue(fields.get("department"));
    if (
        departmentText
        && !PURCHASE_REQUEST_DEPARTMENTS.includes(departmentText as PurchaseRequestDepartment)
    ) {
        throw new PurchaseRequestError(400, "请选择有效的部门");
    }
    if (action === "submit" && !departmentText) {
        throw new PurchaseRequestError(400, "请选择部门");
    }
    const salesOrderId = textValue(fields.get("salesOrderId"));
    const salesOrderNo = textValue(fields.get("salesOrderNo"));
    const productionOrderId = textValue(fields.get("productionOrderId"));
    const productionOrderNo = textValue(fields.get("productionOrderNo"));
    if ((bomExpansion || action === "confirm-bom-covered")
        && (categoryText !== "销售订单采购" || productionOrderId || !mongoose.isValidObjectId(salesOrderId))) {
        throw new PurchaseRequestError(400, "BOM 拆分只能用于关联销售订单的采购申请");
    }
    if (action === "confirm-bom-covered" && (!bomExpansion || imageParts.length || attachmentParts.length)) {
        throw new PurchaseRequestError(400, "无需采购确认必须携带 BOM 预览且不能上传文件");
    }
    if (productionOrderId && !mongoose.Types.ObjectId.isValid(productionOrderId)) {
        throw new PurchaseRequestError(400, "关联生产单ID不合法");
    }
    if (productionOrderNo && !productionOrderId) {
        throw new PurchaseRequestError(400, "关联生产单信息不完整");
    }
    if (action === "submit" && categoryText === "销售订单采购" && !mongoose.Types.ObjectId.isValid(salesOrderId)) {
        throw new PurchaseRequestError(400, "订单采购必须选择销售订单");
    }
    const remark = textValue(fields.get("remark"));
    if (remark.length > 500) throw new PurchaseRequestError(400, "备注不能超过500字");
    const attachmentText = fields.get("attachmentText");
    if (attachmentText !== undefined && attachmentText.length > 500) {
        throw new PurchaseRequestError(400, "附件文本不能超过500字符");
    }

    return {
        action,
        requestId: textValue(fields.get("requestId")),
        expectedUpdateTime: textValue(fields.get("expectedUpdateTime")),
        category: categoryText as PurchaseRequestCategory | "",
        department: departmentText as PurchaseRequestDepartment | "",
        items: parseItems(fields.get("items") || "", action === "submit", categoryText === "销售订单采购" ? 3 : 1),
        attachmentText,
        remark,
        existingImages: parseExistingFiles(fields.get("imagesExisting") || "", "已有图片"),
        existingAttachments: parseExistingFiles(
            fields.get("attachmentsExisting") || "",
            "已有附件",
        ),
        imageParts,
        attachmentParts,
        salesOrderId,
        salesOrderNo,
        productionOrderId,
        productionOrderNo,
        bomExpansion,
    };
};

const selectExistingFiles = (
    currentFiles: AttachmentRef[],
    requestedFiles: AttachmentRef[],
    label: string,
) => {
    const currentByPath = new Map(
        currentFiles.map((file) => [getAttachmentPath(file), file]),
    );
    const seen = new Set<string>();
    return requestedFiles.flatMap((file) => {
        const filePath = getAttachmentPath(file);
        if (seen.has(filePath)) return [];
        seen.add(filePath);
        const stored = currentByPath.get(getAttachmentPath(file));
        if (!stored) throw new PurchaseRequestError(400, `${label}包含无效文件`);
        return [stored];
    });
};

const getRemovedFiles = (current: AttachmentRef[], retained: AttachmentRef[]) => {
    const retainedPaths = new Set(retained.map(getAttachmentPath));
    return current.filter((file) => !retainedPaths.has(getAttachmentPath(file)));
};

const formatDateKey = (date: Date) => [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
].join("");

const generateRequestNo = async (date: Date, session: mongoose.ClientSession) => {
    const dateKey = formatDateKey(date);
    const serial = await useInventoryCounterModel().nextNumber(
        `purchase-request:${dateKey}`,
        session,
    );
    return `CGSQ-${dateKey}-${String(serial).padStart(4, "0")}`;
};

const serializeDraft = (request: PurchaseRequestData) => ({
    id: request._id.toString(),
    requestNo: request.requestNo,
    approvalId: "",
    approvalNo: "",
    category: request.category,
    department: request.department || "",
    items: request.items || [],
    bomGroups: request.bomGroups || [],
    totalQuantity: Number(request.totalQuantity || 0),
    images: request.images || [],
    attachments: request.attachments || [],
    attachmentText: request.attachmentText ?? "",
    remark: request.remark || "",
    salesOrderId: request.salesOrderId?.toString?.() || "",
    salesOrderNo: request.salesOrderNo || "",
    productionOrderId: request.productionOrderId?.toString?.() || "",
    productionOrderNo: request.productionOrderNo || "",
    applicant: {
        adminId: request.applicantId.toString(),
        username: request.applicantUsername,
        name: request.applicantName,
        role: request.applicantRole,
    },
    status: request.status === "rejected" ? "rejected" as const : "draft" as const,
    displayStatus: request.status === "rejected" ? "rejected" as const : "draft" as const,
    currentStep: request.status === "rejected" ? "已驳回" : "草稿",
    createTime: request.createTime,
    updateTime: request.updateTime,
});

export const assertPurchaseRequestDetailAccess = async (auth: any, id: unknown) => {
    const admin = await getCurrentAdmin(auth);
    const instanceFilter: Record<string, any> = {
        _id: toObjectId(id, "审批单ID"),
        type: "purchase-request",
    };
    if (!admin.canViewAll) instanceFilter["applicant.adminId"] = admin.adminId;
    const instance = await ApprovalInstance.findOne(instanceFilter).select("businessId").lean();
    if (!instance) throw new PurchaseRequestError(404, "采购申请不存在或无权查看");

    const requestFilter: Record<string, any> = { _id: instance.businessId };
    if (!admin.canViewAll) requestFilter.applicantId = admin.adminId;
    const request = await PurchaseRequest.exists(requestFilter);
    if (!request) throw new PurchaseRequestError(404, "采购申请不存在或无权查看");
};

export const retrievePurchaseRequests = async (
    auth: any,
    query: Record<string, unknown>,
) => {
    const admin = await getCurrentAdmin(auth);
    const requestId = textValue(query.id);
    if (requestId) {
        const detail = await usePurchaseRequestModel().findOwnedDraftById(
            toObjectId(requestId, "采购申请ID"),
            admin.adminId,
        );
        if (!detail) throw new PurchaseRequestError(404, "采购申请不存在、不可编辑或无权查看");
        const approval = await ApprovalInstance.findOne({
            type: "purchase-request",
            businessId: detail._id,
        }).sort({ createTime: -1, _id: -1 }).select("approvalNo").lean();
        return {
            detail: {
                ...serializeDraft(detail),
                approvalId: approval?._id.toString() || "",
                approvalNo: approval?.approvalNo || "",
            },
        };
    }

    const page = toPositiveInteger(query.page, 1, 100000);
    const limit = toPositiveInteger(query.limit, 15, 100);
    const category = textValue(query.category);
    const department = textValue(query.department);
    if (department && !PURCHASE_REQUEST_DEPARTMENTS.includes(department as PurchaseRequestDepartment)) {
        throw new PurchaseRequestError(400, "请选择有效的部门");
    }
    const approvalNo = textValue(query.approvalNo);
    const applicant = textValue(query.applicant);
    const startDate = toDate(query.startDate);
    const endDate = toDate(query.endDate, true);
    const drafts = textValue(query.drafts) === "true";
    const draftCountPromise = PurchaseRequest.countDocuments({
        applicantId: admin.adminId,
        status: { $in: ["draft", "cancelled"] },
    });

    if (drafts) {
        const filter: Record<string, any> = {
            applicantId: admin.adminId,
            status: { $in: ["draft", "cancelled"] },
        };
        if (category && PURCHASE_REQUEST_CATEGORIES.includes(category as PurchaseRequestCategory)) {
            filter.category = category;
        }
        if (department) filter.department = department;
        if (startDate || endDate) {
            filter.updateTime = {
                ...(startDate ? { $gte: startDate } : {}),
                ...(endDate ? { $lte: endDate } : {}),
            };
        }
        const [rows, total, draftCount] = await Promise.all([
            PurchaseRequest.find(filter)
                .sort({ updateTime: -1, _id: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean<PurchaseRequestData[]>(),
            PurchaseRequest.countDocuments(filter),
            draftCountPromise,
        ]);
        return {
            list: rows.map(serializeDraft),
            pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
            draftCount,
            canViewAll: admin.canViewAll,
            canDeleteSubmitted: admin.canDeleteSubmitted,
        };
    }

    const baseFilter: Record<string, any> = { type: "purchase-request" };
    if (!admin.canViewAll) baseFilter["applicant.adminId"] = admin.adminId;
    const latestFilter: Record<string, any> = {
        "purchaseRequest.status": { $nin: ["draft", "cancelled"] },
    };
    if (category && PURCHASE_REQUEST_CATEGORIES.includes(category as PurchaseRequestCategory)) {
        latestFilter["businessSnapshot.category"] = category;
    }
    if (department) latestFilter["businessSnapshot.department"] = department;
    const statusText = textValue(query.status);
    const displayStatusFilter = statusText !== "draft"
        && PURCHASE_REQUEST_DISPLAY_STATUSES.includes(statusText as PurchaseRequestDisplayStatus)
        ? statusText as PurchaseRequestDisplayStatus
        : "";
    const filterByOrderStatus = displayStatusFilter === "approved"
        || displayStatusFilter === "partially_ordered"
        || displayStatusFilter === "ordered";
    if (displayStatusFilter) {
        latestFilter.status = filterByOrderStatus ? "approved" : displayStatusFilter;
    }
    if (approvalNo) latestFilter.approvalNo = new RegExp(escapeRegExp(approvalNo), "i");
    if (admin.canViewAll && applicant) {
        const applicantRegex = new RegExp(escapeRegExp(applicant), "i");
        latestFilter.$or = [
            { "applicant.name": applicantRegex },
            { "applicant.username": applicantRegex },
        ];
    }
    if (startDate || endDate) {
        latestFilter.createTime = {
            ...(startDate ? { $gte: startDate } : {}),
            ...(endDate ? { $lte: endDate } : {}),
        };
    }

    const pipeline: mongoose.PipelineStage[] = [
        { $match: baseFilter },
        { $sort: { businessId: 1, createTime: -1, _id: -1 } },
        {
            $group: {
                _id: "$businessId",
                instance: { $first: "$$ROOT" },
            },
        },
        { $replaceRoot: { newRoot: "$instance" } },
        {
            $lookup: {
                from: PurchaseRequest.collection.name,
                localField: "businessId",
                foreignField: "_id",
                as: "purchaseRequest",
            },
        },
        { $unwind: "$purchaseRequest" },
        { $match: latestFilter },
    ];
    let displayStatusMap = new Map<string, PurchaseRequestDisplayStatus>();
    if (filterByOrderStatus) {
        const candidates = await ApprovalInstance.aggregate([
            ...pipeline,
            {
                $project: {
                    _id: 1,
                    "purchaseRequest._id": 1,
                    "purchaseRequest.category": 1,
                    "purchaseRequest.items": 1,
                },
            },
        ]);
        displayStatusMap = await getPurchaseRequestDisplayStatusMap(
            candidates.map((instance) => instance.purchaseRequest),
        );
        const matchingIds: mongoose.Types.ObjectId[] = [];
        for (const instance of candidates) {
            if (displayStatusMap.get(instance.purchaseRequest._id.toString()) === displayStatusFilter) {
                matchingIds.push(instance._id);
            }
        }
        pipeline.push({ $match: { _id: { $in: matchingIds } } });
    }

    const [aggregation, draftCount] = await Promise.all([
        ApprovalInstance.aggregate([
            ...pipeline,
            {
                $facet: {
                    items: [
                        { $sort: { createTime: -1, _id: -1 } },
                        { $skip: (page - 1) * limit },
                        { $limit: limit },
                    ],
                    total: [{ $count: "value" }],
                },
            },
        ]),
        draftCountPromise,
    ]);
    const instances = aggregation[0]?.items || [];
    if (!filterByOrderStatus) {
        const approvedRequests = instances
            .filter((instance: any) => instance.status === "approved")
            .map((instance: any) => instance.purchaseRequest);
        displayStatusMap = await getPurchaseRequestDisplayStatusMap(approvedRequests);
    }
    const total = Number(aggregation[0]?.total?.[0]?.value || 0);
    const list = instances.map((instance) => {
        const snapshot = (instance.businessSnapshot || {}) as PurchaseRequestSnapshot;
        const pendingStep = (instance.steps || []).find((step: any) => step.status === "pending");
        return {
            id: instance.businessId.toString(),
            requestNo: snapshot.requestNo || "",
            approvalId: instance._id.toString(),
            approvalNo: instance.approvalNo,
            category: snapshot.category || "",
            department: snapshot.department || "",
            items: snapshot.items || [],
            bomGroups: snapshot.bomGroups || [],
            totalQuantity: Number(snapshot.totalQuantity || 0),
            images: snapshot.images || [],
            attachments: snapshot.attachments || [],
            attachmentText: snapshot.attachmentText ?? "",
            remark: snapshot.remark || "",
            salesOrderId: snapshot.salesOrderId
                || instance.purchaseRequest?.salesOrderId?.toString?.()
                || "",
            salesOrderNo: snapshot.salesOrderNo || instance.purchaseRequest?.salesOrderNo || "",
            productionOrderId: snapshot.productionOrderId
                || instance.purchaseRequest?.productionOrderId?.toString?.()
                || "",
            productionOrderNo: snapshot.productionOrderNo || instance.purchaseRequest?.productionOrderNo || "",
            applicant: {
                ...instance.applicant,
                adminId: instance.applicant.adminId.toString(),
            },
            status: instance.status,
            displayStatus: displayStatusMap.get(instance.businessId.toString()) || instance.status,
            currentStep: pendingStep?.name
                || (instance.status === "approved" ? "已完成"
                    : instance.status === "rejected" ? "已驳回"
                        : instance.status === "cancelled" ? "已撤销" : "等待处理"),
            createTime: instance.createTime,
            updateTime: instance.updateTime,
        };
    });
    return {
        list,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        draftCount,
        canViewAll: admin.canViewAll,
        canDeleteSubmitted: admin.canDeleteSubmitted,
    };
};

const validateOrderPurchaseItems = async (
    payload: ParsedPayload,
    salesOrder: any,
    draftId: string,
    session: mongoose.ClientSession,
) => {
    const shortageItems = payload.items.filter((item) => textValue(item.requirementId));
    const addedItems = payload.items.filter((item) => !textValue(item.requirementId));
    const requirementIds = shortageItems.map((item) => textValue(item.requirementId));
    if (!requirementIds.length) throw new PurchaseRequestError(400, "订单采购至少需要一条订单缺口物料");
    if (requirementIds.some((id) => !mongoose.isValidObjectId(id))
        || new Set(requirementIds).size !== requirementIds.length) {
        throw new PurchaseRequestError(400, "订单采购缺口物料不合法或重复");
    }
    const requirements = await PurchaseMaterialRequirement.find({
        _id: { $in: requirementIds }, salesOrderId: salesOrder._id,
        _isDeleted: { $ne: true }, demandType: "purchase", source: { $ne: "purchase-request-added" },
        status: "未完成", remainingPurchaseQuantity: { $gt: 0 },
        $or: [{ poolReady: false }, { poolReady: { $exists: false } }],
    }).session(session).lean() as any[];
    if (requirements.length !== requirementIds.length) {
        throw new PurchaseRequestError(409, "订单缺口物料已变化，请刷新后重试");
    }
    const requirementMap = new Map(requirements.map((item) => [String(item._id), item]));
    const unsplitProductIds = requirements.filter((item) => !item.bomSourceRequirementId).map((item) => item.productId);
    if (unsplitProductIds.length && await InventoryBom.exists({
        productId: { $in: unsplitProductIds }, isEnabled: true, _isDeleted: { $ne: true }, "items.0": { $exists: true },
    }).session(session)) {
        throw new PurchaseRequestError(409, "成品采购需求需先按 BOM 拆分，请刷新产品明细后重试");
    }
    for (const item of shortageItems) {
        const requirement = requirementMap.get(item.requirementId!);
        if (!requirement || textValue(item.productId) !== String(requirement.productId)
            || (requirement.purchaseRequestId && String(requirement.purchaseRequestId) !== draftId)
            || (item.bomLineKey && item.bomLineKey !== requirement.bomLineKey)
            || item.quantity + 1e-6 < Number(requirement.remainingPurchaseQuantity || 0)) {
            throw new PurchaseRequestError(409, "订单缺口归属或数量已变化，请刷新后重试");
        }
        // 兼容未携带新字段的旧客户端，BOM 归属以已落库需求为准。
        if (requirement.bomLineKey) item.bomLineKey = requirement.bomLineKey;
        item.shortageQuantity = normalizeStockQuantity(requirement.shortageQuantity);
        item.minQuantity = normalizeStockQuantity(requirement.remainingPurchaseQuantity);
    }
    const referenced = await PurchaseRequest.exists({
        ...(draftId ? { _id: { $ne: new mongoose.Types.ObjectId(draftId) } } : {}),
        status: { $in: ["draft", "cancelled", "pending", "approved"] },
        "items.requirementId": { $in: requirementIds },
    }).session(session);
    if (referenced) throw new PurchaseRequestError(409, "订单缺口已被其他采购申请引用，请刷新后重试");
    if (draftId) {
        const omittedRequirement = await PurchaseMaterialRequirement.exists({
            purchaseRequestId: new mongoose.Types.ObjectId(draftId),
            _id: { $nin: requirementIds.map((id) => new mongoose.Types.ObjectId(id)) },
            _isDeleted: { $ne: true },
            demandType: "purchase",
            source: { $ne: "purchase-request-added" },
            status: "未完成",
            remainingPurchaseQuantity: { $gt: 0 },
        }).session(session);
        if (omittedRequirement) {
            throw new PurchaseRequestError(409, "原采购申请仍关联其他订单缺口，不能删除原缺口明细");
        }
    }
    const addedProductIds = addedItems.map((item) => textValue(item.productId));
    const demandProductIds = new Set(requirements.map((item) => String(item.productId)));
    if (addedProductIds.some((id) => !mongoose.isValidObjectId(id))
        || addedItems.some((item) => item.bomLineKey)
        || new Set(addedProductIds).size !== addedProductIds.length
        || addedProductIds.some((id) => demandProductIds.has(id))) {
        throw new PurchaseRequestError(400, "手工新增产品不合法或重复");
    }
    if (addedProductIds.length) {
        const count = await InventoryProduct.countDocuments({
            _id: { $in: addedProductIds.map((id) => new mongoose.Types.ObjectId(id)) }, _isDeleted: { $ne: true },
        }).session(session);
        if (count !== addedProductIds.length) throw new PurchaseRequestError(400, "手工新增产品不存在或已删除");
    }
    const groups = new Map<string, PurchaseBomGroup>();
    for (const requirement of requirements) {
        if (requirement.bomGroup) groups.set(requirement.bomGroup.sourceRequirementId, requirement.bomGroup);
    }
    return { requirementIds, addedItems, groups: [...groups.values()] };
};

export const submitPurchaseRequest = async (event: any) => {
    const admin = await getCurrentAdmin(event.context.auth);
    if (!canSubmitPurchaseRequest(admin.role)) {
        throw new PurchaseRequestError(403, "当前角色不能发起采购申请");
    }
    const payload = await readPayload(event);
    const requestModel = usePurchaseRequestModel();
    const draft = payload.requestId
        ? await requestModel.findOwnedDraftById(
            toObjectId(payload.requestId, "采购申请ID"),
            admin.adminId,
        )
        : null;
    if (payload.requestId && !draft) {
        throw new PurchaseRequestError(404, "采购申请不存在、不可编辑或无权编辑");
    }
    if (payload.action === "confirm-bom-covered" && draft?.status === "cancelled") {
        throw new PurchaseRequestError(409, "已撤销申请保留历史记录，请新建申请确认 BOM 库存");
    }
    if (payload.action === "confirm-bom-covered" && payload.items.length) {
        throw new PurchaseRequestError(400, "无需采购确认不能包含采购明细");
    }
    const submittedItems = payload.items.map((item) => ({ ...item }));
    if (draft?.inventoryReview && (
        payload.category !== "销售订单采购"
        || payload.salesOrderId !== draft.salesOrderId?.toString()
    )) {
        throw new PurchaseRequestError(400, "仓库复核采购不能更换采购类别或关联销售订单");
    }
    if (draft?.salesOrderId && (
        payload.category !== "销售订单采购"
        || payload.salesOrderId !== draft.salesOrderId.toString()
    )) {
        const history = await ApprovalInstance.exists({ type: "purchase-request", businessId: draft._id });
        if (history) {
            throw new PurchaseRequestError(400, "已提交的销售订单采购不能更换采购类别或关联销售订单");
        }
    }
    if (draft) {
        const expectedTime = new Date(payload.expectedUpdateTime).getTime();
        if (
            !payload.expectedUpdateTime
            || Number.isNaN(expectedTime)
            || expectedTime !== new Date(draft.updateTime).getTime()
        ) {
            throw new PurchaseRequestError(409, "采购申请已更新，请刷新后重试");
        }
        if (draft.productionOrderId && draft.productionOrderId.toString() !== payload.productionOrderId) {
            throw new PurchaseRequestError(400, "生产采购草稿不能删除或更换关联生产单");
        }
    }
    if (payload.productionOrderId) {
        if (!hasFullInventoryAccess(admin.role)) {
            throw new PurchaseRequestError(403, "当前角色不能发起生产采购申请");
        }
        if (payload.category !== "生产用料采购") {
            throw new PurchaseRequestError(400, "关联生产单的采购类别只能为生产用料采购");
        }
        if (payload.salesOrderId || payload.salesOrderNo) {
            throw new PurchaseRequestError(400, "生产采购申请不能同时关联销售订单");
        }
        const productIds = new Set<string>();
        for (const item of payload.items) {
            const productId = textValue(item.productId);
            if (!mongoose.Types.ObjectId.isValid(productId) || productIds.has(productId)) {
                throw new PurchaseRequestError(400, "生产采购物料不合法或重复");
            }
            if (item.requirementId) {
                throw new PurchaseRequestError(400, "生产采购不能使用销售订单缺口物料");
            }
            productIds.add(productId);
        }
    }
    if (!draft && (payload.existingImages.length || payload.existingAttachments.length)) {
        throw new PurchaseRequestError(400, "已有文件引用不合法");
    }

    const retainedImages = draft
        ? selectExistingFiles(draft.images || [], payload.existingImages, "已有图片")
        : [];
    const retainedAttachments = draft
        ? selectExistingFiles(draft.attachments || [], payload.existingAttachments, "已有附件")
        : [];
    if (retainedImages.length + payload.imageParts.length > MAX_IMAGES) {
        throw new PurchaseRequestError(400, `图片不能超过${MAX_IMAGES}张`);
    }
    if (retainedAttachments.length + payload.attachmentParts.length > MAX_ATTACHMENTS) {
        throw new PurchaseRequestError(400, `附件不能超过${MAX_ATTACHMENTS}个`);
    }
    if (
        payload.action === "submit"
        && payload.category === "销售订单采购"
        && retainedImages.length + payload.imageParts.length === 0
    ) {
        throw new PurchaseRequestError(400, "销售订单采购至少需要上传一张图片");
    }

    let salesOrder: any = null;
    let requirementIds: string[] = [];
    let purchaseRequestAddedItems: PurchaseRequestItem[] = [];
    if (payload.category === "销售订单采购") {
        salesOrder = await useSalesOrderModel().findActiveById(payload.salesOrderId);
        if (!salesOrder || !["待采购", "生产中"].includes(salesOrder.status) || hasSalesOrderCompletionRelease(salesOrder)) {
            throw new PurchaseRequestError(400, "销售订单不存在、没有待处理采购需求或已经完工放行");
        }
    }

    const savedFiles: SavedFile[] = [];
    let session: mongoose.ClientSession | null = null;
    let committed = false;
    try {
        for (const part of payload.imageParts) savedFiles.push(await saveFile(part, "images"));
        for (const part of payload.attachmentParts) savedFiles.push(await saveFile(part, "attachments"));
        const images = [
            ...retainedImages,
            ...savedFiles
                .filter((file) => file.metadata.path?.includes("/images/"))
                .map((file) => file.metadata),
        ];
        const attachments = [
            ...retainedAttachments,
            ...savedFiles
                .filter((file) => file.metadata.path?.includes("/attachments/"))
                .map((file) => file.metadata),
        ];
        let totalQuantity = Number(
            payload.items.reduce((total, item) => total + Math.max(0, item.quantity), 0).toFixed(3),
        );
        const requestData = {
            category: payload.category,
            department: payload.department,
            items: payload.items,
            bomGroups: [] as PurchaseBomGroup[],
            totalQuantity,
            images,
            attachments,
            attachmentText: payload.attachmentText ?? draft?.attachmentText ?? "",
            remark: payload.remark,
            productionOrderId: undefined as mongoose.Types.ObjectId | undefined,
            productionOrderNo: "",
            ...(payload.category === "销售订单采购"
                ? {
                    salesOrderId: new mongoose.Types.ObjectId(payload.salesOrderId),
                    salesOrderNo: salesOrder?.orderNo || payload.salesOrderNo,
                }
                : { salesOrderId: undefined, salesOrderNo: "" }),
        };
        const currentSession = await mongoose.startSession();
        session = currentSession;
        let result: Record<string, unknown> = {};
        await currentSession.withTransaction(async () => {
            const now = new Date();
            if (draft && payload.action === "confirm-bom-covered") {
                const history = await ApprovalInstance.exists({
                    type: "purchase-request",
                    businessId: draft._id,
                }).session(currentSession);
                if (history) {
                    throw new PurchaseRequestError(409, "该申请已有审批历史，请新建申请确认 BOM 库存");
                }
            }
            // 驱动可能重试事务；每次都从原提交重新解析预览行，不能复用已回滚的子需求 ID。
            payload.items = submittedItems.map((item) => ({ ...item }));
            requestData.bomGroups = [];
            if (payload.category === "销售订单采购") {
                salesOrder = await lockSalesOrderForProduction(payload.salesOrderId, admin.username, currentSession);
                if (!["待采购", "生产中"].includes(salesOrder.status) || hasSalesOrderCompletionRelease(salesOrder)) {
                    throw new PurchaseRequestError(409, "销售订单状态已变化，请刷新后重试");
                }
                if (payload.bomExpansion) {
                    const expansion = await applyPurchaseRequestBom({
                        salesOrderId: payload.salesOrderId, expansion: payload.bomExpansion,
                        items: payload.items, actor: admin.username, adminId: String(admin.adminId),
                        draftId: draft ? String(draft._id) : undefined, session: currentSession,
                    });
                    payload.items = expansion.items;
                    requestData.bomGroups = expansion.groups;
                    if (payload.action === "confirm-bom-covered") {
                        if (payload.items.length) throw new PurchaseRequestError(409, "当前仍有物料需要采购，请刷新后提交");
                        if (draft) {
                            const removed = await PurchaseRequest.findOneAndDelete({
                                _id: draft._id, applicantId: admin.adminId, status: "draft", updateTime: draft.updateTime,
                            }, { session: currentSession });
                            if (!removed) throw new PurchaseRequestError(409, "采购申请草稿已更新，请刷新后重试");
                        }
                        await refreshSalesOrderFulfillmentStatus(payload.salesOrderId, admin.username, { session: currentSession });
                        result = { action: "confirm-bom-covered", id: "", requestNo: "" };
                        return;
                    }
                }
                const validated = await validateOrderPurchaseItems(payload, salesOrder, draft ? String(draft._id) : "", currentSession);
                requirementIds = validated.requirementIds;
                purchaseRequestAddedItems = validated.addedItems;
                const groups = new Map<string, PurchaseBomGroup>();
                for (const group of [...(draft?.bomGroups || []), ...requestData.bomGroups, ...validated.groups]) {
                    groups.set(group.sourceRequirementId, group);
                }
                requestData.bomGroups = [...groups.values()];
                requestData.items = payload.items;
                totalQuantity = normalizeStockQuantity(payload.items.reduce((total, item) => total + item.quantity, 0));
                requestData.totalQuantity = totalQuantity;
                if (payload.bomExpansion) {
                    await refreshSalesOrderFulfillmentStatus(payload.salesOrderId, admin.username, { session: currentSession });
                }
            }
            if (payload.productionOrderId) {
                const productionOrder = await ProductionOrder.findById(payload.productionOrderId)
                    .session(currentSession).lean() as any;
                if (!productionOrder) {
                    throw new PurchaseRequestError(404, "关联生产单不存在");
                }
                if (productionOrder.salesOrderId) {
                    await lockSalesOrderForProduction(String(productionOrder.salesOrderId), admin.username, currentSession, { requireCompletion: true });
                }
                const [detail] = await buildExecutionOrders([productionOrder], currentSession);
                if (!detail?.executable) {
                    throw new PurchaseRequestError(409, detail?.blockReason || "生产单当前不能发起采购申请");
                }
                if (!detail.hasMaterialLoss) {
                    throw new PurchaseRequestError(400, "请先登记生产物料损耗，再发起采购申请");
                }
                const materials = new Set(detail.materials.map((material) => material.productId));
                for (const item of payload.items) {
                    if (!materials.has(item.productId || "")) {
                        throw new PurchaseRequestError(400, "采购物料必须属于关联生产单的BOM物料");
                    }
                }
                requestData.productionOrderId = productionOrder._id;
                requestData.productionOrderNo = productionOrder.documentNo;
            }
            if (payload.action === "save-draft") {
                const request = draft
                    ? await requestModel.updateOwnedDraft(
                        draft._id,
                        admin.adminId,
                        draft.updateTime,
                        requestData,
                        currentSession,
                    )
                    : await requestModel.create({
                        requestNo: await generateRequestNo(now, currentSession),
                        applicantId: admin.adminId,
                        applicantUsername: admin.username,
                        applicantName: admin.name,
                        applicantRole: admin.role,
                        ...requestData,
                        status: "draft",
                    }, currentSession);
                if (!request) throw new PurchaseRequestError(409, "采购申请草稿状态已变化");
                result = {
                    action: "save-draft",
                    id: request._id.toString(),
                    requestNo: request.requestNo,
                };
                return;
            }

            const request = draft
                ? await requestModel.submitOwnedDraft(
                    draft._id,
                    admin.adminId,
                    draft.updateTime,
                    requestData,
                    currentSession,
                )
                : await requestModel.create({
                    requestNo: await generateRequestNo(now, currentSession),
                    applicantId: admin.adminId,
                    applicantUsername: admin.username,
                    applicantName: admin.name,
                    applicantRole: admin.role,
                    ...requestData,
                    status: "pending",
                }, currentSession);
            if (!request) throw new PurchaseRequestError(409, "采购申请草稿状态已变化");
            const snapshot: PurchaseRequestSnapshot = {
                requestNo: request.requestNo,
                category: payload.category as PurchaseRequestCategory,
                department: payload.department,
                items: payload.items,
                bomGroups: requestData.bomGroups,
                totalQuantity,
                images,
                attachments,
                attachmentText: requestData.attachmentText,
                remark: payload.remark,
                // 自动复核采购撤回后重提，继续保留复核依据。
                ...(request.inventoryReview ? { inventoryReview: cloneInventoryReviewPurchaseContext(request.inventoryReview) } : {}),
                ...(payload.category === "销售订单采购"
                    ? { salesOrderId: payload.salesOrderId, salesOrderNo: salesOrder?.orderNo || payload.salesOrderNo }
                    : {}),
                ...(payload.productionOrderId
                    ? {
                        productionOrderId: payload.productionOrderId,
                        productionOrderNo: request.productionOrderNo || "",
                    }
                    : {}),
            };
            if (payload.category === "销售订单采购") {
                const requirementModel = usePurchaseMaterialRequirementModel();
                const linked = await requirementModel.linkToPurchaseRequest(
                    requirementIds,
                    request._id.toString(),
                    currentSession,
                );
                if (linked.matchedCount !== requirementIds.length) {
                    throw new PurchaseRequestError(409, "订单缺口物料已被其他采购申请占用");
                }
                await requirementModel.createPurchaseRequestAddedRequirements({
                    salesOrder,
                    purchaseRequestId: request._id.toString(),
                    items: purchaseRequestAddedItems,
                    actor: admin.username,
                    session: currentSession,
                });
            }
            const approval = await createApprovalInstance({
                type: "purchase-request",
                businessId: request._id,
                businessSnapshot: snapshot,
                applicantId: admin.adminId,
                session: currentSession,
                submittedAt: now,
            });
            result = {
                action: "submit",
                id: request._id.toString(),
                requestNo: request.requestNo,
                approvalId: approval._id.toString(),
                approvalNo: approval.approvalNo,
            };
        });
        committed = true;
        if (draft) {
            await cleanupAttachmentRefs([
                ...getRemovedFiles(draft.images || [], payload.action === "confirm-bom-covered" ? [] : retainedImages),
                ...getRemovedFiles(draft.attachments || [], payload.action === "confirm-bom-covered" ? [] : retainedAttachments),
            ]);
        }
        return result;
    } catch (error: any) {
        if (!committed) await cleanupSavedFiles(savedFiles);
        if (error instanceof PurchaseRequestError) throw error;
        if (error instanceof InventoryHttpError) throw new PurchaseRequestError(error.status, error.message);
        const message = textValue(error?.message);
        if (
            message.includes("审批流程")
            || message.includes("审批人")
            || message.includes("审批步骤")
        ) {
            throw new PurchaseRequestError(400, message);
        }
        throw error;
    } finally {
        if (session) await session.endSession();
    }
};

export const deletePurchaseRequest = async (
    auth: any,
    id: unknown,
    scope: unknown,
    includeDraft = false,
) => {
    const admin = await getCurrentAdmin(auth);
    const requestId = toObjectId(id, "采购申请ID");
    const deleteScope = textValue(scope);
    if (deleteScope !== "draft" && deleteScope !== "request") {
        throw new PurchaseRequestError(400, "采购申请删除范围不合法");
    }
    const session = await mongoose.startSession();
    let deleted: PurchaseRequestData | null = null;
    let historyFiles: AttachmentRef[] = [];
    try {
        await session.withTransaction(async () => {
            if (deleteScope === "request") {
                if (!admin.canDeleteSubmitted) {
                    throw new PurchaseRequestError(403, "无权删除已提交采购申请");
                }
                const referenced = await PurchaseRequestOrderAllocation.exists({
                    purchaseRequestId: requestId,
                }).session(session);
                if (referenced) {
                    throw new PurchaseRequestError(409, "采购申请已生成采购单，不能删除");
                }
                deleted = await PurchaseRequest.findOne({
                    _id: requestId,
                    ...(includeDraft
                        ? {}
                        : { status: { $nin: ["draft", "cancelled"] } }),
                }).session(session).lean<PurchaseRequestData>();
                if (!deleted) throw new PurchaseRequestError(404, "采购申请不存在或已进入草稿箱");
                const approvals = await ApprovalInstance.find({
                    type: "purchase-request",
                    businessId: requestId,
                }).session(session).select("businessSnapshot.images businessSnapshot.attachments")
                    .lean<{ businessSnapshot?: Partial<PurchaseRequestSnapshot> }[]>();
                historyFiles = [];
                for (const approval of approvals) {
                    const snapshot = approval.businessSnapshot;
                    if (Array.isArray(snapshot?.images)) historyFiles.push(...snapshot.images);
                    if (Array.isArray(snapshot?.attachments)) historyFiles.push(...snapshot.attachments);
                }
                await ApprovalInstance.deleteMany(
                    { type: "purchase-request", businessId: requestId },
                    { session },
                );
                const result = await PurchaseRequest.deleteOne(
                    { _id: requestId, updateTime: deleted.updateTime },
                    { session },
                );
                if (result.deletedCount !== 1) {
                    throw new PurchaseRequestError(409, "采购申请状态已变化，请刷新后重试");
                }
                return;
            }

            deleted = await usePurchaseRequestModel().deleteOwnedDraft(
                requestId,
                admin.adminId,
                session,
            );
            if (!deleted) throw new PurchaseRequestError(404, "采购申请草稿不存在或无权删除");
        });
    } finally {
        await session.endSession();
    }
    const detail = deleted as PurchaseRequestData;
    await cleanupAttachmentRefs([...(detail.images || []), ...(detail.attachments || []), ...historyFiles]);
    return {
        id: requestId.toString(),
        requestNo: detail.requestNo,
        scope: deleteScope,
    };
};
