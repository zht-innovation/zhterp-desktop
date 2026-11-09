import mongoose from "mongoose";
import {
    SALES_ORDER_CREATED_COUNT_STATUSES,
    useSalesOrderModel,
} from "~~/server/models/salesOrder.model";

const toText = (value: unknown) => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof (value as any)?.toString === "function") return (value as any).toString().trim();
    return "";
};

const toPlainSalesperson = (salesperson: any) =>
    salesperson?.toObject?.() ?? salesperson;

const getSalespersonDisplayNames = (salesperson: any) =>
    [
        salesperson?.name,
        salesperson?.nameCn,
        salesperson?.nameEn,
    ].map(toText).filter(Boolean);

export const attachSubmittedOrderCountsToSalespeople = async (salespeople: any[] = []) => {
    const plainSalespeople = salespeople.map(toPlainSalesperson);
    if (plainSalespeople.length === 0) return plainSalespeople;

    const salespersonIds = plainSalespeople
        .map((salesperson) => toText(salesperson?._id))
        .filter((id) => mongoose.Types.ObjectId.isValid(id));
    const uniqueSalespersonIds = [...new Set(salespersonIds)];
    const salespersonObjectIds = uniqueSalespersonIds.map((id) => new mongoose.Types.ObjectId(id));

    const nameToSalespersonIds = new Map<string, string[]>();
    for (const salesperson of plainSalespeople) {
        const salespersonId = toText(salesperson?._id);
        if (!salespersonId) continue;

        for (const name of getSalespersonDisplayNames(salesperson)) {
            const ids = nameToSalespersonIds.get(name) || [];
            ids.push(salespersonId);
            nameToSalespersonIds.set(name, ids);
        }
    }

    const salespersonNames = [...nameToSalespersonIds.keys()];
    const matchBranches: Record<string, any>[] = [];
    if (salespersonObjectIds.length > 0) {
        matchBranches.push({ salespersonId: { $in: salespersonObjectIds } });
    }
    if (salespersonNames.length > 0) {
        matchBranches.push({
            $and: [
                {
                    $or: [
                        { salespersonId: null },
                        { salespersonId: { $exists: false } },
                    ],
                },
                { salespersonName: { $in: salespersonNames } },
            ],
        });
    }

    if (matchBranches.length === 0) return plainSalespeople;

    const rows = await useSalesOrderModel().order
        .find({
            _isDeleted: { $ne: true },
            status: { $in: SALES_ORDER_CREATED_COUNT_STATUSES },
            $or: matchBranches,
        })
        .select("salespersonId salespersonName")
        .lean();

    const countMap = new Map(uniqueSalespersonIds.map((id) => [id, 0]));
    for (const row of rows as any[]) {
        const salespersonId = toText(row?.salespersonId);
        if (salespersonId && countMap.has(salespersonId)) {
            countMap.set(salespersonId, (countMap.get(salespersonId) || 0) + 1);
            continue;
        }

        const fallbackIds = nameToSalespersonIds.get(toText(row?.salespersonName)) || [];
        for (const fallbackId of fallbackIds) {
            countMap.set(fallbackId, (countMap.get(fallbackId) || 0) + 1);
        }
    }

    return plainSalespeople.map((salesperson) => {
        const salespersonId = toText(salesperson?._id);
        if (!salespersonId || !countMap.has(salespersonId)) return salesperson;

        return {
            ...salesperson,
            _dealCount: countMap.get(salespersonId) || 0,
        };
    });
};
