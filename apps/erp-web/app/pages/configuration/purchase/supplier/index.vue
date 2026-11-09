<template>
    <div class="supplier-page">
        <header class="topbar">
            <ErpBreadcrumb icon="lucide:users" :items="supplierBreadcrumbItems" />
            <ErpSearchBox
                v-model="searchText"
                :disabled="isLoading"
                placeholder="搜索供应商名称、编号或联系人"
                @search="applySearch"
            />
        </header>

        <div class="toolbar">
            <div class="toolbar-left">
                <button class="primary-button" type="button" @click="openCreateDialog">
                    <Icon name="lucide:circle-plus" class="button-icon" />
                    <span>新建</span>
                </button>
                <button
                    class="outline-button danger-button"
                    type="button"
                    :disabled="isSubmitting || selectedSupplierIds.length === 0"
                    @click="batchDeleteSuppliers"
                >
                    <Icon name="lucide:trash-2" class="button-icon" />
                    <span>批量删除</span>
                </button>
            </div>
        </div>

        <section class="table-wrap" aria-label="供应商列表">
            <ErpTableFrame
                :columns="supplierTableColumnTemplate"
                :minimum-width="supplierTableMinimumWidth"
                :loading="isLoading"
                :empty="visibleSuppliers.length === 0"
                loading-text="加载中..."
                empty-text="暂无匹配供应商"
                scroll-x
            >
                <template #header>
                <div
                    class="table-row table-head"
                >
                    <div class="selection-head checkbox-cell supplier-selection-cell">
                        <input
                            class="row-checkbox"
                            type="checkbox"
                            :checked="allRowsSelected"
                            :disabled="isLoading || isSubmitting || visibleSuppliers.length === 0"
                            @change="toggleSelectAll"
                        >
                    </div>
                    <div
                        v-for="column in supplierColumns"
                        :key="column.key"
                        class="table-cell"
                    >
                        {{ column.label }}
                    </div>

                    <div class="action-head erp-table-fixed-end">操作</div>
                </div>
                </template>

                <div
                    v-for="supplier in visibleSuppliers"
                    :key="supplier.id"
                    class="table-row data-row"
                >
                    <div class="selection-row checkbox-cell supplier-selection-cell">
                        <input
                            v-model="selectedSupplierIds"
                            class="row-checkbox"
                            type="checkbox"
                            :value="supplier.id"
                            :disabled="isSubmitting"
                        >
                    </div>
                    <div class="table-cell">{{ supplier.code }}</div>
                    <div class="table-cell">{{ supplier.name }}</div>
                    <div class="table-cell">{{ supplier.contact }}</div>
                    <div class="table-cell">{{ supplier.phone }}</div>
                    <div class="table-cell">{{ supplier.address }}</div>
                    <div class="table-cell">{{ supplier.remark }}</div>
                    <div class="table-cell">
                        <button
                            class="switch"
                            :class="{ active: supplier.enabled }"
                            type="button"
                            :disabled="isSubmitting || isLoading"
                            :aria-label="`${supplier.name}是否启用`"
                            @click="toggleSupplierEnabled(supplier)"
                        >
                            <span />
                        </button>
                    </div>
                    <div class="table-cell">
                        <button
                            class="link-button"
                            type="button"
                            @click="previewAttachment(supplier)"
                        >
                            附件
                        </button>
                    </div>
                    <div class="table-cell">{{ supplier.operator }}</div>
                    <div class="table-cell">{{ supplier.updatedAt }}</div>

                    <div class="action-row actions-cell erp-table-fixed-end">
                        <button
                            class="icon-button blue"
                            type="button"
                            :aria-label="'编辑' + supplier.name"
                            :disabled="isSubmitting"
                            @click="openEditDialog(supplier)"
                        >
                            <Icon name="lucide:square-pen" />
                        </button>
                        <button
                            class="icon-button blue"
                            type="button"
                            :aria-label="'关联产品' + supplier.name"
                            :disabled="isSubmitting"
                            @click="openRelatedProducts(supplier)"
                        >
                            <Icon name="lucide:layers" />
                        </button>
                        <button
                            class="icon-button delete"
                            type="button"
                            :aria-label="'删除' + supplier.name"
                            :disabled="isSubmitting"
                            @click="deleteSupplier(supplier)"
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
            :total="totalSuppliers"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="goToPage"
            @jump="jumpToInputPage"
        />

        <SupplierDialog
            v-model="showSupplierDialog"
            :mode="supplierDialogMode"
            :supplier="supplierForm"
            @submit="submitSupplierDialog"
        />

        <SupplierProductDialog
            v-model="showSupplierProductDialog"
            :supplier-id="relatedSupplierId"
            allow-quick-create-product
            @saved="loadSuppliers"
        />
    </div>
</template>

<script setup lang="ts">
import type {
    PurchaseSupplier,
    PurchaseSupplierAttachment,
} from "~~/shared/types/purchase";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import SupplierDialog from "~/components/configuration/purchase/SupplierDialog.vue";
import SupplierProductDialog from "~/components/configuration/purchase/SupplierProductDialog.vue";
import {
    addPurchaseSupplier,
    deletePurchaseSupplier,
    retrievePurchaseSuppliers,
    updatePurchaseSupplier,
    updatePurchaseSupplierStatus,
} from "~/composables/api/usePurchaseSupplierApi";
import { uploadInventoryAttachment } from "~/composables/api/useInventoryApi";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import {
    getErpTableGridColumn,
    getErpTableMinimumWidth,
} from "~/utils/inventory/erpTableColumns";
import { downloadAttachmentFile } from "~/utils/attachmentPreview";
import { erpMessageBox } from "~/utils/erpMessageBox";

definePageMeta({
    layout: "purchase",
});

type SupplierColumnKey =
    | "code"
    | "name"
    | "contact"
    | "phone"
    | "address"
    | "remark"
    | "enabled"
    | "attachment"
    | "operator"
    | "updatedAt";

interface SupplierColumn {
    key: SupplierColumnKey;
    label: string;
    width: number;
    widthVar?: string;
    grow?: boolean;
}

interface Supplier {
    id: string;
    code: string;
    name: string;
    contact: string;
    phone: string;
    address: string;
    detailedAddress: string;
    remark: string;
    enabled: boolean;
    attachments: SupplierAttachmentItem[];
    operator: string;
    updatedAt: string;
}

type SupplierDialogMode = "create" | "edit";
type SupplierAttachment = PurchaseSupplierAttachment;
type SupplierAttachmentItem = SupplierAttachment | File;

const supplierColumns: SupplierColumn[] = [
    { key: "code", label: "供应商编号", width: 140 },
    { key: "name", label: "供应商名称", width: 130 },
    { key: "contact", label: "联系人", width: 130 },
    { key: "phone", label: "联系电话", width: 150 },
    { key: "address", label: "地址", width: 180, grow: true },
    { key: "remark", label: "备注", width: 180, widthVar: "--erp-table-col-remark", grow: true },
    { key: "enabled", label: "是否启用", width: 100 },
    { key: "attachment", label: "附件", width: 100 },
    { key: "operator", label: "操作人", width: 130, widthVar: "--erp-table-col-operator" },
    { key: "updatedAt", label: "修改时间", width: 180, widthVar: "--erp-table-col-date" },
];

const supplierBreadcrumbItems = [
    { label: "采购管理" },
    { label: "供应商管理" },
];

const adminInfo = useState<{ nickname?: string; username?: string }>("admin_info", () => ({}));
const currentOperatorName = computed(() =>
    adminInfo.value.nickname || adminInfo.value.username || "",
);

const createEmptySupplier = (): Supplier => ({
    id: "",
    code: "",
    name: "",
    contact: "",
    phone: "",
    address: "",
    detailedAddress: "",
    remark: "",
    enabled: true,
    attachments: [],
    operator: currentOperatorName.value,
    updatedAt: "",
});

const suppliers = ref<Supplier[]>([]);
const searchText = ref("");
const appliedSearchText = ref("");
const showSupplierDialog = ref(false);
const showSupplierProductDialog = ref(false);
const supplierDialogMode = ref<SupplierDialogMode>("create");
const editingSupplierId = ref("");
const relatedSupplierId = ref("");
const isLoading = ref(false);
const isSubmitting = ref(false);
const supplierTotal = ref(0);
const selectedSupplierIds = ref<string[]>([]);
const supplierForm = reactive<Supplier>(createEmptySupplier());
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
} = useInventoryPagination();

const supplierTableColumnTemplate = computed(() => [
    "var(--supplier-selection-width)",
    ...supplierColumns.map(getErpTableGridColumn),
    "var(--supplier-action-width)",
].join(" "));

const supplierTableMinimumWidth = getErpTableMinimumWidth(
    supplierColumns,
    ["var(--supplier-selection-width)"],
    ["var(--supplier-action-width)"],
);

const visibleSuppliers = computed(() => suppliers.value);
const totalSuppliers = computed(() => supplierTotal.value);
const allRowsSelected = computed(() =>
    visibleSuppliers.value.length > 0 &&
    visibleSuppliers.value.every((supplier) => supplier.id && selectedSupplierIds.value.includes(supplier.id)),
);

const assignSupplierForm = (supplier: Supplier) => {
    Object.assign(supplierForm, {
        ...supplier,
        attachments: [...supplier.attachments],
    });
};

const formatDateTime = (value?: string | Date) => {
    if (!value) {
        return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    const pad = (num: number) => String(num).padStart(2, "0");
    return [
        date.getFullYear(),
        "-",
        pad(date.getMonth() + 1),
        "-",
        pad(date.getDate()),
        " ",
        pad(date.getHours()),
        ":",
        pad(date.getMinutes()),
        ":",
        pad(date.getSeconds()),
    ].join("");
};

const normalizeAttachment = (attachment: PurchaseSupplierAttachment): SupplierAttachment => {
    return {
        url: attachment.url || "",
        name: attachment.name || "",
        size: attachment.size || 0,
        type: attachment.type || "",
    };
};

const normalizeSupplier = (supplier: PurchaseSupplier): Supplier => ({
    id: supplier._id || "",
    code: supplier.code || "",
    name: supplier.name || "",
    contact: supplier.contact || "",
    phone: supplier.phone || "",
    address: supplier.address || "",
    detailedAddress: supplier.detailedAddress || "",
    remark: supplier.remark || "",
    enabled: supplier.isEnabled !== false,
    attachments: Array.isArray(supplier.attachments)
        ? supplier.attachments.map(normalizeAttachment)
        : [],
    operator: supplier.updatedBy || supplier.operator || supplier.createdBy || "",
    updatedAt: formatDateTime(supplier.updateTime),
});

const uploadSupplierAttachments = async (attachments: SupplierAttachmentItem[]) => {
    const result: PurchaseSupplierAttachment[] = [];

    for (const attachment of attachments) {
        if (!(attachment instanceof File)) {
            if (attachment.url && attachment.name) {
                result.push({
                    url: attachment.url,
                    name: attachment.name,
                    size: attachment.size || 0,
                    type: attachment.type || "",
                });
            }
            continue;
        }

        const formData = new FormData();
        formData.append("file", attachment);
        const res = await uploadInventoryAttachment(formData);
        if (res.code !== 200 || !res.data?.url) {
            throw new Error(res.msg || `附件 ${attachment.name} 上传失败`);
        }

        result.push({
            url: res.data.url,
            name: res.data.name || attachment.name,
            size: res.data.size || attachment.size,
            type: res.data.type || attachment.type,
        });
    }

    return result;
};

const loadSuppliers = async () => {
    isLoading.value = true;
    try {
        const res = await retrievePurchaseSuppliers({
            keyword: appliedSearchText.value || undefined,
            page: currentPage.value,
            limit: pageSize.value,
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取供应商列表失败");
            suppliers.value = [];
            supplierTotal.value = 0;
            setTotalItems(0);
            return;
        }

        suppliers.value = Array.isArray(res.data?.list)
            ? res.data.list.map((item) => normalizeSupplier(item))
            : [];
        supplierTotal.value = res.data?.pagination?.total || 0;
        setTotalItems(supplierTotal.value);
        selectedSupplierIds.value = selectedSupplierIds.value.filter((id) =>
            suppliers.value.some((supplier) => supplier.id === id),
        );
    } catch (err: any) {
        suppliers.value = [];
        supplierTotal.value = 0;
        setTotalItems(0);
        ElMessage.error(err?.data?.msg || err?.message || "获取供应商列表失败");
    } finally {
        isLoading.value = false;
    }
};

const applySearch = async () => {
    appliedSearchText.value = searchText.value.trim();
    if (currentPage.value !== 1) {
        goToPage(1);
        return;
    }

    await loadSuppliers();
};

const toggleSelectAll = () => {
    const pageIds = visibleSuppliers.value
        .map((supplier) => supplier.id)
        .filter(Boolean);

    if (allRowsSelected.value) {
        selectedSupplierIds.value = selectedSupplierIds.value.filter((id) => !pageIds.includes(id));
        return;
    }

    selectedSupplierIds.value = [...new Set([...selectedSupplierIds.value, ...pageIds])];
};

const toggleSupplierEnabled = async (supplier: Supplier) => {
    if (isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    try {
        const nextEnabled = !supplier.enabled;
        const res = await updatePurchaseSupplierStatus({
            id: supplier.id,
            isEnabled: nextEnabled,
        });
        if (res.code !== 200) {
            ElMessage.error(res.msg || "更新供应商状态失败");
            return;
        }

        supplier.enabled = nextEnabled;
        if (res.data?.detail) {
            const normalized = normalizeSupplier(res.data.detail as PurchaseSupplier);
            Object.assign(supplier, normalized);
        }
        ElMessage.success(nextEnabled ? "供应商已启用" : "供应商已禁用");
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "更新供应商状态失败");
    } finally {
        isSubmitting.value = false;
    }
};

const openCreateDialog = () => {
    supplierDialogMode.value = "create";
    editingSupplierId.value = "";
    assignSupplierForm(createEmptySupplier());
    showSupplierDialog.value = true;
};

const openEditDialog = (supplier: Supplier) => {
    supplierDialogMode.value = "edit";
    editingSupplierId.value = supplier.id;
    assignSupplierForm({ ...supplier });
    showSupplierDialog.value = true;
};

const closeSupplierDialog = () => {
    showSupplierDialog.value = false;
};

const submitSupplierDialog = async (supplier: Supplier) => {
    if (isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    try {
        const attachments = await uploadSupplierAttachments(supplier.attachments);
        const payload = {
            name: supplier.name,
            contact: supplier.contact,
            phone: supplier.phone,
            address: supplier.address,
            detailedAddress: supplier.detailedAddress,
            remark: supplier.remark,
            isEnabled: supplier.enabled,
            operator: currentOperatorName.value || supplier.operator,
            attachments,
        };
        const res = supplierDialogMode.value === "edit"
            ? await updatePurchaseSupplier({
                id: editingSupplierId.value,
                ...payload,
            })
            : await addPurchaseSupplier(payload);

        if (res.code !== 200) {
            ElMessage.error(res.msg || "保存供应商失败");
            return;
        }

        ElMessage.success(supplierDialogMode.value === "edit" ? "编辑供应商成功" : "新建供应商成功");
        closeSupplierDialog();
        if (supplierDialogMode.value === "create") {
            appliedSearchText.value = "";
            searchText.value = "";
            goToPage(1);
        }
        await loadSuppliers();
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "保存供应商失败");
    } finally {
        isSubmitting.value = false;
    }
};

const previewAttachment = (supplier: Supplier) => {
    const attachment = supplier.attachments[0];
    if (!attachment) {
        ElMessage.info("暂无附件");
        return;
    }

    void downloadAttachmentFile(
        attachment.url,
        attachment.name,
    ).catch(() => {
        ElMessage.error("附件下载失败，请稍后重试");
    });
};

const openRelatedProducts = (supplier: Supplier) => {
    relatedSupplierId.value = supplier.id;
    showSupplierProductDialog.value = true;
};

const deleteSupplier = async (supplier: Supplier) => {
    try {
        await erpMessageBox.confirm(`是否确认删除供应商 ${supplier.name}`, "删除供应商", {
            confirmButtonText: "删除",
            cancelButtonText: "取消",
            type: "warning",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const res = await deletePurchaseSupplier({ id: supplier.id });
        if (res.code !== 200) {
            ElMessage.error(res.msg || "删除供应商失败");
            return;
        }

        ElMessage.success("删除供应商成功");
        selectedSupplierIds.value = selectedSupplierIds.value.filter((id) => id !== supplier.id);
        await loadSuppliers();
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "删除供应商失败");
    } finally {
        isSubmitting.value = false;
    }
};

const batchDeleteSuppliers = async () => {
    const ids = selectedSupplierIds.value.filter(Boolean);

    if (!ids.length || isSubmitting.value) {
        ElMessage.warning("请先选择需要删除的供应商");
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除选中的 ${ids.length} 个供应商？`, "批量删除供应商", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const res = await deletePurchaseSupplier({ ids });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "批量删除供应商失败");
            return;
        }

        selectedSupplierIds.value = [];
        ElMessage.success("批量删除供应商成功");
        await loadSuppliers();
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "批量删除供应商失败");
    } finally {
        isSubmitting.value = false;
    }
};

watch([currentPage, pageSize], () => {
    loadSuppliers();
});

onMounted(loadSuppliers);
</script>

<style scoped>
.supplier-page {
    --supplier-selection-width: 58px;
    --supplier-action-width: var(--erp-table-col-action);

    height: 100%;
    display: grid;
    grid-template-rows: 40px 32px minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
}

.topbar,
.toolbar,
.toolbar-left {
    display: flex;
    align-items: center;
}

.topbar,
.toolbar {
    justify-content: space-between;
}

.toolbar-left {
    gap: 12px;
}

.primary-button,
.outline-button {
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
    cursor: pointer;
}

.primary-button {
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.outline-button {
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
}

.outline-button:disabled {
    color: var(--erp-color-text-disabled);
    cursor: not-allowed;
    opacity: 0.62;
}

.danger-button {
    border-color: var(--erp-color-border-error);
    color: var(--erp-color-text-status-error);
}

.danger-button:not(:disabled):hover {
    background: var(--erp-color-bg-status-error);
}

.danger-button:disabled {
    border-color: color-mix(in srgb, var(--erp-color-border-error) 70%, transparent);
    color: color-mix(in srgb, var(--erp-color-text-status-error) 70%, transparent);
    background: var(--erp-color-fill-default);
    opacity: 1;
}

.button-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.table-wrap {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
}

.table-row {
    display: grid;
    grid-template-columns: var(--erp-table-columns);
    align-items: center;
    padding-right: 8px;
}

.supplier-selection-cell {
    position: sticky;
    left: 0;
    z-index: 3;
}

.action-head,
.action-row {
    position: sticky;
    right: 0;
    z-index: 3;
}

.selection-head,
.selection-row,
.action-head,
.action-row {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: inherit;
}

.selection-head,
.action-head {
    background: var(--erp-color-fill-table-header);
}

.table-head {
    height: 48px;
}

.data-row {
    height: 64px;
}

.checkbox-cell {
    padding: 0;
}

.row-checkbox {
    width: 16px;
    height: 16px;
    accent-color: var(--erp-color-action-primary);
    cursor: pointer;
}

.switch {
    width: 40px;
    height: 20px;
    position: relative;
    padding: 0;
    border: 0;
    border-radius: 999px;
    background: var(--erp-color-fill-control-secondary);
    cursor: pointer;
}

.switch span {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
    transition: transform 0.16s ease;
}

.switch.active {
    background: var(--erp-color-action-primary);
}

.switch.active span {
    transform: translateX(20px);
}

.link-button {
    border: 0;
    color: var(--erp-color-text-brand);
    background: transparent;
    cursor: pointer;
}

.actions-cell {
    gap: 12px;
}

.icon-button {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
}

.icon-button.blue {
    color: var(--erp-color-icon-brand);
}

.icon-button.delete {
    color: var(--erp-color-icon-error);
}

.supplier-page :deep(.erp-table-frame) {
    height: 100%;
}
</style>
