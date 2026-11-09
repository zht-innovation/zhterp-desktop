<template>
    <div 
        class="file-uploader"
        :class="{ 'is-dragover': isDragover, 'is-button': variant === 'button' }"
        @click.stop
        @dragover.prevent="handleDragover"
        @dragleave.prevent="handleDragleave"
        @drop.prevent="handleDrop"
    >
        <div v-if="!readonly" class="upload-area" @click.prevent.stop="triggerFileInput">
            <div class="upload-content">
                <Icon :name="variant === 'button' ? 'lucide:plus' : 'material-symbols:upload'" class="upload-icon" />
                <p>{{ variant === "button" ? buttonText : "请将文件拖拽到这里或点击选择" }}</p>
            </div>
        </div>
        <input 
            v-if="!readonly"
            ref="fileInputRef"
            type="file"
            :multiple="multiple"
            :accept="accept"
            class="file-input-hidden"
            @click.stop="openDesktopFileInput($event, maxSize * 1024 * 1024, addFiles)"
            @change="handleFileSelect"
        />
        <div class="file-list" v-if="files.length > 0">
            <div class="file-item" v-for="(file, index) in files" :key="index">
                <Icon name="heroicons:document" class="file-icon" />
                <span class="file-name">{{ getDisplayFileName(file) }}</span>
                <span class="file-size">{{ formatFileSize(getDisplayFileSize(file)) }}</span>
                <button
                    v-if="isImageAttachment(file)"
                    class="preview-btn"
                    type="button"
                    title="查看"
                    @click.stop="previewFile(file)"
                >
                    <Icon name="mdi:eye" />
                </button>
                <button
                    v-else-if="!isDesktop()"
                    class="preview-btn"
                    type="button"
                    title="查看"
                    @click.stop="openFile(file)"
                >
                    <Icon name="material-symbols:visibility-outline-rounded" />
                </button>
                <button
                    class="download-btn"
                    type="button"
                    title="下载"
                    @click.stop="downloadFile(file)"
                >
                    <Icon name="material-symbols:download-rounded" />
                </button>
                <button class="remove-btn" @click.stop="removeFile(index)" v-if="!readonly">
                    <Icon name="heroicons:x-mark" />
                </button>
            </div>
        </div>
        <div v-else-if="readonly" class="readonly-empty">暂无附件</div>

        <AttachmentImagePreview
            v-model="showPreview"
            :title="previewFileName"
            :src="previewImageUrl"
            @closed="clearPreviewUrl"
        />
    </div>
</template>

<script setup lang="ts">
import AttachmentImagePreview from '~/components/configuration/sales/AttachmentImagePreview.vue'
import { isDesktop } from '~/utils/desktop'
import { downloadBlob, openDesktopFileInput } from '~/utils/fileActions'
import {
    getAttachmentFileName,
    getAttachmentPath,
    downloadAttachmentFile,
    isImageAttachment,
    toAbsoluteAttachmentUrl,
} from '~/utils/attachmentPreview'

type UploadedAttachment = {
    path?: string
    url?: string
    href?: string
    originalName?: string
    name?: string
    filename?: string
    size?: number
    type?: string
}
type UploaderAttachment = File | UploadedAttachment | string

const props = withDefaults(defineProps<{
    modelValue?: UploaderAttachment[]
    multiple?: boolean
    accept?: string
    maxSize?: number // MB
    maxFiles?: number
    variant?: "dropzone" | "button"
    buttonText?: string
    readonly?: boolean
}>(), {
    modelValue: () => [],
    multiple: true,
    accept: '*',
    maxSize: 10,
    variant: "dropzone",
    buttonText: "添加文件",
    readonly: false
})

const emit = defineEmits<{
    'update:modelValue': [files: UploaderAttachment[]]
}>()

const fileInputRef = ref<HTMLInputElement>()
const isDragover = ref(false)
const showPreview = ref(false)
const previewImageUrl = ref('')
const previewFileName = ref('')

const files = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
})

const triggerFileInput = () => {
    if (props.readonly) return
    fileInputRef.value?.click()
}

const handleDragover = () => {
    if (props.readonly) return
    isDragover.value = true
}

const handleDragleave = () => {
    isDragover.value = false
}

const handleDrop = (e: DragEvent) => {
    if (props.readonly) return
    isDragover.value = false
    const droppedFiles = Array.from(e.dataTransfer?.files || [])
    addFiles(droppedFiles)
}

const handleFileSelect = (e: Event) => {
    const target = e.target as HTMLInputElement
    const selectedFiles = Array.from(target.files || [])
    addFiles(selectedFiles)
    target.value = '' // 重置input
}

const addFiles = (newFiles: File[]) => {
    let validFiles = newFiles.filter(file => {
        if (props.accept === "image/*" && !file.type.startsWith("image/")) {
            ElMessage({
                type: "warning",
                message: `文件 ${file.name} 不是有效图片`,
                customClass: "file-uploader-message",
            })
            return false
        }
        if (file.size > props.maxSize * 1024 * 1024) {
            ElMessage({
                type: 'warning',
                message: `文件 ${file.name} 超过 ${props.maxSize}MB 限制`,
                customClass: 'file-uploader-message',
            })
            return false
        }
        return true
    })

    if (props.multiple) {
        if (props.maxFiles !== undefined) {
            const available = Math.max(0, props.maxFiles - files.value.length)
            if (validFiles.length > available) {
                ElMessage({
                    type: "warning",
                    message: `最多上传 ${props.maxFiles} 个文件`,
                    customClass: "file-uploader-message",
                })
                validFiles = validFiles.slice(0, available)
            }
        }
        files.value = [...files.value, ...validFiles]
    } else {
        files.value = validFiles.slice(0, 1)
    }
}

const removeFile = (index: number) => {
    const newFiles = [...files.value]
    newFiles.splice(index, 1)
    files.value = newFiles
}

const clearPreviewUrl = () => {
    if (previewImageUrl.value) {
        URL.revokeObjectURL(previewImageUrl.value)
        previewImageUrl.value = ''
    }
}

const previewFile = (file: UploaderAttachment) => {
    if (!isImageAttachment(file)) return
    clearPreviewUrl()

    if (file instanceof File) {
        previewImageUrl.value = URL.createObjectURL(file)
    } else {
        previewImageUrl.value = toAbsoluteAttachmentUrl(getAttachmentPath(file), window.location.origin)
    }
    previewFileName.value = getAttachmentFileName(file)
    showPreview.value = true
}

const openFile = (file: UploaderAttachment) => {
    if (isImageAttachment(file)) {
        previewFile(file)
        return
    }

    let url = ''
    if (file instanceof File) {
        url = URL.createObjectURL(file)
        window.open(url, '_blank', 'noopener')
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
        return
    }

    url = toAbsoluteAttachmentUrl(getAttachmentPath(file), window.location.origin)
    if (!url) {
        ElMessage.warning('附件地址不存在')
        return
    }
    window.open(url, '_blank', 'noopener')
}

const downloadFile = async (file: UploaderAttachment) => {
    if (file instanceof File) {
        try {
            await downloadBlob(file, file.name)
        } catch {
            ElMessage.error('附件下载失败')
        }
        return
    }

    const path = getAttachmentPath(file)
    if (!path) {
        ElMessage.warning('附件地址不存在')
        return
    }

    try {
        await downloadAttachmentFile(path, getDisplayFileName(file))
    } catch (err) {
        ElMessage.error('附件下载失败')
    }
}

onBeforeUnmount(clearPreviewUrl)

const getDisplayFileName = (file: UploaderAttachment) => {
    if (file instanceof File) return file.name
    return getAttachmentFileName(file) || '附件'
}

const getDisplayFileSize = (file: UploaderAttachment) => {
    if (file instanceof File) return file.size
    return typeof file === 'object' ? Number(file.size || 0) : 0
}

const formatFileSize = (bytes?: number) => {
    const size = Number(bytes || 0)
    if (size < 1024) return size + ' B'
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB'
    return (size / (1024 * 1024)).toFixed(1) + ' MB'
}
</script>

<style lang="less" scoped>
:global(.file-uploader-message) {
    z-index: 5000 !important;
}

.file-uploader {
    width: 100%;
}

.upload-area {
    border: 2px dashed #D1D5DB;
    border-radius: 12px;
    padding: 34px 24px;
    text-align: center;
    cursor: pointer;
    transition: all 0.2s;
    background: #fff;

    &:hover {
        border-color: #4E8AF4;
        background: #FAFCFF;
    }
}

.file-uploader.is-dragover .upload-area {
    border-color: #4E8AF4;
    background: #EFF6FF;
}

.file-uploader.is-button .upload-area {
    width: fit-content;
    min-width: 112px;
    padding: 0 14px;
    border: 1px solid var(--erp-color-border-default, #d1d5db);
    border-radius: var(--erp-radius-control-default, 6px);
    background: var(--erp-color-fill-default, #fff);
}

.file-uploader.is-button .upload-content {
    height: var(--erp-size-control-height-sm, 36px);
    flex-direction: row;
    gap: 6px;
}

.file-uploader.is-button .upload-content .upload-icon {
    margin: 0;
    color: var(--erp-color-text-primary, #202122);
    font-size: 18px;
}

.file-uploader.is-button .upload-content p {
    color: var(--erp-color-text-primary, #202122);
    font-size: 14px;
}

.upload-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;

    .upload-icon {
        margin-bottom: 10px;
        color: #3BA8F5;
        font-size: 28px;
    }

    p {
        margin: 0;
        font-size: 13px;
        color: #A0A7B3;
    }
}

.file-input-hidden {
    display: none;
}

.file-list {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.file-uploader .file-list:first-child {
    margin-top: 0;
}

.readonly-empty {
    min-height: 34px;
    display: flex;
    align-items: center;
    color: #9CA3AF;
    font-size: 13px;
}

.file-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #F3F4F6;
    border-radius: 8px;

    .file-icon {
        color: #6B7280;
        font-size: 18px;
        flex-shrink: 0;
    }

    .file-name {
        flex: 1;
        font-size: 13px;
        color: #374151;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .file-size {
        font-size: 12px;
        color: #9CA3AF;
        flex-shrink: 0;
    }

    .remove-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: #9CA3AF;
        padding: 2px;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
            color: #EF4444;
        }
    }

    .preview-btn,
    .download-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: #4E8AF4;
        padding: 2px;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
            color: #2563EB;
        }
    }
}
</style>
