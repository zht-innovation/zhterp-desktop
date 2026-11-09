import mongoose from "mongoose";
import { setResponseStatus, type H3Event } from "h3";
import { canAccessConfigurationPath } from "~~/shared/utils/adminPermission";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { getProductionOrderDeleteStates } from "~~/server/services/productionOrderDeleteEligibility";
import { ensureProductionOrderIndexes } from "~~/server/services/productionOrderMigration";
import { ProductionInputError, failProductionInput as fail } from "~~/server/services/productionOrderInput";
import { lockSalesOrderForProduction } from "~~/server/services/salesOrderCompletionState";
import { syncSalesOrderMachineNo } from "~~/server/services/salesOrderMachineNo";
import { productionExecutionFailure } from "~~/server/services/productionExecutionHttp";
import { logger } from "~~/server/utils/logger";
import { CODE } from "~~/server/utils/code";

export const deleteProductionOrder = async (event: H3Event, body: Record<string, unknown>) => {
    const actor = String(event.context.auth?.username || "").trim();
    if (!actor) {
        setResponseStatus(event, 401);
        return { code: 401, msg: "请先登录。" };
    }
    if (!canAccessConfigurationPath(Number(event.context.auth?.role), "/configuration/production/production-orders")) {
        setResponseStatus(event, 403);
        return { code: "FORBIDDEN", msg: "没有生产单删除权限" };
    }
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const version = body.version;
    if (!mongoose.isValidObjectId(id) || typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) {
        setResponseStatus(event, 400);
        return { code: "INVALID_PARAMS", msg: "请提供有效的生产单和当前版本" };
    }
    try {
        await ensureProductionOrderIndexes();
    } catch (error) {
        logger.error("生产单索引迁移尚未就绪", error as Error);
        setResponseStatus(event, 503);
        return { code: "PRODUCTION_INDEX_MIGRATION_REQUIRED", msg: "生产单索引迁移未完成，请管理员核对迁移日志后重试" };
    }

    const session = await mongoose.startSession();
    try {
        let documentNo = "";
        await session.withTransaction(async () => {
            const row = await ProductionOrder.findById(id).session(session).lean() as any;
            if (!row) fail(404, "PRODUCTION_ORDER_NOT_FOUND", "生产单不存在或已删除");
            if (Number(row.version || 1) !== version) {
                fail(409, "PRODUCTION_STATUS_CHANGED", "生产单状态或版本已变化，请刷新后重试");
            }
            const deleteStates = await getProductionOrderDeleteStates([row], session);
            const state = deleteStates.get(String(row._id));
            if (!state?.canDelete) {
                fail(409, "PRODUCTION_ORDER_NOT_DELETABLE", state?.deleteBlockReason || "生产单当前不能删除，请刷新后重试");
            }
            if (row.sourceType === "order") {
                if (!row.salesOrderId) fail(409, "PRODUCTION_SOURCE_CHANGED", "来源订单不存在，不能删除生产单");
                await lockSalesOrderForProduction(String(row.salesOrderId), actor, session);
            }
            // 与发料申请、物料分配及修改竞争同一生产单，防止检查后并发产生关联记录。
            const result = await ProductionOrder.deleteOne({
                _id: row._id, status: row.status,
                version: row.version === undefined ? { $exists: false } : row.version,
            }, { session });
            if (result.deletedCount !== 1) {
                fail(409, "PRODUCTION_STATUS_CHANGED", "生产单状态或版本已变化，请刷新后重试");
            }
            if (row.sourceType === "order" && String(row.productId) === String(row.rootProductId)) {
                await syncSalesOrderMachineNo(row.salesOrderId, session, { allowEmpty: true });
            }
            documentNo = String(row.documentNo || row.productionNo || "");
        });
        return { code: CODE.SUCCESS, msg: "删除成功", data: { id, documentNo } };
    } catch (error) {
        if (error instanceof ProductionInputError) {
            setResponseStatus(event, error.status);
            return { code: error.businessCode, msg: error.message };
        }
        return productionExecutionFailure(event, error);
    } finally {
        await session.endSession();
    }
};
