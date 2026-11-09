import mongoose from "mongoose";
import { createHash } from "node:crypto";
import {
    allocateSalesOrderProductSn,
    ProductSnError,
    type ProductSnAllocationData,
} from "~~/server/models/salesOrderProductSn.model";
import { getSalesOrderProductSnExportContext } from "~~/server/services/approvalCenter";
import { formatSalesOrderProductSn } from "~~/shared/utils/salesOrderProductSn";

const reserveProductSn = async (auth: any, id: unknown, productIndex: unknown) => {
    const session = await mongoose.startSession();
    try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                const allocation = await session.withTransaction(async () => {
                    const context = await getSalesOrderProductSnExportContext(auth, id, productIndex, session);
                    return await allocateSalesOrderProductSn({
                        salesOrderId: context.instance.businessId,
                        approvalId: context.instance._id,
                        snapshotHash: createHash("sha256")
                            .update(JSON.stringify(context.instance.businessSnapshot)).digest("hex"),
                        productIndex: context.productIndex,
                        productCode: context.productCode,
                        quantity: context.quantity,
                        allocatedBy: context.admin.adminId,
                    }, session);
                }, {
                    readConcern: { level: "snapshot" },
                    writeConcern: { w: "majority" },
                });
                if (!allocation) throw new ProductSnError(500, "S/N 分配失败，请重试");
                return allocation;
            } catch (error) {
                // 不同请求同时首次下载同一行时，唯一索引冲突会回滚整个事务。
                // 重试后读取已提交的分配，不再次占号；写冲突由 withTransaction 自动重试。
                if ((error as { code?: number })?.code !== 11000) throw error;
            }
        }
        throw new ProductSnError(409, "该产品行正在分配 S/N，请稍后重新下载");
    } finally {
        await session.endSession();
    }
};

export const createProductSnWorksheetRows = (allocation: ProductSnAllocationData) => {
    const rows: string[][] = [["产品编号", "S/N"]];
    for (let serial = allocation.startSerial; serial <= allocation.endSerial; serial += 1) {
        rows.push([allocation.productCode, formatSalesOrderProductSn(allocation.prefix, serial)]);
    }
    return rows;
};

export const exportSalesOrderProductSn = async (auth: any, id: unknown, productIndex: unknown) => {
    const XLSX = await import("xlsx");
    const allocation = await reserveProductSn(auth, id, productIndex);
    const worksheet = XLSX.utils.aoa_to_sheet(createProductSnWorksheetRows(allocation));
    worksheet["!cols"] = [{ wch: 18 }, { wch: 30 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "产品标号");
    return {
        buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
        filename: `产品标号_${allocation.productCode}_${allocation.productIndex + 1}.xlsx`,
    };
};
