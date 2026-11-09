import { usePurchaseOrderModel } from "~~/server/models/purchaseOrder.model";
import { InventoryHttpError, isValidObjectId, toText } from "~~/server/services/inventory";
import { resolveTaobaoOrders } from "~~/server/services/taobaoCollector";
import { queryKdniao } from "~~/server/services/kdniao";
import { syncTrackingQueryResult } from "~~/server/services/logisticsTransportSync";
import {
    recordLogisticsTrackingQuery,
    retrieveLogisticsTrackingQueries,
} from "~~/server/services/logisticsTrackingAudit";
import { canManagePurchaseOrder } from "~~/shared/utils/adminPermission";
import { CODE } from "~~/server/utils/code";
import { getPurchaseVisibilityScope } from "~~/server/services/purchaseVisibility";

export default defineEventHandler(async (event) => {
    try {
        if (!event.context.auth?.username) throw new InventoryHttpError(401, 401, "请先登录");
        const body = await readBody(event);
        if (body?.action === "resolve-taobao") {
            if (!canManagePurchaseOrder(Number(event.context.auth.role))) {
                throw new InventoryHttpError(403, 403, "无采购单管理权限");
            }
            return { code: CODE.SUCCESS, msg: "查询完成", data: await resolveTaobaoOrders(body.platformOrderNos) };
        }
        if (body?.action === "track-history" && isValidObjectId(toText(body?.id))) {
            const trackingNo = toText(body.trackingNo).trim().toUpperCase();
            const scope = await getPurchaseVisibilityScope(event.context.auth);
            const order: any = await usePurchaseOrderModel().detail({ id: toText(body.id) }, scope);
            const waybill = order?.waybills?.find((item: any) => String(item.trackingNo).trim().toUpperCase() === trackingNo);
            if (!waybill) throw new InventoryHttpError(404, CODE.INVENTORY_NOT_FOUND, "采购单中不存在此运单");
            setHeader(event, "Cache-Control", "no-store");
            return {
                code: CODE.SUCCESS,
                msg: "查询记录获取成功",
                data: await retrieveLogisticsTrackingQueries("purchase", toText(order._id), waybill.trackingNo),
            };
        }
        if (body?.action !== "track" || !isValidObjectId(toText(body?.id))) {
            throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "操作或采购单ID不正确");
        }
        const scope = await getPurchaseVisibilityScope(event.context.auth);
        const order: any = await usePurchaseOrderModel().detail({ id: toText(body.id) }, scope);
        const trackingNo = toText(body.trackingNo).trim().toUpperCase();
        const waybill = order?.waybills?.find((item: any) => String(item.trackingNo).trim().toUpperCase() === trackingNo);
        if (!waybill) throw new InventoryHttpError(404, CODE.INVENTORY_NOT_FOUND, "采购单中不存在此运单");
        await recordLogisticsTrackingQuery({
            context: "purchase",
            recordId: toText(order._id),
            trackingNo: waybill.trackingNo,
            courierCompany: waybill.courierCompany,
            auth: event.context.auth,
        });
        const result = await queryKdniao(waybill.trackingNo, waybill.courierCompany || "", {
            customerName: typeof body.customerName === "string" ? body.customerName : "",
            shipperCode: typeof body.shipperCode === "string" ? body.shipperCode : "",
            refresh: body.refresh === true,
        });
        const trackingResult = await syncTrackingQueryResult(
            { context: "purchase", orderId: toText(order._id), waybill },
            result,
            toText(event.context.auth.nickname || event.context.auth.username),
        );
        setHeader(event, "Cache-Control", "no-store");
        return { code: CODE.SUCCESS, msg: "查询完成", data: trackingResult };
    } catch (error: any) {
        const known = error instanceof InventoryHttpError;
        setResponseStatus(event, known ? error.status : 500);
        return { code: known ? error.code : CODE.SERVER_ERROR, msg: known ? error.message : "物流查询失败，请稍后重试" };
    }
});
