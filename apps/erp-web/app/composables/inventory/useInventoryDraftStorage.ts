export type InventoryDraftType = "product" | "bom";

export interface InventoryDraftFile {
    field: string;
    name: string;
    type: string;
    size: number;
    lastModified: number;
    file: File | Blob;
}

export interface InventoryDraftRecord<TData = unknown> {
    id: string;
    type: InventoryDraftType;
    title: string;
    data: TData;
    files?: InventoryDraftFile[];
    createdAt: number;
    updatedAt: number;
}

const INVENTORY_DRAFT_DB_NAME = "inventory-draft-db";
const INVENTORY_DRAFT_DB_VERSION = 1;
const INVENTORY_DRAFT_STORE_NAME = "drafts";

let draftDbPromise: Promise<IDBDatabase> | null = null;

export const filterInventoryDraftsByType = (
    records: InventoryDraftRecord[],
    type: InventoryDraftType,
) => records
    .filter((record) => record.type === type)
    .sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0));

export const shouldShowInventoryDraftActions = (mode: string) =>
    mode === "create" || mode === "edit";

export const createInventoryDraftId = (type: InventoryDraftType) => {
    const now = Date.now();
    return `${type}-${now}-${Math.random().toString(36).slice(2, 8)}`;
};

export const formatInventoryDraftTime = (timestamp: number) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const pad = (value: number) => String(value).padStart(2, "0");

    return [
        date.getFullYear(),
        "-",
        pad(date.getMonth() + 1),
        "-",
        pad(date.getDate()),
        " ",
        pad(date.getHours()),
        ":",
        pad(date.getMinutes()),
    ].join("");
};

const ensureIndexedDb = () => {
    if (typeof indexedDB === "undefined") {
        throw new Error("当前浏览器不支持草稿箱存储");
    }
};

const openInventoryDraftDb = () => {
    ensureIndexedDb();

    if (draftDbPromise) {
        return draftDbPromise;
    }

    draftDbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(INVENTORY_DRAFT_DB_NAME, INVENTORY_DRAFT_DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;
            const store = db.objectStoreNames.contains(INVENTORY_DRAFT_STORE_NAME)
                ? request.transaction?.objectStore(INVENTORY_DRAFT_STORE_NAME)
                : db.createObjectStore(INVENTORY_DRAFT_STORE_NAME, { keyPath: "id" });

            if (!store) {
                return;
            }

            if (!store.indexNames.contains("type")) {
                store.createIndex("type", "type", { unique: false });
            }
            if (!store.indexNames.contains("updatedAt")) {
                store.createIndex("updatedAt", "updatedAt", { unique: false });
            }
        };

        request.onsuccess = () => {
            const db = request.result;
            db.onversionchange = () => {
                db.close();
                draftDbPromise = null;
            };
            resolve(db);
        };
        request.onerror = () => {
            draftDbPromise = null;
            reject(request.error || new Error("打开草稿箱失败"));
        };
        request.onblocked = () => {
            draftDbPromise = null;
            reject(new Error("草稿箱数据库正在被其他页面占用"));
        };
    });

    return draftDbPromise;
};

const runDraftStoreRequest = async <T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
) => {
    const db = await openInventoryDraftDb();

    return await new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(INVENTORY_DRAFT_STORE_NAME, mode);
        const store = transaction.objectStore(INVENTORY_DRAFT_STORE_NAME);
        const request = action(store);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("草稿箱操作失败"));
        transaction.onerror = () => reject(transaction.error || new Error("草稿箱事务失败"));
    });
};

export const listInventoryDrafts = async <TData = unknown>(
    type: InventoryDraftType,
): Promise<InventoryDraftRecord<TData>[]> => {
    const records = await runDraftStoreRequest<InventoryDraftRecord<TData>[]>(
        "readonly",
        (store) => store.getAll(),
    );

    return filterInventoryDraftsByType(records, type) as InventoryDraftRecord<TData>[];
};

export const saveInventoryDraft = async <TData>(
    draft: InventoryDraftRecord<TData>,
) => {
    await runDraftStoreRequest<IDBValidKey>("readwrite", (store) => store.put(draft));
};

export const deleteInventoryDraft = async (id: string) => {
    await runDraftStoreRequest<undefined>("readwrite", (store) => store.delete(id));
};
