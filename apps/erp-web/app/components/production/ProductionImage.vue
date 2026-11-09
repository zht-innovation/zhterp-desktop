<template>
    <button v-if="src && !imageFailed" class="production-execution-image" type="button" :aria-label="`预览${name}图片`" @click="showPreview = true">
        <img :src="resolveErpImageUrl(src)" :alt="name" loading="lazy" @error="imageFailed = true" />
        <Icon name="lucide:zoom-in" />
    </button>
    <span v-else class="production-execution-image production-execution-image-placeholder" role="img" :aria-label="`${name}暂无图片`"><Icon name="lucide:image" /><small>暂无图片</small></span>
    <ImagePreviewDialog v-if="showPreview && src && !imageFailed" v-model="showPreview" class="production-execution-image-preview" :title="name" :images="[{ url: src, alt: name }]" :z-index="2600" />
</template>

<script setup lang="ts">
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";

const props = defineProps<{ src?: string; name: string }>();
const showPreview = ref(false);
const imageFailed = ref(false);
watch(() => props.src, () => { imageFailed.value = false; showPreview.value = false; });
</script>
