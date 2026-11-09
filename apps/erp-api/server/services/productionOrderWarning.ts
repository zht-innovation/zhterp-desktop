import mongoose from "mongoose";
import { setResponseStatus, type H3Event } from "h3";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { useNotificationModel } from "~~/server/models/notification.model";
import { resolveNotificationRecipients } from "~~/server/services/notificationAudience";
import { productionWarningDays, productionWarningDue, productionWarningKey, productionWarningStatuses, productionWarningToday } from "./productionWarningMath";
import { canAccessConfigurationPath } from "~~/shared/utils/adminPermission";
import type { ProductionWarning } from "~~/shared/types/production-warning";
import { CODE } from "~~/server/utils/code";
import { logger } from "~~/server/utils/logger";

const isoDate = (value: Date | string) => new Date(value).toISOString();

export const productionWarningRecords = (row: any): ProductionWarning[] => (row.warnings || []).map((warning: any) => ({
    id: String(warning._id), key: warning.key, dueDate: isoDate(warning.dueDate),
    warningDays: productionWarningDays(warning.warningDays), publishedAt: isoDate(warning.publishedAt),
    handlingMethod: String(warning.handlingMethod || ""), handledBy: String(warning.handledBy || ""),
    handledAt: warning.handledAt ? isoDate(warning.handledAt) : null,
})).reverse();

// 记录和通知在同一事务内提交；写生产单也与完工、改期及其他实例的扫描串行化。
const publishProductionWarning = async (orderId: unknown, now: Date) => {
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const row = await ProductionOrder.findById(orderId).session(session).lean() as any;
            if (!row || !productionWarningDue(row, now)) return;
            const warningDays = productionWarningDays(row.warningDays);
            const key = productionWarningKey(row.planFinish, warningDays);
            if ((row.warnings || []).some((warning: any) => warning.key === key)) return;
            const warning = { _id: new mongoose.Types.ObjectId(), key, dueDate: row.planFinish, warningDays, publishedAt: now };
            const result = await ProductionOrder.updateOne({ _id: row._id, "warnings.key": { $ne: key } }, {
                $push: { warnings: warning },
            }, { session, runValidators: true });
            if (!result.modifiedCount) return;
            const recipientAdminIds = await resolveNotificationRecipients("生产任务");
            await useNotificationModel().upsertBySourceKey({
                type: "notification", category: "生产任务",
                title: `【生产预警】生产单 ${row.documentNo || row.productionNo} 临近交期`,
                content: `产品：${row.productName}；计划完成日：${key.slice(0, 10)}；预警设置：提前 ${warningDays} 天。请查看生产进度并填写处理方式。`,
                relatedId: String(row._id),
                relatedPath: `/configuration/production/production-orders?id=${row._id}&tab=warnings`,
                sourceKey: `production-warning:${row._id}:${key}`,
                // 即使当前没有生产任务接收人，也不能退化为公共通知。
                recipientAdminIds: recipientAdminIds || [],
            }, session);
        });
    } finally {
        await session.endSession();
    }
};

export const runProductionWarnings = async (shouldStop: () => boolean = () => false) => {
    const now = new Date();
    const latestDueDate = new Date(productionWarningToday(now).getTime() + 5 * 86_400_000);
    const cursor = ProductionOrder.find({
        status: { $in: productionWarningStatuses }, planFinish: { $lte: latestDueDate },
    }).select("planFinish warningDays status warnings.key").lean().cursor();
    try {
        for await (const row of cursor as any) {
            if (shouldStop()) break;
            if (!productionWarningDue(row, now)) continue;
            const key = productionWarningKey(row.planFinish, row.warningDays);
            if ((row.warnings || []).some((warning: any) => warning.key === key)) continue;
            try { await publishProductionWarning(row._id, now); }
            catch (error) { logger.error(`生产预警发布失败：${row._id}`, error as Error); }
        }
    } finally {
        await cursor.close();
    }
};

export const handleProductionWarning = async (event: H3Event, body: Record<string, unknown>) => {
    const actor = String(event.context.auth?.username || "").trim();
    if (!actor) {
        setResponseStatus(event, 401);
        return { code: 401, msg: "请先登录。" };
    }
    if (!canAccessConfigurationPath(Number(event.context.auth?.role), "/configuration/production/production-orders")) {
        setResponseStatus(event, 403);
        return { code: "FORBIDDEN", msg: "没有生产预警处理权限" };
    }
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const warningId = typeof body.warningId === "string" ? body.warningId.trim() : "";
    const handlingMethod = typeof body.handlingMethod === "string" ? body.handlingMethod.trim() : "";
    if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(warningId) || !handlingMethod || handlingMethod.length > 1000) {
        setResponseStatus(event, 400);
        return { code: "INVALID_PARAMS", msg: "请选择有效预警并填写处理方式（最多 1000 字）" };
    }
    try {
        const updated = await ProductionOrder.findOneAndUpdate({
            _id: id, status: { $ne: "已取消" }, warnings: { $elemMatch: { _id: warningId, handledAt: null } },
        }, { $set: {
            "warnings.$.handlingMethod": handlingMethod, "warnings.$.handledBy": actor, "warnings.$.handledAt": new Date(),
        } }, { new: true, runValidators: true }).select("warnings").lean() as any;
        if (updated) return { code: CODE.SUCCESS, msg: "处理方式已记录", data: { warnings: productionWarningRecords(updated) } };
        const current = await ProductionOrder.findOne({ _id: id, status: { $ne: "已取消" } }).select("warnings").lean() as any;
        const warning = current?.warnings?.find((item: any) => String(item._id) === warningId);
        if (!warning) {
            setResponseStatus(event, 404);
            return { code: "PRODUCTION_WARNING_NOT_FOUND", msg: "生产预警不存在" };
        }
        if (warning.handledAt && warning.handledBy === actor && warning.handlingMethod === handlingMethod) {
            return { code: CODE.SUCCESS, msg: "处理方式已记录", data: { warnings: productionWarningRecords(current) } };
        }
        setResponseStatus(event, 409);
        return { code: "PRODUCTION_WARNING_HANDLED", msg: "该预警已处理，请刷新查看处理记录" };
    } catch (error) {
        logger.error("保存生产预警处理记录失败", error as Error);
        setResponseStatus(event, 500);
        return { code: CODE.SERVER_ERROR, msg: "保存处理记录失败，请稍后重试" };
    }
};
