<template>
    <div class="erp-dialog-mask" @click.self="close" @keydown.esc.stop="close">
        <ErpDialogFrame
            class="bom-history-dialog"
            :title="`BOM 历史版本 · ${bomCode}`"
            width="min(1120px, calc(100vw - 32px))"
            height="min(820px, calc(100vh - 32px))"
            :form="false"
            role="dialog"
            aria-modal="true"
            :aria-label="`${bomCode}的BOM历史版本`"
            @close="close"
        >
            <div class="history-body" :aria-busy="loading">
                <p class="history-hint">历史序号用于区分每次实际修改，与 BOM 业务版本字段分别记录。</p>
                <div v-if="loading" class="history-state" role="status">正在加载历史版本...</div>
                <div v-else-if="error" class="history-state history-error" role="alert">
                    <span>{{ error }}</span>
                    <button class="dialog-button cancel" type="button" @click="loadPage(requestedPage)">重试</button>
                </div>
                <div v-else-if="records.length === 0" class="history-state">暂无历史版本；旧 BOM 将在首次实际修改时保存基准版本。</div>
                <div v-else class="history-list">
                    <article v-for="record in records" :key="record._id || record.revision" class="history-record">
                        <header class="record-header">
                            <div class="record-title">
                                <strong>历史版本 #{{ record.revision }}</strong>
                                <span class="action-tag">{{ actionLabel(record.action) }}</span>
                                <span>{{ record.operator || "未记录操作人" }}</span>
                            </div>
                            <time>{{ record.action === "baseline" ? "基准采集时间：" : "记录时间：" }}{{ formatTime(record.createdAt) }}</time>
                        </header>
                        <p v-if="record.action === 'baseline'" class="baseline-note">
                            此版本是历史功能启用后采集的修改前基准，不代表 BOM 的原始创建版本或原修改时间。
                        </p>
                        <div v-if="record.changes.fields.length" class="field-changes">
                            <div v-for="field in record.changes.fields" :key="field.field" class="field-change">
                                <strong>{{ field.label }}</strong>
                                <span>{{ formatValue(field.before) }}</span>
                                <span class="change-arrow" aria-label="变更为">→</span>
                                <span>{{ formatValue(field.after) }}</span>
                            </div>
                        </div>
                        <div v-if="record.changes.items.length" class="item-changes">
                            <section v-for="(change, index) in record.changes.items" :key="`${change.lineId}-${index}`" class="item-change">
                                <strong class="item-change-title">{{ itemActionLabel(change.type) }}</strong>
                                <div class="item-comparison">
                                    <div class="item-side">
                                        <span class="side-label">变更前</span>
                                        <template v-if="change.before">
                                            <strong>{{ productLabel(change.before) }}</strong>
                                            <span>数量：{{ formatValue(change.before.quantity) }} {{ unitLabel(change.before) }}</span>
                                        </template>
                                        <span v-else>无</span>
                                    </div>
                                    <span class="change-arrow" aria-hidden="true">→</span>
                                    <div class="item-side">
                                        <span class="side-label">变更后</span>
                                        <template v-if="change.after">
                                            <strong>{{ productLabel(change.after) }}</strong>
                                            <span>数量：{{ formatValue(change.after.quantity) }} {{ unitLabel(change.after) }}</span>
                                        </template>
                                        <span v-else>无</span>
                                    </div>
                                </div>
                                <div v-for="detail in itemDetails(change)" :key="detail.label" class="item-extra-change">
                                    <strong>{{ detail.label }}：</strong>{{ detail.before }} → {{ detail.after }}
                                </div>
                            </section>
                        </div>
                        <p v-if="!record.changes.fields.length && !record.changes.items.length" class="history-hint">
                            {{ record.action === "create" ? "新建 BOM，完整内容见版本快照。" : "完整内容见版本快照。" }}
                        </p>
                        <details class="snapshot">
                            <summary :aria-label="`查看历史版本${record.revision}的完整快照`">查看完整版本快照</summary>
                            <dl class="snapshot-fields">
                                <div v-for="field in snapshotFields(record.snapshot)" :key="field.label">
                                    <dt>{{ field.label }}</dt>
                                    <dd>{{ field.value }}</dd>
                                </div>
                            </dl>
                            <div class="snapshot-table-wrap" tabindex="0" :aria-label="`历史版本${record.revision}的子项物料`">
                                <table class="snapshot-table">
                                    <thead>
                                        <tr>
                                            <th>产品编码</th><th>产品名称</th><th>型号</th><th>分类</th>
                                            <th>数量</th><th>单位</th><th>损耗率</th><th>备注</th><th>排序</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="(item, index) in record.snapshot.items" :key="item.lineId || `${item.productId}-${index}`">
                                            <td>{{ item.productCode || item.productId }}</td>
                                            <td>{{ formatValue(item.productName) }}</td>
                                            <td>{{ formatValue(item.model) }}</td>
                                            <td>{{ formatValue(item.categoryName) }}</td>
                                            <td>{{ formatValue(item.quantity) }}</td>
                                            <td>{{ unitLabel(item) }}</td>
                                            <td>{{ formatValue(item.lossRate ?? 0) }}</td>
                                            <td>{{ formatValue(item.remark) }}</td>
                                            <td>{{ formatValue(item.sort ?? index) }}</td>
                                        </tr>
                                        <tr v-if="record.snapshot.items.length === 0"><td colspan="9">无子项物料</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </details>
                    </article>
                </div>
            </div>
            <template #footer>
                <div class="history-pagination" aria-label="历史版本分页">
                    <button class="dialog-button cancel" type="button" :disabled="loading || page <= 1" @click="loadPage(page - 1)">上一页</button>
                    <span aria-live="polite">第 {{ page }} / {{ totalPages }} 页，共 {{ total }} 个版本</span>
                    <button class="dialog-button cancel" type="button" :disabled="loading || !hasMore" @click="loadPage(page + 1)">下一页</button>
                </div>
                <button class="dialog-button cancel" type="button" @click="close">关闭</button>
            </template>
        </ErpDialogFrame>
    </div>
</template>

<script setup lang="ts">
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import { getInventoryBomDetail } from "~/composables/api/useInventoryApi";
import type { InventoryBom, InventoryBomItem } from "~~/shared/types/inventory";
import type { BomHistoryItemChange, InventoryBomHistory } from "~~/shared/types/inventoryBomHistory";

const props = defineProps<{ bomId: string; bomCode: string }>();
const emit = defineEmits<{ close: [] }>();
const PAGE_SIZE = 20;
const records = ref<InventoryBomHistory[]>([]);
const page = ref(1);
const requestedPage = ref(1);
const total = ref(0);
const hasMore = ref(false);
const loading = ref(false);
const error = ref("");
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));
let requestSequence = 0;

const formatValue = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "启用" : "停用";
    return String(value);
};

const formatTime = (value?: string | Date) => {
    if (!value) return "未记录";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "未记录" : date.toLocaleString("zh-CN", { hour12: false });
};

const actionLabel = (action: InventoryBomHistory["action"]) => ({ create: "新建", baseline: "修改前基准", update: "修改" })[action];
const itemActionLabel = (type: BomHistoryItemChange["type"]) => ({ added: "新增产品", removed: "删除产品", replaced: "替换产品", updated: "修改子项" })[type];

const productLabel = (item: Pick<InventoryBomItem, "productId" | "productCode" | "productName" | "model">) => {
    const parts = [item.productCode || item.productId, item.productName, item.model];
    return parts.filter(Boolean).join(" · ") || "未记录产品";
};

const unitLabel = (item: InventoryBomItem) => {
    if (item.unitName && item.unitCode && item.unitName !== item.unitCode) return `${item.unitName}（${item.unitCode}）`;
    return item.unitName || item.unitCode || item.unitId || "—";
};

const itemDetails = (change: BomHistoryItemChange) => {
    const details: Array<{ label: string; before: string; after: string }> = [];
    const fields = [
        { key: "unitId", label: "单位标识" },
        { key: "unitCode", label: "单位编码" },
        { key: "unitName", label: "单位名称" },
        { key: "lossRate", label: "损耗率" },
        { key: "remark", label: "备注" },
        { key: "sort", label: "排序" },
        { key: "categoryName", label: "分类" },
    ] as const;
    for (const field of fields) {
        const before = change.before?.[field.key];
        const after = change.after?.[field.key];
        if ((before ?? "") !== (after ?? "")) {
            details.push({ label: field.label, before: formatValue(before), after: formatValue(after) });
        }
    }
    return details;
};

const snapshotFields = (snapshot: InventoryBom) => {
    const fields = [
        { label: "BOM 编码", value: formatValue(snapshot.code) },
        { label: "BOM 名称", value: formatValue(snapshot.name) },
        { label: "主产品", value: productLabel(snapshot) },
        { label: "BOM 业务版本", value: formatValue(snapshot.version) },
        { label: "是否启用", value: formatValue(Boolean(snapshot.isEnabled)) },
        { label: "工序", value: formatValue(snapshot.process) },
        { label: "备注", value: formatValue(snapshot.remark) },
        { label: "经办人", value: formatValue(snapshot.operator) },
        { label: "创建人", value: formatValue(snapshot.createdBy) },
        { label: "修改人", value: formatValue(snapshot.updatedBy) },
        { label: "快照中的创建时间", value: formatTime(snapshot.createTime) },
        { label: "快照中的修改时间", value: formatTime(snapshot.updateTime) },
    ];
    for (const key of ["reserved1", "reserved2", "reserved3", "reserved4", "reserved5"] as const) {
        if (snapshot[key]) fields.push({ label: `预留字段 ${key.slice(-1)}`, value: formatValue(snapshot[key]) });
    }
    return fields;
};

const close = () => {
    requestSequence += 1;
    emit("close");
};

const loadPage = async (targetPage: number) => {
    if (!props.bomId) {
        error.value = "缺少 BOM 标识，无法读取历史版本";
        return;
    }
    const sequence = ++requestSequence;
    requestedPage.value = targetPage;
    loading.value = true;
    error.value = "";
    try {
        const response = await getInventoryBomDetail({
            id: props.bomId,
            includeHistory: true,
            page: targetPage,
            limit: PAGE_SIZE,
        });
        if (sequence !== requestSequence) return;
        if (response.code !== 200 || !response.data?.history) throw new Error(response.msg || "获取历史版本失败");
        const history = response.data.history;
        records.value = [...history.list].sort((left, right) => right.revision - left.revision);
        page.value = history.pagination.page;
        total.value = history.pagination.total;
        hasMore.value = history.pagination.hasMore;
    } catch (err: any) {
        if (sequence === requestSequence) error.value = err?.data?.msg || err?.message || "获取历史版本失败";
    } finally {
        if (sequence === requestSequence) loading.value = false;
    }
};

watch(() => props.bomId, () => {
    requestSequence += 1;
    loading.value = false;
    records.value = [];
    page.value = 1;
    requestedPage.value = 1;
    total.value = 0;
    hasMore.value = false;
    void loadPage(1);
}, { immediate: true });

onBeforeUnmount(() => { requestSequence += 1; });
</script>

<style scoped>
.bom-history-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
    overflow: hidden;
}

.bom-history-dialog :deep(.erp-dialog-frame__actions) {
    flex-wrap: wrap;
}

.history-body {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
}

.history-hint,
.side-label,
.record-header time {
    color: var(--erp-color-text-secondary);
}

.history-hint,
.baseline-note {
    margin: 0 0 var(--erp-spacing-12);
    line-height: 1.6;
}

.history-state {
    min-height: 180px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-16);
    text-align: center;
}

.history-error {
    color: var(--erp-color-text-status-error);
}

.history-list,
.item-changes {
    display: grid;
    gap: var(--erp-spacing-12);
}

.history-record {
    min-width: 0;
    padding: var(--erp-spacing-16);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    overflow-wrap: anywhere;
}

.record-header,
.record-title,
.history-pagination {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--erp-spacing-8);
}

.record-header {
    justify-content: space-between;
    margin-bottom: var(--erp-spacing-12);
}

.action-tag {
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-fill-table-header);
    color: var(--erp-color-text-brand);
}

.field-changes {
    display: grid;
    gap: var(--erp-spacing-8);
    margin-bottom: var(--erp-spacing-12);
}

.field-change {
    display: grid;
    grid-template-columns: minmax(80px, 120px) minmax(0, 1fr) 24px minmax(0, 1fr);
    gap: var(--erp-spacing-8);
    align-items: start;
    white-space: pre-wrap;
}

.change-arrow {
    color: var(--erp-color-text-secondary);
    text-align: center;
}

.item-change {
    padding: var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-control-default);
}

.item-change-title {
    display: block;
    margin-bottom: var(--erp-spacing-8);
}

.item-comparison {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr);
    gap: var(--erp-spacing-8);
    align-items: center;
}

.item-side {
    display: grid;
    gap: var(--erp-spacing-4);
}

.item-extra-change {
    margin-top: var(--erp-spacing-8);
    white-space: pre-wrap;
}

.snapshot {
    margin-top: var(--erp-spacing-16);
}

.snapshot summary {
    color: var(--erp-color-text-brand);
    cursor: pointer;
}

.snapshot-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--erp-spacing-12);
    margin: var(--erp-spacing-16) 0;
}

.snapshot-fields dt {
    margin-bottom: var(--erp-spacing-4);
    color: var(--erp-color-text-secondary);
}

.snapshot-fields dd {
    margin: 0;
    white-space: pre-wrap;
}

.snapshot-table-wrap {
    overflow: auto;
}

.snapshot-table {
    width: 100%;
    min-width: 850px;
    border-collapse: collapse;
}

.snapshot-table th,
.snapshot-table td {
    padding: var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-muted);
    text-align: left;
    vertical-align: top;
    white-space: pre-wrap;
}

.snapshot-table th {
    background: var(--erp-color-fill-table-header);
}

.history-pagination {
    margin-right: auto;
}

@media (max-width: 640px) {
    .field-change {
        grid-template-columns: minmax(0, 1fr) 24px minmax(0, 1fr);
    }

    .field-change > strong {
        grid-column: 1 / -1;
    }

    .snapshot-fields {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
