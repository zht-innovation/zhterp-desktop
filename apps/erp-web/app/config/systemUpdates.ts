import VersionHistory from "~/config/version";

export type SystemUpdateType = "feature" | "fix" | "improvement" | "notice";

export interface SystemUpdate {
    version: string;
    date: string;
    title: string;
    items: string[];
    type: SystemUpdateType;
}

const SYSTEM_UPDATE_TYPES: SystemUpdateType[] = [
    "feature",
    "fix",
    "improvement",
    "notice",
];

const isSystemUpdateType = (type: unknown): type is SystemUpdateType => {
    return SYSTEM_UPDATE_TYPES.includes(type as SystemUpdateType);
};

const normalizeItems = (info: string) => {
    return info
        .split("\n")
        .map((item) => item.trim().replace(/^\*\s*/, ""))
        .filter(Boolean);
};

const getUpdateType = (items: string[]): SystemUpdateType => {
    if (items.some((item) => item.includes("修复") || item.includes("bug"))) {
        return "fix";
    }
    if (items.some((item) => item.includes("新增") || item.includes("增加"))) {
        return "feature";
    }
    return "improvement";
};

const seenVersions = new Set<string>();
const uniqueVersionHistory = VersionHistory.filter((update) => {
    if (!/^\d+\.\d+\.\d+$/.test(update.version)) return false;
    if (seenVersions.has(update.version)) return false;

    seenVersions.add(update.version);
    return true;
});

export const systemUpdates: SystemUpdate[] = [

    ...uniqueVersionHistory.map((update) => {
        const items = normalizeItems(update.info);
        return {
            version: update.version,
            date: update.date,
            title: `系统版本 ${update.version}`,
            items,
            type: isSystemUpdateType(update.type)
                ? update.type
                : getUpdateType(items),
        };
    }),
];

export const getUnreadSystemUpdates = (
    lastReadVersion: string | undefined,
    updates: SystemUpdate[] = systemUpdates,
) => {
    if (!lastReadVersion) return [...updates];

    const lastReadIndex = updates.findIndex(
        (update) => update.version === lastReadVersion,
    );
    if (lastReadIndex < 0) return [...updates];

    return updates.slice(0, lastReadIndex);
};
