import type { InventoryLocation, InventoryStock } from "~~/shared/types/inventory";
import {
    retrieveInventoryStocks,
    scanInventoryLocation,
} from "~/composables/api/useInventoryApi";
import {
    toInventoryEntityId,
    type ProductPickerItem,
} from "~/composables/inventory/useInventoryProductPickerData";
import { formatOneDecimalText } from "~/utils/inventoryNumberFormat";

export interface ScannedInventoryLocation {
    id: string;
    code: string;
    name: string;
    warehouseId: string;
    warehouseCode: string;
    warehouseName: string;
}

export interface LocationProductLoadParams {
    keyword?: string;
    categoryId?: string;
    page: number;
    limit: number;
}

export interface LocationProductLoadOptions {
    includeAssignedProducts?: boolean;
    availableOnly?: boolean;
}

export const extractInventoryLocationCode = (scanCode: string) => {
    const segments = scanCode
        .trim()
        .split(/[\/／]/)
        .map((segment) => segment.trim())
        .filter(Boolean);

    return segments.at(-1) || "";
};

export const lookupInventoryLocationByScanCode = async (
    scanCode: string,
): Promise<ScannedInventoryLocation> => {
    const code = extractInventoryLocationCode(scanCode);
    if (!code) {
        throw new Error("请扫描或输入仓位码");
    }

    const res = await scanInventoryLocation({ code }).catch((err: any) => {
        throw new Error(err?.data?.msg || err?.message || "扫码查询仓位失败");
    });

    if (res.code !== 200) {
        throw new Error(res.msg || "扫码查询仓位失败");
    }

    const location = res.data?.detail as InventoryLocation | undefined;
    if (!location) {
        throw new Error(`未找到仓位：${code}`);
    }

    const id = toInventoryEntityId(location._id);
    const warehouseId = toInventoryEntityId(location.warehouseId);
    if (!id || !warehouseId) {
        throw new Error("仓位资料不完整，请检查所属仓库");
    }

    return {
        id,
        code: location.code || code,
        name: location.name || location.code || code,
        warehouseId,
        warehouseCode: location.warehouseCode || "",
        warehouseName: location.warehouseName || "",
    };
};

const normalizeLocationStockProduct = (
    stock: InventoryStock,
    location: ScannedInventoryLocation,
): ProductPickerItem => ({
    backendId: toInventoryEntityId(stock.productId),
    id: stock.productCode || "",
    name: stock.productName || stock.model || "",
    model: stock.model || "",
    material: stock.material || "",
    category: stock.categoryPath || stock.categoryName || "未分类",
    categoryId: toInventoryEntityId(stock.categoryId),
    image: stock.image || "",
    totalQuantity: formatOneDecimalText(stock.totalQuantity, "0.0"),
    availableQuantity: formatOneDecimalText(stock.availableQuantity, "0.0"),
    unit: stock.unitName || "--",
    unitId: toInventoryEntityId(stock.unitId),
    source: "--",
    kitQuantity: formatOneDecimalText(stock.kitQuantity, "--"),
    standardPrice: 0,
    averagePrice: Number(stock.averagePrice || 0),
    machineNo: "",
    barcode: "",
    modelCode: "",
    snPrefixes: [],
    finishedCount: formatOneDecimalText(stock.kitQuantity, "--"),
    warehouseId: location.warehouseId,
    warehouseName: location.warehouseName,
    locationId: location.id,
    locationName: location.name,
});

export const loadInventoryLocationProducts = async (
    location: ScannedInventoryLocation,
    params: LocationProductLoadParams,
    options: LocationProductLoadOptions = {},
) => {
    const res = await retrieveInventoryStocks({
        warehouseId: location.warehouseId,
        locationId: location.id,
        keyword: params.keyword,
        categoryId: params.categoryId,
        includeAssignedProducts: options.includeAssignedProducts,
        paginateAssignedProducts: options.includeAssignedProducts,
        availableOnly: options.availableOnly,
        page: params.page,
        limit: params.limit,
    });

    if (res.code !== 200) {
        throw new Error(res.msg || "获取仓位产品失败");
    }

    const products = Array.isArray(res.data?.list)
        ? res.data.list.map((stock) => normalizeLocationStockProduct(stock, location))
        : [];

    return {
        list: products,
        pagination: res.data?.pagination || {
            page: params.page,
            limit: params.limit,
            total: products.length,
            hasMore: false,
        },
    };
};

export const getInventoryItemLocationKey = (
    productId: string,
    warehouseId: string,
    locationId: string,
) => [productId, warehouseId, locationId].join("::");
