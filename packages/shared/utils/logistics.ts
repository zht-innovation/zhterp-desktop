const courierCodes: Record<string, string> = {
    "顺丰": "SF", "顺丰速运": "SF", "顺丰快递": "SF",
    "京东": "JD", "京东物流": "JD", "京东快递": "JD",
    "中通": "ZTO", "中通快递": "ZTO",
    "申通": "STO", "申通快递": "STO",
    "圆通": "YTO", "圆通速递": "YTO", "圆通快递": "YTO",
    "韵达": "YD", "韵达快递": "YD",
    "极兔": "JTSD", "极兔速递": "JTSD",
    "邮政": "YZPY", "邮政快递": "YZPY", "邮政包裹": "YZPY", "中国邮政": "YZPY",
    "EMS": "EMS", "邮政EMS": "EMS",
    "德邦": "DBL", "德邦快递": "DBL", "德邦物流": "DBL",
    "跨越速运": "KYSY",
};

export const getCourierCode = (company: string) => courierCodes[company.trim()] || "";

export const parsePlatformOrderNos = (value: string) =>
    [...new Set(value.split(/[\s,，;；、]+/).map((item) => item.trim()).filter(Boolean))];

export const platformOrderNosError = (values: string[]) => {
    if (!values.length) return "请填写淘宝订单号";
    if (values.length > 20) return "一次最多关联20个淘宝订单";
    if (values.some((value) => !/^\d{12,24}$/.test(value))) return "淘宝订单号必须是12～24位数字";
    return "";
};
