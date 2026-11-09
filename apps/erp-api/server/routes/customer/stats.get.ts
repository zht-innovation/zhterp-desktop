import { useCustomerModel } from "~~/server/models/customer.model"
import { logger } from "~~/server/utils/logger"

export default defineEventHandler(async (event) => {
    try {
        const customerModel = useCustomerModel()
        // country 只要包含 "中国"（例如 "中国香港/中国澳门/中国台湾"）就认为是中国
        const CN_REGEX = /中国/

        // 最近12个月（含当月）的获客数据：按客户创建时间 _addTime 统计每月新增客户数
        const now = new Date()
        const months: { start: Date; end: Date; label: string }[] = []
        for (let i = 11; i >= 0; i--) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
            const label = `${start.getFullYear()}/${String(start.getMonth() + 1).padStart(2, '0')}`
            months.push({ start, end, label })
        }

        // 获取各类客户统计
        const [
            totalCustomers,
            domesticCustomers,
            foreignCustomers,
            bTypeCustomers,
            gTypeCustomers,
            generalCustomers,
            qualityCustomers,
            potentialCustomers,
            strategicCustomers
        ] = await Promise.all([
            // 总客户数（未删除）
            customerModel.customer.countDocuments({ _isFakeDel: false }),
            
            // 国内客户（中国）
            customerModel.customer.countDocuments({ 
                _isFakeDel: false,
                country: CN_REGEX
            }),
            
            // 国外客户（非中国）
            customerModel.customer.countDocuments({ 
                _isFakeDel: false,
                country: { $not: CN_REGEX }
            }),
            
            // B端客户（企业、学校）
            customerModel.customer.countDocuments({ 
                _isFakeDel: false,
                customerType: { $in: ['B端客户', 'B端客户-院校'] }
            }),
            
            // G端客户（政府）
            customerModel.customer.countDocuments({ 
                _isFakeDel: false,
                customerType: { $in: ['G端客户'] }
            }),
            
            // 一般客户（已成单）
            customerModel.customer.countDocuments({ 
                _isFakeDel: false,
                customerLevel: '一般客户'
            }),
            
            // 优质客户（已成单）
            customerModel.customer.countDocuments({ 
                _isFakeDel: false,
                customerLevel: '优质客户'
            }),
            
            // 潜在客户（未成单）
            customerModel.customer.countDocuments({ 
                _isFakeDel: false,
                customerLevel: '潜在客户'
            }),
            
            // 战略合作（代理商）
            customerModel.customer.countDocuments({ 
                _isFakeDel: false,
                customerType: '战略合作'
            })
        ])

        const acquisitionCounts = await Promise.all(
            months.map((m) =>
                customerModel.customer.countDocuments({
                    _isFakeDel: false,
                    _addTime: { $gte: m.start, $lt: m.end },
                })
            )
        )

        setResponseStatus(event, 200)
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                stats: {
                    total: totalCustomers,
                    domestic: domesticCustomers,
                    foreign: foreignCustomers,
                    bType: bTypeCustomers,
                    gType: gTypeCustomers,
                    general: generalCustomers,
                    quality: qualityCustomers,
                    potential: potentialCustomers,
                    strategic: strategicCustomers
                },
                acquisition: {
                    labels: months.map((m) => m.label),
                    data: acquisitionCounts
                },
            }
        }

    } catch (err: any) {
        logger.error('Get customer stats error', err)
        setResponseStatus(event, 500)
        return {
            code: CODE.SERVER_ERROR,
            msg: codeToMsg[CODE.SERVER_ERROR]
        }
    }
})
