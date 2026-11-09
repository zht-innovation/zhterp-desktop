<template>
    <div class="position-mask" @click.self="emit('close')" @keydown.esc.stop.prevent="emit('close')">
        <section ref="dialogRef" class="position-dialog" role="dialog" aria-modal="true" aria-label="按库位核对库存" @keydown.tab="trapFocus">
            <header><h3>{{ item.productCode }} · {{ item.model }} · 库位核对</h3><button type="button" aria-label="关闭库位核对" @click="emit('close')">×</button></header>
            <p>逐库位填写实盘数量，系统汇总为复核仓库总量。</p>
            <div class="position-scroll">
                <table>
                    <thead><tr><th>仓库</th><th>库位</th><th>计入可用</th><th>系统总量</th><th>实盘数量</th></tr></thead>
                    <tbody><tr v-for="position in positions" :key="position.id">
                        <td>{{ position.warehouseName || "未指定仓库" }}</td>
                        <td>{{ position.locationName || "未指定库位" }}</td>
                        <td>{{ position.includeInAvailable ? "是" : "否" }}</td>
                        <td>{{ position.quantity }}</td>
                        <td><input type="number" min="0" step="0.001" :value="position.checkedQuantity" :disabled="readonly" :aria-label="`${position.warehouseName}${position.locationName}实盘数量`" @input="updateQuantity(position, $event)"></td>
                    </tr><tr v-if="positions.length === 0"><td colspan="5">当前无库存库位；保存核对即确认零库存。如有实物，请先维护真实仓库和库位。</td></tr></tbody>
                </table>
            </div>
            <p>实盘合计：{{ complete ? total : "尚有库位未核对" }}</p>
            <p v-if="error" class="position-error" role="alert">{{ error }}</p>
            <footer><button type="button" @click="emit('close')">关闭</button><button v-if="!readonly" type="button" class="primary" @click="confirm">保存核对</button></footer>
        </section>
    </div>
</template>

<script setup lang="ts">
import type { InventoryReviewStockPosition } from "~~/shared/types/inventoryReview";

const props = withDefaults(defineProps<{
    item: { productCode: string; model: string; positions?: InventoryReviewStockPosition[] };
    readonly?: boolean;
}>(), { readonly: false });
const emit = defineEmits<{ close: []; save: [positions: InventoryReviewStockPosition[]] }>();
const positions = ref<InventoryReviewStockPosition[]>(JSON.parse(JSON.stringify(props.item.positions || [])));
const error = ref("");
const dialogRef = ref<HTMLElement | null>(null);
const previousFocus = import.meta.client && document.activeElement instanceof HTMLElement ? document.activeElement : null;
const complete = computed(() => positions.value.every((position) => position.checkedQuantity !== null));
const total = computed(() => Number(positions.value.reduce((sum, position) => sum + Number(position.checkedQuantity || 0), 0).toFixed(3)));

function updateQuantity(position: InventoryReviewStockPosition, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    position.checkedQuantity = value === "" ? null : Number(value);
    error.value = "";
}

function confirm() {
    if (props.readonly) return;
    for (const position of positions.value) {
        const value = position.checkedQuantity;
        if (value !== null && (!Number.isFinite(value) || value < 0)) {
            error.value = "请输入有效的非负实盘数量";
            return;
        }
        if (value !== null && Number(value.toFixed(3)) !== value) {
            error.value = "实盘数量最多支持 3 位小数";
            return;
        }
    }
    emit("save", positions.value);
}

function trapFocus(event: KeyboardEvent) {
    event.stopPropagation();
    const controls = Array.from(dialogRef.value?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)") || []);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

onMounted(() => { dialogRef.value?.querySelector<HTMLElement>("input:not(:disabled), button")?.focus(); });
onBeforeUnmount(() => { previousFocus?.focus(); });
</script>

<style scoped>
.position-mask { position: fixed; inset: 0; z-index: 2300; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgb(0 0 0 / 35%); }
.position-dialog { width: min(900px, 100%); max-height: calc(100dvh - 40px); overflow: auto; padding: 20px; border-radius: 6px; background: white; color: #303133; font-size: 13px; }
header, footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h3 { margin: 0; font-size: 16px; }
p { margin: 16px 0; }
.position-scroll { overflow-x: auto; }
table { width: 100%; min-width: 660px; border-collapse: collapse; text-align: left; }
th { background: var(--erp-color-fill-table-header); }
th, td { padding: 10px 8px; border-bottom: 1px solid #e6e6e6; }
input { width: 110px; padding: 6px; border: 1px solid #c5cdd6; border-radius: 3px; font: inherit; }
button { padding: 7px 14px; border: 1px solid #c5cdd6; border-radius: 4px; background: white; color: inherit; font: inherit; cursor: pointer; }
footer { justify-content: flex-end; }
.primary { background: var(--erp-color-action-primary); color: white; border-color: var(--erp-color-action-primary); }
.position-error { color: #df625c; }
</style>
