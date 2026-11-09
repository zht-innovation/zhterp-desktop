import { useBorrowRequestModel, isBorrowRequestError } from "~~/server/models/borrowRequest.model";
import { logger } from "~~/server/utils/logger";
import { CODE, codeToMsg } from "~~/server/utils/code";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const model = useBorrowRequestModel();
        const currentAdmin = await model.getCurrentAdmin(event.context?.auth);
        if (!currentAdmin) {
            setResponseStatus(event, 401);
            return { code: 401, msg: "权限不足", data: null };
        }
        const canViewAll = Boolean(
            currentAdmin?.admin?.canAuditBorrowRequest ||
            Number(currentAdmin?.admin?.role) === 0,
        );
        const result = await model.retrieve({
            keyword: String(query.keyword || ""),
            status: String(query.status || ""),
            page: Number(query.page || 1),
            limit: Number(query.limit || 10),
            currentAdminId: currentAdmin?.id || null,
            canViewAll,
        });

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        if (isBorrowRequestError(err)) {
            setResponseStatus(event, err.status);
            return { code: err.code, msg: err.message, data: null };
        }

        logger.error("Retrieve borrow request list error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
            data: null,
        };
    }
});
