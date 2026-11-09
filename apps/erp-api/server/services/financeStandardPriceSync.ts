import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import {
    FinanceStandardPriceSyncConfig,
    FinanceStandardPriceSyncRun,
} from "~~/server/models/financeStandardPriceSync.model";
import { INVENTORY_PRODUCT_SOURCE } from "~~/shared/enums";
import type { FinanceStandardPriceSyncSettings } from "~~/shared/types/finance";
import { CODE } from "~~/server/utils/code";
import { logger } from "~~/server/utils/logger";
import { throwFinanceError } from "./finance";
import {
    getNextStandardPriceSyncAt,
    normalizeStandardPriceSyncSettingsPayload,
} from "./financeStandardPriceSyncSchedule";

const CONFIG_KEY = "standard-price-sync";
const LEASE_MS = 5 * 60 * 1000;
let readyPromise: Promise<void> | undefined;

class SyncCancelledError extends Error {}

const ensureReady = (): Promise<void> => {
    if (!readyPromise) {
        readyPromise = (async () => {
            for (const model of [FinanceStandardPriceSyncConfig, FinanceStandardPriceSyncRun]) {
                await model.createCollection();
                await model.createIndexes();
            }
        })().catch((error) => {
            readyPromise = undefined;
            throw error;
        });
    }
    return readyPromise;
};

const toSettings = (config: any): FinanceStandardPriceSyncSettings => ({
    enabled: config?.enabled === true,
    frequency: config?.frequency || "daily",
    time: config?.time || "00:00",
    weekDay: config?.weekDay ?? 1,
    monthDay: config?.monthDay ?? 1,
    timeZone: "Asia/Shanghai",
    version: config?.version ?? 0,
    nextRunAt: config?.nextRunAt ? new Date(config.nextRunAt).toISOString() : null,
    lastRun: config?.lastRun ? {
        scheduledAt: new Date(config.lastRun.scheduledAt).toISOString(),
        completedAt: new Date(config.lastRun.completedAt).toISOString(),
        updatedCount: config.lastRun.updatedCount,
        skippedCount: config.lastRun.skippedCount,
    } : null,
    lastError: config?.lastError || "",
});

export const getStandardPriceSyncSettings = async (): Promise<FinanceStandardPriceSyncSettings> => {
    await ensureReady();
    return toSettings(await FinanceStandardPriceSyncConfig.findById(CONFIG_KEY).lean());
};

export const saveStandardPriceSyncSettings = async (payload: unknown, actor: string): Promise<FinanceStandardPriceSyncSettings> => {
    const normalized = normalizeStandardPriceSyncSettingsPayload(payload);
    if (!normalized || normalized.version >= Number.MAX_SAFE_INTEGER) {
        throwFinanceError(400, CODE.INVALID_PARAMS, "同步设置无效，请检查周期、时间和配置版本");
    }
    await ensureReady();
    const { version, ...schedule } = normalized;
    const session = await mongoose.startSession();
    let config: any;
    try {
        await session.withTransaction(async () => {
            if (version === 0) {
                try {
                    await FinanceStandardPriceSyncConfig.create([{
                        _id: CONFIG_KEY, ...schedule, enabled: false, nextRunAt: null, version: 1,
                    }], { session });
                } catch (error: any) {
                    if (error?.code === 11000) throwFinanceError(409, CODE.INVALID_PARAMS, "同步设置已被更新，请关闭后重新打开");
                    throw error;
                }
            } else {
                const locked = await FinanceStandardPriceSyncConfig.findOneAndUpdate(
                    { _id: CONFIG_KEY, version },
                    { $inc: { version: 1 } },
                    { new: true, session },
                );
                if (!locked) throwFinanceError(409, CODE.INVALID_PARAMS, "同步设置已被更新，请关闭后重新打开");
            }
            // 先取得配置写锁，再取当前时间，避免锁等待跨过已计算的执行分钟。
            const nextRunAt = schedule.enabled ? getNextStandardPriceSyncAt(schedule, new Date()) : null;
            if (schedule.enabled && !nextRunAt) throwFinanceError(400, CODE.INVALID_PARAMS, "同步时间无效");
            config = await FinanceStandardPriceSyncConfig.findOneAndUpdate(
                { _id: CONFIG_KEY, version: version + 1 },
                { $set: { ...schedule, nextRunAt, updatedBy: actor, leaseToken: null, leaseUntil: null, lastError: "" } },
                { new: true, runValidators: true, session },
            ).lean();
            if (!config) throwFinanceError(409, CODE.INVALID_PARAMS, "同步设置已被更新，请关闭后重新打开");
        });
        return toSettings(config);
    } finally {
        await session.endSession();
    }
};

export const runStandardPriceSync = async (): Promise<void> => {
    await ensureReady();
    const now = new Date();
    const token = randomUUID();
    const claimed = await FinanceStandardPriceSyncConfig.findOneAndUpdate({
        _id: CONFIG_KEY,
        enabled: true,
        nextRunAt: { $ne: null, $lte: now },
        $or: [{ leaseUntil: null }, { leaseUntil: { $lte: now } }],
    }, {
        $set: { leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS) },
    }, { new: true }).lean() as any;
    if (!claimed) return;

    const scheduledAt = new Date(claimed.nextRunAt);
    const fence = { _id: CONFIG_KEY, version: claimed.version, enabled: true, nextRunAt: scheduledAt, leaseToken: token };
    let session: mongoose.ClientSession | undefined;
    try {
        const currentSession = await mongoose.startSession();
        session = currentSession;
        await currentSession.withTransaction(async () => {
            const current = await FinanceStandardPriceSyncConfig.findOne({
                ...fence, leaseUntil: { $gt: new Date() },
            }).session(currentSession).lean() as any;
            if (!current) throw new SyncCancelledError();
            const products = { source: INVENTORY_PRODUCT_SOURCE.PURCHASED, _isDeleted: { $ne: true } };
            const totalCount = await InventoryProduct.countDocuments(products).session(currentSession);
            // 管线在每次事务尝试内读取当前文档的平均价，不缓存上次尝试读取的价格。
            const result = await InventoryProduct.updateMany({
                ...products,
                averagePrice: { $type: "number", $gt: 0, $lte: Number.MAX_SAFE_INTEGER },
                $expr: { $ne: [{ $ifNull: ["$standardPrice", null] }, "$averagePrice"] },
            }, [{
                $set: { standardPrice: "$averagePrice", updatedBy: "标准价定时同步", updateTime: "$$NOW" },
            }], { session: currentSession });
            const completedAt = new Date();
            const nextRunAt = getNextStandardPriceSyncAt(current, completedAt);
            if (!nextRunAt) throw new Error("同步周期配置无效");
            const summary = {
                scheduledAt, completedAt,
                updatedCount: result.modifiedCount,
                skippedCount: Math.max(0, totalCount - result.modifiedCount),
            };
            await FinanceStandardPriceSyncRun.create([{ configVersion: current.version, ...summary }], { session: currentSession });
            const updated = await FinanceStandardPriceSyncConfig.updateOne({
                ...fence, leaseUntil: { $gt: completedAt },
            }, {
                $set: { nextRunAt, lastRun: summary, lastError: "", leaseToken: null, leaseUntil: null },
            }, { session: currentSession });
            if (updated.matchedCount !== 1) throw new SyncCancelledError();
        });
    } catch (error) {
        try {
            await FinanceStandardPriceSyncConfig.updateOne({ _id: CONFIG_KEY, version: claimed.version, leaseToken: token }, {
                $set: {
                    leaseToken: null, leaseUntil: null,
                    lastError: error instanceof SyncCancelledError ? "" : "同步失败，将在下一轮自动重试",
                },
            });
        } catch (releaseError: any) {
            logger.error("标准价同步租约释放失败", releaseError);
        }
        if (!(error instanceof SyncCancelledError)) throw error;
    } finally {
        if (session) await session.endSession();
    }
};
