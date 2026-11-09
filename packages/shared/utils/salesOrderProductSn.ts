// 新增支持的产品时，同时配置完整的首个可用 S/N；已启用产品的流水不会重置。
export const SALES_ORDER_PRODUCT_SN_STARTS: Record<string, string> = {
    FL110001: "LIB07S41-360-001972",
    FL110004: "LIB07S28-268-002982",
    FL110003: "LIB7S192-226-001554",
    FL110007: "LIB18S82-360-000265",

};

export const PRODUCT_SN_MAX_SERIAL = 999999;
export const PRODUCT_SN_MAX_EXCEL_QUANTITY = 1048575;

export const getSalesOrderProductSnRule = (productCode: string) => {
    if (!Object.prototype.hasOwnProperty.call(SALES_ORDER_PRODUCT_SN_STARTS, productCode)) return null;
    const match = SALES_ORDER_PRODUCT_SN_STARTS[productCode].match(/^(.+-)(\d{6})$/);
    if (!match || Number(match[2]) <= 0) return null;
    return { prefix: match[1], firstSerial: Number(match[2]) };
};

export const formatSalesOrderProductSn = (prefix: string, serial: number) =>
    `${prefix}${String(serial).padStart(6, "0")}`;
