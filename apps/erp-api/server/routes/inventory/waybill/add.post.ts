import { getInventoryActor, InventoryHttpError, toText } from "~~/server/services/inventory";
import { readInventoryWaybillPayload } from "~~/server/services/inventoryWaybillPayload";
import { useInventoryWaybillModel } from "~~/server/models/inventoryWaybill.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readInventoryWaybillPayload(event, { defaultAttachments: true });
        if (body && typeof body === "object") {
            delete body.sourceType;
            delete body.sourceOrderId;
            delete body.sourceWaybillId;
        }
        const created = await useInventoryWaybillModel().create(body || {}, getInventoryActor(event));

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                id: toText(created._id),
                detail: created,
            },
        };
    } catch (err: any) {
        logger.error("Create inventory waybill error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
