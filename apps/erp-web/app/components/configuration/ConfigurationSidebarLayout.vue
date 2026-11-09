<template>
    <main
        :class="[
            'configuration-section-layout',
            'erp-app',
            layoutClass,
            { 'sidebar-collapsed': !isSidebarExpanded },
        ]"
    >
        <aside class="side-nav">
            <div class="navigation-body">
                <nav class="module-rail" aria-label="ERP 板块导航">
                    <div class="brand">
                        <img :src="sidebarAvatarSrc" alt="ZHT Aero" class="brand-logo">
                    </div>

                    <NuxtLink
                        v-for="module in navigationModules"
                        :key="module.id"
                        :to="module.path"
                        class="module-link"
                        :class="{ active: module.id === activeModuleId }"
                        :aria-current="module.id === activeModuleId ? 'page' : undefined"
                    >
                        <Icon :name="module.icon" class="module-icon" />
                        <span>{{ module.label }}</span>
                        <span
                            v-if="hasModuleBadge(module.badge)"
                            :class="typeof module.badge === 'number' ? 'module-count' : 'module-dot'"
                            :aria-label="getModuleBadgeLabel(module)"
                        >{{ typeof module.badge === "number" ? formatModuleBadge(module.badge) : "" }}</span>
                    </NuxtLink>

                    <button
                        v-if="!isSidebarExpanded"
                        class="sidebar-expand-button"
                        type="button"
                        aria-label="展开板块菜单"
                        title="展开板块菜单"
                        @click="toggleSidebar"
                    >
                        <ErpSidebarToggleIcon class="sidebar-toggle-icon" />
                    </button>
                </nav>

                <nav
                    v-show="isSidebarExpanded"
                    class="section-panel"
                    :aria-label="`${currentModule.title}导航`"
                >
                    <div class="section-header">
                        <span class="section-title">{{ currentModule.title }}</span>
                        <button
                            class="sidebar-toggle"
                            type="button"
                            aria-label="收起板块菜单"
                            title="收起板块菜单"
                            @click="toggleSidebar"
                        >
                            <ErpSidebarToggleIcon class="sidebar-toggle-icon" />
                        </button>
                    </div>

                    <div class="nav-list">
                        <div
                            v-for="section in sections"
                            :key="section.id"
                            class="nav-group"
                        >
                            <button
                                class="nav-item"
                                :class="{ active: isSectionSelected(section) }"
                                type="button"
                                :aria-expanded="
                                    section.children ? isSectionExpanded(section.id) : undefined
                                "
                                @click="onSectionClick(section)"
                            >
                                <span>{{ section.label }}</span>
                                <span
                                    v-if="section.badge"
                                    class="nav-dot"
                                />
                                <Icon
                                    v-if="section.children"
                                    :name="
                                        isSectionExpanded(section.id)
                                            ? 'lucide:chevron-up'
                                            : 'lucide:chevron-down'
                                    "
                                    class="nav-chevron"
                                />
                            </button>

                            <Transition name="sub-nav-collapse">
                                <div
                                    v-if="section.children && isSectionExpanded(section.id)"
                                    class="sub-nav"
                                >
                                    <button
                                        v-for="item in section.children"
                                        :key="item.id"
                                        class="sub-nav-item"
                                        :class="{ active: selectedNavId === item.id }"
                                        type="button"
                                        @click="selectNav(item)"
                                    >
                                        <span>{{ item.label }}</span>
                                        <span
                                            v-if="item.badge"
                                            class="nav-dot"
                                        />
                                    </button>
                                </div>
                            </Transition>
                        </div>
                    </div>
                </nav>
            </div>

            <NuxtLink
                class="back-link"
                to="/configuration"
                external
                :title="isSidebarExpanded ? undefined : '返回配置界面'"
            >
                <Icon name="lucide:log-out" class="back-icon" />
                <span v-if="isSidebarExpanded">返回配置界面</span>
            </NuxtLink>
        </aside>

        <section
            :class="[
                'configuration-section-content',
                contentClass,
                { 'configuration-section-content--inset': shouldInsetContent },
            ]"
        >
            <slot />
        </section>
    </main>
</template>

<script setup lang="ts">
import defaultAvatar from "~/assets/avatar.jpg";
import ErpSidebarToggleIcon from "~/components/configuration/ErpSidebarToggleIcon.vue";
import { useApproval } from "~/composables/useApproval";
import { useNotificationUnread } from "~/composables/useNotificationUnread";
import { ADMIN_ROLE } from "~~/shared/enums";
import {
    canAccessAdminFeature,
    canAccessConfigurationPath,
    canAccessErp,
    canAccessInventory,
    canAccessPurchaseSupplier,
    getInventoryModuleLandingPath,
    isElectronicsWarehouseKeeper,
} from "~~/shared/utils/adminPermission";

type ErpModuleId = "home" | "sales" | "inventory" | "production" | "purchase" | "finance" | "approval" | "notification";

interface SidebarItem {
    id: string;
    label: string;
    path?: string;
    badge?: boolean;
}

interface SidebarSection extends SidebarItem {
    icon: string;
    children?: SidebarItem[];
}

interface NavigationModule {
    id: "home" | ErpModuleId;
    label: string;
    title: string;
    icon: string;
    path: string;
    badge?: boolean | number;
}

const props = withDefaults(defineProps<{
    moduleId?: ErpModuleId;
    sections: SidebarSection[];
    defaultSelectedId: string;
    defaultExpandedSectionIds?: string[];
    moduleBadges?: Partial<Record<ErpModuleId, boolean | number>>;
    contentInset?: boolean;
    layoutClass?: string;
    contentClass?: string;
}>(), {
    defaultExpandedSectionIds: () => [],
    moduleBadges: () => ({}),
    contentInset: false,
    layoutClass: "",
    contentClass: "",
});

const router = useRouter();
const routePath = computed(() => router.currentRoute.value.path);
const adminInfo = useState<any>("admin_info", () => ({}));
const isSidebarExpanded = useState<boolean>("erp_sidebar_expanded", () => true);
const sidebarAvatarSrc = defaultAvatar;
const expandedSectionIds = ref([...props.defaultExpandedSectionIds]);
const {
    refreshUnreadSummary,
    setAccountContext: setNotificationAccountContext,
    summary: notificationUnreadSummary,
} = useNotificationUnread();
const {
    refreshUnreadCounts,
    pendingCount: approvalPendingCount,
    setAccountContext: setApprovalAccountContext,
    unreadCounts: approvalUnreadCounts,
} = useApproval();

const role = computed(() => Number(adminInfo.value?.role));
const username = computed(() => String(adminInfo.value?.username || ""));
setNotificationAccountContext(username.value);
setApprovalAccountContext(username.value);
const isSalesperson = computed(() => role.value === ADMIN_ROLE.SELLER);
const activeModuleId = computed<ErpModuleId>(() => {
    if (props.moduleId) {
        return props.moduleId;
    }

    const routeModule = routePath.value.split("/")[2] as ErpModuleId | undefined;
    const moduleIds: ErpModuleId[] = [
        "sales",
        "inventory",
        "production",
        "purchase",
        "finance",
        "approval",
        "notification",
    ];

    return routeModule && moduleIds.includes(routeModule)
        ? routeModule
        : "sales";
});

const shouldInsetContent = computed(() =>
    props.contentInset
    || activeModuleId.value === "inventory",
);

const allNavigationModules = computed<NavigationModule[]>(() => [
    {
        id: "home",
        label: "首页",
        title: "首页",
        icon: "lucide:house",
        path: "/configuration/home",
    },
    {
        id: "sales",
        label: "销售",
        title: "销售管理",
        icon: "lucide:contact-round",
        path: isSalesperson.value
            ? "/configuration/sales/bulletin"
            : "/configuration/sales/dashboard",
    },
    {
        id: "inventory",
        label: "仓储",
        title: "库存管理",
        icon: "lucide:layers-3",
        path: getInventoryModuleLandingPath(role.value),
    },
    {
        id: "production",
        label: "生产",
        title: "生产管理",
        icon: "lucide:factory",
        path: [ADMIN_ROLE.WAREHOUSE_KEEPER, ADMIN_ROLE.FINANCE_MANAGER].includes(role.value)
            ? "/configuration/production/requisitions"
            : "/configuration/production/orders",
    },
    {
        id: "purchase",
        label: "采购",
        title: "采购管理",
        icon: "lucide:shopping-cart",
        path: canAccessPurchaseSupplier(role.value)
            ? "/configuration/purchase/supplier"
            : "/configuration/purchase/order",
    },
    {
        id: "finance",
        label: "财务",
        title: "财务管理",
        icon: "lucide:wallet-cards",
        path: "/configuration/finance/cost",
    },
    {
        id: "approval",
        label: "审批",
        title: "审批中心",
        icon: "lucide:user-round-check",
        path: "/configuration/approval",
    },
    {
        id: "notification",
        label: "通知",
        title: "通知中心",
        icon: "lucide:volume-2",
        path: "/configuration/notification",
    },
]);

const canShowModule = (moduleId: NavigationModule["id"]) => {
    if (isElectronicsWarehouseKeeper(role.value)) {
        return moduleId === "inventory" || moduleId === "purchase";
    }
    if (role.value === ADMIN_ROLE.CONTENT_MANAGER) {
        return false;
    }
    if (moduleId === "home") {
        return canAccessErp(role.value);
    }

    if (moduleId === "approval") {
        return true;
    }

    if (role.value === ADMIN_ROLE.OPERATOR) {
        return ["home", "inventory", "approval", "notification"].includes(moduleId);
    }

    if (role.value === ADMIN_ROLE.ORDINARY_USER) {
        return ["purchase", "approval", "notification"].includes(moduleId);
    }

    if (role.value === ADMIN_ROLE.WAREHOUSE_KEEPER) {
        return ["inventory", "production", "purchase", "notification"].includes(moduleId);
    }

    if (role.value === ADMIN_ROLE.PURCHASER) {
        return moduleId === "purchase" || moduleId === "notification";
    }

    if (role.value === ADMIN_ROLE.FINANCE_MANAGER) {
        return ["inventory", "production", "purchase", "finance", "notification"].includes(moduleId);
    }

    if (role.value === ADMIN_ROLE.PRODUCTION_MANAGER) {
        return ["inventory", "production", "purchase", "approval", "notification"].includes(moduleId);
    }

    if (role.value === ADMIN_ROLE.SELLER && moduleId === "finance") {
        return false;
    }

    if (moduleId === "sales") {
        return canAccessAdminFeature(role.value, ADMIN_ROLE.SELLER);
    }
    if (moduleId === "inventory") {
        return canAccessInventory(role.value);
    }
    if (moduleId === "production") {
        return canAccessConfigurationPath(role.value, "/configuration/production/orders");
    }
    if (moduleId === "purchase") {
        return canAccessErp(role.value);
    }
    if (moduleId === "finance") {
        return canAccessAdminFeature(role.value, ADMIN_ROLE.FINANCE, [
            ADMIN_ROLE.FINANCE_MANAGER,
        ]);
    }
    if (moduleId === "notification") {
        return canAccessAdminFeature(role.value, ADMIN_ROLE.SELLER, [
            ADMIN_ROLE.WAREHOUSE_KEEPER,
            ADMIN_ROLE.FINANCE,
            ADMIN_ROLE.FINANCE_MANAGER,
            ADMIN_ROLE.PRODUCTION_MANAGER,
            ADMIN_ROLE.ORDINARY_USER,
        ]);
    }

    return false;
};

const approvalMenuMessageCount = computed(() =>
    approvalPendingCount.value
    + approvalUnreadCounts.value.processed
    + approvalUnreadCounts.value.mine
    + approvalUnreadCounts.value.cc,
);

const navigationModules = computed(() =>
    allNavigationModules.value
        .filter((module) => canShowModule(module.id))
        .map((module) => ({
            ...module,
            badge: module.id === "notification"
                ? notificationUnreadSummary.value.totalUnread
                : module.id === "approval"
                ? approvalMenuMessageCount.value
                : props.moduleBadges[module.id],
        })),
);

const hasModuleBadge = (badge?: boolean | number) =>
    typeof badge === "number" ? badge > 0 : badge === true;

const formatModuleBadge = (badge: number) => badge > 99 ? "99+" : String(badge);

const getModuleBadgeLabel = (module: NavigationModule) => {
    if (typeof module.badge === "number") {
        if (module.id === "approval") {
            return `${module.label}有${module.badge}条待处理或未读消息`;
        }
        return `${module.label}有${module.badge}条未读消息`;
    }
    return `${module.label}有待处理事项`;
};

const currentModule = computed(() =>
    allNavigationModules.value.find((module) => module.id === activeModuleId.value)
    ?? allNavigationModules.value[0],
);

const toggleSidebar = () => {
    isSidebarExpanded.value = !isSidebarExpanded.value;
};

const refreshModuleBadges = () => {
    setNotificationAccountContext(username.value);
    setApprovalAccountContext(username.value);
    if (canShowModule("notification")) {
        void refreshUnreadSummary();
    }
    if (canShowModule("approval")) {
        void refreshUnreadCounts().catch(() => undefined);
    }
};

const handleWindowFocus = () => refreshModuleBadges();
const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
        refreshModuleBadges();
    }
};

let badgeRefreshTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
    refreshModuleBadges();
    badgeRefreshTimer = setInterval(refreshModuleBadges, 60_000);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
});

onBeforeUnmount(() => {
    if (badgeRefreshTimer) {
        clearInterval(badgeRefreshTimer);
    }
    window.removeEventListener("focus", handleWindowFocus);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
});

watch([role, username], () => refreshModuleBadges());

const isSectionExpanded = (sectionId: string) => {
    return expandedSectionIds.value.includes(sectionId);
};

const isSectionSelected = (section: SidebarSection) => {
    return section.id === selectedNavId.value
        || Boolean(section.children?.some((item) => item.id === selectedNavId.value));
};

const toggleSection = (sectionId: string) => {
    if (isSectionExpanded(sectionId)) {
        expandedSectionIds.value = expandedSectionIds.value.filter(
            (id) => id !== sectionId,
        );
        return;
    }

    expandedSectionIds.value = [...expandedSectionIds.value, sectionId];
};

const routeMatchesItemPath = (currentPath: string, itemPath: string) => {
    return currentPath === itemPath || currentPath.startsWith(`${itemPath}/`);
};

const findSidebarSelection = (path: string) => {
    const matches: Array<{
        item: SidebarItem;
        parentId: string | null;
        pathLength: number;
    }> = [];

    for (const section of props.sections) {
        if (section.path && routeMatchesItemPath(path, section.path)) {
            matches.push({
                item: section,
                parentId: null,
                pathLength: section.path.length,
            });
        }

        section.children?.forEach((item) => {
            if (item.path && routeMatchesItemPath(path, item.path)) {
                matches.push({
                    item,
                    parentId: section.id,
                    pathLength: item.path.length,
                });
            }
        });
    }

    return matches.sort((left, right) => right.pathLength - left.pathLength)[0] || null;
};

const selectedNavId = computed(() =>
    findSidebarSelection(routePath.value)?.item.id ?? props.defaultSelectedId,
);

const selectNav = (item: SidebarItem) => {
    if (item.path && routePath.value !== item.path) {
        navigateTo(item.path);
    }
};

const onSectionClick = (section: SidebarSection) => {
    if (section.children) {
        toggleSection(section.id);
        return;
    }

    expandedSectionIds.value = [];
    selectNav(section);
};

watch(
    [routePath, () => props.sections, () => props.defaultSelectedId],
    ([path]) => {
        const selection = findSidebarSelection(path as string);

        if (
            selection?.parentId
            && !expandedSectionIds.value.includes(selection.parentId)
        ) {
            expandedSectionIds.value = [
                ...expandedSectionIds.value,
                selection.parentId,
            ];
        }
    },
    { immediate: true, deep: true },
);
</script>

<style scoped>
.configuration-section-layout {
    --sidebar-width-expanded: 220px;
    --sidebar-width-collapsed: 66px;
    --sidebar-notice: var(--erp-color-function-red-500);
    --sidebar-logo-shadow: 0 4px 4px rgb(153 153 153 / 25%);

    width: 100vw;
    height: 100vh;
    display: grid;
    grid-template-columns: var(--sidebar-width-expanded) minmax(0, 1fr);
    overflow: hidden;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-bg-page);
    transition: grid-template-columns 0.18s ease;
}

button {
    font: inherit;
}

.configuration-section-layout.sidebar-collapsed {
    grid-template-columns: var(--sidebar-width-collapsed) minmax(0, 1fr);
}

.side-nav {
    width: var(--sidebar-width-expanded);
    height: 100vh;
    display: grid;
    grid-template-rows: minmax(0, 1fr) 48px;
    padding-block: var(--erp-spacing-8);
    overflow: hidden;
    border-radius: 0 var(--erp-radius-surface-default) var(--erp-radius-surface-default) 0;
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
    transition: width 0.18s ease;
}

.sidebar-collapsed .side-nav {
    width: var(--sidebar-width-collapsed);
}

.navigation-body {
    min-height: 0;
    display: grid;
    grid-template-columns: var(--sidebar-width-collapsed) minmax(0, 1fr);
    gap: var(--erp-spacing-8);
    padding-right: var(--erp-spacing-8);
    overflow: hidden;
}

.sidebar-collapsed .navigation-body {
    grid-template-columns: var(--sidebar-width-collapsed);
    padding-right: 0;
}

.module-rail {
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--erp-spacing-12);
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    overflow-x: hidden;
    overflow-y: auto;
    border-right: 1px solid var(--erp-color-divider-subtle);
    scrollbar-width: none;
}

.module-rail::-webkit-scrollbar {
    display: none;
}

.brand,
.module-link {
    width: 50px;
    height: 50px;
    flex: 0 0 50px;
}

.brand {
    display: flex;
    align-items: flex-start;
    justify-content: center;
}

.brand-logo {
    width: 40px;
    height: 40px;
    object-fit: cover;
    border-radius: 50%;
    background: var(--erp-color-fill-default);
    box-shadow: var(--sidebar-logo-shadow);
}

.module-link {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content2-font-size);
    font-weight: var(--erp-typography-content2-font-weight);
    line-height: var(--erp-typography-content2-line-height);
    transition: color 0.16s ease, background-color 0.16s ease;
}

.module-link:hover {
    background: var(--erp-color-fill-nav-selected);
}

.module-link.active {
    color: var(--erp-color-action-primary);
    background: var(--erp-color-fill-nav-selected);
}

.module-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
    flex: 0 0 var(--erp-size-icon-default);
}

.module-dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--sidebar-notice);
    box-shadow: 0 0 0 2px var(--erp-color-fill-default);
}

.module-count {
    position: absolute;
    top: 1px;
    right: 1px;
    min-width: 18px;
    height: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    border-radius: 9px;
    color: var(--erp-color-text-white);
    background: var(--sidebar-notice);
    box-shadow: 0 0 0 2px var(--erp-color-fill-default);
    font-size: 10px;
    font-weight: 600;
    line-height: 18px;
}

.sidebar-expand-button {
    width: 50px;
    height: var(--erp-size-control-height-md);
    display: flex;
    flex: 0 0 var(--erp-size-control-height-md);
    align-items: center;
    justify-content: center;
    margin-top: auto;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-tertiary);
    background: transparent;
    cursor: pointer;
    transition: color 0.16s ease, background-color 0.16s ease;
}

.sidebar-expand-button:hover {
    color: var(--erp-color-action-primary);
    background: var(--erp-color-fill-nav-selected);
}

.sidebar-toggle-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.section-panel {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.section-header {
    width: 100%;
    height: 52px;
    flex: 0 0 52px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--erp-spacing-8);
    border-bottom: 1px solid var(--erp-color-divider-subtle);
    color: var(--erp-color-text-tertiary);
}

.section-title {
    min-width: 0;
    overflow: hidden;
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sidebar-toggle {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    flex: 0 0 var(--erp-size-icon-default);
    color: var(--erp-color-text-secondary);
    background: transparent;
    cursor: pointer;
    transition: color 0.16s ease, background-color 0.16s ease;
}

.sidebar-toggle:hover {
    color: var(--erp-color-action-primary);
    background: var(--erp-color-fill-nav-selected);
}

.nav-list {
    min-height: 0;
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--erp-spacing-16);
    padding: var(--erp-spacing-8);
    overflow-x: hidden;
    overflow-y: auto;
}

.nav-group {
    display: flex;
    flex-direction: column;
    gap: var(--erp-spacing-8);
}

.nav-item,
.sub-nav-item {
    width: 100%;
    display: flex;
    align-items: center;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-secondary);
    background: transparent;
    text-align: left;
    cursor: pointer;
    transition: color 0.16s ease, background-color 0.16s ease;
}

.nav-item {
    height: var(--erp-size-control-height-md);
    flex: 0 0 var(--erp-size-control-height-md);
    gap: var(--erp-spacing-8);
    justify-content: flex-start;
    padding: 0 4px;
    color: var(--erp-color-text-secondary-strong);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.nav-item:hover,
.sub-nav-item:hover {
    color: var(--erp-color-action-primary);
    background: var(--erp-color-fill-nav-selected);
}

.nav-item.active {
    color: var(--erp-color-action-primary);
}

.nav-chevron {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
    margin-left: auto;
    flex: 0 0 var(--erp-size-icon-default);
}

.nav-dot {
    width: 8px;
    height: 8px;
    margin-left: auto;
    flex: 0 0 8px;
    border-radius: 50%;
    background: var(--sidebar-notice);
    box-shadow: 0 0 0 2px var(--erp-color-fill-default);
}

.nav-dot + .nav-chevron {
    margin-left: 0;
}

.sub-nav-collapse-enter-active,
.sub-nav-collapse-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.sub-nav-collapse-enter-from,
.sub-nav-collapse-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

.sub-nav {
    display: flex;
    flex-direction: column;
    gap: var(--erp-spacing-16);
    padding: 0 var(--erp-spacing-8);
}

.sub-nav-item {
    height: var(--erp-size-icon-default);
    flex: 0 0 var(--erp-size-icon-default);
    justify-content: flex-start;
    padding: 0 4px;
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
}

.sub-nav-item.active {
    color: var(--erp-color-action-primary);
    background: var(--erp-color-fill-nav-selected);
}

.back-link {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-8);
    margin: 0 11px;
    border-top: 1px solid var(--erp-color-divider-default);
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    white-space: nowrap;
    transition: color 0.16s ease;
}

.back-link:hover {
    color: var(--erp-color-action-primary);
}

.sidebar-collapsed .back-link {
    margin: 0 var(--erp-spacing-8);
}

.back-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
    flex: 0 0 var(--erp-size-icon-default);
}

.configuration-section-content {
    min-width: 0;
    height: 100vh;
    overflow: hidden;
}

.configuration-section-content--inset {
    padding: var(--erp-spacing-12);
}

@media (max-width: 1200px) {
    .configuration-section-layout {
        grid-template-columns: var(--sidebar-width-expanded) minmax(760px, 1fr);
        overflow-x: auto;
        overflow-y: hidden;
    }

    .configuration-section-layout.sidebar-collapsed {
        grid-template-columns: var(--sidebar-width-collapsed) minmax(760px, 1fr);
    }

    .side-nav {
        position: sticky;
        left: 0;
        z-index: 20;
    }

    .configuration-section-content {
        min-width: 760px;
    }
}
</style>
