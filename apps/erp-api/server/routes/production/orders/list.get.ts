import { ProductionOrder } from "~~/server/models/productionOrder.model";
import mongoose from "mongoose";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { logger } from "~~/server/utils/logger";
import { productionOrderListItem } from "~~/server/services/productionOrderView";
import { getProductionOrderDeleteStates } from "~~/server/services/productionOrderDeleteEligibility";
import { buildExecutionOrders, retrieveProductionExecution } from "~~/server/services/productionExecutionView";
import { assertProductionExecutionReadAccess, productionExecutionFailure } from "~~/server/services/productionExecutionHttp";
import { ADMIN_ROLE } from "~~/shared/enums";
import { canAccessConfigurationPath } from "~~/shared/utils/adminPermission";
import { retrieveProductionWorkshops } from "~~/server/services/productionWorkshop";
import { retrieveProductionRequisitionsReadonly } from "~~/server/services/productionRequisitionReadonly";

const visibleStatuses = ["草稿", "待发料", "待生产", "生产中", "已完成"];
const text = (value: unknown) => String(value ?? "").trim();

export default defineEventHandler(async (event) => {
    const query = getQuery(event);
    const role = Number(event.context.auth?.role);
    if (role === ADMIN_ROLE.FINANCE_MANAGER) {
        try {
            return { code: CODE.SUCCESS, msg: "查询成功", data: await retrieveProductionRequisitionsReadonly(event.context.auth, query, "list") };
        } catch (error) { return productionExecutionFailure(event, error); }
    }
    if (query.resource === "workshops") {
        if (!text(event.context.auth?.username)) {
            setResponseStatus(event, 401);
            return { code: 401, msg: "请先登录。" };
        }
        if (!canAccessConfigurationPath(role, "/configuration/production/production-orders")) {
            setResponseStatus(event, 403);
            return { code: 403, msg: "没有车间查询权限。" };
        }
        try {
            return { code: CODE.SUCCESS, msg: "查询成功", data: await retrieveProductionWorkshops() };
        } catch (error) {
            logger.error("Retrieve production workshops error", error as Error);
            setResponseStatus(event, 500);
            return { code: CODE.SERVER_ERROR, msg: "加载车间失败，请稍后重试。" };
        }
    }
    if (query.resource) {
        if (!["execution", "candidates"].includes(String(query.resource))) {
            setResponseStatus(event, 400);
            return { code: CODE.INVALID_PARAMS, msg: "生产资源类型不合法" };
        }
        if ((query.resource === "execution" && !["requisitions", "completions"].includes(String(query.view)))
            || (query.resource === "candidates" && !["requisition", "completion"].includes(String(query.candidateFor)))) {
            setResponseStatus(event, 400);
            return { code: CODE.INVALID_PARAMS, msg: "生产执行列表类型不合法" };
        }
        try {
            assertProductionExecutionReadAccess(event);
            if (role === ADMIN_ROLE.WAREHOUSE_KEEPER
                && (query.resource !== "execution" || (query.view !== "requisitions" && query.view !== "completions"))) {
                setResponseStatus(event, 403);
                return { code: 403, msg: "库管仅可查询发料及完工入库记录" };
            }
            return { code: CODE.SUCCESS, msg: "查询成功", data: await retrieveProductionExecution(query) };
        } catch (error) { return productionExecutionFailure(event, error); }
    }
    if (!canAccessConfigurationPath(role, "/configuration/production/production-orders")) {
        setResponseStatus(event, 403);
        return { code: 403, msg: "没有生产单查询权限" };
    }
    const page = Math.max(1, Math.trunc(Number(query.page)) || 1);
    const limit = Math.min(100, Math.max(1, Math.trunc(Number(query.limit)) || 15));
    const status = text(query.status || "全部");
    if (status !== "全部" && status !== "待执行" && !visibleStatuses.includes(status)) {
        setResponseStatus(event, 400);
        return { code: CODE.INVALID_PARAMS, msg: "生产单状态不合法" };
    }
    try {
        const keyword = text(query.keyword).slice(0, 80);
        const filter: Record<string, any> = { status: { $in: status === "全部" ? visibleStatuses : status === "待执行" ? ["待发料", "待生产"] : [status] } };
        for (const key of ["salesOrderId", "productionOrderId"]) {
            if (!query[key]) continue;
            if (!mongoose.isValidObjectId(query[key])) {
                setResponseStatus(event, 400);
                return { code: CODE.INVALID_PARAMS, msg: "关联单据 ID 不合法" };
            }
            filter[key === "productionOrderId" ? "_id" : key] = new mongoose.Types.ObjectId(String(query[key]));
        }
        if (keyword) {
            const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(escaped, "i");
            filter.$or = [
                { documentNo: regex }, { productionNo: regex }, { salesOrderNo: regex }, { productCode: regex },
                { productName: regex }, { owner: regex }, { workshop: regex },
            ];
        }
        const [rows, total, statusRows] = await Promise.all([
            ProductionOrder.find(filter).sort({ createTime: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean() as Promise<any[]>,
            ProductionOrder.countDocuments(filter),
            ProductionOrder.aggregate([
                { $match: { status: { $in: visibleStatuses } } },
                { $group: { _id: "$status", count: { $sum: 1 } } },
            ]) as Promise<Array<{ _id: string; count: number }>>,
        ]);
        const salesOrderIds = rows.map((row) => row.salesOrderId).filter(Boolean);
        const [salesOrders, executionOrders, deleteStates] = await Promise.all([
            useSalesOrderModel().order.find({ _id: { $in: salesOrderIds } })
                .select("salespersonName orderNo").lean() as Promise<any[]>,
            buildExecutionOrders(rows),
            getProductionOrderDeleteStates(rows),
        ]);
        const salesMap = new Map(salesOrders.map((order) => [order._id.toString(), order]));
        const executionMap = new Map(executionOrders.map((order) => [order.id, order]));
        const counts = Object.fromEntries(visibleStatuses.map((item) => [item, 0]));
        for (const row of statusRows) counts[row._id] = row.count;
        return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: {
            list: rows.map((row) => productionOrderListItem(
                row, salesMap.get(row.salesOrderId?.toString() || ""), executionMap.get(row._id.toString()),
                deleteStates.get(row._id.toString()),
            )),
            pagination: { page, limit, total }, counts,
        } };
    } catch (error) {
        logger.error("Retrieve production order list error", error as Error);
        setResponseStatus(event, 500);
        return { code: CODE.SERVER_ERROR, msg: codeToMsg[CODE.SERVER_ERROR] };
    }
});
