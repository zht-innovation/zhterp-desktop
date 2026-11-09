<template>
    <div class="product-image-cell">
        <button
            v-if="images.length"
            class="product-image-button"
            type="button"
            :aria-label="`查看产品图片，共 ${images.length} 张`"
            @click.stop="showImagePreview = true"
        >
            <img :src="images[0].url" :alt="images[0].alt" loading="lazy" />
            <span v-if="images.length > 1" class="image-count">+{{ images.length - 1 }}</span>
        </button>
        <span v-else>--</span>

        <ImagePreviewDialog
            v-if="showImagePreview"
            v-model="showImagePreview"
            title="产品图片"
            :images="images"
        />
    </div>
</template>

<script setup lang="ts">
import ImagePreviewDialog, { type PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";

interface ProductImageItem {
    image?: string;
    model?: string;
    productCode?: string;
}

const props = defineProps<{
    items: ProductImageItem[];
}>();

const showImagePreview = ref(false);
const images = computed<PreviewImage[]>(() => {
    const result: PreviewImage[] = [];
    for (const item of props.items || []) {
        if (item.image) {
            result.push({
                url: item.image,
                alt: item.model || item.productCode || "产品图片",
            });
        }
    }
    return result;
});
</script>

<style scoped>
.product-image-cell {
    display: flex;
    align-items: center;
    min-width: 0;
}

.product-image-button {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-8);
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: zoom-in;
}

.product-image-button img {
    display: block;
    width: 48px;
    height: 48px;
    object-fit: contain;
    border-radius: var(--erp-radius-control-default);
}

.image-count {
    color: var(--erp-color-text-secondary);
}
</style>
