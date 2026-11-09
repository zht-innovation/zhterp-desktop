import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { useInventoryWaybillModel } from "~~/server/models/inventoryWaybill.model";
import { logger } from "~~/server/utils/logger";
import {
    assertInventoryWaybillReadView,
    getInventoryWaybillReadScope,
    sanitizeInventoryWaybillForRead,
} from "~~/server/services/inventoryWaybillAccess";
import {
    attachPurchaseLogisticsToWaybills,
    retrievePurchaseLogistics,
} from "~~/server/services/purchaseLogistics";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const scope = await getInventoryWaybillReadScope(event.context.auth);
        assertInventoryWaybillReadView(scope, query);
        if (toText(query.view) === "purchase-logistics") {
            const result = await retrievePurchaseLogistics({
                keyword: toText(query.keyword),
                transportStatus: toText(query.transportStatus) as any,
                acceptanceStatus: toText(query.acceptanceStatus) as any,
                page: Number(query.page || 1),
                limit: Number(query.limit || 20),
            });

            setResponseStatus(event, 200);
            return {
                code: CODE.SUCCESS,
                msg: codeToMsg[CODE.SUCCESS],
                data: result,
            };
        }
        const direction = toText(query.direction);
        const result = await useInventoryWaybillModel().retrieve({
            keyword: toText(query.keyword),
            company: toText(query.company),
            businessType: toText(query.businessType),
            direction,
            relatedOrderNo: toText(query.relatedOrderNo),
            trackingNo: toText(query.trackingNo),
            salesperson: toText(query.salesperson),
            sortOrder: toText(query.sortOrder),
            startDate: toText(query.startDate),
            endDate: toText(query.endDate),
            includeDeleted: query.includeDeleted === "true",
            ids: query.ids as string | string[] | undefined,
            page: Number(query.page || 1),
            limit: Number(query.limit || 20),
        }, scope);
        result.list = await attachPurchaseLogisticsToWaybills(result.list);
        if (scope.relatedOrderNos !== undefined) {
            result.list = result.list.map((item: any) => sanitizeInventoryWaybillForRead(item, scope));
        }
        setHeader(event, "Cache-Control", "no-store");

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        logger.error("Retrieve inventory waybill list error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
