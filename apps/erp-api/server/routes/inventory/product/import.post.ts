import {
    assertInventoryWriteAccess,
    getInventoryActor,
    normalizeHeader,
    toBoolean,
    toNumber,
    toText,
} from "~~/server/services/inventory";
import {
    InventoryCategory,
    InventoryLocation,
    InventoryUnit,
    InventoryWarehouse,
} from "~~/server/models/inventoryBase.model";
import { useInventoryProductModel } from "~~/server/models/inventoryProduct.model";
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
    "产品名称": "name",
    "名称": "name",
    "name": "name",
    "分类id": "categoryId",
    "categoryid": "categoryId",
    "分类编号": "categoryCode",
    "分类编码": "categoryCode",
    "categorycode": "categoryCode",
    "分类": "categoryName",
    "分类名称": "categoryName",
    "categoryname": "categoryName",
    "图片": "image",
    "产品图片": "image",
    "image": "image",
    "单位id": "unitId",
    "unitid": "unitId",
    "单位编号": "unitCode",
    "单位编码": "unitCode",
    "unitcode": "unitCode",
    "单位": "unitName",
    "单位名称": "unitName",
    "unitname": "unitName",
    "材质": "material",
    "material": "material",
    "来源": "source",
    "产品来源": "source",
    "source": "source",
    "平均价": "averagePrice",
    "平均价格": "averagePrice",
    "averageprice": "averagePrice",
    "型号": "model",
    "model": "model",
    "sn前缀参数": "snPrefixes",
    "snprefixes": "snPrefixes",
    "型号编码": "modelCode",
    "modelcode": "modelCode",
    "成套数量": "kitQuantity",
    "kitquantity": "kitQuantity",
    "库存上限": "stockUpperLimit",
    "stockupperlimit": "stockUpperLimit",
    "库存下限": "stockLowerLimit",
    "stocklowerlimit": "stockLowerLimit",
    "仓库id": "warehouseId",
    "warehouseid": "warehouseId",
    "仓库编号": "warehouseCode",
    "仓库编码": "warehouseCode",
    "warehousecode": "warehouseCode",
    "仓库": "warehouseName",
    "仓库/仓位": "warehouseName",
    "仓库名称": "warehouseName",
    "warehousename": "warehouseName",
    "仓位id": "locationId",
    "locationid": "locationId",
    "仓位编号": "locationCode",
    "仓位编码": "locationCode",
    "locationcode": "locationCode",
    "仓位": "locationName",
    "仓位名称": "locationName",
    "locationname": "locationName",
    "产品简介": "introduction",
    "简介": "introduction",
    "introduction": "introduction",
    "条码": "barcode",
    "barcode": "barcode",
    "是否可售": "isSaleable",
    "issaleable": "isSaleable",
    "备注": "remark",
    "remark": "remark",
    "预留1": "reserved1",
    "reserved1": "reserved1",
    "预留2": "reserved2",
    "reserved2": "reserved2",
    "预留3": "reserved3",
    "reserved3": "reserved3",
    "预留4": "reserved4",
    "reserved4": "reserved4",
    "预留5": "reserved5",
    "reserved5": "reserved5",
};

const IMAGE_COLUMN_NAMES = ["产品图片", "图片", "image"];
const IMAGE_UPLOAD_URL = "https://server.zhtaero.com/image/upload";

const parseWarehouseLocationText = (value: unknown) => {
    const text = toText(value).replace(/／/g, "/");
    if (!text.includes("/")) {
        return {
            warehouseName: text,
            locationName: "",
        };
    }

    const [warehouseName = "", ...locationParts] = text
        .split("/")
        .map((item) => item.trim())
        .filter(Boolean);

    return {
        warehouseName,
        locationName: locationParts.join("/").trim(),
    };
};

const applyWarehouseLocationText = (mapped: Record<string, any>) => {
    const warehouseText = toText(mapped.warehouseName);
    if (!warehouseText) return;

    const { warehouseName, locationName } = parseWarehouseLocationText(warehouseText);
    mapped.warehouseName = warehouseName;

    if (
        locationName &&
        !toText(mapped.locationId) &&
        !toText(mapped.locationCode) &&
        !toText(mapped.locationName)
    ) {
        mapped.locationName = locationName;
    }
};

const normalizeImportedSnPrefixes = (value: unknown) =>
    toText(value)
        .split(/[，,\s]+/)
        .map((item) => item.trim().toUpperCase().replace(/-/g, ""))
        .filter(Boolean);

const assertWarehouseLocationSelected = async (mapped: Record<string, any>) => {
    const warehouseId = toText(mapped.warehouseId);
    if (!warehouseId || toText(mapped.locationId)) return;

    const warehouse = await InventoryWarehouse
        .findOne({ _id: warehouseId, _isDeleted: { $ne: true } })
        .select("name enableLocation")
        .lean();

    if (warehouse?.enableLocation) {
        throw new Error(`仓库${warehouse.name ? `「${warehouse.name}」` : ""}启用了仓位，请填写有效仓位`);
    }
};

const resolveRefId = async (
    model: any,
    mapped: Record<string, any>,
    idField: string,
    codeField: string,
    nameField: string
) => {
    const id = toText(mapped[idField]);
    if (id) return id;

    const code = toText(mapped[codeField]);
    const name = toText(mapped[nameField]);
    if (!code && !name) return "";

    const ref = await model
        .findOne({
            _isDeleted: { $ne: true },
            $or: [
                ...(code ? [{ code: code.toUpperCase() }] : []),
                ...(name ? [{ name }] : []),
            ],
        })
        .select("_id")
        .lean();

    return ref?._id?.toString?.() || "";
};

const splitLocationPath = (value: unknown) =>
    toText(value)
        .replace(/／/g, "/")
        .split("/")
        .map((item) => item.trim())
        .filter(Boolean);

const resolveLocationByPart = async (
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

const resolveLocationId = async (mapped: Record<string, any>) => {
    const id = toText(mapped.locationId);
    if (id) return id;

    const warehouseId = toText(mapped.warehouseId);
    if (!warehouseId) return "";

    const code = toText(mapped.locationCode);
    if (code) {
        return await resolveLocationByPart(warehouseId, code);
    }

    const parts = splitLocationPath(mapped.locationName);
    if (!parts.length) return "";

    if (parts.length === 1) {
        return await resolveLocationByPart(warehouseId, parts[0]);
    }

    let parentId: string | null = null;
    for (const part of parts) {
        parentId = await resolveLocationByPart(warehouseId, part, parentId);
        if (!parentId) return "";
    }

    return parentId || "";
};

/**
 * 从 xlsx (ZIP) 中解析内嵌图片，建立 rowNumber → imageBuffer 的映射
 */
const extractImagesFromXlsx = async (buffer: Buffer): Promise<Map<number, Buffer>> => {
    const JSZip = await import("jszip");
    const zip = await JSZip.loadAsync(buffer);

    const imageMap = new Map<number, Buffer>();

    // 列出 zip 内所有文件，方便调试
    const allFiles: string[] = [];
    zip.forEach((path) => allFiles.push(path));
    logger.info("[xlsx-images] ZIP 内文件列表: " + allFiles.join(", "));

    // 找到第一个工作表对应的 drawing 文件
    const sheetRelsEntry = zip.file("xl/worksheets/_rels/sheet1.xml.rels");
    if (!sheetRelsEntry) {
        logger.info("[xlsx-images] 未找到 xl/worksheets/_rels/sheet1.xml.rels");
        return imageMap;
    }

    const sheetRelsXml = await sheetRelsEntry.async("text");
    logger.info("[xlsx-images] sheet1.xml.rels 内容: " + sheetRelsXml);

    // 找到 drawing 的 rId → 文件路径
    const drawingIdMatch = sheetRelsXml.match(
        /Id="([^"]+)"[^>]+Type="[^"]*drawing[^"]*"[^>]+Target="([^"]+)"/
    );
    if (!drawingIdMatch) {
        logger.info("[xlsx-images] sheet1.xml.rels 中未找到 drawing 引用");
        return imageMap;
    }

    const drawingTarget = drawingIdMatch[2];
    const drawingPath = "xl/" + drawingTarget.replace(/^\.\.\//, "");
    logger.info("[xlsx-images] drawing 路径: " + drawingPath);

    const drawingEntry = zip.file(drawingPath);
    if (!drawingEntry) {
        logger.info("[xlsx-images] drawing 文件不存在: " + drawingPath);
        return imageMap;
    }

    const drawingXml = await drawingEntry.async("text");
    logger.info("[xlsx-images] drawing XML 长度: " + drawingXml.length);
    logger.info("[xlsx-images] drawing XML 前500字符: " + drawingXml.substring(0, 500));

    // 解析 drawing rels
    const drawingRelsPath = drawingPath.replace(/([^/]+)$/, "_rels/$1.rels");
    logger.info("[xlsx-images] drawing rels 路径: " + drawingRelsPath);
    const drawingRelsEntry = zip.file(drawingRelsPath);
    let relsMap = new Map<string, string>();
    if (drawingRelsEntry) {
        const relsXml = await drawingRelsEntry.async("text");
        logger.info("[xlsx-images] drawing rels 内容: " + relsXml);
        const relsRegex = /Id="([^"]+)"[^>]+Target="([^"]+)"/g;
        let relsMatch;
        while ((relsMatch = relsRegex.exec(relsXml)) !== null) {
            const target = relsMatch[2].replace(/^\.\.\//, "");
            relsMap.set(relsMatch[1], target);
        }
    } else {
        logger.info("[xlsx-images] drawing rels 文件不存在");
    }

    logger.info("[xlsx-images] relsMap 大小: " + relsMap.size);

    // 解析 drawing XML，提取每个图片的锚定行号和 rId
    const picBlocks = drawingXml.split(/<xdr:twoCellAnchor|<xdr:oneCellAnchor/);
    logger.info("[xlsx-images] picBlocks 数量: " + picBlocks.length);

    for (let i = 0; i < picBlocks.length; i++) {
        const block = picBlocks[i];
        if (!block.includes("<xdr:pic")) {
            continue;
        }

        logger.info("[xlsx-images] picBlock[" + i + "] 包含 xdr:pic");

        // 获取锚定行号
        const rowMatch = block.match(/<xdr:row>(\d+)<\/xdr:row>/);
        if (!rowMatch) {
            logger.info("[xlsx-images] picBlock[" + i + "] 未找到 row");
            continue;
        }
        const row = parseInt(rowMatch[1], 10);
        logger.info("[xlsx-images] picBlock[" + i + "] 锚定行号: " + row);

        // 获取图片引用 rId
        const embedMatch = block.match(/r:embed="([^"]+)"/);
        if (!embedMatch) {
            logger.info("[xlsx-images] picBlock[" + i + "] 未找到 r:embed");
            continue;
        }
        const rId = embedMatch[1];
        logger.info("[xlsx-images] picBlock[" + i + "] rId: " + rId);

        // 通过 rels 找到图片文件路径
        const mediaPath = relsMap.get(rId);
        if (!mediaPath) {
            logger.info("[xlsx-images] picBlock[" + i + "] relsMap 中未找到 " + rId);
            continue;
        }
        logger.info("[xlsx-images] picBlock[" + i + "] 图片路径: xl/" + mediaPath);

        // 读取图片二进制数据
        const imageEntry = zip.file("xl/" + mediaPath);
        if (!imageEntry) {
            logger.info("[xlsx-images] picBlock[" + i + "] 图片文件不存在: xl/" + mediaPath);
            continue;
        }

        const imageBuffer = await imageEntry.async("nodebuffer");
        // drawing 中 row 是 0-based，数据从 index 0 开始对应 drawing row 1
        // 存储时用 row 作为 key，查找时用 index + 2（因为表头占 row 0，数据从 row 2 开始）
        // 但 drawing row 1 对应数据 index 0，所以存储 key = row - 1 让 index + 2 匹配不上
        // 正确做法：直接用 drawing row 作为 key，查找时也用 drawing row
        logger.info("[xlsx-images] 图片 row=" + row + " 大小: " + imageBuffer.length + " bytes");
        imageMap.set(row + 1, imageBuffer);
    }

    logger.info("[xlsx-images] 最终 imageMap 大小: " + imageMap.size);
    return imageMap;
};

/**
 * 将图片 buffer 上传到图床，返回图片 URL
 */
const uploadImageToHost = async (imageBuffer: Buffer, rowNumber: number): Promise<string> => {
    try {
        const config = useRuntimeConfig();
        const formData = new FormData();
        formData.append(
            "image",
            new Blob([imageBuffer]),
            "product_" + rowNumber + ".png"
        );

        const headers: Record<string, string> = {};
        if (config.imageUploadSecret) {
            headers["X-Upload-Secret"] = config.imageUploadSecret;
        }

        const response = await fetch(IMAGE_UPLOAD_URL, {
            method: "POST",
            headers,
            body: formData,
        });

        const res: any = await response.json();

        if (res?.code === 200 && typeof res?.data?.path === "string") {
            return res.data.path;
        }

        logger.warn("Image upload failed for row " + rowNumber + ": " + JSON.stringify(res));
        return "";
    } catch (err: any) {
        logger.warn("Image upload error for row " + rowNumber + ": " + err?.message);
        return "";
    }
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

        // 从 xlsx 中提取内嵌图片
        let imageMap = new Map<number, Buffer>();
        try {
            imageMap = await extractImagesFromXlsx(filePart.data);
        } catch (err: any) {
            logger.warn("Failed to extract images from xlsx, continuing without images: " + err?.message);
        }

        // 获取表头，识别图片列
        const headers = Object.keys(rows[0]);
        const imageColumnKey = headers.find((key) =>
            IMAGE_COLUMN_NAMES.includes(normalizeHeader(key)) ||
            IMAGE_COLUMN_NAMES.includes(key)
        );

        const productModel = useInventoryProductModel();
        const errors: ImportError[] = [];
        const validRows: Array<{ rowNumber: number; mapped: Record<string, any>; imageBuffer: Buffer | null }> = [];

        // 第一阶段：校验所有行，解析引用
        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index];
            const rowNumber = index + 2;
            if (!Object.values(row).some((value) => toText(value))) continue;

            try {
                const mapped: Record<string, any> = {};
                for (const [key, value] of Object.entries(row)) {
                    // 跳过图片列，图片通过内嵌数据处理
                    if (imageColumnKey && key === imageColumnKey) continue;
                    const field = headerMap[normalizeHeader(key)];
                    if (!field) continue;
                    mapped[field] = toText(value);
                }

                applyWarehouseLocationText(mapped);

                mapped.categoryId = await resolveRefId(
                    InventoryCategory,
                    mapped,
                    "categoryId",
                    "categoryCode",
                    "categoryName"
                );
                mapped.unitId = await resolveRefId(InventoryUnit, mapped, "unitId", "unitCode", "unitName");
                mapped.warehouseId = await resolveRefId(
                    InventoryWarehouse,
                    mapped,
                    "warehouseId",
                    "warehouseCode",
                    "warehouseName"
                );
                mapped.locationId = await resolveLocationId(mapped);
                await assertWarehouseLocationSelected(mapped);

                for (const field of ["standardPrice", "averagePrice", "kitQuantity", "stockUpperLimit", "stockLowerLimit"]) {
                    if (mapped[field] !== undefined) {
                        mapped[field] = toNumber(mapped[field], field === "kitQuantity" ? 1 : 0);
                    }
                }
                if (mapped.isSaleable !== undefined) {
                    mapped.isSaleable = toBoolean(mapped.isSaleable, true);
                }
                if (mapped.snPrefixes !== undefined) {
                    mapped.snPrefixes = normalizeImportedSnPrefixes(mapped.snPrefixes);
                }

                // 通过 Excel 行号查找对应的内嵌图片（drawing 中行号 = index + 2）
                const imageBuffer = imageMap.get(index + 2) || null;
                const imgInfo = imageBuffer ? imageBuffer.length + "bytes" : "null";
                logger.info("[xlsx-images] 行 " + rowNumber + " (index=" + index + ", row=" + (index + 2) + "): imageBuffer=" + imgInfo);

                validRows.push({ rowNumber, mapped, imageBuffer });
            } catch (err: any) {
                errors.push({
                    row: rowNumber,
                    message: err?.message || "校验失败",
                });
            }
        }

        // 第二阶段：上传图片并写入产品
        let successCount = 0;
        for (const { rowNumber, mapped, imageBuffer } of validRows) {
            try {
                // 如果有内嵌图片，先上传到图床
                if (imageBuffer) {
                    const imageUrl = await uploadImageToHost(imageBuffer, rowNumber);
                    if (imageUrl) {
                        mapped.image = imageUrl;
                    }
                }

                await productModel.create(mapped, getInventoryActor(event));
                successCount += 1;
            } catch (err: any) {
                errors.push({
                    row: rowNumber,
                    message: err?.message || "导入失败",
                });
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
        logger.error("Import inventory product error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.INVENTORY_IMPORT_FAILED,
            msg: codeToMsg[CODE.INVENTORY_IMPORT_FAILED],
        };
    }
});
