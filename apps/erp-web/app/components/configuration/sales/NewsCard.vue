<script setup lang="ts">

const props = defineProps<{
    title: string
    date: string
    time: string
    type: 'maintenance' | 'leavemsg' | 'customer' | 'application'
    // 日志维护 | 留言 | 客户服务 | 对接申请
    hasNotification?: boolean
}>()

const emit = defineEmits(['view-detail'])

const getTypeConfig = (type: string) => {
    const configs = {
        maintenance: { icon: '📝', color: '#4CAF50', text: '维护日志' },
        leavemsg: { icon: '💬', color: '#FF9800', text: '留言通知' },
        customer: { icon: '👤', color: '#2196F3', text: '客户动态' },
        application: { icon: '📋', color: '#9C27B0', text: '对接申请' }
    }
    return configs[type as keyof typeof configs] || configs.customer
}
</script>

<template>
    <div class="news-card" :class="{ 'log-type': type === 'log' }">
        <div class="card-header">
            <span class="type-tag" :class="type">
                {{ type === 'application' ? '对接申请' : '跟进日志' }}
            </span>
            <span v-if="hasNotification" class="notification-dot"></span>
        </div>
        <h3 class="title">{{ title }}</h3>
        <p class="customer" v-if="customerInfo">客户: {{ customerInfo }}</p>
        <p class="subject" v-if="subject">主题: {{ subject }}</p>
        <div class="meta">
            <span class="date">{{ date }} {{ time }}</span>
            <button class="view-btn" @click="$emit('view-detail')">查看详情</button>
        </div>
    </div>
</template>

<style lang="less" scoped>
.news-card {
    background: #fff;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
    transition: all 0.3s;

    &:hover {
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        transform: translateY(-2px);
    }

    &.log-type {
        border-left: 4px solid #67c23a;
    }

    .card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;

        .type-tag {
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;

            &.application {
                background: #ecf5ff;
                color: #409eff;
            }

            &.log {
                background: #f0f9eb;
                color: #67c23a;
            }
        }

        .notification-dot {
            width: 8px;
            height: 8px;
            background: #f56c6c;
            border-radius: 50%;
        }
    }

    .title {
        font-size: 16px;
        font-weight: 600;
        color: #333;
        margin: 0 0 8px 0;
        line-height: 1.4;
    }

    .customer, .subject {
        font-size: 14px;
        color: #666;
        margin: 4px 0;
    }

    .meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 16px;

        .date {
            font-size: 13px;
            color: #999;
        }

        .view-btn {
            padding: 6px 16px;
            background: #409eff;
            color: #fff;
            border: none;
            border-radius: 16px;
            font-size: 13px;
            cursor: pointer;
            transition: background 0.2s;

            &:hover {
                background: #66b1ff;
            }
        }
    }
}
</style>