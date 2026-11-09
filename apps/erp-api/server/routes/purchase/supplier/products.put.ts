import {
    getInventoryActor,
    InventoryHttpError,
    throwInventoryError,
    toText,
} from "~~/server/services/inventory";
import { usePurchaseSupplierModel } from "~~/server/models/purchaseSupplier.model";
import { logger } from "~~/server/utils/logger";
import { requirePurchaseSupplierAccess } from "~~/server/utils/purchaseSupplierPermission";

export default defineEventHandler(async (event) => {
    requirePurchaseSupplierAccess(event);

    try {
        const body = await readBody(event);
        if (body?.mode !== undefined && body.mode !== "append") {
            throwInventoryError(400, CODE.INVALID_PARAMS, "不支持的关联保存模式");
        }
        const supplierModel = usePurchaseSupplierModel();
        const supplierId = toText(body?.supplierId);
        const productIds = Array.isArray(body?.productIds) ? body.productIds : [];
        const actor = getInventoryActor(event);
        const result = body?.mode === "append"
            ? await supplierModel.appendProducts(supplierId, productIds, actor)
            : await supplierModel.saveProducts(supplierId, productIds, actor);

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        logger.error("Save purchase supplier products error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
