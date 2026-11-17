<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import type { DesktopBusinessView } from "../app/types/desktopBusiness";

const view = ref<DesktopBusinessView | null>(null);
const error = ref("");
const startingRefresh = ref(false);
const refreshing = computed(() => startingRefresh.value || view.value?.refreshing);
const capturedAt = computed(() => view.value ? new Date(view.value.snapshot.capturedAt).toLocaleString("zh-CN", { hour12: false }) : "");
let disposed = false;
let readRevision = 0;
let unlisten: UnlistenFn | undefined;

async function readSnapshot() {
    const revision = ++readRevision;
    try {
        const result = await invoke<DesktopBusinessView>("desktop_business_snapshot");
        if (disposed || revision !== readRevision) return;
        view.value = result;
        error.value = "";
    } catch {
        if (disposed || revision !== readRevision) return;
        view.value = null;
        error.value = "此详情已不可用，请回到 ERP 主窗口重新打开。";
    }
}

async function refresh() {
    if (refreshing.value) return;
    startingRefresh.value = true;
    try {
        await invoke("refresh_desktop_business_window");
        await readSnapshot();
    } catch {
        error.value = "无法刷新详情，请回到主窗口核对登录状态。";
    } finally { startingRefresh.value = false; }
}

onMounted(async () => {
    try {
        const stop = await listen("erp-business-snapshot-changed", () => { void readSnapshot(); }, {
            target: { kind: "WebviewWindow", label: getCurrentWebviewWindow().label },
        });
        if (disposed) { stop(); return; }
        unlisten = stop;
        await readSnapshot();
    } catch { error.value = "详情窗口初始化失败，请关闭后重新打开。"; }
});

onBeforeUnmount(() => { disposed = true; readRevision += 1; unlisten?.(); });
</script>

<template>
    <div class="detail-window">
        <header>
            <div>
                <p class="eyebrow">ZH ERP · 只读详情</p>
                <h1>{{ view?.snapshot.title || '业务详情' }}</h1>
                <p class="subtitle">{{ view?.snapshot.subtitle }}</p>
            </div>
            <button type="button" :disabled="refreshing || !view" @click="refresh">{{ refreshing ? '正在刷新…' : '刷新详情' }}</button>
        </header>
        <div v-if="error || view?.error" class="notice" role="alert">{{ error || view?.error }}</div>
        <main v-if="view" :aria-busy="Boolean(refreshing)">
            <section v-for="(section, index) in view.snapshot.sections" :key="index">
                <h2>{{ section.title }}</h2>
                <dl v-if="section.fields?.length" class="fields">
                    <div v-for="(field, fieldIndex) in section.fields" :key="fieldIndex">
                        <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
                    </div>
                </dl>
                <div v-if="section.columns?.length" class="table-wrap">
                    <table>
                        <thead><tr><th v-for="(column, columnIndex) in section.columns" :key="columnIndex" scope="col">{{ column }}</th></tr></thead>
                        <tbody>
                            <tr v-for="(row, rowIndex) in section.rows" :key="rowIndex"><td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td></tr>
                            <tr v-if="!section.rows?.length"><td :colspan="section.columns.length" class="empty">暂无记录</td></tr>
                        </tbody>
                    </table>
                </div>
                <div v-if="section.images?.length" class="images"><img v-for="(image, imageIndex) in section.images" :key="imageIndex" :src="image.src" :alt="image.alt" loading="lazy" referrerpolicy="no-referrer"></div>
                <p v-if="!section.fields?.length && !section.columns?.length && !section.images?.length" class="empty">暂无内容</p>
            </section>
        </main>
        <p v-else-if="!error" class="loading" role="status">正在读取详情…</p>
        <footer><span v-if="capturedAt">最近获取：{{ capturedAt }}</span><span>编辑、审批及附件下载请在主窗口操作。</span></footer>
    </div>
</template>

<style>
* { box-sizing: border-box; }
html, body, #app { min-height: 100%; margin: 0; }
body { color: #253246; background: #f3f6fa; font: 14px/1.6 "Microsoft YaHei", "PingFang SC", system-ui, sans-serif; }
button { font: inherit; }
.detail-window { max-width: 1500px; margin: auto; padding: 26px 30px; }
header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 22px; }
.eyebrow { margin: 0 0 6px; color: #68798f; font-size: 12px; letter-spacing: .08em; }
h1 { margin: 0; font-size: 24px; line-height: 1.4; }
.subtitle { margin: 6px 0 0; color: #52677f; overflow-wrap: anywhere; }
button { flex-shrink: 0; padding: 9px 16px; border: 1px solid #235fa8; border-radius: 6px; color: #fff; background: #235fa8; cursor: pointer; }
button:hover { background: #194d8d; }
button:disabled { opacity: .5; cursor: default; }
button:focus-visible { outline: 3px solid #91b9ea; outline-offset: 3px; }
main { display: grid; gap: 18px; }
section { padding: 22px; border: 1px solid #dfe6ef; border-radius: 8px; background: #fff; min-width: 0; }
h2 { margin: 0 0 18px; font-size: 16px; }
.fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px 24px; margin: 0; }
dt { color: #738097; font-size: 12px; margin-bottom: 5px; }
dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.table-wrap { overflow-x: auto; }
table { min-width: 100%; border-collapse: collapse; text-align: left; }
th, td { padding: 11px 14px; border-bottom: 1px solid #e5ebf2; vertical-align: top; white-space: pre-wrap; overflow-wrap: anywhere; min-width: 90px; }
th { background: #f5f8fc; font-size: 12px; color: #5e7087; }
.images { display: flex; flex-wrap: wrap; gap: 16px; }
img { max-width: 320px; max-height: 220px; object-fit: contain; }
.notice { margin-bottom: 18px; padding: 12px 16px; border: 1px solid #eccd92; border-radius: 6px; background: #fff7e9; color: #825719; }
.empty, .loading { color: #7d8998; }
.loading { padding: 50px 0; text-align: center; }
footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; padding-top: 18px; color: #7a8798; font-size: 12px; }
@media (max-width: 760px) { .detail-window { padding: 20px 16px; } .fields { grid-template-columns: repeat(2, minmax(0, 1fr)); } section { padding: 18px; } }
@media (max-width: 500px) { .fields { grid-template-columns: 1fr; } }
</style>
