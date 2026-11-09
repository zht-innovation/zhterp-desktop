import mongoose from "mongoose";
import { ADMIN_ROLE } from "../../shared/enums";

const NOTIFICATION_CATEGORY_ROLES: Record<string, ADMIN_ROLE> = {
    "采购提醒": ADMIN_ROLE.PURCHASER,
    "生产任务": ADMIN_ROLE.PRODUCTION_MANAGER,
    "生产领料": ADMIN_ROLE.PRODUCTION_MANAGER,
    "库存核对": ADMIN_ROLE.WAREHOUSE_KEEPER,
    "物流取件": ADMIN_ROLE.WAREHOUSE_KEEPER,
    "物流验收异常": ADMIN_ROLE.FINANCE_MANAGER,
};

export const getNotificationCategoryRole = (category: string) =>
    NOTIFICATION_CATEGORY_ROLES[String(category || "").trim()];

export const createNotificationVisibilityFilter = (
    adminId: string,
    role: number,
    personalOnly = false,
) => {
    const recipientFilter = {
        recipientAdminIds: new mongoose.Types.ObjectId(adminId),
    };
    if (personalOnly) return recipientFilter;

    const restrictedCategories = Object.keys(NOTIFICATION_CATEGORY_ROLES);
    const allowedLegacyCategories = restrictedCategories.filter(
        (category) => NOTIFICATION_CATEGORY_ROLES[category] === role,
    );
    const visibilityConditions: any[] = [
        recipientFilter,
        {
            recipientAdminIds: { $exists: false },
            category: { $nin: restrictedCategories },
        },
    ];
    if (allowedLegacyCategories.length > 0) {
        visibilityConditions.push({
            recipientAdminIds: { $exists: false },
            category: { $in: allowedLegacyCategories },
        });
    }

    return {
        $or: visibilityConditions,
    };
};
