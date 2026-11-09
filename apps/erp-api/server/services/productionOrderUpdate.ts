import mongoose from "mongoose";
import { setResponseStatus, type H3Event } from "h3";
import { canAccessConfigurationPath } from "~~/shared/utils/adminPermission";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { ensureProductionOrderIndexes } from "~~/server/services/productionOrderMigration";
import { ProductionInputError, failProductionInput as fail, dateOnly, parseMachineNumbers, parseProductionWarningDays } from "~~/server/services/productionOrderInput";
import { lockSalesOrderForProduction } from "~~/server/services/salesOrderCompletionState";
import { syncSalesOrderMachineNo } from "~~/server/services/salesOrderMachineNo";
import { productionExecutionFailure } from "~~/server/services/productionExecutionHttp";
import { logger } from "~~/server/utils/logger";
import { CODE } from "~~/server/utils/code";

const editableStatuses = ["草稿", "待发料", "待生产", "生产中"];

export const updateProductionOrder = async (event: H3Event, body: Record<string, unknown>) => {
    const actor = String(event.context.auth?.username || "").trim();
    if (!actor) {
        setResponseStatus(event, 401);
        return { code: 401, msg: "请先登录。" };
    }
    if (!canAccessConfigurationPath(Number(event.context.auth?.role), "/configuration/production/production-orders")) {
        setResponseStatus(event, 403);
        return { code: "FORBIDDEN", msg: "没有生产单修改权限" };
    }
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const version = body.version;
    const planStart = typeof body.planStart === "string" ? dateOnly(body.planStart) : null;
    const planFinish = typeof body.planFinish === "string" ? dateOnly(body.planFinish) : null;
    const workshop = typeof body.workshop === "string" ? body.workshop.trim() : "";
    const remark = typeof body.remark === "string" ? body.remark.trim() : "";
    const priority = body.priority;
    const validMachineInput = typeof body.machineNumbers === "string"
        || (Array.isArray(body.machineNumbers) && body.machineNumbers.every((value) => typeof value === "string"));
    if (!mongoose.isValidObjectId(id) || typeof version !== "number" || !Number.isSafeInteger(version) || version < 1
        || !planStart || !planFinish || planFinish < planStart || !workshop || workshop.length > 40
        || typeof priority !== "string" || !["普通", "紧急"].includes(priority)
        || typeof body.remark !== "string" || remark.length > 300 || !validMachineInput) {
        setResponseStatus(event, 400);
        return { code: "INVALID_PARAMS", msg: "请核对生产单版本、计划日期、车间、优先级、备注和机器号" };
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
        // 兼容未传新字段的旧客户端：更新时保留原预警设置。
        const warningDays = body.warningDays === undefined ? undefined : parseProductionWarningDays(body.warningDays);
        const machineNumbers = parseMachineNumbers(body.machineNumbers);
        let updated: any;
        await session.withTransaction(async () => {
            const row = await ProductionOrder.findById(id).session(session).lean() as any;
            if (!row) fail(404, "PRODUCTION_ORDER_NOT_FOUND", "生产单不存在");
            if (!editableStatuses.includes(row.status) || Number(row.version || 1) !== version) {
                fail(409, "PRODUCTION_STATUS_CHANGED", "生产单状态或版本已变化，请重新加载后修改");
            }
            if (machineNumbers.length > Number(row.planQty) || new Set(machineNumbers).size !== machineNumbers.length) {
                fail(400, "INVALID_MACHINE_NUMBERS", "机器号重复或超过生产数量");
            }
            if (row.sourceType === "order") {
                if (!row.salesOrderId) fail(409, "PRODUCTION_SOURCE_CHANGED", "来源订单不存在，不能修改生产单");
                await lockSalesOrderForProduction(String(row.salesOrderId), actor, session);
            }
            if (machineNumbers.length) {
                const duplicate = await ProductionOrder.exists({
                    _id: { $ne: row._id }, status: { $ne: "已取消" }, machineNumbers: { $in: machineNumbers },
                }).session(session);
                if (duplicate) fail(409, "DUPLICATE_MACHINE_NUMBER", "机器号已被其他生产单使用");
            }
            const machineNumbersChanged = JSON.stringify(row.machineNumbers || []) !== JSON.stringify(machineNumbers);
            const fields: Record<string, any> = { planStart, planFinish, workshop, priority, remark, version: version + 1 };
            if (warningDays !== undefined) fields.warningDays = warningDays;
            const changes: Record<string, any> = { $set: fields };
            if (machineNumbers.length) fields.machineNumbers = machineNumbers;
            else changes.$unset = { machineNumbers: "" };
            updated = await ProductionOrder.findOneAndUpdate({
                _id: row._id, status: row.status,
                version: row.version === undefined ? { $exists: false } : row.version,
            }, changes, { new: true, session, runValidators: true }).lean();
            if (!updated) fail(409, "PRODUCTION_STATUS_CHANGED", "生产单状态或版本已变化，请重新加载后修改");
            if (machineNumbersChanged && row.sourceType === "order" && row.status !== "草稿"
                && String(row.productId) === String(row.rootProductId)) {
                await syncSalesOrderMachineNo(row.salesOrderId, session, { allowEmpty: true });
            }
        });
        return { code: CODE.SUCCESS, msg: "修改成功", data: {
            id, documentNo: updated.documentNo, status: updated.status, version: updated.version,
        } };
    } catch (error: any) {
        if (error?.code === 11000 && error?.keyPattern?.machineNumbers) {
            setResponseStatus(event, 409);
            return { code: "DUPLICATE_MACHINE_NUMBER", msg: "机器号已被其他生产单使用" };
        }
        if (error instanceof ProductionInputError) {
            setResponseStatus(event, error.status);
            return { code: error.businessCode, msg: error.message };
        }
        return productionExecutionFailure(event, error);
    } finally {
        await session.endSession();
    }
};
