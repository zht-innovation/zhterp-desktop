const ACTION_LABELS = [
    "删除关联订单",
    "新增子BOM类别",
    "新建子BOM类别",
    "新增子分类",
    "关联产品",
    "调整列宽",
    "重置列宽",
    "完成调整",
    "下载附件",
    "查看审核详情",
    "审核详情",
    "审批详情",
    "查看详情",
    "审核通过",
    "新增仓位",
    "配置列",
    "上移",
    "下移",
    "编辑",
    "删除",
    "查看",
    "新增",
    "新建",
    "移除",
    "关闭",
    "下载",
    "上传",
    "导入",
    "导出",
    "打印",
    "重置",
    "筛选",
    "启用",
    "停用",
    "选择",
];

const normalizeTooltipLabel = (value: string) => {
    const label = value.replace(/\s+/g, "").trim();

    if (!label) {
        return "";
    }

    if (label.startsWith("新增") && label.includes("子BOM类别")) {
        return "新增子BOM类别";
    }

    if (label.startsWith("新建") && label.includes("子BOM类别")) {
        return "新建子BOM类别";
    }

    if (label.startsWith("新增") && label.includes("子分类")) {
        return "新增子分类";
    }

    if (label.startsWith("新增") && label.includes("仓位")) {
        return "新增仓位";
    }

    if (label.includes("审核详情")) {
        return "审核详情";
    }

    if (label.includes("审批详情")) {
        return "审批详情";
    }

    if (label.startsWith("查看") && label.includes("详情")) {
        return "查看详情";
    }

    return ACTION_LABELS.find((action) => label.startsWith(action)) || label;
};

export default defineNuxtPlugin(() => {
    type TooltipWindow = Window & { __zhtIconButtonTooltipReady?: boolean };
    const tooltipWindow = window as TooltipWindow;

    if (tooltipWindow.__zhtIconButtonTooltipReady) {
        return;
    }
    tooltipWindow.__zhtIconButtonTooltipReady = true;

    const selector = ".icon-button[aria-label], [data-icon-tooltip]";
    const tooltip = document.createElement("div");
    tooltip.className = "global-icon-button-tooltip";
    let activeTarget: HTMLElement | null = null;

    document.body.appendChild(tooltip);

    const getTooltipTarget = (target: EventTarget | null) => {
        if (!(target instanceof Element)) {
            return null;
        }

        const element = target.closest(selector);
        return element instanceof HTMLElement ? element : null;
    };

    const getLabel = (target: HTMLElement) =>
        normalizeTooltipLabel(
            target.dataset.iconTooltip ||
            target.getAttribute("aria-label") ||
            target.getAttribute("title") ||
            "",
        );

    const placeTooltip = () => {
        if (!activeTarget) {
            return;
        }

        const rect = activeTarget.getBoundingClientRect();
        tooltip.classList.add("is-visible");

        const width = tooltip.offsetWidth;
        const height = tooltip.offsetHeight;
        const centerX = rect.left + rect.width / 2;
        const left = Math.min(
            Math.max(8, centerX - width / 2),
            window.innerWidth - width - 8,
        );
        const top = Math.max(8, rect.top - height - 8);

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.style.setProperty("--tooltip-arrow-left", `${centerX - left}px`);
    };

    const showTooltip = (target: HTMLElement) => {
        if (target instanceof HTMLButtonElement && target.disabled) {
            return;
        }

        const label = getLabel(target);
        if (!label) {
            return;
        }

        activeTarget = target;
        tooltip.textContent = label;
        requestAnimationFrame(placeTooltip);
    };

    const hideTooltip = () => {
        activeTarget = null;
        tooltip.classList.remove("is-visible");
    };

    document.addEventListener("pointerover", (event) => {
        const target = getTooltipTarget(event.target);
        if (!target) {
            return;
        }

        const relatedTarget = event.relatedTarget;
        if (relatedTarget instanceof Node && target.contains(relatedTarget)) {
            return;
        }

        showTooltip(target);
    }, true);

    document.addEventListener("pointerout", (event) => {
        const target = getTooltipTarget(event.target);
        if (!target || target !== activeTarget) {
            return;
        }

        const relatedTarget = event.relatedTarget;
        if (relatedTarget instanceof Node && target.contains(relatedTarget)) {
            return;
        }

        hideTooltip();
    }, true);

    document.addEventListener("focusin", (event) => {
        const target = getTooltipTarget(event.target);
        if (target) {
            showTooltip(target);
        }
    }, true);

    document.addEventListener("focusout", hideTooltip, true);
    document.addEventListener("click", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);
    window.addEventListener("scroll", hideTooltip, true);
});
