import {
    getInventoryActor,
    InventoryHttpError,
    parseIds,
    throwInventoryError,
    toText,
} from "~~/server/services/inventory";
import { useInventoryWaybillModel } from "~~/server/models/inventoryWaybill.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const ids = parseIds(body);
        const waybillModel = useInventoryWaybillModel();
        const records = await Promise.all(ids.map((id) => waybillModel.detail(id)));
        if (records.some((record) => toText(record?.sourceType) === "purchase-logistics")) {
            throwInventoryError(403, CODE.INVALID_PARAMS, "采购运单请在采购单中维护");
        }
        await waybillModel.delete(ids, getInventoryActor(event));

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
        };
    } catch (err: any) {
        logger.error("Delete inventory waybill error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
