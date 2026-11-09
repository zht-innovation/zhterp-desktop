<template>
    <el-popover
        :disabled="!isOverflowing"
        trigger="hover"
        placement="top"
        :width="320"
        popper-class="erp-app overflow-text-popover"
    >
        <div class="overflow-text-popover-content">{{ text }}</div>

        <template #reference>
            <span ref="textRef" class="overflow-tooltip-text">{{ text }}</span>
        </template>
    </el-popover>
</template>

<script setup lang="ts">
const props = defineProps<{
    text: string;
}>();

const textRef = ref<HTMLElement | null>(null);
const isOverflowing = ref(false);
let resizeObserver: ResizeObserver | undefined;

const updateOverflow = () => {
    const element = textRef.value;
    if (!element) {
        isOverflowing.value = false;
        return;
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    const textWidth = range.getBoundingClientRect().width;
    range.detach();

    isOverflowing.value = textWidth > element.clientWidth + 1;
};

onMounted(() => {
    nextTick(updateOverflow);

    if (typeof ResizeObserver !== "undefined" && textRef.value) {
        resizeObserver = new ResizeObserver(updateOverflow);
        resizeObserver.observe(textRef.value);
    }
});

watch(() => props.text, () => nextTick(updateOverflow));

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
});
</script>

<style scoped>
.overflow-tooltip-text {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    display: block;
    overflow: hidden;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
}

:global(.overflow-text-popover .overflow-text-popover-content) {
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: 1.5;
    overflow-wrap: anywhere;
    white-space: normal;
}

:global(.overflow-text-popover) {
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    opacity: 1;
}
</style>
