<template>
    <Teleport to="body">
        <Transition name="term-history-fade">
            <div
                v-if="modelValue"
                class="term-history-overlay erp-selectable"
                @click.self="close"
            >
                <section
                    class="term-history-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="term-history-title"
                >
                    <header class="term-history-header">
                        <div>
                            <h3 id="term-history-title">维护记录</h3>
                            <p>{{ customerName || "未知客户" }}</p>
                        </div>
                        <button
                            class="term-history-close"
                            type="button"
                            aria-label="关闭"
                            title="关闭"
                            @click="close"
                        >
                            <Icon name="material-symbols:close" size="22px" />
                        </button>
                    </header>

                    <div class="term-history-body">
                        <div v-if="initialLoading" class="term-history-state">
                            <Icon name="line-md:loading-twotone-loop" size="28px" />
                            <span>正在加载维护记录...</span>
                        </div>

                        <div v-else-if="error && !records.length" class="term-history-state error">
                            <Icon name="mdi:alert-circle-outline" size="28px" />
                            <span>{{ error }}</span>
                            <button type="button" class="state-action" @click="reload">
                                <Icon name="mdi:refresh" />
                                重新加载
                            </button>
                        </div>

                        <div v-else-if="!records.length" class="term-history-state">
                            <Icon name="mdi:history" size="30px" />
                            <span>暂无维护记录</span>
                        </div>

                        <div v-else class="term-history-list">
                            <article
                                v-for="item in views"
                                :key="item.id"
                                class="term-history-item"
                            >
                                <div class="term-history-marker" :class="item.statusTone"></div>
                                <div class="term-history-content">
                                    <div class="term-history-item-header">
                                        <div class="term-history-title-row">
                                            <strong>{{ item.title }}</strong>
                                            <span
                                                v-if="item.current"
                                                class="term-tag current"
                                            >当前申请</span>
                                            <span
                                                v-if="item.statusText"
                                                class="term-tag"
                                                :class="item.statusTone"
                                            >{{ item.statusText }}</span>
                                        </div>
                                        <time>{{ item.time }}</time>
                                    </div>
                                    <div v-if="item.lines.length" class="term-history-lines">
                                        <div v-for="line in item.lines" :key="line">{{ line }}</div>
                                    </div>
                                </div>
                            </article>

                            <div v-if="error" class="term-history-inline-error">
                                <span>{{ error }}</span>
                                <button type="button" @click="loadMore">重试</button>
                            </div>

                            <div v-if="hasMore" class="term-history-more">
                                <button type="button" :disabled="loading" @click="loadMore">
                                    <Icon
                                        :name="loading ? 'line-md:loading-twotone-loop' : 'mdi:chevron-down'"
                                    />
                                    {{ loading ? "加载中..." : "加载更多" }}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { retrieveCustomerTermLog } from "~/composables/api/useCustomerApi";
import {
    toTermView,
    type CustomerTermRecord,
} from "~/utils/customerTerm";

const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        customerId?: string;
        customerName?: string;
        currentAppId?: string;
    }>(),
    {
        customerId: "",
        customerName: "",
        currentAppId: "",
    }
);

const emit = defineEmits<{
    "update:modelValue": [value: boolean];
}>();

const PAGE_SIZE = 10;
const records = ref<CustomerTermRecord[]>([]);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(false);
const error = ref("");
let requestId = 0;

const views = computed(() =>
    records.value.map((record) => toTermView(record, props.currentAppId))
);
const initialLoading = computed(() => loading.value && records.value.length === 0);

const close = () => {
    requestId += 1;
    loading.value = false;
    emit("update:modelValue", false);
};

const fetchPage = async (reset = false) => {
    if (loading.value || !props.customerId) return;
    if (reset) {
        records.value = [];
        page.value = 1;
        hasMore.value = false;
    }

    const currentRequest = ++requestId;
    loading.value = true;
    error.value = "";
    try {
        const response = await retrieveCustomerTermLog()({
            customerId: props.customerId,
            page: page.value,
            limit: PAGE_SIZE,
        });
        if (currentRequest !== requestId) return;

        const data = response?.data;
        const nextRecords = Array.isArray(data?.records) ? data.records : [];
        records.value = reset
            ? nextRecords
            : [...records.value, ...nextRecords];
        hasMore.value = Boolean(data?.pagination?.hasMore);
        page.value += 1;
    } catch (err) {
        if (currentRequest !== requestId) return;
        console.error("获取维护记录失败:", err);
        error.value = "维护记录加载失败";
    } finally {
        if (currentRequest === requestId) loading.value = false;
    }
};

const reload = () => fetchPage(true);
const loadMore = () => fetchPage(false);

watch(
    () => [props.modelValue, props.customerId] as const,
    ([visible, customerId]) => {
        requestId += 1;
        loading.value = false;
        if (!visible) return;
        if (!customerId) {
            records.value = [];
            error.value = "客户信息不存在";
            return;
        }
        void fetchPage(true);
    }
);
</script>

<style lang="less" scoped>
.term-history-overlay {
    position: fixed;
    inset: 0;
    z-index: 12000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(15, 23, 42, 0.46);
    backdrop-filter: blur(3px);
}

.term-history-dialog {
    width: min(720px, 100%);
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    box-shadow: 0 20px 50px rgba(15, 23, 42, 0.2);
}

.term-history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;

    h3 {
        margin: 0;
        color: #1f2937;
        font-size: 18px;
        font-weight: 600;
    }

    p {
        margin: 5px 0 0;
        color: #6b7280;
        font-size: 13px;
    }
}

.term-history-close {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 34px;
    padding: 0;
    border: none;
    border-radius: 50%;
    color: #6b7280;
    background: transparent;
    cursor: pointer;

    &:hover {
        color: #1f2937;
        background: #f3f4f6;
    }
}

.term-history-body {
    min-height: 180px;
    overflow-y: auto;
    padding: 8px 24px 20px;
}

.term-history-state {
    min-height: 180px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #6b7280;
    font-size: 14px;

    &.error {
        color: #b91c1c;
    }
}

.state-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    padding: 7px 12px;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    color: #374151;
    background: #fff;
    cursor: pointer;
}

.term-history-list {
    position: relative;
    padding-left: 20px;
}

.term-history-item {
    position: relative;
    display: flex;
    gap: 14px;
    padding: 18px 0;
    border-bottom: 1px solid #eef0f3;

    &::before {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: -13px;
        width: 1px;
        background: #dbe1e8;
    }

    &:first-child::before {
        top: 24px;
    }

    &:last-child::before {
        bottom: calc(100% - 25px);
    }
}

.term-history-marker {
    position: absolute;
    top: 23px;
    left: -17px;
    z-index: 1;
    width: 9px;
    height: 9px;
    border: 2px solid #fff;
    border-radius: 50%;
    background: #64748b;
    box-shadow: 0 0 0 1px #94a3b8;

    &.warning {
        background: #f59e0b;
        box-shadow: 0 0 0 1px #f59e0b;
    }

    &.success {
        background: #16a34a;
        box-shadow: 0 0 0 1px #16a34a;
    }

    &.danger {
        background: #dc2626;
        box-shadow: 0 0 0 1px #dc2626;
    }
}

.term-history-content {
    min-width: 0;
    flex: 1;
}

.term-history-item-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;

    time {
        flex: 0 0 auto;
        color: #9ca3af;
        font-size: 12px;
    }
}

.term-history-title-row {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;

    strong {
        color: #1f2937;
        font-size: 15px;
        font-weight: 600;
    }
}

.term-tag {
    padding: 2px 6px;
    border-radius: 4px;
    color: #475569;
    background: #f1f5f9;
    font-size: 11px;
    line-height: 1.4;

    &.current {
        color: #1d4ed8;
        background: #dbeafe;
    }

    &.warning {
        color: #92400e;
        background: #fef3c7;
    }

    &.success {
        color: #166534;
        background: #dcfce7;
    }

    &.danger {
        color: #991b1b;
        background: #fee2e2;
    }
}

.term-history-lines {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-top: 9px;
    color: #64748b;
    font-size: 13px;
    line-height: 1.5;
}

.term-history-inline-error,
.term-history-more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding-top: 16px;
    color: #b91c1c;
    font-size: 13px;

    button {
        border: none;
        color: #2563eb;
        background: transparent;
        cursor: pointer;
    }
}

.term-history-more button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border: 1px solid #dbe1e8;
    border-radius: 6px;
    color: #475569;
    background: #fff;

    &:hover:not(:disabled) {
        border-color: #93c5fd;
        color: #2563eb;
    }

    &:disabled {
        cursor: wait;
        opacity: 0.7;
    }
}

.term-history-fade-enter-active,
.term-history-fade-leave-active {
    transition: opacity 0.18s ease;
}

.term-history-fade-enter-from,
.term-history-fade-leave-to {
    opacity: 0;
}

@media (max-width: 640px) {
    .term-history-overlay {
        padding: 12PX;
    }

    .term-history-dialog {
        width: calc(100vw - 24PX);
        max-height: calc(100vh - 24PX);
        border-radius: 12PX;
    }

    .term-history-header {
        gap: 12PX;
        padding: 16PX 18PX;

        h3 {
            font-size: 18PX;
        }

        p {
            margin-top: 5PX;
            font-size: 13PX;
        }
    }

    .term-history-close {
        width: 34PX;
        height: 34PX;
        flex-basis: 34PX;
    }

    .term-history-body {
        min-height: 180PX;
        padding: 8PX 18PX 20PX;
    }

    .term-history-state {
        min-height: 180PX;
        gap: 10PX;
        font-size: 14PX;
    }

    .state-action {
        gap: 6PX;
        margin-top: 4PX;
        padding: 7PX 12PX;
        border-radius: 6PX;
    }

    .term-history-list {
        padding-left: 20PX;
    }

    .term-history-item {
        gap: 14PX;
        padding: 18PX 0;

        &::before {
            left: -13PX;
            width: 1PX;
        }

        &:first-child::before {
            top: 24PX;
        }

        &:last-child::before {
            bottom: calc(100% - 25PX);
        }
    }

    .term-history-marker {
        top: 23PX;
        left: -17PX;
        width: 9PX;
        height: 9PX;
        border-width: 2PX;
    }

    .term-history-item-header {
        flex-direction: column;
        gap: 6PX;

        time {
            font-size: 12PX;
        }
    }

    .term-history-title-row {
        gap: 7PX;

        strong {
            font-size: 15PX;
        }
    }

    .term-tag {
        padding: 2PX 6PX;
        border-radius: 4PX;
        font-size: 11PX;
    }

    .term-history-lines {
        gap: 5PX;
        margin-top: 9PX;
        font-size: 13PX;
    }

    .term-history-inline-error,
    .term-history-more {
        gap: 8PX;
        padding-top: 16PX;
        font-size: 13PX;
    }

    .term-history-more button {
        gap: 6PX;
        padding: 7PX 14PX;
        border-radius: 6PX;
    }
}
</style>
