import type { InventoryApiResponse } from "~/composables/api/useInventoryApi";
import type {
    LogisticsTrackingAuditRecord,
    LogisticsTrackingOptions,
    LogisticsTrackingResult,
} from "~~/shared/types/logistics";

export const queryLogisticsTracking = (
    context: "purchase" | "inventory",
    id: string,
    trackingNo: string,
    options: LogisticsTrackingOptions,
) => $fetch<InventoryApiResponse<LogisticsTrackingResult>>(
    context === "purchase" ? "/purchase/order/detail" : "/inventory/waybill/detail",
    {
        method: "POST",
        headers: { Token: getToken() || "" },
        body: { action: "track", id, trackingNo, ...options },
    },
);

export const retrieveLogisticsTrackingHistory = (
    context: "purchase" | "inventory",
    id: string,
    trackingNo: string,
) => $fetch<InventoryApiResponse<LogisticsTrackingAuditRecord[]>>(
    context === "purchase" ? "/purchase/order/detail" : "/inventory/waybill/detail",
    {
        method: "POST",
        headers: { Token: getToken() || "" },
        body: { action: "track-history", id, trackingNo },
    },
);
