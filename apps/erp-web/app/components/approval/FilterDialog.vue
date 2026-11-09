<template>
    <div class="filter-dialog" role="dialog" @click.stop>
        <div class="filter-field">
            <span>审批单发起人</span>
            <SearchableSelect
                v-model="draft.applicantId"
                :options="applicantOptions"
                placeholder="全部发起人"
            />
        </div>

        <fieldset class="date-group">
            <legend>提交日期</legend>
            <div class="date-range">
                <InventoryDatePicker
                    v-model="draft.submittedStart"
                    class="date-picker-start"
                    placeholder="开始日期"
                />
                <span>—</span>
                <InventoryDatePicker
                    v-model="draft.submittedEnd"
                    class="date-picker-end"
                    placeholder="结束日期"
                />
            </div>
        </fieldset>

        <fieldset class="date-group">
            <legend>完成审批</legend>
            <div class="date-range">
                <InventoryDatePicker
                    v-model="draft.completedStart"
                    class="date-picker-start"
                    placeholder="开始日期"
                />
                <span>—</span>
                <InventoryDatePicker
                    v-model="draft.completedEnd"
                    class="date-picker-end"
                    placeholder="结束日期"
                />
            </div>
        </fieldset>

        <footer class="filter-actions">
            <button class="reset-button" type="button" @click="reset">重置筛选</button>
            <div>
                <button class="cancel-button" type="button" @click="emit('close')">取消</button>
                <button class="confirm-button" type="button" @click="apply">确认</button>
            </div>
        </footer>
    </div>
</template>

<script setup lang="ts">
import InventoryDatePicker from "~/components/configuration/inventory/InventoryDatePicker.vue";
import SearchableSelect from "~/components/configuration/SearchableSelect.vue";
import type {
    ApprovalAdvancedFilters,
    ApprovalUser,
} from "~/types/approval";

const props = defineProps<{
    modelValue: ApprovalAdvancedFilters;
    applicants: ApprovalUser[];
}>();

const emit = defineEmits<{
    "update:modelValue": [value: ApprovalAdvancedFilters];
    close: [];
    apply: [];
}>();

const emptyFilters = (): ApprovalAdvancedFilters => ({
    applicantId: "",
    submittedStart: "",
    submittedEnd: "",
    completedStart: "",
    completedEnd: "",
});

const draft = reactive<ApprovalAdvancedFilters>(emptyFilters());
const applicantOptions = computed(() => props.applicants.map((applicant) => ({
    label: applicant.name,
    value: applicant.adminId,
})));

watch(
    () => props.modelValue,
    (value) => Object.assign(draft, value),
    { immediate: true, deep: true },
);

const reset = () => {
    Object.assign(draft, emptyFilters());
};

const apply = () => {
    emit("update:modelValue", { ...draft });
    emit("apply");
};
</script>

<style scoped>
.filter-dialog {
    position: absolute;
    top: calc(100% + var(--erp-spacing-8));
    /* left: var(--erp-spacing-12); */
    width: min(380px, calc(100vw - var(--erp-spacing-40)));
    box-sizing: border-box;
    z-index: 30;
    display: grid;
    gap: var(--erp-spacing-20);
    padding: var(--erp-spacing-20);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-dialog);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.filter-field,
.date-group {
    min-width: 0;
    display: grid;
    gap: var(--erp-spacing-8);
    margin: 0;
    padding: 0;
    border: 0;
}

.filter-field > span,
.date-group legend {
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
}

.filter-field :deep(.searchable-select) {
    --searchable-select-height: var(--erp-size-control-height-sm);
    --searchable-select-border: var(--erp-color-border-default);
    --searchable-select-radius: var(--erp-radius-control-default);
    --searchable-select-active-border: var(--erp-color-border-brand);
    --searchable-select-text: var(--erp-color-text-primary);
    --searchable-select-bg: var(--erp-color-fill-default);
    --searchable-select-font-size: var(--erp-typography-content1-font-size);
    --searchable-select-placeholder: var(--erp-color-text-tertiary);
    --searchable-select-icon: var(--erp-color-icon-default);
    --searchable-select-panel-border: var(--erp-color-border-muted);
}

.date-range {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--erp-spacing-8);
}

.date-range > span {
    color: var(--erp-color-text-tertiary);
}

.date-range :deep(.inventory-date-picker) {
    width: 100%;
    max-width: none;
    min-width: 0;
    flex: 1 1 0;
}

.date-picker-end :deep(.date-panel) {
    right: 0;
    left: auto;
}

.filter-actions,
.filter-actions > div {
    display: flex;
    align-items: center;
}

.filter-actions {
    justify-content: space-between;
    gap: var(--erp-spacing-12);
}

.filter-actions > div {
    gap: var(--erp-spacing-8);
}

.filter-actions button {
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-12);
    border-radius: var(--erp-radius-control-default);
    cursor: pointer;
}

.reset-button {
    border: 0;
    color: var(--erp-color-text-brand);
    background: transparent;
}

.cancel-button {
    border: 1px solid var(--erp-color-border-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
}

.confirm-button {
    border: 1px solid var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

</style>
