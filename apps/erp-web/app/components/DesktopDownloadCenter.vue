<template>
    <el-dialog v-model="visible" title="下载中心" width="min(900px, calc(100vw - 32px))" class="desktop-download-center" append-to-body>
        <p v-if="syncing" class="download-notice">正在读取当前账号的下载记录…</p>
        <el-alert v-if="notice || warning" :title="notice || warning || ''" type="warning" :closable="false" show-icon />
        <p v-if="!available && !syncing" class="download-notice">登录后可查看此账号的下载记录。</p>
        <template v-if="available">
            <div class="download-toolbar">
                <span class="download-directory" :title="directory || ''">默认目录：{{ directory || '使用系统上次保存位置' }}</span>
                <el-button size="small" :loading="busy.has('directory')" @click="act('directory', chooseDirectory)">选择目录</el-button>
                <el-button v-if="directory" size="small" :disabled="busy.has('directory')" @click="act('directory', resetDirectory)">恢复默认</el-button>
                <el-button size="small" :disabled="!tasks.length" @click="act('clear', clearHistory)">清理已结束记录</el-button>
            </div>
            <p class="download-hint">保存时仍可另选位置。清理记录不会删除已保存文件；本地导出内容释放后需回来源页面重新导出。</p>
            <el-empty v-if="!tasks.length" description="暂无下载任务" :image-size="90" />
            <div v-else class="download-list">
                <article v-for="task in tasks" :key="task.id" class="download-task">
                    <div class="download-heading"><strong>{{ task.name }}</strong><span>{{ statusText(task) }}</span></div>
                    <div class="download-meta">{{ task.kind === 'remote' ? '附件下载' : '本地导出' }} · {{ new Date(task.createdAt).toLocaleString() }}</div>
                    <el-progress v-if="task.kind === 'remote' && task.total && task.status === 'processing'"
                        :percentage="Math.min(100, Math.floor(task.transferred / task.total * 100))" :stroke-width="6" />
                    <div v-if="task.transferred || task.total || (task.kind === 'remote' && task.status === 'processing')" class="download-meta">
                        {{ bytes(task.transferred) }}<template v-if="task.total !== null"> / {{ bytes(task.total) }}</template>
                        <span v-else>（总大小未知）</span>
                    </div>
                    <div v-if="task.path" class="download-path">{{ task.path }}</div>
                    <div v-if="task.error" class="download-error">{{ task.error }}</div>
                    <div class="download-actions">
                        <el-button v-if="downloadIsActive(task)" size="small" :loading="busy.has(task.id)" @click="act(task.id, () => cancel(task.id))">取消</el-button>
                        <template v-else-if="task.status === 'saved'">
                            <el-button size="small" @click="act(task.id, () => openFile(task.id))">打开文件</el-button>
                            <el-button size="small" @click="act(task.id, () => openFile(task.id, true))">定位目录</el-button>
                        </template>
                        <template v-else>
                            <el-button v-if="canRetry(task)" size="small" :loading="busy.has(task.id)" @click="act(task.id, () => retry(task))">重试</el-button>
                            <span v-else class="download-hint">{{ task.kind === 'remote' ? '请回来源页重新下载' : '请从来源页面重新导出' }}</span>
                        </template>
                        <el-button v-if="task.sourcePage && canOpenSource(task.sourcePage)" size="small" text @click="returnToSource(task.sourcePage)">回来源页面</el-button>
                    </div>
                </article>
            </div>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { ElMessage } from "element-plus";
import { useDesktopDownloads } from "~/composables/useDesktopDownloads";
import { useErpNavigationModules } from "~/composables/useErpNavigationModules";
import { useErpSidebarSections } from "~/composables/useErpSidebarSections";
import { canAccessConfigurationPath } from "~~/shared/utils/adminPermission";
import { downloadIsActive, installDesktopDownloadListener, disposeDesktopDownloadListener, syncDesktopDownloadAccount, type DesktopDownloadTask } from "~/utils/desktopDownloads";

const { visible, syncing, notice, tasks, directory, warning, available, open, close,
    chooseDirectory, resetDirectory, clearHistory, cancel, openFile, retry, canRetry } = useDesktopDownloads();
const router = useRouter();
const token = useState<string | null>("erp-desktop-token", () => null);
const adminInfo = useState<any>("admin_info", () => ({}));
const { visibleNavigationModules } = useErpNavigationModules();
const menus = useErpSidebarSections();
const sourcePaths = computed(() => {
    const paths = new Set<string>();
    for (const module of visibleNavigationModules.value) {
        paths.add(module.path);
        for (const section of menus.value[module.id]) {
            if (section.path) paths.add(section.path);
            for (const item of section.children || []) { if (item.path) paths.add(item.path); }
        }
    }
    return paths;
});
const busy = ref(new Set<string>());
let unlisten: UnlistenFn | undefined;
let stopSession: (() => void) | undefined;
let disposed = false;

function statusText(task: DesktopDownloadTask) {
    if (task.status === "processing") {
        if (task.stage === "generating") return "正在生成文件";
        return task.kind === "remote" ? "正在下载" : "正在保存";
    }
    return { waiting: "等待中", awaitingSave: "等待选择保存位置", saved: "已保存", cancelled: "已取消", failed: "失败", interrupted: "上次任务中断" }[task.status];
}
function bytes(value: number) {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
async function act(key: string, action: () => Promise<unknown>) {
    if (busy.value.has(key)) return;
    const activeToken = token.value;
    busy.value.add(key);
    try { await action(); }
    catch (error) { if (activeToken === token.value) ElMessage.error(error instanceof Error ? error.message : String(error)); }
    finally { busy.value.delete(key); }
}
function canOpenSource(path: string) {
    return available.value && sourcePaths.value.has(path)
        && canAccessConfigurationPath(Number(adminInfo.value?.role), path)
        && Boolean(router.resolve(path).matched.length);
}
async function returnToSource(path: string) {
    if (!canOpenSource(path)) { ElMessage.warning("当前账号已无法访问来源页面"); return; }
    try {
        // The existing route middleware rechecks access with the current account.
        const failure = await router.push(path);
        if (!failure) close();
    } catch { ElMessage.error("无法进入来源页面，请从当前模块菜单重新打开"); }
}
onMounted(async () => {
    try {
        await installDesktopDownloadListener();
        if (disposed) { disposeDesktopDownloadListener(); return; }
        unlisten = await listen("erp-open-download-center", open);
        if (disposed) { unlisten(); disposeDesktopDownloadListener(); return; }
        stopSession = watch(token, value => { void syncDesktopDownloadAccount(value).catch(() => undefined); }, { immediate: true, flush: "sync" });
        if (await invoke<boolean>("desktop_panel_ready", { panel: "downloads" }) && !disposed) open();
    } catch (error) { if (!disposed) notice.value = error instanceof Error ? error.message : String(error); }
});
onBeforeUnmount(() => { disposed = true; stopSession?.(); unlisten?.(); disposeDesktopDownloadListener(); });
</script>

<style scoped>
.download-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8PX; margin: 16PX 0 8PX; }
.download-directory { flex: 1; min-width: 180PX; overflow-wrap: anywhere; }
.download-list { max-height: min(60vh, 620PX); overflow-y: auto; }
.download-task { padding: 16PX 0; border-bottom: 1PX solid var(--el-border-color-lighter); }
.download-heading { display: flex; justify-content: space-between; gap: 16PX; }
.download-heading strong { overflow-wrap: anywhere; }
.download-heading > span { flex-shrink: 0; }
.download-meta, .download-hint, .download-notice { color: var(--el-text-color-secondary); font-size: 12PX; margin: 6PX 0; }
.download-path { overflow-wrap: anywhere; font-size: 12PX; margin-top: 6PX; }
.download-error { color: var(--el-color-danger); font-size: 12PX; margin-top: 6PX; }
.download-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8PX; margin-top: 10PX; }
.download-actions .el-button + .el-button { margin-left: 0; }
</style>
