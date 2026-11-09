<template>
    <Teleport to="body">
        <div class="erp-app erp-dialog-mask" @click.self="closeDialog" @keydown.esc.stop="closeDialog">
            <ErpDialogFrame
                class="standard-price-sync-dialog"
                title="标准价同步设置"
                width="560px"
                height="640px"
                :close-disabled="submitting"
                role="dialog"
                aria-modal="true"
                aria-label="标准价同步设置"
                @close="closeDialog"
                @submit.prevent="saveSettings"
            >
                <p class="sync-description">按北京时间将全部外采产品的最新平均价同步为标准价，不受当前筛选、分页和勾选影响。平均价为0的产品跳过，不覆盖已有标准价。</p>
                <p v-if="loading" class="sync-state" role="status">加载设置中...</p>
                <div v-if="errorMessage" class="sync-error" role="alert">
                    <span>{{ errorMessage }}</span>
                    <button v-if="!settings" class="retry-button" type="button" :disabled="loading" @click="loadSettings">重新加载</button>
                </div>
                <fieldset v-if="settings" class="sync-fields" :disabled="loading || submitting || conflict">
                    <label class="sync-field">
                        <span>启用自动同步</span>
                        <input v-model="form.enabled" class="sync-switch" type="checkbox" role="switch" :aria-checked="form.enabled" aria-label="启用自动同步">
                    </label>
                    <label class="sync-field">
                        <span>同步频率</span>
                        <select v-model="form.frequency" aria-label="同步频率">
                            <option value="daily">每天</option>
                            <option value="weekly">每周</option>
                            <option value="monthly">每月</option>
                        </select>
                    </label>
                    <label v-if="form.frequency === 'weekly'" class="sync-field">
                        <span>同步星期</span>
                        <select v-model.number="form.weekDay" aria-label="同步星期">
                            <option v-for="(label, index) in weekDays" :key="index" :value="index + 1">{{ label }}</option>
                        </select>
                    </label>
                    <label v-if="form.frequency === 'monthly'" class="sync-field">
                        <span>每月日期</span>
                        <input v-model.number="form.monthDay" type="number" min="1" max="31" step="1" required aria-label="每月同步日期">
                    </label>
                    <label class="sync-field">
                        <span>同步时间</span>
                        <input v-model="form.time" type="time" step="60" required aria-label="同步时间（北京时间）">
                    </label>
                    <p class="sync-hint">时区：北京时间（Asia/Shanghai）。每月日期超过当月天数时，在当月最后一天同步。</p>
                </fieldset>
                <dl v-if="settings" class="sync-status">
                    <div><dt>下次同步</dt><dd>{{ settings.enabled ? formatDateTime(settings.nextRunAt) : "已停用" }}</dd></div>
                    <div>
                        <dt>最近执行</dt>
                        <dd v-if="settings.lastRun">
                            <span>{{ formatDateTime(settings.lastRun.completedAt) }}</span>
                            <span>更新 {{ settings.lastRun.updatedCount }} 项，跳过 {{ settings.lastRun.skippedCount }} 项</span>
                            <small>计划时间：{{ formatDateTime(settings.lastRun.scheduledAt) }}</small>
                        </dd>
                        <dd v-else>暂无执行记录</dd>
                    </div>
                    <div><dt>最近错误</dt><dd class="last-error">{{ settings.lastError || "无" }}</dd></div>
                </dl>
                <template #footer>
                    <button class="dialog-button cancel" type="button" :disabled="submitting" @click="closeDialog">取消</button>
                    <button class="dialog-button confirm" type="submit" :disabled="loading || submitting || !settings || conflict">{{ submitting ? "保存中..." : "保存" }}</button>
                </template>
            </ErpDialogFrame>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import { getStandardPriceSyncSettings, saveStandardPriceSyncSettings } from "~/composables/api/useFinanceApi";
import type { FinanceStandardPriceSyncSettings, FinanceStandardPriceSyncSettingsPayload } from "~~/shared/types/finance";

const emit = defineEmits<{
    close: [];
    saved: [];
}>();

const settings = ref<FinanceStandardPriceSyncSettings | null>(null);
const form = reactive<FinanceStandardPriceSyncSettingsPayload>({
    enabled: false,
    frequency: "daily",
    time: "",
    weekDay: 1,
    monthDay: 1,
    version: 0,
});
const loading = ref(true);
const submitting = ref(false);
const conflict = ref(false);
const errorMessage = ref("");
const weekDays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];

const formatDateTime = (value: string | null | undefined) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
};

const closeDialog = () => {
    if (!submitting.value) emit("close");
};

const loadSettings = async () => {
    if (submitting.value) return;
    loading.value = true;
    errorMessage.value = "";
    try {
        const response = await getStandardPriceSyncSettings();
        if (response.code !== 200 || !response.data) {
            errorMessage.value = response.msg || "同步设置加载失败";
            return;
        }
        settings.value = response.data;
        Object.assign(form, {
            enabled: response.data.enabled,
            frequency: response.data.frequency,
            time: response.data.time,
            weekDay: response.data.weekDay,
            monthDay: response.data.monthDay,
            version: response.data.version,
        });
        conflict.value = false;
    } catch (error: any) {
        errorMessage.value = error?.data?.msg || error?.message || "同步设置加载失败";
    } finally {
        loading.value = false;
    }
};

const showSaveError = (message: string, hasConflict: boolean) => {
    conflict.value = hasConflict;
    errorMessage.value = hasConflict ? "同步设置已被修改，请关闭并重新打开后再保存，当前输入已保留。" : message;
};

const saveSettings = async () => {
    if (loading.value || submitting.value || !settings.value || conflict.value) return;
    errorMessage.value = "";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time)) {
        errorMessage.value = "请选择有效的同步时间";
        return;
    }
    const validWeekDay = Number.isInteger(form.weekDay) && form.weekDay >= 1 && form.weekDay <= 7;
    const validMonthDay = Number.isInteger(form.monthDay) && form.monthDay >= 1 && form.monthDay <= 31;
    if (form.frequency === "weekly" && !validWeekDay) {
        errorMessage.value = "请选择有效的同步星期";
        return;
    }
    if (form.frequency === "monthly" && !validMonthDay) {
        errorMessage.value = "请选择1至31之间的每月日期";
        return;
    }
    const payload: FinanceStandardPriceSyncSettingsPayload = {
        enabled: form.enabled,
        frequency: form.frequency,
        time: form.time,
        weekDay: validWeekDay ? form.weekDay : 1,
        monthDay: validMonthDay ? form.monthDay : 1,
        version: form.version,
    };
    submitting.value = true;
    try {
        const response = await saveStandardPriceSyncSettings(payload);
        if (response.code !== 200 || !response.data) {
            showSaveError(response.msg || "同步设置保存失败", response.code === 409);
            return;
        }
        ElMessage.success("同步设置已保存");
        emit("saved");
        emit("close");
    } catch (error: any) {
        const status = Number(error?.statusCode || error?.status || error?.response?.status);
        showSaveError(error?.data?.msg || error?.message || "同步设置保存失败", status === 409 || error?.data?.code === 409);
    } finally {
        submitting.value = false;
    }
};

onMounted(() => {
    void loadSettings();
});
</script>

<style scoped>
.standard-price-sync-dialog {
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
}

.standard-price-sync-dialog :deep(.erp-dialog-frame__body) {
    display: block;
    overflow: auto;
    padding: var(--erp-spacing-20);
}

.sync-description,
.sync-hint {
    margin: 0 0 16px;
    color: var(--erp-color-text-secondary);
    line-height: 1.6;
}

.sync-fields {
    display: grid;
    gap: 16px;
    margin: 0;
    padding: 0;
    border: 0;
}

.sync-field {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
}

.sync-field input:not([type="checkbox"]),
.sync-field select {
    width: 100%;
    min-width: 0;
    height: var(--erp-size-control-height-sm);
    box-sizing: border-box;
    padding: 0 8px;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font: inherit;
}

.sync-switch {
    appearance: none;
    box-sizing: border-box;
    width: 40px;
    height: 22px;
    margin: 0;
    padding: 3px;
    border-radius: 11px;
    background: var(--erp-color-neutral-400);
    cursor: pointer;
}

.sync-switch::before {
    display: block;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    content: "";
}

.sync-switch:checked {
    background: var(--erp-color-action-primary);
}

.sync-switch:checked::before {
    transform: translateX(18px);
}

.sync-switch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.sync-hint {
    font-size: 12px;
}

.sync-status {
    display: grid;
    gap: 12px;
    margin: 0;
    padding-top: 16px;
    border-top: 1px solid var(--erp-color-border-muted);
    font-size: 13px;
}

.sync-status > div {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 12px;
}

.sync-status dt {
    color: var(--erp-color-text-secondary);
}

.sync-status dd {
    display: grid;
    gap: 4px;
    margin: 0;
    overflow-wrap: anywhere;
}

.sync-status small {
    color: var(--erp-color-text-secondary);
}

.sync-error {
    display: grid;
    gap: 8px;
    margin-bottom: 16px;
    color: var(--erp-color-feedback-danger, #d93025);
    line-height: 1.5;
}

.retry-button {
    justify-self: start;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-brand);
    background: transparent;
    cursor: pointer;
}
</style>
