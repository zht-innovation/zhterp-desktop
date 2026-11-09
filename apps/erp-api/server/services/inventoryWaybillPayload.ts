import { InventoryHttpError, toText } from "~~/server/services/inventory";
import { CODE, codeToMsg } from "~~/server/utils/code";

const parseAttachmentJson = (value: string) => {
    if (!value) return [];

    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) return [];

        return parsed
            .map((item) => ({
                name: toText(item?.name),
                url: toText(item?.url),
                size: Number.isFinite(Number(item?.size)) ? Number(item.size) : 0,
                type: toText(item?.type),
            }))
            .filter((item) => item.name && item.url);
    } catch {
        throw new InventoryHttpError(400, CODE.INVALID_PARAMS, "附件信息格式错误");
    }
};

export const readInventoryWaybillPayload = async (
    event: any,
    options: { defaultAttachments?: boolean } = {},
) => {
    const contentType = event.node.req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
        return await readBody(event);
    }

    const formData = await readMultipartFormData(event);
    if (!formData) {
        throw new InventoryHttpError(400, CODE.INVALID_PARAMS, codeToMsg[CODE.INVALID_PARAMS]);
    }

    const body: Record<string, any> = {};
    const images: Array<{ name: string; url: string; size?: number; type?: string }> = [];
    const attachments: Array<{ name: string; url: string; size?: number; type?: string }> = [];
    let shouldSetImages = false;
    let shouldSetAttachments = Boolean(options.defaultAttachments);

    for (const part of formData) {
        if (!part.name) continue;

        if (!part.filename) {
            const value = part.data.toString("utf-8");

            if (part.name === "images") {
                shouldSetImages = true;
                images.push(...parseAttachmentJson(value));
                continue;
            }

            if (part.name === "attachments") {
                shouldSetAttachments = true;
                attachments.push(...parseAttachmentJson(value));
                continue;
            }

            if (part.name === "image" && value.startsWith("blob:")) {
                continue;
            }

            body[part.name] = value;
        }
    }

    if (shouldSetImages) {
        body.images = images;
    }

    if (shouldSetAttachments) {
        body.attachments = attachments;
    }

    return body;
};
