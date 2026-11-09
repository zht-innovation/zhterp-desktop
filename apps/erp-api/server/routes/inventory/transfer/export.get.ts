import { toText } from "~~/server/services/inventory";
import { useInventoryTransferModel } from "~~/server/models/inventoryTransfer.model";
import { logger } from "~~/server/utils/logger";

const formatDate = (value: unknown) => {
    if (!value) return "";
    const date = new Date(value as string | number | Date);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatDateTime = (value: unknown) => {
    if (!value) return "";
    const date = new Date(value as string | number | Date);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 16).replace("T", " ");
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatWarehouse = (warehouseName?: string, locationName?: string) =>
    [warehouseName, locationName].filter(Boolean).join(" / ");

const toExportRows = (order: any) => {
    const base = {
        "调拨编号": order.transferNo || "",
        "调拨日期": formatDate(order.transferDate),
        "借用人": order.borrower || "",
        "预计归还日期": formatDate(order.expectedReturnDate),
        "实际归库时间": formatDate(order.actualReturnTime),
        "归还状态": order.returned ? "已归还" : "未归还",
        "经办人": order.handler || "",
        "快递公司": order.courierCompany || "",
        "快递单号": order.trackingNo || "",
        "调拨总数量": order.totalQuantity ?? 0,
        "备注": order.remark || "",
        "修改人": order.updatedBy || "",
        "修改时间": formatDateTime(order.updateTime),
    };

    if (!order.items?.length) {
        return [{ ...base, "产品编号": "", "型号": "", "数量": "", "单位": "", "转出仓库": "" }];
    }

    return order.items.map((item: any) => ({
        ...base,
        "产品编号": item.productCode || "",
        "型号": item.model || "",
        "数量": item.quantity ?? "",
        "单位": item.unitName || "",
        "转出仓库": formatWarehouse(item.warehouseName, item.locationName),
    }));
};

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const result = await useInventoryTransferModel().retrieve({
            keyword: toText(query.keyword),
            transferDate: toText(query.transferDate),
            startDate: toText(query.startDate),
            endDate: toText(query.endDate),
            ids: query.ids as string | string[] | undefined,
            page: 1,
            limit: 10000,
        });

        const XLSX = await import("xlsx");
        const worksheet = XLSX.utils.json_to_sheet(result.list.flatMap(toExportRows));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "调拨单");
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        setHeader(event, "Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        setHeader(event, "Content-Disposition", "attachment; filename=inventory-transfer-orders.xlsx");
        setResponseStatus(event, 200);
        return buffer;
    } catch (err: any) {
        logger.error("Export inventory transfer orders error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.INVENTORY_EXPORT_FAILED,
            msg: codeToMsg[CODE.INVENTORY_EXPORT_FAILED],
        };
    }
});
