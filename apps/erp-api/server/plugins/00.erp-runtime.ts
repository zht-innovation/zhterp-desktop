import { createHash, timingSafeEqual } from "node:crypto";
import { statSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";
import { createError, defineEventHandler, getHeader, send, setHeader } from "h3";
import mongoose from "mongoose";
import standbyRoutes from "../../standby-routes.json";
import { initializeSalesOrderProductSn } from "~~/server/models/salesOrderProductSn.model";
import { runStandardPriceSync } from "~~/server/services/financeStandardPriceSync";
import { ensureProductionOrderIndexes, migrateProductionOrderIndexes } from "~~/server/services/productionOrderMigration";
import { runProductionWarnings } from "~~/server/services/productionOrderWarning";
import { syncPurchaseLogisticsTracking } from "~~/server/services/purchaseLogisticsTracking";
import { initializeSalesOrderCompletionState } from "~~/server/services/salesOrderCompletionState";
import { closeTaobaoCollector } from "~~/server/services/taobaoCollector";
import { getErpAttachmentRoot } from "~~/server/utils/erpAttachmentRoot";
import { logger } from "~~/server/utils/logger";
import { createRequestDrain } from "~~/server/utils/requestDrain";

const safeRequests = new Set(standbyRoutes);
const loopbackAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const enabled = (value: unknown) => value === true || value === "true";
const digest = (value: string) => createHash("sha256").update(value).digest();

export default defineNitroPlugin((nitroApp) => {
    const config = useRuntimeConfig();
    const connection = mongoose.connection;
    const requests = createRequestDrain();
    const writes = createRequestDrain();
    const drainFile = String(config.erpDrainFile || "").trim();
    const controlToken = String(config.erpControlToken || "");
    const writesEnabled = enabled(config.erpEnableWrites);
    const authorizationConfigured = Boolean(String(config.baseToken || "").trim());
    const shouldInitialize = enabled(config.erpEnableInitialization);
    const statusPath = "/__erp/status";
    const indexPlanPath = "/__erp/production-index-plan";
    let stopping = false;
    let initialized: "disabled" | "pending" | "running" | "ready" | "failed" =
        shouldInitialize ? "pending" : "disabled";

    const isDraining = () => {
        if (stopping || !isAbsolute(drainFile)) return true;
        try {
            if (!statSync(dirname(drainFile), { throwIfNoEntry: false })?.isDirectory()) return true;
            return Boolean(statSync(drainFile, { throwIfNoEntry: false }));
        } catch {
            return true;
        }
    };

    const attachmentAvailable = () => {
        try {
            getErpAttachmentRoot();
            return true;
        } catch {
            return false;
        }
    };

    const canOwnWrites = () => writesEnabled && authorizationConfigured
        && connection.readyState === 1 && !isDraining() && attachmentAvailable();
    const canWrite = () => canOwnWrites() && (initialized === "ready" || initialized === "disabled");

    const runInitialization = async () => {
        if (initialized !== "pending" || !canOwnWrites()) return;
        initialized = "running";
        await writes.run(async () => {
            try {
                await initializeSalesOrderCompletionState();
                await ensureProductionOrderIndexes();
                await initializeSalesOrderProductSn();
                initialized = "ready";
            } catch (error) {
                initialized = "failed";
                logger.error("ERP 初始化失败", error as Error);
            }
        });
    };

    const logisticsInterval = Number(config.logisticsTrackingSyncIntervalMinutes);
    const jobs = [
        {
            name: "production-warning",
            enabled: enabled(config.erpEnableProductionWarning),
            interval: 60_000,
            run: () => runProductionWarnings(() => !canWrite()),
            running: false,
        },
        {
            name: "standard-price-sync",
            enabled: enabled(config.erpEnableStandardPriceSync),
            interval: 60_000,
            run: runStandardPriceSync,
            running: false,
        },
        {
            name: "purchase-logistics",
            enabled: enabled(config.erpEnablePurchaseLogistics)
                && Boolean(config.logisticsTrackingApiUrl && config.logisticsTrackingApiKey)
                && Number.isFinite(logisticsInterval) && logisticsInterval > 0,
            interval: logisticsInterval * 60_000,
            run: syncPurchaseLogisticsTracking,
            running: false,
        },
    ];

    const startJob = (job: typeof jobs[number]) => {
        if (job.running || !canWrite()) return;
        job.running = true;
        void writes.run(async () => {
            try {
                await job.run();
            } catch (error) {
                logger.error(`ERP 定时任务失败：${job.name}`, error as Error);
            } finally {
                job.running = false;
            }
        });
    };

    const enabledJobs = jobs.filter(job => job.enabled);
    const timers = enabledJobs.map(job => setInterval(() => startJob(job), job.interval));
    if (shouldInitialize && writesEnabled) timers.push(setInterval(() => void runInitialization(), 1000));

    const originalHandler = nitroApp.h3App.handler;
    nitroApp.h3App.handler = Object.assign(defineEventHandler((event) => {
        const requestUrl = event.path;
        const [rawPathname] = requestUrl.split("?", 1);
        if (rawPathname.endsWith("//")) throw createError({ statusCode: 404 });
        const pathname = rawPathname.length > 1 ? rawPathname.replace(/\/$/, "") : rawPathname;
        if (pathname !== rawPathname) {
            // Match the router's trailing slash handling before exact-path authorization.
            event.node.req.url = pathname + requestUrl.slice(rawPathname.length);
        }
        if (pathname === statusPath || pathname === indexPlanPath) {
            const authorization = getHeader(event, "authorization") || "";
            if (event.method !== "GET" || !controlToken
                || !loopbackAddresses.has(event.node.req.socket.remoteAddress || "")
                || !timingSafeEqual(digest(authorization), digest(`Bearer ${controlToken}`))) {
                throw createError({ statusCode: 404 });
            }
            setHeader(event, "Cache-Control", "private, no-store");
            setHeader(event, "Content-Type", "application/json; charset=utf-8");
            // The top-level H3 handler must send the response itself.
            if (pathname === indexPlanPath) {
                if (connection.readyState !== 1 || !connection.db) throw createError({ statusCode: 503 });
                return requests.run(async () => {
                    const plan = await migrateProductionOrderIndexes(connection.db!, false);
                    return send(event, JSON.stringify(plan));
                });
            }
            return send(event, JSON.stringify({
                databaseReady: connection.readyState === 1,
                authorizationConfigured,
                attachmentReady: attachmentAvailable(),
                initialization: initialized,
                writesEnabled: canWrite(),
                draining: isDraining(),
                drained: !canWrite() && writes.activeCount === 0,
                activeWrites: writes.activeCount,
                activeRequests: requests.activeCount,
                jobs: jobs.map(({ name, enabled, running }) => ({ name, enabled, running })),
            }));
        }
        if (stopping || !authorizationConfigured || connection.readyState !== 1) {
            throw createError({ statusCode: 503, message: "ERP 服务准备中，请稍后重试" });
        }
        const handler = () => originalHandler(event);
        if (safeRequests.has(`${event.method} ${pathname}`)) return requests.run(handler);
        if (!canWrite()) {
            throw createError({ statusCode: 503, message: "ERP 正在维护，提交已暂停，请稍后重试" });
        }
        return requests.run(() => writes.run(handler));
    }), originalHandler);

    const startup = requests.run(async () => {
        try {
            // 共享账号和部门由主站维护，待命连接也不得隐式建集合或索引。
            await mongoose.connect(config.mongoUrl, { autoCreate: false, autoIndex: false });
            await runInitialization();
            for (const job of enabledJobs) startJob(job);
        } catch (error) {
            logger.error("ERP 数据库连接失败", error as Error);
        }
    });

    nitroApp.hooks.hook("close", async () => {
        stopping = true;
        for (const timer of timers) clearInterval(timer);
        await startup;
        while (!(await writes.waitForIdle(30_000))) logger.warn("仍有 ERP 写操作或后台任务执行中");
        while (!(await requests.waitForIdle(30_000))) logger.warn("仍有 ERP 请求执行中");
        await closeTaobaoCollector();
        await connection.close();
    });
});
