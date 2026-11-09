import mongoose from "mongoose";
import { INVENTORY_ORDER_STATUS } from "~~/shared/enums";
import type {
    PurchaseLogisticsAcceptancePayload,
    PurchaseLogisticsRecord,
    PurchaseLogisticsRetrieveParams,
} from "~~/shared/types/purchase";
import { CODE } from "~~/server/utils/code";
import {
    getPageParams,
    isValidObjectId,
    throwInventoryError,
    toObjectId,
    toText,
} from "~~/server/services/inventory";
import { normalizeStockQuantity } from "~~/server/services/inventoryStockMath";
import { normalizePurchaseQuantity } from "~~/server/models/purchaseMaterialRequirement.model";
import { InventoryInbound } from "~~/server/models/inventoryInbound.model";
import { useInventoryCounterModel } from "~~/server/models/inventoryCounter.model";
import { useInventoryStockModel } from "~~/server/models/inventoryStock.model";
import { InventoryProduct } from "~~/server/models/inventoryProduct.model";
import { usePurchaseOrderAllocationModel } from "~~/server/models/purchaseOrderAllocation.model";
import {
    PurchaseOrder,
    PURCHASE_ACCEPTANCE_STATUS,
    PURCHASE_TRANSPORT_STATUS,
    usePurchaseOrderModel,
} from "~~/server/models/purchaseOrder.model";
import { syncAcceptedPurchaseWaybill } from "~~/server/services/inventoryWaybillSync";
import { notifyFinanceAcceptanceException } from "~~/server/services/notification";
import { logger } from "~~/server/utils/logger";
import {
    formatPurchaseWaybillGoods,
    getPurchaseWaybillItems,
} from "~~/server/utils/purchaseWaybillGoods";

type LogisticsListOptions = Omit<PurchaseLogisticsRetrieveParams, "view">;

const toId = (value: unknown) => value && typeof value === "object" && "toString" in value
    ? String(value)
    : toText(value);

const formatDateCode = (date: Date) => {
    const shanghaiDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const year = shanghaiDate.getUTCFullYear();
    const month = String(shanghaiDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(shanghaiDate.getUTCDate()).padStart(2, "0");
    return `${year}${month}${day}`;
};

const loadPurchaseReceivedQuantityMap = async (
    orders: any[],
    session?: mongoose.ClientSession,
) => {
    const uniqueOrderNos = [...new Set(orders.map((order) => toText(order.orderNo)).filter(Boolean))];
    const result = new Map<string, number>();
    if (!uniqueOrderNos.length) return result;

    const aggregation = InventoryInbound.aggregate([
        {
            $match: {
                purchaseOrderNo: { $in: uniqueOrderNos },
                type: "采购",
                stockApplied: true,
                _isDeleted: { $ne: true },
            },
        },
        { $unwind: "$items" },
        {
            $group: {
                _id: {
                    orderNo: "$purchaseOrderNo",
                    productId: "$items.productId",
                    inboundOrderId: "$_id",
                },
                quantity: { $sum: "$items.quantity" },
            },
        },
    ]);
    if (session) aggregation.session(session);
    const rows = await aggregation;
    const inboundProductsById = new Map<string, Set<string>>();
    for (const row of rows) {
        const productId = toId(row._id.productId);
        const productKey = `${row._id.orderNo}:${productId}`;
        result.set(
            productKey,
            normalizePurchaseQuantity((result.get(productKey) || 0) + Number(row.quantity || 0)),
        );
        const inboundKey = `${row._id.orderNo}:${toId(row._id.inboundOrderId)}`;
        let productIds = inboundProductsById.get(inboundKey);
        if (!productIds) {
            productIds = new Set<string>();
            inboundProductsById.set(inboundKey, productIds);
        }
        productIds.add(productId);
    }

    for (const order of orders) {
        const orderNo = toText(order.orderNo);
        for (const waybill of order.waybills || []) {
            if (waybill.acceptanceStatus !== "验收正常" && waybill.acceptanceStatus !== "验收异常") continue;

            const items = Array.isArray(waybill.acceptanceItems) ? waybill.acceptanceItems : [];
            const inboundOrderId = toId(waybill.inboundOrderId);
            const inboundProducts = inboundProductsById.get(`${orderNo}:${inboundOrderId}`);
            if (inboundOrderId && !inboundProducts) continue;
            // 全不合格验收不会生成入库单；有合格入库快照却缺失关联时不补计。
            if (!inboundOrderId && items.some((item: any) => normalizePurchaseQuantity(item.inboundQuantity) > 0)) continue;

            for (const item of items) {
                const productId = toId(item.productId);
                if (inboundProducts && normalizePurchaseQuantity(item.inboundQuantity) > 0
                    && !inboundProducts.has(productId)) continue;

                const damagedQuantity = Math.min(
                    normalizePurchaseQuantity(item.damagedQuantity),
                    normalizePurchaseQuantity(item.receivedQuantity),
                );
                if (damagedQuantity <= 0) continue;

                // 合格量已由有效入库累计，不合格量只扣采购剩余，不增加库存。
                const productKey = `${orderNo}:${productId}`;
                result.set(productKey, normalizePurchaseQuantity((result.get(productKey) || 0) + damagedQuantity));
            }
        }
    }

    return result;
};

const loadProductNameMap = async (orders: any[]) => {
    const productIds = [...new Set(
        orders.flatMap((order) => (order.items || [])
            .filter((item: any) => !toText(item.productName))
            .map((item: any) => toId(item.productId))
            .filter(isValidObjectId)),
    )];
    if (!productIds.length) return new Map<string, string>();

    const products = await InventoryProduct
        .find({ _id: { $in: productIds.map((id) => toObjectId(id)) } })
        .select("name model code")
        .lean();

    return new Map(
        (products as any[]).map((product) => [
            toId(product._id),
            toText(product.name) || toText(product.model) || toText(product.code),
        ]),
    );
};

const getProductName = (item: any, productNames: Map<string, string>) =>
    toText(item.productName)
    || productNames.get(toId(item.productId))
    || toText(item.productModel)
    || toText(item.productCode)
    || "未命名货品";

const normalizeAcceptanceAttachments = (value: unknown) => {
    if (!Array.isArray(value)) return [];

    return value
        .map((item: any) => ({
            name: toText(item?.name),
            url: toText(item?.url),
            size: Number.isFinite(Number(item?.size)) ? Math.max(Number(item.size), 0) : 0,
            type: toText(item?.type),
        }))
        .filter((item) => item.name && item.url.startsWith("/main/inventory/attachments/"));
};

const buildRecord = (
    order: any,
    waybill: any,
    receivedMap: Map<string, number>,
    productNames: Map<string, string>,
): PurchaseLogisticsRecord => {
    const purchaseOrderId = toId(order._id);
    const waybillId = toId(waybill._id);
    const waybillItems = getPurchaseWaybillItems(order, waybill);
    const itemSnapshots = waybillItems.map((item: any) => {
        const productId = toId(item.productId);
        const purchasedQuantity = normalizePurchaseQuantity(item.quantity);
        const alreadyReceived = receivedMap.get(`${order.orderNo}:${productId}`) || 0;
        const remainingQuantity = normalizePurchaseQuantity(Math.max(purchasedQuantity - alreadyReceived, 0));

        return {
            productId,
            productCode: toText(item.productCode),
            productName: getProductName(item, productNames),
            productModel: toText(item.productModel),
            unitId: toId(item.unitId) || null,
            unitName: toText(item.unitName),
            expectedQuantity: remainingQuantity,
            receivedQuantity: 0,
            damagedQuantity: 0,
            inboundQuantity: 0,
            remainingQuantity,
            warehouseId: null,
            warehouseName: "",
            locationId: null,
            locationName: "",
        };
    });
    const availableItems = itemSnapshots;
    const acceptanceItems = Array.isArray(waybill.acceptanceItems)
        ? waybill.acceptanceItems.map((item: any) => ({
            ...item,
            productId: toId(item.productId),
            unitId: toId(item.unitId) || null,
            warehouseId: toId(item.warehouseId) || null,
            locationId: toId(item.locationId) || null,
        }))
        : [];
    const goodsNames = [...new Set(
        (acceptanceItems.length ? acceptanceItems : itemSnapshots)
            .map((item: any) => toText(item.productName))
            .filter(Boolean),
    )];

    return {
        id: `${purchaseOrderId}:${waybillId}`,
        purchaseOrderId,
        waybillId,
        purchaseOrderNo: toText(order.orderNo),
        trackingNo: toText(waybill.trackingNo),
        courierCompany: toText(waybill.courierCompany),
        goodsNames,
        goodsText: formatPurchaseWaybillGoods(order, waybill, productNames),
        transportInfo: toText(waybill.transportInfo),
        transportTraces: Array.isArray(waybill.transportTraces)
            ? waybill.transportTraces.map((trace: any) => ({
                action: toText(trace.action),
                acceptStation: toText(trace.acceptStation),
                acceptTime: trace.acceptTime || null,
                location: toText(trace.location),
            }))
            : [],
        transportStatus: PURCHASE_TRANSPORT_STATUS.includes(waybill.transportStatus)
            ? waybill.transportStatus
            : "待发货",
        acceptanceStatus: PURCHASE_ACCEPTANCE_STATUS.includes(waybill.acceptanceStatus)
            ? waybill.acceptanceStatus
            : "待验收",
        acceptanceItems,
        availableItems,
        acceptedAt: waybill.acceptedAt || null,
        acceptedBy: toText(waybill.acceptedBy),
        acceptanceRemark: toText(waybill.acceptanceRemark),
        acceptanceAttachments: normalizeAcceptanceAttachments(waybill.acceptanceAttachments),
        acceptanceImages: normalizeAcceptanceAttachments(waybill.acceptanceImages),
        inboundOrderId: toId(waybill.inboundOrderId) || null,
        inboundOrderNo: toText(waybill.inboundOrderNo),
        syncedWaybillId: toId(waybill.syncedWaybillId) || null,
        syncedAt: waybill.syncedAt || null,
        purchaseDate: order.purchaseDate || null,
        updatedAt: waybill.transportUpdatedAt || waybill.acceptedAt || order.updateTime || order.createTime || null,
    };
};

const loadRecord = async (purchaseOrderId: string, waybillId: string) => {
    const order = await PurchaseOrder
        .findOne({ _id: purchaseOrderId, _isDeleted: { $ne: true }, "waybills._id": waybillId })
        .lean() as any;
    if (!order) {
        throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "采购运单不存在");
    }
    const waybill = (order.waybills || []).find((item: any) => toId(item._id) === waybillId);
    const [receivedMap, productNames] = await Promise.all([
        loadPurchaseReceivedQuantityMap([order]),
        loadProductNameMap([order]),
    ]);
    return buildRecord(order, waybill, receivedMap, productNames);
};

export const retrievePurchaseLogistics = async (options: LogisticsListOptions = {}) => {
    const pageOptions = getPageParams({ page: options.page, limit: options.limit });
    const orders = await PurchaseOrder
        .find({ _isDeleted: { $ne: true }, "waybills.0": { $exists: true } })
        .sort({ purchaseDate: -1, updateTime: -1, createTime: -1 })
        .lean() as any[];
    const [receivedMap, productNames] = await Promise.all([
        loadPurchaseReceivedQuantityMap(orders),
        loadProductNameMap(orders),
    ]);
    const keyword = toText(options.keyword).toLowerCase();
    const list = orders
        .flatMap((order) => (order.waybills || []).map((waybill: any) =>
            buildRecord(order, waybill, receivedMap, productNames)))
        .filter((item) => !options.transportStatus || item.transportStatus === options.transportStatus)
        .filter((item) => !options.acceptanceStatus || item.acceptanceStatus === options.acceptanceStatus)
        .filter((item) => !keyword || [
            item.purchaseOrderNo,
            item.trackingNo,
            item.courierCompany,
            item.goodsText,
            item.transportInfo,
        ].some((value) => toText(value).toLowerCase().includes(keyword)));
    if (useRuntimeConfig().logisticsTrackingMock) {
        const demoRecords = buildDemoRecords().filter((item) =>
            (!options.transportStatus || item.transportStatus === options.transportStatus)
            && (!options.acceptanceStatus || item.acceptanceStatus === options.acceptanceStatus)
            && (!keyword || [
                item.purchaseOrderNo,
                item.trackingNo,
                item.courierCompany,
                item.goodsText,
                item.transportInfo,
            ].some((value) => toText(value).toLowerCase().includes(keyword))),
        );
        list.unshift(...demoRecords);
    }
    const pagedList = list.slice(pageOptions.skip, pageOptions.skip + pageOptions.limit);

    return {
        list: pagedList,
        pagination: {
            page: pageOptions.page,
            limit: pageOptions.limit,
            total: list.length,
            hasMore: pageOptions.skip + pagedList.length < list.length,
        },
    };
};

export const attachPurchaseLogisticsToWaybills = async (waybills: any[]) => {
    const sourceOrderIds = [...new Set(
        waybills
            .filter((item) => toText(item?.sourceType) === "purchase-logistics")
            .map((item) => toText(item?.sourceOrderId))
            .filter(isValidObjectId),
    )];
    let orders: any[] = [];
    if (sourceOrderIds.length) {
        orders = await PurchaseOrder.find({
            _id: { $in: sourceOrderIds.map((id) => toObjectId(id)) },
            _isDeleted: { $ne: true },
        }).lean() as any[];
    }
    const [receivedMap, productNames] = await Promise.all([
        loadPurchaseReceivedQuantityMap(orders),
        loadProductNameMap(orders),
    ]);
    const logisticsBySource = new Map<string, PurchaseLogisticsRecord>();
    for (const order of orders) {
        for (const waybill of order.waybills || []) {
            logisticsBySource.set(
                `${toId(order._id)}:${toId(waybill._id)}`,
                buildRecord(order, waybill, receivedMap, productNames),
            );
        }
    }

    return waybills.map((item) => {
        if (toText(item?.sourceType) !== "purchase-logistics") {
            if (["inventory-inbound", "inventory-outbound", "inventory-transfer"].includes(toText(item?.sourceType))) {
                return item;
            }
            if (!/^自动同步：(采购单|采购验收|入库单|出库单|调拨单)(?:\s|；|$)/.test(toText(item?.remark))) {
                return item;
            }
            // 仅兼容系统追加的数量尾缀，保留商品名称和型号中的数字。
            const goods = toText(item.goods);
            const goodsDisplay = goods.replace(/ x\d+(?:\.\d+)?$/, "");
            return goodsDisplay === goods ? item : { ...item, goods: goodsDisplay, goodsDisplay };
        }
        const sourceKey = `${toText(item?.sourceOrderId)}:${toText(item?.sourceWaybillId)}`;
        const purchaseLogistics = logisticsBySource.get(sourceKey);
        if (!purchaseLogistics) {
            return { ...item, goods: "采购货物", goodsDisplay: "采购货物" };
        }
        return {
            ...item,
            goods: purchaseLogistics.goodsText,
            goodsDisplay: purchaseLogistics.goodsText,
            purchaseLogistics,
        };
    });
};

const buildDemoRecords = (): PurchaseLogisticsRecord[] => {
    const traces = [
        { action: "1", acceptStation: "顺丰速运 已收取快件", acceptTime: "2026-10-13 08:15:00", location: "天津市" },
        { action: "2", acceptStation: "快件在 天津转运中心 完成分拣，准备发往 杭州转运中心", acceptTime: "2026-10-13 12:06:00", location: "天津市" },
        { action: "204", acceptStation: "快件到达 杭州转运中心", acceptTime: "2026-10-13 20:24:00", location: "杭州市" },
        { action: "3", acceptStation: "客户已签收，感谢使用顺丰速运", acceptTime: "2026-10-13 23:18:00", location: "杭州市" },
    ];
    const make = (index: number, status: PurchaseLogisticsRecord["transportStatus"], latest: string) => ({
        id: `demo:logistics:${index}`,
        purchaseOrderId: "000000000000000000000001",
        waybillId: `00000000000000000000000${index + 2}`,
        purchaseOrderNo: `PO-DEMO-202610${String(index + 1).padStart(2, "0")}`,
        trackingNo: `SFDEMO${index + 1}573975816865`,
        courierCompany: "顺丰速运",
        goodsNames: index === 1 ? ["铝合金支架", "紧固件"] : [index === 3 ? "精密轴承" : "工业连接器"],
        goodsText: index === 1 ? "铝合金支架、紧固件" : index === 3 ? "精密轴承" : "工业连接器",
        transportInfo: latest,
        transportTraces: traces.slice(0, index + 1),
        transportStatus: status,
        acceptanceStatus: "待验收",
        acceptanceItems: [],
        availableItems: [],
        acceptedAt: null,
        acceptedBy: "",
        acceptanceRemark: "",
        acceptanceAttachments: [],
        acceptanceImages: [],
        inboundOrderId: null,
        inboundOrderNo: "",
        syncedWaybillId: null,
        syncedAt: null,
        purchaseDate: "2026-10-13",
        updatedAt: "2026-10-13T20:24:00.000Z",
        isDemo: true,
    } satisfies PurchaseLogisticsRecord);
    return [
        make(0, "已揽收", traces[0].acceptStation),
        make(1, "运输中", traces[1].acceptStation),
        make(2, "待取货", traces[2].acceptStation),
        make(3, "已签收", traces[3].acceptStation),
    ];
};

const ensureAcceptedWaybillSynced = async (order: any, waybill: any, actor: string) => {
    if (waybill.acceptanceStatus !== "验收正常" || waybill.syncedWaybillId) return;

    const synced = await syncAcceptedPurchaseWaybill(order, waybill, waybill.acceptanceItems || [], actor);
    if (!synced?._id) {
        throwInventoryError(500, CODE.SERVER_ERROR, "验收已完成，但同步收件记录失败，请重试");
    }
    await PurchaseOrder.updateOne(
        { _id: order._id, "waybills._id": waybill._id },
        {
            $set: {
                "waybills.$.syncedWaybillId": synced._id,
                "waybills.$.syncedAt": new Date(),
                updatedBy: actor,
            },
        },
    );
};

export const acceptPurchaseLogistics = async (
    payload: PurchaseLogisticsAcceptancePayload,
    actor: string,
) => {
    const purchaseOrderId = toText(payload.purchaseOrderId);
    const waybillId = toText(payload.waybillId);
    if (!isValidObjectId(purchaseOrderId) || !isValidObjectId(waybillId)) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "采购运单ID格式错误");
    }
    if (!Array.isArray(payload.items) || !payload.items.length) {
        throwInventoryError(400, CODE.INVALID_PARAMS, "验收货品不能为空");
    }

    const acceptanceAttachments = normalizeAcceptanceAttachments(payload.attachments);
    const acceptanceImages = normalizeAcceptanceAttachments(payload.images);
    const inputItems = new Map<string, PurchaseLogisticsAcceptancePayload["items"][number]>();
    for (const item of payload.items) {
        const productId = toText(item.productId);
        if (!isValidObjectId(productId) || inputItems.has(productId)) {
            throwInventoryError(400, CODE.INVALID_PARAMS, "验收货品不合法或重复");
        }
        inputItems.set(productId, item);
    }

    const session = await mongoose.startSession();
    let committedOrder: any = null;
    let committedWaybill: any = null;
    let committedInbound: any = null;
    try {
        await session.withTransaction(async () => {
            const order = await PurchaseOrder.findOne({
                _id: purchaseOrderId,
                _isDeleted: { $ne: true },
                "waybills._id": waybillId,
            }).session(session) as any;
            if (!order) {
                throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "采购运单不存在");
            }
            const waybill = order.waybills.id(waybillId);
            if (!waybill) {
                throwInventoryError(404, CODE.INVENTORY_NOT_FOUND, "采购运单不存在");
            }
            if (waybill.acceptanceStatus && waybill.acceptanceStatus !== "待验收") {
                committedOrder = order;
                committedWaybill = waybill;
                return;
            }
            if (waybill.transportStatus !== "待取货" && waybill.transportStatus !== "已签收") {
                throwInventoryError(409, CODE.INVALID_PARAMS, "仅待取货或已签收的采购运单可填写验收单，请刷新后重试");
            }

            const receivedMap = await loadPurchaseReceivedQuantityMap([order], session);
            const orderItems = new Map<string, any>();
            const remainingByProduct = new Map<string, number>();
            for (const item of getPurchaseWaybillItems(order, waybill)) {
                const productId = toId(item.productId);
                const alreadyReceived = receivedMap.get(`${order.orderNo}:${productId}`) || 0;
                const remainingQuantity = normalizePurchaseQuantity(
                    Math.max(Number(item.quantity || 0) - alreadyReceived, 0),
                );
                remainingByProduct.set(productId, remainingQuantity);
                orderItems.set(productId, item);
            }
            for (const productId of inputItems.keys()) {
                if (!orderItems.has(productId)) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "验收货品不属于该运单");
                }
            }
            if (inputItems.size !== orderItems.size) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "验收入库单必须包含该运单内全部货品");
            }
            const acceptedAt = new Date();
            const acceptanceItems: any[] = [];
            const inboundItems: any[] = [];
            let hasDamagedQuantity = false;
            let isNormal = true;

            for (const [productId, input] of inputItems.entries()) {
                const orderItem: any = orderItems.get(productId);
                // 应收以事务内最新采购剩余量为准，不采信客户端传入的数量。
                const expectedQuantity = remainingByProduct.get(productId) || 0;
                const receivedQuantity = normalizePurchaseQuantity(input.receivedQuantity);
                const damagedQuantity = normalizePurchaseQuantity(input.damagedQuantity);
                if (
                    !Number.isFinite(Number(input.receivedQuantity))
                    || !Number.isFinite(Number(input.damagedQuantity))
                    || Number(input.receivedQuantity) < 0
                    || Number(input.damagedQuantity) < 0
                ) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, "验收数量不能为负数");
                }
                const productName = toText(orderItem.productName) || toText(orderItem.productCode) || "该产品";
                if (damagedQuantity > receivedQuantity) {
                    throwInventoryError(400, CODE.INVALID_PARAMS, `${productName}的不合格数量不能超过实际到货数量`);
                }
                const inboundQuantity = normalizePurchaseQuantity(
                    Math.max(receivedQuantity - damagedQuantity, 0),
                );
                const remainingQuantity = remainingByProduct.get(productId) || 0;
                if (receivedQuantity > remainingQuantity) {
                    throwInventoryError(409, CODE.INVALID_PARAMS,
                        `${productName}的实际到货数量不能超过采购剩余${remainingQuantity}${toText(orderItem.unitName)}，请刷新后重试`);
                }
                if (damagedQuantity > 0) {
                    hasDamagedQuantity = true;
                }
                if (inboundQuantity !== expectedQuantity) {
                    isNormal = false;
                }

                let stockSnapshot: any = null;
                if (inboundQuantity > 0) {
                    if (!isValidObjectId(toText(input.warehouseId))) {
                        throwInventoryError(400, CODE.INVALID_PARAMS, "合格货品必须选择入库仓库");
                    }
                    if (!isValidObjectId(toText(input.locationId))) {
                        throwInventoryError(400, CODE.INVALID_PARAMS, "合格货品必须选择入库库位");
                    }
                    stockSnapshot = await useInventoryStockModel().buildInboundItemSnapshot({
                        productId,
                        quantity: inboundQuantity,
                        unitId: toId(orderItem.unitId),
                        warehouseId: toText(input.warehouseId),
                        locationId: toText(input.locationId),
                    });
                    inboundItems.push(stockSnapshot);
                }

                acceptanceItems.push({
                    productId: orderItem.productId,
                    productCode: toText(orderItem.productCode),
                    productName: toText(orderItem.productName)
                        || toText(stockSnapshot?.productName)
                        || toText(orderItem.productModel)
                        || toText(orderItem.productCode),
                    productModel: toText(orderItem.productModel),
                    unitId: orderItem.unitId || null,
                    unitName: toText(orderItem.unitName),
                    expectedQuantity,
                    receivedQuantity,
                    damagedQuantity,
                    inboundQuantity,
                    warehouseId: stockSnapshot?.warehouseId || null,
                    warehouseName: toText(stockSnapshot?.warehouseName),
                    locationId: stockSnapshot?.locationId || null,
                    locationName: toText(stockSnapshot?.locationName),
                });
            }
            if (!acceptanceImages.length) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "验收时必须上传验收图片");
            }
            if (hasDamagedQuantity && !acceptanceAttachments.length) {
                throwInventoryError(400, CODE.INVALID_PARAMS, "不合格数量大于0时必须上传异常材料");
            }

            let inboundOrder: any = null;
            let itemsWithLocks = inboundItems;
            if (inboundItems.length) {
                const purchaseLockMap = await usePurchaseOrderAllocationModel()
                    .calculateInboundLocks(order.orderNo, inboundItems, session);
                itemsWithLocks = inboundItems.map((item: any) => ({
                    ...(item.toObject?.() || item),
                    quantity: normalizeStockQuantity(item.quantity),
                    lockedQuantity: normalizeStockQuantity(
                        Math.min(
                            Number(item.quantity || 0),
                            purchaseLockMap.get(toId(item.productId)) || 0,
                        ),
                    ),
                }));
                const serial = await useInventoryCounterModel()
                    .nextNumber(`inventory:inbound:${formatDateCode(acceptedAt)}`, session);
                const inboundNo = `RK-${formatDateCode(acceptedAt)}-${String(serial).padStart(2, "0")}`;
                const docs = await InventoryInbound.create([{
                    inboundNo,
                    type: "采购",
                    relatedNo: order.orderNo,
                    totalQuantity: itemsWithLocks.reduce(
                        (total: number, item: any) => total + Number(item.quantity || 0),
                        0,
                    ),
                    inboundDate: acceptedAt,
                    handler: actor,
                    status: INVENTORY_ORDER_STATUS.COMPLETED,
                    stockApplied: false,
                    courierCompany: toText(waybill.courierCompany),
                    trackingNo: toText(waybill.trackingNo),
                    purchaseOrderNo: toText(order.orderNo),
                    remark: toText(payload.remark) || `物流验收：${toText(waybill.trackingNo)}`,
                    sourceType: "purchase-logistics",
                    sourceKey: `${purchaseOrderId}:${waybillId}`,
                    items: itemsWithLocks,
                    createdBy: actor,
                    updatedBy: actor,
                }], { session });
                inboundOrder = docs[0];
                await useInventoryStockModel().applyInbound(
                    itemsWithLocks,
                    {
                        sourceType: "inbound",
                        sourceId: inboundOrder._id.toString(),
                        sourceNo: inboundNo,
                        businessType: "采购入库",
                        changedAt: acceptedAt,
                        operator: actor,
                        remark: toText(payload.remark),
                    },
                    actor,
                    session,
                );
                await InventoryInbound.updateOne(
                    { _id: inboundOrder._id },
                    { $set: { stockApplied: true, items: itemsWithLocks, updatedBy: actor } },
                    { session },
                );
                await usePurchaseOrderAllocationModel().markInboundLocked(
                    order.orderNo,
                    itemsWithLocks,
                    actor,
                    session,
                );
            }

            waybill.acceptanceStatus = isNormal ? "验收正常" : "验收异常";
            waybill.acceptanceItems = acceptanceItems;
            waybill.acceptedAt = acceptedAt;
            waybill.acceptedBy = actor;
            waybill.acceptanceRemark = toText(payload.remark);
            waybill.acceptanceAttachments = acceptanceAttachments;
            waybill.acceptanceImages = acceptanceImages;
            waybill.inboundOrderId = inboundOrder?._id || null;
            waybill.inboundOrderNo = toText(inboundOrder?.inboundNo);
            order.updatedBy = actor;
            await order.save({ session });

            committedOrder = order;
            committedWaybill = waybill;
            committedInbound = inboundOrder
                ? { ...inboundOrder.toObject(), items: itemsWithLocks }
                : null;
        });
    } finally {
        await session.endSession();
    }

    if (!committedOrder || !committedWaybill) {
        throwInventoryError(409, CODE.INVALID_PARAMS, "验收状态已变化，请刷新后重试");
    }

    if (committedInbound) {
        await usePurchaseOrderModel().refreshStatusByOrderNo(committedOrder.orderNo, actor);
    }

    const freshOrder = await PurchaseOrder.findById(purchaseOrderId) as any;
    const freshWaybill = freshOrder?.waybills?.id(waybillId);
    if (freshOrder && freshWaybill) {
        await ensureAcceptedWaybillSynced(freshOrder, freshWaybill, actor);
        if (freshWaybill.acceptanceStatus === "验收异常") {
            try {
                await notifyFinanceAcceptanceException(freshOrder, freshWaybill);
            } catch (notificationError: any) {
                logger.warn(
                    `物流验收异常通知创建失败 ${toText(freshWaybill.trackingNo)}: ${notificationError?.message || notificationError}`,
                );
            }
        }
    }

    return await loadRecord(purchaseOrderId, waybillId);
};
