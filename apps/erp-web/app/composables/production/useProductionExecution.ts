import type {
    ExecutionCompletion, ExecutionIssueInput, ExecutionMaterial, ExecutionOrder,
    ExecutionReceipt, ExecutionReceiptLine, ExecutionRequisition, ExecutionRequisitionLine,
    ExecutionRequisitionOperation, ExecutionSnapshot, ProductionPublicMaterials, PublicMaterialAllocationInput,
} from "~~/shared/types/production-execution";
import { canExecuteProductionAction } from "~~/shared/utils/adminPermission";
import { ADMIN_ROLE } from "~~/shared/enums";
import { getToken } from "~/utils/auth";
import { useProductionRevision } from "~/composables/production/useProductionRevision";

type Scope = { productionOrderId?: string; salesOrderId?: string };
type ListQuery = Scope & { view: "requisitions" | "completions"; page?: number; limit?: number; keyword?: string; status?: string };
type DetailResource = "requisition" | "completion" | "receipt";
interface MutationResult { id: string; documentNo: string; affectedOrderIds: string[]; affectedSalesOrderIds: string[]; }
const emptySnapshot = (): ExecutionSnapshot => ({ orders: [], requisitions: [], completions: [], receipts: [], warehouses: [], pagination: { page: 1, limit: 15, total: 0 }, counts: {} });

export const useProductionExecution = () => {
    const snapshot = ref<ExecutionSnapshot>(emptySnapshot());
    const orderCache = reactive<Record<string, ExecutionOrder>>({});
    const requestCache = reactive<Record<string, ExecutionRequisition>>({});
    const completionCache = reactive<Record<string, ExecutionCompletion>>({});
    const receiptCache = reactive<Record<string, ExecutionReceipt>>({});
    const candidateOrders = ref<ExecutionOrder[]>([]);
    const candidatePagination = ref({ page: 1, limit: 20, total: 0 });
    const loading = ref(false);
    const loadError = ref("");
    const detailLoading = ref(false);
    const detailError = ref("");
    const candidateLoading = ref(false);
    const candidateError = ref("");
    const submitting = ref(false);
    const adminInfo = useState<{ nickname?: string; username?: string; role?: number }>("admin_info", () => ({}));
    const operatorName = computed(() => adminInfo.value?.nickname || adminInfo.value?.username || "");
    const canExecuteAction = (action: string) => canExecuteProductionAction(Number(adminInfo.value?.role), action);
    const canIssue = computed(() => canExecuteAction("issue-requisition"));
    const canReceive = computed(() => canExecuteAction("receive-completion"));
    const { revision, invalidateProduction } = useProductionRevision();
    let seenRevision = revision.value;
    let lastListQuery: ListQuery | null = null;
    let lastScope: Scope | null = null;
    let lastDetail: { resource: DetailResource; id: string } | null = null;
    let readSequence = 0;
    let detailSequence = 0;
    let sourceSequence = 0;
    let candidateSequence = 0;
    let receiptCandidateSequence = 0;
    let requestSerial = 0;
    let warehouseSerial = 0;
    const cacheSerials = new Map<string, number>();
    const requestKeys = new Map<string, string>();
    const orders = computed(() => snapshot.value.orders);
    const requisitions = computed(() => snapshot.value.requisitions);
    const completions = computed(() => snapshot.value.completions);
    const receipts = computed(() => snapshot.value.receipts);
    const warehouses = computed(() => snapshot.value.warehouses);
    const counts = computed(() => snapshot.value.counts);
    const pagination = computed(() => snapshot.value.pagination);
    const allReceipts = computed(() => Object.values(receiptCache));
    const getOrder = (id: string) => orderCache[id];
    const getRequisition = (id: string) => requestCache[id];
    const getCompletion = (id: string) => completionCache[id];
    const getReceipt = (id: string) => receiptCache[id];
    const getMaterial = (order: ExecutionOrder, code: string) => order.materials.find((material) => material.code === code || material.productId === code);
    const cacheRows = <T extends { id: string }>(cache: Record<string, T>, prefix: string, rows: T[], serial: number) => {
        for (const row of rows) {
            const key = `${prefix}:${row.id}`;
            if (serial < (cacheSerials.get(key) || 0)) continue;
            cache[row.id] = row;
            cacheSerials.set(key, serial);
        }
    };
    const remember = (data: ExecutionSnapshot, serial: number) => {
        cacheRows(orderCache, "order", data.orders, serial);
        cacheRows(requestCache, "requisition", data.requisitions, serial);
        cacheRows(completionCache, "completion", [...data.completions, ...(data.relatedCompletions || [])], serial);
        cacheRows(receiptCache, "receipt", data.receipts, serial);
        if (serial >= warehouseSerial) { snapshot.value.warehouses = data.warehouses; warehouseSerial = serial; }
    };
    const readSnapshot = async (path: string, query: Record<string, unknown>) => {
        const serial = ++requestSerial;
        const response: any = await $fetch(path, { headers: { Token: getToken() || "" }, query });
        if (response?.code !== 200) throw new Error(response?.msg || "加载生产记录失败");
        const data: ExecutionSnapshot = { ...emptySnapshot(), ...response.data };
        return { data, serial };
    };
    const errorText = (error: any) => error?.data?.msg || error?.message || "加载失败，请重试。";
    const loadList = async (query: ListQuery) => {
        lastListQuery = { ...query };
        lastScope = null;
        const sequence = ++readSequence;
        loading.value = true;
        loadError.value = "";
        try {
            const { data, serial } = await readSnapshot("/production/orders/list", { resource: "execution", ...query });
            if (sequence === readSequence) { remember(data, serial); snapshot.value = data; }
        } catch (error) {
            if (sequence === readSequence) { loadError.value = errorText(error); snapshot.value = emptySnapshot(); }
        } finally { if (sequence === readSequence) loading.value = false; }
    };
    const loadScope = async (scope: Scope) => {
        lastScope = { ...scope };
        lastListQuery = null;
        const sequence = ++readSequence;
        loading.value = true;
        loadError.value = "";
        try {
            const isSalesperson = Number(adminInfo.value?.role) === ADMIN_ROLE.SELLER;
            if (isSalesperson && !scope.salesOrderId) throw new Error("请选择要查看的销售订单。");
            const { data, serial } = isSalesperson
                ? await readSnapshot("/sales-order/retrieve", { view: "production-execution", salesOrderId: scope.salesOrderId })
                : await readSnapshot("/production/orders/detail", { resource: "execution", ...scope });
            if (sequence !== readSequence) return null;
            remember(data, serial);
            snapshot.value = data;
            return data;
        } catch (error) {
            if (sequence === readSequence) { loadError.value = errorText(error); snapshot.value = emptySnapshot(); }
            return null;
        } finally { if (sequence === readSequence) loading.value = false; }
    };
    const loadDetail = async (resource: DetailResource, id: string) => {
        const sequence = ++detailSequence;
        lastDetail = { resource, id };
        detailLoading.value = true;
        detailError.value = "";
        try {
            const { data, serial } = await readSnapshot("/production/orders/detail", { resource, id });
            if (sequence !== detailSequence) return null;
            remember(data, serial);
            return data;
        } catch (error) { if (sequence === detailSequence) detailError.value = errorText(error); return null; }
        finally { if (sequence === detailSequence) detailLoading.value = false; }
    };
    const loadSource = async (scope: Scope) => {
        const sequence = ++sourceSequence;
        detailLoading.value = true;
        detailError.value = "";
        try {
            const { data, serial } = await readSnapshot("/production/orders/detail", { resource: "execution", ...scope });
            if (sequence !== sourceSequence) return null;
            remember(data, serial);
            return data;
        } catch (error) { if (sequence === sourceSequence) detailError.value = errorText(error); return null; }
        finally { if (sequence === sourceSequence) detailLoading.value = false; }
    };
    const loadCandidates = async (candidateFor: "requisition" | "completion", keyword = "", page = 1) => {
        if (!canExecuteAction(candidateFor === "requisition" ? "create-requisition" : "register-completion")) {
            return false;
        }
        const sequence = ++candidateSequence;
        candidateLoading.value = true;
        candidateError.value = "";
        if (page === 1) candidateOrders.value = [];
        try {
            const { data, serial } = await readSnapshot("/production/orders/list", { resource: "candidates", candidateFor, keyword, page, limit: 20 });
            if (sequence !== candidateSequence) return false;
            remember(data, serial);
            candidateOrders.value = page === 1 ? data.orders : [...candidateOrders.value, ...data.orders.filter((order) => !candidateOrders.value.some((item) => item.id === order.id))];
            candidatePagination.value = data.pagination;
            return true;
        } catch (error) { if (sequence === candidateSequence) candidateError.value = errorText(error); return false; }
        finally { if (sequence === candidateSequence) candidateLoading.value = false; }
    };
    const loadReceiptCandidates = async (keyword = "", page = 1) => {
        if (!canReceive.value) return null;
        const sequence = ++receiptCandidateSequence;
        const { data, serial } = await readSnapshot("/production/orders/list", { resource: "execution", view: "completions", pendingOnly: "true", keyword, status: "全部", page, limit: 20 });
        if (sequence !== receiptCandidateSequence) return null;
        remember(data, serial);
        return data;
    };
    const loadPublicMaterials = async (orderId: string): Promise<ProductionPublicMaterials> => {
        const response: any = await $fetch("/production/orders/detail", {
            headers: { Token: getToken() || "" },
            query: { resource: "public-materials", productionOrderId: orderId },
        });
        if (response?.code !== 200) throw new Error(response?.msg || "加载公共物料库存失败");
        return response.data;
    };
    const refresh = async () => {
        if (lastListQuery) await loadList(lastListQuery);
        else if (lastScope) await loadScope(lastScope);
        if (lastDetail) await loadDetail(lastDetail.resource, lastDetail.id);
    };
    watch(revision, (value) => {
        if (value === seenRevision) return;
        seenRevision = value;
        void refresh();
    });
    const mutate = async (action: string, input: Record<string, unknown>): Promise<MutationResult> => {
        if (!canExecuteAction(action)) throw new Error("没有该生产操作的权限。");
        if (submitting.value) throw new Error("正在提交，请稍候。");
        const body = { resource: "execution", action, ...input };
        const signature = JSON.stringify(body);
        if (!requestKeys.has(signature)) requestKeys.set(signature, crypto.randomUUID());
        submitting.value = true;
        try {
            const response: any = await $fetch("/production/orders/add", { method: "POST", headers: { Token: getToken() || "", "Idempotency-Key": requestKeys.get(signature)! }, body });
            if (response?.code !== 200) throw new Error(response?.msg || "操作失败，请重试。");
            requestKeys.delete(signature);
            seenRevision = revision.value + 1;
            invalidateProduction();
            await refresh();
            return response.data;
        } catch (error) {
            const statusCode = (error as any)?.statusCode || (error as any)?.status;
            if (statusCode === 409) await refresh();
            const failure = new Error(errorText(error));
            if (statusCode) Object.assign(failure, { statusCode });
            throw failure;
        } finally { submitting.value = false; }
    };
    const createRequisition = async (input: { orderId: string; applicant: string; remark: string; lines: Array<{ productId: string; quantity: number }> }) => {
        const result = await mutate("create-requisition", { ...input, version: getOrder(input.orderId)?.version });
        await loadDetail("requisition", result.id);
        return result;
    };
    const issueRequisition = (id: string, lines: ExecutionIssueInput[], remark: string) => mutate("issue-requisition", { id, version: getRequisition(id)?.version, lines, remark });
    const adjustRequisition = (id: string, operation: ExecutionRequisitionOperation, allocationId: string, quantity: number, remark: string, confirmed = false) => {
        const actions = { cancel: "cancel-requisition", return: "request-return", receive: "receive-return" };
        return mutate(actions[operation], { id, version: getRequisition(id)?.version, allocationId, quantity, remark, confirmed });
    };
    const createCompletion = async (input: { orderId: string; quantity: number; date: string; person: string; remark: string }) => {
        const result = await mutate("register-completion", { ...input, version: getOrder(input.orderId)?.version });
        await loadDetail("completion", result.id);
        return result;
    };
    const registerMaterialLoss = (input: { orderId: string; version: number; productId: string; quantity: number; remark: string }) =>
        mutate("register-material-loss", input);
    const allocatePublicMaterials = (input: PublicMaterialAllocationInput) =>
        mutate("allocate-public-materials", { ...input });
    const createReceipt = async (input: { sourceKey: string; date: string; person: string; remark: string; qualified: boolean; lines: Array<Omit<ExecutionReceiptLine, "orderId">> }) => {
        const lines = input.lines.map((line) => ({ ...line, version: getCompletion(line.completionId)?.version }));
        const result = await mutate("receive-completion", { ...input, lines });
        await loadDetail("receipt", result.id);
        return result;
    };
    const sourceKey = (order: ExecutionOrder) => order.sourceType === "stock" ? `stock:${order.id}` : `order:${order.salesOrderId}`;
    const sourceLabel = (order: ExecutionOrder) => order.sourceType === "stock" ? `备货生产 · ${order.documentNo}` : order.salesOrderNo;
    const receiptOwnership = (order: ExecutionOrder) => order.sourceType === "stock" ? "公共可用库存" : order.kind === "component" ? "来源订单物料池" : "来源订单备货";
    const warehouseName = (id: string) => warehouses.value.find((warehouse) => warehouse.id === id)?.name || "未指定仓库";
    const locationName = (warehouseId: string, locationId: string) => warehouses.value.find((warehouse) => warehouse.id === warehouseId)?.locations.find((location) => location.id === locationId)?.name || "未分仓位";
    return {
        snapshot, orders, requisitions, completions, receipts, allReceipts, warehouses, counts, pagination,
        loading, loadError, detailLoading, detailError, candidateLoading, candidateError, candidateOrders, candidatePagination, submitting,
        operatorName, canExecuteAction, canIssue, canReceive, today: () => new Date().toLocaleDateString("sv-SE"),
        loadList, loadScope, loadDetail, loadSource, loadCandidates, loadReceiptCandidates, loadPublicMaterials, refresh, getOrder, getRequisition, getCompletion, getReceipt, getMaterial,
        sourceKey, sourceLabel, receiptOwnership, warehouseName, locationName,
        orderStatus: (order: ExecutionOrder) => order.status,
        completedQty: (order: ExecutionOrder) => order.completedQty,
        receivedQty: (order: ExecutionOrder) => order.receivedQty,
        completionLimit: (order: ExecutionOrder) => order.completionLimit,
        materialIssued: (_order: ExecutionOrder, material: ExecutionMaterial) => material.issuedQty,
        materialPending: (_order: ExecutionOrder, material: ExecutionMaterial) => material.pendingQty,
        materialPendingReturn: (_order: ExecutionOrder, material: ExecutionMaterial) => material.pendingReturnQty,
        materialAvailable: (material: ExecutionMaterial) => material.availableQty,
        materialRequestLimit: (_order: ExecutionOrder, material: ExecutionMaterial) => material.requestLimit,
        returnLimit: (_request: ExecutionRequisition, line: ExecutionRequisitionLine) => line.returnLimit,
        requisitionPending: (line: ExecutionRequisitionLine) => line.pendingQty,
        requisitionStatus: (request: ExecutionRequisition) => request.status,
        hasPendingReturn: (request: ExecutionRequisition) => request.hasPendingReturn,
        completionReceived: (record: ExecutionCompletion) => record.receivedQty,
        completionPending: (record: ExecutionCompletion) => record.pendingQty,
        completionStatus: (record: ExecutionCompletion) => record.status,
        createRequisition, issueRequisition, adjustRequisition, createCompletion, createReceipt, registerMaterialLoss, allocatePublicMaterials,
    };
};
