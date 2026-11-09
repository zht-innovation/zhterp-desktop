import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { ProductionWorkshop } from "~~/server/models/productionWorkshop.model";
import { InventoryHttpError } from "~~/server/services/inventory";
import { CODE } from "~~/server/utils/code";

let workshopIndexesReady: Promise<void> | null = null;

const ensureWorkshopIndexes = () => {
    if (!workshopIndexesReady) {
        workshopIndexesReady = ProductionWorkshop.createIndexes().then(() => undefined).catch((error: unknown) => {
            workshopIndexesReady = null;
            throw error;
        });
    }
    return workshopIndexesReady;
};

export const retrieveProductionWorkshops = async () => {
    const [savedNames, historicalNames] = await Promise.all([
        ProductionWorkshop.distinct("name"),
        ProductionOrder.distinct("workshop"),
    ]);
    const names = new Set<string>();
    for (const value of [...savedNames, ...historicalNames]) {
        if (typeof value !== "string") continue;
        const name = value.trim();
        if (name) names.add(name);
    }
    return [...names].sort((left, right) => left.localeCompare(right, "zh-CN"));
};

export const saveProductionWorkshop = async (input: unknown, actor: string) => {
    const name = typeof input === "string" ? input.trim() : "";
    if (!name || name.length > 40) {
        throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "请填写 1 至 40 个字符的车间名称。");
    }
    await ensureWorkshopIndexes();
    try {
        await ProductionWorkshop.findOneAndUpdate(
            { name },
            { $setOnInsert: { name, createdBy: actor } },
            { upsert: true, runValidators: true },
        );
    } catch (error: any) {
        if (error?.code !== 11000 || !(await ProductionWorkshop.exists({ name }))) throw error;
    }
    return { name };
};
