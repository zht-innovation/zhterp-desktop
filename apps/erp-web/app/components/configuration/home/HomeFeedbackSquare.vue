<template>
    <section>
        <header class="home-card-header">
            <h2>需求广场</h2>
            <NuxtLink class="home-action" external :to="feedbackUrl()">更多</NuxtLink>
        </header>
        <p v-if="error" role="alert">{{ error }} <button type="button" class="home-action" @click="load">重试</button></p>
        <p v-if="!items.length && !error" class="home-card-note">{{ loading ? '加载中…' : '暂无意见。' }}</p>
        <ul v-if="items.length">
            <li v-for="item in items" :key="item.feedbackId">
                <span class="stage">{{ FEEDBACK_STAGES[item.stage] || FEEDBACK_STATUSES[item.status] }}</span>
                <NuxtLink class="title" external :title="item.title" :to="feedbackUrl(item.feedbackId)">{{ item.title }}</NuxtLink>
                <button type="button" class="favorite" :aria-pressed="item.isFollowing" :disabled="loading || saving"
                    @click="toggleFollow(item)">{{ item.isFollowing ? '已收藏' : '收藏' }}</button>
            </li>
        </ul>
    </section>
</template>

<script setup lang="ts">
import { FEEDBACK_STAGES, FEEDBACK_STATUSES, type FeedbackList, type FeedbackSummary } from "~~/shared/types/feedback";
import { getToken } from "~/utils/auth";
import { mainSitePage } from "~/utils/mainSitePage";

const props = defineProps<{ refreshKey: number }>();
const { mainSiteOrigin } = useRuntimeConfig().public;
const items = ref<FeedbackSummary[]>([]);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
let requestId = 0;

function feedbackUrl(id?: string) {
    const path = "/configuration/feedback";
    return mainSitePage(id ? path + "?feedbackId=" + encodeURIComponent(id) : path, mainSiteOrigin);
}

async function load() {
    const id = ++requestId;
    loading.value = true;
    error.value = "";
    try {
        const result = await $fetch<{ code: number; data: FeedbackList }>("/feedback/retrieve", {
            headers: { Token: getToken() || "" },
            query: { scope: "all", sort: "newest", page: 1, pageSize: 5 },
        });
        if (result.code !== 200) throw new Error();
        if (id === requestId) items.value = result.data.list;
    } catch {
        if (id === requestId) error.value = "意见箱加载失败";
    } finally {
        if (id === requestId) loading.value = false;
    }
}

async function toggleFollow(item: FeedbackSummary) {
    if (saving.value || loading.value) return;
    saving.value = true;
    error.value = "";
    try {
        const result = await $fetch<{ code: number; data: { isFollowing: boolean } }>("/feedback/follow", {
            method: item.isFollowing ? "DELETE" : "PUT",
            headers: { Token: getToken() || "" },
            body: { feedbackId: item.feedbackId },
        });
        if (result.code !== 200) throw new Error();
        item.isFollowing = result.data.isFollowing;
    } catch {
        error.value = "收藏状态更新失败";
    } finally {
        saving.value = false;
    }
}

watch(() => props.refreshKey, () => { if (!saving.value) void load(); }, { immediate: true });
</script>

<style scoped>
ul { margin: 0; padding: 0; list-style: none; }
li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 6px; align-items: center; padding: 5px 0; }
li + li { border-top: 1px solid var(--border); }
.stage { color: var(--brand); background: var(--brand-soft); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
.title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: inherit; text-decoration: none; }
.title:hover { text-decoration: underline; }
.favorite { border: 0; border-radius: 4px; padding: 3px 6px; background: transparent; color: var(--secondary); cursor: pointer; }
.favorite[aria-pressed="true"] { background: #fff0de; color: #8a4408; }
</style>
