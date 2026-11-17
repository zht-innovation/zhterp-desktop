import { isDesktop } from "~/utils/desktop";

/** Bind to an upload area, never to document/window, so only its focused target receives images. */
export function useDesktopImagePaste(options: {
    enabled: () => boolean;
    onFiles: (files: File[]) => void | Promise<void>;
    onSessionChange: () => void;
}) {
    const admin = useState<any>("admin_info", () => ({}));
    const token = useState<string | null>("erp-desktop-token", () => null);
    const profileToken = useState<string | null>("auth_token", () => null);
    let revision = 0;
    let disposed = false;
    const available = computed(() => isDesktop() && options.enabled()
        && Boolean(admin.value?.username && token.value && token.value === profileToken.value));
    const hint = computed(() => import.meta.client && /Mac/i.test(navigator.platform)
        ? "聚焦此处后按 Command+V 粘贴截图" : "聚焦此处后按 Ctrl+V 粘贴截图");

    watch([token, profileToken, () => admin.value?.username], () => {
        revision += 1;
        if (isDesktop()) options.onSessionChange();
    }, { flush: "sync" });
    onBeforeUnmount(() => { disposed = true; revision += 1; });

    function captureSession() {
        const current = revision;
        return () => !disposed && current === revision;
    }

    function focusPasteArea(event: PointerEvent) {
        if (!available.value || !(event.target instanceof Element)) return;
        if (event.target.closest("button,a,input,textarea,select,[contenteditable]")) return;
        (event.currentTarget as HTMLElement)?.focus({ preventScroll: true });
    }

    function handlePaste(event: ClipboardEvent) {
        if (!available.value || event.defaultPrevented || !event.clipboardData) return;
        if (!(event.currentTarget instanceof HTMLElement)
            || !event.currentTarget.contains(document.activeElement)) return;
        if (event.target instanceof Element
            && event.target.closest('textarea,input:not([type="file"]),[contenteditable]')) return;

        const images: File[] = [];
        for (const item of Array.from(event.clipboardData.items)) {
            if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
            const file = item.getAsFile();
            if (file) images.push(file);
        }
        // Some WebKit clipboard implementations expose files without items.
        if (!images.length) {
            for (const file of Array.from(event.clipboardData.files)) {
                if (file.type.startsWith("image/")) images.push(file);
            }
        }
        if (!images.length) return; // Text and other clipboard content keep their original behavior.
        event.preventDefault();
        event.stopPropagation();
        const isCurrent = captureSession();
        void (async () => {
            try { await options.onFiles(images); }
            catch { if (isCurrent()) ElMessage.error("截图处理失败，请重新粘贴"); }
        })();
    }

    return { available, hint, handlePaste, focusPasteArea, captureSession };
}

export function matchesUploadAccept(file: File, accept: string) {
    const rules = accept.toLowerCase().split(",").map(rule => rule.trim()).filter(Boolean);
    if (!rules.length || rules.includes("*") || rules.includes("*/*")) return true;
    for (const rule of rules) {
        if (rule.startsWith(".") && file.name.toLowerCase().endsWith(rule)) return true;
        if (rule.endsWith("/*") && file.type.toLowerCase().startsWith(rule.slice(0, -1))) return true;
        if (file.type.toLowerCase() === rule) return true;
    }
    return false;
}
