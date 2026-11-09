export const hasTextSelection = (event: MouseEvent): boolean => {
    // 键盘触发的点击应正常打开详情。
    if (event.detail === 0 || typeof window === "undefined" || !(event.currentTarget instanceof Element)) {
        return false;
    }

    const selection = window.getSelection();
    return Boolean(
        selection
        && !selection.isCollapsed
        && selection.toString().length > 0
        && selection.containsNode(event.currentTarget, true),
    );
};
