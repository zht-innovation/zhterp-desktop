import mongoose from 'mongoose'
import { validate } from 'email-validator'

import { useCustomerModel } from '~~/server/models/customer.model'
import { useCustomerTermModel } from '~~/server/models/customerTerm.model'
import { useSalespersonModel } from '~~/server/models/salesperson.model'
import { useNewsModel } from '~~/server/models/news.model'
import { logger } from '~~/server/utils/logger'
import { ADMIN_ROLE } from "~~/shared/enums"

type ImportError = {
    row: number
    message: string
}

const headerMap: Record<string, string> = {
    // required
    '姓名': 'name',
    '客户姓名': 'name',
    'name': 'name',
    '国家': 'country',
    'country': 'country',
    '客户类型': 'customerType',
    'customertype': 'customerType',
    '客户等级': 'customerLevel',
    'customerlevel': 'customerLevel',

    // optional
    '城市': 'city',
    'city': 'city',
    '电话': 'phone',
    '手机': 'phone',
    'phone': 'phone',
    'whatsapp': 'whatsapp',
    '微信': 'wechat',
    'wechat': 'wechat',
    '邮箱': 'email',
    'email': 'email',
    '公司': 'company',
    '公司名称': 'company',
    'company': 'company',
    '公司详情': 'companyDetail',
    '主营': 'companyDetail',
    'companydetail': 'companyDetail',
    '公司网站': 'companyWebsite',
    '网址': 'companyWebsite',
    'companywebsite': 'companyWebsite',
    '获客渠道': 'source',
    '渠道': 'source',
    'source': 'source',
    '获客渠道明细': 'sourceDetail',
    '渠道明细': 'sourceDetail',
    'sourcedetail': 'sourceDetail',
    '自定义标签': 'customTags',
    '标签': 'customTags',
    'customtags': 'customTags',
    '维护销售id': '_assignSalespersonId',
    '销售id': '_assignSalespersonId',
    'assignsalespersonid': '_assignSalespersonId',
}

// CSV/Excel may include UTF-8 BOM (\uFEFF) in the first header cell.
const normalizeHeader = (key: string) => key.replace(/^\uFEFF/, '').replace(/\s+/g, '').trim().toLowerCase()

const toText = (val: unknown) => {
    if (val === null || val === undefined) return ''
    return String(val).trim()
}

const normalizePhone = (val: unknown) => {
    const text = toText(val)
    return text === '无' ? '' : text
}

const parseTags = (val: unknown) => {
    if (Array.isArray(val)) {
        return val.map(item => toText(item)).filter(Boolean)
    }
    const text = toText(val)
    if (!text) return []
    return text
        .split(/[,，;；|\/]+/)
        .map(item => item.trim())
        .filter(Boolean)
}

const normalizeSource = (source: string, sourceDetail?: string) => {
    const main = toText(source)
    const detail = toText(sourceDetail)
    if (!main) return { source: '', sourceDetail: detail }
    if (detail) return { source: main, sourceDetail: detail }

    const parts = main
        .split(/[>\/\\|、,，]+/)
        .map(item => item.trim())
        .filter(Boolean)

    if (parts.length >= 2) {
        return { source: parts[0], sourceDetail: parts[parts.length - 1] }
    }

    return { source: main, sourceDetail: '' }
}

export default defineEventHandler(async (event) => {
    try {
        const formData = await readMultipartFormData(event)

        if (!formData) {
            setResponseStatus(event, 400)
            return {
                code: CODE.INVALID_PARAMS,
                msg: codeToMsg[CODE.INVALID_PARAMS],
            }
        }

        let filePart: any = null
        let assignSalespersonId: string | null = null

        for (const part of formData) {
            if (part.filename && (part.name === 'file' || part.name === 'excel')) {
                filePart = part
            }
            if (!part.filename && part.name === '_assignSalespersonId') {
                assignSalespersonId = toText(part.data)
            }
        }

        if (!filePart?.data) {
            setResponseStatus(event, 400)
            return {
                code: CODE.INVALID_PARAMS,
                msg: '缺少上传文件',
            }
        }

        const XLSX = await import('xlsx')
        // Ensure UTF-8 CSV headers/content are decoded correctly (otherwise Chinese headers become mojibake).
        const workbook = XLSX.read(filePart.data, { type: 'buffer', codepage: 65001 })
        const sheetName = workbook.SheetNames?.[0]
        if (!sheetName) {
            setResponseStatus(event, 400)
            return {
                code: CODE.INVALID_PARAMS,
                msg: '未找到可用的工作表',
            }
        }

        const sheet = workbook.Sheets[sheetName]
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
            defval: '',
            raw: false,
        })

        if (!rawRows.length) {
            setResponseStatus(event, 400)
            return {
                code: CODE.INVALID_PARAMS,
                msg: 'Excel 中没有可导入的数据',
            }
        }

        const auth = event.context.auth
        const customerModel = useCustomerModel()
        const salespersonModel = useSalespersonModel()
        const newsModel = useNewsModel()
        const termModel = useCustomerTermModel()
        const salespersonCache = new Map<string, boolean>()
        const phoneCache = new Map<string, boolean>()
        const seenPhones = new Set<string>()

        const errors: ImportError[] = []
        let successCount = 0
        let totalCount = 0

        const ensureSalespersonExists = async (id: string) => {
            if (salespersonCache.has(id)) return salespersonCache.get(id) as boolean
            const exists = await salespersonModel.salesperson.findById(id).select('_id').lean()
            const ok = Boolean(exists)
            salespersonCache.set(id, ok)
            return ok
        }

        const ensurePhoneUnique = async (phone: string) => {
            if (phoneCache.has(phone)) return phoneCache.get(phone) as boolean
            const exists = await customerModel.customer
                .findOne({ phone })
                .select('_id')
                .lean()
            const ok = !exists
            phoneCache.set(phone, ok)
            return ok
        }

        for (let index = 0; index < rawRows.length; index += 1) {
            const row = rawRows[index]
            const rowNumber = index + 2 // header is row 1

            const hasValue = Object.values(row).some(value => toText(value))
            if (!hasValue) {
                continue
            }

            totalCount += 1

            const mapped: Record<string, any> = {}
            for (const [key, value] of Object.entries(row)) {
                const field = headerMap[normalizeHeader(key)]
                if (!field) continue
                if (field === 'customTags') {
                    mapped.customTags = parseTags(value)
                } else {
                    mapped[field] = toText(value)
                }
            }

            if (mapped.source) {
                const { source, sourceDetail } = normalizeSource(mapped.source, mapped.sourceDetail)
                mapped.source = source
                mapped.sourceDetail = sourceDetail
            }

            if (assignSalespersonId && !mapped._assignSalespersonId) {
                mapped._assignSalespersonId = assignSalespersonId
            }

            const requiredFields = ['name']
            const missing = requiredFields.filter((field) => !toText(mapped[field]))
            if (missing.length > 0) {
                errors.push({ row: rowNumber, message: `缺少必填字段: ${missing.join(', ')}` })
                continue
            }

            let emailText = typeof mapped.email === 'string' ? mapped.email.trim() : ''
            if (emailText === '无') {
                emailText = '----------------------'
            }

            if (emailText && emailText !== '----------------------' && !validate(emailText)) {
                errors.push({ row: rowNumber, message: '邮箱格式不正确' })
                continue
            }
            mapped.email = emailText

            const phone = normalizePhone(mapped.phone)
            if (phone) {
                if (seenPhones.has(phone)) {
                    errors.push({ row: rowNumber, message: '手机号在导入文件中重复' })
                    continue
                }
                const unique = await ensurePhoneUnique(phone)
                if (!unique) {
                    errors.push({ row: rowNumber, message: '该手机号的客户已存在' })
                    continue
                }
                seenPhones.add(phone)
                mapped.phone = phone
            }

            const isSalesperson = Number(auth?.role) === ADMIN_ROLE.SELLER
            const rowAssignId = toText(mapped._assignSalespersonId)

            if (isSalesperson) {
                const assignedId = toText(assignSalespersonId) || rowAssignId
                if (!assignedId) {
                    errors.push({ row: rowNumber, message: '缺少维护销售ID' })
                    continue
                }
                mapped._isAssigned = true
                mapped._assignSalespersonId = assignedId

                if (!mongoose.Types.ObjectId.isValid(assignedId)) {
                    errors.push({ row: rowNumber, message: '维护销售ID格式不正确' })
                    continue
                }
                const exists = await ensureSalespersonExists(assignedId)
                if (!exists) {
                    errors.push({ row: rowNumber, message: '维护销售不存在' })
                    continue
                }
            } else {
                // 管理员批量导入：统一进入公共客户池
                mapped._isAssigned = false
                delete mapped._assignSalespersonId
            }

            try {
                // 默认维护期：3个月
                let expireDate: Date | null = null
                if (mapped._isAssigned === true && mapped._assignSalespersonId) {
                    expireDate = new Date()
                    expireDate.setDate(expireDate.getDate() + 90)
                }

                const customerPayload = {
                    name: mapped.name,
                    country: mapped.country,
                    city: mapped.city || '',
                    phone: mapped.phone || '',
                    whatsapp: mapped.whatsapp || '',
                    wechat: mapped.wechat || '',
                    email: mapped.email || '',
                    company: mapped.company || '',
                    companyDetail: mapped.companyDetail || '',
                    companyWebsite: mapped.companyWebsite || '',
                    customerType: mapped.customerType,
                    customerLevel: mapped.customerLevel,
                    source: mapped.source || '',
                    sourceDetail: mapped.sourceDetail || '',
                    customTags: Array.isArray(mapped.customTags) ? mapped.customTags : [],
                    _isAssigned: mapped._isAssigned,
                    _assignSalespersonId: mapped._assignSalespersonId,
                    expireDate,
                }

                let createdCustomer: any = null
                if (customerPayload._isAssigned && customerPayload._assignSalespersonId) {
                    createdCustomer = await customerModel.add(customerPayload)
                    const salesperson = await salespersonModel.salesperson
                        .findById(customerPayload._assignSalespersonId)
                        .select('name nameCn')

                    await salespersonModel.salesperson.findByIdAndUpdate(
                        customerPayload._assignSalespersonId,
                        { $inc: { _customerNum: 1 } }
                    )
                    await termModel.addManual({
                        customerId: createdCustomer._id,
                        days: 90,
                        oldExpire: null,
                        newExpire: expireDate,
                        oldSalesId: null,
                        oldSalesName: '',
                        newSalesId: customerPayload._assignSalespersonId,
                        newSalesName: salesperson?.nameCn || salesperson?.name || '',
                        createdBy: {
                            name: auth?.nickname || auth?.username || '销售',
                            role: Number(auth?.role ?? 3),
                            salesId: customerPayload._assignSalespersonId,
                        },
                    })
                } else {
                    createdCustomer = await customerModel.add(customerPayload)
                }

                try {
                    if (
                        Number(auth?.role) === ADMIN_ROLE.SUPER &&
                        createdCustomer?._id &&
                        !customerPayload._isAssigned
                    ) {
                        const actorName = auth?.nickname || auth?.username || '管理员'
                        await newsModel.add({
                            scope: 'public',
                            type: 'public_customer_added',
                            actorName,
                            customerId: createdCustomer._id,
                            customerName: createdCustomer.name || customerPayload.name || '',
                            eventKey: `public_customer_added:${createdCustomer._id}`,
                        })
                    }
                } catch (newsErr) {
                    logger.error('Add public customer news failed', newsErr as Error)
                }

                successCount += 1
            } catch (err: any) {
                logger.error('Import customer failed', err as Error)
                errors.push({ row: rowNumber, message: err?.message || '导入失败' })
            }
        }

        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                total: totalCount,
                success: successCount,
                failed: errors.length,
                errors,
            },
        }
    } catch (err: any) {
        logger.error('Import customers error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
        }
    }
})
