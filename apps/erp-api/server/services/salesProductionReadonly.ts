import mongoose from "mongoose";
import { ADMIN_ROLE } from "~~/shared/enums";
import { CODE } from "~~/server/utils/code";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { InventoryHttpError } from "./inventory";
import { getProductionOverview, PRODUCTION_OVERVIEW_SALES_STATUSES } from "./productionOverview";
import { retrieveProductionExecution } from "./productionExecutionView";
import { toSalesOrderText, type SalesOrderAccess } from "./salesOrderAccess";

const assertSalesProductionOrderAccess = async (salesOrderId: string, salespersonId: string) => {
    const order = await useSalesOrderModel().order.findOne({
        _id: new mongoose.Types.ObjectId(salesOrderId),
        salespersonId: new mongoose.Types.ObjectId(salespersonId),
        _isDeleted: { $ne: true },
        status: { $in: PRODUCTION_OVERVIEW_SALES_STATUSES },
    }).select("_id").lean();
    if (!order) {
        throw new InventoryHttpError(404, CODE.INVENTORY_NOT_FOUND, "生产订单不存在");
    }
};

export const retrieveSalesProductionReadonly = async (
    query: Record<string, unknown>,
    access: SalesOrderAccess,
) => {
    const salespersonId = toSalesOrderText(access.salespersonId);
    if (access.role !== ADMIN_ROLE.SELLER || !access.username || !mongoose.isValidObjectId(salespersonId)) {
        throw new InventoryHttpError(403, 403, "未关联有效销售账号，无法查看个人生产订单");
    }

    const view = toSalesOrderText(query.view);
    if (view !== "production-overview" && view !== "production-execution") {
        throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "生产查询类型不合法");
    }
    const salesOrderId = toSalesOrderText(query.salesOrderId);
    if (salesOrderId || view === "production-execution") {
        if (!mongoose.isValidObjectId(salesOrderId)) {
            throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "销售订单 ID 不合法");
        }
        await assertSalesProductionOrderAccess(salesOrderId, salespersonId);
    }

    // 只组装受支持的查询字段，销售身份和只读选项均由后端确定。
    if (view === "production-execution") {
        const data = await retrieveProductionExecution({ salesOrderId }, { readOnly: true });
        // 关联记录查询期间可能改派订单，返回前再次确认个人归属。
        await assertSalesProductionOrderAccess(salesOrderId, salespersonId);
        return data;
    }

    const status = toSalesOrderText(query.status) || "全部";
    const salesStatus = status === "待发货" ? "待出库" : status;
    if (status !== "全部" && !PRODUCTION_OVERVIEW_SALES_STATUSES.some((item) => item === salesStatus)) {
        throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "订单状态筛选值不合法");
    }
    return await getProductionOverview({
        page: Number(query.page || 1),
        limit: Number(query.limit || 10),
        keyword: toSalesOrderText(query.keyword),
        status,
        salesOrderId,
        candidateOnly: false,
    }, { salespersonId, readOnly: true });
};
