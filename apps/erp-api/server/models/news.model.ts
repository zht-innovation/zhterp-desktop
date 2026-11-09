import mongoose from 'mongoose'

const { Schema } = mongoose

export type NewsScope = 'personal' | 'public'
export type NewsType =
    | 'public_customer_added'
    | 'customer_assigned'
    | 'customer_unassigned'
    | 'application_approved'
    | 'application_rejected'
    | 'maintenance_due'
    | 'maintenance_extended'
    | 'maintenance_shortened'
    | 'maintenance_ended'

export interface NewsReq {
    scope: NewsScope
    type: NewsType
    recipientSalespersonId?: mongoose.Types.ObjectId | string | null
    actorAdminId?: mongoose.Types.ObjectId | string | null
    actorName?: string
    customerId?: mongoose.Types.ObjectId | string | null
    customerName?: string
    salespersonId?: mongoose.Types.ObjectId | string | null
    salespersonName?: string
    expireDate?: Date | string | null
    eventKey?: string
}

const newsSchema = new Schema(
    {
        scope: {
            type: String,
            enum: ['personal', 'public'],
            required: true,
        },
        type: {
            type: String,
            required: true,
        },
        recipientSalespersonId: {
            type: Schema.Types.ObjectId,
            ref: 'Salesperson',
            default: null,
        },
        actorAdminId: {
            type: Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },
        actorName: {
            type: String,
            default: '',
        },
        customerId: {
            type: Schema.Types.ObjectId,
            ref: 'Customer',
            default: null,
        },
        customerName: {
            type: String,
            default: '',
        },
        salespersonId: {
            type: Schema.Types.ObjectId,
            ref: 'Salesperson',
            default: null,
        },
        salespersonName: {
            type: String,
            default: '',
        },
        expireDate: {
            type: Date,
            default: null,
        },
        eventKey: {
            type: String,
            unique: true,
            sparse: true,
        },
        _createdAt: {
            type: Date,
            default: Date.now,
            expires: 60 * 60 * 24 * 30,
        },
    },
    {
        versionKey: false,
    }
)

const News = mongoose.model('News', newsSchema)

class NewsModel {
    news: typeof News

    constructor(news: typeof News) {
        this.news = news
    }

    async add(news: NewsReq) {
        const payload: NewsReq = { ...news }
        if (payload.expireDate && typeof payload.expireDate === 'string') {
            payload.expireDate = new Date(payload.expireDate)
        }

        if (payload.eventKey) {
            return await this.news.findOneAndUpdate(
                { eventKey: payload.eventKey },
                { $setOnInsert: { ...payload, _createdAt: new Date() } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            )
        }

        return await this.news.create(payload)
    }

    async retrieveNewsList(salespersonId: string | null, role: number | string) {
        const match: Record<string, any> = {}
        const roleValue = Number(role)
        if (roleValue === 3) {
            const ors: any[] = [{ scope: 'public' }]
            if (salespersonId) {
                ors.push({
                    scope: 'personal',
                    recipientSalespersonId: new mongoose.Types.ObjectId(salespersonId),
                })
            }
            match.$or = ors
        }

        return await this.news.find(match).sort({ _createdAt: -1 })
    }
}

export const useNewsModel = () => new NewsModel(News)
