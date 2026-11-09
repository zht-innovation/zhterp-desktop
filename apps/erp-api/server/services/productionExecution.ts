import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { PUBLIC_MATERIAL_ALLOCATION_REASONS } from "~~/shared/types/production-execution";
import { canAccessProductionExecution, canExecuteProductionAction } from "~~/shared/utils/adminPermission";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { ProductionRequisition, ProductionCompletion, ProductionMaterialLoss, ProductionExecutionOperation } from "~~/server/models/productionExecution.model";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import { InventoryWarehouse, InventoryLocation } from "~~/server/models/inventoryBase.model";
import { SalesOrderStockReservation } from "~~/server/models/salesOrderStockReservation.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";
import { postProductionInventoryDocument, type ProductionInventoryLine } from "./productionInventory";
import { buildExecutionOrders, executionId as id, executionSourceKey, findExecutionMaterialSources } from "./productionExecutionView";
import { allocationPending, requisitionState, unconsumedReturnLimit } from "./productionExecutionMath";
import { normalizeStockQuantity as qty } from "./inventoryStockMath";
import { refreshSalesOrderFulfillmentStatus } from "./salesOrderFulfillment";
import { lockSalesOrderForProduction } from "./salesOrderCompletionState";
import { confirmSalesOrderProductionCompletion } from "./salesOrderProductionCompletion";
import { lockProductionPurchaseReceipts } from "./productionPurchaseReceipt";
import { assertProductionPublicMaterialOrder, assertProductionPublicMaterialSalesOrder, loadProductionPublicMaterialSources } from "./productionPublicMaterials";
import { getInventoryActor, toObjectId, toText as text, throwInventoryError } from "./inventory";
import { CODE } from "~~/server/utils/code";

const fail = (status: number, message: string): never => throwInventoryError(status, CODE.INVALID_PARAMS, message);
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
const amount = (value: unknown, maximum: number, integer = false) => {
    const number = Number(value);
    if (!["number", "string"].includes(typeof value) || value === "" || !Number.isFinite(number) || number < 0
        || number > maximum || Math.abs(number - qty(number)) > 0.00000001 || (integer && !Number.isSafeInteger(number))) fail(400, "数量必须在可操作范围内；物料最多三位小数，完工和入库必须为整数。");
    return qty(number);
};
const person = (value: unknown) => {
    const name = text(value);
    if (!name || name.length > 40) fail(400, "请填写经办人，最多40个字符。");
    return name;
};
const validDate = (value: unknown) => {
    const date = text(value);
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) fail(400, "日期不合法。");
    return date;
};
const nextNumber = async (prefix: string, session: mongoose.ClientSession) => {
    const day = today().replace(/-/g, "");
    const sequence = await useInventoryCounterModel().nextNumber(`production-execution:${prefix}:${day}`, session);
    return `${prefix}-${day}-${String(sequence).padStart(3, "0")}`;
};
const validateVersion = (value: unknown, actual: number) => {
    if (!Number.isInteger(Number(value)) || Number(value) !== actual) fail(409, "单据版本已变化，请刷新后重试。");
};
const stockLine = (order: any, productId: any, allocation: any, quantity: number, requisitionId = "", completionId = ""): ProductionInventoryLine => ({
    productId: id(productId), quantity, warehouseId: id(allocation.warehouseId), locationId: id(allocation.locationId),
    lockedQuantity: quantity, productionOrderId: id(order._id), requisitionId, completionId, rootProductId: id(order.rootProductId),
});

// 保留三位小数后按原值比较更新，避免0.3-0.1导致后续0.2被浮点比较拒绝。
const changePoolBalance = async (reservationId: any, deltas: { allocated?: number; consumed?: number }, actor: string, session: mongoose.ClientSession) => {
    const row = await SalesOrderStockReservation.findById(reservationId).session(session).lean() as any;
    if (!row) fail(409, "原订单物料来源不存在。");
    const allocated = qty(Number(row.productionAllocatedQuantity || 0) + (deltas.allocated || 0));
    const consumed = qty(Number(row.consumedQuantity || 0) + (deltas.consumed || 0));
    const reserved = qty(row.reservedQuantity);
    const released = qty(row.releasedQuantity);
    if (allocated < 0 || consumed < 0 || qty(allocated + consumed + released) > reserved) fail(409, "订单物料分配或已领余额已变化。");
    const filter: Record<string, any> = { _id: row._id, reservedQuantity: row.reservedQuantity, status: row.status };
    for (const field of ["productionAllocatedQuantity", "consumedQuantity", "releasedQuantity"]) {
        filter[field] = row[field] === undefined ? { $exists: false } : row[field];
    }
    const status = qty(reserved - consumed - released) > 0 ? "active" : consumed > 0 ? "consumed" : "released";
    const changed = await SalesOrderStockReservation.updateOne(filter, { $set: {
        productionAllocatedQuantity: allocated, consumedQuantity: consumed, status, updatedBy: actor,
    } }, { session });
    if (changed.matchedCount !== 1) fail(409, "订单物料已被其他操作更新，请刷新。");
};

const changePublicLock = async (stockId: any, delta: number, actor: string, session: mongoose.ClientSession, stockSnapshot?: any) => {
    const stock = stockSnapshot || await InventoryStock.findOne({ _id: stockId, _isDeleted: { $ne: true } }).session(session).lean() as any;
    if (!stock) fail(409, "库存仓位不存在。");
    const lockedQuantity = qty(Number(stock.lockedQuantity || 0) + delta);
    if (lockedQuantity < 0 || lockedQuantity > qty(stock.quantity)) fail(409, "公共库存可用量或锁定余额已变化。");
    const changed = await InventoryStock.updateOne({ _id: stock._id, quantity: stock.quantity,
        lockedQuantity: stock.lockedQuantity === undefined ? { $exists: false } : stock.lockedQuantity,
    }, { $set: { lockedQuantity, updatedBy: actor } }, { session });
    if (changed.matchedCount !== 1) fail(409, "公共库存已被其他操作更新，请刷新。");
};

const loadOrder = async (orderId: unknown, session: mongoose.ClientSession, version?: unknown, allowCleanup = false) => {
    if (!mongoose.isValidObjectId(orderId)) fail(400, "生产单 ID 不合法。");
    const order = await ProductionOrder.findById(orderId).session(session) as any;
    if (!order) fail(404, "生产单不存在。");
    if (version !== undefined) validateVersion(version, order.version);
    const [detail] = await buildExecutionOrders([order.toObject()], session);
    if (!detail.executable && !(allowCleanup && detail.cleanupAllowed)) fail(409, detail.blockReason || "生产单已完成，不能继续执行。");
    return { order, detail };
};
const saveOrder = async (order: any, session: mongoose.ClientSession) => {
    const previousVersion = order.version;
    const updated = await ProductionOrder.updateOne({ _id: order._id, version: previousVersion }, {
        $set: { status: order.status, completedQty: order.completedQty, receivedQty: order.receivedQty },
        $inc: { version: 1 },
    }, { session });
    if (updated.modifiedCount !== 1) fail(409, "生产单已被其他操作更新，请刷新。");
};
const lockSalesOrder = async (order: any, actor: string, session: mongoose.ClientSession) => {
    if (!order.salesOrderId) return;
    await lockSalesOrderForProduction(id(order.salesOrderId), actor, session, { requireCompletion: true });
};
const refreshSales = async (orders: any[], actor: string, session: mongoose.ClientSession) => {
    const seen = new Set<string>();
    for (const order of orders) {
        const salesId = id(order.salesOrderId);
        if (salesId && !seen.has(salesId)) {
            seen.add(salesId);
            await refreshSalesOrderFulfillmentStatus(salesId, actor, { session });
        }
    }
};
const resultFor = (document: any, orders: any[]) => ({
    id: id(document._id || document.id), documentNo: document.documentNo,
    affectedOrderIds: [...new Set(orders.map((order) => id(order._id)))],
    affectedSalesOrderIds: [...new Set(orders.map((order) => id(order.salesOrderId)).filter(Boolean))],
});
const addRecord = (request: any, action: string, line: any, allocation: any, quantity: number, documentNo: string, remark: string) => {
    request.records.push({ date: new Date(), action, materialCode: line.materialCode, quantity, unit: line.unit, documentNo, remark, warehouseId: allocation.warehouseId, locationId: allocation.locationId });
};
const saveRequest = async (request: any, actor: string, session: mongoose.ClientSession) => {
    request.status = requisitionState(request.lines);
    request.hasPendingReturn = request.lines.some((line: any) => line.allocations.some((allocation: any) => allocation.pendingReturn > 0));
    request.version += 1;
    request.updatedBy = actor;
    await request.save({ session });
};

const createRequest = async (body: any, actor: string, session: mongoose.ClientSession) => {
    const { order, detail } = await loadOrder(body.orderId, session, body.version);
    validateVersion(body.version, order.version);
    await lockSalesOrder(order, actor, session);
    const applicant = person(body.applicant);
    const seen = new Set<string>();
    const lines: any[] = [];
    if (!Array.isArray(body.lines)) fail(400, "请填写发料物料。");
    for (const input of body.lines) {
        const productId = text(input.productId);
        const material = detail.materials.find((row) => row.productId === productId);
        if (!material || seen.has(productId)) fail(400, "发料物料不存在或重复。");
        seen.add(productId);
        let remaining = amount(input.quantity, material.requestLimit);
        if (!remaining) continue;
        const quantity = remaining;
        const allocations: any[] = [];
        const sources = await findExecutionMaterialSources(order, productId, session);
        for (const source of sources) {
            if (remaining <= 0) break;
            const take = qty(Math.min(remaining, source.available));
            if (source.reservationId) {
                await changePoolBalance(source.reservationId, { allocated: take }, actor, session);
            } else {
                await changePublicLock(source.stockId, take, actor, session);
            }
            allocations.push({ stockId: source.stockId, reservationId: source.reservationId, warehouseId: source.warehouseId, locationId: source.locationId, quantity: take });
            remaining = qty(remaining - take);
        }
        if (remaining > 0) fail(409, "可分配物料数量已变化，请刷新。");
        lines.push({ productId: toObjectId(productId), materialCode: material.code, name: material.name, unit: material.unit, per: material.per, quantity, allocations });
    }
    if (!lines.length) fail(400, "至少填写一项正数申请数量。");
    const documentNo = await nextNumber("MR", session);
    const created = await ProductionRequisition.create([{
        documentNo, productionOrderId: order._id, salesOrderId: order.salesOrderId, salesOrderNo: order.salesOrderNo,
        productionOrderNo: order.documentNo, productName: order.productName, productCode: order.productCode,
        applicant, remark: text(body.remark).slice(0, 300), lines, createdBy: actor, updatedBy: actor,
        records: lines.map((line) => ({ date: new Date(), action: "申请发料", materialCode: line.materialCode, quantity: line.quantity, unit: line.unit, documentNo, remark: text(body.remark).slice(0, 300) })),
    }], { session });
    await saveOrder(order, session);
    await refreshSales([order], actor, session);
    return resultFor(created[0], [order]);
};

const allocatePublicMaterials = async (body: any, actor: string, session: mongoose.ClientSession) => {
    if (typeof body.reason !== "string" || !PUBLIC_MATERIAL_ALLOCATION_REASONS.some((reason) => reason === body.reason)) {
        fail(400, "请选择有效的分配原因。");
    }
    if (typeof body.person !== "string") fail(400, "请填写经办人，最多40个字符。");
    const operator = person(body.person);
    if (typeof body.remark !== "string") fail(400, "请填写分配说明，1至300个字符。");
    const remark = body.remark.trim();
    if (!remark || remark.length > 300) fail(400, "请填写分配说明，1至300个字符。");
    const reason = body.reason;
    const { order, detail } = await loadOrder(body.orderId, session, body.version);
    validateVersion(body.version, order.version);
    assertProductionPublicMaterialOrder(order, detail);
    const salesOrder = await lockSalesOrderForProduction(id(order.salesOrderId), actor, session, { requireCompletion: true });
    assertProductionPublicMaterialSalesOrder(order, salesOrder);
    if (!Array.isArray(body.lines)) fail(400, "请填写额外分配物料。");
    const seen = new Set<string>();
    const lines: Array<{ material: typeof detail.materials[number]; quantity: number }> = [];
    for (const input of body.lines) {
        const productId = text(input?.productId);
        const material = detail.materials.find((row) => row.productId === productId);
        if (!material || seen.has(productId)) fail(400, "分配物料不存在于本单 BOM 快照或存在重复。");
        seen.add(productId);
        const quantity = amount(input?.quantity, Number.MAX_SAFE_INTEGER);
        if (quantity > 0) lines.push({ material, quantity });
    }
    if (!lines.length) fail(400, "至少填写一项正数分配数量。");
    const sources = await loadProductionPublicMaterialSources(lines.map(({ material }) => material.productId), session);
    const allocations: any[] = [];
    for (const { material, quantity } of lines) {
        let remaining = quantity;
        const materialSources = sources.get(material.productId) || [];
        const available = qty(materialSources.reduce((sum, source) => sum + source.available, 0));
        if (quantity > available) fail(409, `${material.name || material.code}的公共未分配数量已变化，请刷新后重试。`);
        for (const source of materialSources) {
            if (remaining <= 0) break;
            const take = qty(Math.min(remaining, source.available));
            await changePublicLock(source._id, take, actor, session, source);
            const [reservation] = await SalesOrderStockReservation.create([{
                salesOrderId: order.salesOrderId, salesOrderNo: salesOrder.orderNo, demandProductId: order.rootProductId,
                stockProductId: toObjectId(material.productId), warehouseId: source.warehouseId, locationId: source.locationId,
                reservationType: "production-material", requiredQuantity: material.requiredQty,
                reservedQuantity: take, consumedQuantity: 0, releasedQuantity: 0, productionAllocatedQuantity: 0,
                sourceProductionOrderId: null, sourceAllocationId: null, sourceInboundId: null,
                status: "active", createdBy: actor, updatedBy: actor,
            }], { session });
            allocations.push({ productId: material.productId, materialCode: material.code, quantity: take,
                stockId: id(source._id), warehouseId: id(source.warehouseId), locationId: id(source.locationId), reservationId: id(reservation._id) });
            remaining = qty(remaining - take);
        }
        if (remaining > 0) fail(409, "公共未分配数量已变化，请刷新后重试。");
    }
    await saveOrder(order, session);
    await refreshSales([order], actor, session);
    return { ...resultFor(order, [order]), reason, person: operator, remark, allocations };
};

const changeRequest = async (action: string, body: any, actor: string, key: string, session: mongoose.ClientSession) => {
    if (!mongoose.isValidObjectId(body.id)) fail(400, "发料单 ID 不合法。");
    const request = await ProductionRequisition.findById(body.id).session(session) as any;
    if (!request) fail(404, "发料单不存在。");
    validateVersion(body.version, request.version);
    const cleanup = ["cancel-requisition", "request-return", "receive-return"].includes(action);
    const { order, detail } = await loadOrder(request.productionOrderId, session, undefined, cleanup);
    await lockSalesOrder(order, actor, session);
    const remark = text(body.remark).slice(0, 300);
    const findAllocation = (allocationId: unknown) => {
        for (const line of request.lines) {
            const allocation = line.allocations.find((item: any) => id(item._id) === text(allocationId));
            if (allocation) return { line, allocation };
        }
        return fail(400, "所选仓位分配不属于此发料单。");
    };
    let documentNo = request.documentNo;
    if (action === "issue-requisition") {
        if (detail.purchaseSourceValid !== true) fail(409, detail.purchaseSourceBlockReason || "关联采购来源异常，请先核对后再发料出库。");
        if (!Array.isArray(body.lines)) fail(400, "请填写逐仓位出库数量。");
        const selected: Array<{ line: any; allocation: any; quantity: number }> = [];
        const seen = new Set<string>();
        for (const input of body.lines) {
            const { line, allocation } = findAllocation(input.allocationId);
            if (seen.has(id(allocation._id))) fail(400, "出库分配重复。");
            seen.add(id(allocation._id));
            const quantity = amount(input.quantity, allocationPending(allocation));
            if (quantity > 0) selected.push({ line, allocation, quantity });
        }
        if (!selected.length) fail(400, "至少填写一项正数出库数量。");
        await lockProductionPurchaseReceipts(detail.relatedPurchaseOrders, actor, session);
        const posted = await postProductionInventoryDocument("issue", {
            sourceKey: `${executionSourceKey(order)}|operation:${key}`, relatedNo: request.documentNo, salesOrderId: id(order.salesOrderId),
            date: today(), person: actor, remark,
            lines: selected.map(({ line, allocation, quantity }) => stockLine(order, line.productId, allocation, quantity, id(request._id))),
        }, actor, session);
        documentNo = posted.documentNo;
        for (const { line, allocation, quantity } of selected) {
            if (allocation.reservationId) {
                await changePoolBalance(allocation.reservationId, { allocated: -quantity, consumed: quantity }, actor, session);
            }
            allocation.issued = qty(allocation.issued + quantity);
            addRecord(request, "仓库出库", line, allocation, quantity, documentNo, remark);
        }
    } else {
        const { line, allocation } = findAllocation(body.allocationId);
        const material = detail.materials.find((row) => row.productId === id(line.productId));
        if (!material) fail(409, "BOM 物料快照不完整。");
        const maximum = action === "cancel-requisition" ? allocationPending(allocation)
            : action === "request-return" ? unconsumedReturnLimit(allocation, material, order.completedQty || 0) : allocation.pendingReturn;
        const quantity = amount(body.quantity, maximum);
        if (!quantity) fail(400, "请填写正数操作数量。");
        if (action === "cancel-requisition") {
            if (body.confirmed !== true) fail(400, "请确认释放未出库数量。");
            if (allocation.reservationId) {
                await changePoolBalance(allocation.reservationId, { allocated: -quantity }, actor, session);
            } else {
                await changePublicLock(allocation.stockId, -quantity, actor, session);
            }
            allocation.cancelled = qty(allocation.cancelled + quantity);
            addRecord(request, "释放未出库分配", line, allocation, quantity, documentNo, remark);
        } else if (action === "request-return") {
            allocation.pendingReturn = qty(allocation.pendingReturn + quantity);
            documentNo = await nextNumber("RT", session);
            addRecord(request, "申请退料", line, allocation, quantity, documentNo, remark);
        } else {
            const inboundLine = stockLine(order, line.productId, allocation, quantity, id(request._id));
            inboundLine.lockedQuantity = allocation.reservationId ? quantity : 0;
            const posted = await postProductionInventoryDocument("return", { sourceKey: `${executionSourceKey(order)}|operation:${key}`, relatedNo: request.documentNo,
                salesOrderId: id(order.salesOrderId), date: today(), person: actor, remark, lines: [inboundLine] }, actor, session);
            documentNo = posted.documentNo;
            if (allocation.reservationId) {
                await changePoolBalance(allocation.reservationId, { consumed: -quantity }, actor, session);
            }
            allocation.pendingReturn = qty(allocation.pendingReturn - quantity);
            allocation.returned = qty(allocation.returned + quantity);
            addRecord(request, "退料入库", line, allocation, quantity, documentNo, remark);
        }
    }
    await saveRequest(request, actor, session);
    if (action === "issue-requisition" && ["待发料", "待生产"].includes(order.status)) order.status = "生产中";
    await saveOrder(order, session);
    await refreshSales([order], actor, session);
    return resultFor({ _id: request._id, documentNo }, [order]);
};

const registerCompletion = async (body: any, actor: string, session: mongoose.ClientSession) => {
    const { order, detail } = await loadOrder(body.orderId, session, body.version);
    validateVersion(body.version, order.version);
    const quantity = amount(body.quantity, detail.completionLimit, true);
    if (!quantity) fail(400, "请填写正数完工数量。");
    const date = validDate(body.date);
    const operator = person(body.person);
    await lockSalesOrder(order, actor, session);
    const records = await ProductionCompletion.create([{
        documentNo: await nextNumber("WG", session), productionOrderId: order._id, salesOrderId: order.salesOrderId,
        salesOrderNo: order.salesOrderNo, productionOrderNo: order.documentNo, productName: order.productName, productCode: order.productCode,
        quantity, date: new Date(`${date}T00:00:00.000Z`), person: operator, remark: text(body.remark).slice(0, 300), createdBy: actor,
    }], { session });
    order.completedQty = (order.completedQty || 0) + quantity;
    order.status = "生产中";
    await saveOrder(order, session);
    await refreshSales([order], actor, session);
    return resultFor(records[0], [order]);
};

const registerMaterialLoss = async (body: any, actor: string, session: mongoose.ClientSession) => {
    const { order, detail } = await loadOrder(body.orderId, session, body.version, true);
    validateVersion(body.version, order.version);
    const material = detail.materials.find((row) => row.productId === text(body.productId));
    if (!material) fail(400, "损耗物料不属于此生产单。");
    const quantity = amount(body.quantity, material.lossLimit);
    if (!quantity) fail(400, "请填写正数损耗数量。");
    await lockSalesOrder(order, actor, session);
    const records = await ProductionMaterialLoss.create([{
        productionOrderId: order._id, productId: toObjectId(material.productId),
        materialCode: material.code, materialName: material.name, unit: material.unit,
        quantity, remark: text(body.remark).slice(0, 300), createdBy: actor,
    }], { session });
    // 物料已在领料出库时扣减仓库库存，登记损耗只消耗在制物料并增加补料需求。
    await saveOrder(order, session);
    await refreshSales([order], actor, session);
    return resultFor({ _id: records[0]._id, documentNo: order.documentNo }, [order]);
};

const receiveCompletion = async (body: any, actor: string, key: string, session: mongoose.ClientSession) => {
    if (body.qualified !== true) fail(400, "请先确认本次入库产品检验合格。");
    const date = validDate(body.date);
    const operator = person(body.person);
    if (!Array.isArray(body.lines)) fail(400, "请至少选择一项完工批次。");
    const orders = new Map<string, any>();
    const seen = new Set<string>();
    const selected: Array<{ completion: any; order: any; quantity: number; warehouseId: string; locationId: string }> = [];
    for (const input of body.lines) {
        if (!mongoose.isValidObjectId(input.completionId) || seen.has(text(input.completionId))) fail(400, "完工记录不存在或重复。");
        seen.add(text(input.completionId));
        const completion = await ProductionCompletion.findById(input.completionId).session(session) as any;
        if (!completion) fail(404, "完工记录不存在。");
        validateVersion(input.version, completion.version);
        const quantity = amount(input.quantity, completion.quantity - completion.receivedQty, true);
        if (!quantity) continue;
        let order = orders.get(id(completion.productionOrderId));
        if (!order) {
            const loaded = await loadOrder(completion.productionOrderId, session);
            order = loaded.order;
            orders.set(id(order._id), order);
            await lockSalesOrder(order, actor, session);
        }
        if (executionSourceKey(order) !== text(body.sourceKey)) fail(400, "多项入库只能选择同一来源订单或同一备货生产单。");
        const warehouseId = text(input.warehouseId);
        const locationId = text(input.locationId);
        if (!mongoose.isValidObjectId(warehouseId) || !mongoose.isValidObjectId(locationId)) fail(400, "请选择真实仓库和叶级库位。");
        const warehouse = await InventoryWarehouse.findOne({ _id: warehouseId, includeInAvailable: true, _isDeleted: { $ne: true } }).session(session).lean();
        const location = await InventoryLocation.findOne({ _id: locationId, warehouseId, _isDeleted: { $ne: true } }).session(session).lean();
        if (!warehouse || !location) fail(400, "仓库或库位已停用或不匹配。");
        if (await InventoryLocation.exists({ parentId: locationId, _isDeleted: { $ne: true } }).session(session)) fail(400, "请选择末级仓位。");
        selected.push({ completion, order, quantity, warehouseId, locationId });
    }
    if (!selected.length) fail(400, "至少填写一项正数合格入库数量。");
    // 同一批多项成品入库共同核对订单剩余缺口，不允许重复覆盖。
    const finishedCoverage = new Map<string, number>();
    for (const { order, quantity } of selected) {
        if (!order.salesOrderId || id(order.rootProductId) !== id(order.productId)) continue;
        const group = `${id(order.salesOrderId)}:${id(order.productId)}`;
        if (!finishedCoverage.has(group)) {
            const salesOrder = await useSalesOrderModel().order.findById(order.salesOrderId).session(session).lean() as any;
            const demand = (salesOrder?.products || []).filter((product: any) => text(product.productId) === id(order.productId)).reduce((sum: number, product: any) => sum + Number(product.quantity || 0), 0);
            const reservations = await SalesOrderStockReservation.find({ salesOrderId: order.salesOrderId, stockProductId: order.productId, reservationType: "finished-product" }).session(session).lean() as any[];
            const covered = reservations.reduce((sum, reservation) => sum + reservation.reservedQuantity - reservation.releasedQuantity, 0);
            finishedCoverage.set(group, qty(Math.max(0, demand - covered)));
        }
        if (quantity > finishedCoverage.get(group)!) fail(409, "入库数量超过来源订单的剩余成品缺口。");
        finishedCoverage.set(group, qty(finishedCoverage.get(group)! - quantity));
    }
    const firstOrder = selected[0].order;
    const posted = await postProductionInventoryDocument("receipt", {
        sourceKey: `${body.sourceKey}|operation:${key}`, relatedNo: text(firstOrder.salesOrderNo || firstOrder.documentNo), salesOrderId: id(firstOrder.salesOrderId), date, person: operator, remark: text(body.remark).slice(0, 300),
        lines: selected.map(({ completion, order, quantity, warehouseId, locationId }) => ({
            productId: id(order.productId), quantity, warehouseId, locationId, lockedQuantity: order.salesOrderId ? quantity : 0,
            productionOrderId: id(order._id), completionId: id(completion._id), rootProductId: id(order.rootProductId),
        })),
    }, actor, session);
    for (const { completion, order, quantity, warehouseId, locationId } of selected) {
        if (order.salesOrderId) {
            const component = id(order.rootProductId) !== id(order.productId);
            await SalesOrderStockReservation.create([{
                salesOrderId: order.salesOrderId, salesOrderNo: order.salesOrderNo, demandProductId: order.rootProductId,
                stockProductId: order.productId, warehouseId, locationId,
                reservationType: component ? "production-material" : "finished-product", requiredQuantity: order.planQty,
                reservedQuantity: quantity, consumedQuantity: 0, releasedQuantity: 0, productionAllocatedQuantity: 0,
                sourceInboundId: toObjectId(posted.id), sourceProductionOrderId: order._id, createdBy: actor, updatedBy: actor,
            }], { session });
        }
        completion.receivedQty += quantity;
        completion.version += 1;
        await completion.save({ session });
        order.receivedQty = (order.receivedQty || 0) + quantity;
        if (order.receivedQty >= order.planQty) order.status = "已完成";
    }
    for (const order of orders.values()) await saveOrder(order, session);
    await refreshSales([...orders.values()], actor, session);
    return resultFor(posted, [...orders.values()]);
};

export const executeProductionAction = async (event: any, body: any) => {
    const auth = event.context.auth;
    if (!auth?.username) fail(401, "请先登录。");
    const role = Number(auth.role);
    if (!canAccessProductionExecution(role)) fail(403, "没有生产操作权限。");
    const action = text(body.action);
    const actions = ["create-requisition", "issue-requisition", "cancel-requisition", "request-return", "receive-return", "register-completion", "receive-completion", "register-material-loss", "confirm-order-completion", "allocate-public-materials"];
    if (!actions.includes(action)) fail(400, "不支持的生产执行操作。");
    if (!canExecuteProductionAction(role, action)) fail(403, "没有此生产执行操作权限。");
    const actor = getInventoryActor(event);
    const key = text(getHeader(event, "Idempotency-Key"));
    if (!key || key.length > 128) fail(400, "请提供有效的 Idempotency-Key。");
    const requestHash = createHash("sha256").update(JSON.stringify({ actor: auth.username, body })).digest("hex");
    const existing = await ProductionExecutionOperation.findOne({ idempotencyKey: key }).lean() as any;
    if (existing) {
        if (existing.requestHash !== requestHash) fail(409, "幂等键已用于其他请求。");
        return existing.result;
    }
    const session = await mongoose.startSession();
    try {
        let result: any;
        await session.withTransaction(async () => {
            const repeated = await ProductionExecutionOperation.findOne({ idempotencyKey: key }).session(session).lean() as any;
            if (repeated) {
                if (repeated.requestHash !== requestHash) fail(409, "幂等键已用于其他请求。");
                result = repeated.result;
                return;
            }
            if (action === "confirm-order-completion") result = await confirmSalesOrderProductionCompletion({ ...body, operationId: key }, actor, session);
            else if (action === "allocate-public-materials") result = await allocatePublicMaterials(body, actor, session);
            else if (action === "create-requisition") result = await createRequest(body, actor, session);
            else if (action === "register-completion") result = await registerCompletion(body, actor, session);
            else if (action === "register-material-loss") result = await registerMaterialLoss(body, actor, session);
            else if (action === "receive-completion") result = await receiveCompletion(body, actor, key, session);
            else result = await changeRequest(action, body, actor, key, session);
            await ProductionExecutionOperation.create([{ idempotencyKey: key, requestHash, action, actor, result }], { session });
        });
        return result;
    } catch (error: any) {
        if (error?.code === 11000) {
            const repeated = await ProductionExecutionOperation.findOne({ idempotencyKey: key }).lean() as any;
            if (repeated?.requestHash === requestHash) return repeated.result;
            if (repeated) fail(409, "幂等键已用于其他请求。");
        }
        throw error;
    } finally { await session.endSession(); }
};
