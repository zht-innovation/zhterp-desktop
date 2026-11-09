import mongoose from "mongoose";
import {
    getSalesOrderAccess,
    getSalesOrderActor,
    isSalesOrderSuperAdmin,
    toSalesOrderText,
} from "~~/server/services/salesOrderAccess";
import { createApprovalInstance } from "~~/server/services/approvalInstance";
import { normalizeHeader, toBoolean, toNumber } from "~~/server/services/inventory";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { logger } from "~~/server/utils/logger";

type ImportError = {
    row: number;
    message: string;
};

const headerMap: Record<string, string> = {
    "订单编号": "orderNo",
    "订单编码": "orderNo",
    "orderno": "orderNo",
    "客户id": "customerId",
    "customerid": "customerId",
    "客户姓名": "customerName",
    "客户名称": "customerName",
    "customername": "customerName",
    "客户公司": "customerCompany",
    "公司": "customerCompany",
    "客户区域": "customerRegion",
    "客户地区": "customerRegion",
    "区域": "customerRegion",
    "地区": "customerRegion",
    "销售员id": "salespersonId",
    "salespersonid": "salespersonId",
    "销售员": "salespersonName",
    "salespersonname": "salespersonName",
    "订单类型": "orderType",
    "ordertype": "orderType",
    "审核通过后状态": "approvalTargetStatus",
    "approvaltargetstatus": "approvalTargetStatus",
    "订单总金额": "amount",
    "销售合同/pi总金额": "amount",
    "销售合同/pi金额": "amount",
    "pi总金额": "amount",
    "pi金额": "amount",
    "合同金额": "amount",
    "金额": "amount",
    "amount": "amount",
    "币种": "currency",
    "currency": "currency",
    "下单日期": "orderDate",
    "订单日期": "orderDate",
    "orderdate": "orderDate",
    "工期": "durationDays",
    "工期天数": "durationDays",
    "durationdays": "durationDays",
    "机器号": "machineNo",
    "machineno": "machineNo",
    "发票状态": "invoiceStatus",
    "invoicestatus": "invoiceStatus",
    "合同编号": "contractNo",
    "contractno": "contractNo",
    "附件(json)": "attachments",
    "附件": "attachments",
    "attachments": "attachments",
    "非标要求": "sampleRequirement",
    "样板要求": "sampleRequirement",
    "samplerequirement": "sampleRequirement",
    "安装要求": "installationRequirement",
    "installationrequirement": "installationRequirement",
    "测试要求": "testingRequirement",
    "testingrequirement": "testingRequirement",
    "订单备注": "orderRemark",
    "orderremark": "orderRemark",
    "备注": "orderRemark",
    "回款进度": "paymentProgress",
    "paymentprogress": "paymentProgress",
    "是否有应收单": "hasReceivable",
    "hasreceivable": "hasReceivable",
    "应收单编号": "receivableOrder",
    "receivableorder": "receivableOrder",
    "应收日期": "receivableDate",
    "receivabledate": "receivableDate",
    "收入类别": "incomeCategory",
    "incomecategory": "incomeCategory",
    "计划回款日期": "plannedPaymentDate",
    "plannedpaymentdate": "plannedPaymentDate",
    "计划回款金额": "plannedPaymentAmount",
    "plannedpaymentamount": "plannedPaymentAmount",
    "回款计划(json)": "plannedPayments",
    "plannedpayments": "plannedPayments",
    "应收备注": "receivableRemark",
    "receivableremark": "receivableRemark",
    "应收附件(json)": "receivableAttachments",
    "应收附件": "receivableAttachments",
    "receivableattachments": "receivableAttachments",
    "创建人": "creator",
    "creator": "creator",
    "产品明细(json)": "products",
    "产品明细": "products",
    "products": "products",
};

const orderTypeSet = new Set(["机架", "机架动力套", "整机+配件", "电池", "其他"]);

const parseJsonArray = (value: unknown) => {
    const text = toSalesOrderText(value);
    if (!text) return [];

    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const normalizeOrderDate = (value: unknown) => {
    const text = toSalesOrderText(value);
    if (!text) return "";
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
        throw new Error("日期格式不正确");
    }
    return text;
};

const mapRow = (row: Record<string, unknown>) => {
    const mapped: Record<string, any> = {};
    for (const [key, value] of Object.entries(row)) {
        const field = headerMap[normalizeHeader(key)];
        if (!field) continue;
        mapped[field] = toSalesOrderText(value);
    }

    if (mapped.plannedPayments) {
        // 多组计划由模型统一解析校验，旧汇总列不再参与本行的回款计划。
        delete mapped.plannedPaymentDate;
        delete mapped.plannedPaymentAmount;
    } else {
        delete mapped.plannedPayments;
    }

    for (const field of ["amount", "durationDays", "paymentProgress", "plannedPaymentAmount"]) {
        if (mapped[field] !== undefined) {
            mapped[field] = toNumber(String(mapped[field]).replace(/,/g, ""), field === "durationDays" ? 0 : 0);
        }
    }
    if (mapped.hasReceivable !== undefined) {
        mapped.hasReceivable = toBoolean(mapped.hasReceivable, false);
    }
    if (mapped.products !== undefined) {
        mapped.products = parseJsonArray(mapped.products);
    }
    if (mapped.attachments !== undefined) {
        mapped.attachments = parseJsonArray(mapped.attachments);
    }
    if (mapped.receivableAttachments !== undefined) {
        mapped.receivableAttachments = parseJsonArray(mapped.receivableAttachments);
    }
    for (const field of ["orderDate", "receivableDate", "plannedPaymentDate"]) {
        if (mapped[field]) {
            mapped[field] = normalizeOrderDate(mapped[field]);
        }
    }

    return mapped;
};

export default defineEventHandler(async (event) => {
    try {
        const formData = await readMultipartFormData(event);
        if (!formData) {
            setResponseStatus(event, 400);
            return {
                code: CODE.INVALID_PARAMS,
                msg: codeToMsg[CODE.INVALID_PARAMS],
            };
        }

        const filePart = formData.find((part) => part.filename && ["file", "excel"].includes(part.name || ""));
        if (!filePart?.data) {
            setResponseStatus(event, 400);
            return {
                code: CODE.INVALID_PARAMS,
                msg: "缺少上传文件",
            };
        }

        const XLSX = await import("xlsx");
        const workbook = XLSX.read(filePart.data, { type: "buffer", codepage: 65001 });
        const sheetName = workbook.SheetNames?.[0];
        if (!sheetName) {
            setResponseStatus(event, 400);
            return {
                code: CODE.INVALID_PARAMS,
                msg: "未找到可用的工作表",
            };
        }

        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
            defval: "",
            raw: false,
        });
        if (!rows.length) {
            setResponseStatus(event, 400);
            return {
                code: CODE.INVALID_PARAMS,
                msg: "文件中没有可导入的数据",
            };
        }

        const access = await getSalesOrderAccess(event.context.auth);
        if (!isSalesOrderSuperAdmin(access.role) && !access.salespersonId) {
            setResponseStatus(event, 403);
            return {
                code: 403,
                msg: "权限不足",
            };
        }
        const applicantId = access.adminId;
        if (!applicantId) {
            setResponseStatus(event, 400);
            return {
                code: CODE.INVALID_PARAMS,
                msg: "当前登录用户不存在",
            };
        }

        const errors: ImportError[] = [];
        const validRows: Array<{ rowNumber: number; payload: Record<string, any> }> = [];

        for (let index = 0; index < rows.length; index += 1) {
            const row = rows[index];
            const rowNumber = index + 2;
            if (!Object.values(row).some((value) => toSalesOrderText(value))) continue;

            try {
                const payload = mapRow(row);
                if (!payload.customerId) {
                    throw new Error("缺少客户ID");
                }
                if (!payload.orderType) {
                    throw new Error("缺少订单类型");
                }
                if (!orderTypeSet.has(payload.orderType)) {
                    throw new Error("订单类型只能为机架、机架动力套、整机+配件、电池、其他");
                }
                if (!isSalesOrderSuperAdmin(access.role)) {
                    payload.salespersonId = access.salespersonId;
                }
                validRows.push({ rowNumber, payload });
            } catch (err: any) {
                errors.push({
                    row: rowNumber,
                    message: err?.message || "校验失败",
                });
            }
        }

        const orderModel = useSalesOrderModel();
        const actor = getSalesOrderActor(event);
        let successCount = 0;
        for (const { rowNumber, payload } of validRows) {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    const created = await orderModel.create(payload, actor, session);
                    await createApprovalInstance({
                        type: "sales-order",
                        businessId: created._id,
                        businessSnapshot: created.toObject(),
                        applicantId,
                        session,
                    });
                });
                successCount += 1;
            } catch (err: any) {
                errors.push({
                    row: rowNumber,
                    message: err?.message || "导入失败",
                });
            } finally {
                await session.endSession();
            }
        }

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                totalCount: validRows.length + errors.length,
                successCount,
                failCount: errors.length,
                errors,
            },
        };
    } catch (err: any) {
        logger.error("Import sales order error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: err?.message || codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
