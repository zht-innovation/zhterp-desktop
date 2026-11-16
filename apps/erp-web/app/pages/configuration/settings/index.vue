<template>
    <section class="settings-page" aria-labelledby="settings-title">
        <form class="settings-card" @submit.prevent="saveSettings">
            <header class="card-header">
                <h1 id="settings-title">采购申请类别设置</h1>
            </header>
            <div class="card-body">
                <p v-if="loading" class="state-message" role="status">正在加载部门…</p>
                <div v-else-if="loadError" class="error-state" role="alert">
                    <span>{{ loadError }}</span>
                    <button class="retry-button" type="button" :disabled="busy" @click="loadDepartments">重试</button>
                </div>
                <p v-else-if="!departments.length" class="state-message">暂无启用部门，请先在用户管理中添加或启用部门。</p>
                <template v-else>
                    <label class="department-field" for="settings-department">
                        <span>部门</span>
                        <select id="settings-department" :value="selectedDepartmentId" :disabled="busy" @change="changeDepartment">
                            <option v-for="department in departments" :key="department.id" :value="department.id">
                                {{ department.name }}
                            </option>
                        </select>
                    </label>
                    <fieldset class="category-field" :disabled="busy">
                        <legend>发起申请时可选的类别</legend>
                        <div class="category-grid">
                            <label
                                v-for="category in PURCHASE_REQUEST_CATEGORIES"
                                :key="category"
                                class="category-option"
                                :class="{ selected: selectedCategories.includes(category) }"
                            >
                                <input v-model="selectedCategories" type="checkbox" :value="category" />
                                <span>{{ category }}</span>
                            </label>
                        </div>
                    </fieldset>
                    <p v-if="saveError" class="error-message" role="alert">{{ saveError }}</p>
                </template>
            </div>
            <footer class="card-footer">
                <button class="save-button" type="submit" :disabled="busy || !selectedDepartment || Boolean(loadError)">
                    {{ saving ? "保存中…" : "保存" }}
                </button>
            </footer>
        </form>
    </section>
</template>

<script setup lang="ts">
import { retrieveDepartments, updateDepartment } from "~/composables/api/useDepartmentApi";
import { erpMessageBox } from "~/utils/erpMessageBox";
import { PURCHASE_REQUEST_CATEGORIES, type PurchaseRequestCategory } from "~~/shared/types/approval";
import type { Department } from "~~/shared/types/department";

definePageMeta({ layout: "settings" });
useHead({ title: "采购申请类别设置" });

const departments = ref<Department[]>([]);
const selectedDepartmentId = ref("");
const selectedCategories = ref<PurchaseRequestCategory[]>([]);
const loading = ref(true);
const saving = ref(false);
const switching = ref(false);
const loadError = ref("");
const saveError = ref("");
const busy = computed(() => loading.value || saving.value || switching.value);
const selectedDepartment = computed(() =>
    departments.value.find((department) => department.id === selectedDepartmentId.value),
);
const savedCategories = computed(() =>
    selectedDepartment.value?.purchaseRequestCategories ?? PURCHASE_REQUEST_CATEGORIES,
);
const hasUnsavedChanges = computed(() =>
    selectedCategories.value.length !== savedCategories.value.length
    || selectedCategories.value.some((category) => !savedCategories.value.includes(category)),
);

const selectDepartment = (department: Department) => {
    selectedDepartmentId.value = department.id;
    selectedCategories.value = [...(department.purchaseRequestCategories ?? PURCHASE_REQUEST_CATEGORIES)];
    saveError.value = "";
};

const loadDepartments = async () => {
    if (saving.value || switching.value) return;
    loading.value = true;
    loadError.value = "";
    try {
        departments.value = await retrieveDepartments();
        if (departments.value.length) {
            selectDepartment(departments.value[0]!);
        } else {
            selectedDepartmentId.value = "";
            selectedCategories.value = [];
        }
    } catch (error: any) {
        loadError.value = error.message || "部门加载失败，请稍后重试";
    } finally {
        loading.value = false;
    }
};

const changeDepartment = async (event: Event) => {
    const select = event.target as HTMLSelectElement;
    const nextDepartment = departments.value.find((department) => department.id === select.value);
    select.value = selectedDepartmentId.value;
    if (busy.value || !nextDepartment || nextDepartment.id === selectedDepartmentId.value) return;

    switching.value = true;
    try {
        if (hasUnsavedChanges.value) {
            try {
                await erpMessageBox.confirm("当前部门的修改尚未保存，是否放弃修改并切换部门？", "切换部门", {
                    confirmButtonText: "放弃并切换",
                    cancelButtonText: "继续编辑",
                    type: "warning",
                });
            } catch {
                return;
            }
        }
        selectDepartment(nextDepartment);
    } finally {
        switching.value = false;
    }
};

const saveSettings = async () => {
    const department = selectedDepartment.value;
    if (busy.value || !department || loadError.value) return;
    const categories = PURCHASE_REQUEST_CATEGORIES.filter((category) => selectedCategories.value.includes(category));
    saving.value = true;
    saveError.value = "";
    try {
        await updateDepartment(department.id, { purchaseRequestCategories: categories });
        department.purchaseRequestCategories = [...categories];
        selectedCategories.value = [...categories];
        ElMessage.success("采购申请类别设置已保存");
    } catch (error: any) {
        saveError.value = error.message || "保存失败，请稍后重试";
    } finally {
        saving.value = false;
    }
};

onMounted(loadDepartments);
</script>

<style scoped>
.settings-page {
    height: 100%;
    padding: var(--erp-spacing-24);
    overflow: auto;
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.settings-card {
    width: min(760px, 100%);
    overflow: hidden;
    border: 1px solid var(--erp-color-divider-default);
    border-radius: var(--erp-radius-surface-default);
}

.card-header,
.card-body {
    padding: var(--erp-spacing-24);
}

.card-header {
    border-bottom: 1px solid var(--erp-color-divider-default);
}

h1 {
    margin: 0;
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
}

.department-field {
    display: flex;
    flex-direction: column;
    gap: var(--erp-spacing-12);
    margin-bottom: var(--erp-spacing-24);
}

.department-field > span,
.category-field legend {
    font-weight: var(--erp-typography-title3-font-weight);
}

.department-field select {
    width: min(280px, 100%);
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-12);
    border: 1px solid var(--erp-color-divider-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
}

.category-field {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
}

.category-field legend {
    margin-bottom: var(--erp-spacing-12);
    padding: 0;
}

.category-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--erp-spacing-12);
}

.category-option {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-8);
    min-height: var(--erp-size-control-height-md);
    padding: var(--erp-spacing-8) var(--erp-spacing-12);
    border: 1px solid var(--erp-color-divider-default);
    border-radius: var(--erp-radius-control-default);
    cursor: pointer;
}

.category-option.selected {
    border-color: var(--erp-color-brand-100);
    background: var(--erp-color-fill-nav-selected);
}

.category-option input {
    margin: 0;
    accent-color: var(--erp-color-action-primary);
}

.card-footer {
    display: flex;
    justify-content: flex-end;
    padding: var(--erp-spacing-16) var(--erp-spacing-24);
    border-top: 1px solid var(--erp-color-divider-default);
    background: var(--erp-color-fill-hover);
}

.save-button,
.retry-button {
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-24);
    border: 0;
    border-radius: var(--erp-radius-control-default);
    cursor: pointer;
}

.save-button {
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.retry-button {
    color: var(--erp-color-action-primary);
    background: var(--erp-color-fill-nav-selected);
}

button:disabled,
select:disabled,
.category-field:disabled .category-option {
    cursor: not-allowed;
    opacity: 0.6;
}

.state-message {
    margin: 0;
    color: var(--erp-color-text-tertiary);
}

.error-state {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-16);
}

.error-state,
.error-message {
    color: var(--erp-color-text-status-error);
}

.error-message {
    margin: var(--erp-spacing-16) 0 0;
}

@media (max-width: 900px) {
    .category-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
