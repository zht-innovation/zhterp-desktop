import { PurchaseOrder } from "~~/server/models/purchaseOrder.model";
import { InventoryWaybill } from "~~/server/models/inventoryWaybill.model";
import { toText } from "~~/server/services/inventory";
import { notifyWarehousePickup } from "~~/server/services/notification";
import { logger } from "~~/server/utils/logger";
import { buildTransportSnapshot } from "~~/server/services/logisticsTransportStatus";
import {
    saveInventoryTransportSnapshot,
    savePurchaseTransportSnapshot,
} from "~~/server/services/logisticsTransportSync";

type TrackingTrace = {
    action?: string;
    acceptStation: string;
    acceptTime: Date;
    location?: string;
};

const getTrackingConfig = () => {
    const config = useRuntimeConfig();
    return {
        url: toText(config.logisticsTrackingApiUrl),
        apiKey: toText(config.logisticsTrackingApiKey),
    };
};

const parseDate = (value: unknown) => {
    const text = toText(value).trim();
    const normalized = text.replace(
        /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/,
        "$1-$2-$3T$4:$5:$6+08:00",
    );
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
};

const parseTraces = (body: any): TrackingTrace[] => {
    const raw = body?.Traces || body?.traces || body?.data?.Traces || body?.data?.traces || [];
    if (!Array.isArray(raw)) return [];

    const traces: TrackingTrace[] = [];
    for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const acceptStation = toText(item.AcceptStation || item.acceptStation || item.context || item.description);
        const acceptTime = parseDate(item.AcceptTime || item.acceptTime || item.time);
        if (!acceptStation || !acceptTime) continue;

        traces.push({
            action: toText(item.Action || item.action),
            acceptStation,
            acceptTime,
            location: toText(item.Location || item.location),
        });
    }
    return traces.sort((left, right) => left.acceptTime.getTime() - right.acceptTime.getTime());
};

const fetchTraces = async (waybill: any) => {
    const { url, apiKey } = getTrackingConfig();
    if (!url || !apiKey || !toText(waybill.trackingNo)) return [];

    const response = await $fetch<any>(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "X-API-Key": apiKey,
            "Content-Type": "application/json",
        },
        body: {
            trackingNo: toText(waybill.trackingNo),
            courierCompany: toText(waybill.courierCompany || waybill.company),
        },
        timeout: 10_000,
    });
    if (response?.Success === false || response?.success === false
        || response?.data?.Success === false || response?.data?.success === false) return [];
    return parseTraces(response);
};

export const syncPurchaseLogisticsTracking = async () => {
    const { url, apiKey } = getTrackingConfig();
    if (!url || !apiKey) return { skipped: true, updated: 0 };

    const orders = await PurchaseOrder.find({
        _isDeleted: { $ne: true },
        "waybills.0": { $exists: true },
    }).select("orderNo waybills").lean() as any[];
    let updated = 0;

    for (const order of orders) {
        for (const waybill of order.waybills || []) {
            try {
                const traces = await fetchTraces(waybill);
                const snapshot = buildTransportSnapshot(traces);
                if (!snapshot) continue;
                const saved = await savePurchaseTransportSnapshot(
                    toText(order._id), waybill, snapshot, "物流自动同步",
                );
                if (!saved) continue;
                updated += 1;
                if (snapshot.transportStatus === "待取货") {
                    try {
                        await notifyWarehousePickup(order, {
                            ...waybill,
                            transportInfo: snapshot.transportInfo,
                        });
                    } catch (notificationError: any) {
                        logger.warn(
                            `物流取件通知创建失败 ${toText(waybill.trackingNo)}: ${notificationError?.message || notificationError}`,
                        );
                    }
                }
            } catch (error: any) {
                logger.warn(`物流轨迹同步失败 ${toText(waybill.trackingNo)}: ${error?.message || error}`);
            }
        }
    }

    const receiveWaybills = await InventoryWaybill.find({
        direction: "receive",
        sourceType: { $ne: "purchase-logistics" },
        _isDeleted: { $ne: true },
        trackingNo: { $exists: true, $ne: "" },
    }).lean() as any[];
    for (const waybill of receiveWaybills) {
        try {
            const traces = await fetchTraces(waybill);
            const snapshot = buildTransportSnapshot(traces);
            if (!snapshot) continue;
            const saved = await saveInventoryTransportSnapshot(
                waybill, snapshot, "物流自动同步",
            );
            if (!saved) continue;
            updated += 1;
        } catch (error: any) {
            logger.warn(`收件物流轨迹同步失败 ${toText(waybill.trackingNo)}: ${error?.message || error}`);
        }
    }

    return { skipped: false, updated };
};
