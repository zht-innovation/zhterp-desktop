import {
    assertInventoryWriteAccess,
    getInventoryActor,
    normalizeHeader,
    toNumber,
    toText,
} from "~~/server/services/inventory";
import { useInventoryInboundModel } from "~~/server/models/inventoryInbound.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
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
    "入库类型": "type",
    "type": "type",
    "入库日期": "inboundDate",
    "inbounddate": "inboundDate",
    "产品编号": "productCode",
    "产品编码": "productCode",
    "productcode": "productCode",
    "产品名称": "productName",
    "产品名": "productName",
    "productname": "productName",
    "型号": "model",
    "model": "model",
    "数量": "quantity",
    "quantity": "quantity",
    "关联单号": "relatedNo",
    "关联订单号": "relatedNo",
    "relatedno": "relatedNo",
    "快递公司": "courierCompany",
    "couriercompany": "courierCompany",
    "快递单号": "trackingNo",
    "trackingno": "trackingNo",
    "采购单号": "purchaseOrderNo",
    "生产单号": "processingOrderNo",
    "生产负责人": "productionOwner",
    "退货单号": "orderNo",
    "退货原因": "returnReason",
    "备注": "remark",
    "remark": "remark",
};

const resolveProductId = async (mapped: Record<string, any>): Promise<string> => {
    const code = toText(mapped.productCode);
    const name = toText(mapped.productName);
    const model = toText(mapped.model);
    if (!code && !name && !model) return "";

    const filter: Record<string, any> = { _isDeleted: { $ne: true } };
    const or: Record<string, any>[] = [];
    if (code) or.push({ code: code.toUpperCase() });
    if (name) or.push({ name });
    if (model) or.push({ model });
    if (or.length) filter.$or = or;

    const product = await InventoryProduct.findOne(filter).select("_id").lean();
    return product?._id?.toString?.() || "";
};

export default defineEventHandler(async (event) => {
    assertInventoryWriteAccess(event);
    try {
        const formData = await readMultipartFormData(event);
        if (!formData) {
            setResponseStatus(event, 400);
            return {
                code: CODE.INVALID_PARAMS,
                msg: codeToMsg[CODE.INVALID_PARAMS],
            };
        }

        const filePart = formData.find((part) => part.filename && ["file", "excel"].includes(part.name || ""));
        if (!filePart?.data) {
            setResponseStatus(event, 400);
            return {
                code: CODE.INVALID_PARAMS,
                msg: "缺少上传文件",
            };
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
            return {
                code: CODE.INVALID_PARAMS,
                msg: "未找到可用的工作表",
            };
        }

        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
            defval: "",
            raw: false,
        });
        if (!rows.length) {
            setResponseStatus(event, 400);
            return {
                code: CODE.INVALID_PARAMS,
                msg: "Excel 中没有可导入的数据",
            };
        }

        const inboundModel = useInventoryInboundModel();
        const errors: ImportError[] = [];
        const validRows: Array<{ rowNumber: number; mapped: Record<string, any> }> = [];

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

                const type = mapped.type;
                if (!type) {
                    errors.push({ row: rowNumber, message: "入库类型不能为空" });
                    continue;
                }

                const inboundDate = mapped.inboundDate;
                if (!inboundDate) {
                    errors.push({ row: rowNumber, message: "入库日期不能为空" });
                    continue;
                }

                const productId = await resolveProductId(mapped);
                if (!productId) {
                    errors.push({ row: rowNumber, message: "未找到匹配的产品（请填写产品编号、名称或型号）" });
                    continue;
                }

                const quantity = toNumber(mapped.quantity, 0);
                if (quantity <= 0) {
                    errors.push({ row: rowNumber, message: "数量必须大于0" });
                    continue;
                }

                const payload: Record<string, any> = {
                    type,
                    inboundDate,
                    items: [{ productId, quantity }],
                };

                if (mapped.remark) payload.remark = mapped.remark;
                if (mapped.courierCompany) payload.courierCompany = mapped.courierCompany;
                if (mapped.trackingNo) payload.trackingNo = mapped.trackingNo;

                const purchaseOrderNo = mapped.purchaseOrderNo || mapped.relatedNo;
                const processingOrderNo = mapped.processingOrderNo || mapped.relatedNo;
                const orderNo = mapped.orderNo || mapped.relatedNo;

                if (type === "采购" && purchaseOrderNo) payload.purchaseOrderNo = purchaseOrderNo;
                if (type === "生产") {
                    if (processingOrderNo) payload.processingOrderNo = processingOrderNo;
                    if (mapped.productionOwner) payload.productionOwner = mapped.productionOwner;
                }
                if (type === "售出退货") {
                    if (orderNo) payload.orderNo = orderNo;
                    if (mapped.returnReason) payload.returnReason = mapped.returnReason;
                }

                validRows.push({ rowNumber, mapped: payload });
            } catch (err: any) {
                errors.push({ row: rowNumber, message: err?.message || "校验失败" });
            }
        }

        let successCount = 0;
        for (const { rowNumber, mapped } of validRows) {
            try {
                await inboundModel.create(mapped, getInventoryActor(event));
                successCount += 1;
            } catch (err: any) {
                errors.push({ row: rowNumber, message: err?.message || "导入失败" });
            }
        }

        const totalCount = validRows.length + errors.length;

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                totalCount,
                successCount,
                failCount: errors.length,
                errors,
            },
        };
    } catch (err: any) {
        logger.error("Import inbound orders error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
