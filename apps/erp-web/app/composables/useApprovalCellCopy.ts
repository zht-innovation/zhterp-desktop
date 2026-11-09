export const useApprovalCellCopy = () => {
    const copyCellText = async (value?: string | number | null) => {
        const text = value === undefined || value === null ? "" : String(value);
        if (!text.trim() || text.trim() === "--") {
            ElMessage.info("该单元格暂无内容");
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            ElMessage.success("已复制到剪贴板");
        } catch {
            ElMessage.error("复制失败，请重试");
        }
    };

    return { copyCellText };
};
