import { statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export const getErpAttachmentRoot = () => {
    const root = String(useRuntimeConfig().erpAttachmentRoot || "").trim();
    if (!isAbsolute(root) || !statSync(root, { throwIfNoEntry: false })?.isDirectory()) {
        throw new Error("ERP 附件存储未挂载");
    }
    return resolve(root);
};
