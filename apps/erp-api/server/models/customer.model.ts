import mongoose from 'mongoose'
import { useSalesOrderModel } from './salesOrder.model'

const { Schema } = mongoose

interface CustomerReq {
    name: string
    avatar?: string
    country: string
    city?: string
    phone?: string
    whatsapp?: string
    wechat?: string
    email?: string
    company?: string
    companyDetail?: string
    companyWebsite?: string
    customerType?: string
    customerLevel?: string
    source?: string
    sourceDetail?: string
    customTags?: string[]
    _isAssigned?: boolean
    _assignSalespersonId?: string
    expireDate?: Date | null
    _assignedByAdmin?: boolean
    attachments?: CustomerAttachment[]
}

type CustomerAttachment =
    | string
    | {
        path: string
        originalName?: string
    }

const customerSchema = new Schema({
    name: String,
    avatar: String,
    country: String,
    city: String,
    phone: String,
    whatsapp: String,
    wechat: String,
    email: String,
    company: String,
    companyDetail: String,
    companyWebsite: String,
    customerType: String,
    customerLevel: String,
    source: String,
    sourceDetail: String,
    customTags: [String],
    attachments: {
        type: [Schema.Types.Mixed],
        default: []
    },
    _isApplying: {
        type: Boolean,
        default: false,
    },
    _isAssigned: {
        type: Boolean,
        default: false,
    },
    _assignSalespersonId: {
        type: Schema.Types.ObjectId,
        ref: 'Salesperson',
        default: null,
    },
    expireDate: {
        type: Date,
        default: null,
    },
    _assignedByAdmin: {
        type: Boolean,
        default: false,
    },
    _isFakeDel: {
        type: Boolean,
        default: false,
    }
}, {
    versionKey: false,
    timestamps: {
        createdAt: '_addTime',
        updatedAt: false
    }
})

customerSchema.index({ _isFakeDel: 1, company: 1, _addTime: -1 })
customerSchema.index({ _assignSalespersonId: 1, _isAssigned: 1, _isFakeDel: 1, company: 1, _addTime: -1 })

const Customer = mongoose.model('Customer', customerSchema)

class CustomerModel {
    customer: typeof Customer

    constructor(customer: typeof Customer) {
        this.customer = customer
    }


    async add(customer: CustomerReq) {
        try {
            return await this.customer.create(customer)
        } catch (err: any) {
            throw err
        }
    }

    async update(
        _id: string,
        updateData: Record<string, any>
    ) {
        if (!updateData || Object.keys(updateData).length === 0) return
        await this.customer.findByIdAndUpdate(_id, updateData)
    }

    async extendContact(_ids: string[], extendDays: number) {
        const extendMilliseconds = extendDays * 24 * 60 * 60 * 1000
        const now = new Date()
        const newExpire = new Date(now.getTime() + extendMilliseconds)
        const ids = Array.from(new Set(_ids))
        const changes = await Promise.all(
            ids.map(async (customerId) => {
                const customer = await this.customer.findOneAndUpdate(
                    {
                        _id: customerId,
                        _isAssigned: true,
                        _isFakeDel: { $ne: true },
                    },
                    { $set: { expireDate: newExpire } },
                    { returnDocument: "before" }
                )

                if (!customer) return null

                const oldExpire = customer.expireDate
                    ? new Date(customer.expireDate)
                    : null
                return {
                    customerId: customer._id,
                    salesId: customer._assignSalespersonId,
                    oldExpire,
                    newExpire,
                }
            })
        )

        return changes.filter(Boolean)
    }

    private getEmptyMatch() {
        return { _id: { $exists: false } }
    }

    private toObjectId(id?: string | null) {
        if (!id || !mongoose.Types.ObjectId.isValid(id)) return null
        return new mongoose.Types.ObjectId(id)
    }

    private getNormalizedCompanyExpression() {
        return {
            $let: {
                vars: {
                    normalized: {
                        $trim: {
                            input: { $ifNull: ['$company', ''] }
                        }
                    }
                },
                in: {
                    $cond: [
                        { $eq: ['$$normalized', ''] },
                        '未填写公司',
                        '$$normalized'
                    ]
                }
            }
        }
    }

    private maskPublicCustomer(customer: any) {
        return {
            _id: customer?._id,
            name: customer?.name,
            avatar: customer?.avatar,
            country: customer?.country,
            city: customer?.city,
            company: customer?.company,
            companyDetail: customer?.companyDetail,
            companyWebsite: customer?.companyWebsite,
            customerType: customer?.customerType,
            customerLevel: customer?.customerLevel,
            source: customer?.source,
            sourceDetail: customer?.sourceDetail,
            customTags: customer?.customTags,
            _isAssigned: Boolean(customer?._isAssigned),
            _isApplying: Boolean(customer?._isApplying),
            _addTime: customer?._addTime,
            _assignSalespersonId: null,
            assignSalespersonName: null
        }
    }

    private applySalespersonMask(customers: any[], role: number) {
        if (role !== 3) return customers
        return customers.map((customer) => {
            if (customer?._isAssigned) return customer
            return this.maskPublicCustomer(customer)
        })
    }

    private async attachDealStats(customers: any[]) {
        if (!Array.isArray(customers) || customers.length === 0) return customers

        const statsMap = await useSalesOrderModel().getCustomerDealStats(
            customers.map((customer) => customer?._id)
        )

        return customers.map((customer) => {
            const customerId = customer?._id?.toString?.() || String(customer?._id || '')
            const stats = statsMap.get(customerId) || {
                dealOrderCount: 0,
                dealTotalAmount: 0
            }
            const dealOrderCount = Number(stats.dealOrderCount || 0)
            const dealTotalAmount = Number(stats.dealTotalAmount || 0)

            return {
                ...customer,
                orderCount: dealOrderCount,
                dealOrderCount,
                dealTotalAmount,
                totalDealAmount: dealTotalAmount
            }
        })
    }

    private buildRoleScopeCondition(
        role: number,
        salespersonId: string | null,
        options: {
            onlyUnassigned?: boolean
            onlyAssigned?: boolean
            onlyDeleted?: boolean
            assignedTo?: string
        } = {}
    ) {
        const onlyUnassigned = Boolean(options.onlyUnassigned)
        const onlyAssigned = Boolean(options.onlyAssigned)
        const onlyDeleted = Boolean(options.onlyDeleted)
        const assignedObjectId = this.toObjectId(options.assignedTo || null)

        if (role <= 2) {
            if (assignedObjectId) {
                return {
                    _isAssigned: true,
                    _assignSalespersonId: assignedObjectId
                }
            }
            if (onlyAssigned) return { _isAssigned: true }
            if (onlyUnassigned) return { _isAssigned: { $ne: true } }
            return {}
        }

        const salespersonObjectId = this.toObjectId(salespersonId)
        if (!salespersonObjectId) return null
        if (assignedObjectId && !assignedObjectId.equals(salespersonObjectId)) {
            return null
        }

        if (onlyDeleted) {
            return { _assignSalespersonId: salespersonObjectId }
        }
        if (assignedObjectId || onlyAssigned) {
            return {
                _isAssigned: true,
                _assignSalespersonId: salespersonObjectId
            }
        }
        if (onlyUnassigned) {
            return { _isAssigned: { $ne: true } }
        }

        return {
            $or: [
                { _isAssigned: { $ne: true } },
                {
                    _isAssigned: true,
                    _assignSalespersonId: salespersonObjectId
                }
            ]
        }
    }

    private async resolveKeywordSalespersonIds(
        keyword: string,
        options: {
            role?: number
            salespersonId?: string | null
            assignedTo?: string | null
        } = {}
    ) {
        const role = typeof options.role === 'number' ? options.role : undefined
        const assignedFilter = this.toObjectId(options.assignedTo || null)
        const selfSalespersonId = this.toObjectId(options.salespersonId || null)

        const salespersonModel = (await import('./salesperson.model')).useSalespersonModel()
        const regex = new RegExp(keyword, 'i')
        const matchedSalespeople = await salespersonModel.salesperson
            .find({
                _isFakeDel: { $ne: true },
                $or: [
                    { name: regex },
                    { nameCn: regex },
                    { nameEn: regex }
                ]
            })
            .select('_id')
            .lean()

        let ids = matchedSalespeople
            .map((item: any) => item?._id?.toString?.() || '')
            .filter(Boolean)

        if (assignedFilter) {
            const assignedId = assignedFilter.toString()
            ids = ids.filter((id) => id === assignedId)
        }

        if (role === 3) {
            if (!selfSalespersonId) return []
            const selfId = selfSalespersonId.toString()
            ids = ids.filter((id) => id === selfId)
        }

        return Array.from(new Set(ids))
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id))
    }

    private async buildKeywordCondition(
        keyword: string,
        options: {
            role?: number
            salespersonId?: string | null
            assignedTo?: string | null
        } = {}
    ) {
        const raw = keyword.trim()
        if (!raw) return null
        const regex = new RegExp(raw, 'i')
        const keywordSalesIds = await this.resolveKeywordSalespersonIds(raw, options)
        const searchOrConditions: Record<string, any>[] = [
            { name: regex },
            { country: regex },
            { city: regex },
            { phone: regex },
            { whatsapp: regex },
            { wechat: regex },
            { email: regex },
            { company: regex },
            { customerType: regex },
            { customTags: { $elemMatch: { $regex: regex } } }
        ]

        if (keywordSalesIds.length > 0) {
            searchOrConditions.push({
                _assignSalespersonId: { $in: keywordSalesIds }
            })
        }

        return {
            $or: searchOrConditions
        }
    }

    private async buildCompanyQueryMatch(
        salespersonId: string | null,
        userRole: number,
        options: {
            keyword?: string
            onlyUnassigned?: boolean
            onlyAssigned?: boolean
            onlyDeleted?: boolean
            category?: string
            assignedTo?: string
            customerLevel?: string
        } = {}
    ) {
        const conditions: Record<string, any>[] = []
        const onlyDeleted = Boolean(options.onlyDeleted)

        conditions.push(
            onlyDeleted
                ? { _isFakeDel: true }
                : { _isFakeDel: { $ne: true } }
        )

        const roleScope = this.buildRoleScopeCondition(userRole, salespersonId, options)
        if (roleScope == null) return this.getEmptyMatch()
        if (Object.keys(roleScope).length > 0) {
            conditions.push(roleScope)
        }

        const categoryMatch = this.buildCategoryMatch(options.category)
        if (Object.keys(categoryMatch).length > 0) {
            conditions.push(categoryMatch)
        }

        if (options.customerLevel) {
            conditions.push({ customerLevel: options.customerLevel })
        }

        if (options.keyword) {
            const keywordCondition = await this.buildKeywordCondition(options.keyword, {
                role: userRole,
                salespersonId,
                assignedTo: options.assignedTo || null
            })
            if (keywordCondition) {
                conditions.push(keywordCondition)
            }
        }

        if (conditions.length === 1) return conditions[0]
        return { $and: conditions }
    }

    async retrieveCompanyGroups(
        salespersonId: string | null,
        userRole: number,
        page: number = 1,
        limit: number = 20,
        options: {
            keyword?: string
            onlyUnassigned?: boolean
            onlyAssigned?: boolean
            onlyDeleted?: boolean
            category?: string
            assignedTo?: string
            customerLevel?: string
        } = {}
    ) {
        const skip = (page - 1) * limit
        const match = await this.buildCompanyQueryMatch(salespersonId, userRole, options)
        const normalizedCompany = this.getNormalizedCompanyExpression()
        const basePipeline: Record<string, any>[] = [
            { $match: match },
            {
                $addFields: {
                    __companyName: normalizedCompany
                }
            },
            {
                $group: {
                    _id: '$__companyName',
                    customerCount: { $sum: 1 },
                    latestAddTime: { $max: '$_addTime' }
                }
            }
        ]

        // 当前页的公司列表，公司数量，总客户数量
        const [groups, groupCountResult, totalCustomers] = await Promise.all([
            this.customer.aggregate([
                ...basePipeline,
                { $sort: { latestAddTime: -1, _id: 1 } },
                { $skip: skip },
                { $limit: limit },
                {
                    $project: {
                        _id: 0,
                        companyKey: '$_id',
                        companyName: '$_id',
                        customerCount: 1,
                        latestAddTime: 1
                    }
                }
            ]),
            this.customer.aggregate([
                ...basePipeline,
                { $count: 'totalGroups' }
            ]),
            this.customer.countDocuments(match)
        ])

        const totalGroups = Number(groupCountResult?.[0]?.totalGroups || 0)

        return {
            groups,
            totalGroups,
            totalCustomers,
            hasMore: skip + groups.length < totalGroups
        }
    }

    async retrieveCustomersByCompany(
        salespersonId: string | null,
        userRole: number,
        companyKey: string,
        options: {
            keyword?: string
            onlyUnassigned?: boolean
            onlyAssigned?: boolean
            onlyDeleted?: boolean
            category?: string
            assignedTo?: string
            customerLevel?: string
        } = {}
    ) {
        const targetCompany = (companyKey || '').trim()
        if (!targetCompany) return []

        const match = await this.buildCompanyQueryMatch(salespersonId, userRole, options)
        const customers = await this.customer.aggregate([
            { $match: match },
            {
                $addFields: {
                    __companyName: this.getNormalizedCompanyExpression()
                }
            },
            {
                $match: {
                    __companyName: targetCompany
                }
            },
            {
                $lookup: {
                    from: 'salespeople',
                    localField: '_assignSalespersonId',
                    foreignField: '_id',
                    as: 'salespersonInfo'
                }
            },
            {
                $addFields: {
                    assignSalespersonName: {
                        $cond: {
                            if: {
                                $and: [
                                    { $eq: ['$_isAssigned', true] },
                                    { $gt: [{ $size: '$salespersonInfo' }, 0] }
                                ]
                            },
                            then: { $arrayElemAt: ['$salespersonInfo.name', 0] },
                            else: null
                        }
                    },
                    _assignSalespersonId: {
                        $cond: {
                            if: { $ifNull: ['$_assignSalespersonId', false] },
                            then: { $toString: '$_assignSalespersonId' },
                            else: null
                        }
                    }
                }
            },
            {
                $project: {
                    salespersonInfo: 0,
                    __companyName: 0
                }
            },
            {
                $sort: { _addTime: -1 }
            }
        ])

        const customersWithStats = await this.attachDealStats(customers)
        return this.applySalespersonMask(customersWithStats, userRole)
    }

    async retrieveCustomerList(
        _id: string | null,
        _userRole: number,
        page: number = 1,
        limit: number = 10,
        options: {
            onlyUnassigned?: boolean
            onlyAssigned?: boolean
            onlyDeleted?: boolean
            category?: string
            assignedTo?: string
            customerLevel?: string
        } = {}
    ) {
        const skip = (page - 1) * limit
        const onlyUnassigned = Boolean(options.onlyUnassigned)
        const onlyAssigned = Boolean(options.onlyAssigned)
        const onlyDeleted = Boolean(options.onlyDeleted)
        const categoryMatch = this.buildCategoryMatch(options.category)
        const levelMatch = options.customerLevel ? { customerLevel: options.customerLevel } : {}
        const assignedTo = options.assignedTo ? new mongoose.Types.ObjectId(options.assignedTo) : null

        // 当前为管理员
        if (_userRole <= 2) {
            // 先获取总数
            const match: Record<string, any> = {}
            if (onlyDeleted) {
                match._isFakeDel = true
            } else {
                match._isFakeDel = { $ne: true }
                if (onlyUnassigned) {
                    match._isAssigned = { $ne: true }
                }
            }
            if (onlyAssigned) {
                match._isAssigned = true
            }
            if (assignedTo) {
                match._isAssigned = true
                match._assignSalespersonId = assignedTo
            }
            Object.assign(match, categoryMatch, levelMatch)
            const total = await this.customer.countDocuments(match)

            const customers = await this.customer.aggregate([
                { $match: match },
                // 关联销售人员信息
                {
                    $lookup: {
                        from: 'salespeople',
                        localField: '_assignSalespersonId',
                        foreignField: '_id',
                        as: 'salespersonInfo'
                    }
                },
                // 添加销售人员名称字段，保留原始 _assignSalespersonId
                {
                    $addFields: {
                        assignSalespersonName: {
                            $cond: {
                                if: {
                                    $and: [
                                        { $eq: ['$_isAssigned', true] },
                                        { $gt: [{ $size: '$salespersonInfo' }, 0] }
                                    ]
                                },
                                then: { $arrayElemAt: ['$salespersonInfo.name', 0] },
                                else: null
                            }
                        },
                        // 将 _assignSalespersonId 转为字符串便于前端比较
                        _assignSalespersonId: {
                            $cond: {
                                if: { $ifNull: ['$_assignSalespersonId', false] },
                                then: { $toString: '$_assignSalespersonId' },
                                else: null
                            }
                        }
                    }
                },
                // 移除临时字段
                {
                    $project: {
                        salespersonInfo: 0
                    }
                },
                // 按添加时间倒序排列
                {
                    $sort: { _addTime: -1 }
                },
                // 分页
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            ]);

            const customersWithStats = await this.attachDealStats(customers)
            return {
                customers: customersWithStats,
                total,
                hasMore: skip + customers.length < total
            };
        }
        else {
            // 销售人员：获取分配给自己的客户 + 公共池客户
            if (onlyDeleted) {
                const total = await this.customer.countDocuments({
                    _isFakeDel: true,
                    ...(_id ? { _assignSalespersonId: new mongoose.Types.ObjectId(_id) } : {}),
                    ...categoryMatch,
                    ...levelMatch
                })
                const customers = await this.customer
                    .find({
                        _isFakeDel: true,
                        ...(_id ? { _assignSalespersonId: new mongoose.Types.ObjectId(_id) } : {}),
                        ...categoryMatch,
                        ...levelMatch
                    })
                    .sort({ _addTime: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean()
                const customersWithStats = await this.attachDealStats(customers)
                return {
                    customers: customersWithStats,
                    total,
                    hasMore: skip + customers.length < total
                }
            }
            if (onlyUnassigned) {
                const { customers, total, hasMore } = await this.getUnassignedCustomers(
                    page,
                    limit,
                    { ...categoryMatch, ...levelMatch }
                )
                return { customers, total, hasMore }
            }
            if (!_id) {
                // 如果没有销售ID，只返回公共池客户
                const { customers, total, hasMore } = await this.getUnassignedCustomers(
                    page,
                    limit,
                    { ...categoryMatch, ...levelMatch }
                );
                return { customers, total, hasMore };
            }
            if (onlyAssigned) {
                const [total, customers] = await Promise.all([
                    this.getAssignedCustomersCount(_id, { ...categoryMatch, ...levelMatch }),
                    this.getAssignedCustomers(_id, skip, limit, { ...categoryMatch, ...levelMatch }),
                ])
                return {
                    customers,
                    total,
                    hasMore: skip + customers.length < total
                }
            }

            // 获取已分配和未分配客户的总数
            const [assignedTotal, unassignedTotal] = await Promise.all([
                this.getAssignedCustomersCount(_id, { ...categoryMatch, ...levelMatch }),
                this.getUnassignedCustomersCount({ ...categoryMatch, ...levelMatch })
            ]);

            const total = assignedTotal + unassignedTotal;

            // 分页逻辑：先显示已分配客户，再显示未分配客户
            let customers: any[] = [];

            if (skip < assignedTotal) {
                // 还在已分配客户范围内
                const assignedLimit = Math.min(limit, assignedTotal - skip);
                const assignedCustomers = await this.getAssignedCustomers(
                    _id,
                    skip,
                    assignedLimit,
                    { ...categoryMatch, ...levelMatch }
                );
                customers = [...assignedCustomers];

                // 如果已分配客户不够，补充未分配客户
                if (customers.length < limit) {
                    const unassignedLimit = limit - customers.length;
                    const { customers: unassignedCustomers } = await this.getUnassignedCustomers(
                        1,
                        unassignedLimit,
                        { ...categoryMatch, ...levelMatch }
                    );
                    customers = [...customers, ...unassignedCustomers];
                }
            } else {
                // 已经超过已分配客户范围，只获取未分配客户
                const unassignedSkip = skip - assignedTotal;
                const unassignedPage = Math.floor(unassignedSkip / limit) + 1;
                const { customers: unassignedCustomers } = await this.getUnassignedCustomers(
                    unassignedPage,
                    limit,
                    { ...categoryMatch, ...levelMatch }
                );
                customers = unassignedCustomers;
            }

            const customersWithStats = await this.attachDealStats(customers)
            return {
                customers: this.applySalespersonMask(customersWithStats, _userRole),
                total,
                hasMore: skip + customers.length < total
            };
        }
    }

    private buildCategoryMatch(category?: string) {
        if (!category) return {}
        const CN_COUNTRIES = ['中国', 'China', '中国大陆', '香港', '澳门', '台湾', '中国香港', '中国澳门']
        switch (category) {
            case 'domestic':
                return { country: { $in: CN_COUNTRIES } }
            case 'foreign':
                return { country: { $nin: CN_COUNTRIES } }
            case 'bType':
                return { customerType: { $in: ['B端客户', 'B端客户-院校'] } }
            case 'gType':
                return { customerType: { $in: ['G端客户'] } }
            case 'general':
                return { customerLevel: '一般客户' }
            case 'quality':
                return { customerLevel: '优质客户' }
            case 'potential':
                return { customerLevel: '潜在客户' }
            case 'strategic':
                return { customerType: '战略合作' }
            default:
                return {}
        }
    }

    async fakeDel(_ids: string[]) {
        await this.customer.updateMany(
            {
                _id: { $in: _ids },
                _isAssigned: false, // 只有没有对接时才能移到回收站
                _isApplying: false
            },
            { _isFakeDel: true }
        )
    }

    async recover(_ids: string[]) {
        await this.customer.updateMany(
            {
                _id: { $in: _ids },
                _isFakeDel: true
            },
            { _isFakeDel: false }
        )
    }

    async delete(_ids: string[]) {
        await this.customer.deleteMany({ _id: { $in: _ids }, _isFakeDel: true }) // 只有回收站里的才能删除
    }

    async getAssignedCustomersCount(salespersonId: string, extraMatch: Record<string, any> = {}): Promise<number> {
        const salespersonObjectId = new mongoose.Types.ObjectId(salespersonId);
        return await this.customer.countDocuments({
            _isFakeDel: { $ne: true },
            _isAssigned: true,
            _assignSalespersonId: salespersonObjectId,
            ...extraMatch
        });
    }

    async getUnassignedCustomersCount(extraMatch: Record<string, any> = {}): Promise<number> {
        return await this.customer.countDocuments({
            _isFakeDel: { $ne: true },
            _isAssigned: { $ne: true },
            ...extraMatch
        });
    }

    async getAssignedCustomers(
        salespersonId: string,
        skip: number = 0,
        limit: number = 10,
        extraMatch: Record<string, any> = {}
    ) {
        try {
            const salespersonObjectId = new mongoose.Types.ObjectId(salespersonId);

            console.log('Querying assigned customers for salesperson:', salespersonId);

            const customers = await this.customer.aggregate([
                {
                    $match: {
                        _isFakeDel: { $ne: true },
                        _isAssigned: true,
                        _assignSalespersonId: salespersonObjectId,
                        ...extraMatch
                    }
                },
                // 关联销售人员信息
                {
                    $lookup: {
                        from: 'salespeople',
                        localField: '_assignSalespersonId',
                        foreignField: '_id',
                        as: 'salespersonInfo'
                    }
                },
                // 添加销售人员名称字段
                {
                    $addFields: {
                        assignSalespersonName: {
                            $cond: {
                                if: { $gt: [{ $size: '$salespersonInfo' }, 0] },
                                then: { $arrayElemAt: ['$salespersonInfo.name', 0] },
                                else: null
                            }
                        },
                        // 将 _assignSalespersonId 转为字符串
                        _assignSalespersonId: {
                            $toString: '$_assignSalespersonId'
                        }
                    }
                },
                // 移除临时字段
                {
                    $project: {
                        salespersonInfo: 0
                    }
                },
                // 按添加时间倒序排列
                {
                    $sort: { _addTime: -1 }
                },
                // 分页
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            ]);

            console.log('Found assigned customers:', customers.length);
            return await this.attachDealStats(customers);
        } catch (error) {
            console.error('查询已分配客户失败:', error);
            throw error;
        }
    }

    async getUnassignedCustomers(page: number = 1, limit: number = 10, extraMatch: Record<string, any> = {}) {
        try {
            const skip = (page - 1) * limit;

            const total = await this.customer.countDocuments({
                _isFakeDel: { $ne: true },
                _isAssigned: { $ne: true },
                ...extraMatch
            });

            const customers = await this.customer.find({
                _isFakeDel: { $ne: true },
                _isAssigned: { $ne: true },
                ...extraMatch
            })
                // 未对接客户不返回联系方式等信息
                .select('_id name avatar country city company companyDetail companyWebsite customerType customerLevel source sourceDetail customTags _isAssigned _isApplying _addTime')
                .sort({ _addTime: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            const mappedCustomers = customers.map(customer => ({
                _id: customer._id,
                name: customer.name,
                avatar: customer.avatar,
                country: customer.country,
                city: customer.city,
                company: customer.company,
                companyDetail: customer.companyDetail,
                companyWebsite: customer.companyWebsite,
                customerType: customer.customerType,
                customerLevel: customer.customerLevel,
                source: customer.source,
                sourceDetail: customer.sourceDetail,
                customTags: customer.customTags,
                _isAssigned: customer._isAssigned || false,
                _isApplying: customer._isApplying || false,
                _addTime: customer._addTime,
                _assignSalespersonId: null,
                assignSalespersonName: null
            }));

            return {
                customers: mappedCustomers,
                total,
                hasMore: skip + mappedCustomers.length < total
            };
        } catch (error) {
            console.error('查询未分配客户失败:', error);
            throw error;
        }
    }

    async addContact(_id: string, salespersonId: string) {
        try {
            const result = await this.customer.findByIdAndUpdate(
                _id,
                {
                    _assignSalespersonId: salespersonId,
                    _isAssigned: true,
                    _isApplying: false
                },
                { new: true, runValidators: true }
            )

            if (!result) {
                throw new Error(`客户 ${_id} 不存在`)
            }

            return result
        } catch (err: any) {
            throw err
        }
    }

    async removeContact(_id: string) {
        try {
            const result = await this.customer.findByIdAndUpdate(
                _id,
                {
                    _assignSalespersonId: null,
                    _isAssigned: false
                },
                { new: true, runValidators: true }
            )

            if (!result) {
                throw new Error(`客户 ${_id} 不存在`)
            }

            return result
        } catch (err: any) {
            throw err
        }
    }

    async search(
        keyword: string,
        page: number = 1,
        limit: number = 20,
        options: {
            role?: number
            salespersonId?: string | null
            assignedTo?: string | null
            customerLevel?: string | null
        } = {}
    ) {
        const skip = (page - 1) * limit
        const regex = new RegExp(keyword, 'i') // 不区分大小写的模糊匹配
        const role = typeof options.role === 'number' ? options.role : undefined
        const salespersonId = options.salespersonId || null
        const salespersonObjectId =
            salespersonId && mongoose.Types.ObjectId.isValid(salespersonId)
                ? new mongoose.Types.ObjectId(salespersonId)
                : null
        const assignedTo = options.assignedTo || null
        const customerLevel = options.customerLevel || null
        const assignedObjectId =
            assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)
                ? new mongoose.Types.ObjectId(assignedTo)
                : null

        let assignedFilterId: mongoose.Types.ObjectId | null = null

        if (role === 3 && !salespersonObjectId) {
            return { customers: [], total: 0, hasMore: false }
        }
        if (role === 3) {
            if (assignedObjectId && !assignedObjectId.equals(salespersonObjectId)) {
                return { customers: [], total: 0, hasMore: false }
            }
            assignedFilterId = salespersonObjectId
        } else if (assignedObjectId) {
            assignedFilterId = assignedObjectId
        }

        // 构建搜索条件
        const searchConditions: Record<string, any> = {
            _isFakeDel: { $ne: true },
            $or: [
                { name: regex },
                { country: regex },
                { city: regex },
                { phone: regex },
                { whatsapp: regex },
                { wechat: regex },
                { email: regex },
                { company: regex },
                { customerType: regex },
                { customTags: { $elemMatch: { $regex: regex } } }
            ]
        }
        if (assignedFilterId) {
            searchConditions._isAssigned = true
            searchConditions._assignSalespersonId = assignedFilterId
        }
        if (customerLevel) {
            searchConditions.customerLevel = customerLevel
        }

        // 获取总数
        const total = await this.customer.countDocuments(searchConditions)

        // 搜索客户
        const customers = await this.customer.aggregate([
            { $match: searchConditions },
            // 关联销售人员信息
            {
                $lookup: {
                    from: 'salespeople',
                    localField: '_assignSalespersonId',
                    foreignField: '_id',
                    as: 'salespersonInfo'
                }
            },
            // 添加销售人员名称字段和匹配字段标记
            {
                $addFields: {
                    assignSalespersonName: {
                        $cond: {
                            if: {
                                $and: [
                                    { $eq: ['$_isAssigned', true] },
                                    { $gt: [{ $size: '$salespersonInfo' }, 0] }
                                ]
                            },
                            then: { $arrayElemAt: ['$salespersonInfo.name', 0] },
                            else: null
                        }
                    },
                    _assignSalespersonId: {
                        $cond: {
                            if: { $ifNull: ['$_assignSalespersonId', false] },
                            then: { $toString: '$_assignSalespersonId' },
                            else: null
                        }
                    },
                    // 标记匹配的字段
                    _matchedFields: {
                        $filter: {
                            input: [
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$name', ''] }, regex: keyword, options: 'i' } }, 'name', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$country', ''] }, regex: keyword, options: 'i' } }, 'country', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$city', ''] }, regex: keyword, options: 'i' } }, 'city', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$phone', ''] }, regex: keyword, options: 'i' } }, 'phone', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$whatsapp', ''] }, regex: keyword, options: 'i' } }, 'whatsapp', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$wechat', ''] }, regex: keyword, options: 'i' } }, 'wechat', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$email', ''] }, regex: keyword, options: 'i' } }, 'email', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$company', ''] }, regex: keyword, options: 'i' } }, 'company', null] },
                                { $cond: [{ $regexMatch: { input: { $ifNull: ['$customerType', ''] }, regex: keyword, options: 'i' } }, 'customerType', null] },
                                {
                                    $cond: [
                                        {
                                            $gt: [
                                                {
                                                    $size: {
                                                        $filter: {
                                                            input: { $ifNull: ['$customTags', []] },
                                                            as: 'tag',
                                                            cond: {
                                                                $regexMatch: {
                                                                    input: '$$tag',
                                                                    regex: keyword,
                                                                    options: 'i'
                                                                }
                                                            }
                                                        }
                                                    }
                                                },
                                                0
                                            ]
                                        },
                                        'customTags',
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
            // 移除临时字段
            {
                $project: {
                    salespersonInfo: 0
                }
            },
            // 按添加时间倒序排列
            {
                $sort: { _addTime: -1 }
            },
            // 分页
            {
                $skip: skip
            },
            {
                $limit: limit
            }
        ])

        // 如果需要按销售人员名称搜索，需要额外处理
        const salespersonMatches = await this.searchBySalesperson(keyword, skip, limit, {
            role,
            salespersonId,
            assignedTo,
            customerLevel
        })
        if (salespersonMatches) {
            return salespersonMatches
        }

        return {
            customers: await this.attachDealStats(customers),
            total,
            hasMore: skip + customers.length < total
        }
    }

    private async searchBySalesperson(
        keyword: string,
        skip: number,
        limit: number,
        options: {
            role?: number
            salespersonId?: string | null
            assignedTo?: string | null
            customerLevel?: string | null
        } = {}
    ) {
        try {
            // 查找名称匹配的销售人员
            const salespersonModel = (await import('./salesperson.model')).useSalespersonModel()
            const matchedSalespeople = await salespersonModel.salesperson.find({
                $or: [
                    { name: new RegExp(keyword, 'i') },
                    { nameCn: new RegExp(keyword, 'i') },
                    { nameEn: new RegExp(keyword, 'i') }
                ]
            }).select('_id name').lean()

            if (matchedSalespeople.length === 0) {
                return null
            }

            const role = typeof options.role === 'number' ? options.role : undefined
            const allowedId = options.salespersonId || null
            const assignedTo = options.assignedTo || null
            const customerLevel = options.customerLevel || null
            const assignedFilterId =
                assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)
                    ? assignedTo
                    : null
            let filteredSalespeople = matchedSalespeople
            if (role === 3 && allowedId) {
                filteredSalespeople = filteredSalespeople.filter(
                    (s) => s?._id?.toString?.() === allowedId
                )
            }
            if (assignedFilterId) {
                filteredSalespeople = filteredSalespeople.filter(
                    (s) => s?._id?.toString?.() === assignedFilterId
                )
            }

            if (filteredSalespeople.length === 0) {
                return null
            }

            const salespersonIds = filteredSalespeople.map(s => s._id)
            const total = await this.customer.countDocuments({
                _isFakeDel: { $ne: true },
                _assignSalespersonId: { $in: salespersonIds },
                ...(customerLevel ? { customerLevel } : {})
            })

            // 查找这些销售人员负责的客户
            const customers = await this.customer.aggregate([
                {
                    $match: {
                        _isFakeDel: { $ne: true },
                        _assignSalespersonId: { $in: salespersonIds },
                        ...(customerLevel ? { customerLevel } : {})
                    }
                },
                {
                    $lookup: {
                        from: 'salespeople',
                        localField: '_assignSalespersonId',
                        foreignField: '_id',
                        as: 'salespersonInfo'
                    }
                },
                {
                    $addFields: {
                        assignSalespersonName: {
                            $cond: {
                                if: { $gt: [{ $size: '$salespersonInfo' }, 0] },
                                then: { $arrayElemAt: ['$salespersonInfo.name', 0] },
                                else: null
                            }
                        },
                        _assignSalespersonId: {
                            $cond: {
                                if: { $ifNull: ['$_assignSalespersonId', false] },
                                then: { $toString: '$_assignSalespersonId' },
                                else: null
                            }
                        },
                        _matchedFields: ['salesperson']
                    }
                },
                {
                    $project: {
                        salespersonInfo: 0
                    }
                },
                {
                    $sort: { _addTime: -1 }
                },
                {
                    $skip: skip
                },
                {
                    $limit: limit
                }
            ])

            return {
                customers: await this.attachDealStats(customers),
                total,
                hasMore: skip + customers.length < total
            }
        } catch (error) {
            console.error('按销售人员搜索失败:', error)
            return null
        }
    }

}

export const useCustomerModel = () => new CustomerModel(Customer)
export {
    CustomerReq
}
