import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import {
    useApprovalInstanceModel,
    type ApprovalInstanceStepData,
} from "~~/server/models/approvalInstance.model";
import {
    getSalesOrderAccess,
    getSalesOrderActor,
    getSalesOrderAuditorSnapshot,
    isSalesOrderSuperAdmin,
    toSalesOrderText,
} from "~~/server/services/salesOrderAccess";
import {
    parseSalesOrderApprovalResult,
    type SalesOrderApprovalResult,
} from "~~/server/services/salesOrderApproval";
import { logger } from "~~/server/utils/logger";
import { InventoryHttpError } from "~~/server/services/inventory";
import { retrieveSalesProductionReadonly } from "~~/server/services/salesProductionReadonly";

const getApprovalProgress = (steps: ApprovalInstanceStepData[] = []) => {
    const firstApproval = steps.find((step) => step.key === "first-approval");
    const secondApproval = steps.find((step) => step.key === "second-approval");
    const thirdApproval = steps.find((step) => step.key === "third-approval");
    const firstUsers = Array.isArray(firstApproval?.users) ? firstApproval.users : [];
    const total = firstUsers.length + (secondApproval ? 1 : 0) + (thirdApproval ? 1 : 0);

    return {
        completed: firstUsers.filter((user) => user.status === "approved").length
            + (secondApproval?.status === "completed" ? 1 : 0)
            + (thirdApproval?.status === "completed" ? 1 : 0),
        total,
    };
};

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const auth = event.context.auth;
        const access = await getSalesOrderAccess(auth);
        if (query.view === "production-overview" || query.view === "production-execution") {
            const data = await retrieveSalesProductionReadonly(query, access);
            return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data };
        }
        let salespersonId = toSalesOrderText(query.salespersonId);
        let status = toSalesOrderText(query.status);
        const draftOnly = query.draftOnly === "true" || query.draftOnly === "1";
        const approvalOnly = query.approvalOnly === "true" || query.approvalOnly === "1";
        const deletedOnly = query.deletedOnly === "true" || query.deletedOnly === "1";
        if (deletedOnly && !isSalesOrderSuperAdmin(access.role)) {
            setResponseStatus(event, 403);
            return { code: 403, msg: "仅超级管理员可以查看已删除订单", data: null };
        }
        let includePendingForAudit = false;
        let approvalAuditorId = "";
        let approvalResult: SalesOrderApprovalResult | undefined;
        const orderModel = useSalesOrderModel();
        if (draftOnly) {
            salespersonId = "";
            status = "草稿";
        } else if (approvalOnly) {
            if (!access.canAuditSalesOrder) {
                setResponseStatus(event, 403);
                return {
                    code: 403,
                    msg: "没有订单审核权限",
                    data: null,
                };
            }
            const auditor = await getSalesOrderAuditorSnapshot(auth);
            if (!auditor) {
                setResponseStatus(event, 403);
                return {
                    code: 403,
                    msg: "没有订单审核权限",
                    data: null,
                };
            }
            const parsedApprovalResult = parseSalesOrderApprovalResult(query.approvalResult);
            if (!parsedApprovalResult) {
                setResponseStatus(event, 400);
                return {
                    code: 400,
                    msg: "审批状态筛选值不合法",
                    data: null,
                };
            }
            approvalAuditorId = auditor.adminId;
            approvalResult = parsedApprovalResult;
            salespersonId = "";
            status = "";
        } else if (!isSalesOrderSuperAdmin(access.role)) {
            salespersonId = access.salespersonId || "";
            if (!salespersonId) {
                setResponseStatus(event, 403);
                return {
                    code: 403,
                    msg: "权限不足",
                    data: null,
                };
            }
        }

        const result = await orderModel.retrieve({
            keyword: toSalesOrderText(query.keyword),
            orderNo: toSalesOrderText(query.orderNo),
            customerId: toSalesOrderText(query.customerId),
            salespersonId,
            approvalAuditorId,
            approvalResult,
            status,
            orderType: toSalesOrderText(query.orderType),
            startDate: toSalesOrderText(query.startDate),
            endDate: toSalesOrderText(query.endDate),
            includeDeleted: query.includeDeleted === "true" || query.includeDeleted === "1",
            deletedOnly,
            includePendingForAudit,
            draftOnly,
            includeDrafts: draftOnly,
            draftOwner: getSalesOrderActor(event),
            page: Number(query.page || 1),
            limit: Number(query.limit || 20),
        });
        const latestInstances = draftOnly
            ? []
            : await useApprovalInstanceModel().findLatestStepsByBusinessIds(
                "sales-order",
                result.list
                    .map((order: any) => order._id)
                    .filter(Boolean),
            );
        const progressMap = new Map(
            latestInstances.map((instance) => [
                instance.businessId.toString(),
                getApprovalProgress(instance.steps),
            ]),
        );
        const list = result.list.map((order: any) => ({
            ...order,
            approvalProgress: progressMap.get(order._id.toString()),
        }));
        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                ...result,
                list,
                access: {
                    canAuditSalesOrder: access.canAuditSalesOrder,
                },
            },
        };
    } catch (err: any) {
        if (err instanceof InventoryHttpError) {
            setResponseStatus(event, err.status);
            return { code: err.code, msg: err.message, data: null };
        }
        logger.error("Retrieve sales order list error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
