import {
    assertInventoryWriteAccess,
    getInventoryActor,
    normalizeHeader,
    toNumber,
    toText,
} from "~~/server/services/inventory";
import { useInventoryOutboundModel } from "~~/server/models/inventoryOutbound.model";
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
    "出库类型": "type",
    "type": "type",
    "出库日期": "outboundDate",
    "outbounddate": "outboundDate",
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
    "合同订单号": "contractOrderNo",
    "订单号": "contractOrderNo",
    "快递公司": "expressCompany",
    "expresscompany": "expressCompany",
    "运单号": "waybillNo",
    "waybillno": "waybillNo",
    "借用人": "borrower",
    "borrower": "borrower",
    "借用方": "borrowingParty",
    "borrowingparty": "borrowingParty",
    "押金": "deposit",
    "deposit": "deposit",
    "预计归还日期": "returnDate",
    "returndate": "returnDate",
    "项目": "project",
    "项目名称": "project",
    "project": "project",
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

        const outboundModel = useInventoryOutboundModel();
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
                    errors.push({ row: rowNumber, message: "出库类型不能为空" });
                    continue;
                }

                const outboundDate = mapped.outboundDate;
                if (!outboundDate) {
                    errors.push({ row: rowNumber, message: "出库日期不能为空" });
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
                    outboundDate,
                    items: [{ productId, quantity }],
                };

                if (mapped.remark) payload.remark = mapped.remark;
                if (mapped.expressCompany) payload.expressCompany = mapped.expressCompany;
                if (mapped.waybillNo) payload.waybillNo = mapped.waybillNo;

                const contractOrderNo = mapped.contractOrderNo || mapped.relatedNo;
                const borrower = mapped.borrower || mapped.relatedNo;

                if (type === "订单" && contractOrderNo) payload.contractOrderNo = contractOrderNo;
                if (type === "借给客户") {
                    if (borrower) payload.borrower = borrower;
                    if (mapped.borrowingParty) payload.borrowingParty = mapped.borrowingParty;
                    if (mapped.deposit) payload.deposit = mapped.deposit;
                    if (mapped.returnDate) payload.returnDate = mapped.returnDate;
                }

                validRows.push({ rowNumber, mapped: payload });
            } catch (err: any) {
                errors.push({ row: rowNumber, message: err?.message || "校验失败" });
            }
        }

        let successCount = 0;
        for (const { rowNumber, mapped } of validRows) {
            try {
                await outboundModel.create(mapped, getInventoryActor(event));
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
        logger.error("Import outbound orders error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
