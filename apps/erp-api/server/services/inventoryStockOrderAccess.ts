import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { isValidObjectId, toObjectId, toText } from "./inventory";
import { getSalesOrderAccess, isSalesOrderSuperAdmin } from "./salesOrderAccess";
import { buildSalesOrderApprovalFilter } from "./salesOrderApproval";

export async function getVisibleInventoryOrderNumbers(auth: any, orderIds: string[]): Promise<Map<string, string>> {
    const visibleOrderNumbers = new Map<string, string>();
    if (!orderIds.length) return visibleOrderNumbers;

    const access = await getSalesOrderAccess(auth);
    const visibilityFilters: Array<Record<string, any>> = [];
    if (isValidObjectId(access.salespersonId)) {
        visibilityFilters.push({ salespersonId: toObjectId(access.salespersonId) });
    }
    if (access.canAuditSalesOrder && isValidObjectId(access.adminId)) {
        visibilityFilters.push(buildSalesOrderApprovalFilter(
            toObjectId(access.adminId),
            "approved",
        ));
    }
    if (isSalesOrderSuperAdmin(access.role) || visibilityFilters.length) {
        const ids = [...new Set(orderIds)];
        const orderFilter: Record<string, any> = {
            _id: { $in: ids.filter((id) => isValidObjectId(id)).map((id) => toObjectId(id)) },
            _isDeleted: { $ne: true },
            status: { $ne: "草稿" },
        };
        if (!isSalesOrderSuperAdmin(access.role)) {
            orderFilter.$or = visibilityFilters;
        }
        const orders = await useSalesOrderModel().order
            .find(orderFilter).select("_id orderNo").lean() as any[];
        for (const order of orders) {
            const orderNo = toText(order.orderNo);
            if (orderNo) visibleOrderNumbers.set(toText(order._id), orderNo);
        }
    }

    return visibleOrderNumbers;
}
