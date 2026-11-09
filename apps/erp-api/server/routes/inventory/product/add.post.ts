import { getInventoryActor, InventoryHttpError } from "~~/server/services/inventory";
import { useInventoryProductModel } from "~~/server/models/inventoryProduct.model";
import { logger } from "~~/server/utils/logger";
import { canManageInventory } from "~~/shared/utils/adminPermission";

const readProductPayload = async (event: any) => {
    const contentType = event.node.req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
        return await readBody(event);
    }

    const formData = await readMultipartFormData(event);
    if (!formData) {
        throw new InventoryHttpError(400, CODE.INVALID_PARAMS, codeToMsg[CODE.INVALID_PARAMS]);
    }

    const body: Record<string, any> = {};
    for (const part of formData) {
        if (!part.name || part.filename) continue;

        const value = part.data.toString("utf-8");
        if (["standardPrice", "averagePrice", "kitQuantity", "stockUpperLimit", "stockLowerLimit"].includes(part.name)) {
            body[part.name] = value === "" ? undefined : Number(value);
        } else if (part.name === "isSaleable") {
            body[part.name] = value === "true" || value === "1" || value === "是";
        } else if (part.name === "snPrefixes") {
            try {
                body[part.name] = JSON.parse(value);
            } catch {
                body[part.name] = value;
            }
        } else {
            body[part.name] = value;
        }
    }

    return body;
};

export default defineEventHandler(async (event) => {
    try {
        const body = await readProductPayload(event);
        if (!canManageInventory(Number(event.context.auth?.role))) {
            delete body.standardPrice;
        }
        const productModel = useInventoryProductModel();
        const created = await productModel.create(body || {}, getInventoryActor(event));

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
        logger.error("Create inventory product error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
