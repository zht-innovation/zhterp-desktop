import { FinanceHttpError, getFinanceActor, toText, toNumber, isValidObjectId } from "~~/server/services/finance";
import { CODE, codeToMsg } from "~~/server/utils/code";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { logger } from "~~/server/utils/logger";
import { saveStandardPriceSyncSettings } from "~~/server/services/financeStandardPriceSync";

export default defineEventHandler(async (event) => {
    try {
        const body = await readBody(event);
        if (body?.action === "standard-price-sync-settings") {
            const settings = await saveStandardPriceSyncSettings(body, getFinanceActor(event));
            setHeader(event, "Cache-Control", "private, no-store");
            setResponseStatus(event, 200);
            return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: settings };
        }
        const productId = toText(body.productId);
        const standardPrice = toNumber(body.standardPrice);

        if (!productId || !isValidObjectId(productId)) {
            setResponseStatus(event, 400);
            return { code: CODE.INVALID_PARAMS, msg: "缺少有效的 productId" };
        }

        if (standardPrice < 0) {
            setResponseStatus(event, 400);
            return { code: CODE.INVALID_PARAMS, msg: "标准价不能为负数" };
        }

        const product = await InventoryProduct.findByIdAndUpdate(
            productId,
            { standardPrice, updateTime: new Date() },
            { new: true },
        ).lean();

        if (!product) {
            setResponseStatus(event, 404);
            return { code: CODE.INVALID_PARAMS, msg: "产品不存在" };
        }

        setResponseStatus(event, 200);
        return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: { standardPrice } };
    } catch (err: any) {
        logger.error("Update finance standard price error", err);
        const knownError = err instanceof FinanceHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
