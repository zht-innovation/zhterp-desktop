import { systemUpdates, type SystemUpdateType } from "~/config/systemUpdates";

export interface BulletinUpdate {
    id: string;
    version: string;
    date: string;
    title: string;
    content: string;
    type: SystemUpdateType;
}

export const bulletinUpdates: BulletinUpdate[] = systemUpdates.map((update) => ({
    id: update.version,
    version: update.version,
    date: update.date,
    title: update.title,
    content: update.items.join("；"),
    type: update.type,
}));

// 获取最新的 N 条更新
export const getLatestUpdates = (count: number = 3): BulletinUpdate[] => {
    return bulletinUpdates.slice(0, count);
};
