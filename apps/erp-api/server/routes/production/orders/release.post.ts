import mongoose from "mongoose";
import { ADMIN_ROLE } from "~~/shared/enums";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { getProductionPlanning, hasUnfulfilledProductionDemand } from "~~/server/services/productionPlanning";
import { logger } from "~~/server/utils/logger";
import { ensureProductionOrderIndexes } from "~~/server/services/productionOrderMigration";
import { syncSalesOrderMachineNo } from "~~/server/services/salesOrderMachineNo";
import { lockSalesOrderForProduction } from "~~/server/services/salesOrderCompletionState";

export default defineEventHandler(async (event) => {
    const role = Number(event.context.auth?.role);
    if (role !== ADMIN_ROLE.SUPER && role !== ADMIN_ROLE.PRODUCTION_MANAGER) {
        setResponseStatus(event, 403);
        return { code: "FORBIDDEN", msg: "没有生产单操作权限" };
    }
    const key = String(getHeader(event, "Idempotency-Key") || "").trim();
    const body = (await readBody(event) || {}) as Record<string, any>;
    const productionOrderId = String(body?.id || "");
    const version = Number(body?.version);
    if (!key || key.length > 128 || !mongoose.isValidObjectId(productionOrderId) || !Number.isInteger(version) || version < 1) {
        setResponseStatus(event, 400);
        return { code: "INVALID_PARAMS", msg: "请提供生产单、当前版本和 Idempotency-Key" };
    }
    try {
        await ensureProductionOrderIndexes();
    } catch (error) {
        logger.error("生产单索引迁移尚未就绪", error as Error);
        setResponseStatus(event, 503);
        return { code: "PRODUCTION_INDEX_MIGRATION_REQUIRED", msg: "生产单索引迁移未完成，请管理员核对迁移日志后重试" };
    }
    const alreadyReleased = await ProductionOrder.findOne({ releaseIdempotencyKey: key }).lean() as any;
    if (alreadyReleased) {
        if (alreadyReleased._id.toString() !== productionOrderId) {
            setResponseStatus(event, 409);
            return { code: "DUPLICATE_IDEMPOTENCY_KEY", msg: "此幂等键已用于其他生产单" };
        }
        return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: { id: productionOrderId, documentNo: alreadyReleased.documentNo, status: alreadyReleased.status, version: alreadyReleased.version } };
    }
    const session = await mongoose.startSession();
    try {
        let released: any;
        await session.withTransaction(async () => {
            const row = await ProductionOrder.findById(productionOrderId).session(session).lean() as any;
            if (!row || row.status !== "草稿" || row.version !== version) {
                throw { status: 409, code: "PRODUCTION_STATUS_CHANGED", message: "生产单状态或版本已变化，请刷新页面" };
            }
            const { InventoryBom } = await import("~~/server/models/inventoryBom.model");
            const currentBom = await InventoryBom.findOne({ _id: row.bomId, productId: row.productId, version: row.bomVersion,
                isEnabled: true, _isDeleted: { $ne: true } }).select("_id version").session(session).lean() as any;
            if (!currentBom || (row.sourceType === "order" && !String(currentBom.version || "").trim())) {
                throw { status: 409, code: "BOM_VERSION_INVALID", message: "BOM 版本已变化，请刷新页面" };
            }
            if (row.sourceType === "order") {
                const order = await lockSalesOrderForProduction(String(row.salesOrderId), String(event.context.auth?.username || ""), session, {
                    requireCompletion: true,
                });
                if (!Number.isInteger(row.planQty) || row.planQty < 1) {
                    throw { status: 400, code: "INVALID_PARAMS", message: "生产数量必须为正整数" };
                }
                const product = await InventoryProduct.exists({ _id: row.productId, _isDeleted: { $ne: true } }).session(session);
                if (!product) throw { status: 400, code: "PRODUCT_NOT_FOUND", message: "生产产品不存在或已删除" };
                const rootId = row.rootProductId?.toString?.() || "";
                const line = (order.products || []).find((item: any) => String(item.productId) === rootId);
                if (!line) throw { status: 409, code: "PRODUCT_NOT_IN_ORDER", message: "来源订单产品已变化" };
                if (row.productId.toString() !== rootId) {
                    const rootProduct = await InventoryProduct.exists({ _id: row.rootProductId, _isDeleted: { $ne: true } }).session(session);
                    if (!rootProduct) throw { status: 400, code: "PRODUCT_NOT_FOUND", message: "来源成品不存在或已删除" };
                    const bom = await InventoryBom.findOne({ productId: row.rootProductId, isEnabled: true, _isDeleted: { $ne: true } })
                        .select("items").session(session).lean() as any;
                    const item = bom?.items?.find((candidate: any) => String(candidate.productId) === row.productId.toString());
                    if (!item) throw { status: 409, code: "BOM_VERSION_INVALID", message: "BOM 产品结构已变化" };
                }
                if (!(await hasUnfulfilledProductionDemand(order, session))) {
                    throw { status: 409, code: "QUANTITY_EXCEEDS_REMAINING", message: "订单没有待生产的成品需求，或成品已全部备齐" };
                }
                const planning = await getProductionPlanning(order, rootId, row.productId.toString(), session);
                if (planning.legacyReviewRequired) {
                    throw { status: 409, code: "PRODUCTION_HISTORY_REVIEW_REQUIRED", message: "本规划组存在未关联的历史生产入库，请先核对来源" };
                }
                if (row.planQty > planning.remaining) {
                    throw { status: 409, code: "QUANTITY_EXCEEDS_REMAINING", message: "待下达需求不足，请刷新页面" };
                }
            }
            if (row.machineNumbers?.length) {
                const overlap = await ProductionOrder.exists({ _id: { $ne: row._id },
                    status: { $nin: ["草稿", "已取消"] }, machineNumbers: { $in: row.machineNumbers } }).session(session);
                if (overlap) throw { status: 409, code: "DUPLICATE_MACHINE_NUMBER", message: "机器号已被其他生产单使用" };
            }
            const updated = await ProductionOrder.findOneAndUpdate(
                { _id: row._id, version, status: "草稿" },
                { $set: { status: "待发料", releaseIdempotencyKey: key }, $inc: { version: 1 } },
                { new: true, session },
            ).lean();
            if (!updated) throw { status: 409, code: "PRODUCTION_STATUS_CHANGED", message: "生产单状态已变化" };
            released = updated;
            if (row.sourceType === "order" && row.productId.toString() === String(row.rootProductId)) {
                await syncSalesOrderMachineNo(row.salesOrderId, session);
            }
        });
        return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: { id: productionOrderId, documentNo: released.documentNo, status: released.status, version: released.version } };
    } catch (error: any) {
        if (error?.code === 11000) {
            const repeated = await ProductionOrder.findOne({ releaseIdempotencyKey: key }).lean() as any;
            if (repeated?._id.toString() === productionOrderId) return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: { id: productionOrderId, documentNo: repeated.documentNo, status: repeated.status, version: repeated.version } };
        }
        if (error?.status && error?.code) {
            setResponseStatus(event, error.status);
            return { code: error.code, msg: error.message };
        }
        logger.error("Release production order error", error);
        setResponseStatus(event, 500);
        return { code: CODE.SERVER_ERROR, msg: codeToMsg[CODE.SERVER_ERROR] };
    } finally {
        await session.endSession();
    }
});
