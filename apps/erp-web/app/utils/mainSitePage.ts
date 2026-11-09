export const mainSitePage = (path: string, configuredOrigin: string): string => {
    if (!configuredOrigin) return path;

    const origin = new URL(configuredOrigin);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
        throw new Error("NUXT_PUBLIC_MAIN_SITE_ORIGIN must be a plain HTTPS origin");
    }
    return new URL(path, origin).href;
};
