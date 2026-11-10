import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { retrieveAdminProfile, type AdminListItem } from "~/composables/api/useAdminApi";
import type { NotificationUnreadSummary } from "~/composables/api/useNotificationApi";
import { useNotificationUnread } from "~/composables/useNotificationUnread";
import { clearAdminSession } from "~/utils/auth";
import { canAccessConfigurationPath, getHomeWorkbenchCapabilities } from "~~/shared/utils/adminPermission";

type NotificationEvent = { revision: number } & (
    | { status: "ready"; summary: NotificationUnreadSummary; startedAt: number }
    | { status: "expired" | "forbidden" | "profile-changed" }
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
        if (!getHomeWorkbenchCapabilities(role).notification || !canAccessConfigurationPath(role, "/configuration/notification")) return null;
        return { token: token.value, role, username: user.username };
    });

    let revision = 0;
    let currentToken: string | null = null;
    let currentRole: number | null = null;
    let suspended = false;

    const syncSession = () => {
        const session = eligibleSession.value;
        const nextToken = session?.token ?? null;
        const nextRole = session?.role ?? null;
        if (revision && !suspended && nextToken === currentToken && nextRole === currentRole) return;

        suspended = false;
        currentToken = nextToken;
        currentRole = nextRole;
        nativePolling.value = false;
        setAccountContext("");
        if (session) setAccountContext(session.username);

        revision = Math.max(Date.now(), revision + 1);
        const sentRevision = revision;
        void invoke("sync_desktop_notifications", { token: nextToken, role: nextRole, revision: sentRevision })
            .catch((error) => {
                if (sentRevision === revision) suspended = true;
                console.error("同步桌面通知会话失败", error);
            });
    };

    const handleNotificationEvent = async (payload: NotificationEvent) => {
        const session = eligibleSession.value;
        if (suspended || payload.revision !== revision || !session || session.token !== currentToken || session.role !== currentRole) return;
        if (payload.status === "ready") {
            nativePolling.value = true;
            applyDesktopSummary(payload.summary, payload.startedAt);
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
