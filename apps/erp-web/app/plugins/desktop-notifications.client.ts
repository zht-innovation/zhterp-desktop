import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { retrieveAdminProfile, type AdminListItem } from "~/composables/api/useAdminApi";
import type { NotificationUnreadSummary } from "~/composables/api/useNotificationApi";
import { useNotificationUnread } from "~/composables/useNotificationUnread";
import { clearAdminSession } from "~/utils/auth";
import { canAccessConfigurationPath, getHomeWorkbenchCapabilities } from "~~/shared/utils/adminPermission";

type NotificationEvent = { revision: number } & (
    | { status: "ready"; summary: NotificationUnreadSummary; startedAt: number }
    | { status: "expired" | "forbidden" | "profile-changed" | "notification-forbidden" }
);

export default defineNuxtPlugin(async (nuxtApp) => {
    if (useRuntimeConfig().public.erpDesktop !== true) return;

    const router = useRouter();
    const token = useState<string | null>("erp-desktop-token", () => null);
    const profileToken = useState<string | null>("auth_token", () => null);
    const profileSyncedAt = useState<number>("admin_profile_synced_at", () => 0);
    const adminInfo = useState<Partial<AdminListItem>>("admin_info", () => ({}));
    const nativePolling = useState<boolean>("erp-desktop-notification-polling", () => false);
    const { applyDesktopSummary, setAccountContext } = useNotificationUnread();
    const eligibleSession = computed(() => {
        const user = adminInfo.value;
        const role = Number(user.role ?? Number.NaN);
        if (!token.value || token.value !== profileToken.value || !profileSyncedAt.value || !user.username) return null;
        const capabilities = getHomeWorkbenchCapabilities(role);
        const sources = {
            notification: capabilities.notification && canAccessConfigurationPath(role, "/configuration/notification"),
            approval: capabilities.approval && canAccessConfigurationPath(role, "/configuration/approval"),
        };
        if (!sources.notification && !sources.approval) return null;
        return { token: token.value, role, username: user.username, sources };
    });

    let revision = 0;
    let currentSession: typeof eligibleSession.value = null;
    let suspended = false;

    const matchesCurrentSession = (session: typeof eligibleSession.value) =>
        session?.token === currentSession?.token
        && session?.role === currentSession?.role
        && session?.username === currentSession?.username
        && session?.sources.notification === currentSession?.sources.notification
        && session?.sources.approval === currentSession?.sources.approval;

    const syncSession = () => {
        const session = eligibleSession.value;
        if (revision && !suspended && matchesCurrentSession(session)) return;

        suspended = false;
        currentSession = session;
        nativePolling.value = false;
        setAccountContext("");
        if (session?.sources.notification) setAccountContext(session.username);

        revision = Math.max(Date.now(), revision + 1);
        const sentRevision = revision;
        void invoke("sync_desktop_notifications", {
            token: session?.token ?? null,
            role: session?.role ?? null,
            sources: session?.sources ?? { notification: false, approval: false },
            revision: sentRevision,
        })
            .catch((error) => {
                if (sentRevision === revision) suspended = true;
                console.error("同步桌面通知会话失败", error);
            });
    };

    const handleNotificationEvent = async (payload: NotificationEvent) => {
        const session = eligibleSession.value;
        if (suspended || payload.revision !== revision || !session || !matchesCurrentSession(session)) return;
        if (payload.status === "ready" || payload.status === "notification-forbidden") {
            if (!session.sources.notification) return;
            nativePolling.value = true;
            if (payload.status === "ready") {
                setAccountContext(session.username);
                applyDesktopSummary(payload.summary, payload.startedAt);
            } else {
                setAccountContext("");
            }
            return;
        }

        setAccountContext("");
        suspended = true;
        if (payload.status === "expired") {
            const route = router.currentRoute.value;
            const cleared = nuxtApp.runWithContext(clearAdminSession);
            if (route.path.startsWith("/configuration")) {
                await router.push({ path: "/admin", query: { redirect: route.fullPath } });
            }
            await cleared;
            return;
        }
        if (payload.status === "profile-changed") {
            const response = await nuxtApp.runWithContext(() => retrieveAdminProfile()());
            if (payload.revision !== revision || token.value !== session.token || response.code !== 200 || !response.data?.user) return;
            adminInfo.value = { ...adminInfo.value, ...response.data.user };
            profileSyncedAt.value = Date.now();
        }
    };

    const unlisten = await listen<NotificationEvent>("erp-notification-summary", ({ payload }) => {
        void handleNotificationEvent(payload).catch((error) => console.error("处理桌面通知状态失败", error));
    }, { target: { kind: "WebviewWindow", label: "erp" } }).catch((error) => {
        console.error("监听桌面通知失败", error);
        return undefined;
    });
    const stopWatching = watch([eligibleSession, profileSyncedAt], syncSession, { immediate: true });
    nuxtApp.vueApp.onUnmount(() => {
        stopWatching();
        unlisten?.();
    });
});
