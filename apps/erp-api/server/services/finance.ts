import { CODE, codeToMsg } from "~~/server/utils/code";

// 重用 inventory 的工具函数
export {
    isValidObjectId,
    toObjectId,
    toText,
    toNumber,
    getPageParams,
    escapeRegExp,
} from "~~/server/services/inventory";

export class FinanceHttpError extends Error {
    status: number;
    code: CODE;

    constructor(status: number, code: CODE, message?: string) {
        super(message || codeToMsg[code] || codeToMsg[CODE.SERVER_ERROR]);
        this.status = status;
        this.code = code;
    }
}

export const throwFinanceError = (status: number, code: CODE, message?: string): never => {
    throw new FinanceHttpError(status, code, message);
};

export const getFinanceActor = (event: any) => {
    const auth = event.context?.auth || {};
    return auth.nickname || auth.username || "";
};
