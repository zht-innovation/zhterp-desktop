<template>
    <div class="initiate-page">
        <header class="page-header">
            <ErpBreadcrumb icon="lucide:layers" :items="breadcrumbItems" />
            <ErpSearchBox
                v-model="cardSearch"
                placeholder="搜索可发起的审批"
                @search="applyCardSearch"
            />
        </header>

        <main class="application-area">
            <div class="application-area-heading">
                <NuxtLink
                    class="my-applications-link"
                    :to="{ path: '/configuration/approval', query: { view: 'mine' } }"
                >
                    <span>我的申请</span>
                    <Icon name="lucide:chevron-right" />
                </NuxtLink>
            </div>
            <div v-if="showBorrowCard || showPurchaseCard" class="application-grid">
                <article v-if="showBorrowCard" class="application-card">
                    <div class="application-copy">
                        <h2>借用申请</h2>
                        <p>提交物资借用申请单</p>
                    </div>
                    <button class="primary-button" type="button" :disabled="isLoadingReapplication" @click="openBorrowDialog">
                        立即申请
                    </button>
                </article>
<!--                <article v-if="showPurchaseCard" class="application-card">-->
<!--                    <div class="application-copy">-->
<!--                        <h2>采购申请</h2>-->
<!--                        <p>提交采购申请单</p>-->
<!--                    </div>-->
<!--                    <button class="primary-button" type="button" @click="showPurchaseDialog = true">-->
<!--                        立即申请-->
<!--                    </button>-->
<!--                </article>-->
            </div>
            <div v-else class="application-empty">
                <Icon name="lucide:search-x" />
                <span>未找到匹配的审批入口</span>
            </div>
        </main>

        <div v-if="showBorrowDialog" class="erp-dialog-mask" @click.self="closeBorrowDialog">
            <ErpDialogFrame
                class="borrow-application-dialog"
                title="借用申请"
                width="min(1240px, calc(100vw - 48px))"
                height="min(670px, calc(100vh - 48px))"
                :form="false"
                @close="closeBorrowDialog"
            >
                <div class="borrow-dialog-body">
                    <section class="form-section basic-info-section">
                        <h3>基本信息</h3>
                        <div class="info-grid">
                            <label class="borrow-form-row">
                                <span>借用人<i>*</i></span>
                                <input v-model="form.borrower" type="text" placeholder="请输入借用人">
                            </label>
                            <label class="borrow-form-row">
                                <span>预计归还时间<i>*</i></span>
                                <InventoryDatePicker
                                    v-model="form.expectedReturnDate"
                                    placeholder="请选择归还日期"
                                />
                            </label>
                            <label class="borrow-form-row reason-row">
                                <span>借用事由<i>*</i></span>
                                <textarea
                                    v-model="form.reason"
                                    maxlength="200"
                                    placeholder="请输入借用事由"
                                ></textarea>
                                <small>{{ form.reason.length }}/200</small>
                            </label>
                        </div>
                    </section>

                    <section class="form-section product-section">
                        <div class="product-actions">
                            <div class="product-action-left">
                                <h3>选择产品</h3>
                                <button class="primary-button" type="button" @click="showProductPicker = true">
                                    <Icon name="lucide:circle-plus" />
                                    <span>{{ selectedProducts.length ? `已选择 ${selectedProducts.length} 项` : "选择产品" }}</span>
                                </button>
                            </div>
                            <button
                                v-if="selectedProducts.length"
                                class="danger-text-button"
                                type="button"
                                @click="clearSelectedProducts"
                            >
                                <Icon name="lucide:trash-2" />
                                <span>清空</span>
                            </button>
                        </div>

                        <ErpTableFrame
                            class="selected-product-table"
                            columns="180px minmax(220px, 1fr) 160px 120px 140px 100px 80px"
                            :empty="selectedProducts.length === 0"
                            empty-text="请选择借用产品"
                            scroll-x
                            embedded
                        >
                            <template #header>
                                <div class="table-row table-head product-row">
                                    <div class="table-cell">产品编号</div>
                                    <div class="table-cell">型号</div>
                                    <div class="table-cell">分类</div>
                                    <div class="table-cell">产品图片</div>
                                    <div class="table-cell">借用数量</div>
                                    <div class="table-cell">单位</div>
                                    <div class="table-cell">操作</div>
                                </div>
                            </template>
                            <div
                                v-for="product in selectedProducts"
                                :key="product.backendId"
                                class="table-row data-row product-row"
                            >
                                <div class="table-cell">{{ product.id }}</div>
                                <div class="table-cell" :title="product.model">{{ product.model }}</div>
                                <div class="table-cell">{{ product.category }}</div>
                                <div class="table-cell product-image-cell">
                                    <button
                                        v-if="product.image"
                                        class="product-image-button"
                                        type="button"
                                        @click="openImagePreview(product.image, product.model)"
                                    >
                                        <img
                                            :src="product.image"
                                            :alt="product.model"
                                        >
                                    </button>
                                    <Icon v-else name="lucide:image" />
                                </div>
                                <div class="table-cell">
                                    <input
                                        :value="formatOneDecimalText(productQuantities[product.backendId], '0.0')"
                                        class="quantity-input"
                                        type="number"
                                        min="0"
                                        step="0.1"
                                        @change="updateProductQuantity(product.backendId, $event)"
                                    >
                                </div>
                                <div class="table-cell">{{ product.unit || "--" }}</div>
                                <div class="table-cell">
                                    <button class="delete-product-button" type="button" @click="removeSelectedProduct(product.backendId)">
                                        <Icon name="lucide:trash-2" />
                                    </button>
                                </div>
                            </div>
                        </ErpTableFrame>
                    </section>
                </div>

                <template #footer>
                    <button class="dialog-button cancel" type="button" @click="closeBorrowDialog">取消</button>
                    <button
                        class="dialog-button confirm"
                        type="button"
                        :disabled="isSubmitting"
                        @click="submitBorrowApplication"
                    >确认</button>
                </template>
            </ErpDialogFrame>
        </div>

        <PurchaseRequestDialog
            v-if="showPurchaseDialog"
            @close="showPurchaseDialog = false"
            @submitted="showPurchaseDialog = false"
            @saved="showPurchaseDialog = false"
        />

        <ProductPickerDialog
            v-if="showProductPicker"
            :selected-product-ids="selectedProducts.map((product) => product.backendId)"
            :selected-products="selectedProducts"
            :product-loader="loadBorrowPickerProducts"
            @close="showProductPicker = false"
            @confirm="handleProductConfirm"
        />

        <ImagePreviewDialog
            v-model="showImagePreview"
            :title="previewTitle"
            :images="previewImages"
        />
    </div>
</template>

<script setup lang="ts">
import { normalizeProductPickerItem, type ProductPickerItem } from "~/composables/inventory/useInventoryProductPickerData";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InventoryDatePicker from "~/components/configuration/inventory/InventoryDatePicker.vue";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import ProductPickerDialog, {
    type ProductPickerLoadParams,
    type ProductPickerLoadResult,
} from "~/components/configuration/inventory/ProductPickerDialog.vue";
import PurchaseRequestDialog from "~/components/approval/PurchaseRequestDialog.vue";
import { addBorrowRequest } from "~/composables/api/useBorrowRequestApi";
import { retrieveApprovalDetail } from "~/composables/api/useApprovalApi";
import { retrieveInventoryProducts } from "~/composables/api/useInventoryApi";
import { formatOneDecimalText } from "~/utils/inventoryNumberFormat";
import { formatLocalDate } from "~/utils/time";
import { ADMIN_ROLE } from "~~/shared/enums";
import { canSubmitBorrowRequest } from "~~/shared/utils/adminPermission";

definePageMeta({
    layout: "approval",
});

const route = useRoute();
const router = useRouter();
const adminInfo = useState<any>("admin_info", () => ({}));
const currentRole = computed(() => Number(adminInfo.value?.role));
const breadcrumbItems = [
    { label: "审批中心" },
    { label: "发起审批" },
];
const cardSearch = ref("");
const appliedCardSearch = ref("");
const showBorrowDialog = ref(false);
const showPurchaseDialog = ref(false);
const showProductPicker = ref(false);
const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");
const selectedProducts = ref<ProductPickerItem[]>([]);
const productQuantities = reactive<Record<string, number>>({});
const isSubmitting = ref(false);
const isLoadingReapplication = ref(false);
const reapplyApprovalId = ref("");
let reapplicationLoadId = 0;
const currentUserName = () => String(
    adminInfo.value?.nickname || adminInfo.value?.username || "",
).trim();
const form = reactive({
    borrower: currentUserName(),
    expectedReturnDate: "",
    reason: "",
});

const showBorrowCard = computed(() => {
    const keyword = appliedCardSearch.value.toLowerCase();
    return canSubmitBorrowRequest(currentRole.value)
        && (!keyword || "借用申请".includes(keyword));
});

const showPurchaseCard = computed(() => {
    const keyword = appliedCardSearch.value.toLowerCase();
    return currentRole.value !== ADMIN_ROLE.OPERATOR
        && (!keyword || "采购申请".includes(keyword));
});

const applyCardSearch = () => {
    appliedCardSearch.value = cardSearch.value.trim();
};

const resetForm = () => {
    form.borrower = currentUserName();
    form.expectedReturnDate = "";
    form.reason = "";
    selectedProducts.value = [];
    Object.keys(productQuantities).forEach((id) => delete productQuantities[id]);
};

const openBorrowDialog = () => {
    if (isLoadingReapplication.value || isSubmitting.value) return;
    reapplyApprovalId.value = "";
    resetForm();
    showBorrowDialog.value = true;
};

const closeBorrowDialog = () => {
    if (isSubmitting.value) return;
    showProductPicker.value = false;
    showBorrowDialog.value = false;
    showImagePreview.value = false;
    reapplyApprovalId.value = "";
    if (route.query.reapply !== undefined) {
        void router.replace({ query: { ...route.query, reapply: undefined } });
    }
};

const loadBorrowReapplication = async (value: unknown) => {
    const loadId = ++reapplicationLoadId;
    isLoadingReapplication.value = false;
    reapplyApprovalId.value = "";
    showBorrowDialog.value = false;
    showProductPicker.value = false;
    showImagePreview.value = false;
    resetForm();
    if (value === undefined) return;
    if (typeof value !== "string" || !value.trim()) {
        ElMessage.error("重新申请参数无效");
        return;
    }

    isLoadingReapplication.value = true;
    try {
        const res = await retrieveApprovalDetail(value);
        if (loadId !== reapplicationLoadId) return;
        const approval = res.data?.detail;
        if (res.code !== 200 || !approval) {
            ElMessage.error(res.msg || "获取原借用申请失败");
            return;
        }
        if (approval.canReapply !== true || approval.type !== "borrow"
            || approval.status !== "rejected" || approval.business.kind !== "borrow") {
            ElMessage.error("该借用申请不可重新申请或无操作权限");
            return;
        }

        const request = approval.business.request;
        const items = request.items?.length ? request.items : [{
            materialId: request.materialId || "",
            materialCode: request.materialCode || "",
            materialName: request.materialName || "",
            materialModel: request.materialModel || "",
            materialUnitName: request.materialUnitName || "",
            image: request.image || "",
            quantity: Number(request.quantity || 0),
        }];
        form.borrower = request.borrower;
        form.expectedReturnDate = formatLocalDate(request.expectedReturnDate);
        form.reason = request.reason;
        for (const item of items) {
            const product = normalizeProductPickerItem({
                _id: item.materialId,
                code: item.materialCode || item.materialId,
                name: item.materialName,
                model: item.materialModel || item.materialName,
                unitName: item.materialUnitName,
                image: item.image,
            });
            product.selectionKey = product.backendId;
            selectedProducts.value.push(product);
            productQuantities[product.backendId] = item.quantity;
        }
        reapplyApprovalId.value = approval.id;
        showBorrowDialog.value = true;
    } catch (error: any) {
        if (loadId !== reapplicationLoadId) return;
        ElMessage.error(error?.data?.msg || error?.message || "获取原借用申请失败");
    } finally {
        if (loadId === reapplicationLoadId) isLoadingReapplication.value = false;
    }
};

onMounted(() => {
    watch(() => route.query.reapply, (value) => {
        void loadBorrowReapplication(value);
    }, { immediate: true });
});

onBeforeUnmount(() => {
    reapplicationLoadId += 1;
});

const loadBorrowPickerProducts = async (params: ProductPickerLoadParams): Promise<ProductPickerLoadResult> => {
    const res = await retrieveInventoryProducts({ ...params, includeStock: true });
    if (res.code !== 200) throw new Error(res.msg || "获取产品列表失败");
    return {
        list: (res.data?.list || []).map((product) => ({
            ...normalizeProductPickerItem(product),
            selectionKey: product._id,
        })),
        pagination: res.data?.pagination,
    };
};

const handleProductConfirm = (products: ProductPickerItem[]) => {
    const previousQuantities = { ...productQuantities };

    selectedProducts.value = products;
    Object.keys(productQuantities).forEach((id) => delete productQuantities[id]);
    products.forEach((product) => {
        productQuantities[product.backendId] = previousQuantities[product.backendId] ?? 1;
    });
    showProductPicker.value = false;
};

const removeSelectedProduct = (id: string) => {
    selectedProducts.value = selectedProducts.value.filter((product) => product.backendId !== id);
    delete productQuantities[id];
};

const clearSelectedProducts = () => {
    selectedProducts.value = [];
    Object.keys(productQuantities).forEach((id) => delete productQuantities[id]);
};

const updateProductQuantity = (id: string, event: Event) => {
    const input = event.target as HTMLInputElement;
    const quantity = Number(input.value);
    const safeQuantity = Number.isFinite(quantity) && quantity >= 0
        ? Number(quantity.toFixed(1))
        : 0;
    productQuantities[id] = safeQuantity;
    input.value = formatOneDecimalText(safeQuantity, "0.0");
};

const openImagePreview = (url: string, title: string) => {
    if (!url) return;
    previewImages.value = [{ url, alt: title }];
    previewTitle.value = title;
    showImagePreview.value = true;
};

const submitBorrowApplication = async () => {
    if (isSubmitting.value || isLoadingReapplication.value) return;
    if (!form.borrower.trim()) {
        ElMessage.warning("请输入借用人");
        return;
    }
    if (selectedProducts.value.length === 0) {
        ElMessage.warning("请选择借用产品");
        return;
    }
    const hasInvalidQuantity = selectedProducts.value.some((product) =>
        !Number.isFinite(Number(productQuantities[product.backendId]))
        || Number(productQuantities[product.backendId]) <= 0,
    );
    if (hasInvalidQuantity) {
        ElMessage.warning("请输入正确的借用数量");
        return;
    }
    const materialIds = selectedProducts.value.map((product) => product.backendId);
    if (new Set(materialIds).size !== materialIds.length) {
        ElMessage.warning("存在重复产品，请重新选择");
        return;
    }
    if (!form.expectedReturnDate) {
        ElMessage.warning("请选择预计归还日期");
        return;
    }
    if (!form.reason.trim()) {
        ElMessage.warning("请输入借用事由");
        return;
    }

    const isReapplication = Boolean(reapplyApprovalId.value);
    isSubmitting.value = true;
    try {
        const res: any = await addBorrowRequest({
            borrower: form.borrower.trim(),
            items: selectedProducts.value.map((product) => ({
                materialId: product.backendId,
                quantity: Number(productQuantities[product.backendId]),
            })),
            expectedReturnDate: form.expectedReturnDate,
            reason: form.reason.trim(),
        });
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || "借用申请提交失败");
            return;
        }
        ElMessage.success("借用申请已提交");
        showBorrowDialog.value = false;
        resetForm();
        reapplyApprovalId.value = "";
        if (isReapplication) {
            await router.push({ path: "/configuration/approval", query: { view: "mine" } });
        }
    } catch (error: any) {
        ElMessage.error(error?.data?.msg || error?.message || "借用申请提交失败");
    } finally {
        isSubmitting.value = false;
    }
};
</script>

<style scoped>
.initiate-page {
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: 40px minmax(0, 1fr);
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
}

.page-header {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--erp-spacing-20);
}

.application-area-heading,
.my-applications-link {
    display: flex;
    align-items: center;
}

.application-area-heading {
    min-width: 0;
    justify-content: flex-end;
    margin-bottom: var(--erp-spacing-20);
}

.my-applications-link {
    height: var(--erp-size-control-height-sm);
    flex: 0 0 auto;
    gap: var(--erp-spacing-4);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    text-decoration: none;
}

.my-applications-link:hover {
    color: var(--erp-color-text-brand);
}

.my-applications-link :deep(svg) {
    width: 16px;
    height: 16px;
}

.application-area {
    min-width: 0;
    min-height: 0;
    padding: var(--erp-spacing-20);
    overflow: auto;
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.application-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 400px));
    gap: var(--erp-spacing-20);
}

.application-card {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--erp-spacing-16);
    padding: var(--erp-spacing-20);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
}

.application-copy {
    min-width: 0;
}

.application-copy h2 {
    margin: 0;
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.application-copy p {
    margin: var(--erp-spacing-4) 0 0;
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.primary-button,
.danger-text-button {
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    padding: 0 var(--erp-spacing-12);
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    cursor: pointer;
}

.primary-button {
    border: 1px solid var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.danger-text-button {
    border: 0;
    color: var(--erp-color-text-status-error);
    background: transparent;
}

.primary-button :deep(svg),
.danger-text-button :deep(svg) {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.application-empty {
    min-height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: var(--erp-spacing-8);
    color: var(--erp-color-text-tertiary);
}

.application-empty :deep(svg) {
    width: var(--erp-spacing-40);
    height: var(--erp-spacing-40);
}

.borrow-application-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
    overflow: hidden;
}

.borrow-dialog-body {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--erp-spacing-12);
}

.form-section {
    min-width: 0;
    padding: var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.form-section h3 {
    margin: 0;
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.info-grid {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: start;
    gap: var(--erp-spacing-20);
    margin-top: var(--erp-spacing-20);
}

.borrow-form-row {
    min-width: 0;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.borrow-form-row > span {
    min-height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    white-space: nowrap;
}

.borrow-form-row i {
    color: var(--erp-color-text-required);
    font-style: normal;
}

.borrow-form-row input,
.borrow-form-row textarea {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font: inherit;
}

.borrow-form-row input {
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
}

.borrow-form-row textarea {
    min-height: 72px;
    padding: var(--erp-spacing-8) var(--erp-spacing-8) var(--erp-spacing-20);
    resize: none;
}

.borrow-form-row input:focus,
.borrow-form-row textarea:focus {
    border-color: var(--erp-color-border-brand);
}

.borrow-form-row :deep(.inventory-date-picker) {
    width: 100%;
    max-width: none;
    flex-basis: auto;
}

.borrow-form-row :deep(.date-trigger) {
    height: var(--erp-size-control-height-sm);
    border-color: var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
}

.reason-row {
    position: relative;
    grid-column: 1 / -1;
    align-items: start;
}

.reason-row small {
    position: absolute;
    right: var(--erp-spacing-8);
    bottom: var(--erp-spacing-4);
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-note-font-size);
}

.product-section {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: 32px minmax(0, 1fr);
    gap: var(--erp-spacing-12);
}

.product-actions,
.product-action-left {
    display: flex;
    align-items: center;
}

.product-actions {
    justify-content: space-between;
    gap: var(--erp-spacing-12);
}

.product-action-left {
    gap: var(--erp-spacing-12);
}

.selected-product-table {
    min-height: 0;
    height: 100%;
    border: 1px solid var(--erp-color-border-muted);
}

.selected-product-table .product-row {
    width: 100%;
    min-width: 1070px;
}

.selected-product-table .table-cell {
    overflow: hidden;
    text-overflow: ellipsis;
}

.product-image-cell {
    display: grid;
    place-items: center;
    color: var(--erp-color-icon-disabled);
}

.product-image-button {
    width: 52px;
    height: 36px;
    display: grid;
    place-items: center;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-fill-default);
    cursor: zoom-in;
}

.product-image-button img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: contain;
}

.product-image-cell :deep(svg) {
    width: 24px;
    height: 24px;
}

.quantity-input {
    width: 80px;
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    text-align: center;
}

.quantity-input:focus {
    border-color: var(--erp-color-border-brand);
}

.delete-product-button {
    width: var(--erp-size-control-height-sm);
    height: var(--erp-size-control-height-sm);
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-status-error);
    background: transparent;
    cursor: pointer;
}

.delete-product-button :deep(svg) {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

@media (max-width: 1100px) {
    .info-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 760px) {
    .info-grid {
        grid-template-columns: 1fr;
    }

    .reason-row {
        grid-column: auto;
    }
}
</style>
