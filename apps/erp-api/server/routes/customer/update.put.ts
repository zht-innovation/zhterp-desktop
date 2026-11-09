import { getErpAttachmentRoot } from "~~/server/utils/erpAttachmentRoot";
// 更新客户信息，需要更新的信息填在 body 中

import { useCustomerModel } from "~~/server/models/customer.model"
import { resolveSalespersonId } from "~~/server/services/salesOrderAccess"
import { logger } from "~~/server/utils/logger"
import { ADMIN_ROLE } from "~~/shared/enums"
import dns from "dns"
import { validate } from "email-validator"
import { createWriteStream } from 'fs'
import { unlink } from 'fs/promises'
import mongoose from "mongoose"
import path from 'path'

import { MX_WHITELIST_DOMAINS } from "~~/server/utils/emailValidate"

const allowedFields = [
    "name",
    "customerType",
    "customerLevel",
    "company",
    "companyDetail",
    "companyWebsite",
    "email",
    "phone",
    "whatsapp",
    "wechat",
    "source",
    "sourceDetail",
    "country",
    "city",
    "avatar",
    "customTags",
]

export default defineEventHandler(async (event) => {
    const customerModel = useCustomerModel()
    const contentType = event.node.req.headers['content-type'] || ''
    const isMultipart = contentType.includes('multipart/form-data')

    let body: Record<string, any> = {}
    const removedAttachments: string[] = []
    const pendingAttachments: Array<{ data: Buffer; filename: string }> = []
    const newAttachments: Array<{ path: string; originalName?: string }> = []

    if (isMultipart) {
        const formData = await readMultipartFormData(event)
        if (!formData) {
            setResponseStatus(event, 400)
            return {
                code: CODE.INVALID_PARAMS,
                msg: codeToMsg[CODE.INVALID_PARAMS],
            }
        }

        for (const part of formData) {
            if (part.name === 'attachments' && part.filename) {
                pendingAttachments.push({
                    data: part.data,
                    filename: part.filename,
                })
            }
            else if (part.name && !part.filename) {
                const value = part.data.toString('utf-8')
                if (part.name === 'customTags') {
                    if (!body[part.name]) {
                        body[part.name] = []
                    }
                    body[part.name].push(value)
                } else if (part.name === 'removedAttachments') {
                    removedAttachments.push(value)
                } else {
                    body[part.name] = value
                }
            }
        }
    } else {
        body = (await readBody(event)) || {}
        if (Array.isArray(body?.removedAttachments)) {
            removedAttachments.push(...body.removedAttachments)
        }
    }
    const id = body?.id

    if (!id) {
        setResponseStatus(event, 400)
        return {
            code: CODE.INVALID_PARAMS,
            msg: codeToMsg[CODE.INVALID_PARAMS],
        }
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
        setResponseStatus(event, 404)
        return {
            code: CODE.SERVER_ERROR,
            msg: '客户不存在',
        }
    }

    let customer: any
    try {
        customer = await customerModel.customer.findById(id).lean()
    } catch (err) {
        logger.error("Retrieve customer for update error", err as Error)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
        }
    }

    if (!customer || customer._isFakeDel) {
        setResponseStatus(event, 404)
        return {
            code: CODE.SERVER_ERROR,
            msg: '客户不存在',
        }
    }

    const auth = event.context.auth
    if (Number(auth?.role) === ADMIN_ROLE.SELLER) {
        let salespersonId: string | null = null
        try {
            salespersonId = await resolveSalespersonId(auth)
        } catch (err) {
            logger.error("Resolve salesperson for customer update error", err as Error)
            setResponseStatus(event, 500)
            return {
                code: CODE.SERVER_ERROR,
                msg: codeToMsg[CODE.SERVER_ERROR],
            }
        }
        const assignedId = customer._assignSalespersonId?.toString()
        if (!customer._isAssigned || !salespersonId || assignedId !== salespersonId) {
            setResponseStatus(event, 403)
            return {
                code: CODE.SERVER_ERROR,
                msg: '权限不足',
            }
        }
    }

    const updateData: Record<string, any> = {}
    for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
            updateData[field] = body[field]
        }
    }

    const email = updateData.email
    if (Object.prototype.hasOwnProperty.call(updateData, "email")) {
        const emailText = typeof email === "string" ? email.trim() : ""
        if (emailText && emailText !== "----------------------") {
            if (!validate(emailText)) {
                setResponseStatus(event, 606)
                return {
                    code: CODE.WRONG_EMAIL_FORMAT,
                    msg: codeToMsg[CODE.WRONG_EMAIL_FORMAT],
                }
            }

            const domain = emailText.split("@")[1]
            try {
                // 检查是否在白名单中
                if (MX_WHITELIST_DOMAINS.includes(domain)) {
                    logger.info(`Domain ${domain} is in whitelist, skip MX validation.`);
                } else {
                    const mxRecords = await dns.promises.resolveMx(domain);
                    if (mxRecords.length === 0) {
                        logger.warn(`Invalid email domain: ${domain}`);
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
    }

    try {
        for (const attachment of pendingAttachments) {
            try {
                const uploadDir = path.join(getErpAttachmentRoot(), "main", "attachments")

                const timestamp = Date.now()
                const randomStr = Math.random().toString(36).substring(2, 8)
                const safeOriginalName = path.basename(attachment.filename)
                const fileExtension = path.extname(safeOriginalName)
                const filename = `${timestamp}-${randomStr}${fileExtension}`
                const filepath = path.join(uploadDir, filename)

                const writeStream = createWriteStream(filepath)
                writeStream.write(attachment.data)
                writeStream.end()

                await new Promise((resolve, reject) => {
                    writeStream.on('finish', resolve)
                    writeStream.on('error', reject)
                })

                newAttachments.push({
                    path: `/main/attachments/${filename}`,
                    originalName: safeOriginalName
                })
            } catch (fileError) {
                logger.error(`文件上传失败: ${attachment.filename}`, fileError as Error)
            }
        }

        const getAttachmentPath = (item: any) => (typeof item === 'string' ? item : item?.path || '')
        let removedExisting: Array<string | { path: string; originalName?: string }> = []
        if (newAttachments.length > 0 || removedAttachments.length > 0) {
            const currentAttachments = Array.isArray(customer?.attachments) ? customer?.attachments : []
            removedExisting = currentAttachments.filter((item: any) => removedAttachments.includes(getAttachmentPath(item)))
            const filtered = currentAttachments.filter((item: any) => !removedAttachments.includes(getAttachmentPath(item)))
            updateData.attachments = [...filtered, ...newAttachments]
        }

        if (Object.keys(updateData).length === 0) {
            setResponseStatus(event, 400)
            return {
                code: CODE.INVALID_PARAMS,
                msg: codeToMsg[CODE.INVALID_PARAMS],
            }
        }

        await customerModel.update(id, updateData)

        if (removedExisting.length > 0) {
            const publicRoot = getErpAttachmentRoot()
            const attachmentsRoot = path.join(publicRoot, 'main', 'attachments')
            const attachmentsPrefix = `${attachmentsRoot}${path.sep}`
            for (const attachmentItem of removedExisting) {
                const attachmentPath = getAttachmentPath(attachmentItem)
                if (!attachmentPath) {
                    continue
                }
                const relativePath = attachmentPath.replace(/^\/+/, '')
                const filePath = path.join(publicRoot, relativePath)
                const resolvedPath = path.resolve(filePath)
                if (!(resolvedPath === attachmentsRoot || resolvedPath.startsWith(attachmentsPrefix))) {
                    logger.warn(`Skip deleting attachment outside allowed dir: ${resolvedPath}`)
                    continue
                }
                try {
                    await unlink(resolvedPath)
                } catch (fileErr: any) {
                    if (fileErr?.code !== 'ENOENT') {
                        logger.error(`删除附件失败: ${resolvedPath}`, fileErr)
                    }
                }
            }
        }
    } catch (err: any) {
        logger.error("Update customer error", err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR],
        }
    }

    setResponseStatus(event, 200)
    return {
        code: CODE.SUCCESS,
        msg: codeToMsg[CODE.SUCCESS],
    }
})
