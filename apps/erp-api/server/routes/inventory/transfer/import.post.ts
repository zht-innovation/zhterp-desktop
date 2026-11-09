import {
    assertInventoryWriteAccess,
    getInventoryActor,
    normalizeHeader,
    toNumber,
    toText,
} from "~~/server/services/inventory";
import { InventoryLocation, InventoryWarehouse } from "~~/server/models/inventoryBase.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { useInventoryTransferModel } from "~~/server/models/inventoryTransfer.model";
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
    "调拨日期": "transferDate",
    "transferdate": "transferDate",
    "借用人": "borrower",
    "borrower": "borrower",
    "预计归还日期": "expectedReturnDate",
    "expectedreturndate": "expectedReturnDate",
    "转出仓库": "sourceWarehouse",
    "源仓库": "sourceWarehouse",
    "sourcewarehouse": "sourceWarehouse",
    "转出仓位": "sourceLocation",
    "源仓位": "sourceLocation",
    "sourcelocation": "sourceLocation",
    "产品编号": "productCode",
    "产品编码": "productCode",
    "productcode": "productCode",
    "型号": "model",
    "model": "model",
    "数量": "quantity",
    "quantity": "quantity",
    "经办人": "handler",
    "handler": "handler",
    "快递公司": "courierCompany",
    "couriercompany": "courierCompany",
    "快递单号": "trackingNo",
    "运单号": "trackingNo",
    "trackingno": "trackingNo",
    "备注": "remark",
    "remark": "remark",
};

const resolveProductId = async (mapped: Record<string, any>) => {
    const code = toText(mapped.productCode);
    const model = toText(mapped.model);
    if (!code && !model) return "";

    const filter: Record<string, any> = { _isDeleted: { $ne: true } };
    const or: Record<string, any>[] = [];
    if (code) or.push({ code: code.toUpperCase() });
    if (model) or.push({ model });
    filter.$or = or;

    const product = await InventoryProduct.findOne(filter).select("_id").lean();
    return product?._id?.toString?.() || "";
};

const resolveWarehouseId = async (value: unknown) => {
    const text = toText(value);
    if (!text) return "";
    const warehouse = await InventoryWarehouse
        .findOne({
            _isDeleted: { $ne: true },
            $or: [{ code: text.toUpperCase() }, { name: text }],
        })
        .select("_id")
        .lean();
    return warehouse?._id?.toString?.() || "";
};

const splitPath = (value: unknown) =>
    toText(value)
        .replace(/／/g, "/")
        .split("/")
        .map((item) => item.trim())
        .filter(Boolean);

const parseWarehouseLocation = (warehouseValue: unknown, locationValue: unknown) => {
    const warehouseParts = splitPath(warehouseValue);
    const locationParts = splitPath(locationValue);

    if (warehouseParts.length > 1 && !locationParts.length) {
        return {
            warehouseText: warehouseParts[0],
            locationParts: warehouseParts.slice(1),
        };
    }

    if (!warehouseParts.length && locationParts.length > 1) {
        return {
            warehouseText: locationParts[0],
            locationParts: locationParts.slice(1),
        };
    }

    return {
        warehouseText: warehouseParts[0] || "",
        locationParts,
    };
};

const resolveLocationPart = async (
    warehouseId: string,
    part: string,
    parentId?: string | null,
) => {
    const filter: Record<string, any> = {
        _isDeleted: { $ne: true },
        warehouseId,
        $or: [{ code: part.toUpperCase() }, { name: part }],
    };

    if (parentId !== undefined) {
        filter.parentId = parentId || null;
    }

    const location = await InventoryLocation.findOne(filter).select("_id").lean();
    return location?._id?.toString?.() || "";
};

const resolveLocationPath = async (warehouseId: string, parts: string[]) => {
    if (!warehouseId || !parts.length) return "";

    if (parts.length === 1) {
        return await resolveLocationPart(warehouseId, parts[0]);
    }

    let parentId: string | null = null;
    for (const part of parts) {
        parentId = await resolveLocationPart(warehouseId, part, parentId);
        if (!parentId) return "";
    }

    return parentId || "";
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

        const transferModel = useInventoryTransferModel();
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

                if (!mapped.transferDate) {
                    errors.push({ row: rowNumber, message: "调拨日期不能为空" });
                    continue;
                }
                if (!mapped.borrower) {
                    errors.push({ row: rowNumber, message: "借用人不能为空" });
                    continue;
                }
                if (!mapped.expectedReturnDate) {
                    errors.push({ row: rowNumber, message: "预计归还日期不能为空" });
                    continue;
                }

                const productId = await resolveProductId(mapped);
                if (!productId) {
                    errors.push({ row: rowNumber, message: "未找到匹配的产品（请填写产品编号或型号）" });
                    continue;
                }

                const quantity = toNumber(mapped.quantity, 0);
                if (quantity <= 0) {
                    errors.push({ row: rowNumber, message: "数量必须大于0" });
                    continue;
                }

                const sourcePath = parseWarehouseLocation(mapped.sourceWarehouse, mapped.sourceLocation);
                const sourceWarehouseId = await resolveWarehouseId(sourcePath.warehouseText);
                if (!sourceWarehouseId) {
                    errors.push({ row: rowNumber, message: "未找到转出仓库" });
                    continue;
                }

                const sourceLocationId = await resolveLocationPath(sourceWarehouseId, sourcePath.locationParts);

                validRows.push({
                    rowNumber,
                    mapped: {
                        transferDate: mapped.transferDate,
                        borrower: mapped.borrower,
                        expectedReturnDate: mapped.expectedReturnDate,
                        handler: mapped.handler,
                        courierCompany: mapped.courierCompany,
                        trackingNo: mapped.trackingNo,
                        remark: mapped.remark,
                        items: [{
                            productId,
                            quantity,
                            warehouseId: sourceWarehouseId,
                            locationId: sourceLocationId,
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
                await transferModel.create(mapped, getInventoryActor(event));
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
        logger.error("Import transfer orders error", err);
        setResponseStatus(event, 500);
        return { code: CODE.SERVER_ERROR, msg: err?.message || codeToMsg[CODE.SERVER_ERROR] };
    }
});
