import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { retrieveAdminProfile } from "~/composables/api/useAdminApi";
import { retrieveSalesOrderList, type SalesOrderRetrieveParams } from "~/composables/api/useCustomerApi";
import { getInventoryProductDetail } from "~/composables/api/useInventoryApi";
import { getPurchaseOrderDetail } from "~/composables/api/usePurchaseOrderApi";
import { useErpNavigationModules } from "~/composables/useErpNavigationModules";
import { clearAdminSession } from "~/utils/auth";
import { productDetailSnapshot, purchaseDetailSnapshot, salesDetailSnapshot } from "~/utils/desktopBusinessSnapshot";
import { canAccessConfigurationPath } from "~~/shared/utils/adminPermission";
import type { DesktopBusinessKind, DesktopBusinessRequest, DesktopDetailSnapshot } from "~/types/desktopBusiness";

type OpenWindow = (kind: DesktopBusinessKind, id: string) => Promise<void>;
let openWindow: OpenWindow | undefined;

// The bridge owns all API work and lifecycle watchers. Detail components only
// supply a resource kind and ID; they cannot supply a route or raw snapshot.
export function openDesktopBusinessWindow(kind: DesktopBusinessKind, id: string): Promise<void> {
    if (!openWindow) return Promise.reject(new Error("独立窗口尚未就绪，请稍后重试。"));
    return openWindow(kind, id);
}

class UnavailableDetail extends Error {}
class ChangedSession extends Error {}

function errorStatus(error: unknown): number {
    const failure = error as { status?: number; statusCode?: number; response?: { status?: number } };
    return Number(failure?.statusCode || failure?.status || failure?.response?.status || 0);
}

// Mount exactly once in the desktop main app, outside NuxtPage/NuxtLayout.
export function useDesktopBusinessWindowsBridge() {
    const nuxt = useNuxtApp();
    const adminInfo = useState<any>("admin_info", () => ({}));
    const token = useState<string | null>("erp-desktop-token", () => null);
    const profileToken = useState<string | null>("auth_token", () => null);
    const { visibleNavigationModules } = useErpNavigationModules();
    const profileSyncedAt = useState<number>("admin_profile_synced_at", () => 0);
    const username = computed(() => String(adminInfo.value?.username || ""));
    const eligible = computed(() => Boolean(token.value && token.value === profileToken.value && username.value));
    const fingerprint = computed(() => JSON.stringify({
        token: eligible.value ? token.value : null,
        username: eligible.value ? username.value : "",
        role: adminInfo.value?.role,
        departmentId: adminInfo.value?.departmentId,
        canManageApprovalFlow: adminInfo.value?.canManageApprovalFlow,
        canAuditSalesOrder: adminInfo.value?.canAuditSalesOrder,
        canAuditSalesReceipt: adminInfo.value?.canAuditSalesReceipt,
        canAuditBorrowRequest: adminInfo.value?.canAuditBorrowRequest,
        modules: visibleNavigationModules.value.map(module => module.id),
    }));
    let disposed = false;
    let pageGeneration = 0;
    let revision = 0;
    let generation: number | null = null;
    let pendingSession: Promise<void> | null = null;
    let initializing: Promise<void> | null = null;
    let initialized = false;
    let stopWatching: (() => void) | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let polling = false;
    let hasOpenedWindow = false;
    const listeners: UnlistenFn[] = [];
    const labels = new Set<string>();
    const openings = new Map<string, Promise<void>>();

    function assertCurrent(expected: number) {
        if (disposed || expected !== revision || !eligible.value) {
            throw new ChangedSession("账号或权限已变更，请重新打开详情。");
        }
    }

    function invalidateSession() {
        revision += 1;
        generation = null;
        pendingSession = null;
        hasOpenedWindow = false;
        labels.clear();
    }

    function syncSession(): Promise<void> {
        invalidateSession();
        const expected = revision;
        const operation = invoke<number>("sync_desktop_business_session", {
            pageGeneration, revision: expected,
            username: eligible.value ? username.value : null,
        }).then(value => {
            if (disposed || expected !== revision) throw new ChangedSession("账号或权限已变更，请重新打开详情。");
            generation = value;
        });
        pendingSession = operation;
        void operation.finally(() => {
            if (pendingSession === operation) pendingSession = null;
        }).catch(() => {});
        return operation;
    }

    async function verifyProfile(expected: number) {
        assertCurrent(expected);
        const response = await nuxt.runWithContext(() => retrieveAdminProfile()());
        assertCurrent(expected);
        if (response.code !== 200 || !response.data?.user) throw new Error("无法核对当前账号权限，请稍后重试。");
        if (response.data.user.username !== username.value) {
            void nuxt.runWithContext(clearAdminSession);
            throw new ChangedSession("当前账号已变更，请重新登录。");
        }
        // Reuse the same profile state as the existing menus and middleware.
        // The synchronous watcher closes snapshots before any changed role can
        // accept an old response, including changes to department/field access.
        adminInfo.value = { ...adminInfo.value, ...response.data.user };
        profileSyncedAt.value = Date.now();
        assertCurrent(expected);
    }

    function canReadModule(kind: DesktopBusinessKind): boolean {
        const paths = {
            sales: "/configuration/sales/order",
            purchase: "/configuration/purchase/order",
            product: "/configuration/inventory/basic-data/product",
        };
        const moduleId = kind === "product" ? "inventory" : kind;
        return visibleNavigationModules.value.some(module => module.id === moduleId)
            && canAccessConfigurationPath(Number(adminInfo.value?.role), paths[kind]);
    }

    function canReadSalesApproval(): boolean {
        return Boolean(adminInfo.value?.canAuditSalesOrder)
            && visibleNavigationModules.value.some(module => module.id === "approval")
            && canAccessConfigurationPath(Number(adminInfo.value?.role), "/configuration/approval/order");
    }

    async function fetchSnapshot(kind: DesktopBusinessKind, id: string, expected: number): Promise<DesktopDetailSnapshot> {
        assertCurrent(expected);
        const moduleAllowed = canReadModule(kind);
        const approvalAllowed = kind === "sales" && canReadSalesApproval();
        if (!moduleAllowed && !approvalAllowed) throw new UnavailableDetail("该详情已不可访问。");
        const role = Number(adminInfo.value?.role);
        if (kind === "purchase") {
            const response = await nuxt.runWithContext(() => getPurchaseOrderDetail({ id }));
            assertCurrent(expected);
            if (response.code !== 200 || !response.data
                || String(response.data.id || response.data._id) !== id) throw new UnavailableDetail("采购单不存在或已不可访问。");
            return purchaseDetailSnapshot(response.data, role);
        }
        if (kind === "product") {
            const response = await nuxt.runWithContext(() => getInventoryProductDetail({ id }));
            assertCurrent(expected);
            if (response.code !== 200 || !response.data?.detail || String(response.data.detail._id) !== id) {
                throw new UnavailableDetail("产品不存在或已不可访问。");
            }
            return productDetailSnapshot(response.data.detail, role);
        }
        // Every lookup keeps the existing list's own salesperson/draft/approval
        // scope. The server adds the ID as an AND condition, never findById.
        const readSales = async (extra: SalesOrderRetrieveParams = {}) => {
            try {
                const response: any = await nuxt.runWithContext(() => retrieveSalesOrderList()({ id, page: 1, limit: 1, ...extra }));
                assertCurrent(expected);
                if ([403, 404].includes(Number(response?.code))) return undefined;
                if (response?.code !== 200) throw new Error(response?.msg || "获取订单详情失败。");
                return Array.isArray(response.data?.list)
                    ? response.data.list.find((order: any) => String(order._id || order.id) === id) : undefined;
            } catch (error) {
                assertCurrent(expected);
                // A scope may deny an otherwise valid approver. Only try other
                // already-authorized scopes; authentication/network errors still fail.
                if ([403, 404].includes(errorStatus(error))) return undefined;
                throw error;
            }
        };
        let order;
        if (moduleAllowed) {
            order = await readSales();
            if (!order) order = await readSales({ draftOnly: true });
        }
        if (!order && approvalAllowed) order = await readSales({ approvalOnly: true, approvalResult: "all" });
        if (!order) throw new UnavailableDetail("销售订单不存在或已不可访问。");
        return salesDetailSnapshot(order);
    }

    function expireSession(expected: number, error: unknown) {
        if (expected === revision && errorStatus(error) === 401) {
            void nuxt.runWithContext(clearAdminSession);
        }
    }

    async function updateRequest(request: DesktopBusinessRequest, expected: number, verify = true) {
        if (request.generation !== generation || expected !== revision) return;
        try {
            if (verify) await verifyProfile(expected);
            const snapshot = await fetchSnapshot(request.kind, request.id, expected);
            assertCurrent(expected);
            await invoke("update_desktop_business_window", { request, snapshot, revoked: false });
        } catch (error) {
            expireSession(expected, error);
            if (disposed || expected !== revision || error instanceof ChangedSession) return;
            const revoked = error instanceof UnavailableDetail || [403, 404].includes(errorStatus(error));
            await invoke("update_desktop_business_window", { request, snapshot: null, revoked }).catch(() => {});
        }
    }

    const open: OpenWindow = (kind, rawId) => {
        const id = rawId.trim().toLowerCase();
        if (!/^[a-f\d]{24}$/i.test(id)) return Promise.reject(new Error("无法识别该记录，请刷新主窗口后重试。"));
        const key = `${kind}:${id}`;
        const pending = openings.get(key);
        if (pending) return pending;
        const requestedFingerprint = fingerprint.value;
        const operation = (async () => {
            await ensureReady();
            if (requestedFingerprint !== fingerprint.value) throw new ChangedSession("账号或权限已变更，请重新打开详情。");
            const expected = revision;
            assertCurrent(expected);
            if (generation === null) throw new Error("独立窗口会话尚未就绪，请稍后重试。");
            const nativeGeneration = generation;
            try {
                await verifyProfile(expected);
                const snapshot = await fetchSnapshot(kind, id, expected);
                assertCurrent(expected);
                const label = await invoke<string>("open_desktop_business_window", { generation: nativeGeneration, kind, id, snapshot });
                if (expected === revision && !disposed) {
                    labels.add(label);
                    hasOpenedWindow = true;
                }
            } catch (error) {
                expireSession(expected, error);
                throw error;
            }
        })();
        openings.set(key, operation);
        void operation.finally(() => { if (openings.get(key) === operation) openings.delete(key); }).catch(() => {});
        return operation;
    };

    async function revalidateWindows() {
        // Keep asking native state after the first open. A window may finish
        // opening while a preceding list request is in flight; a cached empty
        // label set must not permanently stop permission revalidation.
        if (disposed || polling || !hasOpenedWindow || generation === null || !eligible.value) return;
        polling = true;
        const expected = revision;
        let requests: DesktopBusinessRequest[] = [];
        try {
            requests = await invoke<DesktopBusinessRequest[]>("list_desktop_business_windows", { generation });
            assertCurrent(expected);
            labels.clear();
            for (const request of requests) labels.add(request.label);
            if (!requests.length) return;
            await verifyProfile(expected);
            // Exact existing read APIs also recheck record-level visibility,
            // which may change without a role change (for example ownership).
            await Promise.all(requests.map(request => updateRequest(request, expected, false)));
        } catch (error) {
            expireSession(expected, error);
            if (expected === revision && !disposed) {
                for (const request of requests) {
                    await invoke("update_desktop_business_window", { request, snapshot: null, revoked: error instanceof UnavailableDetail }).catch(() => {});
                }
            }
        } finally { polling = false; }
    }

    function initialize(): Promise<void> {
        if (disposed) return Promise.reject(new ChangedSession("主窗口已关闭。"));
        if (initialized) return Promise.resolve();
        if (initializing) return initializing;
        const operation = (async () => {
            const attemptListeners: UnlistenFn[] = [];
            try {
                for (const [event, handler] of [
                    ["erp-business-refresh", ({ payload }: { payload: DesktopBusinessRequest }) => { void updateRequest(payload, revision); }],
                    ["erp-business-window-closed", ({ payload }: { payload: string }) => { labels.delete(payload); }],
                ] as const) {
                    const stop = await listen<any>(event, handler, { target: { kind: "WebviewWindow", label: "erp" } });
                    attemptListeners.push(stop);
                    if (disposed) throw new ChangedSession("主窗口已关闭。");
                }
                const context = await invoke<number>("desktop_business_context");
                if (disposed) throw new ChangedSession("主窗口已关闭。");
                pageGeneration = context;
                listeners.push(...attemptListeners.splice(0));
                initialized = true;
                timer = setInterval(() => { void revalidateWindows(); }, 30_000);
            } finally {
                // A failed or unmounted attempt owns its listeners until it succeeds.
                for (const stop of attemptListeners) stop();
            }
        })();
        initializing = operation;
        void operation.finally(() => {
            if (initializing === operation) initializing = null;
        }).catch(() => {});
        return operation;
    }

    async function ensureReady() {
        await initialize();
        if (disposed) throw new ChangedSession("主窗口已关闭。");
        if (pendingSession) await pendingSession;
        else if (generation === null) await syncSession();
    }

    function reportInitializationError(error: unknown) {
        if (!disposed && !(error instanceof ChangedSession)) console.error("初始化独立业务窗口失败", error);
    }

    onMounted(() => {
        // Keep the click entry available even if the initial IPC attempt fails.
        openWindow = open;
        stopWatching = watch(fingerprint, () => {
            openings.clear();
            if (initialized) void syncSession().catch(reportInitializationError);
            else invalidateSession();
        }, { flush: "sync" });
        void ensureReady().catch(reportInitializationError);
    });

    onBeforeUnmount(() => {
        disposed = true;
        revision += 1;
        if (openWindow === open) openWindow = undefined;
        stopWatching?.();
        for (const stop of listeners.splice(0)) stop();
        if (timer) clearInterval(timer);
        labels.clear();
        openings.clear();
        if (initialized) void invoke("sync_desktop_business_session", { pageGeneration, revision, username: null }).catch(() => {});
    });
}
