import { InventoryHttpError } from "./inventory";
import { canAccessProductionExecution } from "~~/shared/utils/adminPermission";
import { CODE } from "~~/server/utils/code";
import { logger } from "~~/server/utils/logger";

export const assertProductionExecutionReadAccess = (event: any) => {
    if (!event.context.auth?.username) throw new InventoryHttpError(401, 401, "请先登录。");
    if (!canAccessProductionExecution(Number(event.context.auth.role))) throw new InventoryHttpError(403, 403, "没有生产查询权限。");
};

export const productionExecutionFailure = (event: any, error: any) => {
    const transactionUnavailable = error?.code === 20 || /Transaction numbers are only allowed|replica set|does not support retryable writes/i.test(String(error?.message || ""));
    const known = error instanceof InventoryHttpError;
    const status = known ? error.status : transactionUnavailable ? 503 : 500;
    setResponseStatus(event, status);
    if (!known) logger.error("Production execution error", error);
    return { code: known ? error.code : CODE.SERVER_ERROR, msg: known ? error.message : transactionUnavailable ? "当前数据库不支持事务，生产库存操作未提交，请检查副本集配置。" : "生产执行操作失败，请稍后重试。" };
};
