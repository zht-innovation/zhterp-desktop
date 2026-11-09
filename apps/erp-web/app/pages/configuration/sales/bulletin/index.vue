<template>
    <div class="bulletin-page">
        <div class="bulletin-card">
            <div class="card-header">
                <div class="title-group">
                    <Icon name="mdi:bullhorn-outline" class="title-icon" />
                    <div>
                        <div class="title">公告栏</div>
                        <div class="subtitle">最新系统通知与更新</div>
                    </div>
                </div>
                <div class="header-meta">
                    <span class="count">共 {{ updates.length }} 条</span>
                </div>
            </div>

            <div class="notice-tip">
                <Icon name="material-symbols:info-outline" class="tip-icon" />
                <span>这里会同步系统更新、版本发布与重要通知。</span>
            </div>

            <el-scrollbar class="bulletin-list">
                <button
                    v-for="update in updates"
                    :key="update.id"
                    class="bulletin-item"
                    type="button"
                    @click="openDetail(update)"
                >
                    <div class="item-header">
                        <el-tag :type="getTagType(update.type)" size="small">{{ getTypeLabel(update.type) }}</el-tag>
                        <span class="version">{{ update.version }}</span>
                        <span class="date">{{ update.date }}</span>
                    </div>
                    <div class="item-title">{{ update.title }}</div>
                    <div class="item-content">{{ update.content }}</div>
                </button>
                <div v-if="updates.length === 0" class="empty-state">暂无公告</div>
            </el-scrollbar>

            <el-dialog v-model="showDetail" width="35rem" :show-close="false">
                <template #header>
                    <div class="dialog-header">
                        <span class="dialog-title">公告详情</span>
                        <button class="close-btn" type="button" @click="showDetail = false">
                            <Icon name="heroicons:x-mark" />
                        </button>
                    </div>
                </template>
                <div v-if="activeUpdate" class="dialog-body">
                    <div class="dialog-meta">
                        <el-tag :type="getTagType(activeUpdate.type)" size="small">
                            {{ getTypeLabel(activeUpdate.type) }}
                        </el-tag>
                        <span class="version">{{ activeUpdate.version }}</span>
                        <span class="date">{{ activeUpdate.date }}</span>
                    </div>
                    <div class="dialog-title-text">{{ activeUpdate.title }}</div>
                    <div class="dialog-content">{{ activeUpdate.content }}</div>
                </div>
                <template #footer>
                    <el-button type="primary" @click="showDetail = false">知道了</el-button>
                </template>
            </el-dialog>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { bulletinUpdates, type BulletinUpdate } from '~/utils/bulletinUpdates'
import { retrieveSalespersonList } from '~/composables/api/useSalespersonApi'

definePageMeta({
    layout: 'sales'
})

const updates = computed(() => bulletinUpdates)
const showDetail = ref(false)
const activeUpdate = ref<BulletinUpdate | null>(null)
const userInfo = useState<any>('admin_info', () => ({}))
const isSalesperson = computed(() => Number(userInfo.value.role) === 3)
const salespersonId = useState<string | null>('salesperson_id', () => null)
const salespersonCache = useState<any>('salesperson_self_cache', () => null)

const getTagType = (type: BulletinUpdate['type']) => {
    const typeMap: Record<BulletinUpdate['type'], string> = {
        feature: 'success',
        fix: 'danger',
        improvement: 'warning',
        notice: 'info'
    }
    return typeMap[type] || 'info'
}

const getTypeLabel = (type: BulletinUpdate['type']) => {
    const labelMap: Record<BulletinUpdate['type'], string> = {
        feature: '新功能',
        fix: '修复',
        improvement: '优化',
        notice: '通知'
    }
    return labelMap[type] || '通知'
}

const openDetail = (update: BulletinUpdate) => {
    activeUpdate.value = update
    showDetail.value = true
}

onMounted(async () => {
    if (!isSalesperson.value) return
    if (salespersonCache.value) return
    try {
        const res = await retrieveSalespersonList()()
        const list = res?.data?.salesperson || []
        let matched = null
        if (salespersonId.value) {
            matched = list.find((sp: any) => sp?._id === salespersonId.value)
        }
        if (!matched && userInfo.value?.username) {
            matched = list.find((sp: any) => sp?.name === userInfo.value.username)
        }
        salespersonCache.value = matched || null
    } catch (error) {
        console.error('获取销售个人信息失败:', error)
    }
})
</script>

<style lang="less" scoped>
.bulletin-page {
    min-height: 100vh;
    height: 100vh;
    padding: 16px;
    display: flex;
    align-items: stretch;
    justify-content: stretch;
    box-sizing: border-box;
}

.bulletin-card {
    width: 100%;
    height: 100%;
    background: #fff;
    border-radius: 18px;
    padding: 24px 28px 30px;
    box-shadow: 0 16px 40px rgba(31, 45, 61, 0.12);
    border: 1px solid #e9eff5;
    display: flex;
    flex-direction: column;
}

.card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;

    .title-group {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .title-icon {
        font-size: 28px;
        color: #3f8cff;
    }

    .title {
        font-size: 22px;
        font-weight: 600;
        color: #1f2d3d;
    }

    .subtitle {
        font-size: 14px;
        color: #909399;
        margin-top: 4px;
    }

    .header-meta {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .count {
        font-size: 13px;
        color: #606266;
        background: #f0f6ff;
        padding: 4px 10px;
        border-radius: 12px;
    }
}

.notice-tip {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 18px 0 16px;
    padding: 10px 14px;
    border-radius: 12px;
    background: #f6f9ff;
    color: #4b5563;
    font-size: 14px;

    .tip-icon {
        font-size: 18px;
        color: #3f8cff;
    }
}

.bulletin-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
    flex: 1;
    min-height: 0;
    padding-right: 8px;
}

.bulletin-item {
    border: none;
    width: 100%;
    text-align: left;
    cursor: pointer;
    background: #f5f7fa;
    border-radius: 12px;
    padding: 16px 18px;
    margin-bottom: 20px;
    box-shadow: 0 6px 16px rgba(31, 45, 61, 0.08);
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 24px rgba(31, 45, 61, 0.12);
    }

    .item-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;

        .version {
            font-size: 13px;
            color: #606266;
            font-weight: 500;
        }

        .date {
            font-size: 12px;
            color: #909399;
            margin-left: auto;
        }
    }

    .item-title {
        font-size: 16px;
        font-weight: 600;
        color: #303133;
        margin-bottom: 6px;
    }

    .item-content {
        font-size: 14px;
        color: #606266;
        line-height: 1.6;
    }
}

:deep(.el-dialog) {
    border-radius: 16px;
}

.dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.dialog-title {
    font-size: 16px;
    font-weight: 600;
    color: #1f2d3d;
}

.close-btn {
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 18px;
    color: #909399;

    &:hover {
        color: #3f8cff;
    }
}

.dialog-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    color: #1f2d3d;
}

.dialog-meta {
    display: flex;
    align-items: center;
    gap: 10px;

    .version {
        font-size: 13px;
        color: #606266;
        font-weight: 500;
    }

    .date {
        font-size: 12px;
        color: #909399;
        margin-left: auto;
    }
}

.dialog-title-text {
    font-size: 16px;
    font-weight: 600;
}

.dialog-content {
    font-size: 14px;
    color: #4b5563;
    line-height: 1.7;
    white-space: pre-line;
}

.empty-state {
    text-align: center;
    color: #909399;
    padding: 30px 0 20px;
    font-size: 14px;
}
</style>
