<template>
    <el-dialog v-model="desktopPrintVisible" title="打印中心" width="min(920px, calc(100vw - 32px))" append-to-body :close-on-click-modal="false" class="desktop-print-center">
        <div class="print-center">
            <p class="print-help">先预览，再提交。已提交仅表示系统接受任务；结果未知时请先核查系统打印队列。</p>
            <el-alert v-if="historyWarning" :title="historyWarning" type="warning" :closable="false" show-icon />
            <el-alert v-if="notice" :title="notice" type="warning" :closable="false" show-icon />
            <div v-if="!desktopPrintSessionReady" class="session-recovery">
                <p>{{ bindingSession ? '正在校验打印账号…' : bindError || (sessionToken ? '打印中心尚未就绪，请重新连接。' : '请先登录后使用打印中心。') }}</p>
                <el-button v-if="sessionToken" :loading="bindingSession" @click="bindPrintSession">重新连接打印中心</el-button>
            </div>
            <template v-else>
                <section class="print-settings" aria-label="打印设置">
                    <label>打印类型<select v-model="kind" :disabled="Boolean(desktopPrintRequest || sourceJob || draftId)" @change="loadPreference"><option value="sales">销售单据（A4）</option><option value="sku">SKU 标签</option><option value="sn">SN 标签（默认 50 × 30 mm）</option></select></label>
                    <label>打印机<select v-model="printerName" :disabled="Boolean(draftId)" @change="choosePaper"><option value="">请选择打印机</option><option v-for="printer in printers" :key="printer.name" :value="printer.name">{{ printer.name }}</option></select></label>
                    <label>实际纸型<select v-model="paperId" :disabled="Boolean(draftId)"><option value="">请选择实际纸型</option><option v-for="paper in papers" :key="paper.id" :value="paper.id">{{ paper.name }} · {{ number(paper.widthMm) }} × {{ number(paper.heightMm) }} mm</option></select></label>
                    <label>方向<select v-model="landscape" :disabled="Boolean(draftId)"><option :value="false">纵向</option><option :value="true">横向</option></select></label>
                    <label>份数<input v-model.number="copies" type="number" min="1" max="99" :disabled="Boolean(draftId)"></label>
                    <div class="settings-actions"><el-button :loading="loadingPrinters" @click="refreshPrinters">刷新打印机</el-button><el-button :disabled="!settings || Boolean(draftId)" @click="savePreference">保存此类配置</el-button></div>
                </section>
                <p v-if="printerName && !papers.length" class="print-help">打印机未提供可用纸型。请在系统打印机设置中安装驱动或添加实际纸型，再刷新；不会改用默认打印机。</p>
                <section v-if="desktopPrintRequest || sourceJob || draftId" class="current-print" aria-label="当前打印任务">
                    <strong>{{ desktopPrintRequest?.title || sourceJob?.document.title || stagedJob?.document.title }}</strong>
                    <p v-if="kind === 'sn'">此批次号码已冻结。首次登记只执行一次，后续重打不推进流水号。</p>
                    <div class="task-actions">
                        <el-button :disabled="!settings || busy" @click="preparePreview">{{ draftId ? (stagedJob?.message ? '重试预览' : '查看预览') : '生成预览' }}</el-button>
                        <el-button type="primary" :disabled="!draftId || busy || registrationUncertain" :loading="busy" @click="submit">确认提交</el-button>
                        <el-button :disabled="busy" @click="discard">取消当前任务</el-button>
                    </div>
                </section>
                <div class="history-heading"><strong>当前账号打印记录</strong><el-button text @click="refresh">刷新</el-button></div>
                <p v-if="!jobs.length" class="print-help">暂无打印记录。</p>
                <ul v-else class="print-jobs">
                    <li v-for="job in [...jobs].reverse()" :key="job.id">
                        <div class="job-info"><strong>{{ job.document.title }}</strong><span>{{ statusText(job.status) }} · {{ new Date(job.createdAt).toLocaleString() }}</span><span>{{ job.settings.printer }} · {{ job.settings.paper.name }} · {{ job.settings.copies }} 份</span><span v-if="job.parentId">重打原任务：{{ job.parentId }}</span><span v-if="job.message" class="job-message">{{ job.message }}</span><span v-if="job.document.snBatch">SN 登记：{{ registrationText(job.document.snBatch.registration) }} · {{ job.document.snBatch.codes[0] }} 至 {{ job.document.snBatch.codes.at(-1) }}</span></div>
                        <div class="job-actions">
                            <el-button size="small" :disabled="busy" @click="view(job)">预览</el-button>
                            <el-button v-if="job.document.snBatch?.registration === 'unknown' || job.document.snBatch?.registration === 'registering'" size="small" :disabled="busy" @click="confirmRegistration(job)">核查登记</el-button>
                            <el-button v-if="job.status === 'draft' && (!job.document.snBatch || job.document.snBatch.registration === 'registered')" size="small" :disabled="busy" @click="submitExisting(job)">提交</el-button>
                            <el-button v-if="['submitted', 'unknown', 'failed', 'cancelled'].includes(job.status)" size="small" :disabled="busy || Boolean(desktopPrintRequest)" @click="reprint(job)">明确重打</el-button>
                            <el-button v-if="['draft', 'waiting'].includes(job.status)" size="small" :disabled="busy" @click="cancel(job)">取消</el-button>
                            <el-button v-if="!['waiting', 'submitting'].includes(job.status)" size="small" :disabled="busy" @click="remove(job)">删除记录</el-button>
                        </div>
                    </li>
                </ul>
            </template>
        </div>
    </el-dialog>
</template>

<script setup lang="ts">
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isDesktop } from "~/utils/desktop";
import { desktopPrintCall, desktopPrintVisible, desktopPrintRequest, desktopPrintSessionReady, desktopPrintHasCurrent, DesktopPrintRegistrationRejected,
    type DesktopPrinter, type DesktopPrintJob, type DesktopPrintList, type DesktopPrintSettings, type PrintKind } from "~/utils/desktopPrint";

const token = useState<string | null>("erp-desktop-token", () => null);
const profileToken = useState<string | null>("auth_token", () => null);
const printers = ref<DesktopPrinter[]>([]);
const jobs = ref<DesktopPrintJob[]>([]);
const preferences = ref<DesktopPrintList["preferences"]>({});
const kind = ref<PrintKind>("sales");
const printerName = ref("");
const paperId = ref("");
const landscape = ref(false);
const copies = ref(1);
const sourceJob = ref<DesktopPrintJob | null>(null);
const draftId = ref("");
const busy = ref(false);
const loadingPrinters = ref(false);
const notice = ref("");
const historyWarning = ref("");
const bindError = ref("");
const bindingSession = ref(false);
const sessionToken = computed(() => token.value && token.value === profileToken.value ? token.value : null);
let disposed = false;
let sessionRevision = 0;
let bindingPromise: Promise<boolean> | null = null;
let unlistenMenu: UnlistenFn | undefined;
let unlistenChanged: UnlistenFn | undefined;
const papers = computed(() => printers.value.find((printer) => printer.name === printerName.value)?.papers || []);
const settings = computed<DesktopPrintSettings | null>(() => {
    const paper = papers.value.find((entry) => entry.id === paperId.value);
    if (!printerName.value || !paper || !Number.isInteger(copies.value) || copies.value < 1 || copies.value > 99) return null;
    return { printer: printerName.value, paper: { ...paper }, landscape: landscape.value, copies: copies.value };
});
const stagedJob = computed(() => jobs.value.find((job) => job.id === draftId.value));
const registrationUncertain = computed(() => ["registering", "unknown", "rejected"].includes(stagedJob.value?.document.snBatch?.registration || ""));
const number = (value: number) => Number(value.toFixed(1));
const statuses: Record<string, string> = { draft: "待确认", waiting: "排队中", submitting: "提交中", submitted: "系统已接受", failed: "未提交", unknown: "结果未知", cancelled: "已取消" };
const registrations: Record<string, string> = { pending: "尚未登记", registering: "登记结果待核查", unknown: "登记结果待核查", registered: "已确认登记", rejected: "服务器已拒绝，请重新生成" };
const statusText = (status: string) => statuses[status] || status;
const registrationText = (status: string) => registrations[status] || status;
const fail = (error: unknown) => { notice.value = error instanceof Error ? error.message : String(error); };

async function refresh() {
    if (!desktopPrintSessionReady.value) return;
    const revision = sessionRevision;
    try {
        const data = await desktopPrintCall<DesktopPrintList>("desktop_print_list");
        if (disposed || revision !== sessionRevision) return;
        jobs.value = data.jobs;
        preferences.value = data.preferences;
        historyWarning.value = data.warning;
    } catch (error) { if (revision === sessionRevision) fail(error); }
}

function choosePaper() {
    const preferred = desktopPrintRequest.value?.preferredSize || (kind.value === "sales" ? { widthMm: 210, heightMm: 297 } : kind.value === "sn" ? { widthMm: 50, heightMm: 30 } : null);
    paperId.value = preferred ? papers.value.find((paper) => Math.abs(paper.widthMm - preferred.widthMm) < 0.2 && Math.abs(paper.heightMm - preferred.heightMm) < 0.2)?.id || "" : "";
}

function applySettings(value: DesktopPrintSettings) {
    printerName.value = value.printer;
    paperId.value = papers.value.some((paper) => paper.id === value.paper.id
        && Math.abs(paper.widthMm - value.paper.widthMm) < 0.2 && Math.abs(paper.heightMm - value.paper.heightMm) < 0.2) ? value.paper.id : "";
    landscape.value = value.landscape;
    copies.value = value.copies;
}

function loadPreference() {
    const saved = preferences.value[kind.value];
    if (saved) { applySettings(saved); return; }
    printerName.value = "";
    paperId.value = "";
    landscape.value = false;
    copies.value = 1;
    choosePaper();
}

async function refreshPrinters() {
    const revision = sessionRevision;
    loadingPrinters.value = true;
    try {
        const result = await desktopPrintCall<DesktopPrinter[]>("desktop_print_printers");
        if (revision === sessionRevision) printers.value = result;
    }
    catch (error) { if (revision === sessionRevision) fail(error); }
    finally { if (revision === sessionRevision) loadingPrinters.value = false; }
}

async function savePreference() {
    if (!settings.value) return;
    const revision = sessionRevision;
    try {
        await desktopPrintCall("desktop_print_settings", { kind: kind.value, settings: settings.value });
        if (revision !== sessionRevision) return;
        await refresh();
        if (revision === sessionRevision) notice.value = "已保存当前账号、当前环境的打印配置。";
    } catch (error) { if (revision === sessionRevision) fail(error); }
}

async function preparePreview() {
    if (!settings.value || busy.value) return;
    busy.value = true;
    notice.value = "";
    const revision = sessionRevision;
    try {
        if (!draftId.value) {
            let preparedId = "";
            if (sourceJob.value) preparedId = await desktopPrintCall<string>("desktop_print_reprint", { id: sourceJob.value.id, settings: settings.value });
            else if (desktopPrintRequest.value) {
                const request = desktopPrintRequest.value;
                const selected = structuredClone(toRaw(settings.value));
                const pages = await request.buildPages(selected);
                if (revision !== sessionRevision) return;
                preparedId = await desktopPrintCall<string>("desktop_print_prepare", {
                    document: { kind: request.kind, title: request.title, sourceIds: [...request.sourceIds], pages, snBatch: request.snBatch ? { ...request.snBatch, codes: [...request.snBatch.codes] } : null },
                    settings: selected,
                });
            }
            if (revision !== sessionRevision) return;
            draftId.value = preparedId;
        }
        if (revision !== sessionRevision || !draftId.value) return;
        await desktopPrintCall("desktop_print_preview", { id: draftId.value, retry: true });
        await refresh();
    } catch (error) { if (revision === sessionRevision) fail(error); }
    finally { if (revision === sessionRevision) busy.value = false; }
}

async function submit() {
    if (!draftId.value || busy.value) return;
    busy.value = true;
    const id = draftId.value;
    const revision = sessionRevision;
    try {
        const job = stagedJob.value;
        if (job?.document.snBatch?.registration === "pending") {
            const register = desktopPrintRequest.value?.register;
            if (!register) throw new Error("此 SN 批次尚未登记，请取消后从产品页面重新创建。");
            await desktopPrintCall("desktop_print_registration", { id, action: "start" });
            if (revision !== sessionRevision) return;
            try {
                await register();
                if (revision !== sessionRevision) return;
                await desktopPrintCall("desktop_print_registration", { id, action: "confirm" });
            } catch (error) {
                const rejected = error instanceof DesktopPrintRegistrationRejected;
                if (revision === sessionRevision) await desktopPrintCall("desktop_print_registration", { id, action: rejected ? "reject" : "unknown" }).catch(() => {});
                if (rejected) throw new Error(`服务器拒绝此冻结批次，请取消后重新生成。${error.message}`);
                throw new Error(`SN 登记结果需核查，不会自动重复登记。${error instanceof Error ? error.message : String(error)}`);
            }
        }
        if (revision !== sessionRevision) return;
        await desktopPrintCall("desktop_print_submit", { id });
        if (revision !== sessionRevision) return;
        clearCurrent();
        notice.value = "任务已进入打印队列，请以记录中的系统提交状态为准。";
    } catch (error) { if (revision === sessionRevision) fail(error); }
    finally { if (revision === sessionRevision) { busy.value = false; await refresh(); } }
}

function clearCurrent() { draftId.value = ""; sourceJob.value = null; desktopPrintRequest.value = null; desktopPrintHasCurrent.value = false; }
async function discard() {
    const revision = sessionRevision;
    if (draftId.value) {
        try { await desktopPrintCall("desktop_print_cancel", { id: draftId.value, remove: false }); }
        catch (error) { if (revision === sessionRevision) fail(error); return; }
    }
    if (revision !== sessionRevision) return;
    clearCurrent();
    await refresh();
}
async function view(job: DesktopPrintJob) {
    const revision = sessionRevision;
    try { await desktopPrintCall("desktop_print_preview", { id: job.id, retry: true }); } catch (error) { if (revision === sessionRevision) fail(error); }
}
async function submitExisting(job: DesktopPrintJob) {
    if (busy.value) return;
    const revision = sessionRevision;
    busy.value = true;
    try {
        await desktopPrintCall("desktop_print_submit", { id: job.id });
        if (revision !== sessionRevision) return;
        if (draftId.value === job.id) clearCurrent();
        await refresh();
    }
    catch (error) { if (revision === sessionRevision) fail(error); }
    finally { if (revision === sessionRevision) busy.value = false; }
}
async function reprint(job: DesktopPrintJob) {
    if (desktopPrintHasCurrent.value) { notice.value = "请先完成或取消当前任务。"; return; }
    const revision = sessionRevision;
    try { await ElMessageBox.confirm("重打会再次输出原内容及原 SN 号码。若提交结果未知，请先核实系统队列和实际纸张，避免重复标签。", "确认重打", { confirmButtonText: "准备重打", cancelButtonText: "取消", type: "warning" }); }
    catch { return; }
    if (revision !== sessionRevision || desktopPrintHasCurrent.value) return;
    desktopPrintHasCurrent.value = true;
    sourceJob.value = job;
    kind.value = job.document.kind;
    applySettings(job.settings);
    notice.value = "请选择可用打印机和纸型，生成预览后再确认提交。";
}
async function confirmRegistration(job: DesktopPrintJob) {
    const revision = sessionRevision;
    try { await ElMessageBox.confirm("此操作会读取服务器流水状态。请先人工核实此批次确已登记；流水已推进不一定能证明本次请求成功。确认后仅允许打印原冻结号码，不会再次登记。", "核查 SN 登记", { confirmButtonText: "已核实，校验并确认", cancelButtonText: "暂不确认", type: "warning" }); }
    catch { return; }
    if (revision !== sessionRevision) return;
    try { await desktopPrintCall("desktop_print_registration", { id: job.id, action: "confirm" }); if (revision === sessionRevision) await refresh(); }
    catch (error) { if (revision === sessionRevision) fail(error); }
}
async function cancel(job: DesktopPrintJob) {
    const revision = sessionRevision;
    try {
        await desktopPrintCall("desktop_print_cancel", { id: job.id, remove: false });
        if (revision !== sessionRevision) return;
        if (draftId.value === job.id) clearCurrent();
        await refresh();
    } catch (error) { if (revision === sessionRevision) fail(error); }
}
async function remove(job: DesktopPrintJob) {
    const revision = sessionRevision;
    try { await ElMessageBox.confirm("删除本地记录后不能从打印中心重打。此操作不会取消系统队列中可能存在的任务。", "删除打印记录", { confirmButtonText: "删除记录", cancelButtonText: "保留" }); } catch { return; }
    if (revision !== sessionRevision) return;
    try {
        await desktopPrintCall("desktop_print_cancel", { id: job.id, remove: true });
        if (revision !== sessionRevision) return;
        if (draftId.value === job.id) clearCurrent();
        await refresh();
    } catch (error) { if (revision === sessionRevision) fail(error); }
}

watch(desktopPrintRequest, (request) => { if (request) { kind.value = request.kind; sourceJob.value = null; loadPreference(); } });
watch(desktopPrintVisible, async (visible) => {
    if (!visible) return;
    const revision = sessionRevision;
    const alreadyReady = desktopPrintSessionReady.value;
    if (!await bindPrintSession() || revision !== sessionRevision) return;
    if (!alreadyReady) return;
    const selection = JSON.stringify([printerName.value, paperId.value, landscape.value, copies.value]);
    await Promise.all([refresh(), refreshPrinters()]);
    if (revision !== sessionRevision || !desktopPrintVisible.value) return;
    if (!sourceJob.value && !draftId.value && selection === JSON.stringify([printerName.value, paperId.value, landscape.value, copies.value])) loadPreference();
});
function bindPrintSession(): Promise<boolean> {
    if (disposed || !import.meta.client || !isDesktop()) return Promise.resolve(false);
    if (desktopPrintSessionReady.value) return Promise.resolve(true);
    if (bindingPromise) return bindingPromise;
    const revision = sessionRevision;
    const current = sessionToken.value;
    bindingSession.value = true;
    bindError.value = "";
    const pending = (async () => {
        try {
            await desktopPrintCall("desktop_print_bind_session", { token: current });
            if (disposed || revision !== sessionRevision) return false;
            if (current) {
                const data = await desktopPrintCall<DesktopPrintList>("desktop_print_list");
                if (disposed || revision !== sessionRevision) return false;
                jobs.value = data.jobs;
                preferences.value = data.preferences;
                historyWarning.value = data.warning;
                desktopPrintSessionReady.value = true;
                if (desktopPrintVisible.value) await refreshPrinters();
                if (disposed || revision !== sessionRevision) return false;
                if (!desktopPrintHasCurrent.value) loadPreference();
            }
            return Boolean(current);
        } catch (error) {
            if (!disposed && revision === sessionRevision) {
                desktopPrintSessionReady.value = false;
                bindError.value = error instanceof Error ? error.message : String(error);
            }
            return false;
        } finally {
            if (!disposed && revision === sessionRevision) {
                bindingSession.value = false;
                bindingPromise = null;
            }
        }
    })();
    bindingPromise = pending;
    return pending;
}

function openCenter() {
    desktopPrintVisible.value = true;
    if (!desktopPrintSessionReady.value) void bindPrintSession();
}

watch([token, profileToken], () => {
    if (!import.meta.client || !isDesktop()) return;
    sessionRevision++;
    bindingPromise = null;
    desktopPrintSessionReady.value = false;
    clearCurrent(); jobs.value = []; preferences.value = {}; notice.value = ""; historyWarning.value = ""; bindError.value = "";
    busy.value = false; loadingPrinters.value = false;
    void bindPrintSession();
}, { immediate: true, flush: "sync" });

onMounted(async () => {
    if (!isDesktop()) return;
    try {
        unlistenMenu = await listen("erp-open-print-center", openCenter, { target: { kind: "WebviewWindow", label: "erp" } });
        if (disposed) { unlistenMenu(); return; }
        unlistenChanged = await listen("erp-print-changed", () => void refresh(), { target: { kind: "WebviewWindow", label: "erp" } });
        if (disposed) { unlistenChanged(); return; }
        if (await desktopPrintCall<boolean>("desktop_panel_ready", { panel: "print" }) && !disposed) openCenter();
    } catch (error) { fail(error); }
});
onBeforeUnmount(() => { disposed = true; sessionRevision++; unlistenMenu?.(); unlistenChanged?.(); desktopPrintSessionReady.value = false; clearCurrent(); });
</script>

<style scoped>
.print-center { color: var(--el-text-color-primary); font-size: 14PX; line-height: 1.5; }
.print-help { color: var(--el-text-color-secondary); margin: 0 0 14PX; }
.print-center :deep(.el-alert) { margin-bottom: 12PX; overflow-wrap: anywhere; }
.print-settings { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12PX; margin: 16PX 0; }
.print-settings label { display: flex; flex-direction: column; gap: 6PX; }
.print-settings select, .print-settings input { height: 34PX; min-width: 0; border: 1PX solid var(--el-border-color); border-radius: 4PX; padding: 0 8PX; background: var(--el-bg-color); color: inherit; font-size: 13PX; }
.settings-actions { display: flex; flex-wrap: wrap; align-items: end; gap: 8PX; }
.settings-actions :deep(.el-button + .el-button) { margin-left: 0; }
.current-print { padding: 14PX; margin-bottom: 18PX; border: 1PX solid var(--el-border-color); border-radius: 6PX; background: var(--el-fill-color-light); }
.current-print p { margin: 8PX 0; font-size: 13PX; }
.task-actions { display: flex; flex-wrap: wrap; gap: 8PX; margin-top: 10PX; }
.task-actions :deep(.el-button + .el-button) { margin-left: 0; }
.history-heading { display: flex; justify-content: space-between; align-items: center; }
.print-jobs { list-style: none; padding: 0; margin: 8PX 0 0; max-height: 360PX; overflow: auto; }
.print-jobs li { display: flex; justify-content: space-between; gap: 12PX; padding: 12PX 0; border-top: 1PX solid var(--el-border-color-lighter); }
.job-info { display: flex; flex: 1; min-width: 0; flex-direction: column; gap: 3PX; overflow-wrap: anywhere; }
.job-info span { font-size: 12PX; color: var(--el-text-color-secondary); }
.job-info .job-message { color: var(--el-color-warning); }
.job-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-content: flex-start; gap: 6PX; max-width: 225PX; }
.job-actions :deep(.el-button + .el-button) { margin-left: 0; }
@media (max-width: 680PX) { .print-settings { grid-template-columns: repeat(2, minmax(0, 1fr)); } .print-jobs li { flex-direction: column; } .job-actions { max-width: none; justify-content: flex-start; } }
</style>
