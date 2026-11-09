import { fileURLToPath } from "node:url";
import { PRIVATE_PAGE_ROBOTS_CONTENT } from "../../packages/shared/utils/privateRoute";

const sharedDirectory = fileURLToPath(new URL("../../packages/shared", import.meta.url));

export default defineNuxtConfig({
    compatibilityDate: "2025-07-15",
    ssr: false,
    devtools: { enabled: false },
    dir: { shared: "../../packages/shared" },
    alias: { "~~/shared": sharedDirectory },
    vite: {
        resolve: { alias: [{ find: /^~~\/shared(?=\/|$)/, replacement: sharedDirectory }] },
    },
    app: {
        buildAssetsDir: "/_erp-assets/",
        head: {
            title: "中航通 ERP",
            htmlAttrs: { lang: "zh-CN" },
            link: [{ rel: "icon", href: "/favicon.ico" }],
        },
    },
    modules: ["@pinia/nuxt", "@element-plus/nuxt", "@nuxt/icon"],
    icon: {
        localApiEndpoint: "/_erp-icons",
        serverBundle: { collections: ["famicons", "line-md", "lucide", "material-symbols", "mdi"] },
    },
    css: ["~/assets/css/global.css", "~/assets/css/erp/index.css"],
    components: [{ path: "~/components", pathPrefix: false, extensions: [".vue"] }],
    routeRules: {
        "/**": {
            headers: { "X-Robots-Tag": PRIVATE_PAGE_ROBOTS_CONTENT },
        },
        "/admin": { headers: { "Cache-Control": "private, no-store" } },
        "/configuration": { headers: { "Cache-Control": "private, no-store" } },
        "/configuration/**": { headers: { "Cache-Control": "private, no-store" } },
    },
    runtimeConfig: {
        public: { mainSiteOrigin: "" },
    },
    postcss: {
        plugins: {
            autoprefixer: {
                overrideBrowserslist: ["last 5 version", ">1%", "ie >=8"],
            },
            "postcss-pxtorem": {
                rootValue: 16,
                propList: ["*"],
                selectorBlackList: ["van"],
                replace: true,
            },
        },
    },
});
