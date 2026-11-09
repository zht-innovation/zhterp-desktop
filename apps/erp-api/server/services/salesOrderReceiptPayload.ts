import { getErpAttachmentRoot } from "~~/server/utils/erpAttachmentRoot";
import { mkdir, writeFile } from "fs/promises";
import { getHeader, readBody, readMultipartFormData } from "h3";
import path from "path";

const saveSalesOrderReceiptFile = async (part: any, folder: string) => {
    const uploadDir = path.join(getErpAttachmentRoot(), "main", folder);
    await mkdir(uploadDir, { recursive: true });

    const safeOriginalName = path.basename(part.filename || "attachment");
    const fileExtension = path.extname(safeOriginalName);
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).slice(2, 8);
    const filename = `${timestamp}-${randomStr}${fileExtension}`;
    const filepath = path.join(uploadDir, filename);

    await writeFile(filepath, part.data);

    return {
        path: `/main/${folder}/${filename}`,
        originalName: safeOriginalName,
        name: safeOriginalName,
        size: part.data?.length || 0,
        type: part.type || "",
    };
};

const parseJsonArray = (value: unknown) => {
    if (Array.isArray(value)) return value;
    if (value == null || value === "") return [];

    try {
        const parsed = JSON.parse(String(value));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const readSalesOrderReceiptPayload = async (event: any) => {
    const contentType = String(getHeader(event, "content-type") || "").toLowerCase();
    if (!contentType.includes("multipart/form-data")) {
        return await readBody(event);
    }

    const formData = await readMultipartFormData(event);
    if (!formData) return null;

    const body: Record<string, any> = {};
    const attachments: any[] = [];

    for (const part of formData) {
        if (!part.name) continue;

        if (part.filename) {
            if (part.name === "attachments") {
                attachments.push(await saveSalesOrderReceiptFile(part, "sales-order-receipt-attachments"));
            }
            continue;
        }

        const value = part.data?.toString("utf-8") || "";
        body[part.name] = value;
    }

    body.attachments = [
        ...parseJsonArray(body.attachmentsExisting),
        ...attachments,
    ];
    delete body.attachmentsExisting;

    return body;
};
