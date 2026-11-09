import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import {
    getSalesOrderAccess,
    isSalesOrderSuperAdmin,
    toSalesOrderText,
} from "~~/server/services/salesOrderAccess";
import { logger } from "~~/server/utils/logger";
import { getSalesOrderPaymentPlans, getSalesOrderPaymentTotals } from "~~/shared/utils/salesOrderPayment";

const formatDate = (value: unknown) => {
    if (!value) return "";
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const formatProducts = (products: unknown) => {
    if (!Array.isArray(products) || products.length === 0) return "";
    return JSON.stringify(products);
};

const formatJsonArray = (value: unknown) => {
    if (!Array.isArray(value) || value.length === 0) return "";
    return JSON.stringify(value);
};

const exportHeaders = [
    "订单编号",
    "客户ID",
    "客户姓名",
    "客户公司",
    "客户区域",
    "销售员ID",
    "销售员",
    "订单状态",
    "审核通过后状态",
    "订单类型",
    "订单总金额",
    "币种",
    "下单日期",
    "工期天数",
    "机器号",
    "发票状态",
    "合同编号",
    "附件(JSON)",
    "非标要求",
    "安装要求",
    "测试要求",
    "订单备注",
    "回款进度",
    "是否有应收单",
    "应收单编号",
    "应收日期",
    "收入类别",
    "计划回款日期",
    "计划回款金额",
    "计划回款分币种合计",
    "应收备注",
    "应收附件(JSON)",
    "创建人",
    "产品明细(JSON)",
    "回款计划(JSON)",
];

const getPaymentPlanExportFields = (item: any) => {
    const plans = getSalesOrderPaymentPlans(item);
    const currency = String(item.currency || "").trim().toUpperCase();
    let totalAmount = 0;
    const totals: string[] = [];
    for (const total of getSalesOrderPaymentTotals(item)) {
        if (total.currency === currency) totalAmount = total.amount;
        totals.push(`${total.currency || "未指定币种"} ${total.amount}`);
    }
    return {
        "计划回款日期": formatDate(plans[0]?.date),
        "计划回款金额": totalAmount,
        "计划回款分币种合计": totals.join("；"),
        "回款计划(JSON)": formatJsonArray(plans.map((plan) => ({
            date: formatDate(plan.date) || null,
            amount: plan.amount,
            currency: plan.currency,
        }))),
    };
};

const toExportRow = (item: any) => ({
    "订单编号": item.orderNo || "",
    "客户ID": item.customerId?.toString?.() || "",
    "客户姓名": item.customerName || "",
    "客户公司": item.customerCompany || "",
    "客户区域": item.customerRegion || "",
    "销售员ID": item.salespersonId?.toString?.() || "",
    "销售员": item.salespersonName || "",
    "订单状态": item.status || "",
    "审核通过后状态": item.approvalTargetStatus || "",
    "订单类型": item.orderType || "",
    "订单总金额": item.amount ?? 0,
    "币种": item.currency || "",
    "下单日期": formatDate(item.orderDate),
    "工期天数": item.durationDays ?? 0,
    "机器号": item.machineNo || "",
    "发票状态": item.invoiceStatus || "",
    "合同编号": item.contractNo || "",
    "附件(JSON)": formatJsonArray(item.attachments),
    "非标要求": item.sampleRequirement || "",
    "安装要求": item.installationRequirement || "",
    "测试要求": item.testingRequirement || "",
    "订单备注": item.orderRemark || item.remark || "",
    "回款进度": item.paymentProgress ?? 0,
    "是否有应收单": item.hasReceivable || item.receivableOrder ? "是" : "否",
    "应收单编号": item.receivableOrder || "",
    "应收日期": formatDate(item.receivableDate),
    "收入类别": item.incomeCategory || "",
    ...getPaymentPlanExportFields(item),
    "应收备注": item.receivableRemark || "",
    "应收附件(JSON)": formatJsonArray(item.receivableAttachments),
    "创建人": item.creator || item.createdBy || "",
    "产品明细(JSON)": formatProducts(item.products),
});

const getScopedQuery = async (event: any) => {
    const query = getQuery(event);
    const access = await getSalesOrderAccess(event.context.auth);
    let salespersonId = toSalesOrderText(query.salespersonId);
    let status = toSalesOrderText(query.status);
    let includePendingForAudit = false;

    if (!isSalesOrderSuperAdmin(access.role) && access.canAuditSalesOrder && !access.salespersonId) {
        salespersonId = "";
        status = "待审核";
    } else if (!isSalesOrderSuperAdmin(access.role)) {
        salespersonId = access.salespersonId || "";
        if (!salespersonId) {
            throw createError({
                statusCode: 403,
                statusMessage: "权限不足",
            });
        }
        includePendingForAudit = Boolean(access.canAuditSalesOrder);
    }

    return {
        keyword: toSalesOrderText(query.keyword),
        orderNo: toSalesOrderText(query.orderNo),
        customerId: toSalesOrderText(query.customerId),
        salespersonId,
        status,
        orderType: toSalesOrderText(query.orderType),
        startDate: toSalesOrderText(query.startDate),
        endDate: toSalesOrderText(query.endDate),
        includeDeleted: query.includeDeleted === "true" || query.includeDeleted === "1",
        includePendingForAudit,
    };
};

export default defineEventHandler(async (event) => {
    try {
        const scopedQuery = await getScopedQuery(event);
        const orderModel = useSalesOrderModel();
        const list: any[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 100) {
            const result = await orderModel.retrieve({
                ...scopedQuery,
                page,
                limit: 100,
            });
            list.push(...result.list);
            hasMore = Boolean(result.pagination.hasMore);
            page += 1;
        }

        const XLSX = await import("xlsx");
        const worksheet = XLSX.utils.aoa_to_sheet([exportHeaders]);
        XLSX.utils.sheet_add_json(worksheet, list.map(toExportRow), {
            header: exportHeaders,
            skipHeader: true,
            origin: "A2",
        });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "订单记录");
        const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

        setHeader(
            event,
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        );
        setHeader(event, "Content-Disposition", "attachment; filename=sales-orders.xlsx");
        setResponseStatus(event, 200);
        return buffer;
    } catch (err: any) {
        logger.error("Export sales order error", err);
        setResponseStatus(event, err?.statusCode || 500);
        return {
            code: err?.statusCode || CODE.SERVER_ERROR,
            msg: err?.statusMessage || err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
