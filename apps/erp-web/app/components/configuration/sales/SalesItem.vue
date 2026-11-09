<template>
    <div class="sales-item">
        <div class="avatar-col">
            <el-avatar class="avatar" ref="avatarDom" :src="resolveErpImageUrl(avatarUrl)"></el-avatar>
            <div class="name-cn" v-html="highlightText(salesperson.nameCn, 'nameCn', 'name')"></div>
            <div class="name-en" v-html="highlightText(salesperson.nameEn, 'nameEn', 'name')"></div>
        </div>

        <div class="info-grid">
            <div class="col join-col">
                <div class="value">{{ salesperson.joinDate }}</div>
                <div class="sub-text mt-1">{{ salesperson.joinDesc }}</div>
            </div>

            <div class="col region-col">
                <div class="field">
                    <div class="label">国家/地区</div>
                    <div class="value" v-html="highlightText(salesperson.country, 'country', 'region')"></div>
                </div>
                <div class="field mt-2">
                    <div class="label">城市</div>
                    <div class="value" v-html="highlightText(salesperson.city, 'city', 'region')"></div>
                </div>
            </div>

            <div class="col contact-col">
                <div class="field">
                    <div class="label">电话</div>
                    <div class="value" v-html="highlightText(salesperson.phone, 'phone')"></div>
                </div>
                <div class="field mt-2">
                    <div class="label">WhatsApp</div>
                    <div class="value" v-html="highlightText(salesperson.whatsapp, 'whatsapp')"></div>
                </div>
            </div>

            <div class="col email-col">
                <div class="value" v-html="highlightText(salesperson.email, 'email')"></div>
            </div>

            <div class="col skill-col">
                <div class="field">
                    <div class="label">语言</div>
                    <div class="value" v-html="highlightArrayText(salesperson.languages, 'languages')"></div>
                </div>
                <div class="field mt-2">
                    <div class="label">市场</div>
                    <div class="value" v-html="highlightArrayText(salesperson.markets, 'markets')"></div>
                </div>
            </div>

            <div class="col domain-col">
                <span 
                    v-for="(tag, i) in salesperson.domains" 
                    :key="i" 
                    class="tag" 
                    :class="tag.type"
                    v-html="highlightText(tag.label, 'domains')"
                ></span>
            </div>

            <div class="col count-col">
                <div class="value">{{ salesperson.customerCount }}</div>
            </div>

            <div class="col count-col">
                <div class="value">{{ salesperson.dealCount }}</div>
            </div>
        </div>

        <div class="actions-col">
            <button class="btn btn-log" @click="goToLogs">查看日志</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { highlightTextHtml } from "~/utils/highlightText";
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import { updateSalesperson } from '~/composables/api/useSalespersonApi'
import useDrop from '~/composables/useDrop'
import type { Ref } from 'vue'

type TagType = 'blue' | 'orange' | 'purple' | 'red' | 'green'

const router = useRouter()
const role = useState<any>('admin_info', () => ({})).value.role
const salespersonId = useState<string | null>('salesperson_id', () => null)

const emit = defineEmits<{
    (e: 'view-home', salesperson: any): void
    (e: 'updated', payload: { id: string; avatar: string }): void
}>()

const props = defineProps<{
    salesperson: any
    highlightKeyword?: string
    matchedFields?: string[]
}>()

const avatarDom = ref() as Ref<HTMLElement>
const avatarUrl = ref<string>(props.salesperson?.avatar || '')
watch(
    () => props.salesperson?.avatar,
    (v) => {
        avatarUrl.value = v || ''
    }
)
const canEditAvatar = computed(
    () => Number(role) === 3 && Boolean(salespersonId.value) && salespersonId.value === props.salesperson.id
)

const saveAvatar = async (path: string) => {
    try {
        const res: any = await updateSalesperson()({
            _id: props.salesperson.id,
            avatar: path,
        } as any)
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '更新头像失败')
            return
        }
        avatarUrl.value = path
        emit('updated', { id: props.salesperson.id, avatar: path })
        ElMessage.success('头像已更新')
    } catch (err) {
        console.error('更新销售头像失败:', err)
        ElMessage.error('更新头像失败')
    }
}

if (canEditAvatar.value) {
    useDrop(
        avatarDom,
        (path) => {
            void saveAvatar(path)
        },
        { accept: 'image/*' }
    )
}

// 跳转到日志页面
const goToLogs = () => {
    router.push({
        path: '/configuration/sales/logs',
        query: {
            salespersonId: props.salesperson.id
        }
    })
}

// 高亮文本函数
const highlightText = (text: string | undefined, ...fields: string[]) => {
    const isMatched = !props.matchedFields || props.matchedFields.length === 0
        || fields.some(field => props.matchedFields?.includes(field))
    return highlightTextHtml(text || '', isMatched ? props.highlightKeyword : undefined)
}

// 高亮数组文本
const highlightArrayText = (arr: string[] | undefined, field: string) =>
    Array.isArray(arr) ? arr.map(item => highlightText(item, field)).join('、') : ''

</script>

<style lang="less" scoped>
.sales-item {
    background: #fff;
    border-radius: 20px;
    padding: 20px 30px;
    display: flex;
    align-items: center;
    margin-bottom: 16px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.02);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

    .avatar-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100px;
        margin-right: 40px;
        flex-shrink: 0;

        .avatar {
            width: 70px;
            height: 70px;
            background-color: #ccc;
            border-radius: 50%;
            margin-bottom: 8px;
            cursor: pointer;
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
        }

        .name-cn, .name-en {
            :deep(.search-highlight) {
                background-color: #ffeb3b;
                padding: 0 2px;
                border-radius: 2px;
                font-weight: 600;
            }
        }
    }

    .info-grid {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 0;

        .col {
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            margin-right: 40px;
            flex-shrink: 0;

            &.join-col {
                width: 140px;
            }

            &.region-col {
                width: 100px;
            }

            &.contact-col {
                width: 150px;
            }

            &.email-col {
                width: 150px;
            }

            &.skill-col {
                width: 140px;
            }

            &.domain-col {
                width: 150px;
                display: grid;
                grid-template-columns: repeat(2, max-content);
                justify-content: center;
                align-content: start;
                gap: 6px;
            }

            &.count-col {
                width: 80px;
                align-items: center;
            }

            &.email-col {
                word-break: break-word;
            }
        }

        .field {
            display: flex;
            flex-direction: column;
        }

        .label {
            font-size: 14px;
            color: #91929e;
            margin-bottom: 2px;
            font-weight: 500;
        }

        .value {
            width: 100%;
            font-size: 15px;
            color: #0a1629;
            font-weight: 500;
            line-height: 1.4;
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
            :deep(.search-highlight) {
                background-color: #ffeb3b;
                padding: 0 2px;
                border-radius: 2px;
                font-weight: 600;
            }
        }

        .sub-text {
            font-size: 13px;
            color: #91929e;
            font-weight: 500;
        }

        .mt-1 {
            margin-top: 4px;
        }

        .mt-2 {
            margin-top: 12px;
        }

        .tag {
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            font-weight: 600;

            &.blue {
                background-color: rgba(42, 130, 228, 0.14);
                color: #2a82e4;
            }

            &.orange {
                background-color: rgba(255, 152, 0, 0.18);
                color: #ff9800;
            }

            &.purple {
                background-color: rgba(168, 85, 247, 0.14);
                color: #a855f7;
            }

            &.red {
                background-color: rgba(255, 87, 51, 0.16);
                color: #ff5733;
            }

            &.green {
                background-color: rgba(67, 207, 124, 0.16);
                color: #43cf7c;
            }

            :deep(.search-highlight) {
                background-color: #ffeb3b;
                padding: 0 2px;
                border-radius: 2px;
            }
        }
    }

    .actions-col {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-left: 0;
        min-width: 80px;

        .btn {
            border: none;
            border-radius: 14px;
            padding: 5px 0;
            font-size: 13.5px;
            box-shadow: 2px 2px 6px rgba(0, 0, 0, 0.3);
            color: #fff;
            cursor: pointer;
            width: 100%;
            text-align: center;
            transition: opacity 0.2s;
            font-weight: 600;

            &:hover {
                opacity: 0.9;
            }

            &.btn-home {
                background: #ffb200;
            }

            &.btn-log {
                background: #43cf7c;
            }
        }
    }
}
</style>

:deep(.search-highlight) {
    background-color: #ffeb3b;
    padding: 0 2px;
    border-radius: 2px;
    font-weight: 500;
}
