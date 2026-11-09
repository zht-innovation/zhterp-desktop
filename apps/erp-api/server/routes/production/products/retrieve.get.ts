import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { InventoryBom } from "~~/server/models/inventoryBom.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const keyword = String(query.keyword || "").trim().slice(0, 80);
        const filter: Record<string, any> = { _isDeleted: { $ne: true } };
        if (keyword) {
            const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            filter.$or = [{ code: regex }, { name: regex }, { model: regex }];
        }
        const products = await InventoryProduct.find(filter)
            .select("code name model material categoryName unitName image")
            .sort({ code: 1 }).limit(100).lean() as any[];
        const boms = await InventoryBom.find({ productId: { $in: products.map((product) => product._id) }, isEnabled: true, _isDeleted: { $ne: true } })
            .select("productId version").lean() as any[];
        const bomMap = new Map(boms.map((bom) => [bom.productId.toString(), bom.version]));
        return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: products
            .filter((product) => bomMap.has(product._id.toString()))
            .map((product) => ({ productId: product._id.toString(), code: product.code, name: product.model || product.name,
                material: product.material || "未维护", category: product.categoryName || "未分类", unit: product.unitName || "个",
                image: product.image || "", bomVersion: bomMap.get(product._id.toString()) })) };
    } catch (error) {
        logger.error("Retrieve production products error", error as Error);
        setResponseStatus(event, 500);
        return { code: CODE.SERVER_ERROR, msg: codeToMsg[CODE.SERVER_ERROR] };
    }
});
