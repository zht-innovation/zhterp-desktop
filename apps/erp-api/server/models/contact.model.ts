import mongoose from 'mongoose'
import { useCustomerModel } from './customer.model'
import { useSalespersonModel } from './salesperson.model'

const { Schema } = mongoose

interface ContactReq {
    conCustomerId: mongoose.Types.ObjectId,
    conSalespersonId: mongoose.Types.ObjectId,
    expireDate: Date
}

const contactSchema = new Schema({
    conCustomerId: {
        type: Schema.Types.ObjectId,
        ref: 'Customer',
        default: null,
    },
    conSalespersonId: {
        type: Schema.Types.ObjectId,
        ref: 'Salesperson',
        default: null,
    },
    expireDate: Date,
    _beginDate: {
        type: Date,
        default: Date.now
    }
}, {
    versionKey: false
})

const Contact = mongoose.model('Contact', contactSchema)

class ContactModel {
    contact: typeof Contact
    customerModel: any
    salespersonModel: any

    constructor(contact: typeof Contact) {
        this.contact = contact
        this.customerModel = useCustomerModel()
        this.salespersonModel = useSalespersonModel()
    }

    // add
    async add(contact: ContactReq) {
        try {
            // 若客户已被分配给其他销售，则先解除原有分配关系
            const customer = await this.customerModel.customer
                .findById(contact.conCustomerId)
                .select('_isAssigned _assignSalespersonId _isFakeDel')

            if (!customer) throw new Error(`客户 ${contact.conCustomerId} 不存在`)
            if (customer._isFakeDel) throw new Error('客户已被删除')

            const salesperson = await this.salespersonModel.salesperson
                .findById(contact.conSalespersonId)
                .select('_isFakeDel')
            if (!salesperson) throw new Error(`销售 ${contact.conSalespersonId} 不存在`)
            if (salesperson._isFakeDel) throw new Error('销售已被删除')

            const nextSalespersonId = contact.conSalespersonId.toString()
            const currentSalespersonId = customer._assignSalespersonId?.toString()
            const alreadyAssignedToSame =
                Boolean(customer._isAssigned) &&
                Boolean(currentSalespersonId) &&
                currentSalespersonId === nextSalespersonId

            if (
                customer._isAssigned &&
                currentSalespersonId &&
                currentSalespersonId !== nextSalespersonId
            ) {
                await this.salespersonModel.removeAContact(currentSalespersonId)
                await this.contact.deleteMany({
                    conCustomerId: contact.conCustomerId,
                    conSalespersonId: currentSalespersonId,
                })
            }

            // Assign to the new salesperson (and increment count) only when this is a new assignment.
            if (!alreadyAssignedToSame) {
                await this.customerModel.addContact(
                    contact.conCustomerId.toString(),
                    nextSalespersonId
                )
                await this.salespersonModel.addAContact(nextSalespersonId)
            }

            // 更新维护信息
            await this.contact.findOneAndUpdate(
                {
                    conCustomerId: contact.conCustomerId,
                    conSalespersonId: contact.conSalespersonId,
                },
                {
                    $set: { expireDate: contact.expireDate },
                },
                { upsert: true, setDefaultsOnInsert: true }
            )
        } catch (err: any) {
            throw err
        }
    }

    // remove
    async remove(_id: string) {
        try {
            const contact = await this.contact.findById(_id)
            if (!contact) {
                throw new Error(`对接 ${_id} 不存在`)
            }

            const customerId = contact.conCustomerId
            const salespersonId = contact.conSalespersonId

            // Only decrement/unassign if the customer is currently assigned to this salesperson.
            if (customerId && salespersonId) {
                const customer = await this.customerModel.customer
                    .findById(customerId)
                    .select('_isAssigned _assignSalespersonId')
                const isOwnedByThisSalesperson =
                    Boolean(customer?._isAssigned) &&
                    customer?._assignSalespersonId?.toString() === salespersonId.toString()

                if (isOwnedByThisSalesperson) {
                    await this.customerModel.removeContact(customerId.toString())
                    await this.salespersonModel.removeAContact(salespersonId.toString())
                }
            }

            return await this.contact.deleteOne({ _id })
        } catch (err: any) {
            throw err
        }

    }

    // TODO：根据id字段在customer中找到对应客户信息一并返回
    // retrieve
    async retrieveContactList(_id: string, _userRole: number) {
        // 当前为管理员
        if (_userRole <= 2) {
            try {
                const contacts = await this.contact.aggregate([
                    {
                        $lookup: {
                            from: 'customers',
                            localField: 'conCustomerId',
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
                            localField: 'conSalespersonId',
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
                            appDays: 1,
                            _appDate: 1,
                            customer: {
                                _id: '$customerInfo._id',
                                name: '$customerInfo.name',
                                company: '$customerInfo.company'
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

                return contacts;

            } catch (error) {
                console.error('查询申请列表失败:', error);
                throw error;
            }
        }
        // 为销售
        else {
            try {
                const salespersonId = new mongoose.Types.ObjectId(_id);

                const contacts = await this.contact.aggregate([
                    {
                        $match: {
                            conSalespersonId: salespersonId
                        }
                    },
                    {
                        $lookup: {
                            from: 'customers',
                            localField: 'conCustomerId',
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
                            localField: 'conSalespersonId',
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
                            appDays: 1,
                            _appDate: 1,
                            customer: {
                                _id: '$customerInfo._id',
                                name: '$customerInfo.name',
                                company: '$customerInfo.company'
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

                return contacts;

            } catch (error) {
                console.error('查询销售申请列表失败:', error);
                throw error;
            }
        }
    }
}

export const useContactModel = () => new ContactModel(Contact)
export {
    ContactReq
}
