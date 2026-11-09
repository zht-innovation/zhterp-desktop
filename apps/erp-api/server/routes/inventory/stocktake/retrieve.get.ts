import { getInventoryActor, InventoryHttpError } from "~~/server/services/inventory";
import { useStocktakeModel } from "~~/server/models/inventoryStocktake.model";
import {
    assertInventoryOrderReviewAccess,
    retrieveInventoryOrderReviews,
} from "~~/server/services/inventoryOrderReview";

export default defineEventHandler(async (event) => {
    await getInventoryActor(event);

    const query = getQuery(event);

    // 复用已登记认证的仓储入口，scene 不可省略，避免误调真实盘点业务。
    if (query.scene === "order-review") {
        try {
            await assertInventoryOrderReviewAccess(event);
            return {
                code: 200,
                data: await retrieveInventoryOrderReviews(query),
            };
        } catch (error) {
            if (!(error instanceof InventoryHttpError)) throw error;
            setResponseStatus(event, error.status);
            return { code: error.code, msg: error.message };
        }
    }

    const result = await useStocktakeModel().retrieve({
        keyword: query.keyword as string || "",
        createDate: query.createDate as string || "",
        warehouseId: query.warehouseId as string || "",
        status: query.status as string || "",
        page: Number(query.page) || 1,
        limit: Number(query.limit) || 20,
    });

    return {
        code: 200,
        data: result,
    };
});
