import { computed, onBeforeUnmount, ref, watch } from "vue";
import { retrieveApprovalKitAnalysis } from "~/composables/api/useApprovalApi";
import { normalizeOrderVisibleFields, type OrderApprovalField } from "~~/shared/types/orderApproval";
import type { OrderKitAnalysisResult } from "~~/shared/types/orderKitAnalysis";

interface ApprovalKitAnalysisOptions {
    approvalId: () => string | undefined;
    detail: () => object;
    visibleFields: () => readonly OrderApprovalField[];
    enabled: () => boolean;
}

export const useApprovalKitAnalysis = (options: ApprovalKitAnalysisOptions) => {
    const visibleFields = computed(() => normalizeOrderVisibleFields(options.visibleFields()));
    const canAnalyzeOrderKit = computed(() => Boolean(options.approvalId())
        && options.enabled()
        && visibleFields.value.includes("productCode")
        && visibleFields.value.includes("quantity")
        && visibleFields.value.includes("availableQuantity"));
    const kitAnalysisLoading = ref(false);
    const kitAnalysisError = ref("");
    const kitAnalysisReport = ref<OrderKitAnalysisResult | null>(null);
    const showKitAnalysis = ref(false);
    const kitAnalysisVisibleFields = computed(() => normalizeOrderVisibleFields(kitAnalysisReport.value?.visibleFields)
        .filter((field) => visibleFields.value.includes(field)));
    let kitAnalysisSequence = 0;

    const resetKitAnalysis = () => {
        kitAnalysisSequence += 1;
        kitAnalysisLoading.value = false;
        kitAnalysisError.value = "";
        kitAnalysisReport.value = null;
        showKitAnalysis.value = false;
    };

    const analyzeOrderKit = async () => {
        const approvalId = options.approvalId();
        if (kitAnalysisLoading.value || !canAnalyzeOrderKit.value || !approvalId) return;
        resetKitAnalysis();
        const sequence = kitAnalysisSequence;
        const detail = options.detail();
        const permissionKey = visibleFields.value.join("|");
        const isCurrentRequest = () => sequence === kitAnalysisSequence
            && options.approvalId() === approvalId && options.detail() === detail && canAnalyzeOrderKit.value
            && visibleFields.value.join("|") === permissionKey;
        kitAnalysisLoading.value = true;
        try {
            const response = await retrieveApprovalKitAnalysis(approvalId);
            if (!isCurrentRequest()) return;
            if (response.code !== 200 || !response.data?.analysis) {
                throw new Error(response.msg || "齐套分析失败，请重试");
            }
            kitAnalysisReport.value = response.data.analysis;
            showKitAnalysis.value = true;
        } catch (error: any) {
            if (isCurrentRequest()) {
                kitAnalysisError.value = error?.data?.msg || error?.message || "齐套分析失败，请重试";
            }
        } finally {
            if (sequence === kitAnalysisSequence) kitAnalysisLoading.value = false;
        }
    };

    watch(() => [options.approvalId(), options.detail(), visibleFields.value, options.enabled()], resetKitAnalysis, {
        deep: true,
        flush: "sync",
    });
    onBeforeUnmount(resetKitAnalysis);

    return {
        canAnalyzeOrderKit,
        kitAnalysisLoading,
        kitAnalysisError,
        kitAnalysisReport,
        showKitAnalysis,
        kitAnalysisVisibleFields,
        analyzeOrderKit,
    };
};
