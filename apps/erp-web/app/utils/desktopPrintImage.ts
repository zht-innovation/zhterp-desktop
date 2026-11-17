// Browser-only image conversion shared by ERP snapshots and the isolated
// renderer. It never fetches URLs or reads authentication/session state.
const MAX_PRINT_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_PRINT_IMAGE_SIDE = 8192;
const MAX_PRINT_IMAGE_PIXELS = 16_000_000;

export function decodePrintImageDataUrl(source: string) {
    if (source.length > Math.ceil(MAX_PRINT_IMAGE_BYTES / 3) * 4 + 64) throw new Error("打印图片超过 8 MB");
    const match = /^data:(image\/(?:png|jpeg|gif|webp|bmp));base64,([a-z\d+/=\s]+)$/i.exec(source);
    if (!match) throw new Error("打印图片格式不支持");
    let binary: string;
    try { binary = atob(match[2]!.replace(/\s/g, "")); }
    catch { throw new Error("打印图片数据损坏，无法解码"); }
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1]!.toLowerCase() });
}

function readImageDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("打印图片读取失败"));
        reader.onabort = () => reject(new Error("打印图片读取已取消"));
        reader.readAsDataURL(blob);
    });
}

export async function freezePrintImage(blob: Blob) {
    if (!/^image\/(png|jpeg|gif|webp|bmp)$/.test(blob.type)) throw new Error("打印图片格式不支持");
    if (!blob.size || blob.size > MAX_PRINT_IMAGE_BYTES) throw new Error("打印图片为空或超过 8 MB");
    if (typeof createImageBitmap !== "function") throw new Error("当前浏览器内核不支持固定打印图片，请更新桌面客户端运行环境");
    // Decode every image before accepting it. GIF, WebP and APNG use the default
    // frame; verified JPEG can keep its already static, compact encoding.
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(blob); }
    catch { throw new Error("打印图片无法解码，请检查图片内容"); }
    const canvas = document.createElement("canvas");
    let png: Blob;
    try {
        if (!bitmap.width || !bitmap.height || bitmap.width > MAX_PRINT_IMAGE_SIDE
            || bitmap.height > MAX_PRINT_IMAGE_SIDE || bitmap.width * bitmap.height > MAX_PRINT_IMAGE_PIXELS) {
            throw new Error("打印图片尺寸过大，单边不能超过 8192 像素且总像素不能超过 1600 万");
        }
        if (blob.type === "image/jpeg") {
            // Do not trust MIME alone: a mislabeled animation must still be
            // frozen. Preserve verified JPEG bytes without changing quality or
            // expanding a valid photograph into an oversized lossless PNG.
            const header = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
            if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
                return await readImageDataUrl(blob);
            }
        }
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法生成静态打印图片");
        context.drawImage(bitmap, 0, 0);
        png = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(value => value ? resolve(value) : reject(new Error("无法生成静态打印图片")), "image/png");
        });
    } finally {
        bitmap.close();
        canvas.width = 0;
        canvas.height = 0;
    }
    if (png.size > MAX_PRINT_IMAGE_BYTES) throw new Error("转换后的静态打印图片超过 8 MB，请缩小图片后重试");
    return await readImageDataUrl(png);
}
