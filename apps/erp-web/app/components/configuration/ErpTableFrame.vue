<template>
    <section
        class="erp-table-frame"
        :class="{
            'erp-table-frame--scroll-x': scrollX,
            'erp-table-frame--has-overflow-x': hasHorizontalOverflow,
            'erp-table-frame--embedded': embedded,
        }"
        :style="{
            '--erp-table-columns': columns,
            '--erp-table-min-width': minimumWidth || 'max-content',
        }"
    >
        <div ref="scrollElement" class="erp-table-frame__scroll">
            <div class="erp-table-frame__head">
                <slot name="header" />
            </div>

            <div class="erp-table-frame__body">
                <slot />

                <div v-if="loading" class="empty-row">
                    <slot name="loading">{{ loadingText }}</slot>
                </div>

                <div v-else-if="empty" class="empty-row">
                    <slot name="empty">{{ emptyText }}</slot>
                </div>
            </div>
        </div>
    </section>
</template>

<script setup lang="ts">
const props = withDefaults(
    defineProps<{
        columns: string;
        minimumWidth?: string;
        loading?: boolean;
        empty?: boolean;
        loadingText?: string;
        emptyText?: string;
        scrollX?: boolean;
        embedded?: boolean;
    }>(),
    {
        loading: false,
        empty: false,
        loadingText: "正在加载数据...",
        emptyText: "暂无数据",
        scrollX: false,
        embedded: false,
    },
);

const scrollElement = ref<HTMLElement | null>(null);
const hasHorizontalOverflow = ref(false);
let resizeObserver: ResizeObserver | undefined;

const updateHorizontalOverflow = () => {
    const element = scrollElement.value;

    hasHorizontalOverflow.value = Boolean(
        props.scrollX
        && element
        && element.scrollWidth > element.clientWidth + 1,
    );
};

const scheduleOverflowCheck = () => {
    nextTick(() => {
        requestAnimationFrame(updateHorizontalOverflow);
    });
};

watch(
    () => [props.columns, props.minimumWidth, props.scrollX, props.loading, props.empty],
    scheduleOverflowCheck,
);

onMounted(() => {
    scheduleOverflowCheck();

    if (typeof ResizeObserver !== "undefined" && scrollElement.value) {
        resizeObserver = new ResizeObserver(scheduleOverflowCheck);
        resizeObserver.observe(scrollElement.value);
    }
});

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
});

</script>
