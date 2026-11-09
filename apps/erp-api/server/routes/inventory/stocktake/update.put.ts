import { getInventoryActor, InventoryHttpError } from "~~/server/services/inventory";
import { useStocktakeModel } from "~~/server/models/inventoryStocktake.model";
import {
    assertInventoryOrderReviewAccess,
    saveInventoryOrderReview,
} from "~~/server/services/inventoryOrderReview";

export default defineEventHandler(async (event) => {
    const actor = await getInventoryActor(event);
    const body = await readBody(event);

    // 必须携带 scene，订单复核草稿不会更新真实盘点单。
    if (body?.scene === "order-review") {
        try {
            await assertInventoryOrderReviewAccess(event);
            const detail = await saveInventoryOrderReview(body, actor, false);
            return {
                code: 200,
                data: { detail },
            };
        } catch (error) {
            if (!(error instanceof InventoryHttpError)) throw error;
            setResponseStatus(event, error.status);
            return { code: error.code, msg: error.message };
        }
    }

    const { id, ...payload } = body;

    const stocktake = await useStocktakeModel().update(id, payload, actor);

    return {
        code: 200,
        data: { detail: stocktake },
    };
});
