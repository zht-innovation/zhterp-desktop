<template>
    <div class="content-editor" @dragover.prevent @drop.prevent="dropFiles">
        <textarea ref="textarea" :value="modelValue" rows="7" required maxlength="20000" :disabled="disabled" aria-label="意见内容" placeholder="请详细描述现状、遇到的问题、使用场景和期望的结果…（必填）" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" @paste="paste" />
        <input ref="fileInput" type="file" accept=".png,.jpg,.jpeg,.webp,.gif" multiple hidden :disabled="disabled"
            @click="openDesktopFileInput($event, 5 * 1024 * 1024, add)" @change="selectFiles">
        <div v-if="error" role="alert" class="feedback-error">{{ error }}</div>
        <div v-if="images.length" class="images">
            <div v-for="item in images" :key="item.attachmentId" class="image-item">
                <button type="button" class="preview" aria-label="放大图片" @click="preview = item.preview || item.path"><img :src="item.preview || item.path" alt="意见图片"></button>
                <span v-if="item.status === 'uploading'">上传中…</span>
                <button v-if="item.status === 'failed'" type="button" :disabled="disabled" @click="upload(item)">上传失败，点击重试</button>
                <button type="button" class="remove-image" :disabled="disabled" :aria-label="`移除图片 ${images.indexOf(item) + 1}`" @click="remove(item)">×</button>
            </div>
        </div>
        <div class="editor-toolbar"><button type="button" :disabled="disabled || images.length >= 5" @click="fileInput?.click()">＋ 插入图片</button><span>支持粘贴、拖入，最多 5 张，每张 5 MB</span></div>
        <el-image-viewer v-if="preview" :url-list="[preview]" :z-index="2300" hide-on-click-modal @close="preview = ''" />
    </div>
</template>
<script setup lang="ts">
import { uploadImage } from "~/composables/api/useIndicesApi";
import { openDesktopFileInput } from "~/utils/fileActions";
import type { FeedbackAttachment } from "~~/shared/types/feedback";
type ImageItem = FeedbackAttachment & { preview?: string; file?: File; status: "ready" | "uploading" | "failed" };
const props = defineProps<{ modelValue: string; attachments: FeedbackAttachment[]; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string]; "update:attachments": [value: FeedbackAttachment[]]; blocked: [value: boolean] }>();
const textarea = ref<HTMLTextAreaElement>();
const fileInput = ref<HTMLInputElement>();
const images = ref<ImageItem[]>(props.attachments.map((a) => ({ ...a, status: "ready" })));
const error = ref("");
const preview = ref("");
let active = true;
const sync = () => {
    emit("update:attachments", images.value.filter((a) => a.status === "ready").map((a) => ({ attachmentId: a.attachmentId, path: a.path })));
    emit("blocked", images.value.length > 5 || images.value.some((a) => a.status !== "ready"));
};
const upload = async (item: ImageItem) => {
    if (!item.file || props.disabled) return;
    item.status = "uploading";
    sync();
    try {
        const form = new FormData();
        form.append("image", item.file);
        const result = await uploadImage(form) as { data?: { path?: string } };
        if (!result?.data?.path || typeof result.data.path !== "string") throw new Error("上传服务未返回图片路径");
        if (!active || !images.value.includes(item)) return;
        item.path = result.data.path;
        item.status = "ready";
    } catch {
        if (active && images.value.includes(item)) item.status = "failed";
    } finally {
        if (active) sync();
    }
};
const add = (files: File[]) => {
    if (props.disabled) return;
    error.value = "";
    for (const file of files) {
        if (images.value.length >= 5) {
            error.value = "最多五张图片，请先移除多余图片。";
            break;
        }
        if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 5 * 1024 * 1024) {
            error.value = "仅支持 PNG、JPEG、WebP、GIF，每张不超过 5 MB。";
            continue;
        }
        const item = reactive<ImageItem>({
            attachmentId: crypto.randomUUID(), path: "", preview: URL.createObjectURL(file), file, status: "uploading",
        });
        images.value.push(item);
        void upload(item);
    }
};
const remove = (item: ImageItem) => {
    if (item.preview) URL.revokeObjectURL(item.preview);
    images.value = images.value.filter(image => image !== item);
    error.value = "";
    sync();
};
const selectFiles = (event: Event) => { const input = event.target as HTMLInputElement; add(Array.from(input.files || [])); input.value = ""; };
const dropFiles = (event: DragEvent) => add(Array.from(event.dataTransfer?.files || []));
const paste = (event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData?.files || []);
    if (!files.length) {
        for (const item of Array.from(event.clipboardData?.items || [])) {
            const file = item.getAsFile();
            if (file) files.push(file);
        }
    }
    if (!files.length) return;
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") || "";
    if (text && textarea.value) {
        const input = textarea.value, start = input.selectionStart, end = input.selectionEnd;
        const value = `${props.modelValue.slice(0, start)}${text}${props.modelValue.slice(end)}`.slice(0, 20000);
        emit("update:modelValue", value);
        nextTick(() => input.setSelectionRange(start + text.length, start + text.length));
    }
    add(files);
};
onMounted(sync);
onBeforeUnmount(() => { active = false; images.value.forEach((a) => { if (a.preview) URL.revokeObjectURL(a.preview); }); });
</script>
<style scoped>
.content-editor { overflow: hidden; border: 1PX solid #dfe5e1; border-radius: 9PX; background: #fff; transition: border-color .2s, box-shadow .2s; }
.content-editor:focus-within { border-color: #668bb4; box-shadow: 0 0 0 2PX rgb(102 139 180 / 10%); }
textarea { display: block; width: 100%; min-height: 190PX; resize: vertical; border: 0 !important; border-radius: 0 !important; padding: 11PX !important; background: #fff; color: inherit; font-weight: 400; line-height: 1.65; }
textarea::placeholder { color: #8a949f; }
.editor-toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12PX; padding: 8PX 10PX; border-top: 1PX solid #e5ebf0; background: #f8fafc; }
.editor-toolbar span { color: #8794a2; font-size: var(--erp-typography-note-font-size); }
.editor-toolbar button { padding: 3PX; border: 0; background: transparent; color: #365f8d; font-size: var(--erp-typography-content2-font-size); font-weight: 600; }
.images { display: flex; flex-wrap: wrap; gap: 10PX; padding: 0 11PX 8PX; }
.image-item { position: relative; width: 124PX; border: 1PX solid #d5e0ea; border-radius: 8PX; overflow: hidden; background: #f4f7fa; font-size: var(--erp-typography-note-font-size); }
.image-item .preview { display: block; width: 100%; padding: 0; border: 0; border-radius: 0; background: transparent; cursor: zoom-in; }
img { display: block; width: 100%; height: 92PX; object-fit: cover; }
.image-item .remove-image { position: absolute; top: 5PX; right: 5PX; width: 22PX; height: 22PX; border: 0; border-radius: 50%; padding: 0; background: rgb(23 35 49 / 78%); color: #fff; line-height: 22PX; }
.feedback-error { padding: 8PX 11PX; color: var(--el-color-danger); font-weight: 400; }
@media (max-width: 700px) { .editor-toolbar { align-items: flex-start; flex-direction: column; gap: 2PX; } }
</style>
