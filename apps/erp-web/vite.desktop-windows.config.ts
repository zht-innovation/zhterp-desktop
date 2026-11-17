import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Independent local entries: no Nuxt runtime, auth middleware or notification
// plugins. Keep the generated main ERP assets in the same Tauri bundle.
export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    base: "./",
    publicDir: false,
    plugins: [vue()],
    build: {
        outDir: fileURLToPath(new URL("./.output/desktop/public", import.meta.url)),
        emptyOutDir: false,
        assetsDir: "desktop-assets",
        target: "es2022",
        rollupOptions: {
            input: {
                business: fileURLToPath(new URL("./desktop-business/index.html", import.meta.url)),
                print: fileURLToPath(new URL("./desktop-print/index.html", import.meta.url)),
            },
        },
    },
});
