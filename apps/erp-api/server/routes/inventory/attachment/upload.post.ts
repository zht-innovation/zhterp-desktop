import { getErpAttachmentRoot } from "~~/server/utils/erpAttachmentRoot";
import fs from "fs";
import path from "path";
import { writeFile } from "fs/promises";
import { assertInventoryWriteAccess, InventoryHttpError } from "~~/server/services/inventory";

const getUploadDir = () => {
    return path.join(getErpAttachmentRoot(), "main", "inventory", "attachments");
};

const sanitizeFilename = (filename: string) => {
    return path.basename(filename || "file").replace(/[^\w.\-一-龥]/g, "_");
};

export default defineEventHandler(async (event) => {
    try {
        assertInventoryWriteAccess(event);
        const formData = await readMultipartFormData(event);

        if (!formData || formData.length === 0) {
            setResponseStatus(event, 400);
            return {
                code: CODE.INVALID_PARAMS,
                msg: "请选择要上传的文件",
            };
        }

        const file = formData.find((item) => item.name === "file" && item.filename);

        if (!file) {
            setResponseStatus(event, 400);
            return {
                code: CODE.INVALID_PARAMS,
                msg: "请选择要上传的文件",
            };
        }

        const uploadDir = getUploadDir();
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const originalName = sanitizeFilename(file.filename || "file");
        const ext = path.extname(originalName);
        const baseName = path.basename(originalName, ext);
        const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${baseName}${ext}`;
        const filepath = path.join(uploadDir, filename);

        await writeFile(filepath, file.data);

        const fileUrl = `/main/inventory/attachments/${filename}`;

        setResponseStatus(event, 200);
        return {
            code: CODE.SUCCESS,
            msg: codeToMsg[CODE.SUCCESS],
            data: {
                url: fileUrl,
                name: originalName,
                size: file.data.length,
                type: file.type || "",
            },
        };
    } catch (error: any) {
        logger.error("Upload inventory attachment error", error);
        const knownError = error instanceof InventoryHttpError;
        setResponseStatus(event, knownError ? error.status : 500);
        return {
            code: knownError ? error.code : CODE.SERVER_ERROR,
            msg: knownError ? error.message : codeToMsg[CODE.SERVER_ERROR],
        };
    }
});
