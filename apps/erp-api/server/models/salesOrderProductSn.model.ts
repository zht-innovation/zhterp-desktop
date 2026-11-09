import mongoose from "mongoose";
import {
    getSalesOrderProductSnRule,
    SALES_ORDER_PRODUCT_SN_STARTS,
    PRODUCT_SN_MAX_SERIAL,
} from "~~/shared/utils/salesOrderProductSn";

interface ProductSnPolicyData {
    _id: string;
    activatedAt: Date;
}

interface ProductSnCounterData {
    _id: string;
    prefix: string;
    lastSerial: number;
}

export interface ProductSnAllocationData {
    salesOrderId: mongoose.Types.ObjectId;
    approvalId: mongoose.Types.ObjectId;
    snapshotHash: string;
    productIndex: number;
    productCode: string;
    quantity: number;
    prefix: string;
    startSerial: number;
    endSerial: number;
    allocatedBy: mongoose.Types.ObjectId;
    allocatedAt: Date;
}

const { Schema } = mongoose;
const policySchema = new Schema<ProductSnPolicyData>({
    _id: { type: String, required: true },
    activatedAt: { type: Date, required: true },
}, { versionKey: false });

const counterSchema = new Schema<ProductSnCounterData>({
    _id: { type: String, required: true },
    prefix: { type: String, required: true },
    lastSerial: { type: Number, required: true, min: 0, max: PRODUCT_SN_MAX_SERIAL },
}, { versionKey: false });

const allocationSchema = new Schema<ProductSnAllocationData>({
    salesOrderId: { type: Schema.Types.ObjectId, required: true },
    approvalId: { type: Schema.Types.ObjectId, required: true },
    snapshotHash: { type: String, required: true },
    productIndex: { type: Number, required: true, min: 0 },
    productCode: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    prefix: { type: String, required: true },
    startSerial: { type: Number, required: true, min: 1, max: PRODUCT_SN_MAX_SERIAL },
    endSerial: { type: Number, required: true, min: 1, max: PRODUCT_SN_MAX_SERIAL },
    allocatedBy: { type: Schema.Types.ObjectId, required: true },
    allocatedAt: { type: Date, required: true },
}, { versionKey: false });
allocationSchema.index({ salesOrderId: 1, productIndex: 1 }, { unique: true });

const ProductSnPolicy = (mongoose.models.SalesOrderProductSnPolicy as mongoose.Model<ProductSnPolicyData>)
    || mongoose.model<ProductSnPolicyData>("SalesOrderProductSnPolicy", policySchema);
const ProductSnCounter = (mongoose.models.SalesOrderProductSnCounter as mongoose.Model<ProductSnCounterData>)
    || mongoose.model<ProductSnCounterData>("SalesOrderProductSnCounter", counterSchema);
const ProductSnAllocation = (mongoose.models.SalesOrderProductSnAllocation as mongoose.Model<ProductSnAllocationData>)
    || mongoose.model<ProductSnAllocationData>("SalesOrderProductSnAllocation", allocationSchema);

let activatedAt: Date | null = null;
const POLICY_ID = "sales-order-product-sn";

export class ProductSnError extends Error {
    status: number;

    constructor(status: number, message: string) {
        super(message);
        this.status = status;
    }
}

// 多进程启动可能同时 upsert；唯一键冲突时读取另一进程已写入的值即可。
const isDuplicateKey = (error: unknown) => (error as { code?: number })?.code === 11000;

export const initializeSalesOrderProductSn = async () => {
    activatedAt = null;
    await Promise.all([
        ProductSnPolicy.createIndexes(),
        ProductSnCounter.createIndexes(),
        ProductSnAllocation.createIndexes(),
    ]);
    for (const productCode of Object.keys(SALES_ORDER_PRODUCT_SN_STARTS)) {
        const rule = getSalesOrderProductSnRule(productCode);
        if (!rule) throw new Error(`产品 ${productCode} 的起始 S/N 配置不合法`);
        try {
            await ProductSnCounter.updateOne({ _id: productCode }, {
                $setOnInsert: { prefix: rule.prefix, lastSerial: rule.firstSerial - 1 },
            }, { upsert: true });
        } catch (error) {
            if (!isDuplicateKey(error)) throw error;
        }
        const counter = await ProductSnCounter.findById(productCode).lean();
        if (!counter || counter.prefix !== rule.prefix) {
            throw new Error(`产品 ${productCode} 的 S/N 前缀与已保存记录不一致`);
        }
    }
    // 索引和初始计数全部就绪后才启用；重新启动不覆盖首次启用时间。
    try {
        await ProductSnPolicy.updateOne({ _id: POLICY_ID }, {
            $setOnInsert: { activatedAt: new Date() },
        }, { upsert: true });
    } catch (error) {
        if (!isDuplicateKey(error)) throw error;
    }
    const policy = await ProductSnPolicy.findById(POLICY_ID).lean();
    if (!policy) throw new Error("销售订单 S/N 初始化失败");
    activatedAt = policy.activatedAt;
};

export const getSalesOrderProductSnActivationTime = () => activatedAt?.toISOString() || null;

export const isSalesOrderProductSnEligible = (createTime: unknown) => {
    if (!activatedAt || !createTime) return false;
    const time = createTime instanceof Date ? createTime.getTime() : new Date(String(createTime)).getTime();
    return Number.isFinite(time) && time >= activatedAt.getTime();
};

type AllocateInput = Pick<ProductSnAllocationData,
    "salesOrderId" | "approvalId" | "snapshotHash" | "productIndex" | "productCode" | "quantity" | "allocatedBy"
>;

export const allocateSalesOrderProductSn = async (
    input: AllocateInput,
    session: mongoose.ClientSession,
): Promise<ProductSnAllocationData> => {
    if (!session.inTransaction()) throw new Error("S/N 号段必须在事务中分配");
    const existing = await ProductSnAllocation.findOne({
        salesOrderId: input.salesOrderId,
        productIndex: input.productIndex,
    }).session(session).lean();
    if (existing) {
        if (existing.approvalId.toString() !== input.approvalId.toString()
            || existing.snapshotHash !== input.snapshotHash
            || existing.productCode !== input.productCode
            || existing.quantity !== input.quantity) {
            throw new ProductSnError(409, "审批版本或产品明细与已分配 S/N 不一致，无法复用号段");
        }
        return existing;
    }

    const rule = getSalesOrderProductSnRule(input.productCode);
    if (!rule) throw new ProductSnError(400, "该产品未配置起始 S/N");
    const counter = await ProductSnCounter.findOneAndUpdate({
        _id: input.productCode,
        prefix: rule.prefix,
        lastSerial: { $lte: PRODUCT_SN_MAX_SERIAL - input.quantity },
    }, {
        $inc: { lastSerial: input.quantity },
    }, { new: true, session }).lean();
    if (!counter) throw new ProductSnError(409, "该产品 S/N 号段不足或配置未就绪，无法下载");

    const allocation: ProductSnAllocationData = {
        ...input,
        prefix: counter.prefix,
        startSerial: counter.lastSerial - input.quantity + 1,
        endSerial: counter.lastSerial,
        allocatedAt: new Date(),
    };
    await ProductSnAllocation.create([allocation], { session });
    return allocation;
};
