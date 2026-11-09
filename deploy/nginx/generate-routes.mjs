import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = process.argv[2];
if (!output) throw new Error("Usage: node deploy/nginx/generate-routes.mjs <output-directory>");

async function filesUnder(directory, prefix = "") {
    const entries = await readdir(resolve(directory, prefix), { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const name = prefix + entry.name;
        if (entry.isDirectory()) files.push(...await filesUnder(directory, name + sep));
        if (entry.isFile()) files.push(name.split(sep).join("/"));
    }
    return files.sort();
}

function pathPattern(path) {
    const segments = path.split("/").filter(Boolean);
    return "/" + segments.map((segment) => {
        if (/^\[[a-zA-Z][a-zA-Z0-9]*\]$/.test(segment)) return "[^/]+";
        if (!/^[a-zA-Z0-9_-]+$/.test(segment)) throw new Error("Unsupported route: " + path);
        return segment;
    }).join("/");
}

function mapEntry(key, value) {
    return '"~^' + key + '/?$" ' + value + ";";
}

const pages = [];
for (const file of await filesUnder(resolve(root, "apps/erp-web/app/pages"))) {
    if (!file.endsWith(".vue")) continue;
    const page = "/" + file.slice(0, -4).replace(/(^|\/)index$/, "");
    pages.push(page.replace(/\/$/, "") || "/");
}

const api = new Map();
for (const file of await filesUnder(resolve(root, "apps/erp-api/server/routes"))) {
    if (file.startsWith("__erp/") || !file.endsWith(".ts")) continue;
    const match = file.match(/^(.+)\.(get|head|post|put|patch|delete|options)\.ts$/);
    if (!match) throw new Error("Unsupported API route: " + file);
    const method = match[2].toUpperCase();
    const path = "/" + match[1].replace(/(^|\/)index$/, "");
    const owner = /^\/(admin|department)\//.test(path) ? "account" : "api";
    api.set(method + " " + path, owner);
}

const standby = JSON.parse(await readFile(resolve(root, "apps/erp-api/standby-routes.json"), "utf8"));
const safeReads = new Set(standby);
for (const key of safeReads) {
    if (!api.has(key)) throw new Error("Unknown standby endpoint: " + key);
}

const desktopPages = pages.map((page) => mapEntry(pathPattern(page), "1"));
const legacyPages = pages.filter((page) => page.startsWith("/configuration/"));
const legacyNavigation = legacyPages.map((page) => {
    if (page.includes("[")) throw new Error("Dynamic legacy page needs an explicit navigation rule: " + page);
    return page;
});
const routeLines = [];
const safeLines = [];
for (const [key, owner] of api) {
    const split = key.indexOf(" ");
    const keyPattern = key.slice(0, split) + ":" + pathPattern(key.slice(split + 1));
    routeLines.push(mapEntry(keyPattern, owner));
    if (safeReads.has(key)) safeLines.push(mapEntry(keyPattern, "1"));
}

await mkdir(output, { recursive: true });
for (const [file, lines] of Object.entries({
    "erp-api.map": routeLines,
    "erp-safe-reads.map": safeLines,
    "erp-desktop-pages.map": desktopPages,
    "erp-legacy-pages.map": legacyPages.map((page) => mapEntry(pathPattern(page), "1")),
    "legacy-navigation.env": ["NUXT_PUBLIC_ERP_SPLIT_PAGES=" + legacyNavigation.join(",")],
})) {
    await writeFile(resolve(output, file), lines.join("\n") + "\n");
}
console.log("ERP gateway inventory: " + pages.length + " pages, " + api.size + " API methods, " + safeReads.size + " standby endpoints.");
