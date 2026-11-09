<template>
    <NuxtLayout>
        <!-- NuxtPage 相当于 router-view，并自带了过渡效果配置 -->
        <NuxtPage :transition="{ name: 'fade', mode: 'out-in' }" />
    </NuxtLayout>

    <SystemUpdateDialog />

    <div v-if="desktop && desktopConnection" class="desktop-connection" role="status">
        <span>{{ desktopConnection }}</span>
        <button type="button" :disabled="isReconnecting" @click="retryDesktopConnection">
            {{ isReconnecting ? '正在连接' : '重试连接' }}
        </button>
    </div>

    <div v-if="isLoading" class="global-loading">
        <div class="loading-bar"></div>
        <div class="loading-mask"></div>
        <div class="loading-text" v-if="isSlow">网络缓慢，请稍后重试</div>
    </div>
</template>

<script setup lang="ts">
import { getToken, verifyDesktopSession } from "~/utils/auth";
import { getDesktopErpOrigin, initializeDesktop } from "~/utils/desktop";
import {
    PRIVATE_PAGE_ROBOTS_CONTENT,
    isPrivateAppRoute,
} from "~~/shared/utils/privateRoute";

const remScript = `
(function() {
  var config = [
    { width: 1920, height: 1080, deviceMinWidth: 0, fontScale: 1 }
  ];
  var REM_TYPE = 1;
  var OPENSCALE = false;
  
  function setRem() {
    var docEl = document.documentElement;
    var htmlWidth = docEl.clientWidth || document.body.clientWidth;
    var htmlHeight = docEl.clientHeight || document.body.clientHeight;
    
    var whichFigma = config[0]; 

    if (REM_TYPE === 1) {
      var fontSize = (OPENSCALE ? window.devicePixelRatio : 1) * (16 * htmlWidth) / (whichFigma.width / whichFigma.fontScale);
      docEl.style.fontSize = fontSize + "px";
    }
  }

  // 立即执行一次 (关键！防止抖动)
  setRem();

  window.addEventListener('resize', function() {
    setRem();
  });
  
  // 监听页面显示 (解决部分手机切后台问题)
  window.addEventListener('pageshow', function(e) {
    if (e.persisted) {
      setRem();
    }
  });
})();
`;

const route = useRoute();
const router = useRouter();
const nuxtApp = useNuxtApp();
const desktop = useRuntimeConfig().public.erpDesktop === true;
const desktopConnection = useState("erp-desktop-connection", () => "");
const isReconnecting = ref(false);

async function checkDesktopConnection(probe: boolean) {
    if (isReconnecting.value) return;
    isReconnecting.value = true;
    try {
        if (!getDesktopErpOrigin()) {
            await initializeDesktop(message => { desktopConnection.value = message; });
            if (!getDesktopErpOrigin()) return;
        }
        const wasSignedIn = Boolean(nuxtApp.runWithContext(getToken));
        const restored = await nuxtApp.runWithContext(() => verifyDesktopSession(probe));
        if (restored && route.path === "/admin") {
            const redirect = String(route.query.redirect || "");
            await router.push(redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/configuration");
        } else if (wasSignedIn && !nuxtApp.runWithContext(getToken) && route.path.startsWith("/configuration")) {
            await router.push({ path: "/admin", query: { redirect: route.fullPath } });
        }
    } catch {
        if (!desktopConnection.value) desktopConnection.value = "无法连接 ERP 服务，请稍后重试。";
    } finally {
        isReconnecting.value = false;
    }
}

const retryDesktopConnection = () => checkDesktopConnection(true);

const updateDesktopRem = () => {
    const root = document.documentElement;
    root.style.fontSize = (16 * root.clientWidth / 1920) + "px";
};

const showDesktopOffline = () => {
    desktopConnection.value = "网络不可用，请检查连接后重试。";
};

if (desktop) {
    onMounted(() => {
        updateDesktopRem();
        window.addEventListener("resize", updateDesktopRem);
        window.addEventListener("pageshow", updateDesktopRem);
        window.addEventListener("offline", showDesktopOffline);
        if (navigator.onLine && getDesktopErpOrigin()) void checkDesktopConnection(false);
    });
    onUnmounted(() => {
        window.removeEventListener("resize", updateDesktopRem);
        window.removeEventListener("pageshow", updateDesktopRem);
        window.removeEventListener("offline", showDesktopOffline);
    });
}

useHead(() => ({
    script: desktop ? [] : [
        {
            key: "rem-script",
            innerHTML: remScript,
            type: "text/javascript",
        },
    ],
    meta: isPrivateAppRoute(route.path)
        ? [
              {
                  key: "private-robots",
                  name: "robots",
                  content: PRIVATE_PAGE_ROBOTS_CONTENT,
              },
              {
                  key: "private-googlebot",
                  name: "googlebot",
                  content: PRIVATE_PAGE_ROBOTS_CONTENT,
              },
              {
                  key: "private-bingbot",
                  name: "bingbot",
                  content: PRIVATE_PAGE_ROBOTS_CONTENT,
              },
          ]
        : [],
}));

const { state } = useGlobalLoading()
const isLoading = computed(() => state.value.count > 0)
const isSlow = computed(() => state.value.slow)

</script>

<style scoped>
.desktop-connection {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 10000;
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 10px 14px;
    border: 1px solid #e6a23c;
    border-radius: 6px;
    background: #fdf6ec;
    color: #8a521a;
    font-size: 14px;
}

.desktop-connection button {
    padding: 4px 8px;
    cursor: pointer;
}

/* Nuxt 过渡效果的类名稍有不同 */
.fade-enter-active,
.fade-leave-active {
    transition: all 0.3s;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
    transform: translateY(10px);
}

.global-loading {
    position: fixed;
    inset: 0;
    z-index: 9999;
    pointer-events: none;
}

.loading-mask {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.15);
}

.loading-bar {
    position: absolute;
    top: 0;
    left: 0;
    height: 3px;
    width: 40%;
    background: #409eff;
    animation: loading-slide 1.2s ease-in-out infinite;
    box-shadow: 0 0 8px rgba(64, 158, 255, 0.6);
}

.loading-text {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.65);
    color: #fff;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    letter-spacing: 0.5px;
}

@keyframes loading-slide {
    0% {
        transform: translateX(-40%);
    }
    50% {
        transform: translateX(60%);
    }
    100% {
        transform: translateX(140%);
    }
}
</style>
