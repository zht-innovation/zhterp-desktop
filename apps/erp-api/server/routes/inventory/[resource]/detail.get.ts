import {
    InventoryHttpError,
    isInventoryBaseResource,
    toText,
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

        const query = getQuery(event);
        const id = toText(query.id);
        const model = useInventoryBaseModel(resource);
        const detail = await model.detail(id);
        if (!detail) {
            setResponseStatus(event, 404);
            return {
                code: CODE.INVENTORY_NOT_FOUND,
                msg: codeToMsg[CODE.INVENTORY_NOT_FOUND],
            };
        }

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                detail,
            },
        };
    } catch (err: any) {
        logger.error("Retrieve inventory base detail error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
