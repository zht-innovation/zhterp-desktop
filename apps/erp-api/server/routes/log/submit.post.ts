import { getErpAttachmentRoot } from "~~/server/utils/erpAttachmentRoot";
import { useLogModel } from "~~/server/models/log.model"
import { logger } from "~~/server/utils/logger"
import { inLogRange } from "~~/shared/utils/logDate"

import { createWriteStream } from 'fs'
import fs from "fs"
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

        // 初始化日志数据
        const log_info: any = {}
        const attachments: Array<{ path: string; originalName?: string }> = []

        // 处理表单字段和文件
        for (const part of formData) {
            if (part.name === 'attachments' && part.filename) {
                // 处理文件上传
                try {
                    const uploadDir = path.join(getErpAttachmentRoot(), "main", "log-attachments")

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
                        path: `/main/log-attachments/${filename}`,
                        originalName: safeOriginalName
                    })
                } catch (fileError) {
                    logger.error(`日志文件上传失败: ${part.filename}`, fileError as Error)
                    // 继续处理其他字段，不中断整个请求
                }
            }
            else if (part.name && !part.filename) {
                // 处理普通字段
                const value = part.data.toString('utf-8')

                // 处理日期字段
                if (part.name === 'logDate') {
                    log_info[part.name] = value ? new Date(value) : new Date()
                }
                // 其他字段直接赋值
                else {
                    log_info[part.name] = value
                }
            }
        }

        // 添加附件路径到日志信息
        log_info.attachments = attachments

        // 验证必填字段
        const requiredFields = ['content', 'logSalespersonId', 'logCustomerId']
        const missingFields = requiredFields.filter(field => !log_info[field])

        if (missingFields.length > 0) {
            setResponseStatus(event, 400)
            return {
                code: CODE.INVALID_PARAMS,
                msg: `缺少必填字段: ${missingFields.join(', ')}`,
            }
        }

        const logModel = useLogModel()
        const auth = event.context.auth

        if (Number(auth?.role) === 3) {
            const logDate = log_info.logDate instanceof Date ? log_info.logDate : new Date(log_info.logDate || Date.now())
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
        }

        try {
            await logModel.add({
                content: log_info.content,
                logSalespersonId: log_info.logSalespersonId,
                logCustomerId: log_info.logCustomerId,
                logDate: log_info.logDate,
                followUpMethod: log_info.followUpMethod,
                subject: log_info.subject,
                feedbackAttitude: log_info.feedbackAttitude,
                currentStage: log_info.currentStage,
                followUpResult: log_info.followUpResult,
                // 售后维护相关
                maintenanceType: log_info.maintenanceType,
                productModel: log_info.productModel,
                productSerialNumber: log_info.productSerialNumber,
                problemDescription: log_info.problemDescription,
                solutionAndProgress: log_info.solutionAndProgress,
                attachments: log_info.attachments
            })
        } catch (e: any) {
            logger.error(`Submit log failed: ${e.message}`)
            setResponseStatus(event, 500)
            return {
                code: CODE.SERVER_ERROR,
                msg: codeToMsg[CODE.SERVER_ERROR] || '日志提交失败'
            }
        }

        logger.info(`Log submitted by salesperson ${log_info.logSalespersonId} for customer ${log_info.logCustomerId} with ${attachments.length} attachments`)
        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS]
        }

    } catch (err: any) {
        logger.error('Submit Log Error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }
})
