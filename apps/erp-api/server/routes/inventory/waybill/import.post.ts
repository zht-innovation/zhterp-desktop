import {
    assertInventoryWriteAccess,
    getInventoryActor,
    normalizeHeader,
    toText,
} from "~~/server/services/inventory";
import { useInventoryWaybillModel } from "~~/server/models/inventoryWaybill.model";
import type { InventoryWaybillReq } from "~~/server/models/inventoryWaybill.model";
import { logger } from "~~/server/utils/logger";
import {
    INVENTORY_IMPORT_FILE_SIZE_MESSAGE,
    INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES,
} from "~~/shared/utils/inventoryImport";

type ImportError = {
    row: number;
    message: string;
};

const headerMap: Record<string, string> = {
    "记录方向": "direction",
    "方向": "direction",
    "direction": "direction",
    "物流公司": "company",
    "快递公司": "company",
    "company": "company",
    "单号": "trackingNo",
    "运单号": "trackingNo",
    "trackingno": "trackingNo",
    "托寄物": "goods",
    "托寄物品": "goods",
    "goods": "goods",
    "业务类型": "businessType",
    "businesstype": "businessType",
    "寄件时间": "sentAt",
    "寄件日期": "sentAt",
    "sentat": "sentAt",
    "发货地": "senderAddress",
    "发货地址": "senderAddress",
    "senderaddress": "senderAddress",
    "收货地": "receiverAddress",
    "收货地址": "receiverAddress",
    "receiveraddress": "receiverAddress",
    "收件人": "receiverName",
    "receivername": "receiverName",
    "关联订单号": "relatedOrderNo",
    "订单号": "relatedOrderNo",
    "relatedorderno": "relatedOrderNo",
    "销售人员": "salesperson",
    "salesperson": "salesperson",
    "图片url": "imageUrl",
    "图片URL": "imageUrl",
    "imageurl": "imageUrl",
    "图片名称": "imageName",
    "imagename": "imageName",
    "备注": "remark",
    "remark": "remark",
};

export default defineEventHandler(async (event) => {
    assertInventoryWriteAccess(event);
    try {
        const formData = await readMultipartFormData(event);
        if (!formData) {
            setResponseStatus(event, 400);
            return { code: CODE.INVALID_PARAMS, msg: codeToMsg[CODE.INVALID_PARAMS] };
        }

        const filePart = formData.find((part) => part.filename && ["file", "excel"].includes(part.name || ""));
        if (!filePart?.data) {
            setResponseStatus(event, 400);
            return { code: CODE.INVALID_PARAMS, msg: "缺少上传文件" };
        }
        if (filePart.data.length > INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES) {
            setResponseStatus(event, 413);
            return {
                code: CODE.INVALID_PARAMS,
                msg: INVENTORY_IMPORT_FILE_SIZE_MESSAGE,
            };
        }

        const XLSX = await import("xlsx");
        const workbook = XLSX.read(filePart.data, { type: "buffer", codepage: 65001 });
        const sheetName = workbook.SheetNames?.[0];
        if (!sheetName) {
            setResponseStatus(event, 400);
            return { code: CODE.INVALID_PARAMS, msg: "未找到可用的工作表" };
        }

        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
            defval: "",
            raw: false,
        });
        if (!rows.length) {
            setResponseStatus(event, 400);
            return { code: CODE.INVALID_PARAMS, msg: "Excel 中没有可导入的数据" };
        }

        const waybillModel = useInventoryWaybillModel();
        const errors: ImportError[] = [];
        const validRows: Array<{ rowNumber: number; mapped: InventoryWaybillReq }> = [];

        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index];
            const rowNumber = index + 2;
            if (!Object.values(row).some((value) => toText(value))) continue;

            try {
                const mapped: Record<string, any> = {};
                for (const [key, value] of Object.entries(row)) {
                    const field = headerMap[normalizeHeader(key)];
                    if (!field) continue;
                    mapped[field] = toText(value);
                }

                const requiredFields: Array<[string, string]> = [
                    ["company", "物流公司"],
                    ["trackingNo", "单号"],
                    ["goods", "托寄物"],
                    ["businessType", "业务类型"],
                    ["sentAt", "寄件时间"],
                    ["receiverAddress", "收货地"],
                    ["receiverName", "收件人"],
                    ["imageUrl", "图片URL"],
                ];

                const missing = requiredFields.find(([field]) => !mapped[field]);
                if (missing) {
                    errors.push({ row: rowNumber, message: `${missing[1]}不能为空` });
                    continue;
                }

                validRows.push({
                    rowNumber,
                    mapped: {
                        company: mapped.company,
                        direction: mapped.direction === "收件" || mapped.direction === "receive" ? "receive" : "send",
                        trackingNo: mapped.trackingNo,
                        goods: mapped.goods,
                        businessType: mapped.businessType,
                        sentAt: mapped.sentAt,
                        senderAddress: mapped.senderAddress,
                        receiverAddress: mapped.receiverAddress,
                        receiverName: mapped.receiverName,
                        relatedOrderNo: mapped.relatedOrderNo,
                        salesperson: mapped.salesperson,
                        remark: mapped.remark,
                        images: [{
                            name: mapped.imageName || mapped.trackingNo,
                            url: mapped.imageUrl,
                            size: 0,
                            type: "",
                        }],
                    },
                });
            } catch (err: any) {
                errors.push({ row: rowNumber, message: err?.message || "校验失败" });
            }
        }

        let successCount = 0;
        for (const { rowNumber, mapped } of validRows) {
            try {
                await waybillModel.create(mapped, getInventoryActor(event));
                successCount += 1;
            } catch (err: any) {
                errors.push({ row: rowNumber, message: err?.message || "导入失败" });
            }
        }

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                totalCount: validRows.length + errors.length,
                successCount,
                failCount: errors.length,
                errors,
            },
        };
    } catch (err: any) {
        logger.error("Import waybills error", err);
        setResponseStatus(event, 500);
        return { code: CODE.SERVER_ERROR, msg: err?.message || codeToMsg[CODE.SERVER_ERROR] };
    }
});
