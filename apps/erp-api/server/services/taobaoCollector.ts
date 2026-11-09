import mongoose from "mongoose";
import type { MatchedTaobaoWaybill, TaobaoMatchResult } from "~~/shared/types/logistics";
import { platformOrderNosError } from "~~/shared/utils/logistics";
import { InventoryHttpError } from "~~/server/services/inventory";
import { CODE } from "~~/server/utils/code";

let connection: mongoose.Connection | undefined;
let connecting: Promise<mongoose.Connection> | undefined;

export const normalizePlatformOrderNos = (value: unknown): string[] => {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "淘宝订单号必须是字符串数组");
    }
    const result = [...new Set(value.map((item) => item.trim()).filter(Boolean))];
    const error = platformOrderNosError(result);
    if (error) throw new InventoryHttpError(400, CODE.INVALID_PARAMS, error);
    return result;
};

const getCollectorConnection = async () => {
    if (connection?.readyState === 1) return connection;
    if (connecting) return connecting;
    const config = useRuntimeConfig();
    if (!config.taobaoMongoUrl || !config.taobaoMongoUser || !config.taobaoMongoPassword) {
        throw new Error("采集库未配置");
    }
    connecting = (async () => {
        if (connection) await connection.close().catch(() => {});
        const next = mongoose.createConnection(config.taobaoMongoUrl, {
            user: config.taobaoMongoUser,
            pass: config.taobaoMongoPassword,
            autoCreate: false,
            autoIndex: false,
            maxPoolSize: 5,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
            socketTimeoutMS: 5000,
        });
        next.on("error", () => {}); // 错误通过匹配结果返回，不输出含凭据的驱动异常。
        try {
            await next.asPromise();
            connection = next;
            return next;
        } catch {
            await next.close().catch(() => {});
            throw new Error("采集库连接失败");
        }
    })();
    try {
        return await connecting;
    } finally {
        connecting = undefined;
    }
};

export const closeTaobaoCollector = async () => {
    if (connecting) await connecting.catch(() => {});
    if (connection) await connection.close();
    connection = undefined;
};

export const resolveTaobaoOrders = async (value: unknown): Promise<TaobaoMatchResult> => {
    const orderNos = normalizePlatformOrderNos(value);
    const base = {
        matchedAt: new Date().toISOString(),
        unmatchedOrderNos: orderNos,
        waybills: [] as MatchedTaobaoWaybill[],
    };
    try {
        const conn = await getCollectorConnection();
        const accountKey = String(useRuntimeConfig().taobaoAccountKey || "taobao-main");
        const filter = { accountKey, orderNo: { $in: orderNos } };
        const [orders, shipments] = await Promise.all([
            conn.db!.collection("taobao_orders").find(filter, {
                projection: { orderNo: 1, shipmentVerification: 1 },
            }).maxTimeMS(5000).toArray(),
            conn.db!.collection("taobao_shipments").find({
                ...filter,
                source: "dom",
                shipmentVerification: { $ne: "conflict" },
            }, {
                projection: { orderNo: 1, trackingNo: 1, courierCompany: 1 },
            }).maxTimeMS(5000).toArray(),
        ]);
        const validOrders = new Set(orders.filter((order) => order.shipmentVerification !== "conflict")
            .map((order) => String(order.orderNo)));
        const matchedOrders = new Set<string>();
        const byTracking = new Map<string, MatchedTaobaoWaybill>();
        for (const row of shipments) {
            const orderNo = String(row.orderNo);
            const trackingNo = String(row.trackingNo || "").trim().toUpperCase();
            if (!validOrders.has(orderNo) || !/^[A-Z0-9][A-Z0-9-]{7,39}$/.test(trackingNo)
                || !/\d/.test(trackingNo)) continue;
            matchedOrders.add(orderNo);
            const existing = byTracking.get(trackingNo);
            if (existing) {
                if (!existing.platformOrderNos.includes(orderNo)) existing.platformOrderNos.push(orderNo);
            } else {
                byTracking.set(trackingNo, {
                    trackingNo,
                    courierCompany: String(row.courierCompany || ""),
                    source: "taobao",
                    accountKey,
                    platformOrderNos: [orderNo],
                });
            }
        }
        const unmatchedOrderNos = orderNos.filter((orderNo) => !matchedOrders.has(orderNo));
        return {
            ...base,
            status: !matchedOrders.size ? "pending" : unmatchedOrderNos.length ? "partial" : "matched",
            message: unmatchedOrderNos.length ? "部分或全部订单尚无已确认运单，可稍后重新同步" : "运单匹配完成",
            unmatchedOrderNos,
            waybills: [...byTracking.values()],
        };
    } catch {
        return { ...base, status: "error", message: "无法连接测试采集库，请检查 SSH 隧道和只读账号配置" };
    }
};
