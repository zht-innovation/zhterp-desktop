import { invoke } from "@tauri-apps/api/core";
import { useErpSidebarSections, type ErpModuleId } from "~/composables/useErpSidebarSections";
import { useErpNavigationModules } from "~/composables/useErpNavigationModules";
import { canAccessConfigurationPath } from "~~/shared/utils/adminPermission";

interface QuickLaunchNavigation {
    owner: string;
    username: string;
    currentModuleId: ErpModuleId;
}

interface QuickLaunchEntry {
    id: string;
    label: string;
    path: string;
    icon: string;
    moduleId: ErpModuleId;
    moduleLabel: string;
    parentLabel: string;
    kind: "module" | "menu";
}

export interface QuickLaunchResult extends QuickLaunchEntry {
    sourceLabel: string;
}

const RECENT_LIMIT = 20;
const FAVORITE_LIMIT = 100;

// Only the active shell identifies the current module; permissions remain in
// the shared navigation definitions used by both the sidebar and this panel.
export function useQuickLaunchNavigation() {
    return useState<QuickLaunchNavigation | null>("erp-quick-launch-navigation", () => null);
}

function readIds(value: unknown, limit: number): string[] {
    if (!Array.isArray(value)) return [];
    const ids: string[] = [];
    for (const id of value) {
        if (typeof id !== "string" || id.length > 160 || ids.includes(id)) continue;
        if (!/^(module|menu):[a-z0-9.:-]+$/.test(id)) continue;
        ids.push(id);
        if (ids.length === limit) break;
    }
    return ids;
}

export function useDesktopQuickLaunch() {
    const router = useRouter();
    const navigation = useQuickLaunchNavigation();
    const menus = useErpSidebarSections();
    const { visibleNavigationModules } = useErpNavigationModules();
    const adminInfo = useState<any>("admin_info", () => ({}));
    const token = useState<string | null>("erp-desktop-token", () => null);
    const profileToken = useState<string | null>("auth_token", () => null);
    const username = computed(() => String(adminInfo.value?.username || ""));
    const role = computed(() => Number(adminInfo.value?.role));
    const environment = ref("");
    const visible = ref(false);
    const query = ref("");
    const busy = ref(false);
    const notice = ref("");
    const recent = ref<string[]>([]);
    const favorites = ref<string[]>([]);
    let disposed = false;
    let panelRevision = 0;

    const storageKey = computed(() => {
        if (!environment.value || !username.value || !token.value || token.value !== profileToken.value) return "";
        return `erp:quick-launch:v1:${encodeURIComponent(environment.value)}:${encodeURIComponent(username.value)}`;
    });
    const available = computed(() => Boolean(
        storageKey.value
        && (router.currentRoute.value.path === "/configuration"
            || router.currentRoute.value.path.startsWith("/configuration/")),
    ));
    const currentModuleId = computed(() => {
        const context = navigation.value;
        if (!context || context.username !== username.value) return undefined;
        return router.currentRoute.value.path.split("/")[2] === context.currentModuleId
            ? context.currentModuleId : undefined;
    });

    const catalog = computed(() => {
        const entries = new Map<string, QuickLaunchEntry>();
        if (!available.value) return entries;
        const add = (entry: QuickLaunchEntry) => {
            // Only routes from the live menu definitions can become searchable.
            // Stored IDs never supply a destination, title, query or business ID.
            if (!canAccessConfigurationPath(role.value, entry.path)) return;
            if (!router.resolve(entry.path).matched.length) return;
            entries.set(entry.id, entry);
        };
        for (const module of visibleNavigationModules.value) {
            add({
                id: `module:${module.id}`, label: module.label, path: module.path,
                icon: module.icon, moduleId: module.id, moduleLabel: module.title,
                parentLabel: "", kind: "module",
            });
            for (const section of menus.value[module.id]) {
                if (section.path) {
                    add({
                        id: `menu:${module.id}:${section.id}`, label: section.label,
                        path: section.path, icon: section.icon, moduleId: module.id,
                        moduleLabel: module.title, parentLabel: "", kind: "menu",
                    });
                }
                for (const item of section.children || []) {
                    if (!item.path) continue;
                    add({
                        id: `menu:${module.id}:${item.id}`, label: item.label,
                        path: item.path, icon: item.icon || section.icon, moduleId: module.id,
                        moduleLabel: module.title, parentLabel: section.label, kind: "menu",
                    });
                }
            }
        }
        return entries;
    });

    const results = computed<QuickLaunchResult[]>(() => {
        const list: QuickLaunchResult[] = [];
        const paths = new Set<string>();
        const words = query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        const add = (entry: QuickLaunchEntry | undefined, sourceLabel: string) => {
            if (!entry || paths.has(entry.path)) return;
            const text = `${entry.label} ${entry.moduleLabel} ${entry.parentLabel}`.toLocaleLowerCase();
            if (!words.every(word => text.includes(word))) return;
            paths.add(entry.path);
            list.push({ ...entry, sourceLabel });
        };
        for (const id of favorites.value) add(catalog.value.get(id), "收藏");
        for (const id of recent.value) add(catalog.value.get(id), "最近访问");
        for (const entry of catalog.value.values()) {
            if (entry.kind === "menu" && entry.moduleId === currentModuleId.value) add(entry, "当前菜单");
        }
        for (const entry of catalog.value.values()) {
            if (entry.kind === "module") add(entry, "模块入口");
        }
        return list;
    });

    function persist() {
        if (!import.meta.client || !storageKey.value) return;
        try {
            localStorage.setItem(storageKey.value, JSON.stringify({
                recent: recent.value, favorites: favorites.value,
            }));
        } catch {
            notice.value = "无法保存本机记录，本次会话仍可使用快捷入口。";
        }
    }

    watch(storageKey, (key, previousKey) => {
        panelRevision += 1;
        // Keep an early menu-open request while the environment finishes loading.
        // Leaving or replacing an established account always closes the panel.
        if (previousKey) visible.value = false;
        query.value = "";
        notice.value = "";
        recent.value = [];
        favorites.value = [];
        if (!import.meta.client || !key) return;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return;
            const saved = JSON.parse(raw);
            recent.value = readIds(saved?.recent, RECENT_LIMIT);
            favorites.value = readIds(saved?.favorites, FAVORITE_LIMIT);
        } catch {
            notice.value = "本机记录暂不可用，已使用空记录继续。";
        }
    }, { immediate: true, flush: "sync" });

    function recordCurrentRoute() {
        if (!available.value) return;
        const path = router.currentRoute.value.path;
        let current: QuickLaunchEntry | undefined;
        for (const entry of catalog.value.values()) {
            if (entry.path === path && (!current || entry.kind === "menu")) current = entry;
        }
        // Detail routes and query parameters are intentionally never recorded.
        if (!current || recent.value[0] === current.id) return;
        const currentId = current.id;
        recent.value = [currentId, ...recent.value.filter(id =>
            id !== currentId && catalog.value.get(id)?.path !== path,
        )].slice(0, RECENT_LIMIT);
        persist();
    }

    watch([storageKey, catalog, () => router.currentRoute.value.path], recordCurrentRoute, { flush: "post" });

    function isFavorite(id: string) {
        const entry = catalog.value.get(id);
        return Boolean(entry && favorites.value.some(savedId => catalog.value.get(savedId)?.path === entry.path));
    }

    function toggleFavorite(id: string) {
        const entry = catalog.value.get(id);
        if (!entry || !available.value) return;
        if (isFavorite(id)) {
            favorites.value = favorites.value.filter(savedId => catalog.value.get(savedId)?.path !== entry.path);
        } else {
            if (favorites.value.length >= FAVORITE_LIMIT) {
                notice.value = `最多收藏 ${FAVORITE_LIMIT} 个入口，请先取消部分收藏。`;
                return;
            }
            favorites.value = [...favorites.value, id];
        }
        persist();
    }

    let environmentRequest: Promise<void> | undefined;
    function loadEnvironment() {
        if (environment.value || environmentRequest) return;
        environmentRequest = invoke<{ erpOrigin: string; channel: string }>("desktop_info")
            .then(info => {
                if (disposed) return;
                const origin = new URL(info.erpOrigin).origin;
                environment.value = `${info.channel}:${origin}`;
            })
            .catch(() => {
                if (!disposed) notice.value = "暂时无法读取桌面环境，请关闭后重新打开快捷入口。";
            })
            .finally(() => { environmentRequest = undefined; });
    }

    function open() {
        loadEnvironment();
        if (visible.value) return;
        query.value = "";
        visible.value = true;
    }

    function close() {
        visible.value = false;
    }

    watch(visible, () => { panelRevision += 1; }, { flush: "sync" });

    async function activate(id: string): Promise<boolean> {
        if (busy.value) return false;
        const entry = catalog.value.get(id);
        // Re-evaluate live menus and permissions immediately before routing.
        if (!available.value || !entry || !canAccessConfigurationPath(role.value, entry.path)) {
            notice.value = "该入口已不可访问，请选择其他入口。";
            return false;
        }
        const scope = storageKey.value;
        const revision = panelRevision;
        busy.value = true;
        try {
            const failure = router.currentRoute.value.path === entry.path ? undefined : await router.push(entry.path);
            if (disposed || scope !== storageKey.value || revision !== panelRevision) return false;
            if (failure || router.currentRoute.value.path !== entry.path || !canAccessConfigurationPath(role.value, entry.path)) {
                notice.value = "未能进入该页面，访问权限可能已变更。";
                return false;
            }
            recordCurrentRoute();
            close();
            return true;
        } catch {
            if (!disposed && scope === storageKey.value && revision === panelRevision) notice.value = "打开页面失败，请稍后重试。";
            return false;
        } finally {
            busy.value = false;
        }
    }

    onMounted(loadEnvironment);
    onUnmounted(() => { disposed = true; });
    return { visible, query, results, available, busy, notice, open, close, activate, toggleFavorite, isFavorite };
}
