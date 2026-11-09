import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { useInventoryInboundModel } from "~~/server/models/inventoryInbound.model";
import { listProductionInboundSalesOrderCandidates } from "~~/server/services/salesOrderFulfillment";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const result = toText(query.view) === "sales-order-candidates"
            ? await listProductionInboundSalesOrderCandidates({
                keyword: toText(query.keyword),
                page: Number(query.page || 1),
                limit: Number(query.limit || 30),
            })
            : await useInventoryInboundModel().retrieve({
                keyword: toText(query.keyword),
                type: toText(query.type),
                inboundDate: toText(query.inboundDate),
                startDate: toText(query.startDate),
                endDate: toText(query.endDate),
                includeDeleted: query.includeDeleted === "true",
                ids: query.ids as string | string[] | undefined,
                page: Number(query.page || 1),
                limit: Number(query.limit || 20),
            });

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        logger.error("Retrieve inventory inbound list error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
