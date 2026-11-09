import { InventoryHttpError, toBoolean, toText } from "~~/server/services/inventory";
import { useInventoryProductModel } from "~~/server/models/inventoryProduct.model";
import { logger } from "~~/server/utils/logger";
import { canManageInventory } from "~~/shared/utils/adminPermission";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const canViewStandardPrice = canManageInventory(Number(event.context.auth?.role));
        const productModel = useInventoryProductModel();
        const result = await productModel.retrieve({
            ids: query.ids as string | string[] | undefined,
            keyword: toText(query.keyword),
            categoryId: toText(query.categoryId),
            source: toText(query.source),
            unitId: toText(query.unitId),
            warehouseId: toText(query.warehouseId),
            locationId: toText(query.locationId),
            isSaleable: query.isSaleable,
            stockWarning: toText(query.stockWarning),
            includeDeleted: query.includeDeleted === "true",
            includeStock: toBoolean(query.includeStock, false),
            page: Number(query.page || 1),
            limit: Number(query.limit || 20),
        });
        if (!canViewStandardPrice) {
            result.list.forEach((item: any) => {
                delete item.standardPrice;
            });
        }

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        logger.error("Retrieve inventory product list error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
