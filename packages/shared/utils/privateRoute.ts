export const PRIVATE_ROUTE_PREFIXES = ["/admin", "/configuration"] as const;

export const PRIVATE_PAGE_ROBOTS_CONTENT =
    "noindex, nofollow, noarchive, nosnippet";

export const isPrivateAppRoute = (path: string) => {
    return PRIVATE_ROUTE_PREFIXES.some((prefix) => {
        return path === prefix || path.startsWith(`${prefix}/`);
    });
};

export const shouldTrackGoogleAnalytics = (path: string) => {
    return !isPrivateAppRoute(path);
};
