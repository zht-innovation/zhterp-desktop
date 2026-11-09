import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { useSalesOrderStockReservationModel } from "~~/server/models/salesOrderStockReservation.model";
import { isValidObjectId, toObjectId, toText } from "~~/server/services/inventory";

export default defineEventHandler(async (event) => {
    const query = getQuery(event);
    const salesOrderId = toText(query.salesOrderId);
    const salesOrderNo = toText(query.salesOrderNo);
    if (!isValidObjectId(salesOrderId) && !salesOrderNo) {
        setResponseStatus(event, 400);
        return { code: CODE.INVALID_PARAMS, msg: "缺少销售订单" };
    }
    const model = useSalesOrderStockReservationModel();
    const list = isValidObjectId(salesOrderId)
        ? await model.listBySalesOrder(salesOrderId)
        : await model.listActiveByOrderNo(salesOrderNo);
    const orderFilter = isValidObjectId(salesOrderId)
        ? { _id: toObjectId(salesOrderId) }
        : { orderNo: salesOrderNo };
    const order = await useSalesOrderModel().order
        .findOne({ ...orderFilter, _isDeleted: { $ne: true } })
        .select("orderRemark remark")
        .lean();
    return {
        code: CODE.SUCCESS,
        msg: codeToMsg[CODE.SUCCESS],
        data: {
            list,
            orderRemark: order?.orderRemark || order?.remark || "",
        },
    };
});
