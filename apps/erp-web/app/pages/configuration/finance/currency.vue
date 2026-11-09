<template>
    <div
        class="currency-page"
        :class="{ readonly: !canManageCurrencies }"
    >
        <header class="topbar">
            <ErpBreadcrumb icon="lucide:coins" :items="currencyBreadcrumbItems" />
            <ErpSearchBox
                v-model="searchText"
                :disabled="isLoading"
                placeholder="搜索币种名称、编号或代码"
                @search="loadCurrencies"
            />
        </header>

        <div v-if="canManageCurrencies" class="toolbar">
            <button
                class="primary-button"
                type="button"
                :disabled="isLoading || isSubmitting"
                @click="openCreateCurrencyDialog"
            >
                <Icon name="lucide:circle-plus" class="button-icon" />
                <span>新建币种</span>
            </button>
            <button
                class="outline-button danger-button"
                type="button"
                :disabled="isSubmitting || selectedCurrencyIds.length === 0"
                @click="batchDeleteCurrencies"
            >
                <Icon name="lucide:trash-2" class="button-icon" />
                <span>批量删除</span>
            </button>
        </div>

        <section class="table-wrap" aria-label="币种列表">
            <ErpTableFrame
                :columns="currencyTableColumnTemplate"
                :minimum-width="currencyTableMinimumWidth"
                :loading="isLoading"
                :empty="filteredCurrencies.length === 0"
                loading-text="正在加载币种数据..."
                empty-text="暂无匹配币种"
                scroll-x
            >
                <template #header>
                    <div class="table-row table-head">
                        <div v-if="canManageCurrencies" class="selection-head checkbox-cell currency-selection-cell">
                            <input
                                class="row-checkbox"
                                type="checkbox"
                                :checked="allRowsSelected"
                                :disabled="paginatedCurrencies.length === 0 || isSubmitting"
                                aria-label="选择全部币种"
                                @change="toggleSelectAll"
                            >
                        </div>
                        <div
                            v-for="column in currencyColumns"
                            :key="column.key"
                            class="table-cell"
                        >
                            {{ column.label }}
                        </div>
                        <div v-if="canManageCurrencies" class="action-head erp-table-fixed-end">操作</div>
                    </div>
                </template>

                <div
                    v-for="currency in paginatedCurrencies"
                    :key="currency.backendId || currency.id"
                    class="table-row data-row"
                >
                    <div v-if="canManageCurrencies" class="selection-row checkbox-cell currency-selection-cell">
                        <input
                            v-model="selectedCurrencyIds"
                            class="row-checkbox"
                            type="checkbox"
                            :value="currency.backendId"
                            :disabled="isSubmitting"
                            :aria-label="`选择${currency.id}`"
                        >
                    </div>
                    <div class="table-cell">{{ currency.id }}</div>
                    <div class="table-cell">{{ currency.name }}</div>
                    <div class="table-cell">{{ currency.currencyCode }}</div>
                    <div class="table-cell">{{ currency.updatedAt }}</div>
                    <div v-if="canManageCurrencies" class="action-row actions-cell erp-table-fixed-end">
                        <button
                            class="icon-button blue"
                            type="button"
                            :disabled="isSubmitting"
                            :aria-label="`编辑${currency.id}`"
                            @click="openEditCurrencyDialog(currency)"
                        >
                            <Icon name="lucide:square-pen" />
                        </button>
                        <button
                            class="icon-button delete"
                            type="button"
                            :disabled="isSubmitting"
                            :aria-label="`删除${currency.id}`"
                            @click="deleteCurrency(currency)"
                        >
                            <Icon name="lucide:trash-2" />
                        </button>
                    </div>
                </div>
            </ErpTableFrame>
        </section>

        <InventoryPagination
            v-model:page-size="pageSize"
            v-model:jump-page-input="jumpPageInput"
            :total="totalCurrencies"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="goToPage"
            @jump="jumpToInputPage"
        />

        <div v-if="showCurrencyDialog" class="erp-dialog-mask" role="presentation" @click.self="closeCurrencyDialog">
            <ErpDialogFrame
                class="currency-dialog"
                :title="currencyDialogTitle"
                width="600px"
                height="440px"
                :close-disabled="isSubmitting"
                @close="closeCurrencyDialog"
                @submit.prevent="submitCurrency"
            >
                <div class="currency-form-grid">
                    <label class="form-row">
                        <span class="field-label">币种编号</span>
                        <input
                            v-model="currencyForm.id"
                            class="dialog-input readonly"
                            type="text"
                            aria-label="币种编号"
                            placeholder="保存后自动生成"
                            readonly
                        >
                    </label>

                    <label class="form-row">
                        <span class="field-label required">名称</span>
                        <input
                            v-model="currencyForm.name"
                            class="dialog-input"
                            type="text"
                            aria-label="名称"
                            required
                        >
                    </label>

                    <label class="form-row">
                        <span class="field-label required">币种代码</span>
                        <input
                            v-model="currencyForm.currencyCode"
                            class="dialog-input"
                            type="text"
                            aria-label="币种代码"
                            maxlength="12"
                            required
                            @input="currencyForm.currencyCode = currencyForm.currencyCode.toUpperCase()"
                        >
                    </label>
                </div>
                <template #footer>
                    <button
                        class="dialog-button cancel"
                        type="button"
                        :disabled="isSubmitting"
                        @click="closeCurrencyDialog"
                    >
                        取消
                    </button>
                    <button
                        class="dialog-button confirm"
                        type="submit"
                        :disabled="isSubmitting"
                    >
                        {{ isSubmitting ? "提交中" : "确认" }}
                    </button>
                </template>
            </ErpDialogFrame>
        </div>
    </div>
</template>

<script setup lang="ts">
import type { InventoryCurrency as InventoryCurrencyEntity } from "~~/shared/types/inventory";
import { ADMIN_ROLE } from "~~/shared/enums";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import {
    addInventoryCurrency,
    deleteInventoryCurrency,
    retrieveInventoryCurrencies,
    updateInventoryCurrency,
} from "~/composables/api/useInventoryApi";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import {
    getErpTableGridColumn,
    getErpTableMinimumWidth,
} from "~/utils/inventory/erpTableColumns";
import { erpMessageBox } from "~/utils/erpMessageBox";

definePageMeta({
    layout: "finance",
});

interface InventoryCurrency {
    backendId: string;
    id: string;
    name: string;
    currencyCode: string;
    updatedAt: string;
    remark: string;
    sort: number;
}

interface CurrencyColumn {
    key: "id" | "name" | "currencyCode" | "updatedAt";
    label: string;
    width: number;
    widthVar?: string;
    grow?: boolean;
}

const baseCurrencyColumns: CurrencyColumn[] = [
    { key: "id", label: "编号", width: 160, grow: true },
    { key: "name", label: "名称", width: 180, grow: true },
    { key: "currencyCode", label: "币种代码", width: 160, grow: true },
    { key: "updatedAt", label: "修改时间", width: 180, widthVar: "--erp-table-col-date" },
];

const currencyBreadcrumbItems = [
    { label: "财务管理" },
    { label: "币种管理" },
];
const currencySelectionColumn = { width: 58 };
const currencyActionColumn = { width: 150, widthVar: "--erp-table-col-action" };

const searchText = ref("");
const adminInfo = useState<any>("admin_info", () => ({}));
const roleNumber = computed(() => Number(adminInfo.value?.role));
const canManageCurrencies = computed(() =>
    roleNumber.value === ADMIN_ROLE.SUPER
    || roleNumber.value === ADMIN_ROLE.FINANCE
    || roleNumber.value === ADMIN_ROLE.FINANCE_MANAGER,
);
const currencyColumns = computed(() => baseCurrencyColumns);
const currencyTableColumnTemplate = computed(() => [
    ...(canManageCurrencies.value ? [getErpTableGridColumn(currencySelectionColumn)] : []),
    ...currencyColumns.value.map(getErpTableGridColumn),
    ...(canManageCurrencies.value ? [getErpTableGridColumn(currencyActionColumn)] : []),
].join(" "));
const currencyTableMinimumWidth = computed(() => getErpTableMinimumWidth(
    currencyColumns.value,
    canManageCurrencies.value ? [getErpTableGridColumn(currencySelectionColumn)] : [],
    canManageCurrencies.value ? [getErpTableGridColumn(currencyActionColumn)] : [],
));
const {
    pageSizeOptions,
    pageSize,
    pageNumbers,
    totalPages,
    currentPage,
    jumpPageInput,
    setTotalItems,
    getPageItems,
    goToPage,
    jumpToInputPage,
} = useInventoryPagination();
const showCurrencyDialog = ref(false);
const currencyDialogMode = ref<"create" | "edit">("create");
const isLoading = ref(false);
const isSubmitting = ref(false);
const inventoryCurrencies = ref<InventoryCurrency[]>([]);
const selectedCurrencyIds = ref<string[]>([]);
const currencyForm = reactive({
    backendId: "",
    id: "",
    name: "",
    currencyCode: "",
    remark: "",
    sort: 0,
});

const formatDateTime = (value?: string | Date) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const pad = (item: number) => String(item).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const normalizeCurrency = (currency: InventoryCurrencyEntity): InventoryCurrency => ({
    backendId: currency._id || "",
    id: currency.code || "",
    name: currency.name || "",
    currencyCode: currency.currencyCode || "",
    updatedAt: formatDateTime(currency.updateTime),
    remark: currency.remark || "",
    sort: Number(currency.sort || 0),
});

const filteredCurrencies = computed(() => {
    const keyword = searchText.value.trim().toLocaleLowerCase();
    if (!keyword) return inventoryCurrencies.value;
    return inventoryCurrencies.value.filter((currency) =>
        [currency.id, currency.name, currency.currencyCode, currency.updatedAt, currency.remark].some((value) =>
            value.toLocaleLowerCase().includes(keyword),
        ),
    );
});
const totalCurrencies = computed(() => filteredCurrencies.value.length);
const paginatedCurrencies = computed(() => getPageItems(filteredCurrencies.value));
const allRowsSelected = computed(() =>
    paginatedCurrencies.value.length > 0 &&
    paginatedCurrencies.value.every((currency) =>
        currency.backendId && selectedCurrencyIds.value.includes(currency.backendId),
    ),
);
const toggleSelectAll = () => {
    const pageIds = paginatedCurrencies.value
        .map((currency) => currency.backendId)
        .filter(Boolean);

    if (allRowsSelected.value) {
        selectedCurrencyIds.value = selectedCurrencyIds.value.filter((id) => !pageIds.includes(id));
        return;
    }

    selectedCurrencyIds.value = [...new Set([...selectedCurrencyIds.value, ...pageIds])];
};
const currencyDialogTitle = computed(() =>
    currencyDialogMode.value === "edit" ? "编辑币种" : "新建币种",
);

watch(totalCurrencies, (total) => setTotalItems(total), { immediate: true });
watch(pageSize, () => goToPage(1));
watch(searchText, () => goToPage(1));

const handleApiError = (err: any, fallbackMessage: string) => {
    ElMessage.error(err?.data?.msg || err?.message || fallbackMessage);
};

const loadCurrencies = async () => {
    if (isLoading.value) return;
    isLoading.value = true;
    try {
        const res = await retrieveInventoryCurrencies({
            keyword: searchText.value.trim() || undefined,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取币种列表失败");
            inventoryCurrencies.value = [];
            return;
        }

        inventoryCurrencies.value = Array.isArray(res.data?.list)
            ? res.data.list.map(normalizeCurrency)
            : [];
        selectedCurrencyIds.value = selectedCurrencyIds.value.filter((id) =>
            inventoryCurrencies.value.some((currency) => currency.backendId === id),
        );
        goToPage(1);
    } catch (err: any) {
        inventoryCurrencies.value = [];
        handleApiError(err, "获取币种列表失败");
    } finally {
        isLoading.value = false;
    }
};

const resetCurrencyForm = () => {
    currencyForm.backendId = "";
    currencyForm.id = "";
    currencyForm.name = "";
    currencyForm.currencyCode = "";
    currencyForm.remark = "";
    currencyForm.sort = 0;
};

const openCreateCurrencyDialog = () => {
    currencyDialogMode.value = "create";
    resetCurrencyForm();
    showCurrencyDialog.value = true;
};

const openEditCurrencyDialog = (currency: InventoryCurrency) => {
    currencyDialogMode.value = "edit";
    currencyForm.backendId = currency.backendId;
    currencyForm.id = currency.id;
    currencyForm.name = currency.name;
    currencyForm.currencyCode = currency.currencyCode;
    currencyForm.remark = currency.remark;
    currencyForm.sort = currency.sort;
    showCurrencyDialog.value = true;
};

const closeCurrencyDialog = () => {
    showCurrencyDialog.value = false;
};

const submitCurrency = async () => {
    const name = currencyForm.name.trim();
    const currencyCode = currencyForm.currencyCode.trim().toUpperCase();
    if (!name) {
        ElMessage.warning("请输入名称");
        return;
    }
    if (!currencyCode) {
        ElMessage.warning("请输入币种代码");
        return;
    }
    if (isSubmitting.value) return;

    isSubmitting.value = true;
    try {
        if (currencyDialogMode.value === "create") {
            const res = await addInventoryCurrency({
                name,
                currencyCode,
                remark: currencyForm.remark,
                sort: currencyForm.sort,
            });
            if (res.code !== 200) {
                ElMessage.error(res.msg || "新增币种失败");
                return;
            }
            ElMessage.success("新增币种成功");
            closeCurrencyDialog();
            await loadCurrencies();
            return;
        }

        const res = await updateInventoryCurrency({
            id: currencyForm.backendId,
            code: currencyForm.id,
            name,
            currencyCode,
            remark: currencyForm.remark,
            sort: currencyForm.sort,
        });
        if (res.code !== 200) {
            ElMessage.error(res.msg || "修改币种失败");
            return;
        }
        ElMessage.success("修改币种成功");
        closeCurrencyDialog();
        await loadCurrencies();
    } catch (err: any) {
        handleApiError(err, currencyDialogMode.value === "create" ? "新增币种失败" : "修改币种失败");
    } finally {
        isSubmitting.value = false;
    }
};

const deleteCurrency = async (currency: InventoryCurrency) => {
    if (!currency.backendId || isSubmitting.value) return;
    try {
        await erpMessageBox.confirm(`是否确认删除币种 ${currency.name}`, "删除币种", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const res = await deleteInventoryCurrency({ id: currency.backendId });
        if (res.code !== 200) {
            ElMessage.error(res.msg || "删除币种失败");
            return;
        }
        ElMessage.success("删除币种成功");
        selectedCurrencyIds.value = selectedCurrencyIds.value.filter((id) => id !== currency.backendId);
        await loadCurrencies();
    } catch (err: any) {
        handleApiError(err, "删除币种失败");
    } finally {
        isSubmitting.value = false;
    }
};

const batchDeleteCurrencies = async () => {
    const ids = selectedCurrencyIds.value.filter(Boolean);
    if (!ids.length || isSubmitting.value) {
        ElMessage.warning("请先选择需要删除的币种");
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除选中的 ${ids.length} 个币种？`, "批量删除币种", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const res = await deleteInventoryCurrency({ ids });
        if (res.code !== 200) {
            ElMessage.error(res.msg || "批量删除币种失败");
            return;
        }
        selectedCurrencyIds.value = [];
        ElMessage.success("批量删除币种成功");
        await loadCurrencies();
    } catch (err: any) {
        handleApiError(err, "批量删除币种失败");
    } finally {
        isSubmitting.value = false;
    }
};

onMounted(() => {
    loadCurrencies();
});
</script>

<style scoped>
.currency-page {
    --currency-selection-width: 58px;

    height: 100%;
    display: grid;
    grid-template-rows: 40px 32px minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
}

.currency-page.readonly {
    grid-template-rows: 40px minmax(0, 1fr) 52px;
}

.currency-page .topbar,
.currency-page .toolbar {
    display: flex;
    align-items: center;
}

.currency-page .topbar {
    justify-content: space-between;
}

.currency-page .toolbar {
    gap: var(--erp-spacing-12);
}

.currency-page button:disabled {
    cursor: not-allowed;
}

.currency-page .primary-button,
.currency-page .outline-button {
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

.currency-page .primary-button {
    border: 0;
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.currency-page .primary-button:not(:disabled):active {
    background: var(--erp-color-action-primary-pressed);
}

.currency-page .primary-button:disabled {
    border-color: var(--erp-color-border-muted);
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

.currency-page .outline-button {
    border: 1px solid var(--erp-color-border-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
}

.currency-page .danger-button {
    border-color: var(--erp-color-border-error);
    color: var(--erp-color-text-status-error);
}

.currency-page .danger-button:not(:disabled):hover {
    background: var(--erp-color-bg-status-error);
}

.currency-page .danger-button:disabled {
    border-color: color-mix(in srgb, var(--erp-color-border-error) 70%, transparent);
    color: color-mix(in srgb, var(--erp-color-text-status-error) 70%, transparent);
    background: var(--erp-color-fill-default);
    opacity: 1;
}

.currency-page .button-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.currency-page .table-wrap {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}

.currency-page .table-row {
    width: 100%;
    min-width: 0;
    grid-template-columns: var(--erp-table-columns);
}

.currency-page .currency-selection-cell,
.currency-page .action-head,
.currency-page .action-row {
    position: sticky;
    z-index: 5;
}

.currency-page .currency-selection-cell {
    left: 0;
}

.currency-page .action-head,
.currency-page .action-row {
    right: 0;
}

.currency-page .selection-head,
.currency-page .selection-row,
.currency-page .action-head,
.currency-page .action-row {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: inherit;
}

.currency-page .selection-head,
.currency-page .action-head,
.currency-page .table-head {
    background: var(--erp-color-fill-table-header);
}

.currency-page .table-head {
    height: 48px;
    border-radius: 0;
}

.currency-page .data-row,
.currency-page .selection-row,
.currency-page .action-row {
    height: 64px;
    margin-top: 0;
    border-radius: 0;
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
}

.currency-page .data-row:hover,
.currency-page .data-row:hover .selection-row,
.currency-page .data-row:hover .action-row {
    background: var(--erp-color-fill-hover);
}

.currency-page .row-checkbox {
    accent-color: var(--erp-color-action-primary);
}

.currency-page .actions-cell {
    gap: var(--erp-spacing-12);
}

.currency-page .table-cell {
    overflow: hidden;
    text-overflow: ellipsis;
}

.currency-page :deep(.erp-table-frame) {
    height: 100%;
}

.currency-page .currency-form-grid {
    display: grid;
    gap: var(--erp-spacing-12);
}

.currency-page .currency-dialog .form-row > span {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    white-space: nowrap;
}
</style>
