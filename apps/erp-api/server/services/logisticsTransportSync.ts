import { InventoryWaybill } from "~~/server/models/inventoryWaybill.model";
import { PurchaseOrder } from "~~/server/models/purchaseOrder.model";
import { InventoryHttpError, isValidObjectId, toText } from "~~/server/services/inventory";
import { buildTransportSnapshot, type TransportSnapshot } from "~~/server/services/logisticsTransportStatus";
import { CODE } from "~~/server/utils/code";
import type { LogisticsTrackingResult } from "~~/shared/types/logistics";
import { getCourierCode } from "~~/shared/utils/logistics";

type PurchaseTrackingWaybill = {
    _id?: unknown;
    trackingNo?: string;
    courierCompany?: string;
};

type InventoryTrackingWaybill = {
    _id?: unknown;
    trackingNo?: string;
    company?: string;
    direction?: string;
    sourceType?: string;
    sourceOrderId?: unknown;
    sourceWaybillId?: unknown;
};

type TransportSyncTarget =
    | { context: "purchase"; orderId: string; waybill: PurchaseTrackingWaybill }
    | { context: "inventory"; waybill: InventoryTrackingWaybill };

const transportFields = (snapshot: TransportSnapshot, actor: string) => {
    const fields: Record<string, unknown> = {
        transportInfo: snapshot.transportInfo,
        transportTraces: snapshot.transportTraces,
        transportUpdatedAt: snapshot.transportUpdatedAt,
        transportUpdatedBy: actor,
    };
    if (snapshot.transportStatus) fields.transportStatus = snapshot.transportStatus;
    return fields;
};

export const savePurchaseTransportSnapshot = async (
    orderId: string,
    waybill: PurchaseTrackingWaybill,
    snapshot: TransportSnapshot,
    actor: string,
) => {
    if (!isValidObjectId(orderId) || !isValidObjectId(toText(waybill._id)) || !toText(waybill.trackingNo)) return false;

    const fields = transportFields(snapshot, actor);
    const update: Record<string, unknown> = {};
    for (const field of Object.keys(fields)) {
        update[`waybills.$.${field}`] = fields[field];
    }
    const result = await PurchaseOrder.updateOne({
        _id: orderId,
        _isDeleted: { $ne: true },
        waybills: {
            $elemMatch: {
                _id: waybill._id,
                trackingNo: waybill.trackingNo,
                courierCompany: toText(waybill.courierCompany) || { $in: ["", null] },
                $or: [
                    { transportUpdatedAt: null },
                    { transportUpdatedAt: { $lte: snapshot.transportUpdatedAt } },
                ],
            },
        },
    }, { $set: update });
    return result.matchedCount > 0;
};

export const saveInventoryTransportSnapshot = async (
    waybill: InventoryTrackingWaybill,
    snapshot: TransportSnapshot,
    actor: string,
    shipperCode?: string,
): Promise<boolean> => {
    if (waybill.direction !== "receive") return false;
    if (waybill.sourceType === "purchase-logistics") {
        const orderId = toText(waybill.sourceOrderId);
        const waybillId = toText(waybill.sourceWaybillId);
        if (!isValidObjectId(orderId) || !isValidObjectId(waybillId)) return false;
        const order: any = await PurchaseOrder.findOne({
            _id: orderId,
            _isDeleted: { $ne: true },
            "waybills._id": waybillId,
        }).select("waybills").lean();
        const sourceWaybill = order?.waybills?.find((item: PurchaseTrackingWaybill) => toText(item._id) === waybillId);
        if (!sourceWaybill || toText(sourceWaybill.trackingNo).toUpperCase() !== toText(waybill.trackingNo).toUpperCase()) return false;

        // 人工收件可保留快递公司别名，原子更新须使用采购来源中的原值。
        const company = toText(waybill.company);
        const sourceCompany = toText(sourceWaybill.courierCompany);
        if (company !== sourceCompany) {
            const companyCode = getCourierCode(company) || toText(shipperCode).toUpperCase();
            if (!companyCode || companyCode !== getCourierCode(sourceCompany)) return false;
        }
        return await savePurchaseTransportSnapshot(orderId, sourceWaybill, snapshot, actor);
    }
    if (!isValidObjectId(toText(waybill._id)) || !toText(waybill.trackingNo)) return false;

    const result = await InventoryWaybill.updateOne({
        _id: waybill._id,
        direction: "receive",
        sourceType: { $ne: "purchase-logistics" },
        trackingNo: waybill.trackingNo,
        company: toText(waybill.company) || { $in: ["", null] },
        _isDeleted: { $ne: true },
        $or: [
            { transportUpdatedAt: null },
            { transportUpdatedAt: { $lte: snapshot.transportUpdatedAt } },
        ],
    }, { $set: transportFields(snapshot, actor) });
    return result.matchedCount > 0;
};

export const syncTrackingQueryResult = async (
    target: TransportSyncTarget,
    result: LogisticsTrackingResult,
    actor: string,
): Promise<LogisticsTrackingResult> => {
    const response = { ...result, transportStatusSynced: false };
    if (result.status !== "success" || result.stale) return response;
    const snapshot = buildTransportSnapshot(result.traces, result.state);
    if (!snapshot) return response;

    try {
        response.transportStatusSynced = target.context === "purchase"
            ? await savePurchaseTransportSnapshot(target.orderId, target.waybill, snapshot, actor)
            : await saveInventoryTransportSnapshot(target.waybill, snapshot, actor, result.shipperCode);
    } catch {
        throw new InventoryHttpError(500, CODE.SERVER_ERROR, "物流查询成功，但运输状态保存失败，请重试");
    }
    if (snapshot.transportStatus) response.stateLabel = snapshot.transportStatus;
    return response;
};
