import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { useInventoryWaybillModel } from "~~/server/models/inventoryWaybill.model";
import { logger } from "~~/server/utils/logger";
import { attachPurchaseLogisticsToWaybills } from "~~/server/services/purchaseLogistics";
import {
    assertInventoryWaybillReadView,
    getInventoryWaybillReadScope,
} from "~~/server/services/inventoryWaybillAccess";

const formatDate = (value: unknown) => {
    if (!value) return "";
    const date = new Date(value as string | number | Date);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const toExportRow = (item: any) => ({
    "记录方向": item.direction === "receive" ? "收件" : "寄件",
    "物流公司": item.company || "",
    "单号": item.trackingNo || "",
    "托寄物": item.goodsDisplay || item.goods || "",
    "业务类型": item.businessType || "",
    "寄件时间": formatDate(item.sentAt),
});

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const scope = await getInventoryWaybillReadScope(event.context.auth);
        assertInventoryWaybillReadView(scope, query);
        const result = await useInventoryWaybillModel().retrieve({
            keyword: toText(query.keyword),
            company: toText(query.company),
            businessType: toText(query.businessType),
            direction: toText(query.direction),
            relatedOrderNo: toText(query.relatedOrderNo),
            trackingNo: toText(query.trackingNo),
            salesperson: toText(query.salesperson),
            sortOrder: toText(query.sortOrder),
            startDate: toText(query.startDate),
            endDate: toText(query.endDate),
            ids: query.ids as string | string[] | undefined,
            page: 1,
            limit: 10000,
        }, scope);

        result.list = await attachPurchaseLogisticsToWaybills(result.list);
        const XLSX = await import("xlsx");
        const worksheet = XLSX.utils.json_to_sheet(result.list.map(toExportRow));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "运单记录");
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        setHeader(event, "Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        setHeader(event, "Content-Disposition", "attachment; filename=inventory-waybills.xlsx");
        setHeader(event, "Cache-Control", "no-store");
        setResponseStatus(event, 200);
        return buffer;
    } catch (err: any) {
        logger.error("Export inventory waybills error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.INVENTORY_EXPORT_FAILED,
            msg: knownError ? err.message : codeToMsg[CODE.INVENTORY_EXPORT_FAILED],
        };
    }
});
