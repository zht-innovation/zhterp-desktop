import mongoose from 'mongoose'
import { useCustomerModel } from './customer.model'
import { useSalespersonModel } from './salesperson.model'
import { useNewsModel } from './news.model'
import { type TermActor, useCustomerTermModel } from './customerTerm.model'

const { Schema } = mongoose

interface ApplicationReq {
    appCustomerId: mongoose.Types.ObjectId,
    appSalespersonId: mongoose.Types.ObjectId,
    appDays: number
}


const applicationSchema = new Schema({
    appCustomerId: {
        type: Schema.Types.ObjectId,
        ref: 'Customer',
        default: null,
    },
    appSalespersonId: {
        type: Schema.Types.ObjectId,
        ref: 'Salesperson',
        default: null,
    },
    // new: 申请对接新客户；extend: 申请延长已对接客户维护期
    appType: {
        type: String,
        default: 'new',
    },
    appDays: Number,
    _appDate: {
        type: Date,
        default: Date.now
    }
}, {
    versionKey: false
})

const Application = mongoose.model('Application', applicationSchema)

class ApplicationModel {
    application: typeof Application
    customerModel: any
    salespersonModel: any
    newsModel: any
    termModel: any

    constructor(application: typeof Application) {
        this.application = application
        this.customerModel = useCustomerModel()
        this.salespersonModel = useSalespersonModel()
        this.newsModel = useNewsModel()
        this.termModel = useCustomerTermModel()
    }

    // add 
    async add(application: ApplicationReq, actor?: TermActor) {
        try {
            const customer = await this.customerModel.customer
                .findById(application.appCustomerId)
                .select('_isAssigned _assignSalespersonId _isApplying _isFakeDel expireDate')
            if (!customer) {
                throw new Error('申请对接的客户不存在');
            }
            if (customer._isFakeDel) {
                throw new Error('申请对接的客户已被删除');
            }
            if (customer._isAssigned) {
                const assignedId = customer?._assignSalespersonId?.toString?.() || ''
                const applySalesId = application?.appSalespersonId?.toString?.() || String(application?.appSalespersonId || '')
                if (!assignedId || assignedId !== applySalesId) {
                    throw new Error('客户已被其他销售对接');
                }
            }
            if (customer._isApplying) {
                throw new Error('申请对接的客户已被申请对接');
            }

            const salesperson = await this.salespersonModel.salesperson
                .findById(application.appSalespersonId)
                .select('_isFakeDel name nameCn')

            if (!salesperson) {
                throw new Error('销售不存在');
            }
            if (salesperson._isFakeDel) {
                throw new Error('销售已被删除');
            }

            const appType = customer._isAssigned ? 'extend' : 'new'
            const appInfo = await this.application.create({ ...application, appType })
            const salesName = salesperson.nameCn || salesperson.name || ''

            try {
                await this.termModel.addApply(
                    {
                        appId: appInfo._id,
                        customerId: application.appCustomerId,
                        appType,
                        status: 'pending',
                        days: Number(application.appDays || 0),
                        reqExpire: customer.expireDate || null,
                        newSalesId: application.appSalespersonId,
                        newSalesName: salesName,
                        createdBy: actor || {
                            name: salesName,
                            role: 3,
                            salesId: application.appSalespersonId,
                        },
                    }
                )
            } catch (err) {
                await this.application.deleteOne({ _id: appInfo._id })
                throw err
            }

            await this.customerModel.customer.findByIdAndUpdate(
                application.appCustomerId,
                { _isApplying: true }
            )

            return appInfo
        } catch (err: any) {
            console.error('申请提交失败:', err.message);
            throw err
        }
    }

    // remove
    async handle(_id: string, agreed: boolean, actor?: TermActor) {
        const appInfo = await this.application
            .findById(_id)
            .select('appCustomerId appSalespersonId appDays appType')
        if (!appInfo) {
            throw new Error('申请信息不存在或已被删除')
        }

        const customer = await this.customerModel.customer
            .findById(appInfo.appCustomerId)
            .select('_isAssigned _assignSalespersonId expireDate _isFakeDel')
        if (!customer) {
            throw new Error('客户不存在或已被删除')
        }
        if (customer._isFakeDel) {
            throw new Error('客户已被删除')
        }

        const currentSalespersonId = customer?._assignSalespersonId?.toString?.() || ''
        const newSalespersonId = appInfo?.appSalespersonId?.toString?.() || String(appInfo?.appSalespersonId || '')
        const newSalesperson = await this.salespersonModel.salesperson
            .findById(appInfo.appSalespersonId)
            .select('name nameCn')
        const oldSalesperson = currentSalespersonId === newSalespersonId
            ? newSalesperson
            : currentSalespersonId
                ? await this.salespersonModel.salesperson
                    .findById(currentSalespersonId)
                    .select('name nameCn')
                : null
        const oldSalesName = oldSalesperson?.nameCn || oldSalesperson?.name || ''
        const newSalesName = newSalesperson?.nameCn || newSalesperson?.name || ''
        const reviewBy = actor || { name: '管理员', role: 2 }

        if (agreed) {
            const today = new Date()
            const applyDays = Number(appInfo.appDays || 0)
            const expireDate = new Date(today)
            expireDate.setDate(today.getDate() + applyDays)
            const isExtension = Boolean(customer?._isAssigned) && (currentSalespersonId === newSalespersonId)

            if (isExtension) {
                await this.customerModel.customer.findByIdAndUpdate(
                    appInfo.appCustomerId,
                    {
                        _isApplying: false,
                        expireDate,
                    }
                )
            } else {
                if (customer._isAssigned && currentSalespersonId !== newSalespersonId) {
                    await this.salespersonModel.removeAContact(currentSalespersonId)
                }

                await this.customerModel.customer.findByIdAndUpdate(
                    appInfo.appCustomerId,
                    {
                        _isAssigned: true,
                        _assignSalespersonId: appInfo.appSalespersonId,
                        _isApplying: false,
                        expireDate,
                        _assignedByAdmin: true,
                        _addTime: new Date(),
                    },
                    { overwriteImmutable: true }
                )

                await this.salespersonModel.addAContact(newSalespersonId)
            }

            const history = await this.termModel.reviewApply(appInfo._id, {
                status: 'approved',
                oldExpire: customer.expireDate || null,
                newExpire: expireDate,
                oldSalesId: customer._assignSalespersonId || null,
                oldSalesName,
                newSalesId: appInfo.appSalespersonId,
                newSalesName,
                reviewBy,
            })
            if (!history) {
                throw new Error('申请历史不存在')
            }
        } else {
            await this.customerModel.customer.findByIdAndUpdate(
                appInfo.appCustomerId,
                { _isApplying: false }
            )

            const history = await this.termModel.reviewApply(appInfo._id, {
                status: 'rejected',
                oldExpire: customer.expireDate || null,
                newExpire: null,
                oldSalesId: customer._assignSalespersonId || null,
                oldSalesName,
                newSalesId: appInfo.appSalespersonId,
                newSalesName,
                reviewBy,
            })
            if (!history) {
                throw new Error('申请历史不存在')
            }
        }

        const result = await this.application.deleteOne({ _id })
        await this.createDecisionNews(appInfo, agreed, actor)
        return result
    }

    // revoke
    async revoke(_id: string) {
        const appInfo = await this.application
            .findById(_id)
            .select('appCustomerId appSalespersonId appDays')
        if (!appInfo) {
            throw new Error('申请信息不存在或已被删除')
        }

        await this.customerModel.customer.findByIdAndUpdate(
            appInfo.appCustomerId,
            { _isApplying: false }
        )
        await this.termModel.removeApply(appInfo._id)
        return await this.application.deleteOne({ _id })
    }

    async createDecisionNews(appInfo: any, agreed: boolean, actor?: { name?: string | null }) {
        try {
            const [customer, salesperson] = await Promise.all([
                this.customerModel.customer.findById(appInfo.appCustomerId).select('name'),
                this.salespersonModel.salesperson.findById(appInfo.appSalespersonId).select('name nameCn'),
            ])

            const actorName = actor?.name || '管理员'
            const customerName = customer?.name || ''
            const salespersonName = salesperson?.nameCn || salesperson?.name || ''
            const type = agreed ? 'application_approved' : 'application_rejected'
            const eventKey = `${type}:${appInfo._id}`

            await this.newsModel.add({
                scope: 'personal',
                type,
                recipientSalespersonId: appInfo.appSalespersonId,
                actorName,
                customerId: appInfo.appCustomerId,
                customerName,
                salespersonId: appInfo.appSalespersonId,
                salespersonName,
                eventKey,
            })
        } catch (err: any) {
            console.error('Create application decision news failed:', err?.message || err)
        }
    }

    // retrieve
    async retrieveApplicationList(salespersonId: string | null, _userRole: number) {
        // 当前为管理员
        if (_userRole <= 2) {
            try {
                const applications = await this.application.aggregate([
                    {
                        $lookup: {
                            from: 'customers',
                            localField: 'appCustomerId',
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
                            from: 'salespeople',
                            localField: 'appSalespersonId',
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
                            appCustomerId: 1,
                            appSalespersonId: 1,
                            appType: 1,
                            appDays: 1,
                            _appDate: 1,
                            customer: {
                                _id: '$customerInfo._id',
                                name: '$customerInfo.name',
                                company: '$customerInfo.company',
                                expireDate: '$customerInfo.expireDate',
                            },
                            salesperson: {
                                _id: '$salespersonInfo._id',
                                name: '$salespersonInfo.name',
                                nameCn: '$salespersonInfo.nameCn'
                            }
                        }
                    },
                    {
                        $sort: { _appDate: -1 }
                    }
                ]);

                return applications;

            } catch (error) {
                console.error('查询申请列表失败:', error);
                throw error;
            }
        }
        // 为销售
        else {
            try {
                if (!salespersonId) {
                    throw new Error('销售人员ID不能为空');
                }

                const salesObjectId = new mongoose.Types.ObjectId(salespersonId);

                const applications = await this.application.aggregate([
                    {
                        $match: {
                            appSalespersonId: salesObjectId
                        }
                    },
                    {
                        $lookup: {
                            from: 'customers',
                            localField: 'appCustomerId',
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
                            from: 'salespeople',
                            localField: 'appSalespersonId',
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
                            appCustomerId: 1,
                            appSalespersonId: 1,
                            appType: 1,
                            appDays: 1,
                            _appDate: 1,
                            customer: {
                                _id: '$customerInfo._id',
                                name: '$customerInfo.name',
                                company: '$customerInfo.company',
                                expireDate: '$customerInfo.expireDate',
                            },
                            salesperson: {
                                _id: '$salespersonInfo._id',
                                name: '$salespersonInfo.name'
                            }
                        }
                    },
                    {
                        $sort: { _appDate: -1 }
                    }
                ]);

                return applications;

            } catch (error) {
                console.error('查询销售申请列表失败:', error);
                throw error;
            }
        }
    }
}

export const useApplicationModel = () => new ApplicationModel(Application)
export {
    ApplicationReq
}
