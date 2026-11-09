export type AttachmentPreviewSource =
    | string
    | {
          path?: string;
          url?: string;
          href?: string;
          originalName?: string;
          name?: string;
          filename?: string;
          type?: string;
      };

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico"];

export const getAttachmentPath = (attachment: AttachmentPreviewSource) =>
    typeof attachment === "string" ? attachment : attachment?.path || attachment?.url || attachment?.href || "";

const decodeFileName = (name: string) => {
    if (!name) return "";
    try {
        return decodeURIComponent(name);
    } catch (e) {
        return name;
    }
};

export const getAttachmentFileName = (attachment: AttachmentPreviewSource) => {
    if (!attachment) return "";
    if (typeof attachment === "object") {
        const original = attachment.originalName || attachment.name || attachment.filename || "";
        if (original) return decodeFileName(original);
    }
    const path = getAttachmentPath(attachment);
    if (!path) return "";
    return decodeFileName(path.split(/[/\\]/).pop() || "");
};

export const getAttachmentFileExt = (attachment: AttachmentPreviewSource) => {
    const name = getAttachmentFileName(attachment);
    const parts = name.split(".");
    return parts.length > 1 ? parts.pop()?.toLowerCase() || "" : "";
};

export const isImageAttachment = (attachment: AttachmentPreviewSource) => {
    if (typeof attachment === "object" && attachment?.type?.startsWith("image/")) {
        return true;
    }
    return IMAGE_EXTENSIONS.includes(getAttachmentFileExt(attachment));
};

export const toAbsoluteAttachmentUrl = (path: string, origin: string) => {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) {
        return path;
    }
    return `${origin}/${path.replace(/^\/+/, "")}`;
};

export const downloadAttachmentFile = async (url: string, filename?: string) => {
    if (!url) return;
    const fullUrl = toAbsoluteAttachmentUrl(url, window.location.origin);
    const sameOrigin = new URL(fullUrl).origin === window.location.origin;

    if (sameOrigin || isImageAttachment(filename || url)) {
        const response = await fetch(fullUrl, sameOrigin ? { mode: "same-origin" } : undefined);
        if (!response.ok) throw new Error("下载失败");

        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename || getAttachmentFileName(url);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        return;
    }

    const link = document.createElement("a");
    link.href = fullUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    if (filename) {
        link.download = filename;
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
