import mongoose from "mongoose";
import { useNotificationModel } from "~~/server/models/notification.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import {
    addNotificationWithAudience,
    resolveNotificationRecipients,
    upsertNotificationWithAudience,
} from "~~/server/services/notificationAudience";
import { logger } from "~~/server/utils/logger";

/**
 * 订单审核通过后，为采购部门创建采购提醒通知
 */
export function notifyProcurementAfterApproval(order: {
    _id: any
    orderNo: string
}) {
    return addNotificationWithAudience({
        type: "notification",
        category: "采购提醒",
        title: `【采购提醒】销售订单 ${order.orderNo} 已审核通过`,
        content: "请核对物料库存并安排采购。",
        relatedId: String(order._id),
        relatedPath: "/configuration/purchase/material-pool",
    }).catch(() => {}) // 通知失败不影响主流程
}

/**
 * 订单终审通过后，创建仓库复核提醒通知。
 */
export async function notifyWarehouseAfterApproval(
    order: {
        _id: any;
        orderNo: string;
    },
    sourceApprovalId: string,
) {
    const model = useNotificationModel();
    try {
        const recipientAdminIds = await resolveNotificationRecipients("库存核对");
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                // 与删除、恢复和彻底删除争用同一订单，防止延迟提醒重新出现。
                const currentOrder = await useSalesOrderModel().order.findOneAndUpdate(
                    { _id: order._id },
                    { $inc: { inventoryReviewVersion: 1 } },
                    { new: true, session, timestamps: false },
                ).select("_isDeleted").lean();
                if (!currentOrder) return;

                await model.upsertInventoryCheckNotification({
                    type: "notification",
                    category: "库存核对",
                    title: `【仓库复核】销售订单 ${order.orderNo} 待复核`,
                    content: `销售订单 ${order.orderNo} 已全部审核通过，请前往“仓储管理 → 仓库复核”进行复核。`,
                    relatedId: String(order._id),
                    relatedPath: "/configuration/inventory/review",
                    sourceApprovalId,
                    recipientAdminIds: recipientAdminIds || [],
                    ...(currentOrder._isDeleted === true ? {
                        _isFakeDel: true,
                        salesOrderDeletionId: String(order._id),
                    } : {}),
                }, session);
            });
        } finally {
            await session.endSession();
        }
    } catch (error) {
        logger.error(
            `Create inventory check notification failed; approvalId=${sourceApprovalId}, orderId=${String(order._id)}`,
            error as Error,
        );
        throw error;
    }
}

const toNotificationText = (value: unknown) => String(value ?? "").trim();

const buildPurchaseLogisticsSourceKey = (
    event: "pickup" | "acceptance-exception",
    order: { _id: any },
    waybill: { _id: any },
) => `purchase-logistics:${event}:${String(order._id)}:${String(waybill._id)}`;

export const notifyWarehousePickup = async (
    order: { _id: any; orderNo?: unknown },
    waybill: {
        _id: any;
        trackingNo?: unknown;
        courierCompany?: unknown;
        transportInfo?: unknown;
    },
) => {
    const orderNo = toNotificationText(order.orderNo) || "--";
    const trackingNo = toNotificationText(waybill.trackingNo) || "--";
    const courierCompany = toNotificationText(waybill.courierCompany) || "未知物流";
    const transportInfo = toNotificationText(waybill.transportInfo);
    const detail = transportInfo ? `最新物流：${transportInfo}。` : "";

    return await upsertNotificationWithAudience({
        type: "notification",
        category: "物流取件",
        title: `【取件提醒】采购运单 ${trackingNo} 待取货`,
        content: `采购单 ${orderNo}，${courierCompany}运单 ${trackingNo} 已待取货。${detail}请及时安排取件并填写验收单。`,
        relatedId: String(order._id),
        relatedPath: "/configuration/inventory/waybill?direction=receive",
        sourceKey: buildPurchaseLogisticsSourceKey("pickup", order, waybill),
    });
};

export const notifyFinanceAcceptanceException = async (
    order: { _id: any; orderNo?: unknown },
    waybill: {
        _id: any;
        trackingNo?: unknown;
        acceptanceItems?: any[];
        acceptanceRemark?: unknown;
    },
) => {
    const orderNo = toNotificationText(order.orderNo) || "--";
    const trackingNo = toNotificationText(waybill.trackingNo) || "--";
    const exceptionItems = (waybill.acceptanceItems || []).filter(
        (item: any) => Number(item?.expectedQuantity || 0) !== Number(item?.inboundQuantity || 0),
    );
    const exceptionSummary = exceptionItems.slice(0, 3).map((item: any) => {
        const productName = toNotificationText(item?.productName)
            || toNotificationText(item?.productModel)
            || toNotificationText(item?.productCode)
            || "未命名货品";
        return `${productName}：应收 ${Number(item?.expectedQuantity || 0)}，实际入库 ${Number(item?.inboundQuantity || 0)}`;
    });
    if (exceptionItems.length > 3) {
        exceptionSummary.push(`等 ${exceptionItems.length} 项异常`);
    }
    const remark = toNotificationText(waybill.acceptanceRemark);
    const contentParts = [
        `采购单 ${orderNo}，运单 ${trackingNo} 验收异常。`,
        exceptionSummary.length ? exceptionSummary.join("；") : "应收数量与实际入库数量不一致。",
    ];
    if (remark) contentParts.push(`验收备注：${remark}`);

    return await upsertNotificationWithAudience({
        type: "notification",
        category: "物流验收异常",
        title: `【验收异常】采购单 ${orderNo} 运单 ${trackingNo}`,
        content: contentParts.join(" "),
        relatedId: String(order._id),
        relatedPath: "/configuration/inventory/waybill?direction=receive",
        sourceKey: buildPurchaseLogisticsSourceKey("acceptance-exception", order, waybill),
    });
};
