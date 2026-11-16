<template>
    <el-dialog
        v-model="visible"
        title="关于 ERP"
        width="min(440px, calc(100vw - 32px))"
        append-to-body
        align-center
        :close-on-click-modal="false"
        :close-on-press-escape="!busy"
        :show-close="!busy"
        @close="confirming = false"
    >
        <div class="desktop-about-version">
            <strong>{{ info?.channel === 'staging' ? 'ZH ERP 预发' : 'ZH ERP' }}</strong>
            <span v-if="info">当前版本 {{ info.version }}</span>
        </div>

        <p v-if="update">发现新版本 {{ update.version }}</p>
        <p v-if="update?.notes" class="desktop-about-notes">{{ update.notes }}</p>
        <p v-if="confirming">请先保存正在编辑的内容。安装完成后，ERP 将重启。若窗口未显示，可从系统托盘打开。</p>
        <p v-if="status" role="status">{{ status }}</p>
        <p v-if="error" class="desktop-about-error" role="alert">{{ error }}</p>
        <progress
            v-if="activity === 'downloading'"
            class="desktop-about-progress"
            :value="progressPercent"
            max="100"
            aria-label="更新下载进度"
        />

        <template #footer>
            <template v-if="confirming">
                <el-button @click="confirming = false">取消</el-button>
                <el-button type="primary" @click="installUpdate">确认安装</el-button>
            </template>
            <template v-else>
                <el-button v-if="!info && error" :disabled="busy" @click="loadInfo">重试</el-button>
                <el-button v-if="info?.updatesEnabled" :disabled="busy" @click="checkUpdate">
                    检查更新
                </el-button>
                <el-button v-if="update" type="primary" :disabled="busy" @click="confirming = true">
                    立即升级
                </el-button>
                <el-button v-if="!info?.updatesEnabled && !busy" @click="visible = false">关闭</el-button>
            </template>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type DesktopInfo = {
    version: string;
    channel: "staging" | "stable";
    updatesEnabled: boolean;
};

type DesktopUpdate = { version: string; notes: string | null };
type UpdateProgress = {
    stage: "downloading" | "installing";
    downloadedBytes: number;
    totalBytes: number | null;
};

const visible = ref(false);
const info = ref<DesktopInfo | null>(null);
const update = ref<DesktopUpdate | null>(null);
const confirming = ref(false);
const activity = ref<"idle" | "loading" | "checking" | "downloading" | "installing">("idle");
const progress = ref<UpdateProgress | null>(null);
const message = ref("");
const error = ref("");
const busy = computed(() => activity.value !== "idle");
const progressPercent = computed(() => {
    const current = progress.value;
    if (!current?.totalBytes) return undefined;
    return Math.min(100, Math.floor(100 * current.downloadedBytes / current.totalBytes));
});
const status = computed(() => {
    switch (activity.value) {
        case "loading": return "正在读取版本信息…";
        case "checking": return "正在检查更新…";
        case "downloading": return `正在下载更新${progressPercent.value === undefined ? "…" : ` ${progressPercent.value}%`}`;
        case "installing": return message.value || "正在安装更新…";
        default: return message.value;
    }
});

async function loadInfo() {
    if (busy.value) return;
    activity.value = "loading";
    error.value = "";
    try {
        info.value = await invoke<DesktopInfo>("desktop_info");
    } catch {
        error.value = "无法读取当前版本，请重试。";
    } finally {
        activity.value = "idle";
    }
}

async function checkUpdate() {
    if (busy.value || !info.value?.updatesEnabled) return;
    activity.value = "checking";
    update.value = null;
    message.value = "";
    error.value = "";
    try {
        update.value = await invoke<DesktopUpdate | null>("check_desktop_update");
        if (!update.value) message.value = "当前没有可用更新。";
    } catch (cause) {
        error.value = typeof cause === "string" ? cause : "检查更新失败，请检查网络后重试。";
    } finally {
        activity.value = "idle";
    }
}

async function installUpdate() {
    const version = update.value?.version;
    if (!version || busy.value || !confirming.value) return;
    confirming.value = false;
    activity.value = "downloading";
    progress.value = null;
    error.value = "";
    const onProgress = new Channel<UpdateProgress>();
    let receivingProgress = true;
    onProgress.onmessage = (value) => {
        if (!receivingProgress) return;
        progress.value = value;
        activity.value = value.stage;
    };
    try {
        await invoke("install_desktop_update", { version, onProgress });
        activity.value = "installing";
        message.value = "安装完成，正在重启…";
    } catch (cause) {
        activity.value = "idle";
        update.value = null;
        error.value = typeof cause === "string" ? cause : "安装更新失败，请重新检查后重试。";
    } finally {
        receivingProgress = false;
    }
}

function openAbout() {
    visible.value = true;
    if (!info.value) void loadInfo();
}

let unlisten: UnlistenFn | undefined;
let disposed = false;
onMounted(async () => {
    try {
        const stop = await listen("erp-open-about", openAbout, {
            target: { kind: "WebviewWindow", label: "erp" },
        });
        if (disposed) {
            stop();
            return;
        }
        unlisten = stop;
        if (await invoke<boolean>("desktop_about_ready") && !disposed) openAbout();
    } catch (cause) {
        console.error("初始化关于 ERP 菜单失败", cause);
    }
});

onUnmounted(() => {
    disposed = true;
    unlisten?.();
});
</script>

<style scoped>
.desktop-about-version {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.desktop-about-version strong {
    font-size: 18px;
}

.desktop-about-error {
    color: var(--el-color-danger);
}

.desktop-about-notes {
    max-height: 160px;
    overflow: auto;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
}

.desktop-about-progress {
    width: 100%;
    accent-color: var(--el-color-primary);
}
</style>
