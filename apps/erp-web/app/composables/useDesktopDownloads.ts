import { bindDesktopDownloadSession, desktopDownloads } from "~/utils/desktopDownloads";

export function useDesktopDownloads() {
    const token = useState<string | null>("erp-desktop-token", () => null);
    if (import.meta.client) bindDesktopDownloadSession(token);
    return desktopDownloads;
}
