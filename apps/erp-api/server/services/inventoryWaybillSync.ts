import { useInventoryWaybillModel } from "~~/server/models/inventoryWaybill.model";
import { toText } from "~~/server/services/inventory";
import { logger } from "~~/server/utils/logger";
import { formatPurchaseWaybillGoods } from "~~/server/utils/purchaseWaybillGoods";

type WaybillSyncPayload = {
    company?: unknown;
    direction?: "send" | "receive" | string;
    sourceType?: unknown;
    sourceOrderId?: unknown;
    sourceWaybillId?: unknown;
    trackingNo?: unknown;
    relatedOrderNo?: unknown;
    salesperson?: unknown;
    goods?: unknown;
    businessType?: unknown;
    sentAt?: unknown;
    senderAddress?: unknown;
    receiverAddress?: unknown;
    receiverName?: unknown;
    needsSupplement?: boolean;
    images?: unknown;
    remark?: unknown;
};

const formatWarehouseLabel = (item: any) =>
    [toText(item?.warehouseName), toText(item?.locationName)].filter(Boolean).join(" / ");

const summarizeWarehouses = (items: any[] = []) => {
    const names = items.map(formatWarehouseLabel).filter(Boolean);
    const uniqueNames = [...new Set(names)];
    if (!uniqueNames.length) return "";

    return uniqueNames.length > 1 ? `${uniqueNames[0]}等` : uniqueNames[0];
};

const summarizeGoods = (items: any[] = [], fallback = "货物") => {
    const firstItem = items[0] || {};
    return toText(firstItem.productName)
        || toText(firstItem.model)
        || toText(firstItem.productModel)
        || toText(firstItem.productCode)
        || fallback;
};

const appendAutoRemark = (sourceLabel: string, sourceNo: string, remark?: unknown) => {
    const parts = [`自动同步：${sourceLabel}${sourceNo ? ` ${sourceNo}` : ""}`];
    const extra = toText(remark);
    if (extra) parts.push(extra);

    return parts.join("；");
};

const syncInventoryWaybill = async (
    payload: WaybillSyncPayload,
    actor = "",
    sourceLabel = "",
) => {
    const trackingNo = toText(payload.trackingNo);
    if (!trackingNo) return null;

    try {
        return await useInventoryWaybillModel().upsertByTrackingNo(
            {
                company: toText(payload.company),
                // 未显式表态时保持 undefined，避免把已有记录的方向强翻成 send
                direction: payload.direction,
                sourceType: toText(payload.sourceType),
                sourceOrderId: toText(payload.sourceOrderId),
                sourceWaybillId: toText(payload.sourceWaybillId),
                trackingNo,
                relatedOrderNo: toText(payload.relatedOrderNo),
                salesperson: toText(payload.salesperson) || actor,
                goods: toText(payload.goods),
                businessType: toText(payload.businessType),
                sentAt: payload.sentAt as string | Date | undefined,
                senderAddress: toText(payload.senderAddress),
                receiverAddress: toText(payload.receiverAddress),
                receiverName: toText(payload.receiverName),
                needsSupplement: Boolean(payload.needsSupplement),
                images: Array.isArray(payload.images) ? payload.images : undefined,
                remark: toText(payload.remark),
            },
            actor,
        );
    } catch (err: any) {
        logger.warn(`Sync inventory waybill failed${sourceLabel ? ` (${sourceLabel})` : ""}: ${err?.message || err}`);
        return null;
    }
};

export const syncPurchaseOrderWaybills = async (order: any, actor = "") => {
    const waybills = Array.isArray(order?.waybills) ? order.waybills : [];
    const sourceOrderId = toText(order?._id);
    if (!sourceOrderId) return;
    const activeSourceWaybillIds: string[] = [];

    for (const waybill of waybills) {
        const sourceWaybillId = toText(waybill?._id);
        if (!sourceWaybillId) continue;
        activeSourceWaybillIds.push(sourceWaybillId);
        await syncInventoryWaybill(
            {
                direction: "receive",
                sourceType: "purchase-logistics",
                sourceOrderId,
                sourceWaybillId,
                trackingNo: waybill.trackingNo,
                company: waybill.courierCompany,
                goods: formatPurchaseWaybillGoods(order, waybill),
                businessType: "原材料采购",
                sentAt: order?.purchaseDate || order?.createTime || new Date(),
                relatedOrderNo: order?.orderNo,
                salesperson: order?.buyer || order?.operator,
                receiverName: order?.buyer || order?.operator,
                remark: appendAutoRemark("采购单", toText(order?.orderNo), waybill.remark),
            },
            actor,
            `purchase:${toText(order?.orderNo) || toText(waybill.trackingNo)}`,
        );
    }

    // 渠道关联调整只影响采购单，已生成的运单记录保留用于历史追溯。
    if (order?.purchaseChannel) return;
    try {
        await useInventoryWaybillModel().softDeleteMissingPurchaseWaybills(
            sourceOrderId,
            activeSourceWaybillIds,
            actor,
        );
    } catch (err: any) {
        logger.warn(`Delete stale purchase waybills failed (${sourceOrderId}): ${err?.message || err}`);
    }
};

export const syncAcceptedPurchaseWaybill = async (
    order: any,
    waybill: any,
    acceptanceItems: any[] = [],
    actor = "",
) => {
    const warehouseNames = [...new Set(
        acceptanceItems
            .map((item) => [toText(item?.warehouseName), toText(item?.locationName)].filter(Boolean).join(" / "))
            .filter(Boolean),
    )];

    return await syncInventoryWaybill(
        {
            direction: "receive",
            sourceType: "purchase-logistics",
            sourceOrderId: toText(order?._id),
            sourceWaybillId: toText(waybill?._id),
            trackingNo: waybill?.trackingNo,
            company: waybill?.courierCompany,
            goods: formatPurchaseWaybillGoods(order, {
                ...(waybill?.toObject?.() || waybill),
                acceptanceItems,
            }),
            businessType: "原材料采购",
            sentAt: waybill?.acceptedAt || new Date(),
            relatedOrderNo: order?.orderNo,
            salesperson: order?.buyer || order?.operator || actor,
            receiverAddress: warehouseNames.join("、") || "未填写",
            receiverName: waybill?.acceptedBy || actor,
            remark: appendAutoRemark(
                "采购验收",
                toText(order?.orderNo),
                waybill?.acceptanceRemark || waybill?.remark,
            ),
        },
        actor,
        `purchase-acceptance:${toText(order?.orderNo)}:${toText(waybill?.trackingNo)}`,
    );
};

export const syncInboundWaybill = async (order: any, actor = "") => {
    const trackingNo = toText(order?.trackingNo);
    if (!trackingNo) return;

    // 采购运单已由采购单同步为收件记录，普通入库单不重复生成。
    if (toText(order?.type) === "采购") return;

    const businessTypeMap: Record<string, string> = {
        采购: "原材料采购",
        售出退货: "售后（退换/返修）",
        生产: "业务往来",
        外包: "业务往来",
        期初建账: "其他",
        盘盈入库: "其他",
    };

    await syncInventoryWaybill(
        {
            trackingNo,
            company: order?.courierCompany,
            direction: undefined,
            sourceType: "inventory-inbound",
            goods: summarizeGoods(order?.items || [], "入库货物"),
            businessType: businessTypeMap[toText(order?.type)] || "其他",
            sentAt: order?.inboundDate || order?.createTime || new Date(),
            relatedOrderNo: order?.purchaseOrderNo || order?.processingOrderNo || order?.orderNo || order?.relatedNo || order?.inboundNo,
            salesperson: order?.handler,
            receiverAddress: summarizeWarehouses(order?.items || []),
            receiverName: order?.handler,
            remark: appendAutoRemark("入库单", toText(order?.inboundNo), order?.remark),
        },
        actor,
        `inbound:${toText(order?.inboundNo) || trackingNo}`,
    );
};

export const syncTransferWaybill = async (order: any, actor = "") => {
    const trackingNo = toText(order?.trackingNo);
    if (!trackingNo) return;

    await syncInventoryWaybill(
        {
            trackingNo,
            company: order?.courierCompany,
            sourceType: "inventory-transfer",
            goods: summarizeGoods(order?.items || [], "调拨货物"),
            businessType: "业务往来",
            sentAt: order?.transferDate || order?.createTime || new Date(),
            senderAddress: summarizeWarehouses(order?.items || []),
            receiverAddress: order?.borrower,
            receiverName: order?.borrower,
            relatedOrderNo: order?.transferNo,
            salesperson: order?.handler,
            remark: appendAutoRemark("调拨单", toText(order?.transferNo), order?.remark),
        },
        actor,
        `transfer:${toText(order?.transferNo) || trackingNo}`,
    );
};
