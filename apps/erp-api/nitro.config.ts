import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineNitroConfig } from "nitropack/config";

const root = fileURLToPath(new URL(".", import.meta.url));
const shared = resolve(root, "../../packages/shared");

export default defineNitroConfig({
    compatibilityDate: "2025-07-15",
    preset: "node_server",
    srcDir: "server",
    alias: {
        "~~/shared": shared,
        "~~/server": resolve(root, "server"),
    },
    externals: {
        inline: ["xlsx", "jszip"],
    },
    runtimeConfig: {
        mongoUrl: "",
        baseToken: "",
        taobaoMongoUrl: "",
        taobaoMongoUser: "",
        taobaoMongoPassword: "",
        taobaoAccountKey: "taobao-main",
        kdniaoEbusinessId: "",
        kdniaoAppKey: "",
        imageUploadSecret: "",
        logisticsTrackingApiUrl: "",
        logisticsTrackingApiKey: "",
        logisticsTrackingSyncIntervalMinutes: 30,
        logisticsTrackingMock: false,
        public: {
            apiBase: "",
            imgUrl: "",
        },
        erpAttachmentRoot: "",
        erpControlToken: "",
        erpDrainFile: "",
        erpEnableWrites: false,
        erpEnableInitialization: false,
        erpEnableProductionWarning: false,
        erpEnableStandardPriceSync: false,
        erpEnablePurchaseLogistics: false,
    },
});
