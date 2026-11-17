import { invoke } from "@tauri-apps/api/core";
import { decodePrintImageDataUrl, freezePrintImage } from "../app/utils/desktopPrintImage";
import "./style.css";

interface PrintPayload {
    previewRevision: number;
    document: { title: string; kind: "sales" | "sku" | "sn"; pages: string[] };
    settings: { paper: { widthMm: number; heightMm: number }; landscape: boolean; copies: number; printer: string };
}

// This entry has no Nuxt app, auth/notification plugins, tokens, business API,
// external resource URLs or print invocation. Native code owns submission.
const htmlTags = new Set(["ARTICLE", "SECTION", "DIV", "SPAN", "P", "STRONG", "B", "EM", "I", "SMALL", "H1", "H2", "H3", "H4", "H5", "H6", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TH", "TD", "COLGROUP", "COL", "UL", "OL", "LI", "BR", "HR", "IMG", "SUP", "SUB"]);
const svgTags = new Set(["svg", "g", "rect", "path", "line", "text"]);
const svgAttributes = new Set(["viewBox", "width", "height", "x", "y", "x1", "x2", "y1", "y2", "d", "fill", "stroke", "stroke-width", "transform", "font-size", "text-anchor", "preserveAspectRatio"]);
const svgNamespace = "http://www.w3.org/2000/svg";

function safeNode(source: Node): Node | null {
    if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.textContent || "");
    if (!(source instanceof Element)) return null;
    const isSvg = source.namespaceURI === svgNamespace;
    if (isSvg ? !svgTags.has(source.localName) : !htmlTags.has(source.tagName)) return null;
    const target = isSvg ? document.createElementNS(svgNamespace, source.localName) : document.createElement(source.tagName.toLowerCase());
    for (const attribute of Array.from(source.attributes)) {
        const name = attribute.name;
        const value = attribute.value;
        if (name === "style" && !/url\s*\(|expression\s*\(|@import|javascript:|behavior\s*:/i.test(value)) target.setAttribute("style", value);
        else if (name === "class") target.setAttribute(name, value);
        else if (["colspan", "rowspan"].includes(name) && /^\d{1,3}$/.test(value)) target.setAttribute(name, value);
        else if (name === "src" && source.tagName === "IMG" && /^data:image\/(png|jpeg|gif|webp|bmp);base64,[a-z\d+/=\s]+$/i.test(value)) target.setAttribute(name, value);
        else if (isSvg && svgAttributes.has(name) && !/url\s*\(|javascript:/i.test(value)) target.setAttribute(name, value);
    }
    for (const child of Array.from(source.childNodes)) {
        const safe = safeNode(child);
        if (safe) target.append(safe);
    }
    return target;
}

async function ready() {
    const status = document.querySelector<HTMLElement>("#status")!;
    let previewRevision: number | undefined;
    try {
        const payload = await invoke<PrintPayload>("desktop_print_payload");
        previewRevision = payload.previewRevision;
        document.title = `打印预览 · ${payload.document.title}`;
        const paper = payload.settings.paper;
        const width = payload.settings.landscape ? paper.heightMm : paper.widthMm;
        const height = payload.settings.landscape ? paper.widthMm : paper.heightMm;
        if (![width, height].every((size) => Number.isFinite(size) && size >= 10 && size <= 2000)) throw new Error("打印纸型无效");
        const style = document.createElement("style");
        style.textContent = `@page { size: ${width}mm ${height}mm; margin: 0; } #pages > * { width:${width}mm !important; min-height:${height}mm; }`;
        document.head.append(style);
        const pages = document.querySelector<HTMLElement>("#pages")!;
        for (let pageIndex = 0; pageIndex < payload.document.pages.length; pageIndex++) {
            const html = payload.document.pages[pageIndex]!;
            const parsed = new DOMParser().parseFromString(html, "text/html");
            const fragment = document.createDocumentFragment();
            let count = 0;
            for (const child of Array.from(parsed.body.childNodes)) {
                const safe = safeNode(child);
                if (safe) { fragment.append(safe); count++; }
            }
            if (!count) throw new Error("打印内容为空或包含不支持的元素");
            const images = fragment.querySelectorAll("img");
            // Old history can still contain animations. Freeze every raster
            // image before showing the page, then acknowledge only the static DOM.
            for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
                const image = images[imageIndex]!;
                try {
                    image.src = await freezePrintImage(decodePrintImageDataUrl(image.getAttribute("src") || ""));
                    await image.decode();
                    if (!image.naturalWidth || !image.naturalHeight) throw new Error("打印图片未能完成加载");
                } catch (error) {
                    const reason = error instanceof Error ? error.message : String(error);
                    throw new Error(`第 ${pageIndex + 1} 页第 ${imageIndex + 1} 张图片无法用于打印：${reason}`);
                }
            }
            pages.append(fragment);
        }
        await document.fonts.ready;
        for (const svg of pages.querySelectorAll("svg")) {
            if (!svg.querySelector("rect,path")) throw new Error("条码尚未生成，已阻止打印");
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        status.textContent = `${payload.document.title} · ${width} × ${height} mm · ${payload.settings.copies} 份 · ${payload.settings.printer}。请返回打印中心确认提交。`;
        await invoke("desktop_print_ready", { previewRevision, error: null });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        status.textContent = `打印准备失败：${message}`;
        if (previewRevision !== undefined) await invoke("desktop_print_ready", { previewRevision, error: message }).catch(() => {});
    }
}

document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") event.preventDefault();
});
document.addEventListener("contextmenu", (event) => event.preventDefault());
void ready();
