import type { ApprovalInstanceData } from "../models/approvalInstance.model";
import {
    normalizeOrderVisibleFields,
    resolveOrderVisibleFields,
    RECEIVABLE_APPROVAL_FIELDS,
    SHOOTING_CC_VISIBLE_FIELDS,
    type OrderApprovalField,
} from "~~/shared/types/orderApproval";
import { getSalesOrderPaymentPlans } from "~~/shared/utils/salesOrderPayment";
import { getSalesOrderDeliveryDate } from "~~/shared/utils/salesOrderDelivery";

export const getOrderVisibleFields = (
    instance: Pick<ApprovalInstanceData, "applicant" | "steps">,
    adminId: string,
) => {
    if (instance.applicant.adminId.toString() === adminId) return normalizeOrderVisibleFields();
    const steps = (instance.steps || []).filter((step) =>
        step.users.some((item) => item.user.adminId.toString() === adminId),
    );
    if (steps.length === 0) return normalizeOrderVisibleFields();
    let fields: OrderApprovalField[] | undefined;
    for (const step of steps) {
        const normalized = resolveOrderVisibleFields(step.visibleFields, step.visibleFieldsVersion);
        const current = step.key === "shooting-cc"
            ? normalized.filter((field) => SHOOTING_CC_VISIBLE_FIELDS.includes(field))
            : normalized;
        fields = fields === undefined ? current : fields.filter((field) => current.includes(field));
    }
    return fields || normalizeOrderVisibleFields();
};

export const redactOrderDetail = (detail: any, fields: OrderApprovalField[]) => {
    const allowed = new Set(fields);
    const order = detail.order;
    const scalarMap: Record<string, string> = {
        customerName: "customerName", customerCompany: "customerCompany", customerRegion: "customerRegion",
        orderNo: "orderNo", orderType: "orderType", amount: "amount", currency: "currency", machineNo: "machineNo",
        sampleRequirement: "sampleRequirement", installationRequirement: "installationRequirement",
        testingRequirement: "testingRequirement", orderRemark: "orderRemark", orderImages: "orderImages",
        hasShootingTask: "hasShootingTask", shootingRequirement: "shootingRequirement",
        contractNo: "contractNo", orderDate: "orderDate", durationDays: "durationDays", invoiceStatus: "invoiceStatus",
        attachments: "attachments", receivableOrder: "receivableOrder", receivableDate: "receivableDate",
        incomeCategory: "incomeCategory", receivedAmount: "receivedAmount", receivableRemark: "receivableRemark",
        receivableAttachments: "receivableAttachments",
    };
    const output = { id: order.id, createTime: order.createTime } as Record<string, any>;
    for (const [field, key] of Object.entries(scalarMap)) {
        if (allowed.has(field as OrderApprovalField)) {
            output[key] = order[key];
            if (field === "durationDays") output.contractDeliveryDate = getSalesOrderDeliveryDate(order);
        }
    }
    if (RECEIVABLE_APPROVAL_FIELDS.some((field) => allowed.has(field))) {
        output.hasReceivable = Boolean(order.hasReceivable || order.receivableOrder);
    }
    // 两种详情响应均只使用提交时的快照，避免带入订单当前累计回款。
    if (allowed.has("actualReceivableAmount")) output.actualReceivableAmount = order.actualReceivableAmount ?? order.amount;
    if (allowed.has("plannedPayments")) output.plannedPayments = getSalesOrderPaymentPlans(order);

    const productFields: Record<string, string> = {
        productCode: "productCode", productModel: "model", productImage: "image", salePrice: "salePrice",
        availableQuantity: "availableQuantity", unitName: "unitName", quantity: "quantity", totalPrice: "totalPrice",
        source: "source", productMachineNo: "machineNo", productRemark: "remark",
    };
    if (Object.keys(productFields).some((field) => allowed.has(field as OrderApprovalField))) {
        output.products = (order.products || []).map((product: Record<string, any>) => {
            const item: Record<string, any> = {};
            for (const [field, key] of Object.entries(productFields)) {
                if (allowed.has(field as OrderApprovalField)) item[key] = product[key];
            }
            return item;
        });
    }
    return { ...detail, order: output, visibleFields: fields };
};
