import mongoose from 'mongoose'

const { Schema } = mongoose

// 跟进方式枚举
const FOLLOW_UP_METHODS = ['电话', '微信/WhatsApp', '邮件', '上门拜访', '线上会议', '展会对接'] as const

// 客户反馈态度枚举
const FEEDBACK_ATTITUDES = ['十分满意，并达成合作', '积极', '中性', '消极'] as const

// 当前阶段枚举
const CURRENT_STAGES = ['初步触达', '需求确认', '方案报价', '商务谈判', '合同签订', '售后维护'] as const

// 机型枚举
const PRODUCT_MODELS = ['KEEL', 'KEEL Mini', 'KEEL Plus', 'KEEL Pro', 'KEEL Max', 'NAGA X4', 'NAGA X8'] as const

// 维护产品类型枚举
const MAINTENANCE_TYPES = ['机型', '电池', '电路板', '桨叶', '其他'] as const

interface LogReq {
    content: string
    logSalespersonId: mongoose.Types.ObjectId | string
    logCustomerId: mongoose.Types.ObjectId | string
    logDate?: Date              // 日志创建日期（用户可选择的日期）
    followUpMethod?: string     // 跟进方式
    subject?: string            // 跟进主题
    feedbackAttitude?: string   // 客户反馈态度
    currentStage?: string       // 当前阶段
    followUpResult?: string     // 本次跟进结果
    // 售后维护相关字段
    maintenanceType?: string        // 维护产品类型
    productModel?: string           // 机型（当维护类型为"机型"时）
    productSerialNumber?: string    // 产品序列号
    problemDescription?: string     // 问题描述
    solutionAndProgress?: string    // 解决方案与进度
    attachments?: LogAttachment[]          // 附件
}

type LogAttachment =
    | string
    | {
        path: string
        originalName?: string
    }

const logSchema = new Schema({
    content: {
        type: String,
        required: true
    },
    logSalespersonId: {
        type: Schema.Types.ObjectId,
        ref: 'Salesperson',
        required: true
    },
    logCustomerId: {
        type: Schema.Types.ObjectId,
        ref: 'Customer',
        required: true
    },
    logDate: {
        type: Date,
        default: Date.now
    },
    followUpMethod: {
        type: String,
        enum: FOLLOW_UP_METHODS,
        default: null
    },
    subject: {
        type: String,
        default: ''
    },
    feedbackAttitude: {
        type: String,
        enum: FEEDBACK_ATTITUDES,
        default: null
    },
    currentStage: {
        type: String,
        enum: CURRENT_STAGES,
        default: null
    },
    followUpResult: {
        type: String,
        default: ''
    },
    // 售后维护相关字段
    maintenanceType: {
        type: String,
        enum: MAINTENANCE_TYPES,
        default: null
    },
    productModel: {
        type: String,
        enum: PRODUCT_MODELS,
        default: null
    },
    productSerialNumber: {
        type: String,
        default: ''
    },
    problemDescription: {
        type: String,
        default: ''
    },
    solutionAndProgress: {
        type: String,
        default: ''
    },
    attachments: {
        type: [Schema.Types.Mixed],
        default: []
    },
    _createDate: {
        type: Date,
        default: Date.now
    },
    _isFakeDel: {
        type: Boolean,
        default: false
    }
}, {
    versionKey: false
})

const Log = mongoose.model('Log', logSchema)

class LogModel {
    log: typeof Log

    constructor(log: typeof Log) {
        this.log = log
    }

    // 添加日志
    async add(logData: LogReq) {
        try {
            return await this.log.create(logData)
        } catch (err: any) {
            console.error('添加日志失败:', err.message)
            throw err
        }
    }

    // 获取日志列表（管理员：全部，销售:自己的）
    async retrieveLogList(salespersonId: string | null, userRole: number) {
        try {
            const matchCondition: any = { _isFakeDel: false }

            if (userRole === 3 && salespersonId) {
                matchCondition.logSalespersonId = new mongoose.Types.ObjectId(salespersonId)
            }

            const logs = await this.log.aggregate([
                { $match: matchCondition },
                {
                    $lookup: {
                        from: 'customers',
                        localField: 'logCustomerId',
                        foreignField: '_id',
                        as: 'customerInfo'
                    }
                },
                {
                    $unwind: {
                        path: '$customerInfo',
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $lookup: {
                        from: 'salespeople',  // 修改为 salespeople
                        localField: 'logSalespersonId',
                        foreignField: '_id',
                        as: 'salespersonInfo'
                    }
                },
                {
                    $unwind: {
                        path: '$salespersonInfo',
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $addFields: {
                        customer: {
                            $cond: {
                                if: { $ifNull: ['$customerInfo._id', false] },
                                then: {
                                    _id: '$customerInfo._id',
                                    name: '$customerInfo.name',
                                    company: '$customerInfo.company',
                                    country: '$customerInfo.country'
                                },
                                else: null
                            }
                        },
                        salesperson: {
                            $cond: {
                                if: { $ifNull: ['$salespersonInfo._id', false] },
                                then: {
                                    _id: '$salespersonInfo._id',
                                    name: '$salespersonInfo.name',
                                    nameCn: '$salespersonInfo.nameCn',
                                    avatar: '$salespersonInfo.avatar',
                                    region: '$salespersonInfo.region'
                                },
                                else: null
                            }
                        }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        content: 1,
                        logSalespersonId: 1,
                        logCustomerId: 1,
                        logDate: 1,
                        followUpMethod: 1,
                        subject: 1,
                        feedbackAttitude: 1,
                        currentStage: 1,
                        followUpResult: 1,
                        maintenanceType: 1,
                        productModel: 1,
                        productSerialNumber: 1,
                        problemDescription: 1,
                        solutionAndProgress: 1,
                        attachments: 1,
                        _createDate: 1,
                        customer: 1,
                        salesperson: 1
                    }
                },
                { $sort: { logDate: -1 } }
            ])

            return logs
        } catch (error) {
            console.error('查询日志列表失败:', error)
            throw error
        }
    }

    // 根据销售ID获取日志
    async getLogsBySalesperson(salespersonId: string) {
        try {
            const salesObjectId = new mongoose.Types.ObjectId(salespersonId)

            return await this.log.aggregate([
                {
                    $match: {
                        logSalespersonId: salesObjectId,
                        _isFakeDel: false
                    }
                },
                {
                    $lookup: {
                        from: 'customers',
                        localField: 'logCustomerId',
                        foreignField: '_id',
                        as: 'customerInfo'
                    }
                },
                {
                    $unwind: {
                        path: '$customerInfo',
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $project: {
                        _id: 1,
                        content: 1,
                        logDate: 1,
                        followUpMethod: 1,
                        subject: 1,
                        feedbackAttitude: 1,
                        currentStage: 1,
                        followUpResult: 1,
                        maintenanceType: 1,
                        productModel: 1,
                        productSerialNumber: 1,
                        problemDescription: 1,
                        solutionAndProgress: 1,
                        attachments: 1,
                        _createDate: 1,
                        customer: {
                            _id: '$customerInfo._id',
                            name: '$customerInfo.name',
                            company: '$customerInfo.company'
                        }
                    }
                },
                { $sort: { logDate: -1 } }
            ])
        } catch (error) {
            console.error('查询销售日志失败:', error)
            throw error
        }
    }

    // 根据客户ID获取日志
    async getLogsByCustomer(customerId: string) {
        try {
            const customerObjectId = new mongoose.Types.ObjectId(customerId)

            return await this.log.aggregate([
                {
                    $match: {
                        logCustomerId: customerObjectId,
                        _isFakeDel: false
                    }
                },
                {
                    $lookup: {
                        from: 'salespeople',  // 修改为 salespeople
                        localField: 'logSalespersonId',
                        foreignField: '_id',
                        as: 'salespersonInfo'
                    }
                },
                {
                    $unwind: {
                        path: '$salespersonInfo',
                        preserveNullAndEmptyArrays: true
                    }
                },
                {
                    $project: {
                        _id: 1,
                        content: 1,
                        logDate: 1,
                        followUpMethod: 1,
                        subject: 1,
                        feedbackAttitude: 1,
                        currentStage: 1,
                        followUpResult: 1,
                        maintenanceType: 1,
                        productModel: 1,
                        productSerialNumber: 1,
                        problemDescription: 1,
                        solutionAndProgress: 1,
                        attachments: 1,
                        _createDate: 1,
                        salesperson: {
                            _id: '$salespersonInfo._id',
                            name: '$salespersonInfo.name'
                        }
                    }
                },
                { $sort: { logDate: -1 } }
            ])
        } catch (error) {
            console.error('查询客户日志失败:', error)
            throw error
        }
    }

    // 删除日志（假删除）
    async fakeDel(ids: string[]) {
        return await this.log.updateMany(
            { _id: { $in: ids } },
            { _isFakeDel: true }
        )
    }

    // 彻底删除日志
    async delete(id: string) {
        return await this.log.deleteOne({
            _id: id
            // _isFakeDel: true
        })
    }
}

export const useLogModel = () => new LogModel(Log)
export { LogReq, FOLLOW_UP_METHODS, FEEDBACK_ATTITUDES, CURRENT_STAGES, PRODUCT_MODELS, MAINTENANCE_TYPES }
