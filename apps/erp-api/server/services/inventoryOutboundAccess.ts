import { ADMIN_ROLE } from "~~/shared/enums";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { InventoryHttpError, isValidObjectId, toObjectId, toText } from "./inventory";
import { getSalesOrderAccess } from "./salesOrderAccess";

export type InventoryOutboundReadScope = {
    salesOrderIds?: string[];
};

export const getInventoryOutboundReadScope = async (auth: any): Promise<InventoryOutboundReadScope> => {
    const access = await getSalesOrderAccess(auth);
    if (Number(auth?.role) !== ADMIN_ROLE.SELLER && access.role !== ADMIN_ROLE.SELLER) return {};

    if (!isValidObjectId(access.salespersonId)) {
        throw new InventoryHttpError(403, 403, "未关联有效销售账号，无法查看个人订单出库单");
    }

    const orders = await useSalesOrderModel().order.find({
        salespersonId: toObjectId(access.salespersonId),
        _isDeleted: { $ne: true },
    }).select("_id").lean();

    return {
        salesOrderIds: orders.map((order: any) => toText(order._id)),
    };
};
