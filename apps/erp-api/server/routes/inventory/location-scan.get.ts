import {
    escapeRegExp,
    InventoryHttpError,
    throwInventoryError,
    toText,
} from "~~/server/services/inventory";
import {
    assertInventoryLocationLeaf,
    getInventoryLocationPathName,
    InventoryLocation,
} from "~~/server/models/inventoryBase.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const code = toText(getQuery(event).code);
        if (!code) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "请扫描或输入仓位码");
        }

        const locations = await InventoryLocation
            .find({
                code: new RegExp(`^${escapeRegExp(code)}$`, "i"),
                _isDeleted: { $ne: true },
            })
            .lean() as any[];

        if (!locations.length) {
            throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, `未找到仓位：${code}`);
        }
        if (locations.length > 1) {
            throwInventoryError(409, CODE.INVENTORY_DUPLICATE_CODE, "仓位码匹配到多个仓位");
        }

        const location = locations[0];
        await assertInventoryLocationLeaf(location._id);
        const locationName = await getInventoryLocationPathName(location);

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                detail: {
                    ...location,
                    name: locationName || location.name || "",
                },
            },
        };
    } catch (err: any) {
        logger.error("Scan inventory location error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
