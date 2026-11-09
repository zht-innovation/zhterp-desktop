import {
    getInventoryActor,
    getInventoryRole,
    InventoryHttpError,
    throwInventoryError,
    toText,
} from "~~/server/services/inventory";
import { canEditInventoryInbound } from "~~/shared/utils/adminPermission";
import { useInventoryInboundModel } from "~~/server/models/inventoryInbound.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const id = toText(body?.id || body?._id);
        const actor = getInventoryActor(event);
        const role = getInventoryRole(event);
        const canEditInbound = canEditInventoryInbound(Number(role));
        if (!canEditInbound) {
            throwInventoryError(403, CODE.INVALID_PARAMS, "当前角色没有入库单编辑权限");
        }

        const updated = await useInventoryInboundModel().update(id, body || {}, actor, {
            allowAppliedMutation: canEditInbound,
        });

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                id: toText(updated?._id),
                detail: updated,
            },
        };
    } catch (err: any) {
        logger.error("Update inventory inbound error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
