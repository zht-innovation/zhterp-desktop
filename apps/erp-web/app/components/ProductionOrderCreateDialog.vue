<template>
            <div class="dialog-backdrop create-backdrop erp-selectable" @click.self="closeDialog">
                <section class="create-dialog" role="dialog" aria-modal="true" aria-label="新建关联生产单">
                    <header><h2>新建生产单</h2><button type="button" aria-label="关闭新建生产单" :disabled="submitting || workshopSaving" @click="closeDialog"><Icon name="lucide:x" /></button></header>
                    <form @submit.prevent="submitCreate">
                        <div class="create-body">
                            <fieldset class="create-section"><legend>生产用途</legend>
                                <div class="create-grid"><label>生产用途 <span class="required">*</span><select v-model="createForm.purpose" :disabled="submitting" @change="selectPurpose"><option value="order">订单生产</option><option value="stock">备货生产（无关联订单）</option></select></label></div>
                                <p class="create-hint">{{ createForm.purpose === 'order' ? '订单生产入库归属来源订单。' : '备货生产不关联销售订单，入库进入公共库存。' }}</p>
                            </fieldset>

                            <fieldset v-if="createForm.purpose === 'order'" class="create-section"><legend>来源订单</legend>
                                <div class="candidate-search"><input v-model="candidateKeyword" maxlength="80" aria-label="搜索已审核销售订单" placeholder="搜索订单号、产品名称或编号" :disabled="submitting" @keydown.enter.prevent.stop="searchCandidateOrders" /><button type="button" :disabled="submitting" @click="searchCandidateOrders">搜索</button></div>
                                <div class="create-grid">
                                    <label>销售订单 <span class="required">*</span><select v-model="createForm.orderId" :disabled="submitting || (candidateLoading && candidatePage === 0)" @change="selectCreateOrder"><option value="">请选择销售订单</option><option v-for="order in candidateOrders" :key="order.salesOrderId" :value="order.salesOrderId">{{ order.id }} · {{ order.status }}</option></select></label>
                                    <label>销售员<input :value="createSourceOrder?.salesperson || ''" readonly /></label>
                                    <label>订单交期<input :value="createSourceOrder?.dueDate || ''" readonly /></label>
                                </div>
                                <div class="candidate-options"><span v-if="candidateLoading || initialOrderLoading">正在加载已审核销售订单…</span><span v-else-if="candidatePage > 0 && !candidateError">共 {{ candidateTotal }} 个已审核订单</span><button v-if="hasMoreCandidates" type="button" :disabled="candidateLoading || submitting" @click="loadCandidateOrders(candidatePage + 1)">加载更多</button></div>
                                <p v-if="candidateError" class="create-error" role="alert">{{ candidateError }} <button type="button" :disabled="candidateLoading || submitting" @click="loadCandidateOrders(candidateRequestPage)">重试</button></p>
                                <p v-if="initialOrderError" class="create-error" role="alert">{{ initialOrderError }} <button type="button" :disabled="initialOrderLoading || submitting" @click="validateInitialOrder">重试核对</button></p>
                                <p v-if="candidateNotice" class="create-hint" role="status">{{ candidateNotice }}</p>
                                <p v-if="createSourceOrder && !createSourceOrder.canCreate" class="create-error" role="status">{{ createSourceOrder.createBlockReason || '该订单当前不能新建生产单。' }}</p>
                                <p v-if="!candidateLoading && !initialOrderLoading && !candidateError && !initialOrderError && candidateOrders.length === 0" class="create-hint" role="status">{{ appliedCandidateKeyword ? '暂无匹配的已审核销售订单' : '暂无已审核销售订单' }}</p>
                            </fieldset>

                            <details v-if="createForm.purpose === 'order'" class="create-requirements"><summary>订单要求</summary><div class="create-grid">
                                <label>非标要求<textarea :value="createSourceOrder?.requirements?.custom || '未填写'" readonly rows="2" /></label>
                                <label>安装要求<textarea :value="createSourceOrder?.requirements?.installation || '未填写'" readonly rows="2" /></label>
                                <label>测试要求<textarea :value="createSourceOrder?.requirements?.testing || '未填写'" readonly rows="2" /></label>
                                <label class="order-remark-field">订单备注<textarea :value="createSourceOrder?.orderRemark || '未填写'" readonly rows="2" /></label>
                                <label>附件 / 订单图片<input value="暂无附件" readonly /></label>
                            </div></details>

                            <fieldset class="create-section"><legend>{{ createForm.purpose === 'order' ? '选择生产产品' : '选择备货产品' }}</legend>
                                <p v-if="hasLegacyPlanning" class="create-error">部分产品存在未关联的历史生产入库，对应产品暂不能新建生产单，请先核对来源记录。</p>
                                <template v-if="createForm.purpose === 'order'">
                                    <p class="create-hint">在产品行内逐级展开；已展开 {{ expandedBomProducts.length }} 项，不同产品的 BOM 深度互不影响。</p>
                                    <div class="create-table-scroll"><table class="create-product-table"><thead><tr><th>选择</th><th>生产产品 / 产品编号</th><th>需求数量</th><th>可用库存</th><th>有效已下达</th><th>待下达</th><th>单位</th></tr></thead><tbody>
                                        <template v-for="product in createSourceOrder?.products || []" :key="product.code">
                                            <tr><td><input v-model="createForm.productCode" type="radio" name="production-product" :value="product.productId" :disabled="!createSourceOrder?.canCreate || remainingQuantity(product) === 0 || !product.bomVersion" @change="selectCreateProduct" /></td><td class="create-product-name"><strong>{{ product.name }}</strong><small>{{ product.code }} · {{ product.unit }}</small><button v-if="childComponents(product.productId).length" type="button" @click="toggleBom(product.productId)">{{ expandedBomProducts.includes(product.productId) ? '收起下一级 BOM' : '展开下一级 BOM' }}</button><span v-else class="product-meta">{{ product.material }} · {{ product.category }}</span></td><td>{{ product.quantity }}</td><td>{{ product.locked + product.received }}</td><td>{{ product.released }}</td><td>{{ remainingQuantity(product) }}</td><td>{{ product.unit }}</td></tr>
                                            <tr v-for="component in expandedBomProducts.includes(product.productId) ? childComponents(product.productId) : []" :key="`${component.parentProductId}:${component.productId}`" class="component-row"><td><input v-model="createForm.productCode" type="radio" name="production-product" :value="`${component.parentProductId}:${component.productId}`" :disabled="!createSourceOrder?.canCreate || remainingQuantity(component) === 0 || !component.bomVersion" @change="selectCreateProduct" /></td><td class="create-product-name"><strong>└ {{ component.name }}</strong><small>{{ component.code }} · {{ component.unit }}</small><span class="product-meta">{{ component.material }} · {{ component.category }}</span></td><td>{{ component.quantity }}</td><td>{{ component.locked }}</td><td>{{ component.released }}</td><td>{{ remainingQuantity(component) }}</td><td>{{ component.unit }}</td></tr>
                                        </template>
                                    </tbody></table></div>
                                </template>
                                <div v-else class="create-grid"><label>产品 / 部件 <span class="required">*</span><select v-model="createForm.productCode" @change="selectCreateProduct"><option value="">请选择产品</option><option v-for="product in stockProducts.filter((item) => item.bomVersion)" :key="product.productId" :value="product.productId">{{ product.name }} · {{ product.code }}</option></select></label><p class="create-hint">备货生产数量自主填写，使用公共可用库存，不占用订单锁定库存。</p></div>
                            </fieldset>

                            <fieldset class="create-section"><legend>生产计划</legend>
                                <div class="create-grid">
                                    <label>生产单编号<input value="保存时自动生成" readonly /></label>
                                    <label>生产数量 <span class="required">*</span><input v-model.number="createForm.quantity" type="number" min="1" :max="createForm.purpose === 'order' && selectedCreateProduct ? remainingQuantity(selectedCreateProduct) : undefined" required /><small v-if="createForm.purpose === 'order'">{{ selectedCreateProduct ? `最多 ${remainingQuantity(selectedCreateProduct)} ${selectedCreateProduct.unit}` : '请选择有待下达数量的生产产品' }}</small></label>
                                    <label>BOM 版本<input :value="selectedCreateProduct?.bomVersion || ''" readonly /></label>
                                    <label>计划开始 <span class="required">*</span><input v-model="createForm.startDate" type="date" required /></label>
                                    <label>计划完成 <span class="required">*</span><input v-model="createForm.finishDate" type="date" required /></label>
                                    <label>生产预警<select v-model.number="createForm.warningDays" :disabled="submitting"><option :value="3">交期前 3 天</option><option :value="5">交期前 5 天</option></select><small>以计划完成日期为交期，下达后到期发送预警。</small></label>
                                    <label>车间 <span class="required">*</span>
                                        <span class="field-with-action"><select v-model="createForm.workshop" required :disabled="workshopsLoading || workshopSaving || submitting"><option value="">{{ workshopsLoading ? '正在加载车间…' : '请选择车间' }}</option><option v-for="workshop in workshops" :key="workshop" :value="workshop">{{ workshop }}</option></select><button type="button" :disabled="workshopsLoading || workshopSaving || submitting" @click="addWorkshop">新增</button></span>
                                        <p v-if="workshopLoadError" class="create-error" role="alert">{{ workshopLoadError }} <button type="button" :disabled="workshopsLoading || workshopSaving || submitting" @click="loadWorkshops">重试</button></p>
                                    </label>
                                    <label v-if="showWorkshopInput" class="workshop-add-field">新车间名称
                                        <span class="field-with-action"><input v-model.trim="newWorkshopName" maxlength="40" placeholder="填写车间名称" :disabled="workshopsLoading || workshopSaving || submitting" @keydown.enter.prevent.stop="saveWorkshop" /><button type="button" :disabled="workshopsLoading || workshopSaving || submitting" @click="saveWorkshop">{{ workshopSaving ? '保存中…' : '确认' }}</button></span>
                                        <p v-if="workshopSaveError" class="create-error" role="alert">{{ workshopSaveError }}</p>
                                    </label>
<!--                                    <label>负责人 <span class="required">*</span><input v-model.trim="createForm.owner" maxlength="40" required /></label>-->
                                    <label>优先级<select v-model="createForm.priority"><option>普通</option><option>紧急</option></select></label>
                                    <label>生产备注<textarea v-model.trim="createForm.remark" rows="2" maxlength="300" placeholder="填写批次或生产注意事项" /></label>
                                    <label>机器号<textarea v-model.trim="createForm.machineNumbers" rows="2" placeholder="每行一个，或连续号段，如 JQ001-JQ010（选填）" /><small>支持连续号段自动展开；下达后同步至订单。</small></label>
                                </div>
                                <div class="material-preview">{{ selectedCreateProduct ? '下一层 BOM 物料需求将在发料阶段核对；新建生产单不占用物料库存。' : '暂无待下达需求' }}</div>
                            </fieldset>
                            <p v-if="createError" class="create-error" role="alert">{{ createError }}</p>
                        </div>
                        <footer><button type="button" class="cancel-create-button" :disabled="submitting || workshopSaving" @click="closeDialog">取消</button><button type="submit" class="cancel-create-button" :disabled="!canSubmitCreate" @click="createIntent = 'draft'">保存草稿</button><button type="submit" class="submit-create-button" :disabled="!canSubmitCreate" @click="createIntent = 'release'">{{ submitting ? '提交中…' : '确认下达' }}</button></footer>
                    </form>
                </section>
            </div>
</template>

<script setup lang="ts">
import type { ProductionCandidateOrder, ProductionOverviewOrder, ProductionOverviewProduct } from "~/types/production";
import { getToken } from "~/utils/auth";

const props = defineProps<{ initialOrder?: ProductionOverviewOrder | null }>();
const emit = defineEmits<{
    close: [];
    created: [result: { documentNo: string; salesOrderId?: string; intent: "draft" | "release" }];
}>();

const candidateOrders = ref<ProductionCandidateOrder[]>([]);
const candidateKeyword = ref("");
const appliedCandidateKeyword = ref("");
const candidatePage = ref(0);
const candidateTotal = ref(0);
const candidateLoading = ref(false);
const candidateError = ref("");
const candidateNotice = ref("");
const candidateRequestPage = ref(1);
const initialOrderLoading = ref(false);
const initialOrderError = ref("");
const candidatePageSize = 20;
const hasMoreCandidates = computed(() => candidatePage.value > 0 && candidatePage.value * candidatePageSize < candidateTotal.value);
let candidateSequence = 0;
let selectionSequence = 0;
let disposed = false;
const stockProducts = ref<ProductionOverviewProduct[]>([]);
const createError = ref("");
const createIntent = ref<"draft" | "release">("release");
const createRequestKey = ref("");
const createRequestSignature = ref("");
const submitting = ref(false);
const expandedBomProducts = ref<string[]>([]);
const workshops = ref<string[]>([]);
const workshopsLoading = ref(false);
const workshopSaving = ref(false);
const workshopLoadError = ref("");
const workshopSaveError = ref("");
const showWorkshopInput = ref(false);
const newWorkshopName = ref("");
const orderDate = props.initialOrder?.id.match(/DD-(\d{4})(\d{2})(\d{2})/);
const createForm = reactive({
    purpose: "order" as "order" | "stock",
    orderId: "",
    productCode: "",
    quantity: null as number | null,
    startDate: orderDate ? `${orderDate[1]}-${orderDate[2]}-${orderDate[3]}` : new Date().toLocaleDateString("sv-SE"),
    finishDate: "",
    warningDays: 3,
    workshop: "",
    owner: "",
    priority: "普通",
    remark: "",
    machineNumbers: "",
});

const createSourceOrder = computed(() => candidateOrders.value.find((order) => order.salesOrderId === createForm.orderId));
const creationProducts = computed(() => createForm.purpose === "stock"
    ? stockProducts.value : [...(createSourceOrder.value?.products || []), ...(createSourceOrder.value?.components || [])]);
const hasLegacyPlanning = computed(() => creationProducts.value.some((product) => product.legacyReviewRequired));
const selectedCreateProduct = computed(() => creationProducts.value.find((product) =>
    (product.parentProductId ? `${product.parentProductId}:${product.productId}` : product.productId) === createForm.productCode));
const remainingQuantity = (product: ProductionOverviewProduct) => product.legacyReviewRequired ? 0 : Math.max(0, Math.floor(Number(product.remaining) || 0));
const canSubmitCreate = computed(() => {
    if (submitting.value || workshopsLoading.value || workshopSaving.value || !createForm.workshop || !selectedCreateProduct.value?.bomVersion) return false;
    if (createForm.purpose === "stock") return true;
    return !initialOrderLoading.value && createSourceOrder.value?.canCreate === true && remainingQuantity(selectedCreateProduct.value) > 0;
});
const childComponents = (productId: string) => createSourceOrder.value?.components?.filter((product) => product.parentProductId === productId) || [];
const toggleBom = (productId: string) => { expandedBomProducts.value = expandedBomProducts.value.includes(productId)
    ? expandedBomProducts.value.filter((id) => id !== productId) : [...expandedBomProducts.value, productId]; };
const selectCreateProduct = () => {
    createForm.quantity = selectedCreateProduct.value ? (createForm.purpose === "order" ? remainingQuantity(selectedCreateProduct.value) : 1) : null;
    createError.value = "";
};
const selectCreateOrder = () => {
    selectionSequence += 1;
    initialOrderLoading.value = false;
    initialOrderError.value = "";
    candidateNotice.value = "";
    createForm.productCode = "";
    createForm.quantity = null;
    createForm.finishDate = createSourceOrder.value?.dueDate || "";
    expandedBomProducts.value = [];
    createError.value = "";
};
const selectPurpose = () => {
    selectionSequence += 1;
    initialOrderLoading.value = false;
    initialOrderError.value = "";
    candidateNotice.value = "";
    createForm.productCode = "";
    createForm.quantity = null;
    createError.value = "";
    expandedBomProducts.value = [];
    if (createForm.purpose === "stock") void loadStockProducts();
};
const loadStockProducts = async () => {
    try {
        const response: any = await $fetch("/production/products/retrieve", { headers: { Token: getToken() || "" } });
        if (response?.code !== 200) throw new Error(response?.msg || "加载备货产品失败");
        stockProducts.value = (response.data || []).map((product: any) => ({ ...product, quantity: 0, locked: 0, received: 0, released: 0,
            remaining: 0, planningCoverage: 0, legacyReviewRequired: false }));
    } catch (error: any) { createError.value = error?.data?.msg || error?.message || "加载备货产品失败"; }
};
const loadCandidateOrders = async (page = 1) => {
    if (page > 1 && candidateLoading.value) return;
    const sequence = ++candidateSequence;
    candidateRequestPage.value = page;
    candidateLoading.value = true;
    candidateError.value = "";
    if (page === 1) {
        candidateOrders.value = [];
        candidatePage.value = 0;
        candidateTotal.value = 0;
        createForm.orderId = "";
        selectCreateOrder();
    }
    try {
        const response: any = await $fetch("/production/orders/retrieve", { headers: { Token: getToken() || "" }, query: { candidateOnly: true, page, limit: candidatePageSize, keyword: appliedCandidateKeyword.value } });
        if (response?.code !== 200) throw new Error(response?.msg || "加载销售订单失败");
        if (disposed || sequence !== candidateSequence) return;
        const list: ProductionCandidateOrder[] = response.data?.list || [];
        if (page === 1) candidateOrders.value = list;
        else {
            for (const order of list) {
                const index = candidateOrders.value.findIndex((item) => item.salesOrderId === order.salesOrderId);
                if (index < 0) candidateOrders.value.push(order);
                else candidateOrders.value[index] = order;
            }
        }
        candidatePage.value = page;
        candidateTotal.value = Number(response.data?.pagination?.total || 0);
    } catch (error: any) {
        if (!disposed && sequence === candidateSequence) candidateError.value = error?.data?.msg || error?.message || "加载销售订单失败";
    } finally {
        if (!disposed && sequence === candidateSequence) candidateLoading.value = false;
    }
};
const searchCandidateOrders = () => {
    if (submitting.value) return;
    appliedCandidateKeyword.value = candidateKeyword.value.trim();
    void loadCandidateOrders();
};
const validateInitialOrder = async () => {
    const salesOrderId = props.initialOrder?.salesOrderId;
    if (!salesOrderId || createForm.purpose !== "order" || createForm.orderId) return;
    const sequence = ++selectionSequence;
    initialOrderLoading.value = true;
    initialOrderError.value = "";
    try {
        const response: any = await $fetch("/production/orders/retrieve", { headers: { Token: getToken() || "" }, query: { candidateOnly: true, salesOrderId, page: 1, limit: 1 } });
        if (response?.code !== 200) throw new Error(response?.msg || "核对预选订单失败");
        if (disposed || sequence !== selectionSequence || createForm.purpose !== "order" || createForm.orderId) return;
        const order: ProductionCandidateOrder | undefined = response.data?.list?.[0];
        if (!order) {
            candidateOrders.value = candidateOrders.value.filter((item) => item.salesOrderId !== salesOrderId);
            candidateNotice.value = "预选订单未审核通过、不存在或已删除，请重新选择。";
            return;
        }
        const index = candidateOrders.value.findIndex((item) => item.salesOrderId === salesOrderId);
        if (index < 0) candidateOrders.value.unshift(order);
        else candidateOrders.value[index] = order;
        createForm.orderId = order.salesOrderId;
        selectCreateOrder();
    } catch (error: any) {
        if (!disposed && sequence === selectionSequence) initialOrderError.value = error?.data?.msg || error?.message || "核对预选订单失败，请重新选择或重试。";
    } finally {
        if (!disposed && sequence === selectionSequence) initialOrderLoading.value = false;
    }
};
onMounted(async () => {
    void loadWorkshops();
    const loading = loadCandidateOrders();
    const sequence = selectionSequence;
    await loading;
    if (!disposed && sequence === selectionSequence && !appliedCandidateKeyword.value) void validateInitialOrder();
});
onBeforeUnmount(() => { disposed = true; candidateSequence += 1; selectionSequence += 1; });
const loadWorkshops = async () => {
    if (workshopsLoading.value || workshopSaving.value || submitting.value) return;
    workshopsLoading.value = true;
    workshopLoadError.value = "";
    try {
        const response = await $fetch<{ code: number; msg?: string; data?: string[] }>("/production/orders/list", {
            headers: { Token: getToken() || "" }, query: { resource: "workshops" },
        });
        if (response?.code !== 200 || !Array.isArray(response.data)) throw new Error(response?.msg || "加载公共车间失败");
        if (!disposed) workshops.value = response.data;
    } catch (error: any) {
        if (!disposed) workshopLoadError.value = error?.data?.msg || error?.message || "加载公共车间失败";
    } finally {
        if (!disposed) workshopsLoading.value = false;
    }
};
const addWorkshop = () => {
    if (workshopsLoading.value || workshopSaving.value || submitting.value) return;
    showWorkshopInput.value = true;
    newWorkshopName.value = "";
    workshopSaveError.value = "";
};
const saveWorkshop = async () => {
    if (workshopsLoading.value || workshopSaving.value || submitting.value) return;
    const name = newWorkshopName.value.trim();
    if (!name || name.length > 40) { workshopSaveError.value = "请填写 1 至 40 个字符的车间名称。"; return; }
    workshopSaving.value = true;
    workshopSaveError.value = "";
    try {
        const response = await $fetch<{ code: number; msg?: string; data?: { name: string } }>("/production/orders/add", {
            method: "POST", headers: { Token: getToken() || "" }, body: { resource: "workshops", name },
        });
        if (response?.code !== 200 || !response.data?.name) throw new Error(response?.msg || "保存车间失败");
        if (disposed) return;
        const savedName = response.data.name;
        if (!workshops.value.includes(savedName)) {
            workshops.value.push(savedName);
            workshops.value.sort((left, right) => left.localeCompare(right, "zh-CN"));
        }
        createForm.workshop = savedName;
        newWorkshopName.value = "";
        showWorkshopInput.value = false;
        createError.value = "";
    } catch (error: any) {
        if (!disposed) workshopSaveError.value = error?.data?.msg || error?.message || "保存车间失败，请重试。";
    } finally {
        if (!disposed) workshopSaving.value = false;
    }
};
const parseMachineNumbers = (value: string) => value.split(/[\n,，;；]+/).map((part) => part.trim()).filter(Boolean).flatMap((part) => {
    const match = part.match(/^(.*?)(\d+)[-—–~～](.*?)(\d+)$/);
    if (!match) return [part];
    const [, prefix, startDigits, endPrefix, endDigits] = match;
    if (endPrefix && endPrefix !== prefix) return [part];
    const start = Number(startDigits);
    const end = Number(endDigits);
    if (end < start || end - start > 9999) return [part];
    const width = Math.max(startDigits!.length, endDigits!.length);
    return Array.from({ length: end - start + 1 }, (_, index) => `${prefix}${String(start + index).padStart(width, "0")}`);
});
const closeDialog = () => { if (!submitting.value && !workshopSaving.value) emit("close"); };
const submitCreate = async () => {
    if (!canSubmitCreate.value) return;
    const order = createSourceOrder.value;
    const product = selectedCreateProduct.value;
    const quantity = Number(createForm.quantity);
    if (!product || createForm.quantity === null || !Number.isInteger(quantity) || quantity < 1
        || (createForm.purpose === "order" && (!order || quantity > remainingQuantity(product)))) {
        createError.value = "请选择有待下达数量的产品，并填写范围内的正整数生产数量。";
        return;
    }
    if (!createForm.startDate || !createForm.finishDate || createForm.finishDate < createForm.startDate || !createForm.workshop) {
        createError.value = "请填写有效的计划日期和车间。";
        return;
    }
    if (![3, 5].includes(createForm.warningDays)) {
        createError.value = "请选择提前 3 天或 5 天预警。";
        return;
    }
    const machineNumbers = parseMachineNumbers(createForm.machineNumbers);
    const existingNumbers = new Set(order?.machineNumbers?.map((number) => number.toUpperCase()) || []);
    if (machineNumbers.length > quantity || new Set(machineNumbers.map((number) => number.toUpperCase())).size !== machineNumbers.length
        || machineNumbers.some((number) => existingNumbers.has(number.toUpperCase()))) {
        createError.value = "机器号不可重复，且数量不能超过本次生产数量。";
        return;
    }
    const payload = {
        sourceType: createForm.purpose,
        salesOrderId: createForm.purpose === "order" ? order?.salesOrderId : undefined,
        productId: product.productId,
        rootProductId: createForm.purpose === "order" ? (product.parentProductId || product.productId) : undefined,
        bomVersion: product.bomVersion,
        planQty: quantity,
        planStart: createForm.startDate,
        planFinish: createForm.finishDate,
        warningDays: createForm.warningDays,
        workshop: createForm.workshop,
        owner: createForm.owner,
        priority: createForm.priority,
        remark: createForm.remark,
        machineNumbers,
        intent: createIntent.value,
    };
    const signature = JSON.stringify(payload);
    if (signature !== createRequestSignature.value) { createRequestKey.value = crypto.randomUUID(); createRequestSignature.value = signature; }
    submitting.value = true;
    try {
        const response: any = await $fetch("/production/orders/add", {
            method: "POST", headers: { Token: getToken() || "", "Idempotency-Key": createRequestKey.value }, body: payload,
        });
        if (response?.code !== 200) throw new Error(response?.msg || "创建生产单失败");
        emit("created", { documentNo: response.data.documentNo, salesOrderId: order?.salesOrderId, intent: createIntent.value });
    } catch (error: any) { createError.value = error?.data?.msg || error?.message || "创建生产单失败"; }
    finally { submitting.value = false; }
};
</script>

<style scoped>
.dialog-backdrop { position: fixed; z-index: 2000; inset: 0; box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 16px; background: #18243a88; }
.create-backdrop { z-index: 2100; }
.create-dialog { box-sizing: border-box; width: min(1040px, 100%); max-height: 94vh; display: flex; flex-direction: column; overflow: hidden; border-radius: 8px; background: #fff; box-shadow: 0 24px 60px #0003; color: #303133; font-family: var(--erp-typography-font-family-base); }
.create-dialog header, .create-dialog footer { display: flex; align-items: center; justify-content: space-between; flex: 0 0 auto; padding: 14px 20px; border-bottom: 1px solid #e7ebf0; }.create-dialog header { background: #f5f7fa; }.create-dialog header h2 { margin: 0; font-size: 17px; }.create-dialog header button { border: 0; background: transparent; cursor: pointer; }.create-dialog header svg { width: 19px; height: 19px; }.create-dialog footer { justify-content: flex-end; gap: 10px; border-top: 1px solid #e7ebf0; border-bottom: 0; }.create-dialog form { display: flex; flex-direction: column; min-height: 0; }.create-body { padding: 20px; overflow-y: auto; }
.create-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px 20px; }.create-grid label { display: block; min-width: 0; font-size: 13px; }.create-grid label > input, .create-grid label > select, .create-grid label > textarea, .create-grid label > .field-with-action { margin-top: 6px; }.create-grid input, .create-grid select, .create-grid textarea { box-sizing: border-box; width: 100%; min-height: 36px; padding: 7px 9px; border: 1px solid #cfd5de; border-radius: 5px; background: #fff; color: #303133; font: inherit; }.create-grid input[readonly], .create-grid textarea[readonly] { background: #f5f7fa; color: #7d8490; }.create-grid label small { display: block; margin-top: 5px; color: #909399; font-size: 12px; line-height: 18px; }.required { color: #e05a54; }.create-error { margin: 12px 0 0; color: #d9363e; font-size: 12px; }
.create-section { min-width: 0; margin: 0 0 20px; padding: 16px; border: 1px solid #dfe4eb; border-radius: 4px; }.create-section legend { padding: 0 6px; color: #303133; font-size: 14px; }.create-section > .create-grid > label:only-child { grid-column: 1 / -1; }.create-hint { margin: 8px 0 0; color: #909399; font-size: 12px; line-height: 20px; }.create-section > .create-grid > .create-hint { align-self: end; }.create-requirements { margin: 0 0 20px; border-bottom: 1px solid #dfe4eb; }.create-requirements summary { padding: 6px 0 16px; color: #606266; cursor: pointer; }.create-requirements .create-grid { padding: 0 16px 18px; }
.create-requirements .order-remark-field { grid-column: 1 / -1; }
.create-table-scroll { margin-top: 10px; overflow-x: auto; }.create-product-table { width: 100%; min-width: 760px; border-collapse: collapse; text-align: left; font-size: 13px; }.create-product-table th { padding: 12px; background: #f5f7fa; color: #606266; font-size: 12px; font-weight: 500; white-space: nowrap; }.create-product-table td { padding: 14px 12px; border-bottom: 1px solid #edf0f4; color: #303133; }.create-product-table th:nth-child(2), .create-product-table td:nth-child(2) { width: 38%; }.create-product-table td:first-child { width: 70px; }.create-product-table input[type="radio"] { accent-color: #409eff; cursor: pointer; }.create-product-table input[type="radio"]:disabled { cursor: not-allowed; }.create-product-name strong, .create-product-name small, .create-product-name button, .create-product-name .product-meta { display: block; }.create-product-name strong { font-weight: 600; }.create-product-name small, .product-meta { color: #909399; font-size: 12px; line-height: 18px; }.create-product-name button { padding: 3px 0; border: 0; background: none; color: #409eff; cursor: pointer; font-size: 12px; }.component-row { background: #fbfcfe; }.material-preview { margin-top: 16px; padding: 14px 12px; background: #f5f7fa; color: #606266; font-size: 12px; }.field-with-action { display: flex; gap: 8px; }.field-with-action select, .field-with-action input { flex: 1; min-width: 0; }.field-with-action button { flex: 0 0 auto; padding: 0 12px; border: 1px solid #cfd5de; border-radius: 5px; background: #fff; color: #303133; cursor: pointer; }
.create-dialog footer button { border-radius: 5px; padding: 8px 16px; font: inherit; cursor: pointer; }.cancel-create-button { border: 1px solid #dcdfe6; background: #fff; color: #606266; }.submit-create-button { border: 1px solid #409eff; background: #409eff; color: #fff; }
.create-dialog button:disabled { opacity: .55; cursor: not-allowed; }
.candidate-search { display: flex; gap: 8px; margin-bottom: 14px; }
.candidate-search input { box-sizing: border-box; flex: 1; min-width: 0; padding: 8px 10px; border: 1px solid #cfd5de; border-radius: 5px; color: #303133; font: inherit; }
.candidate-search button, .candidate-options button, .create-error button { padding: 6px 12px; border: 1px solid #cfd5de; border-radius: 5px; background: #fff; color: #409eff; font: inherit; cursor: pointer; }
.candidate-options { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; color: #909399; font-size: 12px; }
@media (max-width: 800px) { .create-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .create-grid { grid-template-columns: 1fr; } }

</style>

