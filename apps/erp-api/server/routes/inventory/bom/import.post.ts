import {
    assertInventoryWriteAccess,
    getInventoryActor,
    normalizeHeader,
    toBoolean,
    toText,
} from "~~/server/services/inventory";
import {
    type InventoryBomItemReq,
    useInventoryBomModel,
} from "~~/server/models/inventoryBom.model";
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

type MainField = "name" | "productCode" | "productModel" | "isEnabled" | "remark";
type ItemField = "productCode" | "productModel" | "quantity" | "sort";

type ProductLookup = {
    productCode?: unknown;
    productModel?: unknown;
};
type BomItemGroup = Partial<Record<ItemField, unknown>>;
type ParsedItemGroup = {
    groupIndex: number;
    group: BomItemGroup;
};
type BomImportDraft = {
    rowNumber: number;
    data: Record<MainField, unknown>;
    items: Array<ParsedItemGroup & { rowNumber: number }>;
};

const mainHeaderMap: Record<string, MainField> = {
    "bom名称": "name",
    "名称": "name",
    "name": "name",
    "主产品编号": "productCode",
    "主产品编码": "productCode",
    "主产品型号": "productModel",
    "产品编号": "productCode",
    "产品编码": "productCode",
    "产品型号": "productModel",
    "型号": "productModel",
    "productcode": "productCode",
    "productmodel": "productModel",
    "mainproductmodel": "productModel",
    "mainmodel": "productModel",
    "model": "productModel",
    "是否启用": "isEnabled",
    "isenabled": "isEnabled",
    "备注": "remark",
    "remark": "remark",
};

const itemFieldMap: Record<string, ItemField> = {
    "产品编号": "productCode",
    "产品编码": "productCode",
    "编号": "productCode",
    "编码": "productCode",
    "产品型号": "productModel",
    "型号": "productModel",
    "数量": "quantity",
    "产品数量": "quantity",
    "序号": "sort",
    "productcode": "productCode",
    "code": "productCode",
    "productmodel": "productModel",
    "model": "productModel",
    "quantity": "quantity",
    "qty": "quantity",
    "sort": "sort",
    "index": "sort",
    "no": "sort",
};

const singleItemHeaderMap: Record<string, ItemField> = {
    "子项产品序号": "sort",
    "子项序号": "sort",
    "子项产品编号": "productCode",
    "子项产品编码": "productCode",
    "子项编号": "productCode",
    "子项编码": "productCode",
    "子项产品型号": "productModel",
    "子项型号": "productModel",
    "子项产品数量": "quantity",
    "子项数量": "quantity",
    "itemproductcode": "productCode",
    "itemcode": "productCode",
    "itemproductmodel": "productModel",
    "itemmodel": "productModel",
    "itemquantity": "quantity",
    "itemqty": "quantity",
    "itemsort": "sort",
    "itemindex": "sort",
    "itemno": "sort",
};

const parseItemHeader = (header: string) => {
    const chineseMatch = header.match(/^子项(\d+)(产品编号|产品编码|编号|编码|产品型号|型号|产品数量|数量|序号)$/);
    if (chineseMatch) {
        const field = itemFieldMap[chineseMatch[2] || ""];
        if (!field) return null;

        return {
            index: Number(chineseMatch[1] || 0),
            field,
        };
    }

    const englishMatch = header.match(/^item(\d+)(productcode|code|productmodel|model|quantity|qty|sort|index|no)$/);
    if (englishMatch) {
        const field = itemFieldMap[englishMatch[2] || ""];
        if (!field) return null;

        return {
            index: Number(englishMatch[1] || 0),
            field,
        };
    }

    return null;
};

const createEmptyMainData = (): Record<MainField, unknown> => ({
    name: "",
    productCode: "",
    productModel: "",
    isEnabled: "",
    remark: "",
});

const hasMainContent = (data: Record<MainField, unknown>) =>
    Boolean(toText(data.name) || toText(data.productCode) || toText(data.productModel));

const hasItemContent = (group: BomItemGroup) =>
    Boolean(toText(group.productCode) || toText(group.productModel) || toText(group.quantity));

const parseBomImportRow = (row: Record<string, any>) => {
    const data = createEmptyMainData();
    const indexedItemGroups = new Map<number, BomItemGroup>();
    const singleItemGroup: BomItemGroup = {};

    Object.entries(row).forEach(([key, value]) => {
        const normalizedKey = normalizeHeader(key);
        const itemHeader = parseItemHeader(normalizedKey);

        if (itemHeader?.field && itemHeader.index > 0) {
            const group = indexedItemGroups.get(itemHeader.index) || {};
            group[itemHeader.field] = value;
            indexedItemGroups.set(itemHeader.index, group);
            return;
        }

        const singleItemField = singleItemHeaderMap[normalizedKey];
        if (singleItemField) {
            singleItemGroup[singleItemField] = value;
            return;
        }

        const mainField = mainHeaderMap[normalizedKey];
        if (mainField) {
            data[mainField] = value;
        }
    });

    const itemGroups: ParsedItemGroup[] = [...indexedItemGroups.entries()]
        .sort(([left], [right]) => left - right)
        .map(([groupIndex, group]) => ({ groupIndex, group }));

    if (hasItemContent(singleItemGroup)) {
        const sort = Number(toText(singleItemGroup.sort));
        itemGroups.push({
            groupIndex: Number.isFinite(sort) && sort > 0 ? sort : itemGroups.length + 1,
            group: singleItemGroup,
        });
    }

    return {
        data,
        hasMainData: hasMainContent(data),
        itemGroups,
    };
};

type RowError = Error & { row?: number };

const createRowError = (row: number, message: string): RowError =>
    Object.assign(new Error(message), { row });

const resolveProduct = async (
    productStore: ReturnType<typeof useInventoryProductModel>,
    lookup: ProductLookup,
    label: string,
) => {
    const productModel = toText(lookup.productModel);
    const productCode = toText(lookup.productCode);

    if (!productModel && !productCode) {
        throw new Error(`${label}型号或编号不能为空`);
    }

    let product: any = null;
    if (productModel) {
        const products = await productStore.product
            .find({
                model: productModel,
                _isDeleted: { $ne: true },
            })
            .select("_id code model")
            .limit(2)
            .lean() as any[];

        if (products.length > 1) {
            throw new Error(`${label}型号存在重复，请先维护产品型号唯一：${productModel}`);
        }

        product = products[0] || null;
    } else {
        product = await productStore.product
            .findOne({
                code: productCode.toUpperCase(),
                _isDeleted: { $ne: true },
            })
            .select("_id code model")
            .lean() as any;
    }

    if (!product) {
        const fieldName = productModel ? "型号" : "编号";
        throw new Error(`找不到${label}${fieldName}：${productModel || productCode}`);
    }

    if (productModel && productCode && product.code !== productCode.toUpperCase()) {
        throw new Error(`${label}型号和编号不匹配：${productModel} / ${productCode}`);
    }

    return product;
};

const parseQuantity = (value: unknown, label: string) => {
    const text = toText(value);
    const quantity = Number(text);

    if (!text || !Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`${label}数量必须大于0`);
    }

    return quantity;
};

export default defineEventHandler(async (event) => {
    assertInventoryWriteAccess(event);
    const actor = getInventoryActor(event);
    const formData = await readMultipartFormData(event);
    const file = formData?.find((item) => item.name === "file");

    if (!file?.data) {
        throw createError({ statusCode: 400, message: "请上传 Excel 文件" });
    }
    if (file.data.length > INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES) {
        throw createError({
            statusCode: 413,
            statusMessage: INVENTORY_IMPORT_FILE_SIZE_MESSAGE,
        });
    }

    const XLSX = await import("xlsx");
    const workbook = XLSX.read(file.data, { type: "buffer" });
    const sheetName = workbook.SheetNames?.[0];
    if (!sheetName) {
        throw createError({ statusCode: 400, message: "Excel 文件为空" });
    }

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: "" });

    if (!rows.length) {
        throw createError({ statusCode: 400, message: "Excel 文件为空" });
    }

    const productStore = useInventoryProductModel();
    const bomModel = useInventoryBomModel();
    const errors: ImportError[] = [];
    const drafts: BomImportDraft[] = [];
    let currentDraft: BomImportDraft | null = null;
    let successCount = 0;

    for (let index = 0; index < rows.length; index += 1) {
        const rowNumber = index + 2;
        const row = rows[index] || {};

        if (!Object.values(row).some((value) => toText(value))) {
            continue;
        }

        const parsed = parseBomImportRow(row);

        if (parsed.hasMainData) {
            if (currentDraft) {
                drafts.push(currentDraft);
            }

            currentDraft = {
                rowNumber,
                data: parsed.data,
                items: [],
            };
        } else if (!currentDraft && parsed.itemGroups.length) {
            errors.push({ row: rowNumber, message: "BOM名称或主产品型号不能为空" });
            continue;
        }

        if (!currentDraft) {
            continue;
        }

        parsed.itemGroups.forEach((itemGroup) => {
            currentDraft?.items.push({
                rowNumber,
                ...itemGroup,
            });
        });
    }

    if (currentDraft) {
        drafts.push(currentDraft);
    }

    for (const draft of drafts) {
        try {
            const name = toText(draft.data.name);
            if (!name) {
                throw createRowError(draft.rowNumber, "BOM名称不能为空");
            }

            const mainProduct = await resolveProduct(
                productStore,
                {
                    productCode: draft.data.productCode,
                    productModel: draft.data.productModel,
                },
                "主产品",
            );

            const items: InventoryBomItemReq[] = [];
            for (const { rowNumber, groupIndex, group } of draft.items) {
                const productCode = toText(group.productCode);
                const productModel = toText(group.productModel);
                const quantityText = toText(group.quantity);

                if (!productCode && !productModel && !quantityText) {
                    continue;
                }
                if (!productCode && !productModel) {
                    throw createRowError(rowNumber, `子项${groupIndex}产品型号或编号不能为空`);
                }

                try {
                    const product = await resolveProduct(
                        productStore,
                        { productCode, productModel },
                        `子项${groupIndex}产品`,
                    );
                    const sort = Number(toText(group.sort));
                    items.push({
                        productId: product._id?.toString?.() || "",
                        quantity: parseQuantity(group.quantity, `第${rowNumber}行子项`),
                        sort: Number.isFinite(sort) && sort > 0 ? sort : items.length,
                    });
                } catch (err: any) {
                    throw createRowError(rowNumber, err?.message || "子项导入失败");
                }
            }

            await bomModel.create({
                name,
                productId: mainProduct._id?.toString?.() || "",
                isEnabled: toBoolean(draft.data.isEnabled, true),
                remark: toText(draft.data.remark),
                items,
            }, actor);

            successCount += 1;
        } catch (err: any) {
            errors.push({ row: err?.row || draft.rowNumber, message: err?.message || "导入失败" });
        }
    }

    logger.info(`[BOM导入] 操作人: ${actor}, 成功: ${successCount}, 失败: ${errors.length}`);

    return {
        code: 200,
        data: {
            successCount,
            errorCount: errors.length,
            errors: errors.slice(0, 50),
        },
    };
});
