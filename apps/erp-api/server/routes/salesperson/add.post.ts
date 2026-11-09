// 添加销售，body中填写销售信息

import { SalespersonReq, useSalespersonModel } from "~~/server/models/salesperson.model"
import { logger } from "~~/server/utils/logger"

import { MX_WHITELIST_DOMAINS } from "~~/server/utils/emailValidate"

import dns from "dns"
import { validate } from "email-validator"

export default defineEventHandler(async (event) => {
    try {
        const {
            name,
            nameCn,
            nameEn,
            joinDate,
            joinDesc,
            country,
            city,
            phone,
            whatsapp,
            email,
            languages,
            markets,
            domains,
            region,
        } = await readBody(event)

        const salesperson_info: SalespersonReq = {
            name,
            nameCn,
            nameEn,
            phone,
            email,
            joinDate,
            joinDesc,
            country,
            city,
            whatsapp,
            languages,
            markets,
            domains,
            region,
        }

        const salesperson = useSalespersonModel()

        try {
            const ip = getRequestIP(event, { xForwardedFor: true })
            // 校验邮箱基本格式
            if (email && typeof email === 'string' && email.trim().length > 0) {
                if (!validate(email)) {
                    logger.warn(`Invalid email format: ${email} from IP: ${ip}`)
                    setResponseStatus(event, 606)
                    return {
                        code: CODE.WRONG_EMAIL_FORMAT,
                        msg: codeToMsg[CODE.WRONG_EMAIL_FORMAT],
                    }
                }

                // 校验邮箱域名服务器是否存在
                const domain = email.split('@')[1]
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
            await salesperson.add(salesperson_info)

        } catch (e: any) {
            logger.error(`Add info failed for salesperson: ${salesperson_info.name}`, e)
            setResponseStatus(event, 616)
            return {
                code: CODE.ERROR_ADD_SALESPERSON,
                msg: codeToMsg[CODE.ERROR_ADD_SALESPERSON]
            }
        }

        logger.info(`Successful add info for salesperson: ${salesperson_info.name}`)
        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
        }
    } catch (err: any) {
        logger.error('Add Salesperson Info Error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }
})
