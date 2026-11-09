<template>
    <el-dialog
        v-model="visible"
        :title="title"
        width="80%"
        class="attachment-image-preview-dialog"
        destroy-on-close
        append-to-body
        :z-index="zIndex"
        @closed="emit('closed')"
    >
        <div class="attachment-image-preview-frame">
            <img v-if="src" :src="src" :alt="title" />
        </div>
        <template v-if="$slots.footer" #footer>
            <slot name="footer" />
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
    modelValue: boolean
    title: string
    src: string
    zIndex?: number
}>(), {
    zIndex: 5200,
})

const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    closed: []
}>()

const visible = computed({
    get: () => props.modelValue,
    set: (value) => emit('update:modelValue', value)
})
</script>

<style lang="less" scoped>
:deep(.attachment-image-preview-dialog) {
    max-width: calc(100vw - 32px);
}

:deep(.attachment-image-preview-dialog .el-dialog__body) {
    padding: 0 16px;
}

.attachment-image-preview-frame {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-height: 70vh;
    overflow: auto;

    img {
        display: block;
        width: auto;
        height: auto;
        max-width: 100%;
        max-height: 70vh;
        object-fit: contain;
    }
}
</style>
