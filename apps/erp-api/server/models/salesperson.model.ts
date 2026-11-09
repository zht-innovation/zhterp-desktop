import mongoose from 'mongoose'

const { Schema } = mongoose

interface SalespersonReq {
    linkAdminId?: mongoose.Types.ObjectId,
    name?: string,
    avatar?: string,
    nameCn?: string,
    nameEn?: string,
    joinDate?: Date,
    joinDesc?: string,
    country?: string,
    city?: string,
    phone?: string,
    whatsapp?: string,
    email?: string,
    languages?: string[],
    markets?: string[],
    domains?: string[],
    region?: string,
    _dealCount?: number,
    plans?: string[],
    plansUpdatedAt?: Date,
}

const SalespersonSchema = new Schema({
    linkAdminId: {
        type: Schema.Types.ObjectId,
        ref: 'Customer',
        default: null,
    },
    name: String,
    avatar: String,
    nameCn: String,
    nameEn: String,
    joinDate: String,
    joinDesc: String,
    country: String,
    city: String,
    phone: String,
    whatsapp: String,
    email: String,
    languages: [String],
    markets: [String],
    domains: [String],
    region: String,
    plans: {
        type: [String],
        default: [],
    },
    plansUpdatedAt: {
        type: Date,
        default: null,
    },
    _customerNum: {
        type: Number,
        default: 0,
    },
    _dealCount: {
        type: Number,
        default: 0,
    },
    _isFakeDel: {
        type: Boolean,
        default: false,
    },
}, {
    versionKey: false,
    timestamps: {
        createdAt: '_addTime',
        updatedAt: false
    }
})

const Salesperson = mongoose.model('Salesperson', SalespersonSchema)

class SalespersonModel {
    salesperson: typeof Salesperson

    constructor(salesperson: typeof Salesperson) {
        this.salesperson = salesperson
    }

    async add(salesperson: SalespersonReq) {
        try {
            await this.salesperson.create(salesperson)
        } catch (err: any) {
            throw err
        }
    }

    async update(_id: string, updates: Partial<SalespersonReq>) {
        const updateData: Partial<SalespersonReq> = {}
        for (const [key, value] of Object.entries(updates) as Array<[keyof SalespersonReq, SalespersonReq[keyof SalespersonReq]]>) {
            if (value === undefined) continue
            if (typeof value === 'string' && value.trim() === '') continue
            updateData[key] = value
        }
        await this.salesperson.findByIdAndUpdate(_id, updateData)
    }

    async retrieveSalespersonList(includeDeleted = false) {
        const filter = includeDeleted ? {} : { _isFakeDel: { $ne: true } }
        return await this.salesperson.find(filter)
    }

    async fakeDel(_ids: string[]) {
        await this.salesperson.updateMany(
            {
                _id: { $in: _ids },
                _customerNum: 0 // 只有没有对接时才能移到回收站
            },
            { _isFakeDel: true }
        )
    }

    async delete(_ids: string[]) {
        await this.salesperson.deleteMany({ _id: { $in: _ids }, _isFakeDel: true }) // 只有回收站里的才能删除
    }

    async addAContact(_id: string) {
        try {
            const result = await this.salesperson.findByIdAndUpdate(
                _id,
                { $inc: { _customerNum: 1 } },
                { new: true, runValidators: true }
            )

            if (!result) {
                throw new Error(`销售 ${_id} 不存在`)
            }

            return result
        } catch (err: any) {
            throw err
        }
    }
    async removeAContact(_id: string) {
        try {
            const result = await this.salesperson.findByIdAndUpdate(
                _id,
                // _customerNum-1，且保证不为负数
                [
                    {
                        $set: {
                            _customerNum: {
                                $max: [
                                    0,
                                    {
                                        $subtract: [
                                            '$_customerNum',
                                            1,
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                ],
                { new: true, runValidators: true }
            )

            if (!result) {
                throw new Error(`销售 ${_id} 不存在`)
            }

            return result
        } catch (err: any) {
            throw err
        }
    }

    async search(keyword: string, page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit
        const regex = new RegExp(keyword, 'i')

        // 构建搜索条件
        const searchConditions = {
            _isFakeDel: { $ne: true },
            $or: [
                { name: regex },
                { nameCn: regex },
                { nameEn: regex },
                { country: regex },
                { city: regex },
                { region: regex },
                { phone: regex },
                { whatsapp: regex },
                { email: regex },
                { languages: regex },
                { markets: regex },
                { domains: regex }
            ]
        }

        // 获取总数
        const total = await this.salesperson.countDocuments(searchConditions)

        // 搜索销售人员
        const salespeople = await this.salesperson.aggregate([
            { $match: searchConditions },
            {
                $addFields: {
                    // 标记匹配的字段
                    _matchedFields: {
                        $filter: {
                            input: [
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$name', ''] }, regex: keyword, options: 'i' } }, 'name', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$nameCn', ''] }, regex: keyword, options: 'i' } }, 'nameCn', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$nameEn', ''] }, regex: keyword, options: 'i' } }, 'nameEn', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$country', ''] }, regex: keyword, options: 'i' } }, 'country', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: keyword, options: 'i' } }, 'city', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$region', ''] }, regex: keyword, options: 'i' } }, 'region', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$phone', ''] }, regex: keyword, options: 'i' } }, 'phone', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$whatsapp', ''] }, regex: keyword, options: 'i' } }, 'whatsapp', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$email', ''] }, regex: keyword, options: 'i' } }, 'email', null] },
                                // 数组字段检查
                                {
                                    $cond: [
                                        {
                                            $gt: [
                                                {
                                                    $size: {
                                                        $filter: {
                                                            input: { $ifNull: ['$languages', []] },
                                                            as: 'lang',
                                                            cond: { $regexMatch: { input: '$$lang', regex: keyword, options: 'i' } }
                                                        }
                                                    }
                                                },
                                                0
                                            ]
                                        },
                                        'languages',
                                        null
                                    ]
                                },
                                {
                                    $cond: [
                                        {
                                            $gt: [
                                                {
                                                    $size: {
                                                        $filter: {
                                                            input: { $ifNull: ['$markets', []] },
                                                            as: 'market',
                                                            cond: { $regexMatch: { input: '$$market', regex: keyword, options: 'i' } }
                                                        }
                                                    }
                                                },
                                                0
                                            ]
                                        },
                                        'markets',
                                        null
                                    ]
                                },
                                {
                                    $cond: [
                                        {
                                            $gt: [
                                                {
                                                    $size: {
                                                        $filter: {
                                                            input: { $ifNull: ['$domains', []] },
                                                            as: 'domain',
                                                            cond: { $regexMatch: { input: '$$domain', regex: keyword, options: 'i' } }
                                                        }
                                                    }
                                                },
                                                0
                                            ]
                                        },
                                        'domains',
                                        null
                                    ]
                                }
                            ],
                            as: 'field',
                            cond: { $ne: ['$$field', null] }
                        }
                    }
                }
            },
            { $sort: { _addTime: -1 } },
            { $skip: skip },
            { $limit: limit }
        ])

        return {
            salespeople,
            total,
            hasMore: skip + salespeople.length < total
        }
    }
}

export const useSalespersonModel = () => new SalespersonModel(Salesperson)
export {
    SalespersonReq
}
