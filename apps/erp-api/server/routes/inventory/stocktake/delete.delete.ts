import { getInventoryActor } from "~~/server/services/inventory";
import { useStocktakeModel } from "~~/server/models/inventoryStocktake.model";

export default defineEventHandler(async (event) => {
    const actor = await getInventoryActor(event);
    const body = await readBody(event);

    const ids = body.ids || (body.id ? [body.id] : []);

    await useStocktakeModel().delete(ids, actor);

    return {
        code: 200,
        data: { success: true },
    };
});
