import { getInventoryActor, InventoryHttpError, toObjectId } from "~~/server/services/inventory";
import { useStocktakeModel, STOCKTAKE_STATUS } from "~~/server/models/inventoryStocktake.model";
import { useInventoryInboundModel } from "~~/server/models/inventoryInbound.model";
import { useInventoryOutboundModel } from "~~/server/models/inventoryOutbound.model";
import { logger } from "~~/server/utils/logger";
import {
    assertInventoryOrderReviewAccess,
    saveInventoryOrderReview,
} from "~~/server/services/inventoryOrderReview";

export default defineEventHandler(async (event) => {
    const actor = await getInventoryActor(event);
    const body = await readBody(event);

    // 订单复核在此返回，绝不能进入下方生成盘盈/盘亏出入库单的逻辑。
    if (body?.scene === "order-review") {
        try {
            await assertInventoryOrderReviewAccess(event);
            const detail = await saveInventoryOrderReview(body, actor, true);
            return {
                code: 200,
                data: { detail },
            };
        } catch (error) {
            if (!(error instanceof InventoryHttpError)) throw error;
            setResponseStatus(event, error.status);
            return { code: error.code, msg: error.message };
        }
    }

    const { id } = body;

    const stocktakeModel = useStocktakeModel();
    const stocktake = await stocktakeModel.detail(id);

    if (!stocktake) {
        throw createError({ statusCode: 404, message: "盘点单不存在" });
    }

    if (stocktake.status === STOCKTAKE_STATUS.COMPLETED) {
        throw createError({ statusCode: 400, message: "盘点单已完成" });
    }

    // 分离盘盈和盘亏的产品
    const surplusItems: any[] = [];
    const lossItems: any[] = [];

    for (const item of stocktake.items) {
        if (item.difference !== null && item.difference !== undefined && item.difference !== 0) {
            const base = {
                productId: item.productId?.toString?.() || String(item.productId),
                quantity: Math.abs(item.difference),
            };

            if (item.difference > 0) {
                surplusItems.push(base);
            } else {
                lossItems.push(base);
            }
        }
    }

    const warehouseId = stocktake.warehouseId?.toString?.() || String(stocktake.warehouseId);
    const inboundModel = useInventoryInboundModel();
    const outboundModel = useInventoryOutboundModel();

    let inboundOrder: any = null;
    let outboundOrder: any = null;

    try {
        // 生成盘盈入库单（仓位由 resolveStockSnapshots 从产品管理信息取）
        if (surplusItems.length > 0) {
            inboundOrder = await inboundModel.create({
                type: "盘盈入库",
                inboundDate: new Date(),
                remark: `盘点单 ${stocktake.code} 盘盈入库`,
                items: surplusItems.map((item) => ({
                    ...item,
                    warehouseId,
                })),
            }, actor);
            logger.info(`[盘点单完成] 生成盘盈入库单: ${inboundOrder?.inboundNo}, 产品数: ${surplusItems.length}`);
        }

        // 生成盘亏出库单（仓位由 resolveStockSnapshots 从产品管理信息取）
        if (lossItems.length > 0) {
            outboundOrder = await outboundModel.create({
                type: "盘亏出库",
                outboundDate: new Date(),
                remark: `盘点单 ${stocktake.code} 盘亏出库`,
                items: lossItems.map((item) => ({
                    ...item,
                    warehouseId,
                })),
            }, actor);
            logger.info(`[盘点单完成] 生成盘亏出库单: ${outboundOrder?.outboundNo}, 产品数: ${lossItems.length}`);
        }
    } catch (err) {
        // 出库单失败时，回滚已创建的入库单
        if (inboundOrder?._id) {
            try {
                await inboundModel.delete([inboundOrder._id.toString()], actor);
                logger.info(`[盘点单完成] 出库单创建失败，已回滚盘盈入库单: ${inboundOrder.inboundNo}`);
            } catch (rollbackErr) {
                logger.error(`[盘点单完成] 回滚盘盈入库单失败: ${inboundOrder.inboundNo}`, rollbackErr as Error);
            }
        }
        throw err;
    }

    // 全部成功，一次性更新盘点单
    const inboundOrderId = inboundOrder?._id?.toString?.() || null;
    const inboundOrderCode = inboundOrder?.inboundNo || null;
    const outboundOrderId = outboundOrder?._id?.toString?.() || null;
    const outboundOrderCode = outboundOrder?.outboundNo || null;

    const updatedStocktake = await stocktakeModel.model.findByIdAndUpdate(
        id,
        {
            $set: {
                status: STOCKTAKE_STATUS.COMPLETED,
                inboundOrderId: inboundOrderId ? toObjectId(inboundOrderId) : null,
                inboundOrderCode: inboundOrderCode || "",
                outboundOrderId: outboundOrderId ? toObjectId(outboundOrderId) : null,
                outboundOrderCode: outboundOrderCode || "",
                updatedBy: actor,
            },
        },
        { new: true, runValidators: true },
    );

    logger.info(`[盘点单完成] 盘点单: ${stocktake.code}, 操作人: ${actor}, 盘盈: ${surplusItems.length}, 盘亏: ${lossItems.length}`);

    return {
        code: 200,
        data: {
            detail: updatedStocktake,
            inboundOrderId,
            inboundOrderCode,
            outboundOrderId,
            outboundOrderCode,
        },
    };
});
