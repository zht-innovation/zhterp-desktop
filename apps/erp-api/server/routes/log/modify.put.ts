import { getErpAttachmentRoot } from "~~/server/utils/erpAttachmentRoot";
import { useLogModel } from "~~/server/models/log.model"
import { logger } from "~~/server/utils/logger"
import { inLogRange } from "~~/shared/utils/logDate"
import { createWriteStream } from 'fs'
import { mkdir, unlink } from 'fs/promises'
import path from 'path'
import fs from "fs"

export default defineEventHandler(async (event) => {
    try {
        logger.info('modify')
        const contentType = event.node.req.headers['content-type'] || ''
        const isMultipart = contentType.includes('multipart/form-data')

        let body: Record<string, any> = {}
        const removedAttachments: string[] = []
        const newAttachments: Array<{ path: string; originalName?: string }> = []

        if (isMultipart) {
            const formData = await readMultipartFormData(event)
            if (!formData) {
                setResponseStatus(event, 400)
                return {
                    code: CODE.SERVER_ERROR,
                    msg: '参数不完整'
                }
            }

            for (const part of formData) {
                if (part.name === 'attachments' && part.filename) {
                    try {
                        const uploadDir = path.join(getErpAttachmentRoot(), "main", "log-attachments")

                        const timestamp = Date.now()
                        const randomStr = Math.random().toString(36).substring(2, 8)
                        const safeOriginalName = path.basename(part.filename)
                        const fileExtension = path.extname(safeOriginalName)
                        const filename = `${timestamp}-${randomStr}${fileExtension}`
                        const filepath = path.join(uploadDir, filename)

                        const writeStream = createWriteStream(filepath)
                        writeStream.write(part.data)
                        writeStream.end()

                        await new Promise((resolve, reject) => {
                            writeStream.on('finish', resolve)
                            writeStream.on('error', reject)
                        })

                        newAttachments.push({
                            path: `/main/log-attachments/${filename}`,
                            originalName: safeOriginalName
                        })
                    } catch (fileError: any) {
                        logger.error(`日志附件上传失败: ${part.filename}`, fileError)
                    }
                } else if (part.name && !part.filename) {
                    const value = part.data.toString('utf-8')
                    if (part.name === 'removedAttachments') {
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

        const _id = body?._id

        if (!_id) {
            setResponseStatus(event, 400)
            return {
                code: CODE.SERVER_ERROR,
                msg: '参数不完整：需要日志ID'
            }
        }

        const logModel = useLogModel()
        const auth = event.context.auth

        let existingLog: any = null
        if (Number(auth?.role) === 3) {
            existingLog = await logModel.log.findById(_id).select('logDate _createDate').lean()
            if (!existingLog) {
                setResponseStatus(event, 404)
                return {
                    code: CODE.SERVER_ERROR,
                    msg: '日志不存在'
                }
            }

            const logDate = new Date(existingLog.logDate || existingLog._createDate)
            if (Number.isNaN(logDate.getTime())) {
                setResponseStatus(event, 400)
                return {
                    code: CODE.SERVER_ERROR,
                    msg: '日志日期异常'
                }
            }

            if (!inLogRange(logDate.toISOString())) {
                setResponseStatus(event, 403)
                return {
                    code: CODE.SERVER_ERROR,
                    msg: '日志日期仅限今天及往前7个工作日'
                }
            }

            const nextDate = body.logDate ? new Date(body.logDate) : logDate
            if (Number.isNaN(nextDate.getTime())) {
                setResponseStatus(event, 400)
                return {
                    code: CODE.SERVER_ERROR,
                    msg: '日志日期异常'
                }
            }
            if (!inLogRange(nextDate.toISOString())) {
                setResponseStatus(event, 403)
                return {
                    code: CODE.SERVER_ERROR,
                    msg: '日志日期仅限今天及往前7个工作日'
                }
            }
        }

        // 构建更新对象，只更新提供的字段
        const updateData: any = {}
        if (body.content !== undefined) updateData.content = body.content
        if (body.logDate !== undefined && body.logDate !== '') updateData.logDate = new Date(body.logDate)
        if (body.followUpMethod !== undefined) updateData.followUpMethod = body.followUpMethod
        if (body.subject !== undefined) updateData.subject = body.subject
        if (body.feedbackAttitude !== undefined) updateData.feedbackAttitude = body.feedbackAttitude
        if (body.currentStage !== undefined) updateData.currentStage = body.currentStage
        if (body.followUpResult !== undefined) updateData.followUpResult = body.followUpResult
        if (body.maintenanceType !== undefined) updateData.maintenanceType = body.maintenanceType
        if (body.productModel !== undefined) updateData.productModel = body.productModel
        if (body.productSerialNumber !== undefined) updateData.productSerialNumber = body.productSerialNumber
        if (body.problemDescription !== undefined) updateData.problemDescription = body.problemDescription
        if (body.solutionAndProgress !== undefined) updateData.solutionAndProgress = body.solutionAndProgress

        try {
            const getAttachmentPath = (item: any) =>
                typeof item === 'string' ? item : item?.path || ''
            let removedExisting: Array<string | { path: string; originalName?: string }> = []

            if (newAttachments.length > 0 || removedAttachments.length > 0) {
                const log = existingLog || await logModel.log.findById(_id)
                const currentAttachments = Array.isArray(log?.attachments) ? log?.attachments : []
                removedExisting = currentAttachments.filter((item: any) =>
                    removedAttachments.includes(getAttachmentPath(item))
                )
                const filtered = currentAttachments.filter(
                    (item: any) => !removedAttachments.includes(getAttachmentPath(item))
                )
                updateData.attachments = [...filtered, ...newAttachments]
            }

            const result = await logModel.log.findByIdAndUpdate(
                _id,
                updateData,
                { new: true, runValidators: true }
            )

            if (!result) {
                setResponseStatus(event, 404)
                return {
                    code: CODE.SERVER_ERROR,
                    msg: '日志不存在'
                }
            }

            if (removedExisting.length > 0) {
                const publicRoot = getErpAttachmentRoot()
                const attachmentsRoot = path.join(publicRoot, 'main', 'log-attachments')
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
                            logger.error(`删除日志附件失败: ${resolvedPath}`, fileErr)
                        }
                    }
                }
            }
        } catch (e: any) {
            logger.error(`Modify log failed: ${e.message}`)
            setResponseStatus(event, 500)
            return {
                code: CODE.SERVER_ERROR,
                msg: '日志修改失败'
            }
        }

        logger.info(`Log ${_id} modified successfully`)
        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS]
        }

    } catch (err: any) {
        logger.error('Modify Log Error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }
})
