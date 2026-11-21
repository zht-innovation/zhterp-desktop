<template>
    <el-dialog :model-value="true" title="提交意见" width="min(620px, 92vw)" append-to-body
        :close-on-click-modal="false" :close-on-press-escape="!submitting" :show-close="!submitting"
        @close="emit('close')">
        <form class="feedback-form" @submit.prevent="submit">
            <span>提交人　{{ submitter }}</span>
            <label>意见标题
                <el-input v-model="title" maxlength="60" show-word-limit :disabled="submitting"
                    placeholder="用一句话概括你的意见" />
            </label>
            <div>
                <span>意见内容</span>
                <FeedbackContentEditor v-model="description" v-model:attachments="attachments"
                    :disabled="submitting" @blocked="imagesBlocked = $event" />
            </div>
            <div class="feedback-options">
                <label>意见类型
                    <el-select v-model="category" placeholder="请选择意见类型" :disabled="submitting">
                        <el-option v-for="(name, key) in FEEDBACK_CATEGORIES" :key="key" :label="name" :value="key" />
                    </el-select>
                </label>
                <label>影响范围
                    <el-select v-model="impact" placeholder="请选择影响范围" :disabled="submitting">
                        <el-option v-for="(name, key) in FEEDBACK_IMPACTS" :key="key" :label="name" :value="key" />
                    </el-select>
                </label>
            </div>
            <p v-if="error" class="feedback-error" role="alert">{{ error }}</p>
            <div class="feedback-actions">
                <el-button :disabled="submitting" @click="emit('close')">取消</el-button>
                <el-button native-type="submit" type="primary" :loading="submitting" :disabled="imagesBlocked || submitting">
                    提交意见
                </el-button>
            </div>
        </form>
    </el-dialog>
</template>

<script setup lang="ts">
import FeedbackContentEditor from "./FeedbackContentEditor.vue";
import { getToken } from "~/utils/auth";
import {
    FEEDBACK_CATEGORIES, FEEDBACK_IMPACTS,
    type FeedbackAttachment, type FeedbackCategory, type FeedbackContent, type FeedbackImpact,
} from "~~/shared/types/feedback";

defineProps<{ submitter: string }>();
const emit = defineEmits<{ close: [] }>();
const title = ref("");
const description = ref("");
const category = ref<FeedbackCategory>();
const impact = ref<FeedbackImpact>();
const attachments = ref<FeedbackAttachment[]>([]);
const imagesBlocked = ref(false);
const submitting = ref(false);
const error = ref("");

async function submit() {
    if (submitting.value || imagesBlocked.value) return;
    if (!title.value.trim() || !description.value.trim() || !category.value || !impact.value) {
        error.value = "请填写标题和意见内容，并选择意见类型和影响范围。";
        return;
    }

    const body: FeedbackContent = {
        title: title.value.trim(),
        description: description.value.trim(),
        categoryKey: category.value,
        impactScope: impact.value,
        attachments: attachments.value,
    };
    submitting.value = true;
    error.value = "";
    try {
        const result = await $fetch<{ code: number; msg?: string; data?: { code: string } }>("/feedback/add", {
            method: "POST",
            headers: { Token: getToken() || "" },
            body,
            retry: 0,
        });
        if (result?.code !== 200 || !result.data?.code) {
            error.value = result?.msg || "未收到意见提交确认。";
            return;
        }
        ElMessage.success("意见已提交，编号 " + result.data.code);
        emit("close");
    } catch (cause) {
        const failure = cause as { data?: { msg?: string }; statusCode?: number };
        error.value = failure.data?.msg || (failure.statusCode === 503
            ? "意见箱暂时无法接收提交，请稍后重试。"
            : "未收到意见提交确认，请检查网络连接。");
    } finally {
        submitting.value = false;
    }
}
</script>

<style scoped>
.feedback-form { display: grid; gap: 16px; }
.feedback-form label, .feedback-form > div > span { display: grid; gap: 6px; }
.feedback-form > div > span { margin-bottom: 6px; }
.feedback-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.feedback-actions { display: flex; justify-content: flex-end; }
.feedback-error { margin: 0; color: var(--el-color-danger); }
</style>
