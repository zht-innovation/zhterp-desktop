<template>
    <el-dialog v-model="visible" title="桌面设置" width="min(600px, calc(100vw - 32px))" append-to-body align-center>
        <div class="desktop-settings">
            <section>
                <h3>启动与窗口</h3>
                <label class="setting-row">
                    <span>开机自启动</span>
                    <input type="checkbox" :checked="autostart" :disabled="busy || autostart === null" @change="changeAutostart">
                </label>
                <p>开机后静默驻留托盘；关闭主窗口后可从托盘重新打开。</p>
                <el-button :disabled="busy" @click="resetLayout">恢复默认窗口布局</el-button>
            </section>
            <section>
                <h3>下载</h3>
                <p>{{ downloads.directory.value || '使用系统上次保存目录' }}；每次保存时均可另选位置。</p>
                <div class="setting-actions">
                    <el-button :disabled="busy || !downloads.available.value" @click="run(downloads.chooseDirectory)">选择默认目录</el-button>
                    <el-button :disabled="busy || !downloads.available.value || !downloads.directory.value" @click="run(downloads.resetDirectory)">恢复系统目录</el-button>
                    <el-button :disabled="busy || !downloads.available.value" @click="openPanel('downloads')">下载中心</el-button>
                </div>
                <el-button class="clear-records" :disabled="busy || !downloads.available.value" @click="run(downloads.clearHistory)">清理已结束的下载记录</el-button>
                <p>仅清理当前账号的任务记录，已保存的文件保留。</p>
                <p v-if="downloads.warning.value" class="settings-error">{{ downloads.warning.value }}</p>
            </section>
            <section>
                <h3>打印</h3>
                <p>在打印中心分别设置单据、SKU 和 SN 标签的打印机、纸张与份数，并管理重打记录。</p>
                <el-button :disabled="busy" @click="openPanel('print')">打开打印配置与记录</el-button>
            </section>
            <p v-if="error" class="settings-error" role="alert">{{ error }}</p>
            <p v-else-if="message" role="status">{{ message }}</p>
        </div>
    </el-dialog>
</template>

<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useDesktopDownloads } from "~/composables/useDesktopDownloads";
const downloads = useDesktopDownloads();
const visible = ref(false);
const autostart = ref<boolean | null>(null);
const busy = ref(false);
const error = ref("");
const message = ref("");
const listeners: UnlistenFn[] = [];
let disposed = false;

async function run(action: () => unknown | Promise<unknown>) {
    if (busy.value) return;
    busy.value = true;
    error.value = "";
    message.value = "";
    try { await action(); }
    catch (cause) { error.value = String(cause instanceof Error ? cause.message : cause); }
    finally { busy.value = false; }
}
async function open() {
    visible.value = true;
    await run(async () => { autostart.value = await invoke<boolean>("desktop_autostart_state"); });
}
function changeAutostart(event: Event) {
    const input = event.target as HTMLInputElement;
    const enabled = input.checked;
    input.checked = Boolean(autostart.value);
    void run(async () => {
        autostart.value = await invoke<boolean>("set_desktop_autostart", { enabled });
    });
}
function resetLayout() {
    void run(async () => {
        await invoke("reset_desktop_window_layout");
        message.value = "已恢复默认窗口布局";
    });
}
async function openPanel(panel: string) {
    await run(async () => {
        await invoke("desktop_open_panel", { panel });
        visible.value = false;
    });
}
onMounted(async () => {
    try {
        const openListener = await listen("erp-open-desktop-settings", () => { void open(); });
        if (disposed) { openListener(); return; }
        listeners.push(openListener);
        const stateListener = await listen<boolean>("erp-autostart-changed", event => { autostart.value = event.payload; });
        if (disposed) { stateListener(); return; }
        listeners.push(stateListener);
        if (await invoke<boolean>("desktop_panel_ready", { panel: "settings" }) && !disposed) await open();
    } catch { error.value = "桌面设置暂不可用"; }
});
onBeforeUnmount(() => { disposed = true; for (const unlisten of listeners) unlisten(); });
</script>

<style scoped>
.desktop-settings { font-size: 14PX; line-height: 1.6; }
.desktop-settings section + section { margin-top: 20PX; border-top: 1PX solid #e5e7eb; padding-top: 16PX; }
.desktop-settings h3 { margin: 0 0 10PX; font-size: 16PX; }
.desktop-settings p { color: #667085; overflow-wrap: anywhere; }
.setting-row { display: flex; justify-content: space-between; align-items: center; }
.setting-row input { width: 18PX; height: 18PX; }
.setting-actions { display: flex; flex-wrap: wrap; gap: 8PX; }
.setting-actions :deep(.el-button) { margin-left: 0; }
.clear-records { margin-top: 10PX; }
.desktop-settings .settings-error { color: #b42318; }
</style>
