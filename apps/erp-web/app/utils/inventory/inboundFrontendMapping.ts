import { formatLocalDate, formatLocalDateTime } from "../time";

export interface InboundWarehouseOption {
    id: string;
    code?: string;
    name: string;
    enableLocation?: boolean;
    children: InboundLocationOption[];
}

export interface InboundLocationOption {
    id: string;
    code?: string;
    name: string;
    parentId?: string;
    children: InboundLocationOption[];
}

export interface InboundDialogProductRow {
    rowId: string;
    productId: string;
    productCode: string;
    productName: string;
    model: string;
    categoryId: string;
    categoryName: string;
    image: string;
    quantity: number;
    unitId: string;
    unitName: string;
    targetWarehouse: string;
    warehouseId: string;
    locationId: string;
}

export interface InboundPageOrderRow {
    backendId: string;
    id: string;
    type: string;
    relatedNo: string;
    totalQuantity: number;
    inboundDate: string;
    handler: string;
    remark: string;
    updatedAt: string;
    courierCompany: string;
    trackingNo: string;
    purchaseOrderNo: string;
    processingOrderNo: string;
    productionOwner: string;
    salesOrderId: string;
    salesOrderNo: string;
    orderNo: string;
    returnReason: string;
    items: InboundDialogProductRow[];
}

const toEntityId = (value: unknown) => {
    if (!value) {
        return "";
    }

    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "object" && value !== null && "toString" in value) {
        return String(value);
    }

    return "";
};

type LocationTreeRow = {
    _id?: string;
    id?: string;
    code?: string;
    name?: string;
    parentId?: string | null;
    children?: LocationTreeRow[];
};

const normalizeLocationNode = (row: LocationTreeRow): InboundLocationOption => ({
    id: toEntityId(row._id || row.id),
    code: row.code || "",
    name: row.name || "",
    parentId: toEntityId(row.parentId),
    children: [],
});

const sortLocations = (items: InboundLocationOption[]) => {
    items.sort((a, b) => {
        const codeCompare = (a.code || "").localeCompare(b.code || "", "zh-CN", { numeric: true });
        return codeCompare || a.name.localeCompare(b.name, "zh-CN", { numeric: true });
    });
    items.forEach((item) => sortLocations(item.children));
    return items;
};

export const buildInboundLocationTree = (rows: LocationTreeRow[] = []): InboundLocationOption[] => {
    const nodeMap = new Map<string, InboundLocationOption>();
    const roots: InboundLocationOption[] = [];

    rows.forEach((row) => {
        const node = normalizeLocationNode(row);
        if (node.id) {
            nodeMap.set(node.id, node);
        }
    });

    rows.forEach((row) => {
        const id = toEntityId(row._id || row.id);
        const node = nodeMap.get(id);
        if (!node) {
            return;
        }

        const parentId = toEntityId(row.parentId);
        const parent = parentId ? nodeMap.get(parentId) : null;
        if (parent) {
            parent.children.push(node);
        } else {
            roots.push(node);
        }
    });

    return sortLocations(roots);
};

export const formatInboundWarehouseDisplayName = (
    warehouseName?: string,
    locationName?: string,
) => {
    const parts = [warehouseName, locationName].filter(Boolean);

    return parts.length ? parts.join(" / ") : "--";
};

const findLocationPath = (
    locations: InboundLocationOption[],
    locationId: string,
    parents: InboundLocationOption[] = [],
): InboundLocationOption[] => {
    for (const location of locations) {
        const path = [...parents, location];
        if (location.id === locationId) {
            return path;
        }

        const childPath = findLocationPath(location.children, locationId, path);
        if (childPath.length) {
            return childPath;
        }
    }

    return [];
};

export const getInboundWarehouseSelection = (
    warehouses: InboundWarehouseOption[],
    warehouseId: string,
    locationId = "",
) => {
    const warehouse = warehouses.find((item) => item.id === warehouseId);
    if (!warehouse) {
        return {
            warehouseId: "",
            locationId: "",
            label: "--",
            isLeaf: false,
        };
    }

    if (!locationId) {
        return {
            warehouseId: warehouse.id,
            locationId: "",
            label: warehouse.name,
            isLeaf: warehouse.children.length === 0 && warehouse.enableLocation !== true,
        };
    }

    const path = findLocationPath(warehouse.children, locationId);
    const location = path[path.length - 1];
    const locationName = path.map((item) => item.name).filter(Boolean).join(" / ");

    return {
        warehouseId: warehouse.id,
        locationId: location?.id || "",
        label: location
            ? formatInboundWarehouseDisplayName(warehouse.name, locationName)
            : warehouse.name,
        isLeaf: location ? location.children.length === 0 : false,
    };
};

export const normalizeInboundOrderForPage = (order: Record<string, any>): InboundPageOrderRow => ({
    backendId: toEntityId(order._id),
    id: order.inboundNo || "",
    type: order.type || "",
    relatedNo: order.relatedNo || "",
    totalQuantity: Number(order.totalQuantity || 0),
    inboundDate: formatLocalDate(order.inboundDate),
    handler: order.handler || "",
    remark: order.remark || "",
    updatedAt: formatLocalDateTime(order.updateTime),
    courierCompany: order.courierCompany || "",
    trackingNo: order.trackingNo || "",
    purchaseOrderNo: order.purchaseOrderNo || "",
    processingOrderNo: order.processingOrderNo || "",
    productionOwner: order.productionOwner || "",
    salesOrderId: toEntityId(order.salesOrderId),
    salesOrderNo: order.salesOrderNo || "",
    orderNo: order.orderNo || "",
    returnReason: order.returnReason || "",
    items: Array.isArray(order.items)
        ? order.items.map((item: Record<string, any>, index: number) => ({
            rowId: `${toEntityId(item.productId) || "inbound-product"}-${index}`,
            productId: toEntityId(item.productId),
            productCode: item.productCode || "",
            productName: item.productName || "",
            model: item.model || "",
            categoryId: toEntityId(item.categoryId),
            categoryName: item.categoryName || item.categoryPath || "",
            image: item.image || "",
            quantity: Number(item.quantity || 0),
            unitId: toEntityId(item.unitId),
            unitName: item.unitName || "",
            targetWarehouse: formatInboundWarehouseDisplayName(
                item.warehouseName || "",
                item.locationName || "",
            ),
            warehouseId: toEntityId(item.warehouseId),
            locationId: toEntityId(item.locationId),
        }))
        : [],
});
