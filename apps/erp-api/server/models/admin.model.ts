import mongoose from 'mongoose'
import { ADMIN_ROLE } from "~~/shared/enums"

const { Schema } = mongoose

interface AdminReq {
    username: string,
    password: string,
    nickname: string,
    role: ADMIN_ROLE,
    departmentId?: mongoose.Types.ObjectId,
    canManageApprovalFlow?: boolean,
    canAuditSalesOrder?: boolean,
    canAuditSalesReceipt?: boolean,
    canAuditBorrowRequest?: boolean,
}

const adminSchema = new Schema({
    username: {
        type: String,
        unique: true,
        required: true
    },
    password: String,
    nickname: String,
    role: String,
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    canManageApprovalFlow: {
        type: Boolean,
        default: false,
    },
    canAuditSalesOrder: {
        type: Boolean,
        default: false,
    },
    canAuditSalesReceipt: {
        type: Boolean,
        default: false,
    },
    canAuditBorrowRequest: {
        type: Boolean,
        default: false,
    },
    _time: {
        type: Date,
        default: Date.now
    }
}, {
    versionKey: false
})

const Admin = mongoose.model('Admin', adminSchema)

class AdminModel {
    admin: typeof Admin

    constructor(admin: typeof Admin) {
        this.admin = admin
    }

    async signup(admin: AdminReq, session?: mongoose.ClientSession) {
        try {
            // await this.admin.create(admin)
            const [result] = await this.admin.create([admin], { session })
            return result._id // 返回_id
        } catch (err: any) {
            throw err
        }
    }

    async login(username: string) {
        return await this.admin.findOne({ username })
    }

    async findAdminById(_id: string, session?: mongoose.ClientSession) {
        const query = this.admin.findOne({ _id })
        if (session) query.session(session)
        return await query
    }

    async findAdminByUsername(username: string) {
        return await this.admin.findOne({ username })
    }

    async retrieveAdminList() {
        return await this.admin.find({}, { password: 0 })
    }

    async findAdminsByIds(_ids: string[]) {
        return await this.admin.find({ _id: { $in: _ids } }, { username: 1, nickname: 1 })
    }

    async findAdminsByIdsWithRole(_ids: string[], session?: mongoose.ClientSession) {
        const query = this.admin.find(
            { _id: { $in: _ids } },
            { username: 1, nickname: 1, role: 1, canAuditBorrowRequest: 1 },
        )
        if (session) query.session(session)
        return await query.lean()
    }

    async findAdminsByRole(role: ADMIN_ROLE | number) {
        return await this.admin
            .find(
                { role: String(role) },
                { username: 1, nickname: 1, role: 1, canAuditBorrowRequest: 1, _time: 1 },
            )
            .sort({ _time: 1, _id: 1 })
            .lean()
    }

    async findBorrowWarehouseApprovers() {
        const warehouseApprovers = await this.admin
            .find(
                {
                    role: String(ADMIN_ROLE.WAREHOUSE_KEEPER),
                    canAuditBorrowRequest: true,
                },
                { username: 1, nickname: 1, role: 1, canAuditBorrowRequest: 1, _time: 1 },
            )
            .sort({ _time: 1, _id: 1 })
            .lean()

        if (warehouseApprovers.length > 0) {
            return warehouseApprovers
        }

        return await this.findAdminsByRole(ADMIN_ROLE.WAREHOUSE_KEEPER)
    }

    async findSalesOrderAuditors() {
        return await this.admin
            .find(
                { canAuditSalesOrder: true },
                { username: 1, nickname: 1, role: 1, canAuditSalesOrder: 1, _time: 1 },
            )
            .sort({ _time: 1, _id: 1 })
            .lean()
    }

    async delete(_id: string) {
        return await this.admin.deleteOne({ _id })
    }

    async modify(_id: string, admin: Partial<AdminReq>, session?: mongoose.ClientSession) {
        return await this.admin.updateOne({ _id }, { $set: admin }, { session, runValidators: true })
    }
}

export const useAdminModel = () => new AdminModel(Admin)
export type {
    AdminReq
}
