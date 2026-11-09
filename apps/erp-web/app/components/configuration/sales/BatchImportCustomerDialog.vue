<template>
    <div v-if="visible" class="modal-overlay" @click.self="handleClose">
        <div class="modal-content">
            <div class="modal-header">
                <h3>批量导入客户</h3>
                <button class="close-btn" @click="handleClose">
                    <Icon name="heroicons:x-mark" />
                </button>
            </div>

            <div class="section-divider">
                <span>上传 Excel</span>
            </div>

            <div class="form-group">
                <FileUploader
                    v-model="files"
                    :multiple="false"
                    :accept="acceptTypes"
                    :max-size="10"
                    :readonly="loading"
                />
                <div class="form-hint">支持 .xlsx / .xls / .csv，单个文件不超过 10MB</div>
                <button class="link-btn" @click="downloadTemplate">下载模板（CSV）</button>
            </div>

            <div class="section-divider">
                <span>字段说明</span>
            </div>

            <div class="hint-grid">
                <div class="hint-item">
                    <strong>必填字段：</strong>姓名
                </div>
                <div class="hint-item">
                    <strong>可选字段：</strong>城市、电话、WhatsApp、微信、邮箱、公司名称、公司详情、公司网站
                </div>
                <div class="hint-item">
                    <strong>提示：</strong>Excel 可直接打开 CSV 模板
                </div>
                <div class="hint-item warning">
                    <strong>注意事项：</strong>国家，客户类型、客户等级、获客渠道信息需要上传后手动通过“编辑客户“按钮设置!（请务必要手动设置，不然客户的全局统计信息会有误）
                </div>
            </div>

            <div class="modal-actions">
                <button @click="handleClose" :disabled="loading">取消</button>
                <button class="primary" @click="submit" :disabled="!files.length || loading">
                    {{ loading ? '导入中...' : '开始导入' }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import FileUploader from '~/components/configuration/sales/FileUploader.vue'

const props = withDefaults(defineProps<{
    modelValue: boolean
    loading?: boolean
}>(), {
    loading: false,
})

const emit = defineEmits<{
    'update:modelValue': [value: boolean]
    submit: [file: File]
}>()

const visible = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val),
})

const files = ref<File[]>([])
const acceptTypes = '.xlsx,.xls,.csv'

const reset = () => {
    files.value = []
}

const handleClose = () => {
    visible.value = false
    reset()
}

const submit = () => {
    if (!files.value.length || props.loading) return
    emit('submit', files.value[0])
}

const downloadTemplate = () => {
    const headers = [
        '姓名',
        '城市',
        '电话',
        'WhatsApp',
        '微信',
        '邮箱',
        '公司名称',
        '公司详情',
        '公司网站',
    ]

    const example = [
        '张三',
        '深圳',
        '13800138000',
        'whatsapp123',
        'wechat123',
        'demo@example.com',
        '示例公司',
        '无人机配件',
        'https://example.com',
    ]

    const csvContent = [headers.join(','), example.join(',')].join('\n')
    const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '客户导入模板.csv'
    link.click()
    URL.revokeObjectURL(url)
}

watch(
    () => visible.value,
    (isOpen) => {
        if (!isOpen) reset()
    }
)
</script>

<style lang="less" scoped>
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-content {
    background: #fff;
    padding: 24px;
    border-radius: 16px;
    width: 560px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    max-height: 90vh;
    overflow-y: auto;
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    h3 {
        margin: 0;
        font-size: 18px;
        color: #111827;
    }

    .close-btn {
        background: none;
        border: none;
        cursor: pointer;
        color: #9CA3AF;
        font-size: 20px;
        padding: 4px;

        &:hover {
            color: #374151;
        }
    }
}

.section-divider {
    margin: 16px 0 12px;
    border-bottom: 1px solid #E5E7EB;
    position: relative;

    span {
        position: relative;
        top: 10px;
        background: #fff;
        padding-right: 10px;
        font-size: 14px;
        color: #6B7280;
    }
}

.form-group {
    margin-bottom: 12px;
}

.form-hint {
    margin-top: 8px;
    font-size: 12px;
    color: #9CA3AF;
}

.link-btn {
    margin-top: 10px;
    padding: 0;
    border: none;
    background: none;
    color: #4E8AF4;
    font-size: 13px;
    cursor: pointer;

    &:hover {
        text-decoration: underline;
    }
}

.hint-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
    color: #4B5563;
}

.hint-item strong {
    color: #374151;
}

.hint-item.warning {
    background: #FEF3C7;
    padding: 8px 12px;
    border-radius: 8px;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 20px;

    button {
        padding: 8px 16px;
        border-radius: 8px;
        border: none;
        cursor: pointer;
        font-size: 14px;
        background: #F3F4F6;
        color: #374151;

        &:disabled {
            cursor: not-allowed;
            opacity: 0.6;
        }
    }

    .primary {
        background: #4E8AF4;
        color: #fff;
    }
}
</style>
