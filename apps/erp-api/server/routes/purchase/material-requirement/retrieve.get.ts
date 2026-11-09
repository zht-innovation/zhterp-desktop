import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { usePurchaseMaterialRequirementModel } from "~~/server/models/purchaseMaterialRequirement.model";
import { useSalesOrderModel } from "~~/server/models/salesOrder.model";
import { logger } from "~~/server/utils/logger";
import { canSelectSalesOrderForPurchaseRequest, canSubmitPurchaseRequest, isElectronicsWarehouseKeeper } from "~~/shared/utils/adminPermission";
import { useAdminModel } from "~~/server/models/admin.model";
import { previewPurchaseRequestBom } from "~~/server/services/purchaseRequestBom";

export default defineEventHandler(async (event) => {
    try {
        const query = getQuery(event);
        const purchaseRequestPicker = query.purchaseRequestPicker === "true"
            || query.purchaseRequestPicker === "1";
        const purchaseRequestBomPreview = query.purchaseRequestBomPreview === "true"
            || query.purchaseRequestBomPreview === "1";
        const role = Number(event.context.auth?.role);
        if (purchaseRequestPicker || purchaseRequestBomPreview) {
            if (purchaseRequestBomPreview ? !canSubmitPurchaseRequest(role) : !canSelectSalesOrderForPurchaseRequest(role)) {
                setResponseStatus(event, 403);
                return {
                    code: 403,
                    msg: "当前角色不能选择销售订单采购订单",
                    data: null,
                };
            }

            if (purchaseRequestBomPreview) {
                const draftId = toText(query.requestId);
                let adminId = "";
                if (draftId) {
                    const username = toText(event.context.auth?.username);
                    const admin = username ? await useAdminModel().findAdminByUsername(username) : null;
                    if (!admin) throw new InventoryHttpError(401, 401, "当前登录用户不存在");
                    adminId = admin._id.toString();
                }
                const preview = await previewPurchaseRequestBom(toText(query.salesOrderId), { draftId, adminId });
                setResponseStatus(event, 200);
                return { code: CODE.SUCCESS, msg: codeToMsg[CODE.SUCCESS], data: preview };
            }

            const result = await useSalesOrderModel().retrieve({
                status: "待采购,生产中",
                page: Number(query.page || 1),
                limit: Number(query.limit || 100),
            });
            setResponseStatus(event, 200);
            return {
                code: CODE.SUCCESS,
                msg: codeToMsg[CODE.SUCCESS],
                data: result,
            };
        }

        if (isElectronicsWarehouseKeeper(role)) {
            throw new InventoryHttpError(403, 403, "当前角色仅可查询采购申请关联订单或 BOM 预览");
        }
        const result = await usePurchaseMaterialRequirementModel().retrieve({
            keyword: toText(query.keyword),
            productId: toText(query.productId),
            salesOrderId: toText(query.salesOrderId),
            salesOrderNo: toText(query.salesOrderNo),
            demandType: toText(query.demandType),
            status: toText(query.status),
            source: toText(query.source),
            page: Number(query.page || 1),
            limit: Number(query.limit || 20),
        });

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: result,
        };
    } catch (err: any) {
        logger.error("Retrieve purchase material requirement list error", err);
        const knownError = err instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? err.status : 500);
        return {
            code: knownError ? err.code : CODE.SERVER_ERROR,
            msg: knownError ? err.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
