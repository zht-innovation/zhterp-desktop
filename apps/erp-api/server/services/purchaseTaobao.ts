import { InventoryHttpError } from "~~/server/services/inventory";
import { normalizePlatformOrderNos, resolveTaobaoOrders } from "~~/server/services/taobaoCollector";
import { CODE } from "~~/server/utils/code";
import { omitLegacyPurchaseWaybillQuantity } from "~~/server/utils/purchaseWaybillGoods";

const isAccepted = (waybill: any) => ["验收正常", "验收异常"].includes(waybill.acceptanceStatus);
const keyOf = (waybill: any) => String(waybill.trackingNo || "").trim().toUpperCase();

export const applyPurchaseChannel = async (
    data: Record<string, any>,
    payload: Record<string, any>,
    current: any,
    partial: boolean,
) => {
    const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);
    if (partial && !["purchaseChannel", "platformOrderNos", "waybills"].some(has)) return;
    const channel = has("purchaseChannel") ? payload.purchaseChannel : current?.purchaseChannel || (!partial ? "taobao" : "");
    if (!channel && partial && !has("purchaseChannel") && !has("platformOrderNos")) return;
    if (channel !== "taobao" && channel !== "other") {
        throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "请选择淘宝或其他购买渠道");
    }
    const currentWaybills: any[] = (current?.waybills || []).map(omitLegacyPurchaseWaybillQuantity);
    const currentByKey = new Map(currentWaybills.map((item) => [keyOf(item), item.toObject?.() || item]));
    const incoming: any[] = (data.waybills || currentWaybills).map(omitLegacyPurchaseWaybillQuantity);
    const clientAuto = new Set((Array.isArray(payload.waybills) ? payload.waybills : [])
        .filter((item: any) => item.source === "taobao").map(keyOf));
    const manual: any[] = [];
    for (const item of incoming) {
        const saved = currentByKey.get(keyOf(item));
        if (saved?.source === "taobao" || (!saved && clientAuto.has(keyOf(item)))) continue;
        manual.push({ ...item, source: "manual" });
    }
    data.purchaseChannel = channel;
    if (channel === "other") {
        if (manual.some((item) => !String(item.courierCompany || "").trim())) {
            throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "请为已填写的运单选择快递公司");
        }
        if (currentWaybills.some((item) => item.source === "taobao" && isAccepted(item))) {
            throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "已验收的淘宝运单不可通过切换渠道解除关联");
        }
        if (Array.isArray(data.items)) {
            for (const item of data.items) item.platformOrderNos = [];
        }
        Object.assign(data, {
            platformOrderNos: [], taobaoSyncStatus: "not_applicable", taobaoSyncMessage: "",
            taobaoUnmatchedOrderNos: [], taobaoSyncedAt: null,
            waybills: manual.map((item) => ({ ...item, accountKey: "", platformOrderNos: [] })),
        });
        return;
    }

    const itemOrderNos = Array.isArray(payload.items)
        ? payload.items.flatMap((item: any) => Array.isArray(item?.platformOrderNos) ? item.platformOrderNos : [])
        : [];
    if (has("platformOrderNos") && !Array.isArray(payload.platformOrderNos)) {
        throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "淘宝订单号必须是字符串数组");
    }
    const orderNos = normalizePlatformOrderNos(
        has("platformOrderNos") || itemOrderNos.length
            ? [...(has("platformOrderNos") ? payload.platformOrderNos : []), ...itemOrderNos]
            : current?.platformOrderNos || [],
    );
    const orderNoSet = new Set(orderNos);
    for (const item of manual) {
        item.platformOrderNos = (item.platformOrderNos || []).filter((orderNo: string) => orderNoSet.has(orderNo));
        if (!item.platformOrderNos.length) item.accountKey = "";
    }
    const oldAuto = currentWaybills.filter((item) => item.source === "taobao");
    for (const item of oldAuto) {
        if (isAccepted(item) && (item.platformOrderNos || []).some((orderNo: string) => !orderNoSet.has(orderNo))) {
            throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "已验收的淘宝运单不可解除订单关联");
        }
    }
    const match = await resolveTaobaoOrders(orderNos);
    const merged = new Map<string, any>(manual.map((item) => [keyOf(item), item]));
    // 同步失败保留全部旧运单；成功时也保留仍与当前订单关联的旧运单，避免部分采集误删。
    for (const savedValue of oldAuto) {
        const saved = savedValue.toObject?.() || savedValue;
        const links = (saved.platformOrderNos || []).filter((orderNo: string) => orderNoSet.has(orderNo));
        if (match.status === "error" || links.length || isAccepted(saved)) {
            if (!merged.has(keyOf(saved))) merged.set(keyOf(saved), { ...saved, platformOrderNos: links.length ? links : saved.platformOrderNos });
        }
    }
    for (const item of match.waybills) {
        const key = keyOf(item);
        const existing = merged.get(key) || currentByKey.get(key);
        merged.set(key, {
            ...existing,
            ...omitLegacyPurchaseWaybillQuantity(item),
            courierCompany: existing?.courierCompany || item.courierCompany,
            source: existing?.source === "manual" ? "manual" : "taobao",
            remark: existing?.remark || "",
            productIds: existing?.productIds?.length
                ? existing.productIds
                : (data.items || current?.items || []).map((product: any) => product.productId),
            platformOrderNos: [...new Set([...(existing?.platformOrderNos || []).filter((orderNo: string) => orderNoSet.has(orderNo)), ...item.platformOrderNos])],
        });
    }
    // 行级订单号与整单并集保持一致：整单移除的号（如其他弹窗只发改单级）同步从行级清掉。
    if (Array.isArray(data.items)) {
        for (const item of data.items) {
            item.platformOrderNos = (item.platformOrderNos || []).filter((orderNo: string) => orderNoSet.has(orderNo));
        }
    }
    Object.assign(data, {
        platformOrderNos: orderNos,
        taobaoSyncStatus: match.status,
        taobaoSyncMessage: match.message,
        taobaoUnmatchedOrderNos: match.unmatchedOrderNos,
        taobaoSyncedAt: new Date(match.matchedAt),
        waybills: [...merged.values()],
    });
};
