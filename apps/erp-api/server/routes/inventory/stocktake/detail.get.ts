import { getInventoryActor, InventoryHttpError, isValidObjectId, throwInventoryError, toText } from "~~/server/services/inventory";
import { useStocktakeModel } from "~~/server/models/inventoryStocktake.model";
import { CODE } from "~~/server/utils/code";
import {
    assertInventoryOrderReviewAccess,
    getInventoryOrderReviewDetail,
} from "~~/server/services/inventoryOrderReview";

export default defineEventHandler(async (event) => {
    await getInventoryActor(event);

    const query = getQuery(event);

    // 订单复核和真实盘点使用独立模型，通过 scene 明确分派。
    if (query.scene === "order-review") {
        try {
            await assertInventoryOrderReviewAccess(event);
            const detail = await getInventoryOrderReviewDetail(toText(query.id));
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

    const id = query.id as string;

    if (!id || !isValidObjectId(id)) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "id 格式错误");
    }

    const detail = await useStocktakeModel().detail(id);

    if (!detail) {
        throwInventoryError(404, CODE.INVENTORY_NOT_FOUND);
    }

    return {
        code: 200,
        data: { detail },
    };
});
