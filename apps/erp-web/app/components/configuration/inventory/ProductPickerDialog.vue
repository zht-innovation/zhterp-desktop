<template>
    <div class="erp-dialog-mask product-picker-mask" @click.self="requestClose">
        <ErpDialogFrame
            class="product-picker-dialog"
            :title="title"
            width="1080px"
            height="760px"
            :form="false"
            :close-disabled="confirmLoading"
            @close="requestClose"
        >
            <div class="picker-filter-row">
                <div v-if="showCategoryFilter" class="filter-field">
                    <span>产品分类</span>
                    <div class="category-cascader" :class="{ open: isPickerCategoryMenuOpen }">
                        <button
                            class="category-trigger"
                            type="button"
                            @click="togglePickerCategoryMenu"
                        >
                            <span>{{ pickerDraftCategory || "请选择" }}</span>
                            <Icon name="lucide:chevron-down" class="category-trigger-icon" />
                        </button>
                        <div
                            class="category-menu"
                            :class="{ 'single-column': activePickerCategoryOptions.length === 0 }"
                        >
                            <div class="category-search-row">
                                <Icon name="lucide:search" />
                                <input
                                    v-model="pickerCategorySearchText"
                                    type="search"
                                    placeholder="搜索分类"
                                    @keydown.esc.stop.prevent="isPickerCategoryMenuOpen = false"
                                >
                            </div>
                            <div class="category-primary-list">
                                <button
                                    v-for="group in filteredPickerCategoryGroups"
                                    :key="group.id"
                                    class="category-primary-option"
                                    :class="{ active: activePickerCategoryGroup === group.id }"
                                    type="button"
                                    @click="handlePickerCategoryGroupClick(group)"
                                    @mouseenter="activePickerCategoryGroup = group.id"
                                >
                                    <span>{{ group.name }}</span>
                                    <Icon v-if="group.children.length" name="lucide:chevron-right" />
                                </button>
                            </div>
                            <div v-if="activePickerCategoryOptions.length" class="category-secondary-list">
                                <button
                                    v-for="category in activePickerCategoryOptions"
                                    :key="category.id"
                                    class="category-secondary-option"
                                    type="button"
                                    @click="selectPickerCategory(category)"
                                >
                                    {{ category.name }}
                                </button>
                            </div>
                            <div v-if="filteredPickerCategoryGroups.length === 0" class="category-empty">
                                暂无匹配分类
                            </div>
                        </div>
                    </div>
                </div>
                <button
                    v-if="showCategoryFilter"
                    class="outline-button"
                    type="button"
                    @click="resetPickerFilters"
                >
                    <Icon name="lucide:refresh-cw" class="button-icon" />
                    <span>重置</span>
                </button>
                <button
                    v-if="showCategoryFilter"
                    class="muted-button"
                    :class="{ active: hasPendingPickerFilters }"
                    type="button"
                    @click="applyPickerFilters"
                >
                    <Icon name="lucide:sliders-horizontal" class="button-icon" />
                    <span>筛选</span>
                </button>
                <button
                    v-if="showQuickCreateProduct"
                    class="primary-button quick-create-button"
                    type="button"
                    @click="openQuickProductDialog"
                >
                    <Icon name="lucide:circle-plus" class="button-icon" />
                    <span>新建产品</span>
                </button>
                <ErpSearchBox
                    v-model="pickerSearchText"
                    class="picker-search-box"
                    :placeholder="searchPlaceholder"
                    @search="applyPickerSearch"
                />
            </div>

            <div ref="pickerScrollRef" class="picker-table-wrap">
                <ErpTableFrame
                    class="picker-table"
                    :columns="pickerColumnTemplate"
                    :loading="isLoadingProducts"
                    :empty="products.length === 0"
                    loading-text="加载中..."
                    :empty-text="emptyText"
                    scroll-x
                    embedded
                >
                    <template #header>
                        <div class="table-row table-head picker-row">
                            <div class="table-cell checkbox-cell">
                                <label v-if="selectionMode === 'multiple'" class="checkbox-control">
                                    <input
                                        class="row-checkbox"
                                        type="checkbox"
                                        :checked="allPickerProductsSelected"
                                        @change="toggleSelectAllPickerProducts"
                                    >
                                </label>
                            </div>
                            <div
                                v-for="column in effectivePickerColumns"
                                :key="column.key"
                                class="table-cell"
                            >
                                {{ column.label }}
                            </div>
                        </div>
                    </template>

                    <label
                        v-for="product in products"
                        :key="'picker-' + getPickerProductSelectionKey(product)"
                        class="table-row data-row picker-row"
                    >
                        <span class="table-cell checkbox-cell">
                            <span class="checkbox-control">
                                <input
                                    class="row-checkbox"
                                    :type="selectionMode === 'single' ? 'radio' : 'checkbox'"
                                    name="picker-product"
                                    :value="getPickerProductSelectionKey(product)"
                                    :checked="selectedPickerProductIds.includes(getPickerProductSelectionKey(product))"
                                    :disabled="confirmLoading"
                                    @change="togglePickerProduct(product)"
                                >
                            </span>
                        </span>
                        <div
                            v-for="column in effectivePickerColumns"
                            :key="product.id + '-' + column.key"
                            class="table-cell"
                            :class="{ 'image-cell': column.key === 'image' }"
                        >
                            <template v-if="column.key === 'image'">
                                <img
                                    v-if="product.image"
                                    :src="product.image"
                                    :alt="product.model || product.id"
                                    class="clickable-image"
                                    title="点击查看大图"
                                    @click.stop.prevent="openImagePreview(product.image, product.model || product.id)"
                                >
                                <span v-else>--</span>
                            </template>
                            <span v-else>{{ getProductCellValue(product, column.key) }}</span>
                        </div>
                    </label>
                </ErpTableFrame>
            </div>

            <InventoryPagination
                v-model:page-size="pageSize"
                v-model:jump-page-input="jumpPageInput"
                class="picker-pagination"
                :total="totalPickerProducts"
                :page-size-options="pageSizeOptions"
                :page-numbers="pageNumbers"
                :total-pages="totalPages"
                :current-page="currentPage"
                @page-change="handlePickerPageChange"
                @jump="handlePickerJump"
            />

            <template #footer>
                <button class="dialog-button cancel" type="button" :disabled="confirmLoading" @click="requestClose">
                    取消
                </button>
                <button class="dialog-button confirm" type="button" :disabled="confirmLoading" @click="confirmProductSelection">
                    {{ confirmLoading ? "加载详情中" : "确认" }}
                </button>
            </template>
        </ErpDialogFrame>

        <div
            v-if="showQuickProductDialog"
            class="erp-dialog-mask quick-product-mask"
            @click.self="closeQuickProductDialog"
        >
            <ErpDialogFrame
                class="quick-product-dialog"
                title="新建产品"
                width="600px"
                :close-disabled="isQuickProductSubmitting"
                @close="closeQuickProductDialog"
                @submit.prevent="confirmQuickProductDialog"
            >
                <label class="form-row quick-product-form-row">
                    <span class="field-label">产品编号</span>
                    <input
                        v-model="quickProductForm.code"
                        class="dialog-input"
                        type="text"
                        :disabled="isQuickProductSubmitting"
                        placeholder="不填写则自动生成"
                    >
                </label>

                <label class="form-row quick-product-form-row">
                    <span class="field-label required">产品型号</span>
                    <input
                        v-model="quickProductForm.model"
                        class="dialog-input"
                        type="text"
                        :disabled="isQuickProductSubmitting"
                        required
                    >
                </label>

                <div class="form-row quick-product-form-row">
                    <span class="field-label required">产品分类</span>
                    <div class="quick-product-category-field">
                        <div
                            class="category-cascader quick-category-cascader"
                            :class="{ open: isQuickProductCategoryMenuOpen }"
                        >
                            <button
                                class="category-trigger"
                                type="button"
                                :disabled="isQuickProductSubmitting"
                                @click="toggleQuickProductCategoryMenu"
                            >
                                <span>{{ quickProductForm.category || "请选择" }}</span>
                                <Icon name="lucide:chevron-down" class="category-trigger-icon" />
                            </button>
                            <div
                                class="category-menu"
                                :class="{ 'single-column': activeQuickProductCategoryOptions.length === 0 }"
                            >
                                <div class="category-search-row">
                                    <Icon name="lucide:search" />
                                    <input
                                        v-model="quickProductCategorySearchText"
                                        type="search"
                                        placeholder="搜索分类"
                                        @keydown.esc.stop.prevent="isQuickProductCategoryMenuOpen = false"
                                    >
                                </div>
                                <div class="category-primary-list">
                                    <button
                                        v-for="group in filteredQuickProductCategoryGroups"
                                        :key="group.id"
                                        class="category-primary-option"
                                        :class="{ active: activeQuickProductCategoryGroup === group.id }"
                                        type="button"
                                        @click="handleQuickProductCategoryGroupClick(group)"
                                        @mouseenter="activeQuickProductCategoryGroup = group.id"
                                    >
                                        <span>{{ group.name }}</span>
                                        <Icon v-if="group.children.length" name="lucide:chevron-right" />
                                    </button>
                                </div>
                                <div v-if="activeQuickProductCategoryOptions.length" class="category-secondary-list">
                                    <button
                                        v-for="category in activeQuickProductCategoryOptions"
                                        :key="category.id"
                                        class="category-secondary-option"
                                        type="button"
                                        @click="selectQuickProductCategory(category)"
                                    >
                                        {{ category.name }}
                                    </button>
                                </div>
                                <div v-if="filteredQuickProductCategoryGroups.length === 0" class="category-empty">
                                    暂无匹配分类
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <template #footer>
                    <button
                        class="dialog-button cancel"
                        type="button"
                        :disabled="isQuickProductSubmitting"
                        @click="closeQuickProductDialog"
                    >
                        取消
                    </button>
                    <button
                        class="dialog-button confirm"
                        type="submit"
                        :disabled="isQuickProductSubmitting"
                    >
                        {{ isQuickProductSubmitting ? "提交中" : "确认" }}
                    </button>
                </template>
            </ErpDialogFrame>
        </div>

        <ImagePreviewDialog
            v-model="showImagePreview"
            :title="previewTitle"
            :images="previewImages"
            :z-index="imagePreviewZIndex"
        />
    </div>
</template>

<script setup lang="ts">
import type { InventoryProduct } from "~~/shared/types/inventory";
import type {
    ProductPickerCategoryOption,
    ProductPickerItem,
} from "~/composables/inventory/useInventoryProductPickerData";
import {
    normalizeProductPickerItem,
    useInventoryProductPickerData,
} from "~/composables/inventory/useInventoryProductPickerData";
import { addInventoryProduct } from "~/composables/api/useInventoryApi";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";

type ProductPickerSelectionMode = "single" | "multiple";

export interface ProductPickerLoadParams {
    keyword?: string;
    categoryId?: string;
    page: number;
    limit: number;
}

export interface ProductPickerLoadResult {
    list: ProductPickerItem[];
    pagination?: {
        page: number;
        limit: number;
        total: number;
        hasMore: boolean;
    };
    hasMore?: boolean;
    page?: number;
}

export interface ProductPickerColumn {
    key:
        | "id"
        | "name"
        | "model"
        | "category"
        | "image"
        | "totalQuantity"
        | "availableQuantity"
        | "unit"
        | "source"
        | "kitQuantity";
    label: string;
    width: number;
}

const props = withDefaults(defineProps<{
    title?: string;
    searchPlaceholder?: string;
    emptyText?: string;
    selectionMode?: ProductPickerSelectionMode;
    selectedProductIds?: string[];
    selectedProducts?: ProductPickerItem[];
    columns?: ProductPickerColumn[];
    showQuickCreateProduct?: boolean;
    showCategoryFilter?: boolean;
    productLoader?: (params: ProductPickerLoadParams) => Promise<ProductPickerLoadResult>;
    confirmLoading?: boolean;
    imagePreviewZIndex?: number;
}>(), {
    title: "选择产品",
    searchPlaceholder: "输入你想要寻找的内容",
    emptyText: "暂无匹配产品",
    selectionMode: "multiple",
    selectedProductIds: () => [],
    selectedProducts: () => [],
    showQuickCreateProduct: false,
    showCategoryFilter: true,
    productLoader: undefined,
    confirmLoading: false,
});

const emit = defineEmits<{
    close: [];
    confirm: [products: ProductPickerItem[]];
}>();

const defaultPickerColumns: ProductPickerColumn[] = [
    { key: "id", label: "产品编号", width: 150 },
    { key: "model", label: "型号", width: 180 },
    { key: "category", label: "分类", width: 180 },
    { key: "image", label: "产品图片", width: 140 },
    { key: "totalQuantity", label: "全部数量", width: 120 },
    { key: "availableQuantity", label: "可用数量", width: 120 },
    { key: "unit", label: "单位", width: 90 },
    { key: "source", label: "来源", width: 110 },
];

const effectivePickerColumns = computed(() =>
    props.columns?.length ? props.columns : defaultPickerColumns,
);

const isPickerCategoryMenuOpen = ref(false);
const pickerScrollRef = ref<HTMLDivElement | null>(null);
const pickerSearchText = ref("");
const pickerCategorySearchText = ref("");
const pickerDraftCategory = ref("");
const pickerDraftCategoryId = ref("");
const pickerAppliedCategoryId = ref("");
const activePickerCategoryGroup = ref("");
const activeQuickProductCategoryGroup = ref("");
const quickProductCategorySearchText = ref("");
const selectedPickerProductIds = ref<string[]>([...props.selectedProductIds]);
const selectedPickerProductMap = ref<Map<string, ProductPickerItem>>(new Map());
const customTotalProducts = ref(0);
const isCustomLoading = ref(false);
const showQuickProductDialog = ref(false);
const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");
const isQuickProductCategoryMenuOpen = ref(false);
const isQuickProductSubmitting = ref(false);
const quickProductForm = reactive({
    code: "",
    model: "",
    categoryId: "",
    category: "",
});
const {
    products,
    productCategoryTree,
    isLoadingProducts: isInvLoading,
    totalProducts: invTotalProducts,
    loadProducts: loadInvProducts,
    loadCategories,
} = useInventoryProductPickerData();
const {
    pageSizeOptions,
    pageSize,
    pageNumbers,
    totalPages,
    currentPage,
    jumpPageInput,
    setTotalItems,
    goToPage,
    jumpToInputPage,
} = useInventoryPagination({
    pageSizeOptions: [10, 20, 30, 50],
    initialPageSize: 30,
});
let customLoadPromise: Promise<void> | null = null;
let hasMountedPicker = false;

const pickerColumnTemplate = computed(() =>
    [
        "58px",
        ...effectivePickerColumns.value.map((column) => `${column.width}px`),
    ].join(" "),
);

const openImagePreview = (url: string, title: string) => {
    previewImages.value = [{ url, alt: title }];
    previewTitle.value = title;
    showImagePreview.value = true;
};

const filterProductCategoryGroups = (keyword: string) => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (!normalizedKeyword) {
        return productCategoryTree.value;
    }

    return productCategoryTree.value
        .map((group) => {
            const groupMatched = group.name.toLowerCase().includes(normalizedKeyword);
            const matchedChildren = group.children.filter((category) =>
                category.name.toLowerCase().includes(normalizedKeyword),
            );

            if (groupMatched) {
                return group;
            }

            if (matchedChildren.length) {
                return {
                    ...group,
                    children: matchedChildren,
                };
            }

            return null;
        })
        .filter((group): group is ProductPickerCategoryOption => Boolean(group));
};
const filteredPickerCategoryGroups = computed(() =>
    filterProductCategoryGroups(pickerCategorySearchText.value),
);
const filteredQuickProductCategoryGroups = computed(() =>
    filterProductCategoryGroups(quickProductCategorySearchText.value),
);
const activePickerCategoryOptions = computed(() =>
    filteredPickerCategoryGroups.value.find((group) => group.id === activePickerCategoryGroup.value)?.children ?? [],
);
const activeQuickProductCategoryOptions = computed(() =>
    filteredQuickProductCategoryGroups.value.find((group) => group.id === activeQuickProductCategoryGroup.value)?.children ?? [],
);
const hasPendingPickerFilters = computed(() =>
    pickerDraftCategoryId.value !== pickerAppliedCategoryId.value,
);
const hasCustomLoader = computed(() => Boolean(props.productLoader));
const isLoadingProducts = computed(() =>
    hasCustomLoader.value ? isCustomLoading.value : isInvLoading.value,
);
const getPickerProductSelectionKey = (product: ProductPickerItem) =>
    product.selectionKey || product.id;
const totalPickerProducts = computed(() =>
    hasCustomLoader.value ? customTotalProducts.value : invTotalProducts.value,
);
const allPickerProductsSelected = computed(() =>
    products.value.length > 0 &&
    products.value.every((product) =>
        selectedPickerProductIds.value.includes(getPickerProductSelectionKey(product)),
    ),
);

const syncSelectedProductMap = () => {
    const nextMap = new Map<string, ProductPickerItem>();
    const selectedIds = new Set(selectedPickerProductIds.value);

    props.selectedProducts.forEach((product) => {
        const selectionKey = getPickerProductSelectionKey(product);
        if (selectedIds.has(selectionKey)) {
            nextMap.set(selectionKey, product);
        }
    });
    selectedPickerProductMap.value.forEach((product, productId) => {
        if (selectedIds.has(productId)) {
            nextMap.set(productId, product);
        }
    });
    products.value.forEach((product) => {
        const selectionKey = getPickerProductSelectionKey(product);
        if (selectedIds.has(selectionKey)) {
            nextMap.set(selectionKey, product);
        }
    });

    selectedPickerProductMap.value = nextMap;
};

const loadCustomProducts = async (options: {
    reset?: boolean;
    page?: number;
    limit?: number;
} = {}) => {
    if (!props.productLoader || customLoadPromise) {
        return customLoadPromise || undefined;
    }

    if (options.reset) {
        products.value = [];
    }

    isCustomLoading.value = true;
    customLoadPromise = (async () => {
        try {
            const page = options.page || currentPage.value;
            const limit = options.limit || pageSize.value;
            const res = await props.productLoader!({
                keyword: pickerSearchText.value.trim() || undefined,
                categoryId: pickerAppliedCategoryId.value || undefined,
                page,
                limit,
            });
            const nextProducts = Array.isArray(res.list) ? res.list : [];

            products.value = nextProducts;
            customTotalProducts.value = Number(res.pagination?.total || nextProducts.length);
        } catch (err: any) {
            products.value = [];
            customTotalProducts.value = 0;
            ElMessage.error(err?.data?.msg || err?.message || "获取产品列表失败");
        } finally {
            isCustomLoading.value = false;
            customLoadPromise = null;
        }
    })();

    return customLoadPromise;
};

const loadPickerProducts = async (options: {
    reset?: boolean;
    keyword?: string;
    categoryId?: string;
    page?: number;
    limit?: number;
} = {}) => {
    const loadOptions = {
        ...options,
        page: options.page || currentPage.value,
        limit: options.limit || pageSize.value,
    };

    if (hasCustomLoader.value) {
        await loadCustomProducts(loadOptions);
        return;
    }

    await loadInvProducts(loadOptions);
};

const scrollPickerToTop = async () => {
    await nextTick();
    pickerScrollRef.value
        ?.querySelector<HTMLElement>(".erp-table-frame__scroll")
        ?.scrollTo({ top: 0, behavior: "auto" });
};

const refreshPickerProducts = async (options: { resetPage?: boolean } = {}) => {
    if (options.resetPage) {
        goToPage(1);
    }

    await loadPickerProducts({
        reset: true,
        keyword: pickerSearchText.value.trim(),
        categoryId: pickerAppliedCategoryId.value,
        page: currentPage.value,
        limit: pageSize.value,
    });
    syncSelectedProductMap();
    await scrollPickerToTop();
};

const handlePickerPageChange = async (page: number) => {
    goToPage(page);
    await refreshPickerProducts();
};

const handlePickerJump = async () => {
    jumpToInputPage();
    await refreshPickerProducts();
};

watch(
    () => props.selectedProductIds,
    (selectedIds) => {
        selectedPickerProductIds.value = [...selectedIds];
        syncSelectedProductMap();
    },
);

watch(
    () => props.selectedProducts,
    () => {
        syncSelectedProductMap();
    },
);

watch(totalPickerProducts, (total) => setTotalItems(total), { immediate: true });

watch(pageSize, async () => {
    if (!hasMountedPicker) {
        return;
    }

    await refreshPickerProducts({ resetPage: true });
});

watch(
    productCategoryTree,
    (categoryTree) => {
        if (!activePickerCategoryGroup.value) {
            activePickerCategoryGroup.value = categoryTree[0]?.id || "";
        }
        if (!activeQuickProductCategoryGroup.value) {
            activeQuickProductCategoryGroup.value = categoryTree[0]?.id || "";
        }
    },
    { immediate: true },
);

watch(filteredPickerCategoryGroups, (groups) => {
    if (
        isPickerCategoryMenuOpen.value &&
        !groups.some((group) => group.id === activePickerCategoryGroup.value)
    ) {
        activePickerCategoryGroup.value = groups[0]?.id || "";
    }
});

watch(filteredQuickProductCategoryGroups, (groups) => {
    if (
        isQuickProductCategoryMenuOpen.value &&
        !groups.some((group) => group.id === activeQuickProductCategoryGroup.value)
    ) {
        activeQuickProductCategoryGroup.value = groups[0]?.id || "";
    }
});

const togglePickerCategoryMenu = () => {
    isPickerCategoryMenuOpen.value = !isPickerCategoryMenuOpen.value;
    if (!isPickerCategoryMenuOpen.value) {
        pickerCategorySearchText.value = "";
    }
};

const toggleQuickProductCategoryMenu = () => {
    isQuickProductCategoryMenuOpen.value = !isQuickProductCategoryMenuOpen.value;
    if (!isQuickProductCategoryMenuOpen.value) {
        quickProductCategorySearchText.value = "";
    }
};

const applyPickerFilters = async () => {
    pickerAppliedCategoryId.value = pickerDraftCategoryId.value;
    await refreshPickerProducts({ resetPage: true });
};

const applyPickerSearch = async () => {
    await refreshPickerProducts({ resetPage: true });
};

const resetPickerFilters = async () => {
    pickerDraftCategory.value = "";
    pickerDraftCategoryId.value = "";
    pickerAppliedCategoryId.value = "";
    isPickerCategoryMenuOpen.value = false;
    pickerCategorySearchText.value = "";
    await refreshPickerProducts({ resetPage: true });
};

const selectPickerCategory = (category: ProductPickerCategoryOption) => {
    pickerDraftCategory.value = category.name;
    pickerDraftCategoryId.value = category.id;
    isPickerCategoryMenuOpen.value = false;
    pickerCategorySearchText.value = "";
};

const handlePickerCategoryGroupClick = (group: ProductPickerCategoryOption) => {
    activePickerCategoryGroup.value = group.id;
    selectPickerCategory(group);
};

const selectQuickProductCategory = (category: ProductPickerCategoryOption) => {
    quickProductForm.category = category.name;
    quickProductForm.categoryId = category.id;
    isQuickProductCategoryMenuOpen.value = false;
    quickProductCategorySearchText.value = "";
};

const handleQuickProductCategoryGroupClick = (group: ProductPickerCategoryOption) => {
    activeQuickProductCategoryGroup.value = group.id;
    selectQuickProductCategory(group);
};

const resetQuickProductForm = () => {
    quickProductForm.code = "";
    quickProductForm.model = "";
    quickProductForm.categoryId = "";
    quickProductForm.category = "";
    isQuickProductCategoryMenuOpen.value = false;
    quickProductCategorySearchText.value = "";
};

const openQuickProductDialog = async () => {
    if (!props.showQuickCreateProduct) {
        return;
    }

    resetQuickProductForm();
    showQuickProductDialog.value = true;
    await loadCategories();
    activeQuickProductCategoryGroup.value = productCategoryTree.value[0]?.id || "";
};

const closeQuickProductDialog = () => {
    if (isQuickProductSubmitting.value) {
        return;
    }

    showQuickProductDialog.value = false;
    resetQuickProductForm();
};

const selectCreatedProduct = (product: ProductPickerItem) => {
    const selectionKey = getPickerProductSelectionKey(product);
    if (!selectionKey) {
        return;
    }

    if (props.selectionMode === "single") {
        selectedPickerProductIds.value = [selectionKey];
        selectedPickerProductMap.value = new Map([[selectionKey, product]]);
        return;
    }

    selectedPickerProductIds.value = [
        ...new Set([...selectedPickerProductIds.value, selectionKey]),
    ];
    selectedPickerProductMap.value = new Map([
        ...selectedPickerProductMap.value,
        [selectionKey, product],
    ]);
};

const confirmQuickProductDialog = async () => {
    if (isQuickProductSubmitting.value) {
        return;
    }

    const model = quickProductForm.model.trim();
    if (!model) {
        ElMessage.warning("请输入产品型号");
        return;
    }
    if (!quickProductForm.categoryId) {
        ElMessage.warning("请选择产品分类");
        return;
    }

    isQuickProductSubmitting.value = true;
    try {
        const formData = new FormData();
        if (quickProductForm.code.trim()) {
            formData.append("code", quickProductForm.code.trim().toUpperCase());
        }
        formData.append("model", model);
        formData.append("categoryId", quickProductForm.categoryId);

        const res = await addInventoryProduct(formData);
        if (res.code !== 200 || !res.data?.detail) {
            ElMessage.error(res.msg || "新建产品失败");
            return;
        }

        const createdProduct = normalizeProductPickerItem(res.data.detail as InventoryProduct);
        selectCreatedProduct(createdProduct);
        showQuickProductDialog.value = false;
        resetQuickProductForm();
        await refreshPickerProducts();
        if (createdProduct.id && !products.value.some((product) => product.id === createdProduct.id)) {
            products.value = [createdProduct, ...products.value];
        }
        syncSelectedProductMap();
        ElMessage.success("新建产品成功");
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "新建产品失败");
    } finally {
        isQuickProductSubmitting.value = false;
    }
};

const toggleSelectAllPickerProducts = () => {
    if (allPickerProductsSelected.value) {
        selectedPickerProductIds.value = selectedPickerProductIds.value.filter(
            (id) => !products.value.some((product) => getPickerProductSelectionKey(product) === id),
        );
        const nextMap = new Map(selectedPickerProductMap.value);
        products.value.forEach((product) => nextMap.delete(getPickerProductSelectionKey(product)));
        selectedPickerProductMap.value = nextMap;
        return;
    }

    selectedPickerProductIds.value = [
        ...new Set([
            ...selectedPickerProductIds.value,
            ...products.value.map(getPickerProductSelectionKey),
        ]),
    ];
    const nextMap = new Map(selectedPickerProductMap.value);
    products.value.forEach((product) => nextMap.set(getPickerProductSelectionKey(product), product));
    selectedPickerProductMap.value = nextMap;
};

const togglePickerProduct = (product: ProductPickerItem) => {
    const selectionKey = getPickerProductSelectionKey(product);
    if (props.selectionMode === "single") {
        selectedPickerProductIds.value = [selectionKey];
        selectedPickerProductMap.value = new Map([[selectionKey, product]]);
        return;
    }

    if (selectedPickerProductIds.value.includes(selectionKey)) {
        selectedPickerProductIds.value = selectedPickerProductIds.value.filter(
            (id) => id !== selectionKey,
        );
        const nextMap = new Map(selectedPickerProductMap.value);
        nextMap.delete(selectionKey);
        selectedPickerProductMap.value = nextMap;
        return;
    }

    selectedPickerProductIds.value = [...selectedPickerProductIds.value, selectionKey];
    selectedPickerProductMap.value = new Map([
        ...selectedPickerProductMap.value,
        [selectionKey, product],
    ]);
};

const handleOutsideClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;

    if (target?.closest(".category-cascader")) {
        return;
    }

    isPickerCategoryMenuOpen.value = false;
    isQuickProductCategoryMenuOpen.value = false;
};

const confirmProductSelection = () => {
    if (props.confirmLoading) {
        return;
    }

    const selectedProducts = selectedPickerProductIds.value
        .map((productId) => selectedPickerProductMap.value.get(productId))
        .filter((product): product is ProductPickerItem => Boolean(product));

    if (!selectedProducts.length) {
        if (props.selectionMode === "multiple") {
            emit("confirm", []);
        }
        return;
    }

    emit("confirm", props.selectionMode === "single" ? [selectedProducts[0]] : selectedProducts);
};

const requestClose = () => {
    if (!props.confirmLoading) {
        emit("close");
    }
};

const getProductCellValue = (
    product: ProductPickerItem,
    key: ProductPickerColumn["key"],
) => {
    const value = product[key];
    return value === undefined || value === null || value === "" ? "--" : String(value);
};

onMounted(async () => {
    syncSelectedProductMap();
    document.addEventListener("click", handleOutsideClick);
    const loadTasks: Promise<unknown>[] = [refreshPickerProducts({ resetPage: true })];

    if (props.showCategoryFilter || props.showQuickCreateProduct) {
        const categoryLoadTask = loadCategories();

        if (categoryLoadTask) {
            loadTasks.push(categoryLoadTask);
        }
    }

    await Promise.all(loadTasks);
    syncSelectedProductMap();
    hasMountedPicker = true;
});

onBeforeUnmount(() => {
    document.removeEventListener("click", handleOutsideClick);
});
</script>

<style scoped>
.product-picker-mask {
    z-index: 50;
}

.product-picker-dialog :deep(.erp-dialog-frame__body) {
    grid-template-rows: 40px minmax(0, 1fr) 52px;
    align-content: stretch;
    overflow: hidden;
}

.picker-filter-row,
.filter-field {
    display: flex;
    align-items: center;
}

.picker-filter-row {
    gap: var(--erp-spacing-12);
}

.filter-field {
    flex: 0 0 auto;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.category-cascader {
    position: relative;
    width: 200px;
}

.category-trigger {
    width: 100%;
    height: var(--erp-size-control-height-sm);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
}

.category-trigger-icon {
    width: 12px;
    height: 12px;
    flex: 0 0 12px;
    color: var(--erp-color-icon-default);
}

.category-menu {
    position: absolute;
    top: calc(100% + var(--erp-spacing-8));
    left: 0;
    z-index: 30;
    width: 376px;
    min-height: 124px;
    max-height: 360px;
    display: none;
    grid-template-columns: 174px 1fr;
    grid-template-rows: 38px minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.category-menu.single-column {
    width: 176px;
    grid-template-columns: 174px;
}

.category-search-row {
    grid-column: 1 / -1;
    height: 38px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: var(--erp-spacing-4) 10px;
    border-bottom: 1px solid var(--erp-color-divider-subtle);
    color: var(--erp-color-text-placeholder);
    background: var(--erp-color-fill-default);
}

.category-search-row :deep(svg) {
    width: 15px;
    height: 15px;
    flex: 0 0 auto;
}

.category-search-row input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    color: var(--erp-color-text-primary);
    background: transparent;
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.category-search-row input::placeholder {
    color: var(--erp-color-text-placeholder);
}

.category-cascader.open .category-menu {
    display: grid;
}

.category-primary-list,
.category-secondary-list {
    min-height: 0;
    overflow-y: auto;
    padding: var(--erp-spacing-4) 6px;
    overscroll-behavior: contain;
}

.category-primary-list {
    border-right: 1px solid var(--erp-color-divider-subtle);
}

.category-menu.single-column .category-primary-list {
    border-right-color: transparent;
}

.category-primary-option,
.category-secondary-option {
    width: 100%;
    height: var(--erp-size-control-height-sm);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: transparent;
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
}

.category-primary-option.active,
.category-primary-option:hover,
.category-secondary-option:hover {
    background: var(--erp-color-fill-hover);
}

.category-primary-option :deep(svg) {
    width: 18px;
    height: 18px;
}

.category-secondary-option {
    justify-content: flex-start;
}

.category-empty {
    grid-column: 1 / -1;
    min-height: 86px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.outline-button,
.muted-button,
.primary-button {
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
    cursor: pointer;
}

.outline-button {
    border: 1px solid var(--erp-color-border-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
}

.muted-button {
    border: 0;
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

.muted-button.active,
.primary-button {
    border: 0;
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.primary-button:not(:disabled):active,
.muted-button.active:not(:disabled):active {
    background: var(--erp-color-action-primary-pressed);
}

.button-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.quick-create-button {
    flex: 0 0 auto;
    margin-left: auto;
}

.product-picker-dialog .picker-search-box {
    width: 320px;
    flex: 0 0 320px;
    margin-left: auto;
}

.quick-create-button + .picker-search-box {
    margin-left: 0;
}

.picker-table-wrap,
.picker-table {
    min-width: 0;
    min-height: 0;
    height: 100%;
}

.picker-table .picker-row {
    width: max-content;
    min-width: 100%;
}

.picker-table .data-row {
    height: 80px;
    cursor: pointer;
}

.picker-table .table-cell {
    overflow: hidden;
    text-overflow: ellipsis;
}

.picker-table :deep(.empty-row) {
    width: max-content;
    min-width: 100%;
    height: 80px;
}

.image-cell img {
    width: 90px;
    height: 58px;
    object-fit: contain;
}

.clickable-image {
    cursor: pointer;
}

.quick-product-mask {
    z-index: 60;
}

.quick-product-dialog {
    overflow: visible;
}

.quick-product-dialog :deep(.erp-dialog-frame__body) {
    overflow: visible;
}

.quick-product-category-field,
.quick-category-cascader {
    width: 100%;
}

.quick-category-cascader .category-trigger {
    width: 100%;
}

.quick-category-cascader .category-menu {
    top: auto;
    bottom: calc(100% + var(--erp-spacing-8));
}

.dialog-input:disabled,
.category-trigger:disabled {
    border-color: var(--erp-color-border-muted);
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
    cursor: not-allowed;
}

/* Screenshot-aligned product picker refinements. */
.product-picker-mask {
    background: rgb(22 34 48 / 42%);
}

.product-picker-dialog {
    width: min(1160px, calc(100vw - 48px));
    height: min(700px, calc(100vh - 48px));
    border-color: #e0e6ec;
    border-radius: 8px;
    background: #ffffff;
    box-shadow: 0 18px 46px rgb(31 45 61 / 16%);
}

.product-picker-dialog :deep(.erp-dialog-frame__header) {
    min-height: 56px;
    padding: 0 18px;
    border-bottom-color: #edf0f3;
}

.product-picker-dialog :deep(.erp-dialog-frame__title) {
    color: #303944;
    font-size: 16px;
    font-weight: 600;
}

.product-picker-dialog :deep(.erp-dialog-frame__body) {
    grid-template-rows: 40px minmax(0, 1fr) 52px;
    gap: 12px;
    padding: 16px;
    background: #f8fafc;
}

.product-picker-dialog .picker-filter-row {
    gap: 10px;
    padding: 4px 0;
}

.product-picker-dialog .filter-field {
    gap: 8px;
    color: #414a55;
    font-size: 13px;
}

.product-picker-dialog .category-trigger {
    height: 32px;
    border-color: #dfe4ea;
    border-radius: 5px;
    color: #4a5560;
    font-size: 13px;
}

.product-picker-dialog .outline-button,
.product-picker-dialog .muted-button,
.product-picker-dialog .primary-button {
    height: 32px;
    padding: 0 10px;
    border-radius: 5px;
    font-size: 13px;
}

.product-picker-dialog .outline-button {
    border-color: #d9e0e7;
    color: #59636f;
}

.product-picker-dialog .muted-button {
    background: #c9d2dc;
}

.product-picker-dialog .muted-button.active,
.product-picker-dialog .primary-button {
    background: #3da9e9;
}

.product-picker-dialog .picker-search-box {
    height: 32px;
    border: 1px solid #e1e7ed;
    border-radius: 5px;
    background: #ffffff;
}

.product-picker-dialog .picker-table-wrap,
.product-picker-dialog .picker-table {
    border: 1px solid #e1e7ed;
    border-radius: 6px;
    background: #ffffff;
}

.product-picker-dialog .picker-table .picker-row {
    min-width: 100%;
}

.product-picker-dialog .picker-table .table-head {
    height: 46px;
    color: #39434e;
    background: #f1f5f9;
    font-size: 13px;
    font-weight: 600;
}

.product-picker-dialog .picker-table .data-row {
    height: 72px;
    color: #4e5964;
    border-bottom: 1px solid #edf0f3;
    font-size: 13px;
}

.product-picker-dialog .picker-table .data-row:hover {
    background: #f8fbfd;
}

.product-picker-dialog .image-cell img {
    width: 56px;
    height: 48px;
    object-fit: contain;
}

.product-picker-dialog :deep(.erp-dialog-frame__actions) {
    min-height: 64px;
    padding: 12px 16px;
    border-top-color: #edf0f3;
}

.product-picker-dialog :deep(.dialog-button) {
    width: 92px;
    height: 34px;
    border-radius: 5px;
    font-size: 13px;
}

.product-picker-dialog :deep(.dialog-button.confirm) {
    border-color: #3da9e9;
    background: #3da9e9;
}

@media (max-width: 760px) {
    .product-picker-dialog {
        width: calc(100vw - 24px);
        height: calc(100vh - 24px);
    }

    .product-picker-dialog .picker-filter-row {
        flex-wrap: wrap;
        height: auto;
    }

    .product-picker-dialog :deep(.erp-dialog-frame__body) {
        grid-template-rows: auto minmax(0, 1fr) auto;
        padding: 12px;
    }
}
</style>
