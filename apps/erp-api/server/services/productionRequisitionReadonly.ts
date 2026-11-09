import mongoose from "mongoose";
import type { ExecutionSnapshot } from "~~/shared/types/production-execution";
import { canViewProductionRequisitions } from "~~/shared/utils/adminPermission";
import { CODE } from "~~/server/utils/code";
import { InventoryHttpError } from "./inventory";
import { retrieveProductionExecution } from "./productionExecutionView";

export const retrieveProductionRequisitionsReadonly = async (
    auth: { username?: string; role?: number } | undefined,
    query: Record<string, any>,
    mode: "list" | "detail",
): Promise<ExecutionSnapshot> => {
    if (!auth?.username) throw new InventoryHttpError(401, 401, "请先登录。");
    if (!canViewProductionRequisitions(Number(auth.role))) {
        throw new InventoryHttpError(403, 403, "没有发料查询权限。");
    }

    let params: Record<string, any>;
    if (mode === "list") {
        if (query.resource !== "execution" || query.view !== "requisitions") {
            throw new InventoryHttpError(403, 403, "仅可查询发料记录。");
        }
        params = {
            resource: "execution", view: "requisitions",
            keyword: query.keyword, status: query.status, page: query.page, limit: query.limit,
            productionOrderId: query.productionOrderId, salesOrderId: query.salesOrderId,
        };
    } else {
        if (query.resource !== "requisition") {
            throw new InventoryHttpError(403, 403, "仅可查询发料单详情。");
        }
        if (typeof query.id !== "string" || !mongoose.isValidObjectId(query.id)) {
            throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "请提供有效的发料单 ID。");
        }
        params = { id: new mongoose.Types.ObjectId(query.id).toHexString(), detailResource: "requisition" };
    }

    const data = await retrieveProductionExecution(params, { readOnly: true, includeWarehouseMetadata: true });
    const requisitions = mode === "detail"
        ? data.requisitions.filter((request) => request.id === params.id)
        : data.requisitions;
    if (mode === "detail" && !requisitions.length) {
        throw new InventoryHttpError(404, CODE.INVENTORY_NOT_FOUND, "发料单不存在。");
    }
    const orderIds = new Set(requisitions.map((request) => request.orderId));
    return {
        ...data,
        orders: data.orders.filter((order) => orderIds.has(order.id)),
        requisitions,
        completions: [], relatedCompletions: [], receipts: [], materialLosses: [],
    };
};
