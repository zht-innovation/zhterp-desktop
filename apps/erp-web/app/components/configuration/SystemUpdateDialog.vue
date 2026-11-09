<template>
    <el-dialog
        v-model="visible"
        class="system-update-dialog"
        width="min(680px, calc(100vw - 32px))"
        :close-on-click-modal="true"
        :close-on-press-escape="true"
        :show-close="false"
        @closed="markAsRead"
    >
        <template #header>
            <div class="dialog-header">
                <div class="dialog-heading">
                    <Icon name="lucide:sparkles" />
                    <div>
                        <h2>系统更新</h2>
                        <p>本次共有 {{ unreadUpdates.length }} 个版本更新</p>
                    </div>
                </div>
                <button type="button" class="close-button" aria-label="关闭" @click="closeDialog">
                    <Icon name="lucide:x" />
                </button>
            </div>
        </template>

        <div class="update-list">
            <section
                v-for="update in unreadUpdates"
                :key="update.version"
                class="update-item"
            >
                <div class="update-meta">
                    <el-tag :type="tagTypes[update.type]" size="small">
                        {{ typeLabels[update.type] }}
                    </el-tag>
                    <strong>v{{ update.version }}</strong>
                    <time :datetime="update.date">{{ update.date }}</time>
                </div>
                <h3>{{ update.title }}</h3>
                <ul>
                    <li v-for="item in update.items" :key="item">{{ item }}</li>
                </ul>
            </section>
        </div>

        <template #footer>
            <el-button type="primary" @click="closeDialog">知道了</el-button>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import {
    getUnreadSystemUpdates,
    type SystemUpdate,
    type SystemUpdateType,
} from "~/config/systemUpdates";

const STORAGE_KEY = "system_update_read_versions";
const EXCLUDED_PATHS = [
    "/configuration/mcp/authorize",
    "/configuration/sales/order/print",
];

const route = useRoute();
const adminInfo = useState<any>("admin_info", () => ({}));
const visible = ref(false);
const unreadUpdates = ref<SystemUpdate[]>([]);
const activeUsername = ref("");

const tagTypes: Record<SystemUpdateType, "success" | "danger" | "warning" | "info"> = {
    feature: "success",
    fix: "danger",
    improvement: "warning",
    notice: "info",
};
const typeLabels: Record<SystemUpdateType, string> = {
    feature: "新功能",
    fix: "修复",
    improvement: "优化",
    notice: "通知",
};

const readVersions = (): Record<string, string> => {
    try {
        const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
        return {};
    }
};

const canShowOnCurrentPage = () => {
    if (!route.path.startsWith("/configuration")) return false;
    return !EXCLUDED_PATHS.some((path) => route.path.startsWith(path));
};

const checkUpdates = () => {
    if (!import.meta.client || !adminInfo.value?.username || !canShowOnCurrentPage()) {
        visible.value = false;
        return;
    }

    const username = String(adminInfo.value.username);
    activeUsername.value = username;
    unreadUpdates.value = getUnreadSystemUpdates(readVersions()[username]);
    visible.value = unreadUpdates.value.length > 0;
};

const markAsRead = () => {
    const username = activeUsername.value;
    const latestVersion = unreadUpdates.value[0]?.version;
    if (!username || !latestVersion) return;

    const versions = readVersions();
    versions[username] = latestVersion;
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(versions));
    } catch {
        return;
    }
    unreadUpdates.value = [];
};

const closeDialog = () => {
    visible.value = false;
};

watch(
    [() => adminInfo.value?.username, () => route.path],
    checkUpdates,
    { immediate: true },
);
</script>

<style lang="less">
.system-update-dialog {
    border-radius: 8px;

    .el-dialog__header,
    .el-dialog__footer {
        padding: 20px 24px;
        margin: 0;
    }

    .el-dialog__body {
        padding: 0 24px;
    }

    .dialog-header,
    .dialog-heading,
    .update-meta {
        display: flex;
        align-items: center;
    }

    .dialog-header {
        justify-content: space-between;
        gap: 16px;
    }

    .dialog-heading {
        gap: 12px;

        > svg {
            width: 26px;
            height: 26px;
            color: #2563eb;
        }

        h2,
        p {
            margin: 0;
        }

        h2 {
            font-size: 20px;
            color: #1f2937;
        }

        p {
            margin-top: 3px;
            font-size: 13px;
            color: #6b7280;
        }
    }

    .close-button {
        width: 32px;
        height: 32px;
        padding: 0;
        border: 0;
        background: transparent;
        color: #6b7280;
        cursor: pointer;
    }

    .update-list {
        max-height: min(58vh, 520px);
        overflow-y: auto;
        padding-right: 6px;
    }

    .update-item {
        padding: 18px 0;
        border-top: 1px solid #e5e7eb;

        &:first-child {
            border-top: 0;
        }

        h3 {
            margin: 12px 0 8px;
            font-size: 16px;
            color: #1f2937;
        }

        ul {
            margin: 0;
            padding-left: 20px;
            color: #4b5563;
            font-size: 14px;
            line-height: 1.7;
        }
    }

    .update-meta {
        gap: 10px;

        strong {
            color: #374151;
            font-size: 14px;
        }

        time {
            margin-left: auto;
            color: #9ca3af;
            font-size: 13px;
        }
    }
}

@media (max-width: 520px) {
    .system-update-dialog {
        .el-dialog__header,
        .el-dialog__footer {
            padding: 16px;
        }

        .el-dialog__body {
            padding: 0 16px;
        }

        .dialog-heading p {
            display: none;
        }
    }
}
</style>
