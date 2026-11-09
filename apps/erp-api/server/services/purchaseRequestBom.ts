import mongoose from "mongoose";
import { createHash } from "node:crypto";
import type { PurchaseRequestItem } from "~~/shared/types/approval";
import type { PurchaseBomExpansion, PurchaseBomGroup, PurchaseBomNode, PurchaseBomPreview, PurchaseBomPreviewLine } from "~~/shared/types/purchaseBom";
import { InventoryBom } from "~~/server/models/inventoryBom.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import { InventoryWarehouse, InventoryLocation } from "~~/server/models/inventoryBase.model";
import { PurchaseMaterialRequirement } from "~~/server/models/purchaseMaterialRequirement.model";
import { PurchaseOrderAllocation } from "~~/server/models/purchaseOrderAllocation.model";
import { PurchaseRequestOrderAllocation } from "~~/server/models/purchaseRequestOrderAllocation.model";
import { PurchaseRequest, PURCHASE_REQUEST_EDITABLE_STATUSES } from "~~/server/models/purchaseRequest.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { InventoryHttpError, toObjectId, toText } from "./inventory";
import { normalizeStockQuantity as qty } from "./inventoryStockMath";
import { loadProductionPublicMaterialSources, type ProductionPublicMaterialSource } from "./productionPublicMaterials";
import { resolveProductionReservationOrigins } from "./productionMaterialPool";
import { completionReservationBalance } from "./salesOrderProductionCompletionMath";
import { ensureSalesOrderCompletionState, hasSalesOrderCompletionRelease } from "./salesOrderCompletionState";
import { isSalesOrderWaitingInventoryReview } from "./salesOrderInventoryReviewGate";

type PreviewOptions = { draftId?: string; adminId?: string; session?: mongoose.ClientSession };
type StockReservationPlan = { source: ProductionPublicMaterialSource; demandProductId: string; quantity: number; requiredQuantity: number };
type BomPlan = { preview: PurchaseBomPreview; requirements: any[]; converted: any[]; products: Map<string, any>;
    reservations: StockReservationPlan[]; bomLocks: any[]; ownLocks: any[] };

const id = (value: any) => toText(value?.toString?.() || value);
const fail = (message: string, status = 409): never => { throw new InventoryHttpError(status, status, message); };
const withSession = (query: any, session?: mongoose.ClientSession) => session ? query.session(session) : query;
const rootId = (requirement: any) => id(requirement.demandProductId || requirement.productId);
const poolKey = (demandProductId: string, productId: string) => `${demandProductId}:${productId}`;

const requirementLine = (requirement: any, product: any): PurchaseBomPreviewLine => ({
    id: id(requirement._id),
    productId: id(requirement.productId),
    productCode: requirement.productCode || product?.code || "",
    productModel: requirement.productModel || product?.model || "",
    unitName: requirement.unitName || product?.unitName || "",
    categoryName: product?.categoryPath || product?.categoryName || "",
    image: product?.image || "",
    remainingPurchaseQuantity: qty(requirement.remainingPurchaseQuantity),
    shortageQuantity: qty(requirement.shortageQuantity),
    ...(requirement.bomLineKey ? { bomLineKey: requirement.bomLineKey } : {}),
});

async function buildBomPlan(salesOrderId: string, options: PreviewOptions): Promise<BomPlan> {
    if (!mongoose.isValidObjectId(salesOrderId)) fail("销售订单 ID 不合法", 400);
    const { session, draftId, adminId } = options;
    const order = await ensureSalesOrderCompletionState({ _id: salesOrderId }, session, { readOnly: true });
    if (!["待采购", "待生产", "生产中"].includes(order.status) || hasSalesOrderCompletionRelease(order)
        || isSalesOrderWaitingInventoryReview(order)) fail("销售订单当前不能进行采购 BOM 分析");
    let draft: any = null;
    if (draftId) {
        if (!mongoose.isValidObjectId(draftId) || !mongoose.isValidObjectId(adminId || "")) fail("采购申请草稿不合法", 400);
        draft = await withSession(PurchaseRequest.findOne({ _id: toObjectId(draftId), applicantId: toObjectId(adminId!), status: { $in: PURCHASE_REQUEST_EDITABLE_STATUSES } }).lean(), session);
        if (!draft || (draft.salesOrderId && id(draft.salesOrderId) !== salesOrderId)) fail("采购申请不存在、不可编辑或订单已变化");
    }
    // 查全量需求，避免 BOM 物料被通用列表分页上限截断。
    const requirements = await withSession(PurchaseMaterialRequirement.find({
        salesOrderId: toObjectId(salesOrderId), _isDeleted: { $ne: true }, demandType: "purchase",
        source: { $ne: "purchase-request-added" }, status: "未完成", poolReady: { $ne: true },
        remainingPurchaseQuantity: { $gt: 0 },
    }).sort({ _id: 1 }).lean(), session) as any[];
    const requirementIds = requirements.map((row) => row._id);
    const references = requirementIds.length ? await withSession(PurchaseRequest.find({
        status: "draft", "items.requirementId": { $in: requirementIds.map(id) },
        ...(draftId ? { _id: { $ne: toObjectId(draftId) } } : {}),
    }).select("items.requirementId").lean(), session) as any[] : [];
    const otherDraftIds = new Set<string>();
    for (const request of references) {
        for (const item of request.items || []) if (item.requirementId) otherDraftIds.add(id(item.requirementId));
    }
    const draftRequirementIds = new Set<string>();
    for (const item of draft?.items || []) if (item.requirementId) draftRequirementIds.add(id(item.requirementId));
    if (draft) {
        for (const requirementId of draftRequirementIds) {
            const row = requirements.find((item) => id(item._id) === requirementId);
            if (!row || otherDraftIds.has(requirementId) || (row.purchaseRequestId && id(row.purchaseRequestId) !== draftId)) {
                fail("草稿中的订单缺口已变化或被其他申请占用，请重新选择关联订单");
            }
        }
    }
    const eligible = requirements.filter((row) => (!draft || draftRequirementIds.has(id(row._id)))
        && (!row.purchaseRequestId || id(row.purchaseRequestId) === draftId) && !otherDraftIds.has(id(row._id)));
    const allocations = requirementIds.length ? await withSession(PurchaseOrderAllocation.find({
        requirementId: { $in: requirementIds },
    }).select("requirementId").lean(), session) as any[] : [];
    const requestAllocations = requirementIds.length ? await withSession(PurchaseRequestOrderAllocation.find({
        requirementId: { $in: requirementIds },
    }).select("requirementId").lean(), session) as any[] : [];
    const allocatedIds = new Set([...allocations, ...requestAllocations].map((row) => id(row.requirementId)));
    const products = new Map<string, any>();
    const boms = new Map<string, any>();
    async function product(productId: string) {
        if (!mongoose.isValidObjectId(productId)) fail("BOM 中存在无效产品，请先维护 BOM");
        if (!products.has(productId)) {
            const row = await withSession(InventoryProduct.findOne({ _id: toObjectId(productId), _isDeleted: { $ne: true } })
                .select("code name model categoryName categoryPath image unitId unitName").lean(), session);
            if (!row) fail("BOM 产品不存在或已删除，请先维护产品资料");
            products.set(productId, row);
        }
        return products.get(productId);
    }
    async function bom(productId: string) {
        if (!boms.has(productId)) {
            const row = await withSession(InventoryBom.findOne({
                productId: toObjectId(productId), isEnabled: true, _isDeleted: { $ne: true },
            }).select("code name version items updateTime").lean(), session);
            boms.set(productId, row || null);
        }
        return boms.get(productId);
    }
    async function tree(productId: string, key: string, quantity: number, visited: Set<string>, depth: number, unit?: string, unitId?: string): Promise<PurchaseBomNode> {
        if (depth >= 20 || visited.has(productId)) fail("BOM 存在循环引用或超过 20 层，请先维护 BOM");
        const current = await product(productId);
        if ((unitId && unitId !== id(current.unitId)) || (unit && current.unitName && unit !== current.unitName)) {
            fail(`${current.code || current.model || "BOM 物料"}的 BOM 单位与库存单位不一致，请先统一单位`);
        }
        const currentBom = await bom(productId);
        const node: PurchaseBomNode = {
            key, productId, productCode: current.code || "", model: current.model || current.name || "",
            category: current.categoryPath || current.categoryName || "", image: current.image || "", unit: unit || current.unitName || "",
            quantity, requiredQuantity: 0, availableQuantity: 0, shortageQuantity: 0, children: [],
            ...(currentBom ? { bomId: id(currentBom._id), bomCode: currentBom.code || "", bomName: currentBom.name || "", bomVersion: currentBom.version || "" } : {}),
        };
        if (!currentBom?.items?.length) return node;
        const path = new Set(visited);
        path.add(productId);
        const items = [...currentBom.items].sort((a: any, b: any) => Number(a.sort || 0) - Number(b.sort || 0) || id(a.productId).localeCompare(id(b.productId)));
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            const childQuantity = Number(item.quantity);
            if (!Number.isFinite(childQuantity) || childQuantity <= 0 || qty(childQuantity) !== childQuantity) fail("BOM 用量必须为正数且最多三位小数");
            node.children.push(await tree(id(item.productId), `${key}/${index}`, childQuantity, path, depth + 1, item.unitName, id(item.unitId)));
        }
        return node;
    }
    const groups: PurchaseBomGroup[] = [];
    const groupIds = new Set<string>();
    for (const group of draft?.bomGroups || []) {
        if (group?.sourceRequirementId && group.root && !groupIds.has(group.sourceRequirementId)) {
            groups.push(group); groupIds.add(group.sourceRequirementId);
        }
    }
    for (const row of eligible) {
        if (row.bomGroup?.sourceRequirementId && !groupIds.has(row.bomGroup.sourceRequirementId)) {
            groups.push(row.bomGroup); groupIds.add(row.bomGroup.sourceRequirementId);
        }
    }
    const converted: any[] = [];
    for (const row of eligible) {
        const remaining = Number(row.remainingPurchaseQuantity);
        if (!Number.isFinite(remaining) || remaining <= 0 || remaining > Number.MAX_SAFE_INTEGER || qty(remaining) <= 0) {
            fail("订单采购缺口数量无效，请先核对来源需求");
        }
        await product(id(row.productId));
        if (row.bomSourceRequirementId) continue;
        const currentBom = await bom(id(row.productId));
        if (!currentBom?.items?.length) continue;
        if (allocatedIds.has(id(row._id)) || Number(row.allocatedQuantity || 0) > 0 || Number(row.fulfilledQuantity || 0) > 0
            || (row.purchaseRequestId && id(row.purchaseRequestId) !== draftId)) fail(`${row.productCode || "成品"}已被采购申请或采购记录占用，不能拆分 BOM`);
        const demandProductId = rootId(row);
        if (!(order.products || []).some((line: any) => id(line.productId || line._id || line.id) === demandProductId)) {
            fail("成品采购缺口缺少有效的订单产品归属，请先核对来源需求");
        }
        const root = await tree(id(row.productId), id(row._id), 1, new Set(), 0);
        groups.push({ sourceRequirementId: id(row._id), demandProductId, root });
        converted.push(row);
    }
    const convertedIds = new Set(converted.map((row) => id(row._id)));
    const newGroups = groups.filter((group) => convertedIds.has(group.sourceRequirementId));
    const list = eligible.filter((row) => !convertedIds.has(id(row._id))).map((row) => requirementLine(row, products.get(id(row.productId))));
    if (!converted.length) {
        if (list.length > 100) fail("采购物料超过 100 行，请拆分订单后发起采购申请", 400);
        return { preview: { version: "", sourceRequirementIds: [], groups, list }, requirements, converted, products,
            reservations: [], bomLocks: [], ownLocks: [] };
    }
    const publicSources = await loadProductionPublicMaterialSources([...products.keys()], session);
    const rawReservations = await withSession(SalesOrderStockReservation.find({
        salesOrderId: toObjectId(salesOrderId), reservationType: "production-material", status: "active",
        stockProductId: { $in: [...products.keys()].map(toObjectId) },
    }).sort({ _id: 1 }).lean(), session) as any[];
    const ownReservations = await resolveProductionReservationOrigins(rawReservations, session);
    const ownStocks = rawReservations.length ? await withSession(InventoryStock.find({
        _isDeleted: { $ne: true }, $or: rawReservations.map((row) => ({
            productId: row.stockProductId, warehouseId: row.warehouseId || null, locationId: row.locationId || null,
        })),
    }).select("productId warehouseId locationId quantity lockedQuantity").sort({ _id: 1 }).lean(), session) as any[] : [];
    const ownWarehouses = rawReservations.length ? await withSession(InventoryWarehouse.find({
        _id: { $in: rawReservations.map((row) => row.warehouseId).filter(Boolean) }, _isDeleted: { $ne: true }, includeInAvailable: true,
    }).select("_id").lean(), session) as any[] : [];
    const ownLocations = rawReservations.length ? await withSession(InventoryLocation.find({
        _id: { $in: rawReservations.map((row) => row.locationId).filter(Boolean) }, _isDeleted: { $ne: true },
    }).select("_id warehouseId").lean(), session) as any[] : [];
    const validWarehouses = new Set(ownWarehouses.map((row) => id(row._id)));
    const ownBalances = new Map<string, number>();
    const ownPositionTotals = new Map<string, number>();
    for (const row of ownReservations) {
        const balance = completionReservationBalance(row);
        if (!balance.valid) fail("本订单物料预占余额异常，请先核对库存");
        if (balance.remaining <= 0) continue;
        const stock = ownStocks.find((item) => id(item.productId) === id(row.stockProductId)
            && id(item.warehouseId) === id(row.warehouseId) && id(item.locationId) === id(row.locationId));
        const location = ownLocations.find((item) => id(item._id) === id(row.locationId) && id(item.warehouseId) === id(row.warehouseId));
        if (!stock || !location || !validWarehouses.has(id(row.warehouseId)) || qty(stock.quantity) < qty(stock.lockedQuantity)) {
            fail("本订单物料预占的库存或仓位无效，请先核对库存");
        }
        const position = `${id(stock.productId)}:${id(stock.warehouseId)}:${id(stock.locationId)}`;
        const total = qty((ownPositionTotals.get(position) || 0) + balance.remaining);
        ownPositionTotals.set(position, total);
        if (total > qty(stock.lockedQuantity)) fail("本订单物料预占超过实际锁定库存，请先核对库存");
        const key = poolKey(id(row.demandProductId), id(row.stockProductId));
        ownBalances.set(key, qty((ownBalances.get(key) || 0) + Math.max(0, balance.remaining - balance.allocated)));
    }
    const committedRequirements = await withSession(PurchaseMaterialRequirement.find({
        salesOrderId: toObjectId(salesOrderId), _isDeleted: { $ne: true }, demandType: "purchase",
    }).select("productId demandProductId requiredQuantity availableQuantityAtAnalysis remainingFulfillmentQuantity fulfilledQuantity bomSourceRequirementId").sort({ _id: 1 }).lean(), session) as any[];
    const historicalSources = await withSession(PurchaseMaterialRequirement.find({
        salesOrderId: toObjectId(salesOrderId), _isDeleted: true, "bomGroup.sourceRequirementId": { $exists: true },
    }).select("bomGroup").sort({ _id: 1 }).lean(), session) as any[];
    // 已拆分来源在软删除文档中保留覆盖依据，包含完全由现有库存覆盖、没有采购叶子的情况。
    function subtractCoverage(node: PurchaseBomNode, demandProductId: string, isRoot = false) {
        if (!isRoot) {
            const key = poolKey(demandProductId, node.productId);
            ownBalances.set(key, qty(Math.max(0, (ownBalances.get(key) || 0) - node.availableQuantity)));
        }
        for (const child of node.children || []) subtractCoverage(child, demandProductId);
    }
    for (const source of historicalSources) {
        const group = source.bomGroup as PurchaseBomGroup;
        subtractCoverage(group.root, group.demandProductId, true);
    }
    // 未拆需求的原有覆盖及已拆需求的后续采购到货继续留给原需求。
    for (const row of committedRequirements) {
        if (convertedIds.has(id(row._id))) continue;
        const key = poolKey(rootId(row), id(row.productId));
        const covered = row.bomSourceRequirementId
            ? Math.max(0, qty(row.fulfilledQuantity))
            : Math.max(0, qty(Number(row.requiredQuantity || 0) - Number(row.remainingFulfillmentQuantity || 0)));
        ownBalances.set(key, qty(Math.max(0, (ownBalances.get(key) || 0) - covered)));
    }
    const sourceSnapshots = [...publicSources].map(([productId, rows]) => [productId, rows.map((row) => ({
        id: id(row._id), warehouseId: id(row.warehouseId), locationId: id(row.locationId), quantity: row.quantity, lockedQuantity: row.lockedQuantity || 0,
    }))]);
    const reservations: StockReservationPlan[] = [];
    const usedOwnPools = new Set<string>();
    const leafLines = new Map<string, PurchaseBomPreviewLine>();
    function calculate(node: PurchaseBomNode, required: number, group: PurchaseBomGroup, isRoot = false) {
        if (!Number.isFinite(required) || required < 0 || required > Number.MAX_SAFE_INTEGER) fail("BOM 累计物料数量超出有效范围，请先核对 BOM 用量");
        node.requiredQuantity = qty(required);
        let remaining = node.requiredQuantity;
        if (!isRoot && remaining > 0) {
            const key = poolKey(group.demandProductId, node.productId);
            const own = Math.min(remaining, ownBalances.get(key) || 0);
            if (own > 0) usedOwnPools.add(key);
            ownBalances.set(key, qty((ownBalances.get(key) || 0) - own));
            remaining = qty(remaining - own);
            for (const source of publicSources.get(node.productId) || []) {
                if (remaining <= 0) break;
                const take = qty(Math.min(remaining, source.available));
                if (take <= 0) continue;
                reservations.push({ source: { ...source }, demandProductId: group.demandProductId, quantity: take, requiredQuantity: node.requiredQuantity });
                source.available = qty(source.available - take);
                remaining = qty(remaining - take);
            }
        }
        node.availableQuantity = qty(node.requiredQuantity - remaining);
        node.shortageQuantity = remaining;
        for (const child of node.children) calculate(child, remaining * child.quantity, group);
        if (node.children.length || remaining <= 0) return;
        const key = `${group.sourceRequirementId}:${node.productId}`;
        const previous = leafLines.get(key);
        if (previous) {
            if (previous.unitName !== node.unit) fail("同一 BOM 物料存在不同单位，请先统一 BOM 单位");
            if (!Number.isFinite(previous.remainingPurchaseQuantity + remaining)
                || previous.remainingPurchaseQuantity + remaining > Number.MAX_SAFE_INTEGER) fail("BOM 累计物料数量超出有效范围，请先核对 BOM 用量");
            previous.remainingPurchaseQuantity = qty(previous.remainingPurchaseQuantity + remaining);
            previous.shortageQuantity = previous.remainingPurchaseQuantity;
        } else {
            leafLines.set(key, {
                productId: node.productId, productCode: node.productCode, productModel: node.model, unitName: node.unit,
                categoryName: node.category, image: node.image, remainingPurchaseQuantity: remaining, shortageQuantity: remaining, bomLineKey: key,
            });
        }
    }
    for (const group of newGroups) {
        const source = converted.find((row) => id(row._id) === group.sourceRequirementId);
        calculate(group.root, Number(source.remainingPurchaseQuantity), group, true);
    }
    if (list.length + leafLines.size > 100) fail("BOM 拆分后采购物料超过 100 行，请拆分订单后发起采购申请", 400);
    const version = createHash("sha256").update(JSON.stringify({
        salesOrderId, requirements, boms: [...boms], products: [...products], sources: sourceSnapshots, reservations: rawReservations,
        ownStocks, ownWarehouses, ownLocations,
        otherDraftIds: [...otherDraftIds].sort(), allocatedIds: [...allocatedIds].sort(), committedRequirements, historicalSources,
    })).digest("hex");
    const ownLocks = ownReservations.filter((row) => usedOwnPools.has(poolKey(id(row.demandProductId), id(row.stockProductId))));
    return { preview: { version, sourceRequirementIds: converted.map((row) => id(row._id)), groups, list: [...list, ...leafLines.values()] },
        requirements, converted, products, reservations, bomLocks: [...boms.values()].filter(Boolean), ownLocks };
}

export async function previewPurchaseRequestBom(salesOrderId: string, options: PreviewOptions = {}): Promise<PurchaseBomPreview> {
    return (await buildBomPlan(salesOrderId, options)).preview;
}

export async function applyPurchaseRequestBom(options: {
    salesOrderId: string; expansion: PurchaseBomExpansion; items: PurchaseRequestItem[]; actor: string;
    adminId: string; draftId?: string; session: mongoose.ClientSession;
}): Promise<{ items: PurchaseRequestItem[]; groups: PurchaseBomGroup[] }> {
    if (!options.session.inTransaction()) fail("BOM 拆分必须在事务中执行", 400);
    const plan = await buildBomPlan(options.salesOrderId, options);
    const { preview } = plan;
    if (!options.items.length && preview.list.length) {
        fail("当前申请仍有物料需要采购，请刷新产品明细后重试");
    }
    const suppliedIds = options.expansion.sourceRequirementIds;
    if (preview.version !== options.expansion.version || suppliedIds.length !== preview.sourceRequirementIds.length
        || new Set(suppliedIds).size !== suppliedIds.length || suppliedIds.some((sourceId) => !preview.sourceRequirementIds.includes(sourceId))) {
        fail("订单需求、BOM 或库存已变化，请刷新产品明细后重试");
    }
    const expectedLines = new Map(preview.list.filter((line) => !line.id && line.bomLineKey).map((line) => [line.bomLineKey!, line]));
    const submitted = new Map<string, PurchaseRequestItem>();
    for (const item of options.items) {
        if (!item.bomLineKey || item.requirementId) continue;
        const line = expectedLines.get(item.bomLineKey);
        if (!line || submitted.has(item.bomLineKey) || item.productId !== line.productId
            || !Number.isFinite(item.quantity) || qty(item.quantity) !== item.quantity || item.quantity < line.remainingPurchaseQuantity) {
            fail("BOM 采购物料或数量不合法，请刷新后重试");
        }
        submitted.set(item.bomLineKey, item);
    }
    if (submitted.size !== expectedLines.size) fail("BOM 采购物料不完整，请刷新产品明细后重试");
    if (!plan.converted.length) return { items: options.items, groups: preview.groups };
    const convertedIds = new Set(preview.sourceRequirementIds);
    if (options.items.some((item) => item.requirementId && convertedIds.has(item.requirementId))) fail("成品已拆为 BOM 物料，不能同时采购原成品");
    // 真写内部修订号，让 BOM 编辑、生产领料与本次采购抵扣在事务中产生写冲突，禁止快照写偏斜。
    for (const bom of plan.bomLocks) {
        const locked = await InventoryBom.collection.updateOne({
            _id: bom._id, isEnabled: true, _isDeleted: { $ne: true }, version: bom.version, updateTime: bom.updateTime,
        }, { $inc: { purchaseBomRevision: 1 } }, { session: options.session });
        if (locked.matchedCount !== 1) fail("BOM 已变化，请刷新产品明细后重试");
    }
    for (const reservation of plan.ownLocks) {
        const filter: Record<string, any> = { _id: reservation._id, status: "active", reservedQuantity: reservation.reservedQuantity };
        for (const field of ["consumedQuantity", "releasedQuantity", "productionAllocatedQuantity"]) {
            filter[field] = reservation[field] === undefined ? { $exists: false } : reservation[field];
        }
        const locked = await SalesOrderStockReservation.collection.updateOne(filter, { $inc: { purchaseBomRevision: 1 } }, { session: options.session });
        if (locked.matchedCount !== 1) fail("本订单物料预占已变化，请刷新产品明细后重试");
    }
    const now = new Date();
    for (const source of plan.converted) {
        const changed = await PurchaseMaterialRequirement.updateOne({
            _id: source._id, _isDeleted: { $ne: true }, purchaseRequestId: source.purchaseRequestId || null, poolReady: { $ne: true },
            remainingPurchaseQuantity: source.remainingPurchaseQuantity, updateTime: source.updateTime,
        }, { $set: { _isDeleted: true, deletedAt: now, deletedBy: options.actor, updatedBy: options.actor,
            bomGroup: preview.groups.find((group) => group.sourceRequirementId === id(source._id)) } }, { session: options.session });
        if (changed.matchedCount !== 1) fail("成品采购需求已被其他申请占用，请刷新后重试");
    }
    const createdIds = new Map<string, string>();
    for (const [key, line] of expectedLines) {
        const sourceId = key.slice(0, key.indexOf(":"));
        const source = plan.converted.find((row) => id(row._id) === sourceId);
        const group = preview.groups.find((row) => row.sourceRequirementId === sourceId)!;
        const currentProduct = plan.products.get(line.productId);
        let requiredQuantity = 0;
        let availableQuantity = 0;
        function collectLeaf(node: PurchaseBomNode) {
            if (!node.children.length && node.productId === line.productId) {
                requiredQuantity = qty(requiredQuantity + node.requiredQuantity);
                availableQuantity = qty(availableQuantity + node.availableQuantity);
            }
            for (const child of node.children) collectLeaf(child);
        }
        collectLeaf(group.root);
        const [created] = await PurchaseMaterialRequirement.create([{
            salesOrderId: source.salesOrderId, salesOrderNo: source.salesOrderNo, salesOrderStatusSnapshot: source.salesOrderStatusSnapshot,
            salesperson: source.salesperson, orderType: source.orderType, dispatchDate: source.dispatchDate,
            contractDeliveryDate: source.contractDeliveryDate, durationText: source.durationText,
            productId: toObjectId(line.productId), demandProductId: toObjectId(group.demandProductId), productCode: line.productCode,
            productModel: line.productModel, unitId: currentProduct.unitId || null, unitName: line.unitName,
            requiredQuantity, availableQuantityAtAnalysis: availableQuantity, shortageQuantity: line.shortageQuantity,
            remainingPurchaseQuantity: line.shortageQuantity, remainingFulfillmentQuantity: line.shortageQuantity,
            allocatedQuantity: 0, fulfilledQuantity: 0, demandType: "purchase", suggestion: "需要采购", source: "sales-order-shortage",
            analysisVersion: `bom-${preview.version}`, bomSourceRequirementId: sourceId, bomLineKey: key, bomGroup: group,
            poolReady: false, status: "未完成", createdBy: options.actor, updatedBy: options.actor,
        }], { session: options.session });
        createdIds.set(key, id(created._id));
    }
    for (const reservation of plan.reservations) {
        const source = reservation.source;
        const locked = await InventoryStock.updateOne({
            _id: source._id, _isDeleted: { $ne: true }, $expr: { $gte: [{ $subtract: ["$quantity", { $ifNull: ["$lockedQuantity", 0] }] }, reservation.quantity] },
        }, { $inc: { lockedQuantity: reservation.quantity }, $set: { updatedBy: options.actor } }, { session: options.session });
        if (locked.modifiedCount !== 1) fail("BOM 物料库存已被其他订单占用，请刷新后重试");
        await SalesOrderStockReservation.create([{
            salesOrderId: toObjectId(options.salesOrderId), salesOrderNo: plan.converted[0].salesOrderNo,
            demandProductId: toObjectId(reservation.demandProductId), stockProductId: source.productId,
            warehouseId: source.warehouseId, locationId: source.locationId, reservationType: "production-material",
            requiredQuantity: reservation.requiredQuantity, reservedQuantity: reservation.quantity,
            consumedQuantity: 0, releasedQuantity: 0, productionAllocatedQuantity: 0, status: "active",
            createdBy: options.actor, updatedBy: options.actor,
        }], { session: options.session });
    }
    const items = options.items.map((item) => {
        const requirementId = item.bomLineKey && !item.requirementId ? createdIds.get(item.bomLineKey) : "";
        if (!requirementId) return item;
        const line = expectedLines.get(item.bomLineKey!)!;
        return { ...item, name: line.productCode, model: line.productModel, unit: line.unitName, requirementId,
            shortageQuantity: line.shortageQuantity, minQuantity: line.remainingPurchaseQuantity };
    });
    return { items, groups: preview.groups };
}
