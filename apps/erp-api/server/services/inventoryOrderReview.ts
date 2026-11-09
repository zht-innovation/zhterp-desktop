import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { ADMIN_ROLE } from "~~/shared/enums";
import type {
    InventoryReviewMaterial,
    InventoryReviewOrder,
    InventoryReviewProduct,
    InventoryReviewStatus,
    InventoryReviewStockPosition,
} from "~~/shared/types/inventoryReview";
import {
    canAccessAdminFeature,
    canAccessInventory,
    canAccessProductionExecution,
    isElectronicsWarehouseKeeper,
    isOperatorInventoryReadonly,
} from "~~/shared/utils/adminPermission";
import { ApprovalInstance } from "~~/server/models/approvalInstance.model";
import { InventoryOrderReview } from "~~/server/models/inventoryOrderReview.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryWarehouse } from "~~/server/models/inventoryBase.model";
import { useInventoryBomModel } from "~~/server/models/inventoryBom.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { APPROVED_SALES_ORDER_STATUSES } from "~~/server/services/salesOrderApproval";
import {
    escapeRegExp,
    getInventoryActor,
    getPageParams,
    InventoryHttpError,
    isValidObjectId,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import { normalizeStockQuantity } from "~~/server/services/inventoryStockMath";
import { loadInventoryReviewPositions } from "~~/server/services/inventoryOrderReviewStock";
import { completeInventoryOrderReview } from "~~/server/services/inventoryOrderReviewCompletion";

const APPROVED_FILTER = {
    _isDeleted: { $ne: true },
    status: { $in: [...APPROVED_SALES_ORDER_STATUSES] },
    inventoryReviewRequiredAt: { $type: "date" },
};
type ReviewItem = InventoryReviewProduct | InventoryReviewMaterial;
type StoredSnapshot = InventoryReviewOrder & { _source: Record<string, any> };

function fail(status: number, message: string): never {
    throw new InventoryHttpError(status, status, message);
}

export function assertInventoryOrderReviewAccess(event: any) {
    const role = Number(event.context?.auth?.role);
    const canOperate = (
        canAccessAdminFeature(role, ADMIN_ROLE.OPERATOR)
        && !isOperatorInventoryReadonly(role)
    ) || canAccessProductionExecution(role) || isElectronicsWarehouseKeeper(role);
    if (!toText(event.context?.auth?.username)) fail(401, "请先登录");
    if (!canAccessInventory(role) || !canOperate) fail(403, "没有仓库复核权限");
    // 与其他仓储写入接口一致，从现有认证上下文读取操作者。
    getInventoryActor(event);
}

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

function hash(value: unknown) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function mongoText(input: any) {
    return { $convert: { input, to: "string", onNull: "", onError: "" } };
}

// 列表与详情使用同一 Mongo 表达式生成审批身份，避免 Date/ObjectId/缺失字段归一化不一致。
// 不包含订单履约状态、库存和 updateTime，因此出库或普通履约更新不会重置复核结果。
function approvalSourceStages(): any[] {
    return [
        {
            $lookup: {
                from: ApprovalInstance.collection.name,
                let: { orderId: "$_id" },
                pipeline: [
                    { $match: { $expr: { $and: [{ $eq: ["$businessId", "$$orderId"] }, { $eq: ["$type", "sales-order"] }] } } },
                    { $sort: { createTime: -1, _id: -1 } },
                    { $limit: 1 },
                    { $project: { _id: 1, status: 1 } },
                ],
                as: "_latestApproval",
            },
        },
        {
            $set: {
                _reviewSource: {
                    salesOrderId: mongoText("$_id"),
                    reviewRequiredAt: mongoText("$inventoryReviewRequiredAt"),
                    approvalId: mongoText({ $arrayElemAt: ["$_latestApproval._id", 0] }),
                    approvalStatus: mongoText({ $arrayElemAt: ["$_latestApproval.status", 0] }),
                    products: {
                        $map: {
                            input: { $cond: [{ $isArray: "$products" }, "$products", []] },
                            as: "item",
                            in: {
                                productId: mongoText({ $ifNull: ["$$item.productId", { $ifNull: ["$$item._id", "$$item.id"] }] }),
                                legacyId: mongoText("$$item._id"),
                                legacyKey: mongoText("$$item.id"),
                                productCode: mongoText({ $ifNull: ["$$item.productCode", "$$item.code"] }),
                                legacyCode: mongoText("$$item.code"),
                                model: mongoText("$$item.model"),
                                quantity: { $convert: { input: "$$item.quantity", to: "double", onNull: null, onError: null } },
                                unit: mongoText({ $ifNull: ["$$item.unitName", "$$item.unit"] }),
                                legacyUnit: mongoText("$$item.unit"),
                            },
                        },
                    },
                    auditRecords: {
                        $map: {
                            input: { $cond: [{ $isArray: "$auditRecords" }, "$auditRecords", []] },
                            as: "audit",
                            in: {
                                adminId: mongoText("$$audit.adminId"),
                                approved: { $eq: ["$$audit.approved", true] },
                                approvedAt: mongoText("$$audit.approvedAt"),
                                rejected: { $eq: ["$$audit.rejected", true] },
                            },
                        },
                    },
                    auditRounds: { $cond: [{ $isArray: "$auditHistory" }, { $size: "$auditHistory" }, 0] },
                },
            },
        },
    ];
}

function approvalKey(order: any) {
    const source = order._reviewSource;
    return `${source.approvalId || "legacy"}:${hash(source)}`;
}

function deliveryDate(order: any) {
    const date = new Date(order.orderDate);
    if (!Number.isFinite(date.getTime())) return "";
    const days = Number(order.durationDays || 0);
    if (Number.isFinite(days) && days > 0) date.setUTCDate(date.getUTCDate() + Math.floor(days));
    return date.toISOString().slice(0, 10);
}

function orderHeader(order: any): InventoryReviewOrder {
    return {
        id: String(order._id),
        code: toText(order.orderNo),
        salesperson: toText(order.salespersonName || order.creator),
        deliveryDate: deliveryDate(order),
        approved: true,
        status: "pending",
        approvalKey: approvalKey(order),
        snapshotKey: "",
        revision: 0,
        products: [],
        remark: "",
    };
}

async function loadApprovedOrder(id: string, session?: mongoose.ClientSession) {
    if (!isValidObjectId(id)) fail(400, "订单 id 格式错误");
    const query = useSalesOrderModel().order.aggregate([
        { $match: { ...APPROVED_FILTER, _id: toObjectId(id) } },
        ...approvalSourceStages(),
        { $project: { _id: 1, orderNo: 1, salespersonName: 1, creator: 1, orderDate: 1, durationDays: 1, products: 1, _reviewSource: 1 } },
    ]);
    if (session) query.session(session);
    const [order] = await query;
    if (!order) fail(404, "订单不存在、尚未审批通过或不在仓库复核范围内");
    return order;
}

function rawProducts(order: any): any[] {
    if (!Array.isArray(order.products)) return [];
    return order.products.map((line: any) => line && typeof line === "object" && !Array.isArray(line) ? line : {});
}

async function loadProducts(lines: any[], session?: mongoose.ClientSession) {
    const ids: string[] = [];
    const codes: string[] = [];
    for (const line of lines) {
        const id = toText(line.productId || line._id || line.id);
        if (isValidObjectId(id)) ids.push(id);
        const code = toText(line.productCode || line.code).toUpperCase();
        if (code) codes.push(code);
    }
    let products: any[] = [];
    if (ids.length || codes.length) {
        const query = InventoryProduct.find({
            _isDeleted: { $ne: true },
            $or: [{ _id: { $in: ids.map((id) => toObjectId(id)) } }, { code: { $in: codes } }],
        }).select("_id code name model image unitName source").lean();
        if (session) query.session(session);
        products = await query;
    }
    const byId = new Map(products.map((product) => [String(product._id), product]));
    const byCode = new Map(products.map((product) => [toText(product.code), product]));
    return { byId, byCode };
}

function resolveProduct(line: any, products: Awaited<ReturnType<typeof loadProducts>>) {
    const id = toText(line.productId || line._id || line.id);
    // 已保存合法产品 id 时不按同名/型号猜测，防止指向已删除产品的新同名记录。
    if (isValidObjectId(id)) return products.byId.get(id);
    return products.byCode.get(toText(line.productCode || line.code).toUpperCase());
}

function availableFromPositions(positions: InventoryReviewStockPosition[]) {
    let available = 0;
    for (const position of positions) {
        if (!position.includeInAvailable) continue;
        available = normalizeStockQuantity(available + Math.max(position.quantity - position.lockedQuantity, 0));
    }
    return available;
}

async function loadAvailableMaps(productIds: string[], orderIds: string[], session?: mongoose.ClientSession) {
    const ids = [...new Set(productIds.filter((id) => isValidObjectId(id)))];
    // 主表与库位核对共用同一份数量/锁定快照，避免分次读取造成显示不一致。
    const positions = await loadInventoryReviewPositions(ids, session);
    const available = new Map<string, number>();
    // 总量含锁定库存及不计可用的仓库；预占已经包含在 quantity 中，不再额外加回。
    const total = new Map<string, number>(ids.map((id) => [id, 0]));
    for (const productId of ids) {
        const rows = positions.get(productId) || [];
        available.set(productId, availableFromPositions(rows));
        for (const position of rows) {
            total.set(productId, normalizeStockQuantity((total.get(productId) || 0) + position.quantity));
        }
    }
    const own = new Map<string, Map<string, number>>();
    if (!ids.length || !orderIds.length) return { available, own, total, positions };
    const reservationQuery = SalesOrderStockReservation.find({
        salesOrderId: { $in: orderIds.map((id) => toObjectId(id)) },
        stockProductId: { $in: ids.map((id) => toObjectId(id)) },
        status: "active",
    }).select("salesOrderId stockProductId warehouseId reservedQuantity consumedQuantity releasedQuantity").lean();
    if (session) reservationQuery.session(session);
    const reservations: any[] = await reservationQuery;
    const warehouseIds = [...new Set(reservations.map((row) => toText(row.warehouseId)).filter(Boolean))];
    const warehouseQuery = InventoryWarehouse.find({
            _id: { $in: warehouseIds.map((id) => toObjectId(id)) },
            _isDeleted: { $ne: true },
            includeInAvailable: { $ne: false },
        }).select("_id").lean();
    if (session) warehouseQuery.session(session);
    const warehouses: any[] = warehouseIds.length ? await warehouseQuery : [];
    const availableWarehouses = new Set(warehouses.map((warehouse) => String(warehouse._id)));
    for (const row of reservations) {
        const warehouseId = toText(row.warehouseId);
        if (warehouseId && !availableWarehouses.has(warehouseId)) continue;
        const remaining = normalizeStockQuantity(Math.max(
            Number(row.reservedQuantity || 0) - Number(row.consumedQuantity || 0) - Number(row.releasedQuantity || 0),
            0,
        ));
        if (remaining <= 0) continue;
        const orderId = String(row.salesOrderId);
        const productId = String(row.stockProductId);
        const map = own.get(orderId) || new Map<string, number>();
        map.set(productId, normalizeStockQuantity((map.get(productId) || 0) + remaining));
        own.set(orderId, map);
    }
    return { available, own, total, positions };
}

function baseProduct(line: any, index: number, product: any, orderId: string, maps: Awaited<ReturnType<typeof loadAvailableMaps>>): InventoryReviewProduct {
    const productId = product ? String(product._id) : "";
    const rawId = toText(line.productId || line._id || line.id || line.productCode || line.code);
    const quantity = Number(line.quantity);
    let issue = product ? "" : "订单产品不存在或已删除，请核对产品资料";
    if (!Number.isFinite(quantity) || quantity <= 0) issue += `${issue ? "；" : ""}订单销售数量无效`;
    return {
        id: `line-${index + 1}:${rawId}`,
        productId,
        productCode: toText(product?.code || line.productCode || line.code),
        model: toText(product?.model || product?.name || line.model || line.productName),
        image: toText(product?.image || line.image),
        unit: toText(line.unitName || line.unit || product?.unitName),
        salesQuantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
        stockQuantity: maps.available.get(productId) || 0,
        ownReservedQuantity: maps.own.get(orderId)?.get(productId) || 0,
        totalQuantity: productId ? maps.total.get(productId) ?? 0 : undefined,
        positions: clone(maps.positions.get(productId) || []),
        checkedQuantity: null,
        differenceReason: "",
        activeBomId: "",
        boms: [],
        ...(issue ? { issue } : {}),
    };
}

export async function retrieveInventoryOrderReviews(query: any) {
    const status = toText(query.status);
    if (status && !["pending", "reviewing", "reviewed"].includes(status)) fail(400, "复核状态无效");
    const keyword = toText(query.keyword);
    if (keyword.length > 200) fail(400, "搜索内容不能超过 200 字");
    const page = getPageParams(query);
    const listFilter: any = {};
    if (status) listFilter._reviewStatus = status;
    if (keyword) {
        const regex = new RegExp(escapeRegExp(keyword), "i");
        listFilter.$or = [{ orderNo: regex }, { "products.productCode": regex }, { "products.model": regex }];
    }
    const [result] = await useSalesOrderModel().order.aggregate([
        { $match: APPROVED_FILTER },
        ...approvalSourceStages(),
        {
            $lookup: {
                from: InventoryOrderReview.collection.name,
                let: { orderId: "$_id", source: "$_reviewSource" },
                pipeline: [
                    { $match: { _isDeleted: { $ne: true }, $expr: { $and: [{ $eq: ["$salesOrderId", "$$orderId"] }, { $eq: ["$snapshot._source", "$$source"] }] } } },
                    { $sort: { updateTime: -1, _id: -1 } },
                    { $limit: 1 },
                    { $project: { _id: 1, status: 1, revision: 1 } },
                ],
                as: "_reviews",
            },
        },
        { $set: { _review: { $arrayElemAt: ["$_reviews", 0] }, _reviewStatus: { $ifNull: [{ $arrayElemAt: ["$_reviews.status", 0] }, "pending"] } } },
        {
            $facet: {
                list: [
                    { $match: listFilter },
                    { $sort: { orderDate: -1, _id: -1 } },
                    { $skip: page.skip },
                    { $limit: page.limit },
                    { $project: { _id: 1, orderNo: 1, salespersonName: 1, creator: 1, orderDate: 1, durationDays: 1, products: 1, _reviewSource: 1, _review: 1, _reviewStatus: 1 } },
                ],
                total: [{ $match: listFilter }, { $count: "value" }],
                counts: [{ $group: { _id: "$_reviewStatus", value: { $sum: 1 } } }],
            },
        },
    ]);
    const rows: any[] = result?.list || [];
    const productMaps = await loadProducts(rows.flatMap((order) => rawProducts(order)));
    const productIds = [...productMaps.byId.keys()];
    const stockMaps = await loadAvailableMaps(productIds, rows.map((order) => String(order._id)));
    const reviewIds = rows.map((order) => order._review?._id).filter(Boolean);
    const savedRows: any[] = reviewIds.length ? await InventoryOrderReview.find({ _id: { $in: reviewIds }, _isDeleted: { $ne: true } }).select(
        "status revision reviewedAt reviewedBy updateTime snapshot.products.id snapshot.products.productCode snapshot.products.model snapshot.products.unit snapshot.products.salesQuantity snapshot.products.stockQuantity snapshot.products.ownReservedQuantity snapshot.products.totalQuantity snapshot.products.positions snapshot.products.checkedQuantity snapshot.products.differenceReason snapshot.products.image snapshot.products.activeBomId snapshot.products.issue",
    ).lean() : [];
    const savedMap = new Map(savedRows.map((record) => [String(record._id), record]));
    const list = rows.map((order) => {
        const row = orderHeader(order);
        const saved = savedMap.get(toText(order._review?._id));
        row.status = order._reviewStatus;
        row.revision = Number(saved?.revision || 0);
        row.updatedAt = saved?.updateTime ? new Date(saved.updateTime).toISOString() : undefined;
        row.reviewedAt = saved?.reviewedAt ? new Date(saved.reviewedAt).toISOString() : undefined;
        row.reviewedBy = toText(saved?.reviewedBy);
        row.products = saved?.status === "reviewed" && Array.isArray(saved.snapshot?.products)
            ? saved.snapshot.products.map((product: any) => normalizeAvailability({ ...product, boms: [] }))
            : rawProducts(order).map((line, index) => baseProduct(line, index, resolveProduct(line, productMaps), row.id, stockMaps));
        return row;
    });
    const counts = { pending: 0, reviewing: 0, reviewed: 0 };
    for (const group of result?.counts || []) {
        const key = group._id as InventoryReviewStatus;
        if (Object.hasOwn(counts, key)) counts[key] = Number(group.value || 0);
    }
    const total = Number(result?.total?.[0]?.value || 0);
    return { list, pagination: { page: page.page, limit: page.limit, total, hasMore: page.skip + list.length < total }, counts };
}

async function liveSnapshot(order: any, session?: mongoose.ClientSession) {
    const lines = rawProducts(order);
    const products = await loadProducts(lines, session);
    const structures = new Map<string, any>();
    const treeIds = new Set<string>(products.byId.keys());
    function collect(node: any) {
        const id = toText(node.productId);
        if (isValidObjectId(id)) treeIds.add(id);
        for (const child of node.children || []) collect(child);
    }
    // 列表不加载 BOM；详情中相同根产品的结构只读取一次。
    for (const line of lines) {
        const product = resolveProduct(line, products);
        if (!product) continue;
        const id = String(product._id);
        if (structures.has(id)) continue;
        const structure = await useInventoryBomModel().getProductStructure(id, 1, new Set<string>(), session);
        structures.set(id, structure);
        collect(structure);
    }
    const treeQuery = InventoryProduct.find({
        _id: { $in: [...treeIds].map((id) => toObjectId(id)) },
        _isDeleted: { $ne: true },
    }).select("_id code name model image unitName source").lean();
    if (session) treeQuery.session(session);
    const treeProducts: any[] = treeIds.size ? await treeQuery : [];
    const treeProductMap = new Map(treeProducts.map((product) => [String(product._id), product]));
    const snapshot = orderHeader(order);
    const maps = await loadAvailableMaps([...treeIds], [snapshot.id], session);
    function material(node: any): InventoryReviewMaterial {
        const id = toText(node.productId);
        const product = treeProductMap.get(id);
        const quantity = Number(node.quantity);
        let issue = node.circular ? "BOM 存在循环引用，请先修正 BOM" : "";
        if (!product) issue += `${issue ? "；" : ""}BOM 产品不存在或已删除`;
        if (!Number.isFinite(quantity) || quantity <= 0) issue += `${issue ? "；" : ""}BOM 用量无效`;
        return {
            id,
            productId: id,
            productCode: toText(product?.code || node.productCode),
            model: toText(product?.model || product?.name || node.model || node.productName),
            image: toText(product?.image || node.image),
            source: toText(product?.source),
            unit: toText(node.unitName || product?.unitName),
            quantityPerSet: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
            stockQuantity: maps.available.get(id) || 0,
            ownReservedQuantity: maps.own.get(snapshot.id)?.get(id) || 0,
            totalQuantity: maps.total.get(id) || 0,
            positions: clone(maps.positions.get(id) || []),
            checkedQuantity: null,
            differenceReason: "",
            ...(issue ? { issue } : {}),
            children: (node.children || []).map((child: any) => material(child)),
        };
    }
    snapshot.products = lines.map((line, index) => {
        const product = resolveProduct(line, products);
        const row = baseProduct(line, index, product, snapshot.id, maps);
        const structure = product ? structures.get(String(product._id)) : null;
        if (structure?.bomId) {
            const id = String(structure.bomId);
            row.activeBomId = id;
            row.boms = [{ id, name: toText(structure.bomName || structure.bomCode), enabled: true, materials: (structure.children || []).map((node: any) => material(node)) }];
        }
        return row;
    });
    function materialBasis(item: InventoryReviewMaterial): any {
        return {
            id: item.id,
            productId: item.productId,
            productCode: item.productCode,
            model: item.model,
            unit: item.unit,
            quantityPerSet: item.quantityPerSet,
            stockQuantity: item.stockQuantity,
            ownReservedQuantity: item.ownReservedQuantity,
            totalQuantity: item.totalQuantity,
            positions: positionBasis(item.positions),
            issue: item.issue || "",
            children: (item.children || []).map(materialBasis),
        };
    }
    const baseline = snapshot.products.map((product) => ({
        id: product.id,
        productId: product.productId,
        productCode: product.productCode,
        model: product.model,
        unit: product.unit,
        salesQuantity: product.salesQuantity,
        stockQuantity: product.stockQuantity,
        ownReservedQuantity: product.ownReservedQuantity,
        totalQuantity: product.totalQuantity,
        positions: positionBasis(product.positions),
        issue: product.issue || "",
        activeBomId: product.activeBomId,
        boms: product.boms.map((bom) => ({
            id: bom.id,
            name: bom.name,
            enabled: bom.enabled,
            materials: bom.materials.map(materialBasis),
        })),
    }));
    // 只散列可信基线，完全排除复核录入、备注、版本及时间。
    snapshot.snapshotKey = hash({ approvalKey: snapshot.approvalKey, products: baseline });
    return snapshot;
}

function boundedText(value: unknown, max: number, label: string) {
    if (typeof value !== "string" && value !== null && value !== undefined) fail(400, `${label}格式无效`);
    const text = toText(value);
    if (text.length > max) fail(400, `${label}不能超过 ${max} 字`);
    return text;
}

function positionBasis(positions: InventoryReviewStockPosition[] = []) {
    return positions.map(({ checkedQuantity, ...position }) => position);
}

function applyItemEdits(target: ReviewItem, incoming: any, complete: boolean) {
    const quantity = incoming.checkedQuantity;
    if (quantity === null && !complete) target.checkedQuantity = null;
    else if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0) fail(400, `${target.productCode}请填写有效的非负复核数量`);
    else target.checkedQuantity = normalizeStockQuantity(quantity);
    target.differenceReason = boundedText(incoming.differenceReason, 1000, "差异原因");
    target.remark = boundedText(incoming.remark, 1000, "备注");
    if (complete && target.issue) fail(409, `${target.productCode}：${target.issue}`);
    const positions = matchingRows(incoming.positions, target.positions || [], "库存库位");
    let actualTotal = 0;
    let fullyChecked = true;
    for (const position of target.positions || []) {
        const value = positions.get(position.id).checkedQuantity;
        if (value === null && !complete) {
            position.checkedQuantity = null;
            fullyChecked = false;
        } else if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
            fail(400, `${target.productCode}请填写各库位有效的非负实盘数量`);
        } else {
            position.checkedQuantity = normalizeStockQuantity(value);
            actualTotal = normalizeStockQuantity(actualTotal + position.checkedQuantity);
        }
    }
    if (fullyChecked && target.checkedQuantity !== actualTotal && (complete || target.checkedQuantity !== null)) fail(400, `${target.productCode}复核总量必须等于各库位实盘合计`);
    if (!fullyChecked && target.checkedQuantity !== null) fail(400, `${target.productCode}尚有未核对库位`);
}

function matchingRows(incoming: any, current: { id: string }[], label: string) {
    if (!Array.isArray(incoming) || incoming.length !== current.length) fail(409, `${label}已变化，请关闭后重新打开复核`);
    const map = new Map<string, any>();
    for (const row of incoming) {
        if (!row || typeof row.id !== "string" || map.has(row.id)) fail(400, `${label}标识缺失或重复`);
        map.set(row.id, row);
    }
    for (const row of current) {
        if (!map.has(row.id)) fail(409, `${label}已变化，请关闭后重新打开复核`);
    }
    return map;
}

function applyMaterialEdits(current: InventoryReviewMaterial[], incoming: any, complete: boolean) {
    const rows = matchingRows(incoming, current, "BOM 物料");
    for (const row of current) {
        const input = rows.get(row.id);
        applyItemEdits(row, input, complete);
        applyMaterialEdits(row.children || [], input.children || [], complete);
    }
}

function applyEdits(snapshot: InventoryReviewOrder, body: any, complete: boolean) {
    const rows = matchingRows(body.products, snapshot.products, "订单产品");
    if (complete && !snapshot.products.length) fail(400, "订单没有可复核的产品");
    for (const product of snapshot.products) {
        const input = rows.get(product.id);
        applyItemEdits(product, input, complete);
        if (input.activeBomId !== product.activeBomId) fail(409, "启用的 BOM 已变化，请关闭后重新打开复核");
        const boms = matchingRows(input.boms, product.boms, "产品 BOM");
        for (const bom of product.boms) {
            applyMaterialEdits(bom.materials, boms.get(bom.id).materials, complete);
        }
    }
    snapshot.remark = boundedText(body.remark, 2000, "复核备注");
}

function restoreDraft(snapshot: InventoryReviewOrder, saved: InventoryReviewOrder) {
    const oldProducts = new Map((saved.products || []).map((product) => [product.id, product]));
    function restorePositions(current: ReviewItem, previous: ReviewItem) {
        const positions = new Map((previous.positions || []).map((position) => [position.id, position]));
        for (const position of current.positions || []) {
            position.checkedQuantity = positions.get(position.id)?.checkedQuantity ?? null;
        }
        const allChecked = (current.positions || []).every((position) => position.checkedQuantity !== null);
        current.checkedQuantity = allChecked
            ? normalizeStockQuantity((current.positions || []).reduce((sum, position) => sum + Number(position.checkedQuantity || 0), 0))
            : null;
    }
    function restoreMaterials(current: InventoryReviewMaterial[], old: InventoryReviewMaterial[]) {
        const rows = new Map((old || []).map((item) => [item.id, item]));
        for (const item of current) {
            const previous = rows.get(item.id);
            if (!previous) continue;
            restorePositions(item, previous);
            item.differenceReason = previous.differenceReason;
            item.remark = previous.remark || "";
            restoreMaterials(item.children || [], previous.children || []);
        }
    }
    for (const product of snapshot.products) {
        const previous = oldProducts.get(product.id);
        if (!previous) continue;
        restorePositions(product, previous);
        product.differenceReason = previous.differenceReason;
        product.remark = previous.remark || "";
        const oldBoms = new Map((previous.boms || []).map((bom) => [bom.id, bom]));
        for (const bom of product.boms) {
            const oldBom = oldBoms.get(bom.id);
            if (oldBom) restoreMaterials(bom.materials, oldBom.materials);
        }
    }
    snapshot.remark = saved.remark || "";
}

function normalizeAvailability<T extends ReviewItem>(item: T): T {
    if (item.ownReservedQuantity !== undefined || !Array.isArray(item.positions)) return item;
    // 旧已复核记录只由当时冻结的库位数据拆分，不查询当前库存，不改写历史记录。
    const available = availableFromPositions(item.positions);
    item.ownReservedQuantity = normalizeStockQuantity(Math.max(item.stockQuantity - available, 0));
    item.stockQuantity = available;
    return item;
}

function publicSnapshot(record: any): InventoryReviewOrder {
    const { _source, ...snapshot } = clone(record.snapshot as StoredSnapshot);
    function normalizeMaterials(materials: InventoryReviewMaterial[]) {
        for (const material of materials) {
            normalizeAvailability(material);
            normalizeMaterials(material.children || []);
        }
    }
    for (const product of snapshot.products) {
        normalizeAvailability(product);
        for (const bom of product.boms) normalizeMaterials(bom.materials);
    }
    return {
        ...snapshot,
        status: record.status,
        revision: Number(record.revision),
        reviewedBy: toText(record.reviewedBy),
        reviewedAt: record.reviewedAt ? new Date(record.reviewedAt).toISOString() : undefined,
        updatedAt: record.updateTime ? new Date(record.updateTime).toISOString() : undefined,
    };
}

export async function getInventoryOrderReviewDetail(id: string): Promise<InventoryReviewOrder> {
    const order = await loadApprovedOrder(id);
    const saved: any = await InventoryOrderReview.findOne({ salesOrderId: order._id, approvalKey: approvalKey(order), _isDeleted: { $ne: true } }).lean();
    if (saved?.status === "reviewed") return publicSnapshot(saved);
    const snapshot = await liveSnapshot(order);
    if (saved) {
        restoreDraft(snapshot, saved.snapshot);
        snapshot.status = "reviewing";
        snapshot.revision = Number(saved.revision);
        snapshot.updatedAt = saved.updateTime ? new Date(saved.updateTime).toISOString() : undefined;
    }
    return snapshot;
}

export async function saveInventoryOrderReview(body: any, actor: string, complete: boolean): Promise<InventoryReviewOrder> {
    if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "复核数据格式无效");
    const order = await loadApprovedOrder(toText(body.id));
    const key = approvalKey(order);
    if (body.approvalKey !== key) fail(409, "订单审批或产品已变化，请关闭后重新打开复核");
    if (!Number.isInteger(body.revision) || body.revision < 0) fail(400, "复核版本无效");
    const current: any = await InventoryOrderReview.findOne({ salesOrderId: order._id, approvalKey: key, _isDeleted: { $ne: true } }).lean();
    if (current?.status === "reviewed") fail(409, "订单已完成复核，不能重复修改");
    if (body.revision !== Number(current?.revision || 0)) fail(409, "复核记录已被其他人员修改，请关闭后重新打开");
    const snapshot = await liveSnapshot(order);
    if (body.snapshotKey !== snapshot.snapshotKey) fail(409, "库存或 BOM 已变化，请关闭后重新打开复核");
    applyEdits(snapshot, body, complete);
    const session = await mongoose.startSession();
    let savedRecord: any;
    try {
        await session.withTransaction(async () => {
            // 与删除/撤回/重提争用同一订单文档，不能用事务外二次读代替写锁。
            // 该计数仅用于并发控制，不触碰履约状态、业务修改时间或真实库存。
            const locked = await useSalesOrderModel().order.updateOne(
                { ...APPROVED_FILTER, _id: order._id },
                { $inc: { inventoryReviewVersion: 1 } },
                { session, timestamps: false },
            );
            if (locked.matchedCount !== 1) fail(409, "订单已删除或不再处于审批通过状态，请重新打开复核");
            const latestOrder = await loadApprovedOrder(snapshot.id, session);
            if (approvalKey(latestOrder) !== key) fail(409, "订单审批或产品已变化，请重新打开复核");
            const latest: any = await InventoryOrderReview.findOne({ salesOrderId: order._id, approvalKey: key, _isDeleted: { $ne: true } }).session(session).lean();
            if (latest?.status === "reviewed") fail(409, "订单已完成复核，不能重复修改");
            if (body.revision !== Number(latest?.revision || 0)) fail(409, "复核记录已被其他人员修改，请关闭后重新打开");
            const transactionalSnapshot = await liveSnapshot(latestOrder, session);
            if (transactionalSnapshot.snapshotKey !== snapshot.snapshotKey) fail(409, "库存或 BOM 已变化，请重新打开后核对");
            const now = new Date();
            snapshot.status = complete ? "reviewed" : "reviewing";
            snapshot.revision = Number(latest?.revision || 0) + 1;
            snapshot.updatedAt = now.toISOString();
            if (complete) {
                snapshot.reviewedBy = actor;
                snapshot.reviewedAt = now.toISOString();
                snapshot.result = await completeInventoryOrderReview(snapshot, latestOrder, actor, session);
            }
            const stored: StoredSnapshot = { ...snapshot, _source: clone(latestOrder._reviewSource) };
            const data = {
                status: snapshot.status,
                snapshot: stored,
                updatedBy: actor,
                reviewedBy: complete ? actor : "",
                reviewedAt: complete ? now : null,
            };
            if (latest) {
                savedRecord = await InventoryOrderReview.findOneAndUpdate(
                    { _id: latest._id, approvalKey: key, status: "reviewing", revision: body.revision, _isDeleted: { $ne: true } },
                    { $set: data, $inc: { revision: 1 } },
                    { new: true, runValidators: true, session },
                ).lean();
                if (!savedRecord) fail(409, "复核记录已被其他人员修改，请关闭后重新打开");
            } else {
                const [created] = await InventoryOrderReview.create([{
                    ...data,
                    salesOrderId: order._id,
                    approvalKey: key,
                    revision: 1,
                    createdBy: actor,
                }], { session });
                savedRecord = created.toObject();
            }
        });
        return publicSnapshot(savedRecord);
    } catch (error: any) {
        if (error?.code === 11000) fail(409, "复核记录已由其他人员保存，请关闭后重新打开");
        if (error?.code === 20 || /Transaction numbers are only allowed|replica set|does not support retryable writes/i.test(String(error?.message || ""))) {
            fail(503, "当前数据库不支持事务，仓库复核未保存，请检查副本集配置");
        }
        throw error;
    } finally {
        await session.endSession();
    }
}
