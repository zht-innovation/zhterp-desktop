const INVENTORY_CHECK_CATEGORY = "库存核对";

// 旧通知的 relatedPath 只存了裸路径，跳转时补上弹窗所需的查询参数。
export const resolveInventoryCheckPath = (
    relatedPath: string | undefined,
    category: string | undefined,
    relatedId: string | undefined,
    fallbackPath = "/configuration/notification",
) => {
    const targetPath = relatedPath || fallbackPath;

    if (
        category !== INVENTORY_CHECK_CATEGORY
        || !relatedId
        || targetPath === "/configuration/inventory/review"
        || targetPath.includes("orderCheck=")
    ) {
        return targetPath;
    }

    const separator = targetPath.includes("?") ? "&" : "?";

    return `${targetPath}${separator}orderCheck=1&salesOrderId=${encodeURIComponent(relatedId)}`;
};
