const ORDER_APPROVAL_FIELD_GROUPS_V1 = [
    {
        label: "客户信息",
        fields: [
            { key: "customerName", label: "客户姓名" },
            { key: "customerCompany", label: "客户公司" },
            { key: "customerRegion", label: "区域" },
        ],
    },
    {
        label: "订单信息",
        fields: [
            { key: "orderNo", label: "订单编号" },
            { key: "orderType", label: "订单类型" },
            { key: "amount", label: "PI 总金额" },
            { key: "currency", label: "币种" },
            { key: "machineNo", label: "机器号" },
            { key: "sampleRequirement", label: "非标要求" },
            { key: "installationRequirement", label: "安装要求" },
            { key: "testingRequirement", label: "测试要求" },
            { key: "orderRemark", label: "订单备注" },
            { key: "hasShootingTask", label: "是否需要拍摄" },
            { key: "shootingRequirement", label: "拍摄要求" },
            { key: "orderImages", label: "订单图片" },
        ],
    },
    {
        label: "合同信息",
        fields: [
            { key: "contractNo", label: "合同编号" },
            { key: "orderDate", label: "下单日期" },
            { key: "durationDays", label: "合同交期" },
            { key: "invoiceStatus", label: "发票状态" },
            { key: "attachments", label: "附件" },
        ],
    },
    {
        label: "产品明细",
        fields: [
            { key: "productCode", label: "产品编号" },
            { key: "productModel", label: "型号" },
            { key: "productImage", label: "产品图片" },
            { key: "salePrice", label: "销售单价" },
            { key: "availableQuantity", label: "可用数量" },
            { key: "unitName", label: "单位" },
            { key: "quantity", label: "销售数量" },
            { key: "totalPrice", label: "销售总价" },
            { key: "source", label: "来源" },
            { key: "productMachineNo", label: "产品机器号" },
            { key: "productRemark", label: "产品备注" },
        ],
    },
] as const;

const RECEIVABLE_APPROVAL_FIELD_GROUP = {
    label: "应收单",
    fields: [
        { key: "receivableOrder", label: "应收单号" },
        { key: "receivableDate", label: "应收日期" },
        { key: "incomeCategory", label: "收入类别" },
        { key: "actualReceivableAmount", label: "实际应收" },
        { key: "receivedAmount", label: "已收金额" },
        { key: "plannedPayments", label: "计划回款" },
        { key: "receivableRemark", label: "应收备注" },
        { key: "receivableAttachments", label: "应收附件" },
    ],
} as const;

export const ORDER_APPROVAL_FIELD_GROUPS = [
    ...ORDER_APPROVAL_FIELD_GROUPS_V1,
    RECEIVABLE_APPROVAL_FIELD_GROUP,
] as const;

export type OrderApprovalField =
    typeof ORDER_APPROVAL_FIELD_GROUPS[number]["fields"][number]["key"];

export const ORDER_APPROVAL_VISIBLE_FIELDS_VERSION = 2;

// 固定旧版字段集合，避免把新版主动取消应收字段的配置当成旧版全选。
export const ORDER_APPROVAL_FIELDS_V1: OrderApprovalField[] =
    ORDER_APPROVAL_FIELD_GROUPS_V1.flatMap((group) => group.fields.map((field) => field.key));

export const RECEIVABLE_APPROVAL_FIELDS: OrderApprovalField[] =
    RECEIVABLE_APPROVAL_FIELD_GROUP.fields.map((field) => field.key);

export const SHOOTING_CC_VISIBLE_FIELDS: OrderApprovalField[] = [
    "orderNo",
    "orderType",
    "machineNo",
    "testingRequirement",
    "installationRequirement",
    "sampleRequirement",
    "orderRemark",
    "orderImages",
    "hasShootingTask",
    "shootingRequirement",
    "durationDays",
];

export const ORDER_APPROVAL_FIELDS: OrderApprovalField[] =
    ORDER_APPROVAL_FIELD_GROUPS.flatMap((group) => group.fields.map((field) => field.key));

export const isOrderApprovalField = (value: unknown): value is OrderApprovalField =>
    typeof value === "string" && ORDER_APPROVAL_FIELDS.includes(value as OrderApprovalField);

export const normalizeOrderVisibleFields = (fields?: readonly OrderApprovalField[]) =>
    fields === undefined
        ? [...ORDER_APPROVAL_FIELDS]
        : ORDER_APPROVAL_FIELDS.filter((field) => fields.includes(field));

export const resolveOrderVisibleFields = (
    fields?: readonly OrderApprovalField[],
    version = 1,
) => {
    if (version === 1 && fields !== undefined) {
        const selected = new Set(fields);
        if (selected.size === ORDER_APPROVAL_FIELDS_V1.length
            && ORDER_APPROVAL_FIELDS_V1.every((field) => selected.has(field))) {
            return [...ORDER_APPROVAL_FIELDS];
        }
    }
    return normalizeOrderVisibleFields(fields);
};

export const normalizeShootingCcVisibleFields = (fields?: readonly OrderApprovalField[]) =>
    fields === undefined
        ? [...SHOOTING_CC_VISIBLE_FIELDS]
        : SHOOTING_CC_VISIBLE_FIELDS.filter((field) => fields.includes(field));
