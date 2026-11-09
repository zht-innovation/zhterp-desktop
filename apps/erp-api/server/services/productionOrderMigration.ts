import mongoose, { type mongo } from "mongoose";
import { ProductionOrder } from "../models/productionOrder.model";

type MigrationIssue = { code: string; ids: string[]; message: string };
type NumberBackfill = { id: any; before: unknown; documentNo: string };
type IndexSpec = { key: Record<string, any>; options: Record<string, any> };

export class ProductionOrderMigrationError extends Error {
    constructor(public issues: MigrationIssue[]) {
        super(`生产单索引迁移未完成，请核对历史数据或索引：${issues.slice(0, 5).map((issue) => issue.message).join("；")}`);
    }
}

const hasNumber = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isEmptyNumber = (value: unknown) => value == null || (typeof value === "string" && !value.trim());
const sameKey = (left: Record<string, any>, right: Record<string, any>) => JSON.stringify(left) === JSON.stringify(right);
const simpleCollation = (index: any) => !index.collation || index.collation.locale === "simple";
// 只迁移已确认停用的字段；保留字段值，不推断旧请求键与现用幂等键的语义。
const legacyUniqueFields = ["productionNo", "requestId", "releaseRequestId", "cancelRequestId", "lastUpdateRequestId"];
const isLegacyUniqueIndex = (index: any) => index.unique && Object.keys(index.key).length === 1
    && legacyUniqueFields.some((field) => [1, -1].includes(index.key[field]));

// 必填幂等键可沿用完整唯一索引；可选字段必须允许多条记录缺失。
const compatibleIndex = (index: any, spec: IndexSpec) => {
    if (!sameKey(index.key, spec.key) || !simpleCollation(index)) return false;
    if (Boolean(index.unique) !== Boolean(spec.options.unique)) return false;
    if (spec.options.partialFilterExpression) {
        if (!index.partialFilterExpression) {
            return Boolean(index.sparse) || sameKey(spec.key, { idempotencyKey: 1 });
        }
        return JSON.stringify(index.partialFilterExpression) === JSON.stringify(spec.options.partialFilterExpression);
    }
    return !index.sparse && !index.partialFilterExpression;
};

const readIndexes = async (collection: mongo.Collection) => {
    try { return await collection.listIndexes().toArray(); }
    catch (error: any) {
        if (error?.code === 26) return []; // 首次部署尚无集合。
        throw error;
    }
};

export const inspectProductionOrderMigration = async (db: mongo.Db) => {
    const collection = db.collection(ProductionOrder.collection.collectionName);
    const indexes = await readIndexes(collection);
    const issues: MigrationIssue[] = [];
    const backfills: NumberBackfill[] = [];
    const numberIds = new Map<string, string>();
    const uniqueValues = new Map<string, Map<string, string>>();
    const counters = new Map<string, number>();
    let total = 0;
    for await (const row of collection.find({}, { projection: {
        documentNo: 1, productionNo: 1, idempotencyKey: 1, releaseIdempotencyKey: 1, machineNumbers: 1,
    } })) {
        total += 1;
        const id = String(row._id);
        let number = row.documentNo;
        if (hasNumber(number)) {
            if (hasNumber(row.productionNo) && row.productionNo !== number) {
                issues.push({ code: "NUMBER_CONFLICT", ids: [id], message: `${id} 的新旧生产单号不一致` });
            }
        } else if (isEmptyNumber(number) && hasNumber(row.productionNo)) {
            number = row.productionNo;
            backfills.push({ id: row._id, before: row.documentNo, documentNo: number });
        } else {
            issues.push({ code: "NUMBER_MISSING", ids: [id], message: `${id} 缺少有效生产单号` });
        }
        if (hasNumber(number)) {
            const previous = numberIds.get(number);
            if (previous) issues.push({ code: "NUMBER_DUPLICATE", ids: [previous, id], message: `生产单号 ${number} 重复` });
            numberIds.set(number, id);
            const match = /^MO-(\d{6})-(\d+)$/.exec(number);
            if (match) {
                const sequence = Number(match[2]);
                if (!Number.isSafeInteger(sequence)) {
                    issues.push({ code: "COUNTER_INVALID", ids: [id], message: `${number} 的流水号超出安全整数范围` });
                } else {
                    const key = `production-order:${match[1]}`;
                    counters.set(key, Math.max(counters.get(key) || 0, sequence));
                }
            }
        }
        for (const field of ["idempotencyKey", "releaseIdempotencyKey", "machineNumbers"]) {
            const values = Array.isArray(row[field]) ? row[field] : [row[field]];
            const seen = uniqueValues.get(field) || new Map<string, string>();
            uniqueValues.set(field, seen);
            for (const value of values) {
                if (typeof value !== "string") continue;
                const previous = seen.get(value);
                if (previous && previous !== id) {
                    issues.push({ code: "UNIQUE_VALUE_DUPLICATE", ids: [previous, id], message: `${field} 存在跨生产单重复值 ${value}` });
                }
                seen.set(value, id);
            }
        }
    }

    const createIndexes: IndexSpec[] = [];
    const declaredIndexes = ProductionOrder.schema.indexes();
    for (const [key, options] of declaredIndexes) {
        const spec: IndexSpec = { key, options: { ...options } };
        const matches = indexes.filter((index) => sameKey(index.key, key));
        const expectedName = options.name || Object.entries(key).map(([field, order]) => `${field}_${order}`).join("_");
        const nameConflict = indexes.find((index) => index.name === expectedName && !sameKey(index.key, key));
        if (nameConflict || (matches.length && !matches.some((index) => compatibleIndex(index, spec)))) {
            issues.push({ code: "INDEX_CONFLICT", ids: [], message: `索引 ${expectedName} 定义不兼容，请人工核对` });
        } else if (!matches.length) {
            createIndexes.push(spec);
        }
    }
    const legacyIndexes = indexes.filter(isLegacyUniqueIndex);
    for (const index of indexes) {
        if (!index.unique || isLegacyUniqueIndex(index) || sameKey(index.key, { _id: 1 })) continue;
        if (!declaredIndexes.some(([key]) => sameKey(index.key, key))) {
            issues.push({ code: "INDEX_CONFLICT", ids: [], message: `未声明的唯一索引 ${index.name} 需要人工核对` });
        }
    }
    for (const field of legacyUniqueFields) {
        const namedLegacy = indexes.find((index) => index.name === `${field}_1`);
        if (namedLegacy && (!isLegacyUniqueIndex(namedLegacy) || ![1, -1].includes(namedLegacy.key[field]))) {
            issues.push({ code: "INDEX_CONFLICT", ids: [], message: `${field}_1 不是预期的旧字段单列唯一索引，请人工核对` });
        }
    }

    const counterRows = counters.size ? await db.collection("inventorycounters").find({
        key: { $in: [...counters.keys()] },
    }, { projection: { key: 1, value: 1 } }).toArray() : [];
    const counterKeys = new Set<string>();
    for (const row of counterRows) {
        if (counterKeys.has(row.key) || !Number.isSafeInteger(row.value) || row.value < 0) {
            issues.push({ code: "COUNTER_INVALID", ids: [String(row._id)], message: `计数器 ${row.key} 重复或数值无效` });
        }
        counterKeys.add(row.key);
    }
    return { collection, total, issues, backfills, counters, createIndexes, legacyIndexes };
};

export const migrateProductionOrderIndexes = async (db: mongo.Db, apply = false) => {
    const plan = await inspectProductionOrderMigration(db);
    const report = {
        mode: apply ? "apply" : "dry-run", total: plan.total, backfillCount: plan.backfills.length,
        createIndexes: plan.createIndexes.map((index) => ({ key: index.key, ...index.options })),
        dropIndexes: plan.legacyIndexes.map((index) => index.name),
        counterMinimums: Object.fromEntries(plan.counters), issues: plan.issues,
    };
    if (!apply) return report;
    if (plan.issues.length) throw new ProductionOrderMigrationError(plan.issues);

    // 不覆盖并发修改；中断后可以重试，不改原编号、时间、数量和关联 ID。
    for (const row of plan.backfills) {
        const result = await plan.collection.updateOne({
            _id: row.id, documentNo: row.before === undefined ? { $exists: false } : row.before,
            productionNo: row.documentNo,
        }, { $set: { documentNo: row.documentNo } });
        if (!result.matchedCount) {
            const current = await plan.collection.findOne({ _id: row.id });
            if (current?.documentNo !== row.documentNo) {
                throw new ProductionOrderMigrationError([{ code: "DATA_CHANGED", ids: [String(row.id)], message: "迁移期间生产单发生变化，请重新检查" }]);
            }
        }
    }
    const verified = await inspectProductionOrderMigration(db);
    if (verified.issues.length || verified.backfills.length) {
        throw new ProductionOrderMigrationError(verified.issues.length ? verified.issues : [{ code: "DATA_CHANGED", ids: [], message: "迁移期间出现未回填的旧生产单，请重试" }]);
    }
    // DDL 不放入事务，先建立并确认全部约束，最后才移除旧索引。
    for (const index of verified.createIndexes) {
        await plan.collection.createIndex(index.key, index.options);
    }
    const currentIndexes = await readIndexes(plan.collection);
    for (const [key, options] of ProductionOrder.schema.indexes()) {
        if (!options.unique) continue;
        if (!currentIndexes.some((index) => compatibleIndex(index, { key, options }))) {
            throw new Error(`${Object.keys(key).join(", ")} 唯一索引尚未建立，保留旧生产单索引`);
        }
    }

    const counterCollection = db.collection("inventorycounters");
    if (verified.counters.size) await counterCollection.createIndex({ key: 1 }, { unique: true });
    for (const [key, value] of verified.counters) {
        try {
            await counterCollection.updateOne({ key }, { $max: { value }, $setOnInsert: { key } }, { upsert: true });
        } catch (error: any) {
            if (error?.code !== 11000) throw error;
            const updated = await counterCollection.updateOne({ key }, { $max: { value } });
            if (!updated.matchedCount) throw error;
        }
    }
    for (const index of verified.legacyIndexes) {
        // 再读索引定义，避免删除迁移期间被替换的同名索引。
        const current = (await readIndexes(plan.collection)).find((item) => item.name === index.name);
        if (!current) continue;
        if (!isLegacyUniqueIndex(current) || !sameKey(current.key, index.key)) {
            throw new Error(`索引 ${index.name} 已变化，停止移除`);
        }
        try { await plan.collection.dropIndex(current.name!); }
        catch (error: any) { if (error?.code !== 27) throw error; }
    }
    return { ...report, issues: [] };
};

let readyDb: mongo.Db | undefined;
let initialization: Promise<unknown> | undefined;

export const ensureProductionOrderIndexes = async () => {
    const db = mongoose.connection.db;
    if (!db || mongoose.connection.readyState !== 1) throw new Error("生产单数据库尚未连接");
    if (readyDb !== db) {
        readyDb = db;
        initialization = undefined;
    }
    if (!initialization) {
        initialization = migrateProductionOrderIndexes(db, true).catch((error) => {
            initialization = undefined;
            throw error;
        });
    }
    await initialization;
};
