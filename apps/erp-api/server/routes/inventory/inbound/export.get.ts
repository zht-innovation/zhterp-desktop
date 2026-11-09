import { toText } from "~~/server/services/inventory";
import { useInventoryInboundModel } from "~~/server/models/inventoryInbound.model";
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

const warehouseName = (item: any) => [item.warehouseName, item.locationName].filter(Boolean).join(" / ");

const toExportRows = (order: any) => {
    const base = {
        "入库编号": order.inboundNo || "",
        "入库类型": order.type || "",
        "关联业务号": order.relatedNo || "",
        "入库总数量": order.totalQuantity ?? 0,
        "入库日期": formatDate(order.inboundDate),
        "经办人": order.handler || "",
        "快递公司": order.courierCompany || "",
        "快递单号": order.trackingNo || "",
        "备注": order.remark || "",
        "修改人": order.updatedBy || "",
        "修改时间": formatDateTime(order.updateTime),
    };

    if (!order.items?.length) {
        return [{ ...base, "产品编号": "", "型号": "", "数量": "", "单位": "", "仓库": "" }];
    }

    return order.items.map((item: any) => ({
        ...base,
        "产品编号": item.productCode || "",
        "型号": item.model || "",
        "数量": item.quantity ?? "",
        "单位": item.unitName || "",
        "仓库": warehouseName(item),
    }));
};

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const result = await useInventoryInboundModel().retrieve({
            keyword: toText(query.keyword),
            type: toText(query.type),
            inboundDate: toText(query.inboundDate),
            startDate: toText(query.startDate),
            endDate: toText(query.endDate),
            ids: query.ids as string | string[] | undefined,
            page: 1,
            limit: 10000,
        });

        const XLSX = await import("xlsx");
        const worksheet = XLSX.utils.json_to_sheet(result.list.flatMap(toExportRows));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "入库单");
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        setHeader(event, "Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        setHeader(event, "Content-Disposition", "attachment; filename=inventory-inbound-orders.xlsx");
        setResponseStatus(event, 200);
        return buffer;
    } catch (err: any) {
        logger.error("Export inventory inbound orders error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.INVENTORY_EXPORT_FAILED,
            msg: codeToMsg[CODE.INVENTORY_EXPORT_FAILED],
        };
    }
});
