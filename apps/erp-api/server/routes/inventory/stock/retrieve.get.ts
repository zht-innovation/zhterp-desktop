import { InventoryHttpError, toBoolean, toText } from "~~/server/services/inventory";
import { useInventoryStockModel } from "~~/server/models/inventoryStock.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const stockModel = useInventoryStockModel();
        const result = toText(query.view) === "restrictions"
            ? await stockModel.restrictionDetails({
                productId: toText(query.productId),
                stockId: toText(query.stockId),
                warehouseId: toText(query.warehouseId),
                locationId: toText(query.locationId),
                includeDescendantLocations: toBoolean(query.includeDescendantLocations, false),
            }, event.context.auth)
            : await stockModel.retrieve({
                productId: toText(query.productId),
                productIds: Array.isArray(query.productIds)
                    ? query.productIds.map((id) => toText(id))
                    : toText(query.productIds)
                        ? toText(query.productIds).split(",").map((id) => id.trim()).filter(Boolean)
                        : undefined,
                keyword: toText(query.keyword),
                categoryId: toText(query.categoryId),
                warehouseId: toText(query.warehouseId),
                locationId: toText(query.locationId),
                stockStatus: toText(query.stockStatus),
                includeAssignedProducts: toBoolean(query.includeAssignedProducts, false),
                paginateAssignedProducts: toBoolean(query.paginateAssignedProducts, false),
                includeDescendantLocations: toBoolean(query.includeDescendantLocations, false),
                includeInTransit: toBoolean(query.includeInTransit, false),
                availableOnly: toBoolean(query.availableOnly, false),
                includeDeleted: query.includeDeleted === "true",
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
        logger.error("Retrieve inventory stock list error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
