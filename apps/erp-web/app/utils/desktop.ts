import { invoke } from "@tauri-apps/api/core";

type DesktopFetchOptions = RequestInit & { timeout?: number };

type DesktopResponse = {
    status: number;
    headers: Record<string, string>;
    body: string;
};

const productImageEndpoint = "https://server.zhtaero.com/image/upload";
let desktopActive = false;
let erpOrigin = "";
let reportConnection: (message: string) => void = () => {};

export const isDesktop = () => desktopActive;
export const getDesktopErpOrigin = () => erpOrigin;

export async function initializeDesktop(report: (message: string) => void) {
    desktopActive = true;
    reportConnection = report;
    try {
        const info = await invoke<{ erpOrigin: string }>("desktop_info");
        erpOrigin = info.erpOrigin;
        if (!navigator.onLine) reportConnection("网络不可用，请检查连接后重试。");
    } catch {
        reportConnection("桌面接口初始化失败，请重试。");
    }
}

function encodeBytes(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let start = 0; start < bytes.length; start += 32768) {
        binary += String.fromCharCode(...bytes.subarray(start, start + 32768));
    }
    return btoa(binary);
}

function decodeBytes(body: string) {
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function waitForDesktopResponse<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
        const abort = () => reject(signal.reason ?? new DOMException("Request aborted", "AbortError"));
        signal.addEventListener("abort", abort, { once: true });
        pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
        if (signal.aborted) abort();
    });
}

export async function desktopFetch(input: RequestInfo | URL, init?: DesktopFetchOptions): Promise<Response> {
    if (!erpOrigin) throw new Error("桌面接口尚未就绪，请重试。");

    const url = new URL(input instanceof Request ? input.url : String(input), erpOrigin);
    const isImageUpload = url.href === productImageEndpoint;
    if (url.username || url.password || (url.origin !== erpOrigin && !isImageUpload)) {
        throw new Error("此地址不在桌面 ERP 请求范围内。");
    }
    const request = new Request(input instanceof Request ? input : url, init);
    if (request.signal.aborted) throw request.signal.reason;

    const headers = new Headers(request.headers);
    if (isImageUpload) {
        headers.delete("Token");
        headers.delete("Authorization");
        headers.delete("Cookie");
    }
    const body = request.method === "GET" || request.method === "HEAD"
        ? null
        : encodeBytes(await request.arrayBuffer());
    if (request.signal.aborted) throw request.signal.reason;

    let result: DesktopResponse;
    try {
        const pending = invoke<DesktopResponse>(isImageUpload ? "upload_product_image" : "erp_request", {
            request: {
                method: request.method,
                path: url.pathname + url.search,
                headers: Object.fromEntries(headers),
                body,
                timeoutMs: init?.timeout,
            },
        });
        result = await waitForDesktopResponse(pending, request.signal);
    } catch (error) {
        if (!isImageUpload && (String(error).includes("ERP_NETWORK:") || (error as Error)?.name === "TimeoutError")) {
            const message = "无法连接 ERP 服务，请检查网络后重试。";
            reportConnection(message);
            throw new Error(message);
        }
        throw error instanceof Error ? error : new Error(String(error));
    }

    if (!isImageUpload) {
        reportConnection([502, 503, 504].includes(result.status) ? "ERP 服务暂时不可用，请稍后重试。" : "");
    }

    const noBody = request.method === "HEAD" || [204, 205, 304].includes(result.status);
    const response = new Response(noBody || !result.body ? null : decodeBytes(result.body), {
        // ERP uses 6xx for some business results. Expose the original status for ofetch.
        status: result.status > 599 ? 400 : result.status,
        headers: result.headers,
    });
    Object.defineProperty(response, "url", { value: url.href });
    if (result.status > 599) Object.defineProperty(response, "status", { value: result.status });
    return response;
}

export async function openDesktopFiles(options: { extensions: string[]; multiple: boolean; maxBytes: number }) {
    const files = await invoke<Array<{ name: string; body: string }>>("open_local_files", { options });
    return files.map(({ name, body }) => new File([decodeBytes(body)], name, { type: fileType(name) }));
}

function fileType(name: string) {
    const extension = name.split(".").pop()?.toLowerCase();
    switch (extension) {
        case "csv": return "text/csv";
        case "xls": return "application/vnd.ms-excel";
        case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        case "pdf": return "application/pdf";
        case "png": return "image/png";
        case "jpg":
        case "jpeg": return "image/jpeg";
        case "gif": return "image/gif";
        case "webp": return "image/webp";
        case "bmp": return "image/bmp";
        case "svg": return "image/svg+xml";
        case "ico": return "image/x-icon";
        case "tif":
        case "tiff": return "image/tiff";
        case "avif": return "image/avif";
        case "heic": return "image/heic";
        case "heif": return "image/heif";
        default: return "";
    }
}

export async function saveDesktopFile(blob: Blob, filename: string): Promise<boolean> {
    const name = filename.split(/[/\\]/).pop() || "下载文件";
    const body = encodeBytes(await blob.arrayBuffer());
    return invoke<boolean>("save_local_file", { name, body });
}
