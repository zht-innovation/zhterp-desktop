import {
    approveApproval,
    cancelApproval,
    confirmOrderPayment,
    deleteApproval,
    readApproval,
    rejectApproval,
    retrieveApprovalApplicants,
    retrieveApprovalDetail,
    retrieveApprovalFlows,
    retrieveApprovals,
    updateApprovalFlow,
} from "~/composables/api/useApprovalApi";
import type {
    ApprovalApiResponse,
    ApprovalDetailItem,
    ApprovalFlowConfig,
    ApprovalListData,
    ApprovalQuery,
    ApprovalUnreadCounts,
    ApprovalUser,
} from "~/types/approval";

let listRequestSequence = 0;
let detailRequestSequence = 0;

const emptyUnreadCounts = (): ApprovalUnreadCounts => ({
    pending: 0,
    processed: 0,
    mine: 0,
    cc: 0,
    all: 0,
    unread: 0,
});

const emptyListData = (): ApprovalListData => ({
    items: [],
    pagination: {
        pageSize: 20,
        hasMore: false,
    },
    unreadCounts: emptyUnreadCounts(),
    pendingCount: 0,
});

const requireSuccess = <T>(response: ApprovalApiResponse<T>) => {
    if (response.code !== 200 || !response.data) {
        throw new Error(response.msg || "审批中心请求失败");
    }
    return response.data;
};

export const getApprovalErrorMessage = (error: unknown, fallback: string) => {
    const source = error as {
        data?: { msg?: string };
        message?: string;
    };
    return source?.data?.msg || source?.message || fallback;
};

export const useApproval = () => {
    const listData = useState<ApprovalListData>("approval-center-list", emptyListData);
    const detail = useState<ApprovalDetailItem | null>("approval-center-detail", () => null);
    const unreadCounts = useState<ApprovalUnreadCounts>(
        "approval-center-unread-counts",
        emptyUnreadCounts,
    );
    const pendingCount = useState<number>("approval-center-pending-count", () => 0);
    const accountUsername = useState<string>("approval-center-account", () => "");
    const unreadRequestSequence = useState<number>(
        "approval-center-unread-request-sequence",
        () => 0,
    );
    const applicantOptions = useState<ApprovalUser[]>(
        "approval-center-applicants",
        () => [],
    );
    const listLoading = useState("approval-center-list-loading", () => false);
    const detailLoading = useState("approval-center-detail-loading", () => false);
    const flowConfigs = useState<ApprovalFlowConfig[]>(
        "approval-center-flow-configs",
        () => [],
    );

    const loadApplicantOptions = async () => {
        const data = requireSuccess(await retrieveApprovalApplicants());
        applicantOptions.value = data.applicants;
    };

    const setAccountContext = (username: string) => {
        const normalizedUsername = username.trim();
        if (accountUsername.value === normalizedUsername) return;

        accountUsername.value = normalizedUsername;
        listRequestSequence += 1;
        listData.value = emptyListData();
        listLoading.value = false;
        unreadCounts.value = emptyUnreadCounts();
        pendingCount.value = 0;
        unreadRequestSequence.value += 1;
    };

    const loadList = async (query: ApprovalQuery, append = false) => {
        const requestId = ++listRequestSequence;
        listLoading.value = true;
        if (!append) listData.value = emptyListData();
        try {
            const data = requireSuccess(await retrieveApprovals(query));
            if (requestId !== listRequestSequence) return;
            listData.value = append
                ? {
                    ...data,
                    items: [...listData.value.items, ...data.items],
                }
                : data;
            unreadCounts.value = data.unreadCounts;
            pendingCount.value = data.pendingCount;
        } catch (error) {
            if (requestId !== listRequestSequence) return;
            throw error;
        } finally {
            if (requestId === listRequestSequence) listLoading.value = false;
        }
    };

    const refreshUnreadCounts = async () => {
        const requestId = unreadRequestSequence.value + 1;
        unreadRequestSequence.value = requestId;
        const data = requireSuccess(await retrieveApprovals({
            view: "pending",
            pageSize: 1,
        }));
        if (requestId !== unreadRequestSequence.value) return false;
        unreadCounts.value = data.unreadCounts;
        pendingCount.value = data.pendingCount;
        return true;
    };

    const patchListReadState = (id: string) => {
        listData.value.items = listData.value.items.map((item) =>
            item.id === id ? { ...item, unread: false } : item,
        );
    };

    const loadDetail = async (id: string, markRead = false) => {
        const requestId = ++detailRequestSequence;
        detailLoading.value = true;
        try {
            const data = requireSuccess(await retrieveApprovalDetail(id));
            if (requestId !== detailRequestSequence) return null;
            let nextDetail = data.detail;
            if (markRead) {
                const readData = requireSuccess(await readApproval(id));
                if (requestId !== detailRequestSequence) return null;
                patchListReadState(id);
                nextDetail = {
                    ...nextDetail,
                    ...readData.detail,
                };
                try {
                    await refreshUnreadCounts();
                } catch {
                    // 已读和详情均已成功，未读数量可在下次列表请求时校准。
                }
            }
            if (requestId !== detailRequestSequence) return null;
            detail.value = nextDetail;
            return nextDetail;
        } finally {
            if (requestId === detailRequestSequence) detailLoading.value = false;
        }
    };

    const clearDetail = () => {
        detailRequestSequence += 1;
        detail.value = null;
        detailLoading.value = false;
    };

    const approve = async (id: string) =>
        requireSuccess(await approveApproval(id));

    const confirmPayment = async (id: string) =>
        requireSuccess(await confirmOrderPayment(id));

    const reject = async (id: string, reason: string) =>
        requireSuccess(await rejectApproval(id, reason));

    const cancel = async (id: string) =>
        requireSuccess(await cancelApproval(id));

    const deleteApprovalInstance = async (id: string, reason = "") =>
        requireSuccess(await deleteApproval(id, reason));

    const loadFlowConfigs = async () => {
        const data = requireSuccess(await retrieveApprovalFlows());
        flowConfigs.value = data.configs;
    };

    const updateFlow = async (config: ApprovalFlowConfig) => {
        const data = requireSuccess(await updateApprovalFlow(config));
        const configIndex = flowConfigs.value.findIndex((item) =>
            item.type === data.config.type,
        );
        if (configIndex === -1) {
            flowConfigs.value = [...flowConfigs.value, data.config];
        } else {
            flowConfigs.value = flowConfigs.value.map((item, index) =>
                index === configIndex ? data.config : item,
            );
        }
        return data.config;
    };

    return {
        listData,
        detail,
        unreadCounts,
        pendingCount,
        applicantOptions,
        flowConfigs,
        listLoading,
        detailLoading,
        setAccountContext,
        loadApplicantOptions,
        loadList,
        loadDetail,
        clearDetail,
        refreshUnreadCounts,
        approve,
        confirmPayment,
        reject,
        cancel,
        deleteApproval: deleteApprovalInstance,
        loadFlowConfigs,
        updateFlow,
    };
};
