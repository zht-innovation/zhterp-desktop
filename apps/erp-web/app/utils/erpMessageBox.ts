import { ElMessageBox } from "element-plus";
import type { ElMessageBoxOptions, MessageBoxData } from "element-plus";

type ErpMessageBoxMethod = (
    message: ElMessageBoxOptions["message"],
    title: string,
    options?: ElMessageBoxOptions,
) => Promise<MessageBoxData>;

const mergeClassNames = (...classNames: Array<string | undefined>) => {
    return classNames.filter(Boolean).join(" ");
};

const withErpMessageBoxStyles = (
    options: ElMessageBoxOptions = {},
): ElMessageBoxOptions => {
    return {
        ...options,
        customClass: mergeClassNames("erp-message-box", options.customClass),
        modalClass: mergeClassNames(
            "erp-app",
            "erp-message-box-overlay",
            options.modalClass,
        ),
    };
};

export const erpMessageBox: {
    alert: ErpMessageBoxMethod;
    confirm: ErpMessageBoxMethod;
    prompt: ErpMessageBoxMethod;
} = {
    alert(message, title, options) {
        return ElMessageBox.alert(message, title, withErpMessageBoxStyles(options));
    },
    confirm(message, title, options) {
        return ElMessageBox.confirm(message, title, withErpMessageBoxStyles(options));
    },
    prompt(message, title, options) {
        return ElMessageBox.prompt(message, title, withErpMessageBoxStyles(options));
    },
};
