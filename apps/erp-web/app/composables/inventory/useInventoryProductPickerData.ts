import type {
    InventoryCategory,
    InventoryProduct,
} from "~~/shared/types/inventory";
import {
    retrieveInventoryCategoryTree,
    retrieveInventoryProducts,
} from "~/composables/api/useInventoryApi";
import { formatOneDecimalText } from "~/utils/inventoryNumberFormat";

export interface ProductPickerItem {
    selectionKey?: string;
    backendId: string;
    id: string;
    name: string;
    model: string;
    material: string;
    category: string;
    categoryId: string;
    image: string;
    totalQuantity: string;
    availableQuantity: string;
    unit: string;
    unitId: string;
    source: string;
    kitQuantity: string;
    standardPrice: number;
    averagePrice: number;
    machineNo: string;
    barcode: string;
    modelCode: string;
    snPrefixes: string[];
    finishedCount: string;
    warehouseId: string;
    warehouseName: string;
    locationId: string;
    locationName: string;
}

export interface ProductPickerCategoryOption {
    id: string;
    code: string;
    name: string;
    parentId: string;
    children: ProductPickerCategoryOption[];
}

export const toInventoryEntityId = (value?: unknown) => {
    if (!value) {
        return "";
    }

    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "object" && value !== null && "toString" in value) {
        return String(value);
    }

    return "";
};

export const normalizeProductPickerItem = (product: InventoryProduct): ProductPickerItem => ({
    backendId: product._id || "",
    id: product.code || "",
    name: product.name || product.model || "",
    model: product.model || "",
    material: product.material || "",
    category: product.categoryPath || product.categoryName || "未分类",
    categoryId: toInventoryEntityId(product.categoryId),
    image: product.image || "",
    totalQuantity: formatOneDecimalText(product.totalQuantity, "--"),
    availableQuantity: formatOneDecimalText(product.availableQuantity, "--"),
    unit: product.unitName || "--",
    unitId: toInventoryEntityId(product.unitId),
    source: product.source || "--",
    kitQuantity: formatOneDecimalText(product.kitQuantity, "--"),
    standardPrice: Number(product.standardPrice || 0),
    averagePrice: Number(product.averagePrice || 0),
    machineNo: "",
    barcode: product.barcode || product.code || "",
    modelCode: product.modelCode || "",
    snPrefixes: Array.isArray(product.snPrefixes) ? product.snPrefixes : [],
    finishedCount: formatOneDecimalText(product.kitQuantity, "--"),
    warehouseId: toInventoryEntityId(product.warehouseId),
    warehouseName: product.warehouseName || "",
    locationId: toInventoryEntityId(product.locationId),
    locationName: product.locationName || "",
});

export const normalizeProductPickerCategoryOption = (
    category: InventoryCategory,
): ProductPickerCategoryOption => ({
    id: category._id || "",
    code: category.code || "",
    name: category.name || "",
    parentId: category.parentId ? String(category.parentId) : "",
    children: Array.isArray(category.children)
        ? category.children.map((child) =>
            normalizeProductPickerCategoryOption(child as InventoryCategory),
        )
        : [],
});

const normalizeScanText = (value: string) => value.trim().toUpperCase();
const normalizeSkuScanText = (value: string) => normalizeScanText(value).replace(/-/g, "");

const isValidSnDateText = (dateText: string) => {
    if (!/^\d{6}$/.test(dateText)) {
        return false;
    }

    const month = Number(dateText.slice(2, 4));
    const day = Number(dateText.slice(4, 6));

    return month >= 1 && month <= 12 && day >= 1 && day <= 31;
};

const getSnSkuCandidates = (scanCode: string) => {
    const normalizedCode = normalizeSkuScanText(scanCode);
    const candidates: string[] = [];

    for (let serialLength = 3; serialLength <= 8; serialLength += 1) {
        const dateEndIndex = normalizedCode.length - serialLength;
        const dateStartIndex = dateEndIndex - 6;

        if (dateStartIndex <= 0) {
            continue;
        }

        const dateText = normalizedCode.slice(dateStartIndex, dateEndIndex);
        const sku = normalizedCode.slice(0, dateStartIndex);

        if (sku && isValidSnDateText(dateText)) {
            candidates.push(sku);
        }
    }

    return [...new Set(candidates)];
};

const fetchProductsByKeyword = async (keyword: string) => {
    const productRes = await retrieveInventoryProducts({
        keyword,
        includeStock: true,
        page: 1,
        limit: 10,
    });

    if (productRes.code !== 200) {
        throw new Error(productRes.msg || "扫码查询产品失败");
    }

    return Array.isArray(productRes.data?.list)
        ? productRes.data.list.map(normalizeProductPickerItem)
        : [];
};

const findExactScanMatches = (products: ProductPickerItem[], keyword: string) => {
    const normalizedKeyword = normalizeScanText(keyword);
    const normalizedSkuKeyword = normalizeSkuScanText(keyword);

    return products.filter((product) => {
        return [product.barcode, product.id, product.modelCode].some((value) => {
            return normalizeScanText(value) === normalizedKeyword
                || normalizeSkuScanText(value) === normalizedSkuKeyword;
        })
        || (product.snPrefixes || []).some((prefix) => normalizeScanText(prefix) === normalizedSkuKeyword);
    });
};

const resolveScannedProduct = (products: ProductPickerItem[], keyword: string) => {
    const exactMatches = findExactScanMatches(products, keyword);

    if (exactMatches.length === 1) {
        return exactMatches[0];
    }

    if (exactMatches.length > 1 || products.length > 1) {
        throw new Error("找到多个匹配产品，请使用选择产品");
    }

    return null;
};

export const lookupInventoryProductByScanCode = async (scanCode: string) => {
    const keyword = scanCode.trim();

    if (!keyword) {
        throw new Error("请扫描或输入产品条码/编号");
    }

    const directMatch = resolveScannedProduct(await fetchProductsByKeyword(keyword), keyword);
    if (directMatch) {
        return directMatch;
    }

    const snSkuCandidates = getSnSkuCandidates(keyword);
    for (const skuCandidate of snSkuCandidates) {
        const snMatch = resolveScannedProduct(await fetchProductsByKeyword(skuCandidate), skuCandidate);
        if (snMatch) {
            return snMatch;
        }
    }

    throw new Error("未找到匹配产品");
};

export const useInventoryProductPickerData = () => {
    const productPageSize = 30;
    const products = ref<ProductPickerItem[]>([]);
    const productCategoryTree = ref<ProductPickerCategoryOption[]>([]);
    const productQuery = reactive({
        keyword: "",
        categoryId: "",
    });
    const isLoadingProducts = ref(false);
    const hasMoreProducts = ref(true);
    const totalProducts = ref(0);
    const currentProductPage = ref(1);
    const hasLoadedCategories = ref(false);
    let productLoadPromise: Promise<void> | null = null;
    let categoryLoadPromise: Promise<void> | null = null;

    const loadCategories = async () => {
        if (categoryLoadPromise) {
            return categoryLoadPromise;
        }

        if (hasLoadedCategories.value) {
            return;
        }

        categoryLoadPromise = (async () => {
            try {
                const categoryRes = await retrieveInventoryCategoryTree();

                if (categoryRes.code !== 200) {
                    ElMessage.error(categoryRes.msg || "获取产品分类失败");
                    productCategoryTree.value = [];
                } else {
                    productCategoryTree.value = Array.isArray(categoryRes.data?.tree)
                        ? categoryRes.data.tree.map(normalizeProductPickerCategoryOption)
                        : [];
                }

                hasLoadedCategories.value = true;
            } catch (err: any) {
                productCategoryTree.value = [];
                hasLoadedCategories.value = false;
                ElMessage.error(err?.data?.msg || err?.message || "获取产品分类失败");
            } finally {
                categoryLoadPromise = null;
            }
        })();

        return categoryLoadPromise;
    };

    const loadProducts = async (options: {
        reset?: boolean;
        keyword?: string;
        categoryId?: string;
        page?: number;
        limit?: number;
    } = {}) => {
        if (productLoadPromise) {
            return productLoadPromise;
        }

        if (typeof options.keyword === "string") {
            productQuery.keyword = options.keyword;
        }
        if (typeof options.categoryId === "string") {
            productQuery.categoryId = options.categoryId;
        }

        if (!options.reset && !options.page && !hasMoreProducts.value) {
            return;
        }

        if (options.reset) {
            products.value = [];
            currentProductPage.value = 1;
            hasMoreProducts.value = true;
        }

        isLoadingProducts.value = true;
        productLoadPromise = (async () => {
            try {
                const requestedPage = options.page || currentProductPage.value;
                const requestedLimit = options.limit || productPageSize;
                const productRes = await retrieveInventoryProducts({
                    keyword: productQuery.keyword || undefined,
                    categoryId: productQuery.categoryId || undefined,
                    includeStock: true,
                    page: requestedPage,
                    limit: requestedLimit,
                });

                if (productRes.code !== 200) {
                    ElMessage.error(productRes.msg || "获取产品列表失败");
                    hasMoreProducts.value = false;
                    totalProducts.value = 0;
                    return;
                }

                const nextProducts = Array.isArray(productRes.data?.list)
                    ? productRes.data.list.map(normalizeProductPickerItem)
                    : [];

                products.value = nextProducts;
                hasMoreProducts.value = Boolean(productRes.data?.pagination?.hasMore);
                totalProducts.value = Number(productRes.data?.pagination?.total || nextProducts.length);
                currentProductPage.value = productRes.data?.pagination?.page
                    ? productRes.data.pagination.page + 1
                    : requestedPage + 1;
            } catch (err: any) {
                ElMessage.error(err?.data?.msg || err?.message || "获取产品数据失败");
                totalProducts.value = 0;
            } finally {
                isLoadingProducts.value = false;
                productLoadPromise = null;
            }
        })();

        return productLoadPromise;
    };

    const loadMoreProducts = async () => loadProducts();

    return {
        products,
        productCategoryTree,
        isLoadingProducts,
        hasMoreProducts,
        totalProducts,
        loadProducts,
        loadMoreProducts,
        loadCategories,
    };
};
