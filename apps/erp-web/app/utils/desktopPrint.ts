import { ref, shallowRef } from "vue";
import { invoke } from "@tauri-apps/api/core";
import JsBarcode from "jsbarcode";
import { desktopFetch, desktopReady, getDesktopErpOrigin, isDesktop } from "~/utils/desktop";
import { getToken } from "~/utils/auth";
import { decodePrintImageDataUrl, freezePrintImage } from "./desktopPrintImage";

export type PrintKind = "sales" | "sku" | "sn";
export interface PrintPaper { id: string; name: string; widthMm: number; heightMm: number }
export interface DesktopPrinter { name: string; papers: PrintPaper[] }
export interface DesktopPrintSettings { printer: string; paper: PrintPaper; landscape: boolean; copies: number }
export interface SnPrintBatch { monthKey: string; firstSerial: number; lastSerial: number; codes: string[]; registration: string }
export interface DesktopPrintDocument {
    kind: PrintKind;
    title: string;
    sourceIds: string[];
    pages: string[];
    snBatch?: SnPrintBatch;
}
export interface DesktopPrintJob {
    id: string;
    parentId?: string;
    createdAt: number;
    status: string;
    message: string;
    document: DesktopPrintDocument;
    settings: DesktopPrintSettings;
}
export interface DesktopPrintList { jobs: DesktopPrintJob[]; preferences: Partial<Record<PrintKind, DesktopPrintSettings>>; warning: string }
export interface DesktopPrintRequest {
    kind: PrintKind;
    title: string;
    sourceIds: string[];
    preferredSize?: { widthMm: number; heightMm: number };
    buildPages: (settings: DesktopPrintSettings) => Promise<string[]>;
    snBatch?: SnPrintBatch;
    register?: () => Promise<void>;
}

export class DesktopPrintRegistrationRejected extends Error {}

// Local ERP page state only; credentials are never sent to the print renderer.
export const desktopPrintVisible = ref(false);
export const desktopPrintRequest = shallowRef<DesktopPrintRequest | null>(null);
export const desktopPrintSessionReady = ref(false);
export const desktopPrintHasCurrent = ref(false);

export function assertDesktopPrintAvailable() {
    if (!isDesktop()) throw new Error("原生打印仅在桌面客户端可用");
    if (!desktopReady.value) throw new Error("桌面连接尚未就绪，请重试连接后再打印");
    if (!desktopPrintSessionReady.value) {
        desktopPrintVisible.value = true;
        throw new Error("打印中心尚未就绪，请在打印中心重新连接成功后，再从业务页面发起打印");
    }
    if (desktopPrintHasCurrent.value) throw new Error("请先完成或取消打印中心内的当前预览");
}

export function openDesktopPrint(request: DesktopPrintRequest) {
    assertDesktopPrintAvailable();
    desktopPrintHasCurrent.value = true;
    desktopPrintRequest.value = request;
    desktopPrintVisible.value = true;
}

function escaped(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export async function buildDesktopLabels(model: string, codes: string[], settings: DesktopPrintSettings) {
    const width = settings.landscape ? settings.paper.heightMm : settings.paper.widthMm;
    const height = settings.landscape ? settings.paper.widthMm : settings.paper.heightMm;
    const pages: string[] = [];
    // Model line (5mm), code text (8pt), margins/padding and a readable 6mm
    // bar need at least 21mm; smaller labels would clip the frozen code text.
    if (width < 20 || height < 21 || codes.length > 2000) throw new Error("标签须至少宽 20 mm、高 21 mm，且批次数量不超过 2000，请调整后重试");
    for (const code of codes) {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        JsBarcode(svg, code, { format: "CODE128", displayValue: false, margin: 0, width: 2, height: 70 });
        const naturalWidth = Number(svg.getAttribute("width"));
        // Keep an X-dimension of at least 0.19mm. Never silently squeeze a long
        // barcode onto a label that cannot remain reliably scannable.
        if (naturalWidth / 2 * 0.19 > width - 6) throw new Error(`标签纸不足以容纳条码 ${code}，请选择更宽纸型`);
        svg.setAttribute("viewBox", `0 0 ${naturalWidth} 70`);
        svg.setAttribute("preserveAspectRatio", "none");
        svg.setAttribute("style", `display:block;width:${width - 6}mm;height:${Math.max(6, height - 16)}mm;margin:1mm auto;`);
        pages.push(`<article class="label-page" style="box-sizing:border-box;width:${width}mm;height:${height}mm;padding:2mm 3mm;overflow:hidden;text-align:center;color:#000;background:#fff;font-family:Arial,'Microsoft YaHei',sans-serif;break-after:page;"><div style="font-size:9pt;line-height:1.25;height:5mm;overflow:hidden;">${escaped(model)}</div>${svg.outerHTML}<div style="font-size:8pt;line-height:1.2;white-space:nowrap;">${escaped(code)}</div></article>`);
    }
    return pages;
}

const snapshotStyles = ["display", "position", "top", "right", "bottom", "left", "z-index", "width", "height", "min-width", "min-height", "max-width", "max-height", "box-sizing", "padding", "margin", "gap", "row-gap", "column-gap", "grid-template-columns", "grid-template-rows", "grid-auto-rows", "grid-auto-flow", "grid-column", "grid-row", "flex", "flex-direction", "flex-wrap", "align-items", "align-content", "justify-content", "align-self", "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing", "word-spacing", "text-align", "text-decoration", "white-space", "word-break", "overflow-wrap", "color", "background-color", "border-top", "border-right", "border-bottom", "border-left", "border-collapse", "border-spacing", "border-radius", "vertical-align", "object-fit", "opacity", "transform", "transform-origin", "overflow", "table-layout", "break-inside"];

async function inlineImage(image: HTMLImageElement, token: string) {
    if (!image.src) throw new Error("打印图片地址为空");
    if (image.src.startsWith("data:")) return freezePrintImage(decodePrintImageDataUrl(image.src));
    const url = new URL(image.src, window.location.href);
    const isErp = url.origin === getDesktopErpOrigin();
    const isPublicImage = url.protocol === "https:" && url.origin === "https://server.zhtaero.com" && !url.username && !url.password;
    const isLocal = url.origin === window.location.origin || url.protocol === "blob:";
    if (!isErp && !isPublicImage && !isLocal) throw new Error("打印图片地址不在现有附件范围内");
    if (isPublicImage) {
        const source = await invoke<string>("desktop_print_image", { url: url.href });
        return freezePrintImage(decodePrintImageDataUrl(source));
    }
    const response = isErp
        ? await desktopFetch(url, { headers: { Token: token } })
        : await fetch(url, { credentials: "omit", redirect: "error" });
    if (!response.ok) throw new Error(`图片读取失败（HTTP ${response.status}），请检查图片是否存在及当前访问权限`);
    const blob = await response.blob();
    return freezePrintImage(blob);
}

export async function snapshotDesktopSalesPages(elements: HTMLElement[]) {
    const token = getToken();
    if (!token) throw new Error("请先登录后打印单据");
    const assertSession = () => {
        if (token !== getToken()) throw new Error("登录会话已变化，请重新打开单据后打印");
    };
    assertSession();
    await document.fonts.ready;
    assertSession();
    const pages: string[] = [];
    for (let pageIndex = 0; pageIndex < elements.length; pageIndex++) {
        const element = elements[pageIndex]!;
        // The web preview uses 794px A4 at a responsive rem scale. Normalize
        // computed lengths back to that template size; CSS zoom is deliberately
        // excluded (getBoundingClientRect would include preview zoom).
        const measuredWidth = Number.parseFloat(getComputedStyle(element).width);
        if (!Number.isFinite(measuredWidth) || measuredWidth <= 0) throw new Error("单据预览尚未完成布局");
        const scale = 794 / measuredWidth;
        const physicalStyle = (value: string) => value.replace(/(-?\d*\.?\d+)px/g, (_, length: string) => `${Number(length) * scale}px`);
        const clone = element.cloneNode(true) as HTMLElement;
        const originals = [element, ...element.querySelectorAll<HTMLElement>("*")];
        const copies = [clone, ...clone.querySelectorAll<HTMLElement>("*")];
        let imageIndex = 0;
        for (let index = 0; index < originals.length; index++) {
            const original = originals[index]!;
            const copy = copies[index]!;
            const computed = getComputedStyle(original);
            for (const attribute of Array.from(copy.attributes)) {
                if (!["colspan", "rowspan", "viewBox", "d", "fill", "x", "y", "width", "height", "class"].includes(attribute.name)) copy.removeAttribute(attribute.name);
            }
            for (const property of snapshotStyles) {
                const value = computed.getPropertyValue(property);
                if (value && !/url\s*\(/i.test(value)) copy.style.setProperty(property, physicalStyle(value));
            }
            if (original instanceof HTMLImageElement) {
                imageIndex++;
                try {
                    assertSession();
                    (copy as HTMLImageElement).src = await inlineImage(original, token);
                    assertSession();
                }
                catch (error) {
                    const name = original.alt.trim() || original.title.trim();
                    const label = name ? `（${name.slice(0, 80)}）` : "";
                    const reason = error instanceof Error ? error.message : String(error);
                    throw new Error(`第 ${pageIndex + 1} 页第 ${imageIndex} 张图片${label}无法用于打印：${reason}。本次未生成打印任务，请修复图片后重试。`);
                }
            }
            if (original.tagName === "INPUT" || original.tagName === "BUTTON") copy.remove();
        }
        clone.style.cssText += ";width:210mm;min-height:297mm;height:auto;box-sizing:border-box;margin:0;padding:16mm 14mm 18mm;box-shadow:none;zoom:1;transform:none;break-after:page;";
        pages.push(clone.outerHTML);
    }
    if (!pages.length) throw new Error("没有可打印的单据");
    return pages;
}

export const desktopPrintCall = <T>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args);
