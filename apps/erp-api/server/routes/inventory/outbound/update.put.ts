import { getInventoryActor, getInventoryRole, InventoryHttpError, throwInventoryError, toText } from "~~/server/services/inventory";
import { canEditInventoryOutboundRemark } from "~~/shared/utils/adminPermission";
import { useInventoryOutboundModel } from "~~/server/models/inventoryOutbound.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const id = toText(body?.id || body?._id);
        const actor = getInventoryActor(event);
        const allowAppliedRemark = canEditInventoryOutboundRemark(Number(getInventoryRole(event)));
        if (allowAppliedRemark) {
            const hasOtherFields = Object.keys(body || {}).some((key) => !["id", "_id", "remark"].includes(key));
            if (hasOtherFields || typeof body?.remark !== "string") {
                throwInventoryError(403, CODE.INVALID_PARAMS, "库管仅可修改出库单备注");
            }
        }
        const payload = allowAppliedRemark ? { remark: body.remark } : body || {};
        const updated = await useInventoryOutboundModel().update(id, payload, actor, {
            allowAppliedRemark,
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
        logger.error("Update inventory outbound error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
