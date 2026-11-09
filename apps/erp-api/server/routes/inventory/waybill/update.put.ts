import {
    getInventoryActor,
    getInventoryRole,
    InventoryHttpError,
    throwInventoryError,
    toText,
} from "~~/server/services/inventory";
import { readInventoryWaybillPayload } from "~~/server/services/inventoryWaybillPayload";
import { useInventoryWaybillModel } from "~~/server/models/inventoryWaybill.model";
import { logger } from "~~/server/utils/logger";
import { canAcceptPurchaseLogistics } from "~~/shared/utils/adminPermission";
import { CODE, codeToMsg } from "~~/server/utils/code";
import {
    acceptPurchaseLogistics,
} from "~~/server/services/purchaseLogistics";

export default defineEventHandler(async (event) => {
    try {
        const body = await readInventoryWaybillPayload(event);
        const operation = toText(body?.operation);
        if (operation === "updatePurchaseTransport") {
            throwInventoryError(403, CODE.INVALID_PARAMS, "运输信息由物流接口自动同步，不支持手动修改");
        }
        if (operation === "acceptPurchaseTransport") {
            if (!canAcceptPurchaseLogistics(Number(getInventoryRole(event)))) {
                throwInventoryError(403, CODE.INVALID_PARAMS, "仅超级管理员和库管可填写验收单");
            }
            const actor = getInventoryActor(event);
            const detail = await acceptPurchaseLogistics(body, actor);

            setResponseStatus(event, 200);
            return {
                code: CODE.SUCCESS,
                msg: codeToMsg[CODE.SUCCESS],
                data: { detail },
            };
        }
        const id = toText(body?.id || body?._id);
        const waybillModel = useInventoryWaybillModel();
        const current = await waybillModel.detail(id);
        if (toText(current?.sourceType) === "purchase-logistics") {
            throwInventoryError(403, CODE.INVALID_PARAMS, "采购运单请在采购单和验收单中维护");
        }
        if (body && typeof body === "object") {
            delete body.sourceType;
            delete body.sourceOrderId;
            delete body.sourceWaybillId;
        }
        const updated = await waybillModel.update(id, body || {}, getInventoryActor(event));

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                id: toText(updated._id),
                detail: updated,
            },
        };
    } catch (err: any) {
        logger.error("Update inventory waybill error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
