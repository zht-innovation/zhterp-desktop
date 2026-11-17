<template>
    <div v-if="modelValue.length" class="pasted-images">
        <p>以下截图将在确认表单时上传</p>
        <div v-for="(file, index) in modelValue" :key="index" class="pasted-image">
            <a :href="previews[index]" @click.prevent="preview = previews[index] || ''" aria-label="预览截图">
                <img :src="previews[index]" :alt="file.name">
            </a>
            <span>{{ file.name }}</span>
            <button type="button" :disabled="disabled" @click="remove(index)">移除</button>
        </div>
        <AttachmentImagePreview :model-value="Boolean(preview)" title="待上传截图" :src="preview"
            @update:model-value="value => { if (!value) preview = '' }" />
    </div>
</template>

<script setup lang="ts">
import AttachmentImagePreview from "~/components/configuration/sales/AttachmentImagePreview.vue";
const props = defineProps<{ modelValue: File[]; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [files: File[]] }>();
const previews = ref<string[]>([]);
const preview = ref("");
function cleanup() {
    for (const url of previews.value) URL.revokeObjectURL(url);
    previews.value = [];
    preview.value = "";
}
watch(() => props.modelValue, files => {
    cleanup();
    previews.value = files.map(file => URL.createObjectURL(file));
}, { immediate: true });
onBeforeUnmount(cleanup);
function remove(index: number) {
    if (!props.disabled) emit('update:modelValue', props.modelValue.filter((_, i) => i !== index));
}
</script>

<style scoped>
.pasted-images { margin-top: 8px; font-size: 12px; color: #667085; }
.pasted-image { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.pasted-image img { width: 56px; height: 44px; object-fit: contain; background: #f2f4f7; }
.pasted-image span { flex: 1; overflow-wrap: anywhere; }
.pasted-image button { color: #2563eb; cursor: pointer; }
</style>
