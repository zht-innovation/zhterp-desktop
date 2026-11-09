import { getInventoryActor, InventoryHttpError, toText } from "~~/server/services/inventory";
import { useInventoryInboundModel } from "~~/server/models/inventoryInbound.model";
import { InventoryStock } from "~~/server/models/inventoryStock.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        const created = await useInventoryInboundModel().create(body || {}, getInventoryActor(event));
        const items = Array.isArray(created?.items) ? created.items : [];
        const availableQuantities = await Promise.all(items.map(async (item: any) => {
            const stock = await InventoryStock.findOne({
                productId: item.productId,
                warehouseId: item.warehouseId,
                _isDeleted: { $ne: true },
            }).select("productId warehouseId quantity lockedQuantity").lean();
            return {
                productId: item.productId?.toString?.() || "",
                warehouseId: item.warehouseId?.toString?.() || "",
                quantity: Math.max(Number(stock?.quantity || 0) - Number(stock?.lockedQuantity || 0), 0),
            };
        }));

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                id: toText(created?._id),
                detail: created,
                availableQuantities,
            },
        };
    } catch (err: any) {
        logger.error("Create inventory inbound error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
