import { toText } from "~~/server/services/inventory";
import { useInventoryBomModel } from "~~/server/models/inventoryBom.model";
import { logger } from "~~/server/utils/logger";

const headers = [
    "BOM名称",
    "主产品型号",
    "是否启用",
    "备注",
    "子项产品序号",
    "子项产品型号",
    "子项产品数量",
];

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const bomModel = useInventoryBomModel();
        const sheetData: (string | number)[][] = [headers];
        let page = 1;

        while (true) {
            const result = await bomModel.retrieve({
                keyword: toText(query.keyword),
                productId: toText(query.productId),
                isEnabled: query.isEnabled,
                codes: query.codes as string | string[] | undefined,
                page,
                limit: 200,
            });

            for (const bom of result.list) {
                const items = Array.isArray(bom.items) ? bom.items : [];
                const rowCount = Math.max(items.length, 1);

                for (let index = 0; index < rowCount; index += 1) {
                    const item = items[index];
                    const isFirstRow = index === 0;

                    // 同一 BOM 的后续行留空主信息，供导入时归入同一组。
                    sheetData.push([
                        isFirstRow ? bom.name || "" : "",
                        isFirstRow ? bom.model || "" : "",
                        isFirstRow ? (bom.isEnabled ? "是" : "否") : "",
                        isFirstRow ? bom.remark || "" : "",
                        item ? index + 1 : "",
                        item?.model || "",
                        item?.quantity ?? "",
                    ]);
                }
            }

            if (!result.pagination.hasMore) {
                break;
            }
            page += 1;
        }

        const XLSX = await import("xlsx");
        const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
        worksheet["!cols"] = [
            { wch: 18 },
            { wch: 18 },
            { wch: 12 },
            { wch: 16 },
            { wch: 14 },
            { wch: 24 },
            { wch: 14 },
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "BOM");
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        setHeader(
            event,
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        setHeader(event, "Content-Disposition", "attachment; filename=inventory-boms.xlsx");
        setResponseStatus(event, 200);
        return buffer;
    } catch (err: any) {
        logger.error("Export inventory BOM error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.INVENTORY_EXPORT_FAILED,
            msg: codeToMsg[CODE.INVENTORY_EXPORT_FAILED],
        };
    }
});
