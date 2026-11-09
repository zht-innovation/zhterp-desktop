import { getDesktopErpOrigin, isDesktop } from "./desktop";

export const mainSitePage = (path: string, configuredOrigin: string): string => {
    const mainOrigin = configuredOrigin || (isDesktop() ? getDesktopErpOrigin() : "");
    if (!mainOrigin) return path;

    const origin = new URL(mainOrigin);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
        throw new Error("NUXT_PUBLIC_MAIN_SITE_ORIGIN must be a plain HTTPS origin");
    }
    return new URL(path, origin).href;
};
