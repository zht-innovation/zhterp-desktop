import { useCustomerModel } from "~~/server/models/customer.model";
import { useCustomerTermModel } from "~~/server/models/customerTerm.model";
import { logger } from "~~/server/utils/logger";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const customerId = typeof query.customerId === "string" ? query.customerId : "";
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

        if (!customerId) {
            setResponseStatus(event, 400);
            return {
                code: CODE.INVALID_PARAMS,
                msg: "缺少客户ID",
            };
        }

        const customerModel = useCustomerModel();
        const customer = await customerModel.customer
            .findById(customerId)
            .select("_isFakeDel");

        if (!customer || customer._isFakeDel) {
            setResponseStatus(event, 404);
            return {
                code: CODE.SERVER_ERROR,
                msg: "客户不存在",
            };
        }

        const termModel = useCustomerTermModel();
        const { records, total } = await termModel.retrieve(customerId, page, limit);

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                records,
                pagination: {
                    page,
                    limit,
                    total,
                    hasMore: page * limit < total,
                },
            },
        };
    } catch (err: any) {
        logger.error("Retrieve customer term history error", err);
        setResponseStatus(event, 500);
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
