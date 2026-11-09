import mongoose from "mongoose";
import { ProductionOrder } from "~~/server/models/productionOrder.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { productionMaterialLines, productionOrderListItem } from "~~/server/services/productionOrderView";
import { logger } from "~~/server/utils/logger";
import { retrieveProductionExecution } from "~~/server/services/productionExecutionView";
import { assertProductionExecutionReadAccess, productionExecutionFailure } from "~~/server/services/productionExecutionHttp";
import { ADMIN_ROLE } from "~~/shared/enums";
import { canAccessConfigurationPath, canExecuteProductionAction } from "~~/shared/utils/adminPermission";
import { retrieveProductionPublicMaterials } from "~~/server/services/productionPublicMaterials";
import { InventoryHttpError } from "~~/server/services/inventory";
import { retrieveProductionRequisitionsReadonly } from "~~/server/services/productionRequisitionReadonly";
import { productionWarningRecords } from "~~/server/services/productionOrderWarning";
import { getProductionOrderDeleteStates } from "~~/server/services/productionOrderDeleteEligibility";

export default defineEventHandler(async (event) => {
    const query = getQuery(event);
    const role = Number(event.context.auth?.role);
    if (role === ADMIN_ROLE.FINANCE_MANAGER) {
        try {
            return { code: CODE.SUCCESS, msg: "查询成功", data: await retrieveProductionRequisitionsReadonly(event.context.auth, query, "detail") };
        } catch (error) { return productionExecutionFailure(event, error); }
    }
    if (query.resource) {
        if (!["execution", "requisition", "completion", "receipt", "public-materials"].includes(String(query.resource))) {
            setResponseStatus(event, 400);
            return { code: CODE.INVALID_PARAMS, msg: "生产资源类型不合法" };
        }
        try {
            assertProductionExecutionReadAccess(event);
            if (query.resource === "public-materials") {
                if (!canExecuteProductionAction(role, "allocate-public-materials")) throw new InventoryHttpError(403, 403, "没有额外分配物料权限。");
                return { code: CODE.SUCCESS, msg: "查询成功", data: await retrieveProductionPublicMaterials(query.productionOrderId) };
            }
            if (role === ADMIN_ROLE.WAREHOUSE_KEEPER) {
                const hasScope = query.resource === "execution"
                    ? mongoose.isValidObjectId(query.productionOrderId) || mongoose.isValidObjectId(query.salesOrderId)
                    : mongoose.isValidObjectId(query.id);
                if (!hasScope) {
                    setResponseStatus(event, 400);
                    return { code: CODE.INVALID_PARAMS, msg: "请提供有效的生产单、销售订单或执行单据 ID" };
                }
            }
            return { code: CODE.SUCCESS, msg: "查询成功", data: await retrieveProductionExecution({ ...query, detailResource: query.resource === "execution" ? "" : query.resource }) };
        } catch (error) { return productionExecutionFailure(event, error); }
    }
    if (!canAccessConfigurationPath(role, "/configuration/production/production-orders")) {
        setResponseStatus(event, 403);
        return { code: 403, msg: "没有生产单查询权限" };
    }
    const id = String(query.id || "").trim();
    if (!mongoose.isValidObjectId(id)) {
        setResponseStatus(event, 400);
        return { code: CODE.INVALID_PARAMS, msg: "生产单 ID 不合法" };
    }
    try {
        const row = await ProductionOrder.findById(id).lean() as any;
        if (!row || row.status === "已取消") {
            setResponseStatus(event, 404);
            return { code: "PRODUCTION_ORDER_NOT_FOUND", msg: "生产单不存在" };
        }
        const salesOrder = row.salesOrderId
            ? await useSalesOrderModel().order.findById(row.salesOrderId).select("orderNo salespersonName").lean()
            : null;
        const [execution, deleteStates] = await Promise.all([
            retrieveProductionExecution({ productionOrderId: id }),
            getProductionOrderDeleteStates([row]),
        ]);
        const materials = productionMaterialLines(row.planQty, row.bomMaterials || [], execution.orders.find((order) => order.id === id)?.materials);
        return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: {
            order: productionOrderListItem(row, salesOrder, execution.orders.find((order) => order.id === row._id.toString()), deleteStates.get(row._id.toString())),
            warnings: productionWarningRecords(row),
            materials,
            execution,
        } };
    } catch (error) {
        logger.error("Retrieve production order detail error", error as Error);
        setResponseStatus(event, 500);
        return { code: CODE.SERVER_ERROR, msg: codeToMsg[CODE.SERVER_ERROR] };
    }
});
