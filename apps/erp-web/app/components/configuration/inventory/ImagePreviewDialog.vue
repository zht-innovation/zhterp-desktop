<template>
    <el-dialog
        v-model="visible"
        :title="title"
        width="80%"
        class="image-preview-dialog"
        modal-class="erp-app erp-image-preview-overlay"
        destroy-on-close
        append-to-body
        align-center
        :z-index="zIndex"
        @closed="emit('closed')"
    >
        <div class="image-preview-frame">
            <button
                v-if="images.length > 1"
                class="nav-button prev"
                type="button"
                @click="prevImage"
            >
                <Icon name="lucide:chevron-left" />
            </button>
            <img v-if="currentImage" :src="currentImage.url" :alt="currentImage.alt || title" />
            <button
                v-if="images.length > 1"
                class="nav-button next"
                type="button"
                @click="nextImage"
            >
                <Icon name="lucide:chevron-right" />
            </button>
        </div>
        <div v-if="images.length > 1" class="image-counter">
            第 {{ currentIndex + 1 }} / {{ images.length }} 张
        </div>
    </el-dialog>
</template>

<script setup lang="ts">
export interface PreviewImage {
    url: string;
    alt?: string;
}

const props = defineProps<{
    modelValue: boolean;
    title: string;
    images: PreviewImage[];
    initialIndex?: number;
    zIndex?: number;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: boolean];
    closed: [];
}>();

const visible = computed({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const currentIndex = ref(props.initialIndex || 0);

const currentImage = computed(() => props.images[currentIndex.value]);

watch(() => props.modelValue, (isOpen) => {
    if (isOpen) {
        currentIndex.value = props.initialIndex || 0;
    }
});

const prevImage = () => {
    if (currentIndex.value > 0) {
        currentIndex.value--;
    } else {
        currentIndex.value = props.images.length - 1;
    }
};

const nextImage = () => {
    if (currentIndex.value < props.images.length - 1) {
        currentIndex.value++;
    } else {
        currentIndex.value = 0;
    }
};
</script>

<style lang="less" scoped>
:global(.image-preview-dialog) {
    min-width: 600px;
    max-width: 1240px;
    min-height: 300px;
    max-height: min(800px, calc(100vh - 48px));
    display: grid;
    grid-template-rows: 52px minmax(0, 1fr);
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-dialog);
    background: var(--erp-color-fill-default);
}

:global(.image-preview-dialog .el-dialog__header) {
    height: 52px;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    margin: 0;
    padding: var(--erp-spacing-12);
    border-bottom: 1px solid var(--erp-color-divider-subtle);
}

:global(.image-preview-dialog .el-dialog__title) {
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
}

:global(.image-preview-dialog .el-dialog__headerbtn) {
    top: 14px;
    right: 12px;
    width: 24px;
    height: 24px;
    border-radius: var(--erp-radius-control-default);
}

:global(.image-preview-dialog .el-dialog__headerbtn:hover) {
    background: var(--erp-color-fill-hover);
}

:global(.image-preview-dialog .el-dialog__close) {
    color: var(--erp-color-icon-default);
}

:global(.image-preview-dialog .el-dialog__body) {
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: var(--erp-spacing-12);
    box-sizing: border-box;
    padding: var(--erp-spacing-20);
    overflow: auto;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

:global(.el-overlay.erp-image-preview-overlay) {
    --el-overlay-color-lighter: var(--erp-color-bg-overlay);

    background-color: var(--erp-color-bg-overlay);
}

.image-preview-frame {
    position: relative;
    min-height: 0;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    overflow: auto;

    img {
        display: block;
        width: auto;
        height: auto;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    }
}

.nav-button {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    cursor: pointer;
    z-index: 10;
    transition: background 0.2s;

    &:hover {
        background: rgba(0, 0, 0, 0.7);
    }

    &.prev {
        left: 12px;
    }

    &.next {
        right: 12px;
    }
}

.image-counter {
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    text-align: center;
}
</style>
