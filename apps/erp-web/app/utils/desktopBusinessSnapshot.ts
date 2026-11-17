import type { InventoryProduct } from "~~/shared/types/inventory";
import type { PurchaseOrder } from "~~/shared/types/purchase";
import { canManageInventory, canViewPurchasePrice, isElectronicsWarehouseKeeper } from "~~/shared/utils/adminPermission";
import { getSalesOrderDeliveryDate } from "~~/shared/utils/salesOrderDelivery";
import { getSalesOrderPaymentPlans, getSalesOrderPaymentTotals } from "~~/shared/utils/salesOrderPayment";
import type { DesktopDetailSection, DesktopDetailSnapshot } from "~/types/desktopBusiness";

function text(value: unknown): string {
    if (value == null || value === "") return "--";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "--";
    return typeof value === "string" || typeof value === "boolean" ? String(value) : "--";
}

function money(value: unknown, digits = 2): string {
    if (value == null || value === "") return "--";
    const number = Number(value);
    return Number.isFinite(number)
        ? number.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: digits }) : "--";
}

function date(value: unknown): string {
    if (!value) return "--";
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toLocaleString("zh-CN", { hour12: false });
}

function fields(title: string, values: Array<[string, unknown]>): DesktopDetailSection {
    return { title, fields: values.map(([label, value]) => ({ label, value: text(value) })) };
}

// Images are public ERP assets only. Protected attachments remain in the main
// window's authorized download flow; no URL or file action is sent to a child.
function publicImage(value: unknown, alt: string) {
    if (typeof value !== "string" || !value) return [];
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.hostname !== "server.zhtaero.com"
            || url.username || url.password || url.search || url.hash) return [];
        return [{ src: url.href, alt }];
    } catch { return []; }
}

function attachmentNames(value: unknown): string {
    if (!Array.isArray(value) || !value.length) return "无";
    return value.map((item, index) => {
        if (item && typeof item === "object") return text(item.name || item.fileName || `附件 ${index + 1}`);
        return `附件 ${index + 1}`;
    }).join("\n");
}

function snapshot(title: string, subtitle: string, sections: DesktopDetailSection[]): DesktopDetailSnapshot {
    return { title, subtitle, capturedAt: new Date().toISOString(), sections };
}

export function productDetailSnapshot(product: InventoryProduct, role: number): DesktopDetailSnapshot {
    const basics: Array<[string, unknown]> = [
        ["产品编号", product.code], ["产品名称", product.name], ["型号", product.model],
        ["型号编码", product.modelCode], ["分类", product.categoryPath || product.categoryName],
        ["单位", product.unitName], ["材质", product.material], ["来源", product.source],
        ["库存上限", product.stockUpperLimit], ["库存下限", product.stockLowerLimit],
        ["默认仓库", product.warehouseName], ["默认库位", product.locationName],
        ["条码", product.barcode], ["SN 前缀参数", product.snPrefixes?.join("，")],
    ];
    if (canManageInventory(role) && product.standardPrice != null) basics.push(["标准价", money(product.standardPrice)]);
    return snapshot("产品详情", text(product.code), [
        fields("基本信息", basics),
        { title: "产品图片", images: publicImage(product.image, text(product.model || product.name)) },
        fields("说明", [["产品介绍", product.introduction], ["备注", product.remark]]),
        fields("最近修改", [["操作人", product.updatedBy || product.operator || product.createdBy], ["修改时间", date(product.updateTime || product.createTime)]]),
    ]);
}

export function purchaseDetailSnapshot(order: PurchaseOrder, role: number): DesktopDetailSnapshot {
    // Match the existing detail dialog. The API additionally removes fields for
    // purchase-request-only access; absent amounts are never reconstructed.
    const showPrice = canViewPurchasePrice(role) && !isElectronicsWarehouseKeeper(role);
    const status: Record<string, string> = { pending: "待匹配", partial: "部分匹配", matched: "已匹配", error: "匹配失败", not_applicable: "无需匹配" };
    const basics: Array<[string, unknown]> = [
        ["采购单号", order.orderNo], ["采购日期", order.purchaseDate], ["状态", order.status],
        ["购买渠道", order.purchaseChannel === "taobao" ? "淘宝" : order.purchaseChannel === "other" ? "其他" : "--"],
        ["淘宝订单号", order.platformOrderNos?.join("、")], ["运单匹配", status[order.taobaoSyncStatus || ""]],
        ["匹配说明", order.taobaoSyncMessage], ["最近匹配", date(order.taobaoSyncedAt)],
        ["采购数量", order.totalQuantity], ["采购人", order.buyer], ["备注", order.remark],
        ["操作人", order.updatedBy || order.operator || order.createdBy], ["修改时间", date(order.updateTime || order.createTime)],
    ];
    if (showPrice && (order.totalAmount != null || order.totalPrice != null)) basics.push(["总金额", money(order.totalAmount ?? order.totalPrice)]);
    const columns = ["产品名称", "型号", "产品编码", "供应商", "采购数量 / 单位"];
    if (showPrice) columns.push("单价（人民币）", "总金额（人民币）");
    columns.push("入库进度", "物流信息", "备注");
    const rows: string[][] = [];
    for (const item of order.items || []) {
        const received = order.inboundProgress?.items?.find(progress => String(progress.productId) === String(item.productId));
        const suppliers = item.suppliers?.length
            ? item.suppliers.map(supplier => supplier.supplierName || supplier.supplierCode || "--").join("、")
            : item.supplierName || order.supplierName;
        const waybills = (order.waybills || []).filter(waybill =>
            !waybill.productIds?.length || waybill.productIds.some(id => String(id) === String(item.productId)));
        const row = [text(item.productName || item.productModel || item.productCode), text(item.productModel), text(item.productCode), text(suppliers), `${text(item.quantity)} ${item.unitName || ""}`];
        if (showPrice) row.push(money(item.unitPrice, 3), money(item.totalAmount));
        row.push(`${text(received?.receivedQuantity ?? 0)} / ${text(item.quantity)}`, waybills.map(waybill => `${waybill.courierCompany || ""} ${waybill.trackingNo || "--"}`).join("\n") || "--", text(item.remark));
        rows.push(row);
    }
    return snapshot("采购单详情", text(order.orderNo), [
        fields("基本信息", basics), { title: "采购产品", columns, rows },
        fields("附件", [["附件名称", attachmentNames(order.attachments)]]),
    ]);
}

export function salesDetailSnapshot(order: Record<string, any>): DesktopDetailSnapshot {
    const payment = getSalesOrderPaymentTotals(order);
    const plans = getSalesOrderPaymentPlans(order);
    const products: string[][] = [];
    for (const product of Array.isArray(order.products) ? order.products : []) {
        const price = product.salePrice ?? product.price;
        const total = product.totalPrice ?? product.totalAmount
            ?? (price != null && product.quantity != null ? Number(price) * Number(product.quantity) : undefined);
        products.push([
            text(product.productCode || product.code), text(product.model || product.productName || product.name),
            text(product.quantity), text(product.unitName || product.unit), money(price), money(total),
            text(product.machineNo), text(product.remark),
        ]);
    }
    return snapshot("销售订单详情", text(order.orderNo), [
        fields("客户信息", [["客户姓名", order.customerName], ["客户公司", order.customerCompany], ["区域", order.customerRegion]]),
        fields("订单信息", [
            ["订单编号", order.orderNo], ["订单状态", order.status], ["销售员", order.salespersonName],
            ["订单类型", order.orderType], ["总金额", money(order.amount)], ["币种", order.currency],
            ["机器号", order.machineNo], ["非标要求", order.sampleRequirement], ["安装要求", order.installationRequirement],
            ["测试要求", order.testingRequirement], ["订单备注", order.orderRemark || order.remark],
            ["拍摄任务", order.hasShootingTask ? "需要拍摄" : "无需拍摄"], ["拍摄要求", order.shootingRequirement],
        ]),
        { title: "产品明细", columns: ["产品编码", "产品 / 型号", "数量", "单位", "单价", "金额", "机器号", "备注"], rows: products },
        fields("合同信息", [["合同编号", order.contractNo], ["下单日期", date(order.orderDate)], ["合同交期", getSalesOrderDeliveryDate(order)], ["发票状态", order.invoiceStatus]]),
        fields("应收信息", [
            ["应收单号", order.receivableOrder], ["应收日期", date(order.receivableDate)], ["收入类别", order.incomeCategory],
            ["计划回款合计", payment.map(total => `${money(total.amount)} ${total.currency}`).join("；")],
            ["实际应收金额", money(order.actualReceivableAmount)], ["已收金额", money(order.receivedAmount)], ["备注", order.receivableRemark],
        ]),
        { title: "计划回款", columns: ["计划日期", "计划金额", "币种"], rows: plans.map(plan => [date(plan.date), money(plan.amount), text(plan.currency)]) },
        fields("附件", [["订单图片", attachmentNames(order.orderImages)], ["合同附件", attachmentNames(order.attachments)], ["应收附件", attachmentNames(order.receivableAttachments)]]),
        fields("最近修改", [["创建人", order.creator || order.createdBy], ["修改时间", date(order.updateTime || order.createTime)], ["驳回原因", order.rejectionReason]]),
    ]);
}
