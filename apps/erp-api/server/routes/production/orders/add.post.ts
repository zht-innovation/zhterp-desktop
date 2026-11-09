import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { canAccessConfigurationPath } from "~~/shared/utils/adminPermission";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryBom } from "~~/server/models/inventoryBom.model";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";
import { getProductionPlanning, hasUnfulfilledProductionDemand } from "~~/server/services/productionPlanning";
import { logger } from "~~/server/utils/logger";
import { executeProductionAction } from "~~/server/services/productionExecution";
import { productionExecutionFailure } from "~~/server/services/productionExecutionHttp";
import { ensureProductionOrderIndexes } from "~~/server/services/productionOrderMigration";
import { syncSalesOrderMachineNo } from "~~/server/services/salesOrderMachineNo";
import { lockSalesOrderForProduction } from "~~/server/services/salesOrderCompletionState";
import { InventoryHttpError } from "~~/server/services/inventory";
import { saveProductionWorkshop } from "~~/server/services/productionWorkshop";
import { ProductionInputError, failProductionInput as fail, dateOnly, parseMachineNumbers, parseProductionWarningDays } from "~~/server/services/productionOrderInput";
import { updateProductionOrder } from "~~/server/services/productionOrderUpdate";
import { deleteProductionOrder } from "~~/server/services/productionOrderDelete";
import { handleProductionWarning } from "~~/server/services/productionOrderWarning";

const text = (value: unknown) => String(value ?? "").trim();
const objectId = (value: unknown) => mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null;

export default defineEventHandler(async (event) => {
    const role = Number(event.context.auth?.role);
    const body = (await readBody(event) || {}) as Record<string, any>;
    if (body.resource === "update") return updateProductionOrder(event, body);
    if (body.resource === "delete") return deleteProductionOrder(event, body);
    if (body.resource === "handle-warning") return handleProductionWarning(event, body);
    if (body.resource === "workshops") {
        const actor = text(event.context.auth?.username);
        if (!actor) {
            setResponseStatus(event, 401);
            return { code: 401, msg: "请先登录。" };
        }
        if (!canAccessConfigurationPath(role, "/configuration/production/production-orders")) {
            setResponseStatus(event, 403);
            return { code: 403, msg: "没有车间操作权限。" };
        }
        try {
            return { code: CODE.SUCCESS, msg: "保存成功", data: await saveProductionWorkshop(body.name, actor) };
        } catch (error) {
            if (error instanceof InventoryHttpError) {
                setResponseStatus(event, error.status);
                return { code: error.code, msg: error.message };
            }
            logger.error("Save production workshop error", error as Error);
            setResponseStatus(event, 500);
            return { code: CODE.SERVER_ERROR, msg: "保存车间失败，请稍后重试。" };
        }
    }
    if (body.resource) {
        if (body.resource !== "execution") {
            setResponseStatus(event, 400);
            return { code: CODE.INVALID_PARAMS, msg: "生产资源类型不合法" };
        }
        try {
            return { code: CODE.SUCCESS, msg: "操作成功", data: await executeProductionAction(event, body) };
        } catch (error) { return productionExecutionFailure(event, error); }
    }
    if (!canAccessConfigurationPath(role, "/configuration/production/production-orders")) {
        setResponseStatus(event, 403);
        return { code: "FORBIDDEN", msg: "没有生产单操作权限" };
    }
    const idempotencyKey = text(getHeader(event, "Idempotency-Key"));
    if (!idempotencyKey || idempotencyKey.length > 128) {
        setResponseStatus(event, 400);
        return { code: "IDEMPOTENCY_KEY_REQUIRED", msg: "请提供有效的 Idempotency-Key" };
    }
    try {
        await ensureProductionOrderIndexes();
    } catch (error) {
        logger.error("生产单索引迁移尚未就绪", error as Error);
        setResponseStatus(event, 503);
        return { code: "PRODUCTION_INDEX_MIGRATION_REQUIRED", msg: "生产单索引迁移未完成，请管理员核对迁移日志后重试" };
    }
    const requestHash = createHash("sha256").update(JSON.stringify(body || {})).digest("hex");
    const existing = await ProductionOrder.findOne({ idempotencyKey }).lean() as any;
    if (existing) {
        if (existing.requestHash !== requestHash) {
            setResponseStatus(event, 409);
            return { code: "DUPLICATE_IDEMPOTENCY_KEY", msg: "此幂等键已用于其他请求" };
        }
        return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: { id: existing._id.toString(), documentNo: existing.documentNo, status: existing.status, version: existing.version } };
    }
    const session = await mongoose.startSession();
    try {
        let created: any;
        await session.withTransaction(async () => {
            const sourceType = text(body.sourceType || "order");
            if (!["order", "stock"].includes(sourceType)) fail(400, "INVALID_SOURCE_TYPE", "生产用途不合法");
            const salesOrderId = sourceType === "order" ? objectId(body.salesOrderId) : null;
            const productId = objectId(body.productId);
            const planQty = Number(body.planQty);
            const planStart = dateOnly(body.planStart);
            const planFinish = dateOnly(body.planFinish);
            const warningDays = parseProductionWarningDays(body.warningDays);
            const workshop = text(body.workshop);
            const owner = text(body.owner);
            const intent = text(body.intent || "release");
            if ((sourceType === "order" && !salesOrderId) || !productId || !Number.isInteger(planQty) || planQty <= 0
                || !planStart || !planFinish || planFinish < planStart || !workshop || !["draft", "release"].includes(intent)) {
                fail(400, "INVALID_PARAMS", "生产单必填字段不完整或数量、日期不合法");
            }
            const product = await InventoryProduct.findOne({ _id: productId, _isDeleted: { $ne: true } })
                .select("code name model unitName").session(session).lean() as any;
            if (!product) fail(400, "PRODUCT_NOT_FOUND", "生产产品不存在");
            const bom = await InventoryBom.findOne({ productId, isEnabled: true, _isDeleted: { $ne: true } })
                .select("_id version items").session(session).lean() as any;
            if (!bom || (sourceType === "order" && !text(bom.version))
                || (body.bomVersion && text(body.bomVersion) !== text(bom.version))) {
                fail(409, "BOM_VERSION_INVALID", "BOM 版本不存在或已变化，请刷新页面");
            }
            const materialIds = (bom.items || []).map((item: any) => item.productId).filter(Boolean);
            const materialProducts = await InventoryProduct.find({ _id: { $in: materialIds } })
                .select("code name model unitName source image").session(session).lean() as any[];
            const materialMap = new Map(materialProducts.map((item) => [item._id.toString(), item]));
            const bomMaterials = (bom.items || []).map((item: any) => {
                const material = materialMap.get(item.productId?.toString() || "");
                return {
                    productId: item.productId,
                    code: text(material?.code || item.productCode),
                    name: text(material?.model || material?.name || item.model || item.productName),
                    unit: text(material?.unitName || item.unitName) || "个",
                    unitQty: Number(item.quantity || 0),
                    source: text(material?.source), image: text(material?.image), sort: Number(item.sort || 0),
                };
            });
            let salesOrder: any = null;
            let rootProductId = productId;
            if (salesOrderId) {
                salesOrder = await lockSalesOrderForProduction(salesOrderId.toString(), text(event.context.auth?.username), session, {
                    requireCompletion: intent === "release",
                });
                const lines = Array.isArray(salesOrder.products) ? salesOrder.products : [];
                const requestedRootId = objectId(body.rootProductId);
                if (body.rootProductId && !requestedRootId) fail(400, "INVALID_ROOT_PRODUCT", "来源成品不合法");
                const directLine = lines.find((line: any) => text(line.productId) === productId!.toString()
                    && (!requestedRootId || text(line.productId) === requestedRootId.toString()));
                if (!directLine) {
                    const rootIds = lines.map((line: any) => objectId(line.productId)).filter(Boolean)
                        .filter((rootId: any) => !requestedRootId || rootId.toString() === requestedRootId.toString());
                    const parentBom = await InventoryBom.findOne({
                        productId: { $in: rootIds }, isEnabled: true, _isDeleted: { $ne: true }, "items.productId": productId,
                    }).select("productId items").session(session).lean() as any;
                    if (!parentBom) fail(400, "PRODUCT_NOT_IN_ORDER_BOM", "所选部件不属于订单产品的下一层 BOM");
                    rootProductId = parentBom.productId;
                    const rootProduct = await InventoryProduct.exists({ _id: rootProductId, _isDeleted: { $ne: true } }).session(session);
                    if (!rootProduct) fail(400, "PRODUCT_NOT_FOUND", "来源成品不存在或已删除");
                }
                if (!(await hasUnfulfilledProductionDemand(salesOrder, session))) {
                    fail(409, "QUANTITY_EXCEEDS_REMAINING", "订单没有待生产的成品需求，或成品已全部备齐");
                }
                const planning = await getProductionPlanning(salesOrder, rootProductId!.toString(), productId!.toString(), session);
                if (planning.legacyReviewRequired) {
                    fail(409, "PRODUCTION_HISTORY_REVIEW_REQUIRED", "本规划组存在未关联的历史生产入库，请先核对来源");
                }
                if (planQty > planning.remaining) {
                    fail(409, "QUANTITY_EXCEEDS_REMAINING", "生产数量超过待下达需求，请刷新页面");
                }
            }
            const machineNumbers = parseMachineNumbers(body.machineNumbers);
            if (machineNumbers.length > planQty || new Set(machineNumbers.map((number) => number.toUpperCase())).size !== machineNumbers.length) {
                fail(400, "INVALID_MACHINE_NUMBERS", "机器号重复或超过生产数量");
            }
            if (machineNumbers.length) {
                const others = await ProductionOrder.find({ status: { $ne: "已取消" }, machineNumbers: { $in: machineNumbers } })
                    .select("_id").session(session).lean();
                if (others.length) fail(409, "DUPLICATE_MACHINE_NUMBER", "机器号已被其他生产单使用");
            }
            const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "2-digit", month: "2-digit", day: "2-digit" })
                .formatToParts(new Date());
            const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
            const day = `${part("year")}${part("month")}${part("day")}`;
            const sequence = await useInventoryCounterModel().nextNumber(`production-order:${day}`, session);
            const documentNo = `MO-${day}-${String(sequence).padStart(3, "0")}`;
            const rows = await ProductionOrder.create([{
                documentNo, idempotencyKey, requestHash, sourceType, salesOrderId, salesOrderNo: text(salesOrder?.orderNo),
                rootProductId, productId, productCode: text(product.code), productName: text(product.model || product.name),
                unitName: text(product.unitName), bomId: bom._id, bomVersion: text(bom.version), bomMaterials, planQty,
                status: intent === "draft" ? "草稿" : "待发料", workshop, owner,
                priority: text(body.priority) === "紧急" ? "紧急" : "普通", planStart, planFinish, warningDays,
                remark: text(body.remark).slice(0, 300), machineNumbers: machineNumbers.length ? machineNumbers : undefined, createdBy: text(event.context.auth?.username),
            }], { session });
            created = rows[0];
            if (intent === "release" && salesOrderId && productId!.toString() === rootProductId!.toString()) {
                await syncSalesOrderMachineNo(salesOrderId, session);
            }
        });
        setResponseStatus(event, 201);
        return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: { id: created.id, documentNo: created.documentNo, status: created.status, version: created.version } };
    } catch (error: any) {
        if (error?.code === 11000) {
            const repeated = await ProductionOrder.findOne({ idempotencyKey }).lean() as any;
            if (repeated) {
                if (repeated.requestHash !== requestHash) {
                    setResponseStatus(event, 409);
                    return { code: "DUPLICATE_IDEMPOTENCY_KEY", msg: "此幂等键已用于其他请求" };
                }
                return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: { id: repeated._id.toString(), documentNo: repeated.documentNo, status: repeated.status, version: repeated.version } };
            }
            if (error?.keyPattern?.machineNumbers) {
                setResponseStatus(event, 409);
                return { code: "DUPLICATE_MACHINE_NUMBER", msg: "机器号已被其他生产单使用" };
            }
        }
        if (error instanceof ProductionInputError) {
            setResponseStatus(event, error.status);
            return { code: error.businessCode, msg: error.message };
        }
        if (error instanceof InventoryHttpError) return productionExecutionFailure(event, error);
        logger.error("Create production order error", error);
        setResponseStatus(event, 500);
        return { code: CODE.SERVER_ERROR, msg: codeToMsg[CODE.SERVER_ERROR] };
    } finally {
        await session.endSession();
    }
});
