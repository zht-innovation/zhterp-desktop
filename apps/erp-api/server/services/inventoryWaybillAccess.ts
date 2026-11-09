import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { isSellerInventoryReadonly } from "~~/shared/utils/adminPermission";
import { InventoryHttpError, isValidObjectId, toObjectId, toText } from "./inventory";
import { getSalesOrderAccess } from "./salesOrderAccess";

export type InventoryWaybillReadScope = {
    relatedOrderNos?: string[];
};

const getWaybillAccess = async (auth: any) => {
    if (!auth?.username) {
        throw new InventoryHttpError(401, 401, "请先登录");
    }

    const access = await getSalesOrderAccess(auth);
    return {
        ...access,
        isSeller: isSellerInventoryReadonly(Number(auth.role))
            || isSellerInventoryReadonly(access.role),
    };
};

export const getInventoryWaybillReadScope = async (auth: any): Promise<InventoryWaybillReadScope> => {
    const access = await getWaybillAccess(auth);
    if (!access.isSeller) return {};

    if (!isValidObjectId(access.salespersonId)) {
        throw new InventoryHttpError(403, 403, "未关联有效销售账号，无法查看个人订单运单");
    }

    const salespersonId = toObjectId(access.salespersonId);
    const orderModel = useSalesOrderModel().order;
    const orders = await orderModel.find({
        salespersonId,
        _isDeleted: { $ne: true },
    }).select("orderNo").lean();
    const orderNos = new Set<string>();
    for (const order of orders) {
        const orderNo = toText(order.orderNo);
        if (orderNo) orderNos.add(orderNo);
    }
    if (!orderNos.size) return { relatedOrderNos: [] };

    // 订单号没有唯一约束，其他销售（含历史删除订单）的同号记录不能用于授权。
    const conflicts = await orderModel.find({
        orderNo: { $in: [...orderNos] },
        salespersonId: { $ne: salespersonId },
    }).select("orderNo").lean();
    for (const order of conflicts) {
        orderNos.delete(toText(order.orderNo));
    }

    return { relatedOrderNos: [...orderNos] };
};

export const assertInventoryWaybillReadView = (
    scope: InventoryWaybillReadScope,
    query: Record<string, unknown>,
) => {
    if (scope.relatedOrderNos === undefined) return;
    if (toText(query.direction) === "receive" || toText(query.view) === "purchase-logistics") {
        throw new InventoryHttpError(403, 403, "销售仅可查看本人订单寄件记录");
    }
};

export const assertInventoryWaybillFullReadAccess = async (auth: any) => {
    const access = await getWaybillAccess(auth);
    if (access.isSeller) {
        throw new InventoryHttpError(403, 403, "销售不可查看运单原始文件或物流轨迹");
    }
};

const maskMiddle = (text: string, head: number, tail: number) => {
    const chars = Array.from(text.replace(/\s/g, ""));
    if (!chars.length) return "";
    if (chars.length === 1) return "※";
    if (chars.length === 2) return `${chars[0]}※`;
    if (chars.length <= head + tail) {
        head = 1;
        tail = 1;
    }
    return chars.slice(0, head).join("")
        + "※".repeat(chars.length - head - tail)
        + chars.slice(-tail).join("");
};

export const maskInventoryWaybillContact = (value: unknown, isAddress = false) => {
    const text = toText(value);
    const head = isAddress ? 6 : 1;
    const tail = isAddress ? 4 : 1;
    let result = "";
    let cursor = 0;
    // 历史收件人、地址中可能混写手机或座机，先独立打码号码，再处理其余文本。
    for (const match of text.matchAll(/(?<!\d)\+?\d(?:[ -]?\d){6,14}(?!\d)/g)) {
        const index = match.index!;
        result += maskMiddle(text.slice(cursor, index), head, tail);
        result += maskMiddle(match[0].replace(/\D/g, ""), 3, 4);
        cursor = index + match[0].length;
    }
    return result + maskMiddle(text.slice(cursor), head, tail);
};

export const sanitizeInventoryWaybillForRead = (item: any, scope: InventoryWaybillReadScope) => {
    if (!item || scope.relatedOrderNos === undefined) return item;

    // 白名单避免面单 URL、备注、轨迹和预留字段绕过收件信息脱敏。
    const result: Record<string, any> = {};
    const fields = [
        "_id", "direction", "waybillNo", "company", "trackingNo", "relatedOrderNo",
        "salesperson", "goods", "businessType", "sentAt", "senderAddress",
        "needsSupplement", "createTime", "updateTime", "createdBy", "updatedBy",
    ];
    for (const field of fields) {
        if (Object.hasOwn(item, field)) result[field] = item[field];
    }
    result.receiverName = maskInventoryWaybillContact(item.receiverName);
    result.receiverAddress = maskInventoryWaybillContact(item.receiverAddress, true);
    return result;
};
