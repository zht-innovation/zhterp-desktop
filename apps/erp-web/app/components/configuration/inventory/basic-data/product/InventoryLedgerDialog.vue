<template>
    <div class="erp-dialog-mask inventory-ledger-mask" @click.self="emit('close')">
        <ErpDialogFrame
            class="inventory-ledger-dialog"
            title="库存流水账"
            width="1200px"
            height="700px"
            :form="false"
            :show-footer="false"
            @close="emit('close')"
        >
            <div class="inventory-ledger-content">
                <ErpTableFrame
                    class="inventory-ledger-table"
                    :columns="inventoryLedgerColumnTemplate"
                    :loading="loading"
                    :empty="records.length === 0"
                    loading-text="正在加载库存流水..."
                    empty-text="暂无库存流水"
                    scroll-x
                    embedded
                >
                    <template #header>
                        <div class="table-row table-head inventory-ledger-row">
                            <div
                                v-for="column in inventoryLedgerColumns"
                                :key="column.key"
                                class="table-cell"
                            >
                                {{ column.label }}
                            </div>
                        </div>
                    </template>

                    <div
                        v-for="record in records"
                        :key="record.id"
                        class="table-row data-row inventory-ledger-row"
                    >
                        <div
                            v-for="column in inventoryLedgerColumns"
                            :key="`${record.id}-${column.key}`"
                            class="table-cell"
                            :class="{ 'inventory-ledger-remark': column.key === 'remark' }"
                        >
                            {{ getInventoryLedgerCellValue(record, column.key) }}
                        </div>
                    </div>
                </ErpTableFrame>

                <InventoryPagination
                    v-model:page-size="pageSizeModel"
                    v-model:jump-page-input="jumpPageInputModel"
                    :total="total"
                    :page-size-options="pageSizeOptions"
                    :page-numbers="pageNumbers"
                    :total-pages="totalPages"
                    :current-page="currentPage"
                    @page-change="emit('page-change', $event)"
                    @jump="emit('jump')"
                />
            </div>
        </ErpDialogFrame>
    </div>
</template>
<script setup lang="ts">
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";

interface InventoryLedgerRecord {
    id: string;
    changedAt: string;
    relatedOrderNo: string;
    businessType: string;
    quantity: string;
    unit: string;
    outboundWarehouse: string;
    inboundWarehouse: string;
    remark: string;
}

interface InventoryLedgerColumn {
    key:
        | "changedAt"
        | "relatedOrderNo"
        | "businessType"
        | "quantity"
        | "unit"
        | "outboundWarehouse"
        | "inboundWarehouse"
        | "remark";
    label: string;
    width: number;
}

const props = defineProps<{
    records: InventoryLedgerRecord[];
    loading: boolean;
    total: number;
    pageSize: number;
    jumpPageInput: string;
    pageSizeOptions: number[];
    pageNumbers: number[];
    totalPages: number;
    currentPage: number;
}>();

const emit = defineEmits<{
    close: [];
    jump: [];
    "page-change": [page: number];
    "update:pageSize": [value: number];
    "update:jumpPageInput": [value: string];
}>();

const pageSizeModel = computed({
    get: () => props.pageSize,
    set: (value: number) => emit("update:pageSize", value),
});

const jumpPageInputModel = computed({
    get: () => props.jumpPageInput,
    set: (value: string) => emit("update:jumpPageInput", value),
});

const inventoryLedgerColumns: InventoryLedgerColumn[] = [
    { key: "changedAt", label: "变动时间", width: 120 },
    { key: "relatedOrderNo", label: "关联单号", width: 180 },
    { key: "businessType", label: "业务类型", width: 120 },
    { key: "quantity", label: "数量", width: 90 },
    { key: "unit", label: "单位", width: 80 },
    { key: "outboundWarehouse", label: "出库仓库", width: 140 },
    { key: "inboundWarehouse", label: "入库仓库", width: 140 },
    { key: "remark", label: "备注", width: 240 },
];

const inventoryLedgerColumnTemplate = computed(() =>
    inventoryLedgerColumns
        .map((column) => `${column.width}px`)
        .join(" "),
);

const getInventoryLedgerCellValue = (
    record: InventoryLedgerRecord,
    key: InventoryLedgerColumn["key"],
) => record[key] || "--";
</script>

<style scoped>
.inventory-ledger-mask {
    z-index: 60;
}

.inventory-ledger-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
    overflow: hidden;
}

.inventory-ledger-content {
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-12);
}

.inventory-ledger-table {
    min-height: 0;
    height: 100%;
}

.inventory-ledger-table .inventory-ledger-row {
    width: max-content;
    min-width: 100%;
}

.inventory-ledger-table .table-cell {
    overflow: hidden;
    text-overflow: ellipsis;
}

.inventory-ledger-table .data-row {
    height: auto;
    min-height: 64px;
}

.inventory-ledger-table .inventory-ledger-remark {
    display: block;
    padding-top: 12px;
    padding-bottom: 12px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    text-align: left;
    text-overflow: clip;
}
</style>
