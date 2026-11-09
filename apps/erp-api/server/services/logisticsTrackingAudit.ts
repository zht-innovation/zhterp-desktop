import { LogisticsTrackingAudit } from "~~/server/models/logisticsTrackingAudit.model";
import { toText } from "~~/server/services/inventory";

type LogisticsTrackingAuditInput = {
    context: "purchase" | "inventory";
    recordId: string;
    trackingNo: string;
    courierCompany?: string;
    auth: { username?: unknown; nickname?: unknown };
};

export const recordLogisticsTrackingQuery = async (input: LogisticsTrackingAuditInput) => {
    const username = toText(input.auth.username);
    const userName = toText(input.auth.nickname) || username;
    await LogisticsTrackingAudit.create({
        context: input.context,
        recordId: input.recordId,
        trackingNo: toText(input.trackingNo).toUpperCase(),
        courierCompany: toText(input.courierCompany),
        username,
        userName,
        queriedAt: new Date(),
    });
};

export const retrieveLogisticsTrackingQueries = async (
    context: "purchase" | "inventory",
    recordId: string,
    trackingNo: string,
) => await LogisticsTrackingAudit.find({
    context,
    recordId,
    trackingNo: toText(trackingNo).toUpperCase(),
})
    .select("trackingNo courierCompany username userName queriedAt")
    .sort({ queriedAt: -1 })
    .limit(100)
    .lean();
