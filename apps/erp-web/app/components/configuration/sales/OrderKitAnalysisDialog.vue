<template>
    <Teleport to="body">
        <div v-if="modelValue" ref="mask" class="erp-app analysis-mask" tabindex="-1" @click.self="close" @keydown.esc.stop.prevent="close">
            <section class="analysis-panel" role="dialog" aria-modal="true" aria-label="订单齐套可用性报告">
                <header class="analysis-header">
                    <h4>订单齐套可用性报告</h4>
                    <button type="button" aria-label="关闭齐套分析" @click="close"><Icon name="material-symbols:close" /></button>
                </header>
                <div class="analysis-body">
                    <p v-if="rows.length" class="analysis-summary">订单当前状态：<strong :class="{ shortage: hasShortage }">{{ hasShortage ? '物料不齐，无法完全交付！' : '物料齐套，可满足交付。' }}</strong></p>
                    <p v-if="analysisTime" class="analysis-note">分析时间：{{ analysisTime }}</p>
                    <p v-if="stockDescription" class="analysis-note">{{ stockDescription }}</p>
                    <div class="analysis-table">
                        <div class="analysis-table-inner" :style="{ minWidth: `${tableWidth}px` }">
                            <div class="analysis-row analysis-head" :style="{ gridTemplateColumns: columns }">
                                <div v-if="canShow('productImage')">产品图片</div>
                                <div v-if="canShow('productModel')">产品型号</div>
                                <div>需求物料</div><div>订单耗用量</div>
                                <div v-if="canShow('unitName')">单位</div>
                                <div>真实可用库存</div><div>缺口数量</div><div>状态</div><div>建议</div>
                            </div>
                            <div v-if="!visibleRows.length" class="analysis-empty">暂无齐套分析结果</div>
                            <div v-for="row in visibleRows" :key="row.key" class="analysis-row analysis-data" :style="{ gridTemplateColumns: columns }">
                                <div v-if="canShow('productImage')" class="analysis-image-cell">
                                    <button v-if="row.image" type="button" :aria-label="`预览${productLabel(row)}图片`" @click="openImage(row)"><img :src="resolveErpImageUrl(row.image)" :alt="productLabel(row)" /></button>
                                    <Icon v-else name="material-symbols:image-outline" />
                                </div>
                                <div v-if="canShow('productModel')" class="analysis-model-cell" :title="productLabel(row)">{{ productLabel(row) }}</div>
                                <div class="analysis-material-cell">
                                    <span class="analysis-indent" :style="{ width: `${Math.max(0, row.level - 1) * 28}px` }" />
                                    <button v-if="row.children.length" type="button" class="analysis-toggle" :aria-expanded="expandedKeys.has(row.key)" :aria-label="`${expandedKeys.has(row.key) ? '收起' : '展开'}${materialLabel(row)}`" @click="toggleRow(row.key)"><Icon :name="expandedKeys.has(row.key) ? 'lucide:minus' : 'lucide:plus'" /></button>
                                    <span v-else class="analysis-toggle-placeholder" />
                                    <span class="analysis-material-name" :title="materialLabel(row)">{{ materialLabel(row) }}</span>
                                </div>
                                <div>{{ formatQuantity(row.demandQuantity) }}</div>
                                <div v-if="canShow('unitName')">{{ row.unitName || '--' }}</div>
                                <div>{{ formatQuantity(row.availableQuantity) }}</div>
                                <div>{{ row.shortageQuantity < 0 ? `-${formatQuantity(Math.abs(row.shortageQuantity))}` : '0' }}</div>
                                <div><span class="analysis-status" :class="{ shortage: row.status === '缺货' }">{{ row.status }}</span></div>
                                <div>{{ row.suggestion || '--' }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            <ImagePreviewDialog v-model="showImagePreview" class="kit-analysis-image-preview" :title="previewTitle" :images="previewImages" :z-index="5200" />
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import ImagePreviewDialog, { type PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import type { OrderKitAnalysisRow } from "~~/shared/types/orderKitAnalysis";
import { normalizeOrderVisibleFields, type OrderApprovalField } from "~~/shared/types/orderApproval";

const props = defineProps<{
    modelValue: boolean;
    rows: OrderKitAnalysisRow[];
    analyzedAt?: string;
    visibleFields?: readonly OrderApprovalField[];
    stockDescription?: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: boolean] }>();
const mask = ref<HTMLDivElement | null>(null);
const expandedKeys = ref(new Set<string>());
const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");
const allowedFields = computed(() => new Set(normalizeOrderVisibleFields(props.visibleFields)));
const canShow = (field: OrderApprovalField) => allowedFields.value.has(field);
const columnWidths = computed(() => [
    ...(canShow("productImage") ? [88] : []),
    ...(canShow("productModel") ? [170] : []),
    220, 110,
    ...(canShow("unitName") ? [76] : []),
    130, 110, 90, 130,
]);
const columns = computed(() => columnWidths.value.map((width) => `${width}px`).join(" "));
const tableWidth = computed(() => columnWidths.value.reduce((sum, width) => sum + width, 0));
const visibleRows = computed(() => {
    const result: OrderKitAnalysisRow[] = [];
    const walk = (rows: OrderKitAnalysisRow[]) => {
        for (const row of rows) {
            result.push(row);
            if (expandedKeys.value.has(row.key)) walk(row.children);
        }
    };
    walk(props.rows);
    return result;
});
const hasShortageRows = (rows: OrderKitAnalysisRow[]): boolean => {
    for (const row of rows) {
        if (row.status === "缺货" || hasShortageRows(row.children)) return true;
    }
    return false;
};
const hasShortage = computed(() => hasShortageRows(props.rows));
const analysisTime = computed(() => {
    if (!props.analyzedAt) return "";
    const date = new Date(props.analyzedAt);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
});
const formatQuantity = (value: number) => Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 3 });
const productLabel = (row: OrderKitAnalysisRow) => {
    if (canShow("productModel")) return row.model || row.productName || (canShow("productCode") ? row.productCode : "") || "--";
    return canShow("productCode") ? row.productCode || "--" : "--";
};
const materialLabel = (row: OrderKitAnalysisRow) => (canShow("productCode") && row.productCode) || productLabel(row);
const close = () => {
    showImagePreview.value = false;
    emit("update:modelValue", false);
};
const toggleRow = (key: string) => {
    const next = new Set(expandedKeys.value);
    if (next.has(key)) {
        next.delete(key);
        for (const childKey of next) if (childKey.startsWith(`${key}/`)) next.delete(childKey);
    } else {
        next.add(key);
    }
    expandedKeys.value = next;
};
const openImage = (row: OrderKitAnalysisRow) => {
    if (!canShow("productImage") || !row.image) return;
    previewTitle.value = productLabel(row);
    previewImages.value = [{ url: row.image, alt: previewTitle.value }];
    showImagePreview.value = true;
};
watch(() => [props.modelValue, props.rows] as const, async ([visible]) => {
    showImagePreview.value = false;
    if (!visible) return;
    const keys = new Set<string>();
    const collect = (rows: OrderKitAnalysisRow[]) => {
        for (const row of rows) {
            if (row.children.length) keys.add(row.key);
            collect(row.children);
        }
    };
    collect(props.rows);
    expandedKeys.value = keys;
    await nextTick();
    mask.value?.focus();
}, { immediate: true });
</script>

<style scoped>
.analysis-mask { position: fixed; inset: 0; z-index: 3200; display: flex; align-items: center; justify-content: center; background: rgba(15, 23, 42, .18); outline: none; }
.analysis-panel { width: min(980px, calc(100vw - 48px)); max-height: min(620px, calc(100vh - 80px)); display: flex; flex-direction: column; border: 1px solid #9ecbff; background: #fff; color: #374151; box-shadow: 0 18px 45px #0f172e2e; }
.analysis-header { min-height: 48px; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 18px; }
.analysis-header h4 { margin: 0; color: #1f2937; font-size: 16px; font-weight: 700; }
.analysis-header button { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border: none; background: transparent; color: #4b5563; cursor: pointer; font-size: 18px; }
.analysis-body { min-height: 0; padding: 8px 24px 24px; overflow: auto; }
.analysis-summary { margin: 0 0 16px; color: #111827; font-size: 15px; }
.analysis-summary strong { font-weight: 700; color: #16a34a; }.analysis-summary strong.shortage { color: #111827; }
.analysis-note { margin: 0 0 12px; color: #6b7280; font-size: 12px; line-height: 1.7; }
.analysis-table { overflow-x: auto; }.analysis-row { display: grid; align-items: center; min-height: 42px; text-align: center; }
.analysis-head { border-radius: 6px; background: #e8f0f8; color: #1f2937; font-size: 13px; font-weight: 700; }.analysis-data { color: #374151; font-size: 13px; }
.analysis-image-cell { height: 52px; display: flex; align-items: center; justify-content: center; }.analysis-image-cell button { padding: 0; border: none; background: transparent; cursor: zoom-in; }.analysis-image-cell img { width: 54px; height: 40px; display: block; border: 1px solid #e5edf7; border-radius: 4px; background: #f4f7fb; object-fit: contain; }.analysis-image-cell > :deep(svg) { color: #9ca3af; font-size: 24px; }
.analysis-model-cell { min-width: 0; padding: 0 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.analysis-material-cell { min-width: 0; display: flex; align-items: center; justify-content: flex-start; padding: 0 12px; text-align: left; }.analysis-indent { flex: 0 0 auto; height: 1px; }
.analysis-toggle, .analysis-toggle-placeholder { width: 16px; height: 16px; flex: 0 0 16px; margin-right: 8px; }.analysis-toggle { display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 1px solid #3ba8f5; border-radius: 3px; background: #fff; color: #3ba8f5; cursor: pointer; }.analysis-toggle :deep(svg) { width: 12px; height: 12px; stroke-width: 2.4; }
.analysis-material-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.analysis-status { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; height: 22px; padding: 0 10px; border-radius: 999px; background: #dcfce7; color: #22c55e; font-size: 12px; }.analysis-status.shortage { background: #fee2e2; color: #ef4444; }
.analysis-empty { height: 120px; display: flex; align-items: center; justify-content: center; color: #9ca3af; }
@media (max-width: 640px) { .analysis-panel { width: calc(100vw - 24px); max-height: calc(100vh - 32px); }.analysis-body { padding: 8px 12px 16px; }:global(.kit-analysis-image-preview.image-preview-dialog) { min-width: 0; width: calc(100vw - 24px) !important; } }
</style>
