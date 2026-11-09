import mongoose from 'mongoose'
import { ENV } from "../utils/enums";
import { createNotificationVisibilityFilter } from "~~/server/utils/notificationVisibility"

const { Schema } = mongoose
const NODE_ENV = process.env.NODE_ENV || ENV.DEV

export const isNotificationReadForAdmin = (
    item: { isRead?: boolean; readByAdminIds?: unknown[] },
    adminId: string,
) => item.isRead === true
    || (item.readByAdminIds || []).some((id: unknown) => String(id) === String(adminId))

export const createNotificationUnreadFilter = (type: string, adminId: string) => ({
    type,
    isRead: { $ne: true },
    readByAdminIds: { $ne: new mongoose.Types.ObjectId(adminId) },
    _isFakeDel: false,
})

export interface NotificationReq {
    type: 'announcement' | 'notification'
    category: string
    title: string
    content: string
    version?: string
    tag?: string
    icon?: string
    relatedId?: string
    relatedPath?: string
    //内部字段（防止同一个订单审批完成后，重复生成多条相同的“库存核对”通知）
    sourceApprovalId?: string
    // 内部字段（防止同一业务事件重复生成通知）
    sourceKey?: string
    recipientAdminIds?: string[]
}

const notificationSchema = new Schema({
    type: {
        type: String,
        enum: ['announcement', 'notification'],
        required: true,
    },
    category: {
        type: String,
        default: '',
    },
    title: {
        type: String,
        required: true,
    },
    content: {
        type: String,
        default: '',
    },
    version: {
        type: String,
        default: '',
    },
    tag: {
        type: String,
        default: '',
    },
    icon: {
        type: String,
        default: '',
    },
    relatedId: {
        type: String,
        default: '',
    },
    relatedPath: {
        type: String,
        default: '',
    },
    sourceApprovalId: {
        type: String,
        trim: true,
        select: false,
    },
    sourceKey: {
        type: String,
        trim: true,
        select: false,
    },
    // 仅标记随销售订单隐藏的提醒，供恢复订单时精确恢复。
    salesOrderDeletionId: {
        type: String,
        select: false,
    },
    recipientAdminIds: {
        type: [Schema.Types.ObjectId],
        ref: 'Admin',
        default: undefined,
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    readByAdminIds: {
        type: [Schema.Types.ObjectId],
        ref: 'Admin',
        default: [],
        select: false,
    },
    _isFakeDel: {
        type: Boolean,
        default: false,
    },
}, {
    versionKey: false,
    timestamps: {
        createdAt: '_time',
        updatedAt: false,
    },
})

notificationSchema.index(
    { type: 1, category: 1, sourceApprovalId: 1 },
    {
        unique: true,
        partialFilterExpression: { sourceApprovalId: { $exists: true } },
    },
)
notificationSchema.index(
    { type: 1, category: 1, sourceKey: 1 },
    {
        unique: true,
        partialFilterExpression: { sourceKey: { $exists: true } },
    },
)
notificationSchema.index({ type: 1, _isFakeDel: 1, isRead: 1, readByAdminIds: 1 })
notificationSchema.index({ recipientAdminIds: 1, type: 1, _isFakeDel: 1 })
notificationSchema.index({ category: 1, relatedId: 1, recipientAdminIds: 1 });

const Notification = mongoose.model('Notification', notificationSchema)

class NotificationModel {
    notification: typeof Notification

    constructor(notification: typeof Notification) {
        this.notification = notification
    }

    // 按类型分页查询
    async retrieveByType(
        type: string,
        adminId: string,
        page: number = 1,
        pageSize: number = 20,
        keyword?: string,
        role = -1,
        personalOnly = false,
    ) {
        const query: any = {
            type,
            _isFakeDel: false,
            ...createNotificationVisibilityFilter(adminId, role, personalOnly),
        }
        if (keyword) {
            query.$and = [{
                $or: [
                    { title: { $regex: keyword, $options: 'i' } },
                    { content: { $regex: keyword, $options: 'i' } },
                    { category: { $regex: keyword, $options: 'i' } },
                ],
            }]
        }
        const total = await this.notification.countDocuments(query)
        const list = await this.notification
            .find(query)
            .select('+readByAdminIds')
            .sort({ _time: -1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .lean()
        const currentAdminId = String(adminId)
        const normalizedList = list.map((item: any) => {
            const isRead = isNotificationReadForAdmin(item, currentAdminId)
            delete item.readByAdminIds
            return { ...item, isRead }
        })
        return { list: normalizedList, total, page, pageSize }
    }

    // 获取统计信息
    async getStats(type: string, adminId: string, role = -1, personalOnly = false) {
        const visibility = createNotificationVisibilityFilter(adminId, role, personalOnly)
        const total = await this.notification.countDocuments({ type, _isFakeDel: false, ...visibility })
        const unread = await this.notification.countDocuments(
            { ...createNotificationUnreadFilter(type, adminId), ...visibility },
        )
        return { total, unread }
    }

    async getUnreadSummary(adminId: string, role = -1, personalOnly = false) {
        const [announcement, notification] = await Promise.all([
            this.getStats('announcement', adminId, role, personalOnly),
            this.getStats('notification', adminId, role, personalOnly),
        ])
        return {
            announcementUnread: announcement.unread,
            notificationUnread: notification.unread,
            totalUnread: announcement.unread + notification.unread,
        }
    }

    // 新增通知
    async add(data: NotificationReq) {
        try {
            await this.notification.create(data)
        } catch (err: any) {
            throw err
        }
    }

    async upsertInventoryCheckNotification(
        data: NotificationReq & {
            sourceApprovalId: string;
            _isFakeDel?: boolean;
            salesOrderDeletionId?: string;
        },
        session?: mongoose.ClientSession,
    ) {
        const filter = {
            type: 'notification',
            category: '库存核对',
            sourceApprovalId: data.sourceApprovalId,//sourceApprovalId：记录这条通知是由哪个审批实例生成的
        }

        try {
            return await this.notification.findOneAndUpdate(
                filter,
                { $setOnInsert: data },
                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true,
                    ...(session ? { session } : {}),
                },
            )
        } catch (error: any) {
            if (error?.code === 11000 && !session) {
                return await this.notification.findOne(filter)
            }
            throw error
        }
    }

    async upsertBySourceKey(data: NotificationReq & { sourceKey: string }, session?: mongoose.ClientSession) {
        const filter = {
            type: data.type,
            category: data.category,
            sourceKey: data.sourceKey,
        }

        try {
            return await this.notification.findOneAndUpdate(
                filter,
                { $setOnInsert: data },
                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true,
                    ...(session ? { session } : {}),
                },
            )
        } catch (error: any) {
            if (error?.code === 11000 && !session) {
                return await this.notification.findOne(filter)
            }
            throw error
        }
    }

    async upsertFeedbackNotification(data: NotificationReq & { sourceKey: string }, session: mongoose.ClientSession) {
        if (data.recipientAdminIds?.length !== 1 || !["意见进度", "意见退回"].includes(data.category)) {
            throw new Error("意见通知必须指定唯一提交人");
        }
        return this.upsertBySourceKey(data, session);
    }

    feedbackUnreadQuery(feedbackIds: string[], adminId: string) {
        return {
            ...createNotificationUnreadFilter("notification", adminId),
            ...createNotificationVisibilityFilter(adminId, -1, true),
            category: { $in: ["意见进度", "意见退回"] },
            relatedId: { $in: feedbackIds },
        };
    }

    async feedbackUnread(feedbackIds: string[], adminId: string) {
        return this.notification.find(this.feedbackUnreadQuery(feedbackIds, adminId)).select("_id relatedId").lean();
    }

    async readFeedback(feedbackId: string, adminId: string, notificationIds?: string[], session?: mongoose.ClientSession) {
        return this.notification.updateMany(
            { ...this.feedbackUnreadQuery([feedbackId], adminId), ...(notificationIds ? { _id: { $in: notificationIds } } : {}) },
            { $addToSet: { readByAdminIds: new mongoose.Types.ObjectId(adminId) } },
            session ? { session } : {},
        );
    }

    // 批量新增
    async addMany(dataList: NotificationReq[]) {
        try {
            await this.notification.insertMany(dataList)
        } catch (err: any) {
            throw err
        }
    }

    // 标记单条已读
    async checkAsRead(_id: string, adminId: string, role = -1, personalOnly = false) {
        return await this.notification.updateOne(
            { _id, _isFakeDel: false, ...createNotificationVisibilityFilter(adminId, role, personalOnly) },
            { $addToSet: { readByAdminIds: new mongoose.Types.ObjectId(adminId) } },
        )
    }

    // 全部标为已读
    async checkAllAsRead(type: string, adminId: string, role = -1, personalOnly = false) {
        return await this.notification.updateMany(
            {
                type,
                isRead: { $ne: true },
                readByAdminIds: { $ne: new mongoose.Types.ObjectId(adminId) },
                _isFakeDel: false,
                ...createNotificationVisibilityFilter(adminId, role, personalOnly),
            },
            { $addToSet: { readByAdminIds: new mongoose.Types.ObjectId(adminId) } },
        )
    }

    // 软删除
    async fakeDelete(_id: string) {
        await this.notification.findByIdAndUpdate(_id, {
            $set: { _isFakeDel: true },
            $unset: { salesOrderDeletionId: 1 },
        })
    }

    // 真删除
    async delete(_id: string) {
        await this.notification.deleteOne({ _id })
    }

    /* debug */
    async deleteAll() {
        if (NODE_ENV === ENV.DEV) {
            await this.notification.deleteMany({})
        }
    }
}

const useNotificationModel = () => new NotificationModel(Notification)

export {
    useNotificationModel,
}
