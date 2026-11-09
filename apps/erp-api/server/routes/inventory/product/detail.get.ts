import { InventoryHttpError, toBoolean, toText } from "~~/server/services/inventory";
import { useInventoryBomModel } from "~~/server/models/inventoryBom.model";
import { useInventoryProductModel } from "~~/server/models/inventoryProduct.model";
import { logger } from "~~/server/utils/logger";
import { canManageInventory } from "~~/shared/utils/adminPermission";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const id = toText(query.id);
        const canViewStandardPrice = canManageInventory(Number(event.context.auth?.role));
        const productModel = useInventoryProductModel();
        const product = await productModel.detail(id);
        if (!product) {
            setResponseStatus(event, 404);
            return {
                code: CODE.INVENTORY_NOT_FOUND,
                msg: codeToMsg[CODE.INVENTORY_NOT_FOUND],
            };
        }
        if (!canViewStandardPrice) {
            delete (product as any).standardPrice;
        }

        const data: Record<string, any> = { detail: product };
        if (toBoolean(query.includeBom, false)) {
            data.bomStructure = await useInventoryBomModel().getProductStructure(id);
        }

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data,
        };
    } catch (err: any) {
        logger.error("Retrieve inventory product detail error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
