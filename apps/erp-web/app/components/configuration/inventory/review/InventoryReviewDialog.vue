<template>
    <Teleport to="body">
        <div ref="maskRef" class="erp-app erp-dialog-mask review-dialog-mask" @click.self="requestClose" @keydown="handleKeydown">
            <ErpDialogFrame
                class="review-dialog"
                title="库存与 BOM 复核"
                width="min(1560px, calc(100vw - 48px))"
                :form="false"
                :close-disabled="saving"
                role="dialog"
                aria-modal="true"
                aria-label="库存与 BOM 复核"
                tabindex="-1"
                @close="requestClose"
            >
                <p class="review-tip">请逐库位核对实物数量，复核仓库数量为各库位实盘合计。完成后同步库存并占用本订单用量；足料同步生产，缺料由生产经理手动发起采购申请。历史订单不纳入。</p>
                <p v-if="readonly" class="review-tip">当前展示该次复核时的库存快照；可用数量为仓库复核实盘合计减去各库位锁定数量合计。</p>
                <p class="review-tip">占用订单及数量为当前查询结果{{ readonly ? "，库存数量为复核时快照" : "" }}。</p>
                <p v-if="submissionError" class="field-error" role="alert">{{ submissionError }}</p>

                <div class="table-scroll">
                    <table class="review-table product-table">
                        <colgroup>
                            <col style="width: 108px"><col style="width: 160px"><col style="width: 88px">
                            <col style="width: 100px"><col style="width: 60px"><col style="width: 90px">
                            <col style="width: 100px">
                            <col style="width: 70px"><col style="width: 126px"><col style="width: 130px">
                            <col style="width: 260px"><col style="width: 200px">
                        </colgroup>
                        <thead>
                            <tr>
                                <th>产品编号</th><th>型号</th><th>产品图片</th><th class="center">销售数量</th>
                                <th class="center">单位</th><th class="center" title="仓库复核实盘合计减去各库位锁定数量合计">可用数量</th>
                                <th class="center" title="各库位库存合计，包含锁定库存及不计可用的仓库库存">库存总量</th><th class="center">缺口</th>
                                <th>复核仓库数量</th><th>BOM 结构</th><th>当前占用订单 / 数量</th><th>备注</th>
                            </tr>
                        </thead>
                        <tbody>
                            <template v-for="product in draft.products" :key="product.id">
                                <tr>
                                    <td>{{ product.productCode }}</td>
                                    <td>{{ product.model }}<span v-if="product.issue" class="field-error">{{ product.issue }}</span></td>
                                    <td>
                                        <div class="item-image">
                                            <img v-if="product.image" :src="resolveErpImageUrl(product.image)" :alt="product.model">
                                            <Icon v-else name="lucide:package" aria-hidden="true" />
                                        </div>
                                    </td>
                                    <td class="center">{{ product.salesQuantity }}</td>
                                    <td class="center">{{ product.unit }}</td>
                                    <td class="center" title="仓库复核实盘合计减去各库位锁定数量合计，未全部核对时显示 --">
                                        {{ displayAvailableQuantity(product) }}
                                    </td>
                                    <td class="center">{{ product.totalQuantity ?? "--" }}</td>
                                    <td class="center" title="销售数量减复核后的可用数量，小于 0 时显示 0；未全部核对时显示 --">{{ displayShortageQuantity(product, product.salesQuantity) }}</td>
                                    <td>
                                        <input
                                            class="quantity-input"
                                            type="number"
                                            min="0"
                                            step="any"
                                            :value="product.checkedQuantity"
                                            :disabled="readonly || saving"
                                            readonly
                                            :aria-label="`${product.productCode}复核仓库数量`"
                                            :aria-invalid="!!errors[product.id]?.quantity"
                                        >
                                        <button v-if="!readonly || product.positions?.length" class="text-button material-toggle" type="button" :disabled="saving" @click="positionItem = product">{{ readonly ? "查看库位" : product.positions?.length ? "按库位核对" : "确认零库存" }}</button>
                                        <span v-if="errors[product.id]?.quantity" class="field-error">{{ errors[product.id]?.quantity }}</span>
                                    </td>
                                    <td>
                                        <button
                                            v-if="product.boms.length"
                                            class="text-button"
                                            type="button"
                                            :aria-expanded="expandedProducts[product.id]"
                                            @click="expandedProducts[product.id] = !expandedProducts[product.id]"
                                        >{{ expandedProducts[product.id] ? "收起下一级 BOM" : "展开下一级 BOM" }}</button>
                                        <span v-else class="secondary-text">暂无 BOM</span>
                                    </td>
                                    <td>
                                        <span v-if="!product.productId" class="secondary-text">--</span>
                                        <span v-else-if="!stockOccupancies[product.productId] || stockOccupancies[product.productId]?.loading" class="secondary-text" role="status">正在查询占用...</span>
                                        <div v-else-if="stockOccupancies[product.productId]?.error" role="alert">
                                            <span class="field-error">{{ stockOccupancies[product.productId]?.error }}</span>
                                            <button class="text-button" type="button" @click="loadStockOccupancy(product.productId, true)">重试</button>
                                        </div>
                                        <template v-else>
                                            <div v-for="occupancy in stockOccupancies[product.productId]?.rows" :key="occupancy.key" class="stock-occupancy">
                                                <span>{{ occupancy.label }}</span>
                                                <strong>{{ occupancy.quantity }} {{ stockOccupancies[product.productId]?.unit || product.unit }}</strong>
                                            </div>
                                            <span v-if="!stockOccupancies[product.productId]?.rows.length" class="secondary-text">暂无占用或其他受限库存</span>
                                        </template>
                                    </td>
                                    <td>
                                        <textarea
                                            v-model="product.remark"
                                            class="item-remark"
                                            rows="2"
                                            maxlength="1000"
                                            :disabled="readonly || saving"
                                            :aria-label="`${product.productCode}备注`"
                                        />
                                    </td>
                                </tr>
                                <tr v-if="product.boms.length && expandedProducts[product.id]" class="bom-container-row">
                                    <td colspan="12" class="bom-container-cell">
                                        <section class="bom-section" :aria-label="`${product.model} BOM 复核`">
                                            <div class="bom-toolbar">
                                                <strong>{{ activeBom(product)?.name || "请选择 BOM" }}</strong>
                                                <span v-if="activeBom(product)?.enabled" class="enabled-tag">已启用</span>
                                                <button v-if="!readonly && enabledBoms(product).length > 1" class="text-button" type="button" :disabled="saving" @click="bomSelectors[product.id] = !bomSelectors[product.id]">更换 BOM</button>
                                                <select
                                                    v-if="bomSelectors[product.id] && !readonly"
                                                    v-model="product.activeBomId"
                                                    class="bom-select"
                                                    :disabled="saving"
                                                    :aria-label="`选择${product.model}已启用的 BOM`"
                                                    @change="clearError(product.id)"
                                                >
                                                    <option disabled value="">请选择已启用的 BOM</option>
                                                    <option v-for="bom in enabledBoms(product)" :key="bom.id" :value="bom.id">{{ bom.name }}</option>
                                                </select>
                                                <span v-if="errors[product.id]?.bom" class="field-error">{{ errors[product.id]?.bom }}</span>
                                            </div>
                                            <table v-if="activeBom(product)" class="review-table material-table">
                                                <colgroup>
                                                    <col style="width: 108px"><col style="width: 160px"><col style="width: 88px">
                                                    <col style="width: 100px"><col style="width: 60px"><col style="width: 90px">
                                                    <col style="width: 100px"><col style="width: 70px">
                                                    <col style="width: 126px"><col style="width: 130px"><col style="width: 260px"><col style="width: 200px">
                                                </colgroup>
                                                <thead>
                                                    <tr>
                                                        <th>物料编号</th><th>物料名称 / 来源</th><th>物料图片</th><th class="center">销售需求量</th>
                                                        <th class="center">单位</th><th class="center" title="仓库复核实盘合计减去各库位锁定数量合计">可用数量</th>
                                                        <th class="center">库存总量</th><th class="center">缺口</th><th>复核仓库数量</th>
                                                        <th>BOM 结构</th><th>当前占用订单 / 数量</th><th>备注</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr v-for="row in visibleMaterials[product.id]" :key="row.key">
                                                        <td>
                                                            <div :style="{ paddingLeft: `${row.depth * 16}px` }">
                                                                <span>{{ row.material.productCode }}</span>
                                                                <button
                                                                    v-if="row.material.children?.length"
                                                                    class="text-button material-toggle"
                                                                    type="button"
                                                                    :aria-expanded="!!expandedMaterials[row.key]"
                                                                    @click="expandedMaterials[row.key] = !expandedMaterials[row.key]"
                                                                >{{ expandedMaterials[row.key] ? "收起下一级 BOM" : "展开下一级 BOM" }}</button>
                                                                <span v-else class="secondary-text block-text">末级物料</span>
                                                            </div>
                                                        </td>
                                                        <td>
                                                            {{ row.material.model }}
                                                            <span class="secondary-text block-text">{{ row.material.source }}</span>
                                                            <span v-if="row.material.issue" class="field-error">{{ row.material.issue }}</span>
                                                        </td>
                                                        <td>
                                                            <div class="item-image material-image">
                                                                <img v-if="row.material.image" :src="resolveErpImageUrl(row.material.image)" :alt="row.material.model">
                                                                <Icon v-else name="lucide:package" aria-hidden="true" />
                                                            </div>
                                                        </td>
                                                        <td class="center">{{ row.demand }}</td>
                                                        <td class="center">{{ row.material.unit }}</td>
                                                        <td class="center" title="实盘数量减去各库位锁定数量合计；直接输入时实时预览">
                                                            {{ displayAvailableQuantity(row.material) }}
                                                        </td>
                                                        <td class="center" title="填写实盘数量后实时更新；未填写时显示原库存总量">{{ displayMaterialTotal(row.material) }}</td>
                                                        <td class="center" title="销售需求量减实盘可用数量，小于 0 时显示 0；直接输入时实时预览">{{ displayShortageQuantity(row.material, row.demand) }}</td>
                                                        <td>
                                                            <input
                                                                class="quantity-input"
                                                                type="number"
                                                                min="0"
                                                                step="0.001"
                                                                :value="materialQuantityValue(row.material)"
                                                                :disabled="readonly || saving"
                                                                :aria-label="`${row.material.productCode}复核仓库数量`"
                                                                :aria-invalid="!!(materialQuantityError(row.material) || errors[row.key]?.quantity)"
                                                                @input="updateMaterialQuantity(row.material, $event)"
                                                            >
                                                            <button v-if="!readonly || row.material.positions?.length" class="text-button material-toggle" type="button" :disabled="saving" @click="positionItem = row.material">{{ readonly ? "查看库位" : row.material.positions?.length ? "按库位核对" : "确认零库存" }}</button>
                                                            <span v-if="materialQuantityError(row.material) || errors[row.key]?.quantity" class="field-error">{{ materialQuantityError(row.material) || errors[row.key]?.quantity }}</span>
                                                        </td>
                                                        <td>单套 {{ row.material.quantityPerSet }}</td>
                                                        <td>
                                                            <span v-if="!row.material.productId" class="secondary-text">--</span>
                                                            <span v-else-if="!stockOccupancies[row.material.productId] || stockOccupancies[row.material.productId]?.loading" class="secondary-text" role="status">正在查询占用...</span>
                                                            <div v-else-if="stockOccupancies[row.material.productId]?.error" role="alert">
                                                                <span class="field-error">{{ stockOccupancies[row.material.productId]?.error }}</span>
                                                                <button class="text-button" type="button" @click="loadStockOccupancy(row.material.productId, true)">重试</button>
                                                            </div>
                                                            <template v-else>
                                                                <div v-for="occupancy in stockOccupancies[row.material.productId]?.rows" :key="occupancy.key" class="stock-occupancy">
                                                                    <span>{{ occupancy.label }}</span>
                                                                    <strong>{{ occupancy.quantity }} {{ stockOccupancies[row.material.productId]?.unit || row.material.unit }}</strong>
                                                                </div>
                                                                <span v-if="!stockOccupancies[row.material.productId]?.rows.length" class="secondary-text">暂无占用或其他受限库存</span>
                                                            </template>
                                                        </td>
                                                        <td>
                                                            <textarea
                                                                v-model="row.material.remark"
                                                                class="item-remark"
                                                                rows="2"
                                                                maxlength="1000"
                                                                :disabled="readonly || saving"
                                                                :aria-label="`${row.material.productCode}备注`"
                                                            />
                                                        </td>
                                                    </tr>
                                                    <tr v-if="visibleMaterials[product.id]?.length === 0"><td colspan="12" class="empty-cell">当前 BOM 暂无物料</td></tr>
                                                </tbody>
                                            </table>
                                        </section>
                                    </td>
                                </tr>
                            </template>
                        </tbody>
                    </table>
                </div>

                <label class="remark-field">
                    <span>复核备注</span>
                    <textarea v-model="draft.remark" rows="2" maxlength="2000" :disabled="readonly || saving" aria-label="复核备注" />
                </label>
                <p class="review-tip reset-tip">草稿和复核结果保存至系统；已完成的复核结果仅可查看。</p>
                <p v-if="draft.reviewedAt" class="review-tip">复核人：{{ draft.reviewedBy || "--" }}　复核时间：{{ formatLocalDateTime(draft.reviewedAt, true) }}</p>
                <p v-if="draft.result" class="review-tip">
                    处理结果：
                    <span v-if="draft.result.route !== 'purchase'">已同步生产管理</span>
                    <span v-else-if="draft.result.purchaseRequestId || draft.result.purchaseRequestNo">已提交采购申请 {{ draft.result.purchaseRequestNo || '' }}</span>
                    <span v-else>存在缺料，采购申请由生产经理手动发起</span>
                </p>

                <template #footer>
                    <span v-if="saving" class="review-tip" role="status">正在保存复核记录...</span>
                    <button class="footer-button" type="button" :disabled="saving" @click="requestClose">关闭</button>
                    <template v-if="!readonly">
                        <button class="footer-button" type="button" :disabled="saving" @click="submit(false)">保存草稿</button>
                        <button class="footer-button primary" type="button" :disabled="saving" @click="submit(true)">完成复核</button>
                    </template>
                </template>
            </ErpDialogFrame>
            <InventoryReviewPositionsDialog v-if="positionItem" :item="positionItem" :readonly="readonly" @close="positionItem = null" @save="savePositions" />
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import { ElMessage } from "element-plus";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import InventoryReviewPositionsDialog from "./InventoryReviewPositionsDialog.vue";
import { formatLocalDateTime } from "~/utils/time";
import { retrieveInventoryStockRestrictions } from "~/composables/api/useInventoryApi";
import type { InventoryReviewMaterial, InventoryReviewOrder, InventoryReviewProduct } from "~/types/inventoryReview";
import type { InventoryReviewStockPosition } from "~~/shared/types/inventoryReview";
import type { InventoryStockRestriction, InventoryStockRestrictionReason } from "~~/shared/types/inventory";

const props = withDefaults(defineProps<{
    order: InventoryReviewOrder;
    readonly?: boolean;
    saving?: boolean;
    submissionError?: string;
}>(), { readonly: false, saving: false, submissionError: "" });

const emit = defineEmits<{
    close: [];
    save: [order: InventoryReviewOrder];
    complete: [order: InventoryReviewOrder];
}>();

type ReviewItem = InventoryReviewProduct | InventoryReviewMaterial;
interface ReviewError { quantity?: string; bom?: string; }
interface MaterialRow { key: string; material: InventoryReviewMaterial; depth: number; demand: number; }
interface MaterialQuantityInput { value: string; quantity: number | null; error: string; }
interface StockOccupancyRow { key: string; label: string; quantity: number; }
interface StockOccupancyState { loading: boolean; error: string; rows: StockOccupancyRow[]; unit: string; }

const draft = reactive<InventoryReviewOrder>(JSON.parse(JSON.stringify(props.order)));
const expandedProducts = reactive<Record<string, boolean>>({});
const expandedMaterials = reactive<Record<string, boolean>>({});
const bomSelectors = reactive<Record<string, boolean>>({});
const errors = reactive<Record<string, ReviewError>>({});
const materialQuantityInputs = reactive<Record<string, MaterialQuantityInput>>({});
const positionItem = ref<ReviewItem | null>(null);
const maskRef = ref<HTMLElement | null>(null);
const stockOccupancies = reactive<Record<string, StockOccupancyState>>({});
let previousFocus: HTMLElement | null = null;
let occupancyDisposed = false;

const restrictionLabels: Record<InventoryStockRestrictionReason, string> = {
    "order-finished-product": "订单留货",
    "order-production-material": "订单生产用料",
    "warehouse-excluded": "仓库未计入可用库存",
    "other-order": "其他订单占用（无查看权限）",
    "other-lock": "其他锁定／暂无对应订单记录",
    "inconsistent-lock": "记录不一致，暂无法准确拆分",
};

for (const product of draft.products) {
    expandedProducts[product.id] = true;
}

function activeBom(product: InventoryReviewProduct) {
    return product.boms.find((bom) => bom.id === product.activeBomId);
}

function enabledBoms(product: InventoryReviewProduct) {
    return product.boms.filter((bom) => bom.enabled);
}

const visibleMaterials = computed(() => {
    const rowsByProduct: Record<string, MaterialRow[]> = {};
    for (const product of draft.products) {
        const rows: MaterialRow[] = [];
        function append(materials: InventoryReviewMaterial[], parentKey: string, depth: number, multiplier: number) {
            for (const material of materials) {
                const key = `${parentKey}/${material.id}`;
                const demand = Number((multiplier * material.quantityPerSet).toFixed(8));
                rows.push({ key, material, depth, demand });
                if (material.children?.length && expandedMaterials[key]) {
                    append(material.children, key, depth + 1, demand);
                }
            }
        }
        const bom = activeBom(product);
        if (bom) {
            append(bom.materials, `${product.id}/${bom.id}`, 0, product.salesQuantity);
        }
        rowsByProduct[product.id] = rows;
    }
    return rowsByProduct;
});

const visibleStockProductIds = computed(() => {
    const productIds = new Set<string>();
    for (const product of draft.products) {
        if (product.productId) productIds.add(product.productId);
        if (!expandedProducts[product.id]) continue;
        for (const row of visibleMaterials.value[product.id] || []) {
            if (row.material.productId) productIds.add(row.material.productId);
        }
    }
    return [...productIds];
});

function groupStockOccupancies(restrictions: InventoryStockRestriction[]) {
    const groups = new Map<string, StockOccupancyRow>();
    for (const restriction of restrictions) {
        if (restriction.quantity <= 0) continue;
        // 同一订单的成品、生产用料和不同库位合并；无权订单只使用接口返回的脱敏原因。
        const key = restriction.salesOrderNo ? `order:${restriction.salesOrderNo}` : `reason:${restriction.reason}`;
        const current = groups.get(key);
        if (current) {
            current.quantity = Number((current.quantity + restriction.quantity).toFixed(3));
        } else {
            groups.set(key, {
                key,
                label: restriction.salesOrderNo || restrictionLabels[restriction.reason],
                quantity: Number(restriction.quantity.toFixed(3)),
            });
        }
    }
    return [...groups.values()];
}

async function loadStockOccupancy(productId?: string, retry = false) {
    if (!productId || occupancyDisposed) return;
    const current = stockOccupancies[productId];
    if (current && (!retry || current.loading)) return;
    stockOccupancies[productId] = { loading: true, error: "", rows: [], unit: "" };
    try {
        const response = await retrieveInventoryStockRestrictions({ productId });
        if (occupancyDisposed) return;
        if (response.code !== 200 || !response.data) throw new Error(response.msg || "获取当前库存占用失败");
        stockOccupancies[productId] = {
            loading: false,
            error: "",
            rows: groupStockOccupancies(response.data.list),
            unit: response.data.unitName,
        };
    } catch (error: any) {
        if (occupancyDisposed) return;
        stockOccupancies[productId] = {
            loading: false,
            error: error?.data?.msg || error?.message || "获取当前库存占用失败",
            rows: [],
            unit: "",
        };
    }
}

function clearError(key: string) {
    delete errors[key];
}

function materialQuantityValue(item: InventoryReviewMaterial) {
    return materialQuantityInputs[item.productId || item.id]?.value ?? item.checkedQuantity;
}

function materialQuantityError(item: ReviewItem) {
    return materialQuantityInputs[item.productId || item.id]?.error || "";
}

function displayMaterialTotal(item: InventoryReviewMaterial) {
    const input = materialQuantityInputs[item.productId || item.id];
    if (input) return input.quantity ?? "--";
    return validQuantity(item.checkedQuantity) ? item.checkedQuantity : item.totalQuantity ?? item.stockQuantity;
}

function updateMaterialQuantity(item: InventoryReviewMaterial, event: Event) {
    if (props.readonly || props.saving) return;
    const productId = item.productId || item.id;
    const value = (event.target as HTMLInputElement).value;
    const quantity = value.trim() === "" ? null : Number(value);
    if (!validQuantity(quantity)) {
        materialQuantityInputs[productId] = { value, quantity: null, error: "请输入有效的非负实盘数量" };
        return;
    }
    if (Number(quantity.toFixed(3)) !== quantity) {
        materialQuantityInputs[productId] = { value, quantity: null, error: "实盘数量最多支持 3 位小数" };
        return;
    }
    const positions = item.positions || [];
    if (positions.length === 1 || (Array.isArray(item.positions) && positions.length === 0 && quantity === 0)) {
        applyPositionQuantities(productId, positions.map((position) => ({ ...position, checkedQuantity: quantity })));
        delete materialQuantityInputs[productId];
        return;
    }
    materialQuantityInputs[productId] = {
        value,
        quantity,
        error: positions.length
            ? "请按库位核对，实盘合计须与输入总数一致"
            : "请先维护产品的真实仓库和库位，重新打开复核后填写实盘数量",
    };
}

function displayAvailableQuantity(item: ReviewItem) {
    const input = materialQuantityInputs[item.productId || item.id];
    const quantity = input ? input.quantity : item.checkedQuantity;
    if (!validQuantity(quantity) || !item.positions) return "--";
    let lockedQuantity = 0;
    for (const position of item.positions) {
        if (!input && !validQuantity(position.checkedQuantity)) return "--";
        lockedQuantity += position.lockedQuantity;
    }
    return Number((quantity - lockedQuantity).toFixed(3));
}

function displayShortageQuantity(item: ReviewItem, demand: number) {
    const availableQuantity = displayAvailableQuantity(item);
    if (typeof availableQuantity !== "number") return "--";
    return Math.max(0, Number((demand - availableQuantity).toFixed(3)));
}

function allReviewItems() {
    const items: ReviewItem[] = [];
    function append(materials: InventoryReviewMaterial[]) {
        for (const material of materials) { items.push(material); append(material.children || []); }
    }
    for (const product of draft.products) {
        items.push(product);
        append(activeBom(product)?.materials || []);
    }
    return items;
}

function applyPositionQuantities(productId: string, positions: InventoryReviewStockPosition[]) {
    const checked = new Map(positions.map((position) => [position.id, position.checkedQuantity]));
    for (const item of allReviewItems()) {
        if ((item.productId || item.id) !== productId) continue;
        for (const position of item.positions || []) position.checkedQuantity = checked.get(position.id) ?? null;
        item.checkedQuantity = (item.positions || []).every((position) => validQuantity(position.checkedQuantity))
            ? Number((item.positions || []).reduce((sum, position) => sum + Number(position.checkedQuantity || 0), 0).toFixed(3))
            : null;
    }
    for (const key of Object.keys(errors)) delete errors[key];
}

function savePositions(positions: InventoryReviewStockPosition[]) {
    if (!positionItem.value || props.readonly || props.saving) return;
    const productId = positionItem.value.productId || positionItem.value.id;
    const input = materialQuantityInputs[productId];
    if (input) {
        if (!positions.length && input.quantity !== null && input.quantity > 0) {
            ElMessage.warning(input.error);
            return;
        }
        let total = 0;
        for (const position of positions) {
            if (!validQuantity(position.checkedQuantity)) {
                ElMessage.warning("请逐库位填写实盘数量，使合计与输入总数一致");
                return;
            }
            total += position.checkedQuantity;
        }
        if (input.quantity !== null && Number(total.toFixed(3)) !== input.quantity) {
            ElMessage.warning("各库位实盘合计与输入的复核仓库数量不一致，请核对");
            return;
        }
    }
    applyPositionQuantities(productId, positions);
    delete materialQuantityInputs[productId];
    positionItem.value = null;
}

function validQuantity(value: number | null): value is number {
    return value !== null && Number.isFinite(value) && value >= 0;
}

function validateItem(item: ReviewItem, key: string, complete: boolean) {
    const error: ReviewError = {};
    if (complete && item.issue) error.quantity = item.issue;
    if (item.checkedQuantity === null) {
        if (complete) error.quantity = "请填写复核数量";
    } else if (!validQuantity(item.checkedQuantity)) {
        error.quantity = "请输入有效的非负数量";
    }
    if (complete && item.positions?.some((position) => !validQuantity(position.checkedQuantity))) error.quantity = "请逐库位核对全部库存";
    const inputError = materialQuantityError(item);
    if (inputError) error.quantity = inputError;
    if (error.quantity) {
        errors[key] = error;
        return false;
    }
    return true;
}

function validateMaterials(materials: InventoryReviewMaterial[], parentKey: string, productId: string, ancestors: string[], complete: boolean) {
    for (const material of materials) {
        const key = `${parentKey}/${material.id}`;
        if (!validateItem(material, key, complete)) {
            expandedProducts[productId] = true;
            for (const ancestor of ancestors) expandedMaterials[ancestor] = true;
        }
        if (material.children?.length) {
            validateMaterials(material.children, key, productId, [...ancestors, key], complete);
        }
    }
}

function submit(complete: boolean) {
    if (props.readonly || props.saving) return;
    for (const key of Object.keys(errors)) delete errors[key];
    if (!draft.approved) {
        ElMessage.warning("仅审批通过的订单可以进行仓库复核");
        return;
    }
    for (const product of draft.products) {
        validateItem(product, product.id, complete);
        if (!product.boms.length) continue;
        const bom = activeBom(product);
        if (!bom?.enabled) {
            errors[product.id] = { ...errors[product.id], bom: "请选择已启用的 BOM" };
            expandedProducts[product.id] = true;
            continue;
        }
        validateMaterials(bom.materials, `${product.id}/${bom.id}`, product.id, [], complete);
    }
    if (Object.keys(errors).length) {
        ElMessage.warning("请检查复核数量和 BOM 后再提交");
        return;
    }
    const result: InventoryReviewOrder = JSON.parse(JSON.stringify(draft));
    if (complete) emit("complete", result);
    else emit("save", result);
}

function requestClose() {
    if (positionItem.value) { positionItem.value = null; return; }
    if (!props.saving) emit("close");
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
    }
    if (event.key !== "Tab" || !maskRef.value) return;
    const controls = Array.from(maskRef.value.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex='0']"));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

onMounted(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    maskRef.value?.querySelector<HTMLElement>("button")?.focus();
    watch(visibleStockProductIds, (productIds) => {
        for (const productId of productIds) void loadStockOccupancy(productId);
    }, { immediate: true });
});

onBeforeUnmount(() => {
    occupancyDisposed = true;
    previousFocus?.focus();
});
</script>

<style scoped>
.review-dialog-mask {
    position: fixed;
    inset: 0;
    z-index: 2200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    background: rgb(0 0 0 / 38%);
}

.review-dialog {
    max-width: min(1560px, calc(100vw - 48px));
    max-height: calc(100vh - 24px);
    grid-template-rows: 58px minmax(0, 1fr) 60px;
    color: var(--erp-color-text-primary, #303133);
    font-size: 13px;
}

.review-dialog :deep(.erp-dialog-frame__header) {
    padding: 0 20px;
    background: #f5f7fa;
}

.review-dialog :deep(.erp-dialog-frame__title) {
    font-size: 16px;
}

.review-dialog :deep(.erp-dialog-frame__body) {
    display: block;
    padding: 24px 20px 16px;
    overflow: auto;
    overscroll-behavior: contain;
}

.review-dialog :deep(.erp-dialog-frame__actions) {
    gap: 10px;
    padding: 12px 20px;
}

.review-tip {
    margin: 4px 0 12px;
    color: #82868b;
    font-size: 12px;
    line-height: 1.6;
}

.table-scroll { overflow-x: auto; }
.review-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 12px; }
/* 父子表保持相同列宽，BOM 子表不再独立撑出父表。 */
.product-table { min-width: 1492px; }
.material-table { min-width: 0; }
.review-table th { padding: 7px 6px; color: #60666c; background: var(--erp-color-fill-table-header, #e7eef5); font-weight: 600; text-align: left; }
.review-table td { padding: 7px 6px; border-bottom: 1px solid #edf0f4; vertical-align: middle; overflow-wrap: anywhere; }
.review-table .center { text-align: center; }
.review-table .bom-container-cell { padding: 0; }
.bom-section { padding: 8px 0; background: var(--erp-color-fill-table-child, #f7f9fb); }
.bom-toolbar { min-height: 34px; display: flex; align-items: center; flex-wrap: wrap; gap: 14px; margin-bottom: 2px; padding: 0 8px; }
.bom-toolbar strong { font-weight: 600; }
.enabled-tag { padding: 3px 8px; border-radius: 2px; color: #15935d; background: #edf8f0; }
.text-button { padding: 0; border: 0; background: transparent; color: #2ca3f5; font: inherit; cursor: pointer; white-space: nowrap; }
.text-button:hover { color: #1686d2; }
.material-toggle { display: block; margin-top: 7px; }
.block-text { display: block; margin-top: 4px; }
.secondary-text { color: #82868b; }
.stock-occupancy { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 3px 0; line-height: 1.5; }
.stock-occupancy > span { min-width: 0; overflow-wrap: anywhere; }
.stock-occupancy strong { flex-shrink: 0; font-weight: 500; white-space: nowrap; }
.field-error { color: #df625c; }
.field-error { display: block; margin-top: 4px; line-height: 1.5; font-size: 12px; }
.quantity-input, .bom-select, .item-remark, .remark-field textarea { box-sizing: border-box; border: 1px solid #c5cdd6; border-radius: 3px; background: white; color: inherit; font: inherit; }
.quantity-input, .bom-select { height: 29px; padding: 3px 5px; }
.quantity-input { width: 82px; }
.bom-select { min-width: 150px; }
.quantity-input:focus, .bom-select:focus, .item-remark:focus, .remark-field textarea:focus { outline: 1px solid #2ca3f5; border-color: #2ca3f5; }
[aria-invalid="true"] { border-color: #df625c; }
input:disabled, textarea:disabled { background: #f3f5f7; color: #60666c; cursor: default; }
.item-image { width: 39px; height: 29px; display: flex; align-items: center; justify-content: center; border: 1px solid #e1e6ec; border-radius: 3px; color: #ca6a91; background: #f9ebf1; }
.material-image { color: #47a882; background: #eaf7ef; }
.item-image img { max-width: 100%; max-height: 100%; object-fit: contain; }
.item-image :deep(svg) { width: 22px; height: 22px; }
.item-remark { width: 100%; min-height: 54px; padding: 6px; resize: vertical; line-height: 1.5; }
.remark-field { display: grid; gap: 8px; margin-top: 10px; }
.remark-field textarea { width: 100%; min-height: 54px; padding: 7px; resize: vertical; line-height: 1.6; }
.reset-tip { margin: 6px 0 0; }
.footer-button { height: 35px; padding: 0 12px; border: 1px solid #c5cdd6; border-radius: 4px; background: white; color: #303133; font: inherit; cursor: pointer; }
.footer-button:hover { border-color: #2ca3f5; color: #2ca3f5; }
.footer-button.primary { border-color: #2ca3f5; color: white; background: #2ca3f5; font-weight: 600; }
.footer-button.primary:hover { background: #168fe0; }
.footer-button:disabled { opacity: 0.6; cursor: wait; }
.empty-cell { padding: 20px !important; text-align: center; color: #82868b; }

@supports (height: 100dvh) {
    .review-dialog { max-height: calc(100dvh - 24px); }
}

@media (max-width: 680px) {
    .review-dialog { max-width: calc(100vw - 24px); width: calc(100vw - 24px) !important; }
    .review-dialog :deep(.erp-dialog-frame__body) { padding: 16px 12px; }
    .review-dialog :deep(.erp-dialog-frame__header), .review-dialog :deep(.erp-dialog-frame__actions) { padding-right: 12px; padding-left: 12px; }
}
</style>
