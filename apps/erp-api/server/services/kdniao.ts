import { createHash, createHmac } from "node:crypto";
import { LogisticsTrackCache } from "~~/server/models/logisticsTrackCache.model";
import type {
    LogisticsTrace,
    LogisticsTrackingOptions,
    LogisticsTrackingResult,
} from "~~/shared/types/logistics";
import { getCourierCode } from "~~/shared/utils/logistics";

const pending = new Map<string, Promise<LogisticsTrackingResult>>();
const ENDPOINT = "https://api.kdniao.com/Ebusiness/EbusinessOrderHandle.aspx";
const MIN_INTERVAL = 60_000;
const CACHE_INTERVAL = 10 * 60_000;

const providerError = (reason: unknown) => {
    const text = String(reason || "");
    if (/余额|额度|次数|欠费|套餐|订购|权限|授权/.test(text)) return "快递鸟套餐权限或查询额度不足，请检查账号服务";
    if (/签名|认证|AppKey|EBusinessID|用户ID|密钥/i.test(text)) return "快递鸟身份校验失败，请检查商户ID和密钥";
    if (/手机|尾号|CustomerName|商家编码/i.test(text)) return "物流校验信息不正确，请检查手机号后四位或京东商家编码";
    if (/编码|快递公司/.test(text)) return "快递公司编码不正确或暂不支持";
    return "快递鸟查询失败，请稍后重试或检查账号服务";
};

const parseTraces = (raw: unknown): LogisticsTrace[] => {
    if (!Array.isArray(raw)) return [];
    const result: LogisticsTrace[] = [];
    for (const item of raw.slice(-500)) {
        const station = String(item?.AcceptStation || "").trim();
        const text = String(item?.AcceptTime || "").trim().replace(
            /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/,
            "$1T$2+08:00",
        );
        const date = new Date(text);
        if (!station || Number.isNaN(date.getTime())) continue;
        result.push({
            acceptTime: date.toISOString(),
            acceptStation: station,
            location: String(item.Location || ""),
            action: String(item.Action || ""),
        });
    }
    result.sort((left, right) => Date.parse(left.acceptTime) - Date.parse(right.acceptTime));
    return result;
};

export const queryKdniao = async (
    trackingValue: string,
    company: string,
    options: LogisticsTrackingOptions = {},
): Promise<LogisticsTrackingResult> => {
    const trackingNo = String(trackingValue || "").trim().toUpperCase();
    const shipperCode = getCourierCode(company) || String(options.shipperCode || "").trim().toUpperCase();
    const customerName = String(options.customerName || "").trim();
    const requiresPhone = shipperCode === "SF" || shipperCode === "ZTO";
    const base: LogisticsTrackingResult = {
        trackingNo, shipperCode, status: "error", message: "", state: "", stateLabel: "",
        location: "", traces: [], queriedAt: null, cached: false, stale: false, retryAfter: 0,
    };
    if (!/^[A-Z0-9][A-Z0-9-]{5,39}$/.test(trackingNo)) {
        return { ...base, status: "needs_input", message: "运单号格式不正确" };
    }
    if (!/^[A-Z0-9]{2,20}$/.test(shipperCode)) {
        return { ...base, status: "needs_input", message: "无法识别快递公司，请填写快递鸟公司编码" };
    }
    if (requiresPhone && !/^\d{4}$/.test(customerName)) {
        return { ...base, status: "needs_input", message: `${shipperCode === "SF" ? "顺丰" : "中通"}查询需要寄件人或收件人手机号后四位` };
    }
    if (shipperCode === "JD" && !/^[A-Za-z0-9]{10}$/.test(customerName)) {
        return { ...base, status: "needs_input", message: "京东查询需要10位青龙商家编码" };
    }
    const config = useRuntimeConfig();
    if (!config.kdniaoEbusinessId || !config.kdniaoAppKey) {
        return { ...base, status: "not_configured", message: "快递鸟尚未配置商户ID和密钥" };
    }
    const verification = requiresPhone || shipperCode === "JD" ? customerName : "";
    const key = createHmac("sha256", config.kdniaoAppKey)
        .update(JSON.stringify([config.kdniaoEbusinessId, shipperCode, trackingNo, verification])).digest("hex");
    if (pending.has(key)) return pending.get(key)!;

    const perform = async (): Promise<LogisticsTrackingResult> => {
        const now = new Date();
        let previous: any;
        try {
            previous = await LogisticsTrackCache.findById(key).lean();
            const lastAttempt = previous ? new Date(previous.lastAttemptAt).getTime() : 0;
            const allowedAt = previous ? new Date(previous.nextQueryAt).getTime() : 0;
            const waiting = Math.max(0, Math.ceil((allowedAt - now.getTime()) / 1000));
            if (previous && ((options.refresh !== true && waiting > 0) || now.getTime() - lastAttempt < MIN_INTERVAL)) {
                const retryAfter = previous.errorMessage || !previous.result
                    ? waiting
                    : Math.max(0, Math.ceil((lastAttempt + MIN_INTERVAL - now.getTime()) / 1000));
                return {
                    ...(previous.result || base),
                    message: previous.errorMessage || previous.result?.message || "查询处理中，请稍后重试",
                    cached: true, stale: Boolean(previous.errorMessage), retryAfter,
                    ...(!previous.result || previous.errorMessage ? { status: "error" as const } : {}),
                };
            }
            // 原子预占也限制多实例重复查询；已有缓存不满足条件时 upsert 会触发唯一键冲突。
            await LogisticsTrackCache.findOneAndUpdate({
                _id: key,
                $or: [{ lastAttemptAt: { $lte: new Date(now.getTime() - MIN_INTERVAL) } }, { lastAttemptAt: { $exists: false } }],
            }, {
                $set: { lastAttemptAt: now, nextQueryAt: new Date(now.getTime() + MIN_INTERVAL) },
            }, { upsert: true, new: true });
        } catch (error: any) {
            if (error?.code === 11000) {
                return { ...(previous?.result || base), cached: true, retryAfter: 60, message: "查询正在处理中，请稍后重试" };
            }
            return { ...base, message: "ERP物流缓存不可用，暂未发起快递鸟查询" };
        }

        let queryResult: LogisticsTrackingResult;
        try {
            const requestData = JSON.stringify({
                ShipperCode: shipperCode,
                LogisticCode: trackingNo,
                ...(verification ? { CustomerName: verification } : {}),
            });
            const md5 = createHash("md5").update(requestData + config.kdniaoAppKey, "utf8").digest("hex");
            const body = new URLSearchParams({
                RequestData: requestData,
                EBusinessID: config.kdniaoEbusinessId,
                RequestType: "8002",
                DataType: "2",
                DataSign: Buffer.from(md5, "utf8").toString("base64"),
            });
            const rawResponse = await $fetch<any>(ENDPOINT, {
                method: "POST", retry: 0, timeout: 10_000,
                headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
                body: body.toString(),
            });
            const response = typeof rawResponse === "string" ? JSON.parse(rawResponse) : rawResponse;
            if (response?.Success !== true) throw new Error(providerError(response?.Reason));
            if ((response.LogisticCode && String(response.LogisticCode).toUpperCase() !== trackingNo)
                || (response.ShipperCode && String(response.ShipperCode).toUpperCase() !== shipperCode)) {
                throw new Error("快递鸟返回的运单或公司不匹配，请检查快递公司编码");
            }
            const traces = parseTraces(response.Traces);
            const state = String(response.State || "0");
            const stateLabels: Record<string, string> = { "0": "暂无轨迹", "1": "已揽收", "2": "运输中", "3": "已签收", "4": "问题件" };
            queryResult = {
                ...base, status: traces.length ? "success" : "no_traces",
                message: traces.length ? "物流查询成功" : "暂无轨迹信息",
                state, stateLabel: stateLabels[state] || "未知状态",
                location: String(response.Location || traces.at(-1)?.location || ""),
                traces, queriedAt: new Date().toISOString(),
            };
        } catch (error: any) {
            const safeMessages = [
                "快递鸟套餐权限或查询额度不足，请检查账号服务",
                "快递鸟身份校验失败，请检查商户ID和密钥",
                "物流校验信息不正确，请检查手机号后四位或京东商家编码",
                "快递公司编码不正确或暂不支持",
                "快递鸟查询失败，请稍后重试或检查账号服务",
                "快递鸟返回的运单或公司不匹配，请检查快递公司编码",
            ];
            const message = safeMessages.includes(error?.message)
                ? error.message : "快递鸟请求超时或网络异常，请稍后重试";
            queryResult = { ...(previous?.result || base), status: "error", message, stale: Boolean(previous?.result), retryAfter: 60 };
        }
        const success = queryResult.status === "success" || queryResult.status === "no_traces";
        try {
            await LogisticsTrackCache.updateOne({ _id: key }, {
                $set: {
                    nextQueryAt: new Date(Date.now() + (success ? CACHE_INTERVAL : MIN_INTERVAL)),
                    errorMessage: success ? "" : queryResult.message,
                    ...(success ? { result: queryResult } : {}),
                },
            });
        } catch {
            // 预占已生效，短期内不会因写缓存失败重复调用第三方。
            queryResult.message += "（缓存保存失败）";
        }
        return queryResult;
    };
    const task = perform();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
};
