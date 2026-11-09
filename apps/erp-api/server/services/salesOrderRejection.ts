import mongoose from "mongoose";
import { ApprovalInstance } from "~~/server/models/approvalInstance.model";

const getRejectionKey = (adminId: unknown, value: unknown): string => {
    const id = String(adminId || "").trim();
    if (!id || !value) return "";
    const time = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
    return Number.isFinite(time) ? `${id}:${time}` : "";
};

export const getSalesOrderRejectionCounts = async (
    orders: any[],
    session?: mongoose.ClientSession,
    excludeInstanceId?: mongoose.Types.ObjectId,
): Promise<Map<string, number>> => {
    const counts = new Map<string, number>();
    const storedCounts = new Map<string, number>();
    const legacyEvents = new Map<string, Set<string>>();

    for (const order of orders) {
        const id = String(order?._id || order?.id || "");
        if (!id) continue;
        const stored = Number(order.rejectionCount);
        storedCounts.set(id, Number.isInteger(stored) && stored >= 0 ? stored : 0);
        const events = new Set<string>();
        const rounds = new Set<string>();
        let count = 0;
        const addLegacyRound = (records: any[], roundKey: string) => {
            let rejected = false;
            let duplicate = rounds.has(roundKey);
            const keys: string[] = [];
            for (const record of records) {
                if (record?.rejected !== true) continue;
                rejected = true;
                const key = getRejectionKey(record.rejectedById || record.adminId, record.rejectedAt);
                if (!key) continue;
                keys.push(key);
                if (events.has(key)) duplicate = true;
            }
            if (!rejected) return;
            if (!duplicate) count += 1;
            rounds.add(roundKey);
            for (const key of keys) events.add(key);
        };
        const history = Array.isArray(order.auditHistory) ? order.auditHistory : [];
        for (let index = 0; index < history.length; index += 1) {
            const round = history[index];
            const roundNo = Number(round?.roundNo);
            const roundKey = Number.isInteger(roundNo) && roundNo > 0 ? `round:${roundNo}` : `index:${index}`;
            addLegacyRound(Array.isArray(round?.records) ? round.records : [], roundKey);
        }
        addLegacyRound(Array.isArray(order.auditRecords) ? order.auditRecords : [], "current");
        counts.set(id, count);
        legacyEvents.set(id, events);
    }

    const ids = [...counts.keys()].filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (ids.length > 0) {
        const filter: Record<string, any> = {
            type: "sales-order",
            status: "rejected",
            businessId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
        };
        if (excludeInstanceId) filter._id = { $ne: excludeInstanceId };
        const query = ApprovalInstance.find(filter).select("businessId steps");
        if (session) query.session(session);
        const instances = await query.lean();
        for (const instance of instances) {
            const id = String(instance.businessId);
            const events = legacyEvents.get(id);
            let duplicate = false;
            for (const step of instance.steps || []) {
                for (const user of step.users || []) {
                    if (user.status !== "rejected") continue;
                    const key = getRejectionKey(user.user?.adminId, user.processedAt);
                    if (key && events?.has(key)) duplicate = true;
                }
            }
            if (!duplicate) counts.set(id, (counts.get(id) || 0) + 1);
        }
    }

    for (const [id, count] of counts) {
        counts.set(id, Math.max(count, storedCounts.get(id) || 0));
    }
    return counts;
};
