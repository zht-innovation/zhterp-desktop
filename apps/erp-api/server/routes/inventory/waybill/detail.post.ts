import { useInventoryWaybillModel } from "~~/server/models/inventoryWaybill.model";
import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { queryKdniao } from "~~/server/services/kdniao";
import { syncTrackingQueryResult } from "~~/server/services/logisticsTransportSync";
import {
    recordLogisticsTrackingQuery,
    retrieveLogisticsTrackingQueries,
} from "~~/server/services/logisticsTrackingAudit";
import { CODE } from "~~/server/utils/code";
import { assertInventoryWaybillFullReadAccess } from "~~/server/services/inventoryWaybillAccess";

export default defineEventHandler(async (event) => {
    try {
        if (!event.context.auth?.username) throw new InventoryHttpError(401, 401, "请先登录");
        await assertInventoryWaybillFullReadAccess(event.context.auth);
        const body = await readBody(event);
        if (body?.action === "track-history") {
            const detail: any = await useInventoryWaybillModel().detail(toText(body.id));
            if (!detail) throw new InventoryHttpError(404, CODE.INVENTORY_NOT_FOUND, "运单不存在");
            setHeader(event, "Cache-Control", "no-store");
            return {
                code: CODE.SUCCESS,
                msg: "查询记录获取成功",
                data: await retrieveLogisticsTrackingQueries("inventory", toText(detail._id), detail.trackingNo),
            };
        }
        if (body?.action !== "track") throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "操作不正确");
        const detail: any = await useInventoryWaybillModel().detail(toText(body.id));
        if (!detail) throw new InventoryHttpError(404, CODE.INVENTORY_NOT_FOUND, "运单不存在");
        await recordLogisticsTrackingQuery({
            context: "inventory",
            recordId: toText(detail._id),
            trackingNo: detail.trackingNo,
            courierCompany: detail.company,
            auth: event.context.auth,
        });
        const result = await queryKdniao(detail.trackingNo, detail.company || "", {
            customerName: typeof body.customerName === "string" ? body.customerName : "",
            shipperCode: typeof body.shipperCode === "string" ? body.shipperCode : "",
            refresh: body.refresh === true,
        });
        const trackingResult = await syncTrackingQueryResult(
            { context: "inventory", waybill: detail },
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
