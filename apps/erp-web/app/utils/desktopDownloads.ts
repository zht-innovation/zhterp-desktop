import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { computed, ref, shallowRef, type Ref } from "vue";

export type DesktopDownloadStatus = "waiting" | "processing" | "awaitingSave" | "saved" | "cancelled" | "failed" | "interrupted";
export interface DesktopDownloadTask {
    id: string;
    name: string;
    kind: "remote" | "local";
    status: DesktopDownloadStatus;
    createdAt: number;
    transferred: number;
    total: number | null;
    error: string | null;
    stage: "generating" | "queued" | "saving" | "downloading" | null;
    canRetry: boolean;
    sourcePage: string | null;
    path: string | null;
}
interface DownloadSnapshot {
    scope: string;
    directory: string | null;
    tasks: DesktopDownloadTask[];
    warning: string | null;
}
interface CachedBlob { blob: Blob; sourcePage: string | null; active: boolean }

export const MAX_DESKTOP_DOWNLOAD_BYTES = 128 * 1024 * 1024;
const emptySnapshot = (): DownloadSnapshot => ({ scope: "", directory: null, tasks: [], warning: null });
const state = shallowRef<DownloadSnapshot>(emptySnapshot());
const visible = ref(false);
const syncing = ref(false);
const notice = ref("");
const cachedBlobs = new Map<string, CachedBlob>();
let session: Ref<string | null> | undefined;
let currentToken = "";
let generation = 0;
let pendingSync: Promise<void> | undefined;
let listener: UnlistenFn | undefined;

export function bindDesktopDownloadSession(token: Ref<string | null>) { session = token; }
export function downloadIsActive(task: DesktopDownloadTask) {
    return task.status === "waiting" || task.status === "processing" || task.status === "awaitingSave";
}
function message(error: unknown) { return error instanceof Error ? error.message : String(error); }
function sourcePage() {
    const path = window.location.hash.replace(/^#/, "").split(/[?#]/)[0] || window.location.pathname;
    return path.startsWith("/configuration/") && path.length <= 240 ? path : null;
}
function filename(value: string) { return value.split(/[/\\]/).pop() || "下载文件"; }
function acceptSnapshot(snapshot: DownloadSnapshot) {
    state.value = snapshot;
    for (const [id, cached] of cachedBlobs) {
        const task = snapshot.tasks.find(item => item.id === id);
        if (task?.status === "saved" || (!task && !cached.active)) cachedBlobs.delete(id);
    }
}

// Only the globally mounted panel installs listeners. Settings share these refs and actions.
export async function installDesktopDownloadListener() {
    if (listener) return;
    listener = await listen<DownloadSnapshot>("erp-downloads-changed", event => {
        if (event.payload.scope && event.payload.scope === state.value.scope) acceptSnapshot(event.payload);
    });
}
export function disposeDesktopDownloadListener() { listener?.(); listener = undefined; }

export function syncDesktopDownloadAccount(value: string | null): Promise<void> {
    const token = value || "";
    if (token === currentToken && pendingSync) return pendingSync;
    if (token === currentToken && state.value.scope) return Promise.resolve();
    const revision = ++generation;
    const switched = Boolean(currentToken && currentToken !== token);
    currentToken = token;
    state.value = emptySnapshot();
    cachedBlobs.clear();
    notice.value = "";
    syncing.value = true;
    if (switched) visible.value = false;
    const operation = invoke<DownloadSnapshot>("sync_download_account", { token: token || null })
        .then(snapshot => { if (revision === generation) acceptSnapshot(snapshot); })
        .catch(error => {
            if (revision === generation) notice.value = message(error);
            throw error;
        })
        .finally(() => {
            if (revision === generation) { syncing.value = false; pendingSync = undefined; }
        });
    pendingSync = operation;
    return operation;
}

async function account() {
    const token = session?.value || "";
    if (!token) throw new Error("请先登录后再操作下载任务");
    await syncDesktopDownloadAccount(token);
    if (session?.value !== token || currentToken !== token || !state.value.scope) throw new Error("下载账号已变化，请重试");
    return { token, revision: generation };
}
function current(token: string, revision: number) {
    return revision === generation && token === currentToken && token === session?.value;
}
function isCancelled(id: string) { return state.value.tasks.find(task => task.id === id)?.status === "cancelled"; }
function rememberBlob(id: string, blob: Blob, page: string | null) {
    let retained = 0;
    for (const value of cachedBlobs.values()) retained += value.blob.size;
    for (const [key, value] of cachedBlobs) {
        if (retained + blob.size <= MAX_DESKTOP_DOWNLOAD_BYTES) break;
        if (!value.active) { cachedBlobs.delete(key); retained -= value.blob.size; }
    }
    if (retained + blob.size > MAX_DESKTOP_DOWNLOAD_BYTES) throw new Error("本地导出正在处理中，请完成后重试");
    cachedBlobs.set(id, { blob, sourcePage: page, active: true });
}
async function encodeBlob(blob: Blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let start = 0; start < bytes.length; start += 32768) {
        binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
    }
    return btoa(binary);
}

export async function generateDesktopDownload(name: string, generate: () => Blob | Promise<Blob>, page = sourcePage()): Promise<boolean> {
    const owner = session?.value;
    const { token, revision } = await account();
    if (owner !== token) return false;
    const request = { id: crypto.randomUUID(), name: filename(name), sourcePage: page };
    await invoke("prepare_local_download", { token, request });
    try {
        if (!current(token, revision) || isCancelled(request.id)) return false;
        const blob = await generate();
        if (!current(token, revision) || isCancelled(request.id)) return false;
        if (blob.size > MAX_DESKTOP_DOWNLOAD_BYTES) throw new Error("数据超过桌面客户端 128 MB 大小限制");
        rememberBlob(request.id, blob, page);
        const body = await encodeBlob(blob);
        if (!current(token, revision) || isCancelled(request.id)) return false;
        const saved = await invoke<boolean>("save_download_file", { token, request, body });
        if (saved) cachedBlobs.delete(request.id);
        return saved;
    } catch (error) {
        if (!current(token, revision) || isCancelled(request.id)) return false;
        await invoke("fail_local_download", { token, id: request.id }).catch(() => undefined);
        throw error;
    } finally {
        const cached = cachedBlobs.get(request.id);
        if (cached) cached.active = false;
    }
}

export function saveDesktopDownload(blob: Blob, name: string) {
    return generateDesktopDownload(name, () => blob);
}
export async function downloadDesktopAttachment(path: string, name: string): Promise<boolean> {
    const owner = session?.value;
    const page = sourcePage();
    const { token } = await account();
    if (owner !== token) return false;
    return invoke<boolean>("download_remote_file", {
        token, request: { id: crypto.randomUUID(), name: filename(name), path, sourcePage: page },
    });
}

async function chooseDirectory(reset = false) {
    const { token, revision } = await account();
    const snapshot = await invoke<DownloadSnapshot>("set_download_directory", { token, reset });
    if (current(token, revision)) acceptSnapshot(snapshot);
}
async function clearHistory() {
    const { token, revision } = await account();
    const snapshot = await invoke<DownloadSnapshot>("clear_download_history", { token });
    if (current(token, revision)) acceptSnapshot(snapshot);
}
async function cancel(id: string) {
    const { token } = await account();
    await invoke("cancel_download_task", { token, id });
}
async function openFile(id: string, reveal = false) {
    const { token } = await account();
    await invoke("open_download_task", { token, id, reveal });
}
async function retry(task: DesktopDownloadTask) {
    const { token } = await account();
    if (task.kind === "remote") return invoke<boolean>("retry_download_task", { token, id: task.id });
    const cached = cachedBlobs.get(task.id);
    if (!cached) throw new Error("此导出内容已释放，请回到来源页面重新导出");
    cachedBlobs.delete(task.id);
    return generateDesktopDownload(task.name, () => cached.blob, cached.sourcePage);
}

export const desktopDownloads = {
    visible, syncing, notice,
    tasks: computed(() => state.value.tasks),
    directory: computed(() => state.value.directory),
    warning: computed(() => state.value.warning),
    available: computed(() => Boolean(state.value.scope && currentToken)),
    open() { visible.value = true; },
    close() { visible.value = false; },
    chooseDirectory: () => chooseDirectory(false),
    resetDirectory: () => chooseDirectory(true),
    clearHistory, cancel, openFile, retry,
    canRetry: (task: DesktopDownloadTask) => task.kind === "remote" ? task.canRetry : cachedBlobs.has(task.id),
};
