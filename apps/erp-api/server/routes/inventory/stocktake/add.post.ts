import { getInventoryActor } from "~~/server/services/inventory";
import { useStocktakeModel } from "~~/server/models/inventoryStocktake.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    const actor = await getInventoryActor(event);
    const body = await readBody(event);

    logger.info("[创建盘点单] 收到请求, items数量:", body.items?.length);
    logger.info("[创建盘点单] items数据:", JSON.stringify(body.items?.slice(0, 3)));

    try {
        const stocktake = await useStocktakeModel().create(body, actor);

        logger.info("[创建盘点单] 成功, id:", stocktake._id, "保存的items数量:", stocktake.items?.length);

        return {
            code: 200,
            data: { detail: stocktake },
        };
    } catch (err: any) {
        logger.error("[创建盘点单] 失败:", err.message);
        throw err;
    }
});
