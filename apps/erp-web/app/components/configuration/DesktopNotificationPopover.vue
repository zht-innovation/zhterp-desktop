<template>
    <el-popover
        v-model:visible="visible"
        trigger="click"
        placement="bottom-end"
        :width="320"
        :offset="12"
        :show-arrow="false"
        popper-class="desktop-message-popover"
    >
        <template #reference>
            <button
                ref="triggerButton"
                type="button"
                class="desktop-top-action"
                :class="{ active: visible }"
                :aria-label="summary.totalUnread > 0 ? `消息，${summary.totalUnread}条未读` : '消息'"
                :aria-expanded="visible"
                aria-haspopup="dialog"
                title="消息"
            >
                <Icon name="lucide:bell" />
                <span class="desktop-top-action-label">消息</span>
                <span v-if="summary.totalUnread > 0" class="desktop-unread-count" aria-hidden="true">
                    {{ summary.totalUnread > 99 ? '99+' : summary.totalUnread }}
                </span>
            </button>
        </template>

        <section class="desktop-message-panel" role="dialog" aria-label="消息预览" :aria-busy="loading">
            <div class="desktop-message-tabs" role="group" aria-label="消息分类">
                <button type="button" :aria-pressed="activeTab === 'announcement'" @click="activeTab = 'announcement'">
                    公告栏
                </button>
                <button type="button" :aria-pressed="activeTab === 'message'" @click="activeTab = 'message'">
                    消息通知
                </button>
            </div>
            <p v-if="loading" class="desktop-message-status" role="status">加载中…</p>
            <div v-else-if="loadFailed" class="desktop-message-status" role="alert">
                加载失败，请重试。
                <button type="button" class="desktop-message-retry" @click="loadPreview">重试</button>
            </div>
            <template v-else>
                <p v-if="items.length === 0" class="desktop-message-status">
                    {{ activeTab === 'announcement' ? '暂无公告。' : '暂无消息通知。' }}
                </p>
                <template v-else>
                    <ul class="desktop-message-list">
                        <li v-for="item in items" :key="item._id">
                            <strong>{{ item.title }}</strong>
                            <p>{{ item.content }}</p>
                        </li>
                    </ul>
                    <footer class="desktop-message-footer">
                        <button type="button" @click="viewAll">查看全部</button>
                    </footer>
                </template>
            </template>
        </section>
    </el-popover>
</template>

<script setup lang="ts">
import { retrieveNotifications, type NotificationItem } from "~/composables/api/useNotificationApi";
import { useNotificationUnread } from "~/composables/useNotificationUnread";
import { mergeNotificationAnnouncements } from "~/utils/notificationAnnouncements";

const props = defineProps<{ centerPath: string }>();
const router = useRouter();
const { summary } = useNotificationUnread();
const visible = ref(false);
const activeTab = ref<"announcement" | "message">("message");
const items = ref<NotificationItem[]>([]);
const loading = ref(false);
const loadFailed = ref(false);
const triggerButton = ref<HTMLButtonElement | null>(null);
let requestSequence = 0;

async function loadPreview() {
    if (!visible.value) return;
    const requestId = ++requestSequence;
    const tab = activeTab.value;
    loading.value = true;
    loadFailed.value = false;
    items.value = [];
    try {
        const response = await retrieveNotifications(tab === "announcement" ? "announcement" : "notification", 1, 5);
        if (requestId !== requestSequence) return;
        if (response.code !== 200 || !response.data) throw new Error("加载消息失败");
        items.value = tab === "announcement"
            ? mergeNotificationAnnouncements(response.data.list).slice(0, 5)
            : response.data.list.slice(0, 5);
    } catch {
        if (requestId === requestSequence) loadFailed.value = true;
    } finally {
        if (requestId === requestSequence) loading.value = false;
    }
}

function closePreview() {
    visible.value = false;
}

function viewAll() {
    closePreview();
    return navigateTo({ path: props.centerPath, query: { tab: activeTab.value } });
}

function handleEscape(event: KeyboardEvent) {
    if (event.key !== "Escape" || !visible.value) return;
    closePreview();
    triggerButton.value?.focus();
}

watch([visible, activeTab], () => {
    // 关闭、切换分类或卸载后，旧请求不能回填预览列表。
    requestSequence += 1;
    items.value = [];
    loading.value = false;
    loadFailed.value = false;
    if (visible.value) void loadPreview();
}, { flush: "sync" });

watch(() => router.currentRoute.value.fullPath, closePreview);
onMounted(() => document.addEventListener("keydown", handleEscape));
onBeforeUnmount(() => {
    requestSequence += 1;
    document.removeEventListener("keydown", handleEscape);
});
</script>

<style scoped>
.desktop-message-panel {
    color: #294657;
    font-size: 13px;
    line-height: 1.55;
}

.desktop-message-panel button {
    border: 1px solid #c9cdd2;
    border-radius: 6px;
    padding: 6px 12px;
    color: inherit;
    background: #fff;
    font: inherit;
    cursor: pointer;
}

.desktop-message-panel button:hover,
.desktop-message-panel button:focus-visible {
    border-color: #3dabee;
    color: #3dabee;
}

.desktop-message-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    padding-bottom: 10px;
    border-bottom: 1px solid #e0edf5;
}

.desktop-message-tabs button[aria-pressed="true"] {
    border-color: #d8eefc;
    color: #3dabee;
    background: #ecf7fd;
}

.desktop-message-status {
    margin: 12px 0 8px;
    color: #7d97a8;
}

.desktop-message-panel .desktop-message-retry {
    margin-left: 6px;
}

.desktop-message-list {
    max-height: min(360px, 50vh);
    overflow-y: auto;
    margin: 0;
    padding: 4px 0 0;
    list-style: none;
}

.desktop-message-list li {
    padding: 9px 0;
    border-bottom: 1px solid #e0edf5;
    overflow-wrap: anywhere;
}

.desktop-message-list li:last-child {
    border-bottom: 0;
}

.desktop-message-list strong {
    display: block;
    font-weight: 600;
}

.desktop-message-list p {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    margin: 4px 0 0;
    color: #7d97a8;
    font-size: 12px;
    white-space: pre-line;
}

.desktop-message-footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 6px;
}
</style>

<style>
.el-popper.desktop-message-popover {
    box-sizing: border-box;
    max-width: calc(100vw - 24px);
    max-height: calc(100dvh - 24px);
    overflow-y: auto;
    padding: 12px;
    border: 1px solid #e0edf5;
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 14px 42px #233e631a;
}
</style>
