import { ElMessage } from "element-plus";
import type { WorkBook } from "xlsx";
import { isDesktop, openDesktopFiles, saveDesktopFile } from "~/utils/desktop";

export const MAX_DESKTOP_OPEN_BYTES = 64 * 1024 * 1024;

const imageExtensions = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico", "avif", "heic", "heif", "tiff", "tif"];

export function selectDesktopFiles(accept: string, multiple: boolean, maxBytes: number) {
    const acceptedTypes = accept.toLowerCase().split(",").map((item) => item.trim());
    const extensions = acceptedTypes.includes("image/*")
        ? imageExtensions
        : acceptedTypes.filter((item) => item.startsWith(".")).map((item) => item.slice(1));
    return openDesktopFiles({ extensions, multiple, maxBytes: Math.min(maxBytes, MAX_DESKTOP_OPEN_BYTES) });
}

export function openDesktopFileInput(event: MouseEvent, maxBytes: number, onFiles: (files: File[]) => unknown) {
    if (!isDesktop()) return;
    event.preventDefault();

    const input = event.currentTarget as HTMLInputElement;
    if (input.disabled) return;

    void selectDesktopFiles(input.accept, input.multiple, maxBytes)
        .then((files) => {
            if (files.length && input.isConnected && !input.disabled) return onFiles(files);
        })
        .catch(() => ElMessage.error("无法读取所选文件，请检查文件大小和类型"));
}

export async function downloadBlob(blob: Blob, filename: string) {
    if (isDesktop()) return saveDesktopFile(blob, filename);

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
}

export async function downloadWorkbook(workbook: WorkBook, filename: string) {
    const XLSX = await import("xlsx");
    if (!isDesktop()) {
        XLSX.writeFile(workbook, filename);
        return;
    }

    try {
        const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        await downloadBlob(new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
    } catch {
        ElMessage.error("保存 Excel 文件失败");
    }
}
