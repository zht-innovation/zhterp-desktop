import { getErpAttachmentRoot } from "~~/server/utils/erpAttachmentRoot";
// 添加客户，为支持文件上传改为form-data形式
import { CustomerReq, useCustomerModel } from "~~/server/models/customer.model"
import { useCustomerTermModel } from "~~/server/models/customerTerm.model"
import { useNewsModel } from "~~/server/models/news.model"
import { useSalespersonModel } from "~~/server/models/salesperson.model"
import { logger } from "~~/server/utils/logger"
import { ADMIN_ROLE } from "~~/shared/enums"
import { MX_WHITELIST_DOMAINS } from "~~/server/utils/emailValidate"

import fs from "fs"
import dns from "dns"
import { validate } from "email-validator"
import { createWriteStream } from 'fs'
import path from 'path'

export default defineEventHandler(async (event) => {
    try {
        // 解析 multipart/form-data 数据
        const formData = await readMultipartFormData(event)

        if (!formData) {
            setResponseStatus(event, 400)
            return {
                code: CODE.INVALID_PARAMS,
                msg: codeToMsg[CODE.INVALID_PARAMS],
            }
        }

        // 初始化客户数据
        const customer_info: any = {}
        const attachments: Array<{ path: string; originalName?: string }> = []

        // 处理表单字段和文件
        for (const part of formData) {
            if (part.name === 'attachments' && part.filename) {
                // 处理文件上传
                try {
                    const uploadDir = path.join(getErpAttachmentRoot(), "main", "attachments")

                    // 生成唯一文件名
                    const timestamp = Date.now()
                    const randomStr = Math.random().toString(36).substring(2, 8)
                    const safeOriginalName = path.basename(part.filename)
                    const fileExtension = path.extname(safeOriginalName)
                    const filename = `${timestamp}-${randomStr}${fileExtension}`
                    const filepath = path.join(uploadDir, filename)

                    // 保存文件
                    const writeStream = createWriteStream(filepath)
                    writeStream.write(part.data)
                    writeStream.end()

                    // 等待文件写入完成
                    await new Promise((resolve, reject) => {
                        writeStream.on('finish', resolve)
                        writeStream.on('error', reject)
                    })

                    attachments.push({
                        path: `/main/attachments/${filename}`,
                        originalName: safeOriginalName
                    })
                } catch (fileError) {
                    logger.error(`文件上传失败: ${part.filename}`, fileError as Error)
                    // 继续处理其他字段，不中断整个请求
                }
            }
            else if (part.name && !part.filename) {
                // 处理普通字段
                const value = part.data.toString('utf-8')

                // 处理数组字段（customTags）
                if (part.name === 'customTags') {
                    if (!customer_info[part.name]) {
                        customer_info[part.name] = []
                    }
                    customer_info[part.name].push(value)
                }
                // 处理布尔字段
                else if (part.name === '_isAssigned') {
                    customer_info[part.name] = value === 'true'
                }
                // 其他字段
                else {
                    customer_info[part.name] = value
                }
            }
        }

        // 添加附件路径到客户信息
        customer_info.attachments = attachments
        const skipPhoneCheck =
            customer_info.skipPhoneCheck === 'true' || customer_info.skipPhoneCheck === true
        if (customer_info.skipPhoneCheck !== undefined) {
            delete customer_info.skipPhoneCheck
        }
        const allowEmptyLevelType =
            customer_info.allowEmptyLevelType === 'true' || customer_info.allowEmptyLevelType === true
        if (customer_info.allowEmptyLevelType !== undefined) {
            delete customer_info.allowEmptyLevelType
        }

        // 验证必填字段
        const requiredFields = ['name', 'country']
        if (!allowEmptyLevelType) {
            requiredFields.push('customerType', 'customerLevel')
        }
        const missingFields = requiredFields.filter(field => !customer_info[field])

        if (missingFields.length > 0) {
            setResponseStatus(event, 400)
            return {
                code: CODE.INVALID_PARAMS,
                msg: `缺少必填字段: ${missingFields.join(', ')}`,
            }
        }

        const customer = useCustomerModel()
        const salespersonModel = useSalespersonModel()
        const termModel = useCustomerTermModel()

        let createdCustomer: any = null
        try {
            const ip = getRequestIP(event, { xForwardedFor: true })

            // 邮箱验证逻辑
            const { email } = customer_info
            const emailText = typeof email === 'string' ? email.trim() : ''
            if (emailText && emailText !== '----------------------') {
                if (!validate(emailText)) {
                    logger.warn(`Invalid email format: ${email} from IP: ${ip}`)
                    setResponseStatus(event, 606)
                    return {
                        code: CODE.WRONG_EMAIL_FORMAT,
                        msg: codeToMsg[CODE.WRONG_EMAIL_FORMAT],
                    }
                }

                const domain = emailText.split('@')[1]
                try {
                    // 检查是否在白名单中
                    if (MX_WHITELIST_DOMAINS.includes(domain)) {
                        logger.info(`Domain ${domain} is in whitelist, skip MX validation.`);
                    } else {
                        const mxRecords = await dns.promises.resolveMx(domain);
                        if (mxRecords.length === 0) {
                            logger.warn(`Invalid email domain: ${domain} from IP: ${ip}`);
                            setResponseStatus(event, 607);
                            return {
                                code: CODE.WRONG_EMAIL_DOMAIN,
                                msg: codeToMsg[CODE.WRONG_EMAIL_DOMAIN],
                            };
                        }
                    }

                } catch (err) {
                    if (!MX_WHITELIST_DOMAINS.includes(domain)) {
                        logger.error(`DNS resolution failed for domain: ${domain}`, err as Error);
                        setResponseStatus(event, 607);
                        return {
                            code: CODE.WRONG_EMAIL_DOMAIN,
                            msg: codeToMsg[CODE.WRONG_EMAIL_DOMAIN],
                        };
                    } else {
                        logger.info(`DNS error for whitelisted domain ${domain}, skipped:`, err as Error);
                    }
                }
            }

            // 手机号重复校验
            const phone = typeof customer_info.phone === 'string' ? customer_info.phone.trim() : ''
            const normalizedPhone = phone === '无' ? '' : phone
            if (phone === '无') {
                customer_info.phone = ''
            }
            if (normalizedPhone && !skipPhoneCheck) {
                const existing = await customer.customer
                    .findOne({ phone: normalizedPhone })
                    .select('_id')
                    .lean()
                if (existing) {
                    setResponseStatus(event, 400)
                    return {
                        code: CODE.INVALID_PARAMS,
                        msg: '该手机号的客户已存在',
                    }
                }
            }

            // 权限和分配逻辑
            const auth = event.context.auth
            if (Number(auth.role) === 3) {
                customer_info._isAssigned = true
                customer_info._assignedByAdmin = false
            } else if (Number(auth.role) <= ADMIN_ROLE.OPERATOR && customer_info._assignSalespersonId) {
                customer_info._isAssigned = true
                customer_info._assignedByAdmin = true
            } else {
                customer_info._isAssigned = false
                customer_info._assignSalespersonId = undefined
                customer_info._assignedByAdmin = false
            }

            // 默认维护期：3个月
            if (customer_info._isAssigned === true && customer_info._assignSalespersonId) {
                if (customer_info.expireDate == null || customer_info.expireDate === '') {
                    const expireDate = new Date()
                    expireDate.setDate(expireDate.getDate() + 90)
                    customer_info.expireDate = expireDate
                }
            }

            if (customer_info._isAssigned && customer_info._assignSalespersonId) {
                createdCustomer = await customer.add(customer_info)
                const salesperson = await salespersonModel.salesperson
                    .findById(customer_info._assignSalespersonId)
                    .select('name nameCn')

                await salespersonModel.salesperson.findByIdAndUpdate(
                    customer_info._assignSalespersonId,
                    { $inc: { _customerNum: 1 } }
                )
                await termModel.addManual({
                    customerId: createdCustomer._id,
                    days: 90,
                    oldExpire: null,
                    newExpire: customer_info.expireDate,
                    oldSalesId: null,
                    oldSalesName: '',
                    newSalesId: customer_info._assignSalespersonId,
                    newSalesName: salesperson?.nameCn || salesperson?.name || '',
                    createdBy: {
                        name: auth?.nickname || auth?.username || '用户',
                        role: Number(auth?.role ?? 3),
                        salesId: Number(auth?.role) === 3
                            ? customer_info._assignSalespersonId
                            : null,
                    },
                })
            } else {
                // 未分配客户没有维护期限，不创建期限历史。
                createdCustomer = await customer.add(customer_info)
            }
        } catch (e: any) {
            logger.error(`Add info failed for customer: ${customer_info.name}`, e)
            setResponseStatus(event, 616)
            return {
                code: CODE.ERROR_ADD_CUSTOMER,
                msg: codeToMsg[CODE.ERROR_ADD_CUSTOMER],
            }
        }

        try {
            const auth = event.context.auth
            if (
                Number(auth?.role) === ADMIN_ROLE.SUPER &&
                createdCustomer?._id &&
                !customer_info._isAssigned
            ) {
                const newsModel = useNewsModel()
                const actorName = auth?.nickname || auth?.username || '管理员'
                await newsModel.add({
                    scope: 'public',
                    type: 'public_customer_added',
                    actorName,
                    customerId: createdCustomer._id,
                    customerName: createdCustomer.name || customer_info.name || '',
                    eventKey: `public_customer_added:${createdCustomer._id}`,
                })
            }
        } catch (newsErr) {
            logger.error('Add public customer news failed', newsErr as Error)
        }

        try {
            const auth = event.context.auth
            if (
                Number(auth?.role) <= ADMIN_ROLE.OPERATOR &&
                createdCustomer?._id &&
                customer_info._isAssigned &&
                customer_info._assignSalespersonId
            ) {
                const newsModel = useNewsModel()
                const actorName = auth?.nickname || auth?.username || '管理员'
                const salesperson = await salespersonModel.salesperson
                    .findById(customer_info._assignSalespersonId)
                    .select('name nameCn')
                    .lean()

                await newsModel.add({
                    scope: 'personal',
                    type: 'customer_assigned',
                    actorName,
                    recipientSalespersonId: customer_info._assignSalespersonId,
                    salespersonId: customer_info._assignSalespersonId,
                    salespersonName: salesperson?.nameCn || salesperson?.name || '',
                    customerId: createdCustomer._id,
                    customerName: createdCustomer.name || customer_info.name || '',
                    eventKey: `customer_assigned:${createdCustomer._id}:${customer_info._assignSalespersonId}`,
                })
            }
        } catch (newsErr) {
            logger.error('Add customer assigned news failed', newsErr as Error)
        }

        logger.info(`Successful add info for customer: ${customer_info.name} with ${attachments.length} attachments`)
        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                customer: createdCustomer,
            },
        }
    } catch (err: any) {
        logger.error('Add Customer Info Error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
        }
    }
})
