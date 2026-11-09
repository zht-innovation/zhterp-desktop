import { toText } from "~~/server/services/inventory";
import { useInventoryProductModel } from "~~/server/models/inventoryProduct.model";
import { logger } from "~~/server/utils/logger";
import { canManageInventory } from "~~/shared/utils/adminPermission";

const toExportRow = (item: any, canViewStandardPrice: boolean) => {
    const row: Record<string, any> = {
        "产品编号": item.code || "",
        "型号": item.model || "",
        "分类": item.categoryPath || item.categoryName || "",
        "产品图片": item.image || "",
        "单位": item.unitName || "",
        "材质": item.material || "",
        "来源": item.source || "",
        ...(canViewStandardPrice ? { "标准价": item.standardPrice ?? 0 } : {}),
        "平均价": item.averagePrice ?? 0,
        "型号编码": item.modelCode || "",
        "成套数量": item.kitQuantity ?? 1,
        "库存上限": item.stockUpperLimit ?? 0,
        "库存下限": item.stockLowerLimit ?? 0,
        "仓库": item.warehouseName || "",
        "仓位": item.locationName || "",
        "商品简介": item.introduction || "",
        "条码": item.barcode || "",
        "是否可售": item.isSaleable ? "是" : "否",
        "备注": item.remark || "",
        "修改人": item.updatedBy || item.operator || "",
        "修改时间": item.updateTime || "",
    };

    return row;
};

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const canViewStandardPrice = canManageInventory(Number(event.context.auth?.role));
        const productModel = useInventoryProductModel();
        const result = await productModel.retrieve({
            keyword: toText(query.keyword),
            categoryId: toText(query.categoryId),
            source: toText(query.source),
            unitId: toText(query.unitId),
            warehouseId: toText(query.warehouseId),
            locationId: toText(query.locationId),
            isSaleable: query.isSaleable,
            stockWarning: toText(query.stockWarning),
            page: 1,
            limit: 10000,
        });

        const XLSX = await import("xlsx");
        const worksheet = XLSX.utils.json_to_sheet(
            result.list.map((item: any) => toExportRow(item, canViewStandardPrice)),
        );
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "产品");
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        setHeader(
            event,
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        setHeader(event, "Content-Disposition", "attachment; filename=inventory-products.xlsx");
        setResponseStatus(event, 200);
        return buffer;
    } catch (err: any) {
        logger.error("Export inventory product error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.INVENTORY_EXPORT_FAILED,
            msg: codeToMsg[CODE.INVENTORY_EXPORT_FAILED],
        };
    }
});
