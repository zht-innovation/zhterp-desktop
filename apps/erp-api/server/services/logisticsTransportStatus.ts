import type { PurchaseTransportStatus } from "~~/shared/types/purchase";

export type TransportTrackingTrace = {
    action?: string;
    acceptStation: string;
    acceptTime: Date | string;
    location?: string;
};

export type TransportSnapshot = {
    transportInfo: string;
    transportTraces: Array<{
        action: string;
        acceptStation: string;
        acceptTime: Date;
        location: string;
    }>;
    transportUpdatedAt: Date;
    transportStatus: PurchaseTransportStatus | null;
};

const parseTraceDate = (value: Date | string) => {
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
    }
    if (typeof value !== "string" || !value.trim()) return null;
    const normalized = value.trim().replace(
        /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?)$/,
        "$1T$2+08:00",
    );
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
};

const resolveTransportStatus = (description: string, state?: string): PurchaseTransportStatus | null => {
    // 客服尾注不是物流事件，尤其不能把“联系派件员”识别成正在派送。
    const eventText = description.replace(/\s+/g, "").split(
        /如有(?:疑问|问题|异常)|如需(?:帮助|咨询)|有事先呼叫|投诉电话|客服电话|请联系(?:派件员|快递员|客服)|【物流问题|(?:签收|收货|取件|取货)后(?:如|若|有|请)/,
    )[0] || "";
    const text = eventText.replace(/[【】\[\]（）()]/g, "");
    if (/拒签|拒收|拒绝签收|退回|退件|退货|问题件|异常|失败|未成功|不成功/.test(text)) return null;
    const unsigned = /未[^，。；;]{0,6}签收|待签收|未收货|待收货|拒绝签收|拒签|拒收|勿签收|签收(?:失败|未成功|不成功)/.test(text);
    const uncollected = /未(?:能)?(?:取件|取货|领取)|待(?:取件|取货)|未(?:能)?(?:揽收|揽件|收件)|待(?:揽收|揽件|收件)/.test(text);
    const receiverPickedUp = /(?:收件人|客户|本人|您|买家)(?:已经|已)(?:取件|取货|领取)(?!码|时|前|后)/.test(text)
        || /取件完成|取货完成|领取成功/.test(text);
    const receiverSigned = /已(?:由|被)(?:收件人|客户|本人|家人|家属|门口|门卫|前台|保安|同事)[^，。；;]{0,20}(?:代)?签收/.test(text)
        || /(?:收件人|客户|本人|家人|家属|门卫|前台)(?:已经|已)[^，。；;]{0,12}签收/.test(text);
    if (!unsigned && !uncollected && (receiverPickedUp || receiverSigned)) return "已签收";

    const hasPickupPoint = /驿站|自提点|代收点|快递柜|取件柜/.test(text);
    const waitingForReceiver = /待取件|待取货|等待(?:领取|取件|取货)/.test(text)
        || /(?:等待|等候|请)(?:收件人|客户|您|买家)?(?:及时|尽快|前往)?(?:领取|取件|取货)(?!码|时|前|后)/.test(text)
        || /请(?:您)?凭[^，。；;]{0,20}(?:领取|取件|取货)(?!时|前|后)/.test(text);
    const deliveredToPickupPoint = hasPickupPoint && (
        /已(?:送达|投递(?:至|到)|放入|存入|存放于|到达)[^，。；;]{0,40}(?:驿站|自提点|代收点|快递柜|取件柜)/.test(text)
        || /(?:驿站|自提点|代收点|快递柜|取件柜)[^，。；;]{0,20}(?:已代收|已代签收|已签收|已入柜)/.test(text)
        || /已由[^，。；;]{0,30}(?:驿站|自提点|代收点|快递柜|取件柜)[^，。；;]{0,12}(?:代)?签收/.test(text)
    );
    if (waitingForReceiver || deliveredToPickupPoint) return "待取货";
    if (!unsigned && !uncollected && /已签收|签收成功|已收货|妥投/.test(text)) return "已签收";
    if (/运输中|转运|发往|离开|在途|到达|抵达|派送中|派件中|配送中|正在(?:为您)?(?:派送|派件|配送)|开始(?:派送|派件|配送)/.test(text)) {
        return "运输中";
    }
    if (!uncollected && /已揽收|已揽件|揽收成功|揽件成功|已收取(?:快件|包裹)|已收件|收件成功/.test(text)) return "已揽收";
    if (unsigned || uncollected || /未送达|未投递/.test(text)) return null;

    const states: Record<string, PurchaseTransportStatus> = { "1": "已揽收", "2": "运输中", "3": "已签收" };
    return states[state || ""] || null;
};

export const buildTransportSnapshot = (
    traces: readonly TransportTrackingTrace[],
    state?: string,
): TransportSnapshot | null => {
    const validTraces: TransportSnapshot["transportTraces"] = [];
    for (const trace of traces) {
        if (!trace || typeof trace !== "object") continue;
        const acceptStation = String(trace.acceptStation || "").trim();
        const acceptTime = parseTraceDate(trace.acceptTime);
        if (!acceptStation || !acceptTime) continue;
        validTraces.push({
            action: String(trace.action || ""),
            acceptStation,
            acceptTime,
            location: String(trace.location || ""),
        });
    }
    validTraces.sort((left, right) => left.acceptTime.getTime() - right.acceptTime.getTime());
    const latest = validTraces[validTraces.length - 1];
    if (!latest) return null;
    return {
        transportInfo: latest.acceptStation,
        transportTraces: validTraces,
        transportUpdatedAt: latest.acceptTime,
        transportStatus: resolveTransportStatus(latest.acceptStation, state),
    };
};
