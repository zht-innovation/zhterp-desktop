import {
    getInventoryActor,
    InventoryHttpError,
    isInventoryBaseResource,
} from "~~/server/services/inventory";
import { useInventoryBaseModel } from "~~/server/models/inventoryBase.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const resource = getRouterParam(event, "resource");
        if (!isInventoryBaseResource(resource)) {
            setResponseStatus(event, 404);
            return {
                code: CODE.INVALID_PARAMS,
                msg: "未知的库存基础资料资源",
            };
        }

        const body = await readBody(event);
        const model = useInventoryBaseModel(resource);
        const created = await model.create(body || {}, getInventoryActor(event));

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                id: created._id.toString(),
                detail: created,
            },
        };
    } catch (err: any) {
        logger.error("Create inventory base resource error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
