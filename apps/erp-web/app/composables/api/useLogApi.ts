import { getToken } from '~/utils/auth'

// 跟进方式
export const FOLLOW_UP_METHODS = ['电话', '微信/WhatsApp', '邮件', '上门拜访', '线上会议', '展会对接'] as const
export type FollowUpMethod = typeof FOLLOW_UP_METHODS[number]

// 客户反馈态度
export const FEEDBACK_ATTITUDES = ['十分满意，并达成合作', '积极', '中性', '消极'] as const
export type FeedbackAttitude = typeof FEEDBACK_ATTITUDES[number]

// 当前阶段
export const CURRENT_STAGES = ['初步触达', '需求确认', '方案报价', '商务谈判', '合同签订', '售后维护'] as const
export type CurrentStage = typeof CURRENT_STAGES[number]

// 机型
export const PRODUCT_MODELS = ['KEEL', 'KEEL Mini', 'KEEL Plus', 'KEEL Pro', 'KEEL Max', 'NAGA X4', 'NAGA X8'] as const

// 维护产品类型
export const MAINTENANCE_TYPES = ['机型', '电池', '电路板', '桨叶', '其他'] as const

export type LogPayload = {
    content: string
    logSalespersonId: string
    logCustomerId: string
    logDate?: string | Date
    followUpMethod?: FollowUpMethod | string
    subject?: string
    feedbackAttitude?: FeedbackAttitude | string
    currentStage?: CurrentStage | string
    followUpResult?: string
    attachments?: File[]
}

export type LogModifyPayload = {
    _id: string
    content?: string
    logDate?: string | Date
    followUpMethod?: FollowUpMethod | string
    subject?: string
    feedbackAttitude?: FeedbackAttitude | string
    currentStage?: CurrentStage | string
    followUpResult?: string
    removedAttachments?: string[]
    attachments?: File[]
}

export function submitLog() {
    return (payload: LogPayload | FormData) =>
        $fetch('/log/submit', {
            method: 'POST',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function retrieveLogList() {
    return (params?: { salespersonId?: string; customerId?: string }) =>
        $fetch('/log/retrieve', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
            params,
        })
}

export function deleteLog() {
    return (id: string) =>
        $fetch('/log/delete', {
            method: 'DELETE',
            headers: {
                Token: getToken() || '',
            },
            body: { id },
        })
}

export function modifyLog() {
    return (payload: LogModifyPayload | FormData) =>
        $fetch('/log/modify', {
            method: 'PUT',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}