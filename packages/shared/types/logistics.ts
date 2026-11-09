export type PurchaseChannel = "taobao" | "other";
export type TaobaoSyncStatus = "pending" | "partial" | "matched" | "error" | "not_applicable";

export interface MatchedTaobaoWaybill {
    trackingNo: string;
    courierCompany: string;
    source: "taobao";
    accountKey: string;
    platformOrderNos: string[];
}

export interface TaobaoMatchResult {
    status: TaobaoSyncStatus;
    message: string;
    matchedAt: string;
    unmatchedOrderNos: string[];
    waybills: MatchedTaobaoWaybill[];
}

export interface LogisticsTrace {
    acceptTime: string;
    acceptStation: string;
    location: string;
    action: string;
}

export interface LogisticsTrackingResult {
    trackingNo: string;
    shipperCode: string;
    status: "success" | "no_traces" | "needs_input" | "not_configured" | "error";
    message: string;
    state: string;
    stateLabel: string;
    location: string;
    traces: LogisticsTrace[];
    queriedAt: string | null;
    cached: boolean;
    stale: boolean;
    retryAfter: number;
    transportStatusSynced?: boolean;
}

export interface LogisticsTrackingOptions {
    customerName?: string;
    shipperCode?: string;
    refresh?: boolean;
}

export interface LogisticsTrackingAuditRecord {
    trackingNo: string;
    courierCompany: string;
    username: string;
    userName: string;
    queriedAt: string | Date;
}
