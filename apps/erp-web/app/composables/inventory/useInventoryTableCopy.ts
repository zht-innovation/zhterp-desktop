import { useApprovalCellCopy } from "~/composables/useApprovalCellCopy";

export const useInventoryTableCopy = () => {
    const { copyCellText } = useApprovalCellCopy();

    const handleInventoryTableDoubleClick = async (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const table = target.closest("[data-inventory-copy-table]");
        const cell = target.closest<HTMLElement>(".data-row > .table-cell");
        if (!table || !cell || !table.contains(cell)) {
            return;
        }

        if (target.closest(
            "button, a, input, textarea, select, label, img, svg, "
            + "[role='button'], [role='checkbox'], [role='switch'], "
            + "[contenteditable]:not([contenteditable='false']), "
            + ".erp-dialog-mask, [role='dialog'], [role='alertdialog'], .el-drawer, .el-popper",
        )) {
            return;
        }

        if (cell.matches(".checkbox-cell, .drag-cell, .actions-cell, .action-cell, .image-cell")
            || cell.querySelector(".product-image-cell, .switch")) {
            return;
        }

        // 纯按钮单元格的留白也属于操作区域。
        if (cell.children.length === 1 && cell.firstElementChild?.matches("button, a")) {
            return;
        }

        const text = (cell.dataset.copyValue ?? cell.innerText).trim();
        await copyCellText(text);
    };

    return { handleInventoryTableDoubleClick };
};
